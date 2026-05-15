from __future__ import annotations

from datetime import date

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
        if self.frequency == "yearly" and (self.day_of_month is None or self.month_of_year is None):
            raise ValueError("day_of_month and month_of_year are required for yearly payments.")
        return self


class PlannedPaymentValidationResponse(BaseModel):
    accepted: bool
    normalized_frequency: str
    normalized_payment_type: str
