from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.core.errors import DomainValidationError, NotFoundError
from app.core.time import utc_now_naive
from app.models.category import Category
from app.models.spending_assumption import SpendingAssumption
from app.models.transaction import Transaction
from app.services.planned_payment_service import add_months


@dataclass
class SpendingAssumptionSnapshot:
    assumption: SpendingAssumption
    baseline_months: list[str]
    baseline_month_count: int
    confidence: str


def _first_day_of_month(value: date) -> date:
    return value.replace(day=1)


def _month_key(value: date) -> str:
    return value.strftime("%Y-%m")


def _previous_month_starts(current_month_start: date, count: int) -> list[date]:
    months: list[date] = []
    cursor = current_month_start
    for _ in range(count):
        cursor = add_months(cursor, -1).replace(day=1)
        months.append(cursor)
    months.reverse()
    return months


def _available_complete_months(*, session: Session, reference_date: date) -> list[date]:
    current_month_start = _first_day_of_month(reference_date)
    candidate_months = _previous_month_starts(current_month_start, 3)
    distinct_months = {
        _first_day_of_month(booking_date)
        for booking_date in session.scalars(
            select(Transaction.booking_date).where(Transaction.booking_date < current_month_start)
        ).all()
    }
    return [month_start for month_start in candidate_months if month_start in distinct_months]


def _confidence(month_count: int) -> str:
    if month_count >= 3:
        return "high"
    if month_count >= 1:
        return "low"
    return "manual_required"


def recalculate_spending_assumptions(
    *,
    session: Session,
    reference_date: date | None = None,
) -> list[SpendingAssumptionSnapshot]:
    effective_reference_date = reference_date or utc_now_naive().date()
    current_month_start = _first_day_of_month(effective_reference_date)
    baseline_month_starts = _available_complete_months(session=session, reference_date=effective_reference_date)
    baseline_month_count = len(baseline_month_starts)
    window_start = baseline_month_starts[0] if baseline_month_starts else current_month_start

    variable_categories = session.scalars(
        select(Category)
        .where(Category.is_variable.is_(True), Category.is_income.is_(False), Category.is_excluded.is_(False))
        .order_by(Category.sort_order.asc(), Category.name.asc())
    ).all()
    assumptions_by_category = {
        assumption.category_id: assumption for assumption in session.scalars(select(SpendingAssumption)).all()
    }

    now = utc_now_naive()
    snapshots: list[SpendingAssumptionSnapshot] = []

    for category in variable_categories:
        assumption = assumptions_by_category.get(category.id)
        if assumption is None:
            assumption = SpendingAssumption(
                category_id=category.id,
                calculation_method="manual_required" if baseline_month_count == 0 else "automatic",
                auto_monthly_amount=None,
                manual_monthly_amount=None,
                effective_monthly_amount=0.0,
                last_recalculated_at=now,
                is_active=True,
            )
            session.add(assumption)

        transactions = session.scalars(
            select(Transaction).where(
                Transaction.category_id == category.id,
                Transaction.booking_date >= window_start,
                Transaction.booking_date < current_month_start,
                Transaction.is_internal_transfer.is_(False),
                Transaction.is_excluded_from_forecast.is_(False),
                Transaction.is_pending.is_(False),
            )
        ).all()
        net_spend = max(0.0, -sum(transaction.amount for transaction in transactions))
        auto_monthly_amount = round(net_spend / baseline_month_count, 2) if baseline_month_count > 0 else None

        assumption.auto_monthly_amount = auto_monthly_amount
        if assumption.manual_monthly_amount is not None:
            assumption.effective_monthly_amount = round(assumption.manual_monthly_amount, 2)
            assumption.calculation_method = "manual_override"
        elif auto_monthly_amount is not None:
            assumption.effective_monthly_amount = auto_monthly_amount
            assumption.calculation_method = "automatic"
        else:
            assumption.effective_monthly_amount = 0.0
            assumption.calculation_method = "manual_required"
        assumption.last_recalculated_at = now
        assumption.is_active = True

        snapshots.append(
            SpendingAssumptionSnapshot(
                assumption=assumption,
                baseline_months=[_month_key(month_start) for month_start in baseline_month_starts],
                baseline_month_count=baseline_month_count,
                confidence=_confidence(baseline_month_count),
            )
        )

    session.commit()
    refreshed_assumptions = {
        assumption.id: assumption
        for assumption in session.scalars(
            select(SpendingAssumption)
            .options(joinedload(SpendingAssumption.category))
            .where(SpendingAssumption.id.in_([snapshot.assumption.id for snapshot in snapshots]))
        ).all()
    }
    return [
        SpendingAssumptionSnapshot(
            assumption=refreshed_assumptions[snapshot.assumption.id],
            baseline_months=snapshot.baseline_months,
            baseline_month_count=snapshot.baseline_month_count,
            confidence=snapshot.confidence,
        )
        for snapshot in snapshots
    ]


def update_spending_assumption_override(
    *,
    session: Session,
    assumption_id: int,
    manual_monthly_amount: float | None,
    revert_to_automatic: bool,
) -> SpendingAssumptionSnapshot:
    assumption = session.get(SpendingAssumption, assumption_id)
    if assumption is None:
        raise NotFoundError("SpendingAssumption", assumption_id)
    if revert_to_automatic:
        assumption.manual_monthly_amount = None
    else:
        if manual_monthly_amount is None:
            raise DomainValidationError(
                "manual_monthly_amount is required unless reverting to automatic.",
                [{"field": "manual_monthly_amount"}],
            )
        assumption.manual_monthly_amount = round(manual_monthly_amount, 2)
    session.commit()

    for snapshot in recalculate_spending_assumptions(session=session):
        if snapshot.assumption.id == assumption_id:
            return snapshot
    raise NotFoundError("SpendingAssumption", assumption_id)
