from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from math import ceil

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.errors import DomainValidationError, NotFoundError
from app.core.time import utc_now_naive
from app.models.category import Category
from app.models.planned_payment import PlannedPayment
from app.models.savings_bucket import SavingsBucket
from app.models.spending_assumption import SpendingAssumption
from app.services.planned_payment_service import add_months, compute_planned_payment_schedule
from app.services.spending_assumption_service import recalculate_spending_assumptions


ETF_BUCKET_TYPE = "etf"
EMERGENCY_FUND_BUCKET_TYPE = "emergency_fund"

DEFAULT_BUCKETS = (
    {
        "name": "ETF",
        "bucket_type": ETF_BUCKET_TYPE,
        "current_amount": 0.0,
        "target_amount": None,
        "monthly_contribution": 0.0,
        "priority": 2,
        "is_protected": True,
        "allow_scenario_withdrawal": False,
    },
    {
        "name": "Notgroschen",
        "bucket_type": EMERGENCY_FUND_BUCKET_TYPE,
        "current_amount": 0.0,
        "target_amount": None,
        "monthly_contribution": 0.0,
        "priority": 1,
        "is_protected": True,
        "allow_scenario_withdrawal": True,
    },
)


@dataclass
class EssentialExpenseLineItem:
    label: str
    source_type: str
    monthly_amount: float


@dataclass
class SavingsPlanSummary:
    protected_current_amount: float
    protected_monthly_contribution: float
    forecast_reserved_current_amount: float
    essential_monthly_expenses: float
    essential_breakdown: list[EssentialExpenseLineItem]
    three_month_target: float
    six_month_target: float
    emergency_fund_current_amount: float
    emergency_fund_monthly_contribution: float
    emergency_fund_target_amount: float | None
    gap_to_current_target: float | None
    gap_to_three_month_target: float
    gap_to_six_month_target: float
    target_completion_date: date | None
    three_month_completion_date: date | None
    six_month_completion_date: date | None
    scenario_withdrawal_allowed: bool
    scenario_withdrawal_amount: float
    scenario_remaining_amount: float
    scenario_recovery_date_to_current_target: date | None
    scenario_recovery_date_to_three_month_target: date | None
    scenario_recovery_date_to_six_month_target: date | None


def _round_money(value: float) -> float:
    return round(value, 2)


def ensure_default_savings_buckets(session: Session) -> list[SavingsBucket]:
    existing_by_type = {
        bucket.bucket_type: bucket for bucket in session.scalars(select(SavingsBucket)).all()
    }
    changed = False
    for defaults in DEFAULT_BUCKETS:
        bucket = existing_by_type.get(defaults["bucket_type"])
        if bucket is None:
            bucket = SavingsBucket(**defaults)
            session.add(bucket)
            existing_by_type[defaults["bucket_type"]] = bucket
            changed = True
            continue

        if not bucket.name:
            bucket.name = defaults["name"]
            changed = True

    if changed:
        session.commit()
    return _query_savings_buckets(session)


def list_savings_buckets(*, session: Session) -> list[SavingsBucket]:
    ensure_default_savings_buckets(session)
    return _query_savings_buckets(session)


def _query_savings_buckets(session: Session) -> list[SavingsBucket]:
    return session.scalars(select(SavingsBucket).order_by(SavingsBucket.priority.asc(), SavingsBucket.id.asc())).all()


def get_savings_bucket(*, session: Session, bucket_id: int) -> SavingsBucket:
    ensure_default_savings_buckets(session)
    bucket = session.get(SavingsBucket, bucket_id)
    if bucket is None:
        raise NotFoundError("SavingsBucket", bucket_id)
    return bucket


def update_savings_bucket(
    *,
    session: Session,
    bucket_id: int,
    current_amount: float | None,
    target_amount: float | None,
    monthly_contribution: float | None,
    priority: int | None,
    is_protected: bool | None,
    allow_scenario_withdrawal: bool | None,
    fields: set[str],
) -> SavingsBucket:
    bucket = get_savings_bucket(session=session, bucket_id=bucket_id)

    if "current_amount" in fields and current_amount is not None:
        bucket.current_amount = _round_money(current_amount)
    if "target_amount" in fields:
        bucket.target_amount = _round_money(target_amount) if target_amount is not None else None
    if "monthly_contribution" in fields and monthly_contribution is not None:
        bucket.monthly_contribution = _round_money(monthly_contribution)
    if "priority" in fields and priority is not None:
        bucket.priority = priority
    if "is_protected" in fields and is_protected is not None:
        bucket.is_protected = is_protected
    if "allow_scenario_withdrawal" in fields and allow_scenario_withdrawal is not None:
        bucket.allow_scenario_withdrawal = allow_scenario_withdrawal

    session.commit()
    session.refresh(bucket)
    return bucket


def _estimate_target_date(
    *,
    reference_date: date,
    current_amount: float,
    target_amount: float | None,
    monthly_contribution: float,
) -> date | None:
    if target_amount is None or target_amount <= 0:
        return None
    if current_amount >= target_amount:
        return reference_date
    if monthly_contribution <= 0:
        return None
    remaining_gap = max(0.0, target_amount - current_amount)
    months_needed = ceil(remaining_gap / monthly_contribution)
    return add_months(reference_date, months_needed)


def _essential_expense_breakdown(session: Session, reference_date: date) -> list[EssentialExpenseLineItem]:
    breakdown: list[EssentialExpenseLineItem] = []

    planned_payments = session.scalars(
        select(PlannedPayment)
        .options(joinedload(PlannedPayment.category))
        .where(PlannedPayment.is_active.is_(True))
    ).all()
    for payment in planned_payments:
        if payment.category is None or not payment.category.is_essential:
            continue
        schedule = compute_planned_payment_schedule(payment, reference_date=reference_date)
        if schedule.monthly_equivalent <= 0:
            continue
        breakdown.append(
            EssentialExpenseLineItem(
                label=f"{payment.name} ({payment.category.name})",
                source_type="planned_payment",
                monthly_amount=_round_money(schedule.monthly_equivalent),
            )
        )

    assumptions = session.scalars(
        select(SpendingAssumption)
        .options(joinedload(SpendingAssumption.category))
        .where(SpendingAssumption.is_active.is_(True))
    ).all()
    for assumption in assumptions:
        if assumption.category is None or not assumption.category.is_essential:
            continue
        if assumption.effective_monthly_amount <= 0:
            continue
        breakdown.append(
            EssentialExpenseLineItem(
                label=assumption.category.name,
                source_type="spending_assumption",
                monthly_amount=_round_money(assumption.effective_monthly_amount),
            )
        )

    return sorted(breakdown, key=lambda item: (item.source_type, item.label.lower()))


def _find_bucket(buckets: list[SavingsBucket], bucket_type: str) -> SavingsBucket:
    for bucket in buckets:
        if bucket.bucket_type == bucket_type:
            return bucket
    raise NotFoundError("SavingsBucket", bucket_type)


def build_savings_plan_summary(
    *,
    session: Session,
    scenario_withdrawal_amount: float = 0.0,
    reference_date: date | None = None,
) -> SavingsPlanSummary:
    if scenario_withdrawal_amount < 0:
        raise DomainValidationError(
            "scenario_withdrawal_amount must be greater than or equal to 0.",
            [{"field": "scenario_withdrawal_amount"}],
        )

    effective_reference_date = reference_date or utc_now_naive().date()
    buckets = list_savings_buckets(session=session)
    recalculate_spending_assumptions(session=session, reference_date=effective_reference_date)
    buckets = list_savings_buckets(session=session)
    emergency_bucket = _find_bucket(buckets, EMERGENCY_FUND_BUCKET_TYPE)

    protected_current_amount = _round_money(
        sum(bucket.current_amount for bucket in buckets if bucket.is_protected)
    )
    protected_monthly_contribution = _round_money(
        sum(bucket.monthly_contribution for bucket in buckets if bucket.is_protected)
    )

    essential_breakdown = _essential_expense_breakdown(session, effective_reference_date)
    essential_monthly_expenses = _round_money(sum(item.monthly_amount for item in essential_breakdown))
    three_month_target = _round_money(essential_monthly_expenses * 3)
    six_month_target = _round_money(essential_monthly_expenses * 6)

    current_target_amount = emergency_bucket.target_amount
    current_amount = _round_money(emergency_bucket.current_amount)
    monthly_contribution = _round_money(emergency_bucket.monthly_contribution)
    scenario_remaining_amount = _round_money(max(0.0, current_amount - scenario_withdrawal_amount))

    return SavingsPlanSummary(
        protected_current_amount=protected_current_amount,
        protected_monthly_contribution=protected_monthly_contribution,
        forecast_reserved_current_amount=protected_current_amount,
        essential_monthly_expenses=essential_monthly_expenses,
        essential_breakdown=essential_breakdown,
        three_month_target=three_month_target,
        six_month_target=six_month_target,
        emergency_fund_current_amount=current_amount,
        emergency_fund_monthly_contribution=monthly_contribution,
        emergency_fund_target_amount=current_target_amount,
        gap_to_current_target=_round_money(max(0.0, current_target_amount - current_amount))
        if current_target_amount is not None
        else None,
        gap_to_three_month_target=_round_money(max(0.0, three_month_target - current_amount)),
        gap_to_six_month_target=_round_money(max(0.0, six_month_target - current_amount)),
        target_completion_date=_estimate_target_date(
            reference_date=effective_reference_date,
            current_amount=current_amount,
            target_amount=current_target_amount,
            monthly_contribution=monthly_contribution,
        ),
        three_month_completion_date=_estimate_target_date(
            reference_date=effective_reference_date,
            current_amount=current_amount,
            target_amount=three_month_target,
            monthly_contribution=monthly_contribution,
        ),
        six_month_completion_date=_estimate_target_date(
            reference_date=effective_reference_date,
            current_amount=current_amount,
            target_amount=six_month_target,
            monthly_contribution=monthly_contribution,
        ),
        scenario_withdrawal_allowed=emergency_bucket.allow_scenario_withdrawal,
        scenario_withdrawal_amount=_round_money(scenario_withdrawal_amount),
        scenario_remaining_amount=scenario_remaining_amount,
        scenario_recovery_date_to_current_target=_estimate_target_date(
            reference_date=effective_reference_date,
            current_amount=scenario_remaining_amount,
            target_amount=current_target_amount,
            monthly_contribution=monthly_contribution,
        )
        if emergency_bucket.allow_scenario_withdrawal
        else None,
        scenario_recovery_date_to_three_month_target=_estimate_target_date(
            reference_date=effective_reference_date,
            current_amount=scenario_remaining_amount,
            target_amount=three_month_target,
            monthly_contribution=monthly_contribution,
        )
        if emergency_bucket.allow_scenario_withdrawal
        else None,
        scenario_recovery_date_to_six_month_target=_estimate_target_date(
            reference_date=effective_reference_date,
            current_amount=scenario_remaining_amount,
            target_amount=six_month_target,
            monthly_contribution=monthly_contribution,
        )
        if emergency_bucket.allow_scenario_withdrawal
        else None,
    )
