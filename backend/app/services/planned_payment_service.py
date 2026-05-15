from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import DomainValidationError, NotFoundError
from app.models.account import Account
from app.models.category import Category
from app.models.planned_payment import PlannedPayment


SUPPORTED_FREQUENCIES = {"monthly", "quarterly", "yearly", "one_time"}


@dataclass
class PlannedPaymentSchedule:
    next_charge_date: date | None
    monthly_equivalent: float


def add_months(value: date, months: int) -> date:
    year = value.year + (value.month - 1 + months) // 12
    month = (value.month - 1 + months) % 12 + 1
    day = min(value.day, monthrange(year, month)[1])
    return date(year, month, day)


def normalize_payment_type(payment_type: str) -> str:
    return payment_type.strip().lower()


def validate_planned_payment_payload(
    *,
    frequency: str,
    exact_date: date | None,
    day_of_month: int | None,
    month_of_year: int | None,
) -> str:
    normalized_frequency = frequency.strip().lower()
    if normalized_frequency not in SUPPORTED_FREQUENCIES:
        raise DomainValidationError(
            "Unsupported planned payment frequency.",
            [{"field": "frequency", "message": normalized_frequency}],
        )
    if normalized_frequency == "one_time" and exact_date is None:
        raise DomainValidationError("exact_date is required for one_time payments.", [{"field": "exact_date"}])
    if normalized_frequency == "monthly" and day_of_month is None:
        raise DomainValidationError("day_of_month is required for monthly payments.", [{"field": "day_of_month"}])
    if normalized_frequency == "quarterly" and exact_date is None:
        raise DomainValidationError("exact_date is required for quarterly payments.", [{"field": "exact_date"}])
    if normalized_frequency == "yearly" and exact_date is None and (day_of_month is None or month_of_year is None):
        raise DomainValidationError(
            "Provide exact_date or day_of_month and month_of_year for yearly payments.",
            [{"field": "exact_date"}],
        )
    return normalized_frequency


def require_account(session: Session, account_id: int) -> Account:
    account = session.get(Account, account_id)
    if account is None:
        raise NotFoundError("Account", account_id)
    return account


def require_optional_category(session: Session, category_id: int | None) -> Category | None:
    if category_id is None:
        return None
    category = session.get(Category, category_id)
    if category is None:
        raise NotFoundError("Category", category_id)
    return category


def list_planned_payments(*, session: Session) -> list[PlannedPayment]:
    return session.scalars(
        select(PlannedPayment).order_by(PlannedPayment.is_active.desc(), PlannedPayment.name.asc(), PlannedPayment.id.asc())
    ).all()


def _normalize_schedule_day(year: int, month: int, day_of_month: int) -> date:
    return date(year, month, min(day_of_month, monthrange(year, month)[1]))


def _monthly_equivalent(planned_payment: PlannedPayment) -> float:
    if planned_payment.frequency == "monthly":
        return round(planned_payment.amount, 2)
    if planned_payment.frequency == "quarterly":
        return round(planned_payment.amount / 3, 2)
    if planned_payment.frequency == "yearly":
        return round(planned_payment.amount / 12, 2)
    return 0.0


def compute_planned_payment_schedule(
    planned_payment: PlannedPayment,
    *,
    reference_date: date,
) -> PlannedPaymentSchedule:
    if not planned_payment.is_active:
        return PlannedPaymentSchedule(next_charge_date=None, monthly_equivalent=_monthly_equivalent(planned_payment))

    if planned_payment.frequency == "monthly":
        if planned_payment.day_of_month is None:
            raise DomainValidationError("Monthly payment is missing day_of_month.", [{"field": "day_of_month"}])
        candidate = _normalize_schedule_day(reference_date.year, reference_date.month, planned_payment.day_of_month)
        if candidate < reference_date:
            next_month = add_months(reference_date.replace(day=1), 1)
            candidate = _normalize_schedule_day(next_month.year, next_month.month, planned_payment.day_of_month)
        return PlannedPaymentSchedule(next_charge_date=candidate, monthly_equivalent=_monthly_equivalent(planned_payment))

    if planned_payment.frequency == "quarterly":
        if planned_payment.exact_date is None:
            raise DomainValidationError("Quarterly payment is missing exact_date.", [{"field": "exact_date"}])
        candidate = planned_payment.exact_date
        while candidate < reference_date:
            candidate = add_months(candidate, 3)
        return PlannedPaymentSchedule(next_charge_date=candidate, monthly_equivalent=_monthly_equivalent(planned_payment))

    if planned_payment.frequency == "yearly":
        if planned_payment.exact_date is not None:
            month = planned_payment.exact_date.month
            day_of_month = planned_payment.exact_date.day
        else:
            if planned_payment.month_of_year is None or planned_payment.day_of_month is None:
                raise DomainValidationError("Yearly payment is missing date fields.", [{"field": "exact_date"}])
            month = planned_payment.month_of_year
            day_of_month = planned_payment.day_of_month
        candidate = _normalize_schedule_day(reference_date.year, month, day_of_month)
        if candidate < reference_date:
            candidate = _normalize_schedule_day(reference_date.year + 1, month, day_of_month)
        return PlannedPaymentSchedule(next_charge_date=candidate, monthly_equivalent=_monthly_equivalent(planned_payment))

    if planned_payment.frequency == "one_time":
        next_charge_date = planned_payment.exact_date if planned_payment.exact_date and planned_payment.exact_date >= reference_date else None
        return PlannedPaymentSchedule(next_charge_date=next_charge_date, monthly_equivalent=_monthly_equivalent(planned_payment))

    raise DomainValidationError("Unsupported planned payment frequency.", [{"field": "frequency"}])
