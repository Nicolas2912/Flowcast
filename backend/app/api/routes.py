from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.dependencies import get_session
from app.core.config import get_settings
from app.core.errors import DomainValidationError, NotFoundError
from app.models.account import Account
from app.models.category import Category
from app.models.merchant_rule import MerchantRule
from app.models.transaction import Transaction
from app.schemas.imports import ImportBatchResponse, ImportFailureResponse, ImportSummaryResponse
from app.schemas.account import AccountResponse
from app.schemas.category import CategoryCreateRequest, CategoryResponse, CategoryUpdateRequest
from app.schemas.health import HealthResponse
from app.schemas.merchant_rule import (
    CategorizationRunResponse,
    MerchantRuleCreateRequest,
    MerchantRuleResponse,
    MerchantRuleUpdateRequest,
)
from app.schemas.planned_payment import (
    PlannedPaymentValidationRequest,
    PlannedPaymentValidationResponse,
)
from app.schemas.transaction import (
    BulkTransactionCategoryUpdateRequest,
    BulkTransactionCategoryUpdateResponse,
    TransactionCategoryUpdateRequest,
    TransactionListResponse,
    TransactionResponse,
)
from app.services.categorization_service import (
    apply_merchant_rules,
    require_category,
    validate_pattern_type,
    validate_regex_pattern,
)
from app.services.import_service import import_c24_csv, list_import_batches
from app.services.transaction_service import list_transactions


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


@router.get("/categories", response_model=list[CategoryResponse])
def list_categories(session: Session = Depends(get_session)) -> list[CategoryResponse]:
    categories = session.scalars(select(Category).order_by(Category.sort_order.asc(), Category.name.asc())).all()
    return [_serialize_category(category) for category in categories]


@router.get("/categories/{category_id}", response_model=CategoryResponse)
def get_category(category_id: int, session: Session = Depends(get_session)) -> CategoryResponse:
    category = session.get(Category, category_id)
    if category is None:
        raise NotFoundError("Category", category_id)
    return _serialize_category(category)


@router.post("/categories", response_model=CategoryResponse, status_code=201)
def create_category(
    payload: CategoryCreateRequest,
    session: Session = Depends(get_session),
) -> CategoryResponse:
    _ensure_unique_category_name(session, payload.name)
    category = Category(name=payload.name.strip())
    _apply_category_payload(session, category, payload)
    session.add(category)
    session.commit()
    session.refresh(category)
    return _serialize_category(category)


@router.patch("/categories/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    payload: CategoryUpdateRequest,
    session: Session = Depends(get_session),
) -> CategoryResponse:
    category = session.get(Category, category_id)
    if category is None:
        raise NotFoundError("Category", category_id)
    if payload.name is not None and payload.name.strip() != category.name:
        _ensure_unique_category_name(session, payload.name, exclude_id=category_id)
    _apply_category_payload(session, category, payload)
    if category.parent_id == category.id:
        raise DomainValidationError("A category cannot be its own parent.")
    session.commit()
    session.refresh(category)
    return _serialize_category(category)


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


@router.get("/transactions", response_model=TransactionListResponse)
def get_transactions(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=250),
    search: str | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    uncategorized_only: bool = False,
    date_from: date | None = None,
    date_to: date | None = None,
    session: Session = Depends(get_session),
) -> TransactionListResponse:
    result = list_transactions(
        session=session,
        page=page,
        page_size=page_size,
        search=search,
        account_id=account_id,
        category_id=category_id,
        uncategorized_only=uncategorized_only,
        date_from=date_from,
        date_to=date_to,
    )
    return TransactionListResponse(
        items=[_serialize_transaction(item) for item in result.items],
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        total_pages=result.total_pages,
    )


@router.patch("/transactions/{transaction_id}/category", response_model=TransactionResponse)
def update_transaction_category(
    transaction_id: str,
    payload: TransactionCategoryUpdateRequest,
    session: Session = Depends(get_session),
) -> TransactionResponse:
    transaction = session.get(Transaction, transaction_id)
    if transaction is None:
        raise NotFoundError("Transaction", transaction_id)
    if payload.category_id is not None:
        require_category(session, payload.category_id)
    transaction.category_id = payload.category_id
    transaction.category_assignment_method = "manual" if payload.category_id is not None else "manual_clear"
    session.commit()
    session.refresh(transaction)
    return _serialize_transaction(transaction)


@router.post("/transactions/bulk-category", response_model=BulkTransactionCategoryUpdateResponse)
def bulk_update_transaction_category(
    payload: BulkTransactionCategoryUpdateRequest,
    session: Session = Depends(get_session),
) -> BulkTransactionCategoryUpdateResponse:
    if payload.category_id is not None:
        require_category(session, payload.category_id)
    transactions = session.scalars(select(Transaction).where(Transaction.id.in_(payload.transaction_ids))).all()
    found_ids = {transaction.id for transaction in transactions}
    missing_ids = [transaction_id for transaction_id in payload.transaction_ids if transaction_id not in found_ids]
    if missing_ids:
        raise DomainValidationError(
            "One or more transactions could not be found.",
            [{"transaction_id": transaction_id} for transaction_id in missing_ids],
        )
    for transaction in transactions:
        transaction.category_id = payload.category_id
        transaction.category_assignment_method = "manual" if payload.category_id is not None else "manual_clear"
    session.commit()
    return BulkTransactionCategoryUpdateResponse(updated_count=len(transactions))


@router.get("/merchant-rules", response_model=list[MerchantRuleResponse])
def get_merchant_rules(session: Session = Depends(get_session)) -> list[MerchantRuleResponse]:
    rules = session.scalars(select(MerchantRule).order_by(MerchantRule.priority.asc(), MerchantRule.id.asc())).all()
    return [_serialize_rule(rule) for rule in rules]


@router.post("/merchant-rules", response_model=MerchantRuleResponse, status_code=201)
def create_merchant_rule(
    payload: MerchantRuleCreateRequest,
    session: Session = Depends(get_session),
) -> MerchantRuleResponse:
    require_category(session, payload.category_id)
    pattern_type = validate_pattern_type(payload.pattern_type)
    if pattern_type == "regex":
        _validate_regex_or_raise(payload.pattern)
    rule = MerchantRule(
        name=payload.name.strip(),
        pattern_type=pattern_type,
        pattern=payload.pattern.strip(),
        category_id=payload.category_id,
        priority=payload.priority,
        is_active=payload.is_active,
    )
    session.add(rule)
    session.commit()
    session.refresh(rule)
    return _serialize_rule(rule)


@router.patch("/merchant-rules/{rule_id}", response_model=MerchantRuleResponse)
def update_merchant_rule(
    rule_id: int,
    payload: MerchantRuleUpdateRequest,
    session: Session = Depends(get_session),
) -> MerchantRuleResponse:
    rule = session.get(MerchantRule, rule_id)
    if rule is None:
        raise NotFoundError("MerchantRule", rule_id)
    if payload.category_id is not None:
        require_category(session, payload.category_id)
        rule.category_id = payload.category_id
    if payload.name is not None:
        rule.name = payload.name.strip()
    if payload.priority is not None:
        rule.priority = payload.priority
    if payload.is_active is not None:
        rule.is_active = payload.is_active
    if payload.pattern_type is not None:
        rule.pattern_type = validate_pattern_type(payload.pattern_type)
    if payload.pattern is not None:
        rule.pattern = payload.pattern.strip()
    if rule.pattern_type == "regex":
        _validate_regex_or_raise(rule.pattern)
    session.commit()
    session.refresh(rule)
    return _serialize_rule(rule)


@router.delete("/merchant-rules/{rule_id}", status_code=204)
def delete_merchant_rule(rule_id: int, session: Session = Depends(get_session)) -> Response:
    rule = session.get(MerchantRule, rule_id)
    if rule is None:
        raise NotFoundError("MerchantRule", rule_id)
    session.delete(rule)
    session.commit()
    return Response(status_code=204)


@router.post("/merchant-rules/apply", response_model=CategorizationRunResponse)
def run_merchant_rules(session: Session = Depends(get_session)) -> CategorizationRunResponse:
    summary = apply_merchant_rules(session=session)
    return CategorizationRunResponse(
        processed_count=summary.processed_count,
        matched_count=summary.matched_count,
        updated_count=summary.updated_count,
        cleared_count=summary.cleared_count,
    )


def _serialize_category(category: Category) -> CategoryResponse:
    return CategoryResponse(
        id=category.id,
        name=category.name,
        parent_id=category.parent_id,
        parent_name=category.parent.name if category.parent else None,
        behavior_type=category.behavior_type,
        is_essential=category.is_essential,
        is_variable=category.is_variable,
        is_income=category.is_income,
        is_saving=category.is_saving,
        is_excluded=category.is_excluded,
        sort_order=category.sort_order,
    )


def _serialize_transaction(transaction: Transaction) -> TransactionResponse:
    return TransactionResponse(
        id=transaction.id,
        booking_date=transaction.booking_date,
        value_date=transaction.value_date,
        amount=transaction.amount,
        currency=transaction.currency,
        payee=transaction.payee,
        purpose=transaction.purpose,
        account_id=transaction.account_id,
        account_name=transaction.account.name if transaction.account else "",
        category_id=transaction.category_id,
        category_name=transaction.category.name if transaction.category else None,
        category_assignment_method=transaction.category_assignment_method,
        source_import_id=transaction.source_import_id,
        source_import_filename=transaction.source_import.source_filename if transaction.source_import else None,
        is_pending=transaction.is_pending,
    )


def _serialize_rule(rule: MerchantRule) -> MerchantRuleResponse:
    return MerchantRuleResponse(
        id=rule.id,
        name=rule.name,
        pattern_type=rule.pattern_type,
        pattern=rule.pattern,
        category_id=rule.category_id,
        category_name=rule.category.name if rule.category else "",
        priority=rule.priority,
        is_active=rule.is_active,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
    )


def _ensure_unique_category_name(session: Session, name: str, exclude_id: int | None = None) -> None:
    normalized = name.strip()
    categories = session.scalars(select(Category).where(Category.name == normalized)).all()
    if any(category.id != exclude_id for category in categories):
        raise DomainValidationError(
            "Category names must be unique.",
            [{"field": "name", "message": normalized}],
        )


def _apply_category_payload(
    session: Session,
    category: Category,
    payload: CategoryCreateRequest | CategoryUpdateRequest,
) -> None:
    fields = payload.model_fields_set if isinstance(payload, CategoryUpdateRequest) else None

    if fields is None or "name" in fields:
        category.name = (payload.name or category.name).strip()
    if fields is None or "behavior_type" in fields:
        category.behavior_type = (payload.behavior_type or category.behavior_type).strip().lower()
    if fields is None or "is_essential" in fields:
        category.is_essential = bool(payload.is_essential)
    if fields is None or "is_variable" in fields:
        category.is_variable = bool(payload.is_variable)
    if fields is None or "is_income" in fields:
        category.is_income = bool(payload.is_income)
    if fields is None or "is_saving" in fields:
        category.is_saving = bool(payload.is_saving)
    if fields is None or "is_excluded" in fields:
        category.is_excluded = bool(payload.is_excluded)
    if fields is None or "sort_order" in fields:
        category.sort_order = payload.sort_order if payload.sort_order is not None else category.sort_order
    if fields is None or "parent_id" in fields:
        if payload.parent_id is None:
            category.parent = None
        else:
            parent = session.get(Category, payload.parent_id)
            if parent is None:
                raise NotFoundError("Category", payload.parent_id)
            category.parent = parent


def _validate_regex_or_raise(pattern: str) -> None:
    try:
        validate_regex_pattern(pattern)
    except ValueError as exc:
        raise DomainValidationError(str(exc), [{"field": "pattern"}]) from exc
