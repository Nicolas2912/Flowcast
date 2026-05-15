from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.dependencies import get_session
from app.core.config import get_settings
from app.core.errors import NotFoundError
from app.models.account import Account
from app.models.category import Category
from app.schemas.imports import ImportBatchResponse, ImportFailureResponse, ImportSummaryResponse
from app.schemas.account import AccountResponse
from app.schemas.category import CategoryResponse
from app.schemas.health import HealthResponse
from app.schemas.planned_payment import (
    PlannedPaymentValidationRequest,
    PlannedPaymentValidationResponse,
)
from app.services.import_service import import_c24_csv, list_import_batches


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


@router.post("/imports/c24", response_model=ImportSummaryResponse)
async def upload_c24_csv(
    account_id: int = Form(...),
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> ImportSummaryResponse:
    file_bytes = await file.read()
    summary = import_c24_csv(
        session=session,
        filename=file.filename or "upload.csv",
        file_bytes=file_bytes,
        account_id=account_id,
    )
    return ImportSummaryResponse(
        import_batch_id=summary.import_batch.id,
        source_filename=summary.import_batch.source_filename,
        provider=summary.import_batch.provider,
        status=summary.import_batch.status,
        delimiter=summary.import_batch.delimiter,
        transaction_count=summary.import_batch.transaction_count,
        inserted_count=summary.inserted_count,
        duplicate_count=summary.duplicate_count,
        skipped_count=summary.skipped_count,
        failed_count=summary.failed_count,
        imported_at=summary.import_batch.imported_at,
        failures=[
            ImportFailureResponse(
                row_number=failure.row_number,
                error_message=failure.error_message,
                raw_row_json=failure.raw_row_json,
            )
            for failure in summary.failures
        ],
    )


@router.get("/imports", response_model=list[ImportBatchResponse])
def get_import_batches(session: Session = Depends(get_session)) -> list[ImportBatchResponse]:
    batches = list_import_batches(session=session)
    return [
        ImportBatchResponse(
            id=batch.id,
            source_filename=batch.source_filename,
            provider=batch.provider,
            status=batch.status,
            delimiter=batch.delimiter,
            transaction_count=batch.transaction_count,
            inserted_count=batch.inserted_count,
            duplicate_count=batch.duplicate_count,
            skipped_count=batch.skipped_count,
            failed_count=batch.failed_count,
            imported_at=batch.imported_at,
        )
        for batch in batches
    ]
