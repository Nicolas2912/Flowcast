from pathlib import Path

from app.db.session import SessionLocal
from app.models.import_batch import ImportBatch
from app.models.import_failure import ImportFailure
from app.models.transaction import Transaction
from app.services.import_service import import_c24_csv


FIXTURES_DIR = Path(__file__).parent / "fixtures" / "c24"


def test_import_service_creates_batch_and_transactions():
    file_bytes = (FIXTURES_DIR / "sample_import.csv").read_bytes()

    with SessionLocal() as session:
        summary = import_c24_csv(
            session=session,
            filename="sample_import.csv",
            file_bytes=file_bytes,
            account_id=1,
            source_path="data/imports/sample_import.csv",
        )

        batches = session.query(ImportBatch).all()
        transactions = session.query(Transaction).all()
        category_names = {transaction.category.name for transaction in transactions}

    assert len(batches) == 1
    assert summary.inserted_count == 3
    assert summary.duplicate_count == 0
    assert summary.failed_count == 0
    assert len(transactions) == 3
    assert all(transaction.source_import_id == batches[0].id for transaction in transactions)
    assert transactions[0].raw_row_json
    assert category_names == {
        "Bonus & Erstattung",
        "Nebenkosten",
        "Supermarkt",
    }
    assert all(transaction.category_assignment_method == "import" for transaction in transactions)


def test_import_service_skips_duplicates_for_same_file_and_overlap():
    first_file = (FIXTURES_DIR / "sample_import.csv").read_bytes()
    second_file = (FIXTURES_DIR / "sample_overlap.csv").read_bytes()

    with SessionLocal() as session:
        first_summary = import_c24_csv(
            session=session,
            filename="sample_import.csv",
            file_bytes=first_file,
            account_id=1,
        )
        second_summary = import_c24_csv(
            session=session,
            filename="sample_overlap.csv",
            file_bytes=second_file,
            account_id=1,
        )

        transactions = session.query(Transaction).all()

    assert first_summary.inserted_count == 3
    assert second_summary.inserted_count == 1
    assert second_summary.duplicate_count == 1
    assert len(transactions) == 4


def test_import_service_updates_category_for_duplicate_without_assignment():
    file_bytes = (FIXTURES_DIR / "sample_import.csv").read_bytes()

    with SessionLocal() as session:
        import_c24_csv(
            session=session,
            filename="sample_import.csv",
            file_bytes=file_bytes,
            account_id=1,
        )
        first_transaction = session.query(Transaction).first()
        first_transaction.category_id = None
        first_transaction.category_assignment_method = None
        session.commit()

        summary = import_c24_csv(
            session=session,
            filename="sample_import.csv",
            file_bytes=file_bytes,
            account_id=1,
        )
        session.refresh(first_transaction)
        category_id = first_transaction.category_id
        assignment_method = first_transaction.category_assignment_method

    assert summary.inserted_count == 0
    assert summary.duplicate_count == 3
    assert category_id is not None
    assert assignment_method == "import"


def test_import_service_persists_row_failures():
    invalid_file = (FIXTURES_DIR / "sample_invalid_row.csv").read_bytes()

    with SessionLocal() as session:
        summary = import_c24_csv(
            session=session,
            filename="sample_invalid_row.csv",
            file_bytes=invalid_file,
            account_id=1,
        )
        failures = session.query(ImportFailure).all()

    assert summary.inserted_count == 1
    assert summary.failed_count == 1
    assert len(failures) == 1
    assert failures[0].raw_row_json
