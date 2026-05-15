from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ImportValidationError, NotFoundError
from app.core.time import utc_now_naive
from app.importers.c24_importer import ParsedC24File, RowParseFailure, parse_c24_csv
from app.models.account import Account
from app.models.import_batch import ImportBatch
from app.models.import_failure import ImportFailure
from app.models.transaction import Transaction


@dataclass
class ImportSummary:
    import_batch: ImportBatch
    inserted_count: int
    duplicate_count: int
    skipped_count: int
    failed_count: int
    failures: list[ImportFailure]


def decode_csv_bytes(file_bytes: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "cp1252"):
        try:
            return file_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ImportValidationError("The CSV file encoding could not be read.")


def build_transaction_fingerprint(account_id: int, parsed_row_json: str, booking_date: str, amount: str, payee: str, purpose: str) -> str:
    source = "|".join([str(account_id), booking_date, amount, payee, purpose, parsed_row_json])
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def import_c24_csv(
    *,
    session: Session,
    filename: str,
    file_bytes: bytes,
    account_id: int,
    source_path: str | None = None,
) -> ImportSummary:
    account = session.get(Account, account_id)
    if account is None:
        raise NotFoundError("Account", account_id)

    content = decode_csv_bytes(file_bytes)
    parsed_file = parse_c24_csv(content)
    file_hash = hashlib.sha256(file_bytes).hexdigest()
    row_checksum_summary = hashlib.sha256(
        "".join(row.raw_row_json for row in parsed_file.rows).encode("utf-8")
    ).hexdigest()

    import_batch = ImportBatch(
        source_filename=filename,
        source_path=source_path,
        provider="c24",
        status="processing",
        delimiter=parsed_file.delimiter,
        file_hash=file_hash,
        row_checksum_summary=row_checksum_summary,
        imported_at=utc_now_naive(),
        transaction_count=len(parsed_file.rows),
        skipped_count=parsed_file.skipped_count,
    )
    session.add(import_batch)
    session.flush()

    duplicate_count = 0
    inserted_count = 0
    failures: list[ImportFailure] = []

    for row_failure in parsed_file.failures:
        failures.append(_build_import_failure(import_batch.id, row_failure))

    for parsed_row in parsed_file.rows:
        fingerprint = build_transaction_fingerprint(
            account_id,
            parsed_row.raw_row_json,
            parsed_row.booking_date.isoformat(),
            str(parsed_row.amount),
            parsed_row.payee or "",
            parsed_row.purpose or "",
        )

        if session.get(Transaction, fingerprint) is not None:
            duplicate_count += 1
            continue

        normalized_text = " | ".join(
            part for part in [parsed_row.transaction_type, parsed_row.description or "", parsed_row.purpose or ""] if part
        )

        session.add(
            Transaction(
                id=fingerprint,
                account_id=account_id,
                booking_date=parsed_row.booking_date,
                value_date=parsed_row.value_date,
                amount=float(parsed_row.amount),
                payee=parsed_row.payee,
                purpose=parsed_row.purpose,
                original_text=parsed_row.transaction_type,
                normalized_text=normalized_text,
                source_row_number=parsed_row.row_number,
                raw_row_json=parsed_row.raw_row_json,
                source_import_id=import_batch.id,
            )
        )
        inserted_count += 1

    session.add_all(failures)
    import_batch.status = "completed_with_errors" if failures else "completed"
    import_batch.inserted_count = inserted_count
    import_batch.duplicate_count = duplicate_count
    import_batch.failed_count = len(failures)
    import_batch.error_summary = (
        json.dumps([failure.error_message for failure in failures], ensure_ascii=False)
        if failures
        else None
    )
    session.commit()
    session.refresh(import_batch)

    return ImportSummary(
        import_batch=import_batch,
        inserted_count=inserted_count,
        duplicate_count=duplicate_count,
        skipped_count=parsed_file.skipped_count,
        failed_count=len(failures),
        failures=failures,
    )


def list_import_batches(*, session: Session) -> list[ImportBatch]:
    return session.scalars(select(ImportBatch).order_by(ImportBatch.imported_at.desc())).all()


def _build_import_failure(import_batch_id: int, row_failure: RowParseFailure) -> ImportFailure:
    return ImportFailure(
        import_batch_id=import_batch_id,
        row_number=row_failure.row_number,
        error_message=row_failure.error,
        raw_row_json=json.dumps(row_failure.raw_row, ensure_ascii=False, sort_keys=True),
    )
