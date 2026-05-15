from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field


class GoalResponse(BaseModel):
    id: int
    name: str
    target_amount: float
    current_saved_amount: float
    priority: int
    goal_type: str
    funding_strategy: str
    target_date: date | None
    is_active: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime


class GoalCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    target_amount: float = Field(gt=0)
    current_saved_amount: float = Field(default=0, ge=0)
    priority: int = Field(default=3, ge=1)
    goal_type: str = Field(default="lifestyle", min_length=1, max_length=50)
    funding_strategy: str = Field(default="priority", min_length=1, max_length=50)
    target_date: date | None = None
    is_active: bool = True
    notes: str | None = None


class GoalUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    target_amount: float | None = Field(default=None, gt=0)
    current_saved_amount: float | None = Field(default=None, ge=0)
    priority: int | None = Field(default=None, ge=1)
    goal_type: str | None = Field(default=None, min_length=1, max_length=50)
    funding_strategy: str | None = Field(default=None, min_length=1, max_length=50)
    target_date: date | None = None
    is_active: bool | None = None
    notes: str | None = None
