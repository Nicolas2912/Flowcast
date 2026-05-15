from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    behavior_type: Mapped[str] = mapped_column(String(50), nullable=False)
    is_essential: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_variable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_income: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_saving: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)

    parent = relationship("Category", remote_side=[id], backref="children")
