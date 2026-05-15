from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.dependencies import get_session
from app.core.config import get_settings
from app.core.errors import NotFoundError
from app.models.account import Account
from app.models.category import Category
from app.schemas.account import AccountResponse
from app.schemas.category import CategoryResponse
from app.schemas.health import HealthResponse
from app.schemas.planned_payment import (
    PlannedPaymentValidationRequest,
    PlannedPaymentValidationResponse,
)


router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def get_health(session: Session = Depends(get_session)) -> HealthResponse:
    session.execute(text("SELECT 1"))
    settings = get_settings()
    return HealthResponse(
        status="ok",
        app=settings.app_name,
        version=settings.app_version,
        environment=settings.app_env,
        database="ok",
    )


@router.get("/accounts", response_model=list[AccountResponse])
def list_accounts(session: Session = Depends(get_session)) -> list[Account]:
    return session.query(Account).order_by(Account.id.asc()).all()


@router.get("/categories/{category_id}", response_model=CategoryResponse)
def get_category(category_id: int, session: Session = Depends(get_session)) -> Category:
    category = session.get(Category, category_id)
    if category is None:
        raise NotFoundError("Category", category_id)
    return category


@router.post("/planned-payments/validate", response_model=PlannedPaymentValidationResponse)
def validate_planned_payment(
    payload: PlannedPaymentValidationRequest,
) -> PlannedPaymentValidationResponse:
    return PlannedPaymentValidationResponse(
        accepted=True,
        normalized_frequency=payload.frequency.lower(),
        normalized_payment_type=payload.payment_type.lower(),
    )
