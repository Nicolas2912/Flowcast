from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import utc_now_naive
from app.db.base import Base


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_path: Mapped[str | None] = mapped_column(String(500))
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="c24")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")
    delimiter: Mapped[str | None] = mapped_column(String(5))
    file_hash: Mapped[str | None] = mapped_column(String(128))
    row_checksum_summary: Mapped[str | None] = mapped_column(String(128))
    imported_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=utc_now_naive)
    transaction_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    inserted_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    skipped_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_summary: Mapped[str | None] = mapped_column(Text)

    failures = relationship("ImportFailure", back_populates="import_batch", cascade="all, delete-orphan")
