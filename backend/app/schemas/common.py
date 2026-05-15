from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class ErrorDetail(BaseModel):
    model_config = ConfigDict(extra="allow")

    field: str | None = None
    message: str | None = None
    resource: str | None = None
    identifier: str | None = None


class ErrorPayload(BaseModel):
    code: str
    message: str
    details: list[dict[str, Any]]
    request_id: str


class ErrorResponse(BaseModel):
    error: ErrorPayload
