from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, File, Form, Query, Response, UploadFile
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.api.dependencies import get_session
from app.core.config import get_settings
from app.core.errors import DomainValidationError, NotFoundError
from app.core.time import utc_now_naive
from app.models.account import Account
from app.models.category import Category
from app.models.merchant_rule import MerchantRule
from app.models.planned_payment import PlannedPayment
from app.models.savings_bucket import SavingsBucket
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
    PlannedPaymentCreateRequest,
    PlannedPaymentResponse,
    PlannedPaymentUpdateRequest,
    PlannedPaymentValidationRequest,
    PlannedPaymentValidationResponse,
)
from app.schemas.savings_bucket import (
    EssentialExpenseLineItemResponse,
    SavingsBucketResponse,
    SavingsBucketUpdateRequest,
    SavingsPlanSummaryResponse,
)
from app.schemas.spending_assumption import SpendingAssumptionResponse, SpendingAssumptionUpdateRequest
from app.schemas.transaction import (
    BulkTransactionCategoryUpdateRequest,
    BulkTransactionCategoryUpdateResponse,
    TransactionCategoryUpdateRequest,
    TransactionForecastSettingsUpdateRequest,
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
from app.services.planned_payment_service import (
    compute_planned_payment_schedule,
    list_planned_payments,
    normalize_payment_type,
    require_account,
    require_optional_category,
    validate_planned_payment_payload,
)
from app.services.savings_bucket_service import (
    EssentialExpenseLineItem,
    SavingsPlanSummary,
    build_savings_plan_summary,
    list_savings_buckets,
    update_savings_bucket,
)
from app.services.spending_assumption_service import (
    SpendingAssumptionSnapshot,
    recalculate_spending_assumptions,
    update_spending_assumption_override,
)
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
    normalized_frequency = validate_planned_payment_payload(
        frequency=payload.frequency,
        exact_date=payload.exact_date,
        day_of_month=payload.day_of_month,
        month_of_year=payload.month_of_year,
    )
    return PlannedPaymentValidationResponse(
        accepted=True,
        normalized_frequency=normalized_frequency,
        normalized_payment_type=normalize_payment_type(payload.payment_type),
    )


@router.get("/planned-payments", response_model=list[PlannedPaymentResponse])
def get_planned_payments(session: Session = Depends(get_session)) -> list[PlannedPaymentResponse]:
    return [_serialize_planned_payment(item) for item in list_planned_payments(session=session)]


@router.post("/planned-payments", response_model=PlannedPaymentResponse, status_code=201)
def create_planned_payment(
    payload: PlannedPaymentCreateRequest,
    session: Session = Depends(get_session),
) -> PlannedPaymentResponse:
    normalized_frequency = validate_planned_payment_payload(
        frequency=payload.frequency,
        exact_date=payload.exact_date,
        day_of_month=payload.day_of_month,
        month_of_year=payload.month_of_year,
    )
    require_account(session, payload.account_id)
    require_optional_category(session, payload.category_id)
    planned_payment = PlannedPayment(
        account_id=payload.account_id,
        name=payload.name.strip(),
        amount=payload.amount,
        payment_type=normalize_payment_type(payload.payment_type),
        frequency=normalized_frequency,
        exact_date=payload.exact_date,
        day_of_month=payload.day_of_month,
        month_of_year=payload.month_of_year,
        category_id=payload.category_id,
        is_active=payload.is_active,
        notes=payload.notes.strip() if payload.notes else None,
    )
    session.add(planned_payment)
    session.commit()
    session.refresh(planned_payment)
    return _serialize_planned_payment(planned_payment)


@router.patch("/planned-payments/{planned_payment_id}", response_model=PlannedPaymentResponse)
def update_planned_payment(
    planned_payment_id: int,
    payload: PlannedPaymentUpdateRequest,
    session: Session = Depends(get_session),
) -> PlannedPaymentResponse:
    planned_payment = session.get(PlannedPayment, planned_payment_id)
    if planned_payment is None:
        raise NotFoundError("PlannedPayment", planned_payment_id)
    if payload.account_id is not None:
        require_account(session, payload.account_id)
        planned_payment.account_id = payload.account_id
    if payload.name is not None:
        planned_payment.name = payload.name.strip()
    if payload.amount is not None:
        if payload.amount == 0:
            raise DomainValidationError("amount must not be 0.", [{"field": "amount"}])
        planned_payment.amount = payload.amount
    if payload.payment_type is not None:
        planned_payment.payment_type = normalize_payment_type(payload.payment_type)
    if payload.is_active is not None:
        planned_payment.is_active = payload.is_active
    if payload.notes is not None:
        planned_payment.notes = payload.notes.strip() or None
    if payload.category_id is not None or "category_id" in payload.model_fields_set:
        require_optional_category(session, payload.category_id)
        planned_payment.category_id = payload.category_id

    next_frequency = payload.frequency or planned_payment.frequency
    next_exact_date = payload.exact_date if "exact_date" in payload.model_fields_set else planned_payment.exact_date
    next_day_of_month = payload.day_of_month if "day_of_month" in payload.model_fields_set else planned_payment.day_of_month
    next_month_of_year = payload.month_of_year if "month_of_year" in payload.model_fields_set else planned_payment.month_of_year
    planned_payment.frequency = validate_planned_payment_payload(
        frequency=next_frequency,
        exact_date=next_exact_date,
        day_of_month=next_day_of_month,
        month_of_year=next_month_of_year,
    )
    planned_payment.exact_date = next_exact_date
    planned_payment.day_of_month = next_day_of_month
    planned_payment.month_of_year = next_month_of_year

    session.commit()
    session.refresh(planned_payment)
    return _serialize_planned_payment(planned_payment)


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


@router.patch("/transactions/{transaction_id}/forecast-settings", response_model=TransactionResponse)
def update_transaction_forecast_settings(
    transaction_id: str,
    payload: TransactionForecastSettingsUpdateRequest,
    session: Session = Depends(get_session),
) -> TransactionResponse:
    transaction = session.get(Transaction, transaction_id)
    if transaction is None:
        raise NotFoundError("Transaction", transaction_id)
    transaction.is_excluded_from_forecast = payload.is_excluded_from_forecast
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


@router.get("/spending-assumptions", response_model=list[SpendingAssumptionResponse])
def get_spending_assumptions(session: Session = Depends(get_session)) -> list[SpendingAssumptionResponse]:
    snapshots = recalculate_spending_assumptions(session=session)
    return [_serialize_spending_assumption(snapshot) for snapshot in snapshots]


@router.post("/spending-assumptions/recalculate", response_model=list[SpendingAssumptionResponse])
def recalculate_assumptions(session: Session = Depends(get_session)) -> list[SpendingAssumptionResponse]:
    snapshots = recalculate_spending_assumptions(session=session)
    return [_serialize_spending_assumption(snapshot) for snapshot in snapshots]


@router.patch("/spending-assumptions/{assumption_id}", response_model=SpendingAssumptionResponse)
def update_spending_assumption(
    assumption_id: int,
    payload: SpendingAssumptionUpdateRequest,
    session: Session = Depends(get_session),
) -> SpendingAssumptionResponse:
    snapshot = update_spending_assumption_override(
        session=session,
        assumption_id=assumption_id,
        manual_monthly_amount=payload.manual_monthly_amount,
        revert_to_automatic=payload.revert_to_automatic,
    )
    return _serialize_spending_assumption(snapshot)


@router.get("/savings-buckets", response_model=list[SavingsBucketResponse])
def get_savings_buckets(session: Session = Depends(get_session)) -> list[SavingsBucketResponse]:
    return [_serialize_savings_bucket(bucket) for bucket in list_savings_buckets(session=session)]


@router.patch("/savings-buckets/{bucket_id}", response_model=SavingsBucketResponse)
def patch_savings_bucket(
    bucket_id: int,
    payload: SavingsBucketUpdateRequest,
    session: Session = Depends(get_session),
) -> SavingsBucketResponse:
    bucket = update_savings_bucket(
        session=session,
        bucket_id=bucket_id,
        current_amount=payload.current_amount,
        target_amount=payload.target_amount,
        monthly_contribution=payload.monthly_contribution,
        priority=payload.priority,
        is_protected=payload.is_protected,
        allow_scenario_withdrawal=payload.allow_scenario_withdrawal,
        fields=payload.model_fields_set,
    )
    return _serialize_savings_bucket(bucket)


@router.get("/savings-buckets/summary", response_model=SavingsPlanSummaryResponse)
def get_savings_summary(
    scenario_withdrawal_amount: float = Query(default=0, ge=0),
    session: Session = Depends(get_session),
) -> SavingsPlanSummaryResponse:
    summary = build_savings_plan_summary(
        session=session,
        scenario_withdrawal_amount=scenario_withdrawal_amount,
    )
    return _serialize_savings_summary(summary)


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
        is_excluded_from_forecast=transaction.is_excluded_from_forecast,
        is_pending=transaction.is_pending,
    )


def _serialize_planned_payment(planned_payment: PlannedPayment) -> PlannedPaymentResponse:
    schedule = compute_planned_payment_schedule(planned_payment, reference_date=utc_now_naive().date())
    return PlannedPaymentResponse(
        id=planned_payment.id,
        account_id=planned_payment.account_id,
        account_name=planned_payment.account.name if planned_payment.account else "",
        name=planned_payment.name,
        amount=planned_payment.amount,
        payment_type=planned_payment.payment_type,
        frequency=planned_payment.frequency,
        exact_date=planned_payment.exact_date,
        day_of_month=planned_payment.day_of_month,
        month_of_year=planned_payment.month_of_year,
        category_id=planned_payment.category_id,
        category_name=planned_payment.category.name if planned_payment.category else None,
        is_active=planned_payment.is_active,
        notes=planned_payment.notes,
        next_charge_date=schedule.next_charge_date,
        monthly_equivalent=schedule.monthly_equivalent,
        created_at=planned_payment.created_at,
        updated_at=planned_payment.updated_at,
    )


def _serialize_spending_assumption(snapshot: SpendingAssumptionSnapshot) -> SpendingAssumptionResponse:
    assumption = snapshot.assumption
    return SpendingAssumptionResponse(
        id=assumption.id,
        category_id=assumption.category_id,
        category_name=assumption.category.name if assumption.category else "",
        calculation_method=assumption.calculation_method,
        auto_monthly_amount=assumption.auto_monthly_amount,
        manual_monthly_amount=assumption.manual_monthly_amount,
        effective_monthly_amount=assumption.effective_monthly_amount,
        last_recalculated_at=assumption.last_recalculated_at,
        is_active=assumption.is_active,
        baseline_months=snapshot.baseline_months,
        baseline_month_count=snapshot.baseline_month_count,
        confidence=snapshot.confidence,
    )


def _serialize_savings_bucket(bucket: SavingsBucket) -> SavingsBucketResponse:
    target_gap = max(0.0, (bucket.target_amount or 0.0) - bucket.current_amount) if bucket.target_amount is not None else None
    progress_ratio = None
    if bucket.target_amount is not None and bucket.target_amount > 0:
        progress_ratio = round(min(bucket.current_amount / bucket.target_amount, 1.0), 4)
    return SavingsBucketResponse(
        id=bucket.id,
        name=bucket.name,
        bucket_type=bucket.bucket_type,
        current_amount=bucket.current_amount,
        target_amount=bucket.target_amount,
        monthly_contribution=bucket.monthly_contribution,
        priority=bucket.priority,
        is_protected=bucket.is_protected,
        allow_scenario_withdrawal=bucket.allow_scenario_withdrawal,
        progress_ratio=progress_ratio,
        target_gap=round(target_gap, 2) if target_gap is not None else None,
        forecast_reserved_amount=round(bucket.current_amount if bucket.is_protected else 0.0, 2),
    )


def _serialize_savings_summary(summary: SavingsPlanSummary) -> SavingsPlanSummaryResponse:
    return SavingsPlanSummaryResponse(
        protected_current_amount=summary.protected_current_amount,
        protected_monthly_contribution=summary.protected_monthly_contribution,
        forecast_reserved_current_amount=summary.forecast_reserved_current_amount,
        essential_monthly_expenses=summary.essential_monthly_expenses,
        essential_breakdown=[
            EssentialExpenseLineItemResponse(
                label=item.label,
                source_type=item.source_type,
                monthly_amount=item.monthly_amount,
            )
            for item in summary.essential_breakdown
        ],
        three_month_target=summary.three_month_target,
        six_month_target=summary.six_month_target,
        emergency_fund_current_amount=summary.emergency_fund_current_amount,
        emergency_fund_monthly_contribution=summary.emergency_fund_monthly_contribution,
        emergency_fund_target_amount=summary.emergency_fund_target_amount,
        gap_to_current_target=summary.gap_to_current_target,
        gap_to_three_month_target=summary.gap_to_three_month_target,
        gap_to_six_month_target=summary.gap_to_six_month_target,
        target_completion_date=summary.target_completion_date,
        three_month_completion_date=summary.three_month_completion_date,
        six_month_completion_date=summary.six_month_completion_date,
        scenario_withdrawal_allowed=summary.scenario_withdrawal_allowed,
        scenario_withdrawal_amount=summary.scenario_withdrawal_amount,
        scenario_remaining_amount=summary.scenario_remaining_amount,
        scenario_recovery_date_to_current_target=summary.scenario_recovery_date_to_current_target,
        scenario_recovery_date_to_three_month_target=summary.scenario_recovery_date_to_three_month_target,
        scenario_recovery_date_to_six_month_target=summary.scenario_recovery_date_to_six_month_target,
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
