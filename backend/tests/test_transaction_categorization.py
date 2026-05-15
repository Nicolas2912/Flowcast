from pathlib import Path

from app.db.session import SessionLocal
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


def test_manual_and_bulk_categorization_persist(client):
    _import_sample_transactions()
    categories = client.get("/api/v1/categories").json()
    supermarket_id = next(category["id"] for category in categories if category["name"] == "Supermarkt")
    reisen_id = next(category["id"] for category in categories if category["name"] == "Reisen")

    transactions = client.get("/api/v1/transactions").json()["items"]
    bakery_transaction = next(item for item in transactions if item["payee"] == "Bäckerei Küßner")

    single_response = client.patch(
        f"/api/v1/transactions/{bakery_transaction['id']}/category",
        json={"category_id": supermarket_id},
    )
    assert single_response.status_code == 200
    assert single_response.json()["category_name"] == "Supermarkt"
    assert single_response.json()["category_assignment_method"] == "manual"

    remaining_ids = [item["id"] for item in transactions if item["id"] != bakery_transaction["id"]]
    bulk_response = client.post(
        "/api/v1/transactions/bulk-category",
        json={"transaction_ids": remaining_ids, "category_id": reisen_id},
    )
    assert bulk_response.status_code == 200
    assert bulk_response.json()["updated_count"] == 2

    refreshed = client.get("/api/v1/transactions").json()["items"]
    by_id = {item["id"]: item for item in refreshed}
    assert by_id[bakery_transaction["id"]]["category_name"] == "Supermarkt"
    assert all(by_id[transaction_id]["category_name"] == "Reisen" for transaction_id in remaining_ids)
    assert all(by_id[transaction_id]["category_assignment_method"] == "manual" for transaction_id in remaining_ids)
