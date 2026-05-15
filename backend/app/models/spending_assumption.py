from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SpendingAssumption(Base):
    __tablename__ = "spending_assumptions"

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"), nullable=False, unique=True)
    calculation_method: Mapped[str] = mapped_column(String(50), nullable=False)
    auto_monthly_amount: Mapped[float | None] = mapped_column(Float)
    manual_monthly_amount: Mapped[float | None] = mapped_column(Float)
    effective_monthly_amount: Mapped[float] = mapped_column(Float, nullable=False)
    last_recalculated_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
