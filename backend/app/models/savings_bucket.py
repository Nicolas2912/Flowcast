from __future__ import annotations

from sqlalchemy import Boolean, Float, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SavingsBucket(Base):
    __tablename__ = "savings_buckets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    bucket_type: Mapped[str] = mapped_column(String(50), nullable=False)
    current_amount: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    target_amount: Mapped[float | None] = mapped_column(Float)
    monthly_contribution: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    priority: Mapped[int] = mapped_column(Integer, nullable=False)
    is_protected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    allow_scenario_withdrawal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
