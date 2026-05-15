from __future__ import annotations

from datetime import date

from pydantic import BaseModel, Field


class ForecastPointResponse(BaseModel):
    date: date
    balance: float
    available_balance: float
    goal_funded_amount: float


class ForecastRiskResponse(BaseModel):
    minimum_balance: float
    first_negative_date: date | None
    negative_day_count: int
    ending_balance: float


class GoalForecastResponse(BaseModel):
    goal_id: int
    goal_name: str
    priority: int
    target_amount: float
    current_saved_amount: float
    projected_saved_amount: float
    remaining_gap: float
    affordability_date: date | None
    funding_strategy: str
    target_date: date | None
    is_active: bool


class ForecastHorizonResponse(BaseModel):
    days: int
    points: list[ForecastPointResponse]
    risk: ForecastRiskResponse
    goals: list[GoalForecastResponse]


class ForecastScenarioResponse(BaseModel):
    scenario_id: str
    label: str
    variable_spending_multiplier: float
    horizons: list[ForecastHorizonResponse]


class ScenarioGoalPriorityOverrideRequest(BaseModel):
    goal_id: int
    priority: int = Field(ge=1)


class ScenarioCashAdjustmentRequest(BaseModel):
    date: date
    amount: float = Field(gt=0)
    label: str = Field(min_length=1, max_length=255)


class ForecastScenarioRequest(BaseModel):
    name: str = Field(default="Custom scenario", min_length=1, max_length=255)
    variable_spending_multiplier: float = Field(default=1.0, gt=0)
    etf_monthly_contribution_override: float | None = Field(default=None, ge=0)
    emergency_fund_monthly_contribution_override: float | None = Field(default=None, ge=0)
    emergency_fund_withdrawal_amount: float = Field(default=0, ge=0)
    goal_priority_overrides: list[ScenarioGoalPriorityOverrideRequest] = Field(default_factory=list)
    one_off_expenses: list[ScenarioCashAdjustmentRequest] = Field(default_factory=list)
    one_off_incomes: list[ScenarioCashAdjustmentRequest] = Field(default_factory=list)


class ForecastComparisonResponse(BaseModel):
    base: ForecastScenarioResponse
    scenario: ForecastScenarioResponse
    ending_balance_delta_12m: float
    available_balance_delta_12m: float
    earliest_goal_delta_days: int | None


class ForecastBundleResponse(BaseModel):
    generated_at: date
    scenarios: list[ForecastScenarioResponse]
