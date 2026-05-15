from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


PatternType = Literal["exact", "contains", "regex"]


class MerchantRuleCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    pattern_type: PatternType
    pattern: str = Field(min_length=1)
    category_id: int
    priority: int = Field(default=100, ge=0, le=9999)
    is_active: bool = True


class MerchantRuleUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    pattern_type: PatternType | None = None
    pattern: str | None = Field(default=None, min_length=1)
    category_id: int | None = None
    priority: int | None = Field(default=None, ge=0, le=9999)
    is_active: bool | None = None


class MerchantRuleResponse(BaseModel):
    id: int
    name: str
    pattern_type: PatternType
    pattern: str
    category_id: int
    category_name: str
    priority: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CategorizationRunResponse(BaseModel):
    processed_count: int
    matched_count: int
    updated_count: int
    cleared_count: int
