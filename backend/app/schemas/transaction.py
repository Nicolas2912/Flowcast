from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class TransactionResponse(BaseModel):
    id: str
    booking_date: date
    value_date: date | None
    amount: float
    currency: str
    payee: str | None
    purpose: str | None
    account_id: int
    account_name: str
    category_id: int | None
    category_name: str | None
    category_assignment_method: str | None
    source_import_id: int | None
    source_import_filename: str | None
    is_excluded_from_forecast: bool
    is_pending: bool


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class TransactionCategoryUpdateRequest(BaseModel):
    category_id: int | None = None


class BulkTransactionCategoryUpdateRequest(BaseModel):
    transaction_ids: list[str] = Field(min_length=1)
    category_id: int | None = None


class BulkTransactionCategoryUpdateResponse(BaseModel):
    updated_count: int


class TransactionForecastSettingsUpdateRequest(BaseModel):
    is_excluded_from_forecast: bool
