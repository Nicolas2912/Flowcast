from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from io import StringIO
from typing import Any

from app.core.errors import ImportValidationError


REQUIRED_COLUMNS = {
    "Transaktionstyp",
    "Buchungsdatum",
    "Betrag",
    "Zahlungsempfänger",
    "Verwendungszweck",
    "Beschreibung",
    "Kontonummer",
    "Kontoname",
}

OPTIONAL_COLUMNS = {
    "Karteneinsatz",
    "IBAN",
    "BIC",
    "Kategorie",
    "Unterkategorie",
    "Bargeldabhebung",
}


@dataclass
class ParsedC24Row:
    row_number: int
    transaction_type: str
    booking_date: date
    value_date: date | None
    amount: Decimal
    payee: str | None
    purpose: str | None
    description: str | None
    account_number: str | None
    account_name: str | None
    raw_row: dict[str, str]

    @property
    def raw_row_json(self) -> str:
        return json.dumps(self.raw_row, ensure_ascii=False, sort_keys=True)


@dataclass
class RowParseFailure:
    row_number: int
    error: str
    raw_row: dict[str, str]


@dataclass
class ParsedC24File:
    delimiter: str
    rows: list[ParsedC24Row]
    failures: list[RowParseFailure]
    skipped_count: int


def detect_delimiter(content: str) -> str:
    first_line = content.splitlines()[0] if content.splitlines() else ""
    comma_count = first_line.count(",")
    semicolon_count = first_line.count(";")
    if semicolon_count > comma_count:
        return ";"
    return ","


def parse_german_amount(value: str) -> Decimal:
    cleaned = value.replace("\xa0", " ").replace("€", "").replace(".", "").replace(" ", "").strip()
    cleaned = cleaned.replace(",", ".")
    try:
        return Decimal(cleaned)
    except InvalidOperation as exc:
        raise ValueError(f"Invalid amount '{value}'.") from exc


def parse_c24_date(value: str) -> date | None:
    stripped = value.strip()
    if not stripped:
        return None
    for fmt in ("%d.%m.%Y", "%d.%m.%Y %H:%M"):
        try:
            return datetime.strptime(stripped, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"Invalid date '{value}'.")


def normalize_headers(fieldnames: list[str] | None) -> list[str]:
    if not fieldnames:
        raise ImportValidationError("The CSV file is empty.")
    return [fieldname.strip().replace("\ufeff", "") for fieldname in fieldnames]


def parse_c24_csv(content: str) -> ParsedC24File:
    if not content.strip():
        raise ImportValidationError("The CSV file is empty.")

    delimiter = detect_delimiter(content)
    reader = csv.DictReader(StringIO(content), delimiter=delimiter)
    headers = normalize_headers(reader.fieldnames)
    reader.fieldnames = headers

    missing_columns = sorted(REQUIRED_COLUMNS - set(headers))
    if missing_columns:
        raise ImportValidationError(
            "The CSV file is missing required columns.",
            [{"field": column, "message": "Missing required column."} for column in missing_columns],
        )

    rows: list[ParsedC24Row] = []
    failures: list[RowParseFailure] = []
    skipped_count = 0

    for row_index, raw_row in enumerate(reader, start=2):
        raw_row = {key.strip(): (value or "").strip() for key, value in raw_row.items() if key is not None}

        if not any(raw_row.values()):
            skipped_count += 1
            continue

        try:
            transaction_type = raw_row["Transaktionstyp"]
            booking_date = parse_c24_date(raw_row["Buchungsdatum"])
            amount = parse_german_amount(raw_row["Betrag"])
            value_date = parse_c24_date(raw_row.get("Karteneinsatz", ""))
            if booking_date is None:
                raise ValueError("Missing booking date.")

            rows.append(
                ParsedC24Row(
                    row_number=row_index,
                    transaction_type=transaction_type,
                    booking_date=booking_date,
                    value_date=value_date,
                    amount=amount,
                    payee=raw_row.get("Zahlungsempfänger") or None,
                    purpose=raw_row.get("Verwendungszweck") or None,
                    description=raw_row.get("Beschreibung") or None,
                    account_number=raw_row.get("Kontonummer") or None,
                    account_name=raw_row.get("Kontoname") or None,
                    raw_row=raw_row,
                )
            )
        except (KeyError, ValueError) as exc:
            failures.append(
                RowParseFailure(
                    row_number=row_index,
                    error=str(exc),
                    raw_row=raw_row,
                )
            )

    return ParsedC24File(
        delimiter=delimiter,
        rows=rows,
        failures=failures,
        skipped_count=skipped_count,
    )
