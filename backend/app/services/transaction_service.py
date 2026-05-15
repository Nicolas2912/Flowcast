from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.transaction import Transaction
from app.services.text_normalization import normalize_text


@dataclass
class TransactionListResult:
    items: list[Transaction]
    total: int
    page: int
    page_size: int

    @property
    def total_pages(self) -> int:
        if self.total == 0:
            return 0
        return (self.total + self.page_size - 1) // self.page_size


def list_transactions(
    *,
    session: Session,
    page: int,
    page_size: int,
    search: str | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    uncategorized_only: bool = False,
    date_from: date | None = None,
    date_to: date | None = None,
) -> TransactionListResult:
    statement: Select[tuple[Transaction]] = select(Transaction).options(
        joinedload(Transaction.account),
        joinedload(Transaction.category),
        joinedload(Transaction.source_import),
    )

    if search:
        needle = f"%{normalize_text(search)}%"
        statement = statement.where(
            or_(
                func.lower(func.coalesce(Transaction.payee, "")).like(needle),
                func.lower(func.coalesce(Transaction.purpose, "")).like(needle),
                func.lower(func.coalesce(Transaction.original_text, "")).like(needle),
                func.lower(func.coalesce(Transaction.normalized_text, "")).like(needle),
            )
        )

    if account_id is not None:
        statement = statement.where(Transaction.account_id == account_id)

    if category_id is not None:
        statement = statement.where(Transaction.category_id == category_id)

    if uncategorized_only:
        statement = statement.where(Transaction.category_id.is_(None))

    if date_from is not None:
        statement = statement.where(Transaction.booking_date >= date_from)

    if date_to is not None:
        statement = statement.where(Transaction.booking_date <= date_to)

    total = session.scalar(select(func.count()).select_from(statement.subquery())) or 0

    items = session.scalars(
        statement
        .order_by(Transaction.booking_date.desc(), Transaction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return TransactionListResult(items=items, total=total, page=page, page_size=page_size)
