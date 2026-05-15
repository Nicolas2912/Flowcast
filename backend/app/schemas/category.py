from __future__ import annotations

from pydantic import BaseModel, Field


class CategoryCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: int | None = None
    behavior_type: str = Field(min_length=1, max_length=50)
    is_essential: bool = False
    is_variable: bool = False
    is_income: bool = False
    is_saving: bool = False
    is_excluded: bool = False
    sort_order: int = Field(default=100, ge=0, le=9999)


class CategoryUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    parent_id: int | None = None
    behavior_type: str | None = Field(default=None, min_length=1, max_length=50)
    is_essential: bool | None = None
    is_variable: bool | None = None
    is_income: bool | None = None
    is_saving: bool | None = None
    is_excluded: bool | None = None
    sort_order: int | None = Field(default=None, ge=0, le=9999)


class CategoryResponse(BaseModel):
    id: int
    name: str
    parent_id: int | None
    parent_name: str | None
    behavior_type: str
    is_essential: bool
    is_variable: bool
    is_income: bool
    is_saving: bool
    is_excluded: bool
    sort_order: int
