from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass, replace
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.errors import NotFoundError
from app.core.time import utc_now_naive
from app.models.account import Account
from app.models.goal import Goal
from app.models.planned_payment import PlannedPayment
from app.models.savings_bucket import SavingsBucket
from app.models.transaction import Transaction
from app.services.goal_service import normalize_funding_strategy, normalize_goal_type
from app.services.planned_payment_service import add_months
from app.services.savings_bucket_service import EMERGENCY_FUND_BUCKET_TYPE, ETF_BUCKET_TYPE, list_savings_buckets
from app.services.spending_assumption_service import recalculate_spending_assumptions


DEFAULT_SCENARIOS = (
    ("optimistic", "Optimistic", 0.85),
    ("expected", "Expected", 1.0),
    ("conservative", "Conservative", 1.15),
)
FORECAST_HORIZONS = (90, 180, 365)
INCOME_PAYMENT_TYPES = {"income", "salary", "bonus"}


@dataclass
class ForecastPoint:
    date: date
    balance: float
    available_balance: float
    goal_funded_amount: float


@dataclass
class ForecastRisk:
    minimum_balance: float
    first_negative_date: date | None
    negative_day_count: int
    ending_balance: float


@dataclass
class GoalProjection:
    goal_id: int
    goal_name: str
    priority: int
    target_amount: float
    current_saved_amount: float
    projected_saved_amount: float
    remaining_gap: float
    affordability_date: date | None
    funding_strategy: str
    target_date: date | None
    is_active: bool


@dataclass
class ForecastHorizon:
    days: int
    points: list[ForecastPoint]
    risk: ForecastRisk
    goals: list[GoalProjection]


@dataclass
class ForecastScenario:
    scenario_id: str
    label: str
    variable_spending_multiplier: float
    horizons: list[ForecastHorizon]


@dataclass
class ScenarioGoalPriorityOverride:
    goal_id: int
    priority: int


@dataclass
class ScenarioCashAdjustment:
    date: date
    amount: float
    label: str


@dataclass
class ForecastScenarioConfig:
    name: str
    variable_spending_multiplier: float
    etf_monthly_contribution_override: float | None = None
    emergency_fund_monthly_contribution_override: float | None = None
    emergency_fund_withdrawal_amount: float = 0.0
    goal_priority_overrides: tuple[ScenarioGoalPriorityOverride, ...] = ()
    one_off_expenses: tuple[ScenarioCashAdjustment, ...] = ()
    one_off_incomes: tuple[ScenarioCashAdjustment, ...] = ()


@dataclass
class ForecastComparison:
    base: ForecastScenario
    scenario: ForecastScenario
    ending_balance_delta_12m: float
    available_balance_delta_12m: float
    earliest_goal_delta_days: int | None


def _round_money(value: float) -> float:
    return round(value, 2)


def _last_complete_months(reference_date: date) -> list[date]:
    current_month_start = reference_date.replace(day=1)
    months: list[date] = []
    cursor = current_month_start
    for _ in range(3):
        cursor = add_months(cursor, -1).replace(day=1)
        months.append(cursor)
    months.reverse()
    return months


def _month_start(value: date) -> date:
    return value.replace(day=1)


def _is_income_payment(payment: PlannedPayment) -> bool:
    if payment.category and payment.category.is_income:
        return True
    return payment.payment_type.strip().lower() in INCOME_PAYMENT_TYPES


def _planned_payment_signed_amount(payment: PlannedPayment) -> float:
    return abs(payment.amount) if _is_income_payment(payment) else -abs(payment.amount)


def _generate_planned_payment_events(
    payment: PlannedPayment,
    *,
    start_date: date,
    end_date: date,
) -> list[tuple[date, float]]:
    if not payment.is_active:
        return []

    events: list[tuple[date, float]] = []
    signed_amount = _planned_payment_signed_amount(payment)

    if payment.frequency == "monthly":
        if payment.day_of_month is None:
            return []
        cursor = start_date.replace(day=1)
        while cursor <= end_date:
            event_date = date(cursor.year, cursor.month, min(payment.day_of_month, monthrange(cursor.year, cursor.month)[1]))
            if start_date <= event_date <= end_date:
                events.append((event_date, signed_amount))
            cursor = add_months(cursor, 1)
        return events

    if payment.frequency == "quarterly":
        if payment.exact_date is None:
            return []
        cursor = payment.exact_date
        while cursor < start_date:
            cursor = add_months(cursor, 3)
        while cursor <= end_date:
            events.append((cursor, signed_amount))
            cursor = add_months(cursor, 3)
        return events

    if payment.frequency == "yearly":
        if payment.exact_date is not None:
            month = payment.exact_date.month
            day = payment.exact_date.day
        else:
            if payment.month_of_year is None or payment.day_of_month is None:
                return []
            month = payment.month_of_year
            day = payment.day_of_month
        cursor_year = start_date.year
        while True:
            candidate = date(cursor_year, month, min(day, monthrange(cursor_year, month)[1]))
            if candidate < start_date:
                cursor_year += 1
                continue
            if candidate > end_date:
                break
            events.append((candidate, signed_amount))
            cursor_year += 1
        return events

    if payment.frequency == "one_time" and payment.exact_date and start_date <= payment.exact_date <= end_date:
        return [(payment.exact_date, signed_amount)]

    return []


def _derive_income_templates(session: Session, *, reference_date: date) -> list[tuple[str, float, int]]:
    month_candidates = _last_complete_months(reference_date)
    rows = session.scalars(
        select(Transaction)
        .options(joinedload(Transaction.category))
        .where(
            Transaction.booking_date < reference_date.replace(day=1),
            Transaction.is_internal_transfer.is_(False),
            Transaction.is_pending.is_(False),
        )
        .order_by(Transaction.booking_date.asc())
    ).all()

    grouped: dict[str, list[Transaction]] = {}
    allowed_months = set(month_candidates)
    for row in rows:
        if row.category is None or not row.category.is_income or row.amount <= 0:
            continue
        if _month_start(row.booking_date) not in allowed_months:
            continue
        key = f"{row.category_id}:{row.payee or row.category.name}"
        grouped.setdefault(key, []).append(row)

    templates: list[tuple[str, float, int]] = []
    for key, transactions in grouped.items():
        average_amount = _round_money(sum(item.amount for item in transactions) / len(transactions))
        average_day = max(1, min(28, round(sum(item.booking_date.day for item in transactions) / len(transactions))))
        templates.append((key, average_amount, average_day))
    return templates


def _generate_income_events(session: Session, *, start_date: date, end_date: date, reference_date: date) -> list[tuple[date, float]]:
    templates = _derive_income_templates(session, reference_date=reference_date)
    events: list[tuple[date, float]] = []
    cursor = start_date.replace(day=1)
    while cursor <= end_date:
        days_in_month = monthrange(cursor.year, cursor.month)[1]
        for _, amount, day in templates:
            candidate = date(cursor.year, cursor.month, min(day, days_in_month))
            if start_date <= candidate <= end_date:
                events.append((candidate, amount))
        cursor = add_months(cursor, 1)
    return events


def _active_accounts(session: Session) -> list[Account]:
    return session.scalars(select(Account).where(Account.is_active.is_(True)).order_by(Account.id.asc())).all()


def _trusted_current_balance(session: Session) -> float:
    balance = 0.0
    for account in _active_accounts(session):
        if account.current_balance_manual is not None:
            balance += account.current_balance_manual
            continue
        account_transactions_total = session.scalar(
            select(func.coalesce(func.sum(Transaction.amount), 0.0)).where(
                Transaction.account_id == account.id,
                Transaction.is_pending.is_(False),
            )
        ) or 0.0
        balance += account.opening_balance + account_transactions_total
    return _round_money(balance)


def _allocate_to_goals(
    *,
    goals: list[Goal],
    available_amount: float,
    current_date: date,
    projected_saved: dict[int, float],
    affordability_dates: dict[int, date | None],
) -> float:
    if available_amount <= 0:
        return 0.0

    remaining = available_amount
    active_goals = [goal for goal in goals if goal.is_active]
    priority_goals = sorted(active_goals, key=lambda item: (item.priority, item.id))

    if any(goal.funding_strategy == "parallel" for goal in priority_goals):
        remaining_goals = [
            goal
            for goal in priority_goals
            if projected_saved[goal.id] < goal.target_amount
        ]
        if remaining_goals:
            per_goal = remaining / len(remaining_goals)
            for goal in remaining_goals:
                needed = max(0.0, goal.target_amount - projected_saved[goal.id])
                allocation = min(needed, per_goal)
                projected_saved[goal.id] = _round_money(projected_saved[goal.id] + allocation)
                remaining = _round_money(remaining - allocation)
                if affordability_dates[goal.id] is None and projected_saved[goal.id] >= goal.target_amount:
                    affordability_dates[goal.id] = current_date

    for goal in priority_goals:
        if remaining <= 0:
            break
        needed = max(0.0, goal.target_amount - projected_saved[goal.id])
        if needed <= 0:
            continue
        allocation = min(needed, remaining)
        projected_saved[goal.id] = _round_money(projected_saved[goal.id] + allocation)
        remaining = _round_money(remaining - allocation)
        if affordability_dates[goal.id] is None and projected_saved[goal.id] >= goal.target_amount:
            affordability_dates[goal.id] = current_date

    return _round_money(available_amount - remaining)


def _scenario_goals(session: Session, overrides: tuple[ScenarioGoalPriorityOverride, ...]) -> list[Goal]:
    source_goals = session.scalars(select(Goal).order_by(Goal.priority.asc(), Goal.id.asc())).all()
    overrides_by_goal = {item.goal_id: item.priority for item in overrides}
    source_goal_ids = {goal.id for goal in source_goals}
    if any(goal_id not in source_goal_ids for goal_id in overrides_by_goal):
        missing_goal_id = next(goal_id for goal_id in overrides_by_goal if goal_id not in source_goal_ids)
        raise NotFoundError("Goal", missing_goal_id)
    goals: list[Goal] = []
    for goal in source_goals:
        duplicate = Goal(
            id=goal.id,
            name=goal.name,
            target_amount=goal.target_amount,
            current_saved_amount=goal.current_saved_amount,
            target_date=goal.target_date,
            priority=overrides_by_goal.get(goal.id, goal.priority),
            goal_type=normalize_goal_type(goal.goal_type),
            funding_strategy=normalize_funding_strategy(goal.funding_strategy),
            is_active=goal.is_active,
            notes=goal.notes,
            created_at=goal.created_at,
            updated_at=goal.updated_at,
        )
        goals.append(duplicate)
    return goals


def _scenario_buckets(
    session: Session,
    *,
    etf_override: float | None,
    emergency_override: float | None,
    emergency_withdrawal_amount: float,
) -> list[SavingsBucket]:
    buckets = list_savings_buckets(session=session)
    scenario_buckets: list[SavingsBucket] = []
    for bucket in buckets:
        duplicate = SavingsBucket(
            id=bucket.id,
            name=bucket.name,
            bucket_type=bucket.bucket_type,
            current_amount=bucket.current_amount,
            target_amount=bucket.target_amount,
            monthly_contribution=bucket.monthly_contribution,
            priority=bucket.priority,
            is_protected=bucket.is_protected,
            allow_scenario_withdrawal=bucket.allow_scenario_withdrawal,
        )
        scenario_buckets.append(duplicate)

    for bucket in scenario_buckets:
        if bucket.bucket_type == ETF_BUCKET_TYPE and etf_override is not None:
            bucket.monthly_contribution = etf_override
        if bucket.bucket_type == EMERGENCY_FUND_BUCKET_TYPE:
            if emergency_override is not None:
                bucket.monthly_contribution = emergency_override
            if emergency_withdrawal_amount > 0 and bucket.allow_scenario_withdrawal:
                bucket.current_amount = max(0.0, bucket.current_amount - emergency_withdrawal_amount)
    return scenario_buckets


def _build_daily_events(
    *,
    session: Session,
    start_date: date,
    end_date: date,
    reference_date: date,
    variable_spending_multiplier: float,
    etf_override: float | None,
    emergency_override: float | None,
    one_off_expenses: tuple[ScenarioCashAdjustment, ...],
    one_off_incomes: tuple[ScenarioCashAdjustment, ...],
) -> dict[date, float]:
    events: dict[date, float] = {}

    planned_payments = session.scalars(
        select(PlannedPayment).options(joinedload(PlannedPayment.category)).where(PlannedPayment.is_active.is_(True))
    ).all()
    has_planned_income = any(_is_income_payment(payment) for payment in planned_payments)
    for payment in planned_payments:
        for event_date, amount in _generate_planned_payment_events(payment, start_date=start_date, end_date=end_date):
            events[event_date] = _round_money(events.get(event_date, 0.0) + amount)

    if not has_planned_income:
        for event_date, amount in _generate_income_events(
            session,
            start_date=start_date,
            end_date=end_date,
            reference_date=reference_date,
        ):
            events[event_date] = _round_money(events.get(event_date, 0.0) + amount)

    assumptions = recalculate_spending_assumptions(session=session, reference_date=reference_date)
    monthly_variable_spend = _round_money(
        sum(snapshot.assumption.effective_monthly_amount for snapshot in assumptions) * variable_spending_multiplier
    )
    cursor = start_date
    while cursor <= end_date:
        days_in_month = monthrange(cursor.year, cursor.month)[1]
        daily_amount = _round_money(-(monthly_variable_spend / days_in_month))
        events[cursor] = _round_money(events.get(cursor, 0.0) + daily_amount)
        cursor += timedelta(days=1)

    buckets = _scenario_buckets(
        session,
        etf_override=etf_override,
        emergency_override=emergency_override,
        emergency_withdrawal_amount=0,
    )
    for bucket in buckets:
        if not bucket.is_protected or bucket.monthly_contribution <= 0:
            continue
        cursor = start_date.replace(day=1)
        while cursor <= end_date:
            contribution_date = date(cursor.year, cursor.month, 1)
            if start_date <= contribution_date <= end_date:
                events[contribution_date] = _round_money(events.get(contribution_date, 0.0) - bucket.monthly_contribution)
            cursor = add_months(cursor, 1)

    for adjustment in one_off_expenses:
        if start_date <= adjustment.date <= end_date:
            events[adjustment.date] = _round_money(events.get(adjustment.date, 0.0) - adjustment.amount)

    for adjustment in one_off_incomes:
        if start_date <= adjustment.date <= end_date:
            events[adjustment.date] = _round_money(events.get(adjustment.date, 0.0) + adjustment.amount)

    return events


def _protected_reserve_amount(
    *,
    session: Session,
    etf_override: float | None,
    emergency_override: float | None,
    emergency_withdrawal_amount: float,
) -> float:
    buckets = _scenario_buckets(
        session,
        etf_override=etf_override,
        emergency_override=emergency_override,
        emergency_withdrawal_amount=emergency_withdrawal_amount,
    )
    return _round_money(sum(bucket.current_amount for bucket in buckets if bucket.is_protected))


def _month_end(value: date) -> bool:
    return value.day == monthrange(value.year, value.month)[1]


def _simulate_scenario(
    *,
    session: Session,
    scenario_id: str,
    label: str,
    reference_date: date,
    config: ForecastScenarioConfig,
) -> ForecastScenario:
    start_date = reference_date
    end_date = reference_date + timedelta(days=max(FORECAST_HORIZONS) - 1)
    events = _build_daily_events(
        session=session,
        start_date=start_date,
        end_date=end_date,
        reference_date=reference_date,
        variable_spending_multiplier=config.variable_spending_multiplier,
        etf_override=config.etf_monthly_contribution_override,
        emergency_override=config.emergency_fund_monthly_contribution_override,
        one_off_expenses=config.one_off_expenses,
        one_off_incomes=config.one_off_incomes,
    )
    goals = _scenario_goals(session, config.goal_priority_overrides)
    protected_reserve = _protected_reserve_amount(
        session=session,
        etf_override=config.etf_monthly_contribution_override,
        emergency_override=config.emergency_fund_monthly_contribution_override,
        emergency_withdrawal_amount=config.emergency_fund_withdrawal_amount,
    )
    balance = _trusted_current_balance(session) - config.emergency_fund_withdrawal_amount
    projected_saved = {goal.id: _round_money(goal.current_saved_amount) for goal in goals}
    affordability_dates = {goal.id: reference_date if goal.current_saved_amount >= goal.target_amount else None for goal in goals}

    all_points: list[ForecastPoint] = []
    minimum_balance = balance
    first_negative_date: date | None = None
    negative_day_count = 0

    current_date = start_date
    while current_date <= end_date:
        balance = _round_money(balance + events.get(current_date, 0.0))
        goal_funded_today = 0.0
        if _month_end(current_date):
            available_for_goals = max(0.0, balance - protected_reserve)
            goal_funded_today = _allocate_to_goals(
                goals=goals,
                available_amount=available_for_goals,
                current_date=current_date,
                projected_saved=projected_saved,
                affordability_dates=affordability_dates,
            )
            balance = _round_money(balance - goal_funded_today)

        available_balance = _round_money(balance - protected_reserve)
        all_points.append(
            ForecastPoint(
                date=current_date,
                balance=_round_money(balance),
                available_balance=available_balance,
                goal_funded_amount=_round_money(goal_funded_today),
            )
        )

        minimum_balance = min(minimum_balance, balance)
        if balance < 0:
            negative_day_count += 1
            if first_negative_date is None:
                first_negative_date = current_date

        current_date += timedelta(days=1)

    goal_results = [
        GoalProjection(
            goal_id=goal.id,
            goal_name=goal.name,
            priority=goal.priority,
            target_amount=goal.target_amount,
            current_saved_amount=goal.current_saved_amount,
            projected_saved_amount=_round_money(projected_saved[goal.id]),
            remaining_gap=_round_money(max(0.0, goal.target_amount - projected_saved[goal.id])),
            affordability_date=affordability_dates[goal.id],
            funding_strategy=goal.funding_strategy,
            target_date=goal.target_date,
            is_active=goal.is_active,
        )
        for goal in sorted(goals, key=lambda item: (item.priority, item.id))
    ]

    horizons: list[ForecastHorizon] = []
    for days in FORECAST_HORIZONS:
        points = all_points[:days]
        horizon_goals = [
            replace(goal_projection)
            for goal_projection in goal_results
        ]
        horizons.append(
            ForecastHorizon(
                days=days,
                points=points,
                risk=ForecastRisk(
                    minimum_balance=_round_money(min(point.balance for point in points)),
                    first_negative_date=next((point.date for point in points if point.balance < 0), None),
                    negative_day_count=sum(1 for point in points if point.balance < 0),
                    ending_balance=_round_money(points[-1].balance),
                ),
                goals=horizon_goals,
            )
        )

    return ForecastScenario(
        scenario_id=scenario_id,
        label=label,
        variable_spending_multiplier=config.variable_spending_multiplier,
        horizons=horizons,
    )


def build_default_forecast(*, session: Session, reference_date: date | None = None) -> list[ForecastScenario]:
    effective_reference_date = reference_date or utc_now_naive().date()
    return [
        _simulate_scenario(
            session=session,
            scenario_id=scenario_id,
            label=label,
            reference_date=effective_reference_date,
            config=ForecastScenarioConfig(name=label, variable_spending_multiplier=multiplier),
        )
        for scenario_id, label, multiplier in DEFAULT_SCENARIOS
    ]


def build_custom_scenario_comparison(
    *,
    session: Session,
    config: ForecastScenarioConfig,
    reference_date: date | None = None,
) -> ForecastComparison:
    effective_reference_date = reference_date or utc_now_naive().date()
    base = _simulate_scenario(
        session=session,
        scenario_id="base",
        label="Base case",
        reference_date=effective_reference_date,
        config=ForecastScenarioConfig(name="Base case", variable_spending_multiplier=1.0),
    )
    scenario = _simulate_scenario(
        session=session,
        scenario_id="custom",
        label=config.name,
        reference_date=effective_reference_date,
        config=config,
    )
    base_12m = next(horizon for horizon in base.horizons if horizon.days == 365)
    scenario_12m = next(horizon for horizon in scenario.horizons if horizon.days == 365)

    base_dates = {goal.goal_id: goal.affordability_date for goal in base_12m.goals}
    goal_delta_days: list[int] = []
    for goal in scenario_12m.goals:
        base_date = base_dates.get(goal.goal_id)
        if base_date is None or goal.affordability_date is None:
            continue
        goal_delta_days.append((goal.affordability_date - base_date).days)

    return ForecastComparison(
        base=base,
        scenario=scenario,
        ending_balance_delta_12m=_round_money(
            scenario_12m.risk.ending_balance - base_12m.risk.ending_balance
        ),
        available_balance_delta_12m=_round_money(
            scenario_12m.points[-1].available_balance - base_12m.points[-1].available_balance
        ),
        earliest_goal_delta_days=min(goal_delta_days) if goal_delta_days else None,
    )
