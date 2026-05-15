from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class SpendingAssumptionResponse(BaseModel):
    id: int
    category_id: int
    category_name: str
    calculation_method: str
    auto_monthly_amount: float | None
    manual_monthly_amount: float | None
    effective_monthly_amount: float
    last_recalculated_at: datetime | None
    is_active: bool
    baseline_months: list[str]
    baseline_month_count: int
    confidence: str


class SpendingAssumptionUpdateRequest(BaseModel):
    manual_monthly_amount: float | None = Field(default=None, ge=0)
    revert_to_automatic: bool = False
