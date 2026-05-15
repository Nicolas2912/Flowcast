from pathlib import Path
from decimal import Decimal

import pytest

from app.core.errors import ImportValidationError
from app.importers.c24_importer import parse_c24_csv


FIXTURES_DIR = Path(__file__).parent / "fixtures" / "c24"


def test_parse_c24_csv_handles_comma_export_with_umlauts():
    parsed = parse_c24_csv((FIXTURES_DIR / "sample_import.csv").read_text(encoding="utf-8"))

    assert parsed.delimiter == ","
    assert parsed.skipped_count == 0
    assert len(parsed.failures) == 0
    assert len(parsed.rows) == 3
    assert parsed.rows[1].payee == "Bäckerei Küßner"
    assert parsed.rows[1].amount == Decimal("-47.12")
    assert parsed.rows[1].value_date.isoformat() == "2026-05-13"


def test_parse_c24_csv_handles_semicolon_export_and_collects_failures():
    parsed = parse_c24_csv((FIXTURES_DIR / "sample_invalid_row.csv").read_text(encoding="utf-8"))

    assert parsed.delimiter == ";"
    assert len(parsed.rows) == 1
    assert len(parsed.failures) == 1
    assert "Invalid date" in parsed.failures[0].error or "Invalid amount" in parsed.failures[0].error


def test_parse_c24_csv_rejects_missing_required_columns():
    with pytest.raises(ImportValidationError) as exc_info:
        parse_c24_csv("Buchungsdatum,Betrag\n15.05.2026,\"-10,00 €\"\n")

    assert exc_info.value.code == "import_validation_error"
    assert exc_info.value.details
