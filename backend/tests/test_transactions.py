from datetime import date, timedelta
from pathlib import Path

from app.db.session import SessionLocal
from app.models.account import Account
from app.models.import_batch import ImportBatch
from app.models.transaction import Transaction
from app.services.import_service import import_c24_csv


FIXTURES_DIR = Path(__file__).parent / "fixtures" / "c24"


def _import_sample_transactions() -> None:
    file_bytes = (FIXTURES_DIR / "sample_import.csv").read_bytes()
    with SessionLocal() as session:
        import_c24_csv(
            session=session,
            filename="sample_import.csv",
            file_bytes=file_bytes,
            account_id=1,
        )


def test_transactions_endpoint_lists_filtered_paginated_rows(client):
    _import_sample_transactions()
    categories = client.get("/api/v1/categories").json()
    supermarket_id = next(category["id"] for category in categories if category["name"] == "Supermarkt")

    first_page = client.get("/api/v1/transactions?page=1&page_size=2")
    assert first_page.status_code == 200
    payload = first_page.json()
    assert payload["total"] == 3
    assert payload["page_size"] == 2
    assert payload["total_pages"] == 2
    assert len(payload["items"]) == 2
    assert payload["items"][0]["source_import_filename"] == "sample_import.csv"

    bakery_transaction = next(item for item in payload["items"] if item["payee"] == "Bäckerei Küßner")
    categorize_response = client.patch(
        f"/api/v1/transactions/{bakery_transaction['id']}/category",
        json={"category_id": supermarket_id},
    )
    assert categorize_response.status_code == 200
    assert categorize_response.json()["category_assignment_method"] == "manual"

    filtered = client.get("/api/v1/transactions?search=mainova&date_from=2026-05-14&date_to=2026-05-16")
    assert filtered.status_code == 200
    filtered_payload = filtered.json()
    assert filtered_payload["total"] == 1
    assert filtered_payload["items"][0]["payee"] == "Mainova"

    categorized = client.get(f"/api/v1/transactions?category_id={supermarket_id}")
    assert categorized.status_code == 200
    assert categorized.json()["total"] == 1

    uncategorized = client.get("/api/v1/transactions?uncategorized_only=true")
    assert uncategorized.status_code == 200
    assert uncategorized.json()["total"] == 2


def test_transactions_endpoint_handles_large_pagination_surface(client):
    with SessionLocal() as session:
        account = session.get(Account, 1)
        import_batch = ImportBatch(
            source_filename="bulk.csv",
            provider="c24",
            status="completed",
            transaction_count=5000,
            inserted_count=5000,
        )
        session.add(import_batch)
        session.flush()

        base_date = date(2026, 5, 1)
        for index in range(5000):
            session.add(
                Transaction(
                    id=f"bulk-{index}",
                    account_id=account.id,
                    booking_date=base_date + timedelta(days=index % 28),
                    amount=float(index) * -1,
                    currency="EUR",
                    payee=f"Merchant {index}",
                    purpose="Recurring debit",
                    original_text="Kartenzahlung",
                    normalized_text=f"merchant {index} recurring debit kartenzahlung",
                    source_import_id=import_batch.id,
                )
            )
        session.commit()

    response = client.get("/api/v1/transactions?page=20&page_size=250")
    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 5000
    assert payload["page"] == 20
    assert payload["page_size"] == 250
    assert payload["total_pages"] == 20
    assert len(payload["items"]) == 250
