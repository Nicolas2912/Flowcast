from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class ImportFailureResponse(BaseModel):
    row_number: int
    error_message: str
    raw_row_json: str


class ImportSummaryResponse(BaseModel):
    import_batch_id: int
    source_filename: str
    provider: str
    status: str
    delimiter: str | None
    transaction_count: int
    inserted_count: int
    duplicate_count: int
    skipped_count: int
    failed_count: int
    imported_at: datetime
    failures: list[ImportFailureResponse]


class ImportBatchResponse(BaseModel):
    id: int
    source_filename: str
    provider: str
    status: str
    delimiter: str | None
    transaction_count: int
    inserted_count: int
    duplicate_count: int
    skipped_count: int
    failed_count: int
    imported_at: datetime
