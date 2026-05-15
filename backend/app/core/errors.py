from __future__ import annotations

from typing import Any


class FlowcastError(Exception):
    def __init__(
        self,
        *,
        code: str,
        message: str,
        status_code: int,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or []


class NotFoundError(FlowcastError):
    def __init__(self, resource: str, identifier: Any) -> None:
        super().__init__(
            code="not_found",
            message=f"{resource} '{identifier}' was not found.",
            status_code=404,
            details=[{"resource": resource, "identifier": str(identifier)}],
        )
