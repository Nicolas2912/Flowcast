from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    source_path: Mapped[str | None] = mapped_column(String(500))
    file_hash: Mapped[str | None] = mapped_column(String(128))
    imported_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    transaction_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
