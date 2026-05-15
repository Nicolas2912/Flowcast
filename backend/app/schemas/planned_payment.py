from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator


class PlannedPaymentValidationRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    amount: float
    frequency: str
    payment_type: str
    exact_date: date | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    month_of_year: int | None = Field(default=None, ge=1, le=12)

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, value: float) -> float:
        if value == 0:
            raise ValueError("amount must not be 0.")
        return value

    @model_validator(mode="after")
    def validate_schedule(self) -> "PlannedPaymentValidationRequest":
        if self.frequency == "one_time" and self.exact_date is None:
            raise ValueError("exact_date is required for one_time payments.")
        if self.frequency == "monthly" and self.day_of_month is None:
            raise ValueError("day_of_month is required for monthly payments.")
        if self.frequency == "quarterly" and self.exact_date is None:
            raise ValueError("exact_date is required for quarterly payments.")
        if self.frequency == "yearly" and self.exact_date is None and (self.day_of_month is None or self.month_of_year is None):
            raise ValueError("Provide exact_date or day_of_month and month_of_year for yearly payments.")
        return self


class PlannedPaymentValidationResponse(BaseModel):
    accepted: bool
    normalized_frequency: str
    normalized_payment_type: str


class PlannedPaymentCreateRequest(BaseModel):
    account_id: int
    name: str = Field(min_length=1, max_length=255)
    amount: float
    frequency: str
    payment_type: str
    exact_date: date | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    month_of_year: int | None = Field(default=None, ge=1, le=12)
    category_id: int | None = None
    is_active: bool = True
    notes: str | None = None

    @field_validator("amount")
    @classmethod
    def validate_non_zero_amount(cls, value: float) -> float:
        if value == 0:
            raise ValueError("amount must not be 0.")
        return value


class PlannedPaymentUpdateRequest(BaseModel):
    account_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    amount: float | None = None
    frequency: str | None = None
    payment_type: str | None = None
    exact_date: date | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    month_of_year: int | None = Field(default=None, ge=1, le=12)
    category_id: int | None = None
    is_active: bool | None = None
    notes: str | None = None


class PlannedPaymentResponse(BaseModel):
    id: int
    account_id: int
    account_name: str
    name: str
    amount: float
    payment_type: str
    frequency: str
    exact_date: date | None
    day_of_month: int | None
    month_of_year: int | None
    category_id: int | None
    category_name: str | None
    is_active: bool
    notes: str | None
    next_charge_date: date | None
    monthly_equivalent: float
    created_at: datetime
    updated_at: datetime
