from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class SavingsBucketResponse(BaseModel):
    id: int
    name: str
    bucket_type: str
    current_amount: float
    target_amount: float | None
    monthly_contribution: float
    priority: int
    is_protected: bool
    allow_scenario_withdrawal: bool
    progress_ratio: float | None
    target_gap: float | None
    forecast_reserved_amount: float


class SavingsBucketUpdateRequest(BaseModel):
    current_amount: float | None = Field(default=None, ge=0)
    target_amount: float | None = Field(default=None, ge=0)
    monthly_contribution: float | None = Field(default=None, ge=0)
    priority: int | None = Field(default=None, ge=1)
    is_protected: bool | None = None
    allow_scenario_withdrawal: bool | None = None


class EssentialExpenseLineItemResponse(BaseModel):
    label: str
    source_type: str
    monthly_amount: float


class SavingsPlanSummaryResponse(BaseModel):
    protected_current_amount: float
    protected_monthly_contribution: float
    forecast_reserved_current_amount: float
    essential_monthly_expenses: float
    essential_breakdown: list[EssentialExpenseLineItemResponse]
    three_month_target: float
    six_month_target: float
    emergency_fund_current_amount: float
    emergency_fund_monthly_contribution: float
    emergency_fund_target_amount: float | None
    gap_to_current_target: float | None
    gap_to_three_month_target: float
    gap_to_six_month_target: float
    target_completion_date: date | None
    three_month_completion_date: date | None
    six_month_completion_date: date | None
    scenario_withdrawal_allowed: bool
    scenario_withdrawal_amount: float
    scenario_remaining_amount: float
    scenario_recovery_date_to_current_target: date | None
    scenario_recovery_date_to_three_month_target: date | None
    scenario_recovery_date_to_six_month_target: date | None
