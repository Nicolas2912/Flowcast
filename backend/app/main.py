from __future__ import annotations

from contextvars import ContextVar
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from app.api.routes import router
from app.core.config import get_settings
from app.core.errors import FlowcastError
from app.schemas.common import ErrorResponse


request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


def build_error_response(
    *,
    code: str,
    message: str,
    status_code: int,
    details: list[dict[str, object]],
) -> JSONResponse:
    payload = ErrorResponse(
        error={
            "code": code,
            "message": message,
            "details": details,
            "request_id": request_id_ctx.get(),
        }
    )
    return JSONResponse(status_code=status_code, content=payload.model_dump())


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=settings.app_version)

    @app.middleware("http")
    async def attach_request_id(request: Request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid4()))
        request_id_ctx.set(request_id)
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response

    @app.exception_handler(FlowcastError)
    async def handle_flowcast_error(_: Request, exc: FlowcastError) -> JSONResponse:
        return build_error_response(
            code=exc.code,
            message=exc.message,
            status_code=exc.status_code,
            details=exc.details,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        details = [
            {
                "field": ".".join(str(part) for part in error["loc"]),
                "message": error["msg"],
            }
            for error in exc.errors()
        ]
        return build_error_response(
            code="validation_error",
            message="Request validation failed.",
            status_code=422,
            details=details,
        )

    @app.exception_handler(SQLAlchemyError)
    async def handle_database_error(_: Request, __: SQLAlchemyError) -> JSONResponse:
        return build_error_response(
            code="database_error",
            message="The database request could not be completed.",
            status_code=500,
            details=[],
        )

    app.include_router(router, prefix=settings.api_prefix)
    return app


app = create_app()
