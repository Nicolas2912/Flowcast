from __future__ import annotations

from sqlalchemy.orm import Session

from app.services.categorization_service import apply_merchant_rules
from app.services.spending_assumption_service import recalculate_spending_assumptions


def refresh_derived_state(
    *,
    session: Session,
    apply_rules: bool,
) -> None:
    if apply_rules:
        apply_merchant_rules(session=session)
    recalculate_spending_assumptions(session=session)
