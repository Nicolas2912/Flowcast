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


def test_merchant_rules_support_exact_contains_regex_priority_and_inactive(client):
    _import_sample_transactions()
    categories = client.get("/api/v1/categories").json()
    utility_id = next(category["id"] for category in categories if category["name"] == "Nebenkosten")
    supermarket_id = next(category["id"] for category in categories if category["name"] == "Supermarkt")
    income_id = next(category["id"] for category in categories if category["name"] == "Bonus & Erstattung")
    shopping_id = next(category["id"] for category in categories if category["name"] == "Shopping")

    exact_rule = client.post(
        "/api/v1/merchant-rules",
        json={
            "name": "Mainova exact",
            "pattern_type": "exact",
            "pattern": "Mainova",
            "category_id": utility_id,
            "priority": 20,
        },
    )
    assert exact_rule.status_code == 201

    contains_rule = client.post(
        "/api/v1/merchant-rules",
        json={
            "name": "Breakfast contains",
            "pattern_type": "contains",
            "pattern": "frühstück",
            "category_id": shopping_id,
            "priority": 30,
        },
    )
    assert contains_rule.status_code == 201

    higher_priority_contains = client.post(
        "/api/v1/merchant-rules",
        json={
            "name": "Bakery contains",
            "pattern_type": "contains",
            "pattern": "bäckerei",
            "category_id": supermarket_id,
            "priority": 10,
        },
    )
    assert higher_priority_contains.status_code == 201

    regex_rule = client.post(
        "/api/v1/merchant-rules",
        json={
            "name": "Reply regex",
            "pattern_type": "regex",
            "pattern": "reply\\s+gmbh",
            "category_id": income_id,
            "priority": 5,
        },
    )
    assert regex_rule.status_code == 201

    inactive_rule = client.post(
        "/api/v1/merchant-rules",
        json={
            "name": "Inactive Mainova",
            "pattern_type": "contains",
            "pattern": "mainova",
            "category_id": shopping_id,
            "priority": 1,
            "is_active": False,
        },
    )
    assert inactive_rule.status_code == 201

    run_response = client.post("/api/v1/merchant-rules/apply")
    assert run_response.status_code == 200
    summary = run_response.json()
    assert summary["matched_count"] == 3
    assert summary["updated_count"] == 3

    transactions = client.get("/api/v1/transactions").json()["items"]
    by_payee = {transaction["payee"]: transaction for transaction in transactions}
    assert by_payee["Mainova"]["category_name"] == "Nebenkosten"
    assert by_payee["Mainova"]["category_assignment_method"] == "rule"
    assert by_payee["Bäckerei Küßner"]["category_name"] == "Supermarkt"
    assert by_payee["4brands Reply GmbH Co."]["category_name"] == "Bonus & Erstattung"

    rules = client.get("/api/v1/merchant-rules")
    assert rules.status_code == 200
    assert len(rules.json()) == 5


def test_invalid_regex_is_rejected_and_manual_choice_is_preserved(client):
    _import_sample_transactions()
    categories = client.get("/api/v1/categories").json()
    supermarket_id = next(category["id"] for category in categories if category["name"] == "Supermarkt")
    reisen_id = next(category["id"] for category in categories if category["name"] == "Reisen")

    invalid_response = client.post(
        "/api/v1/merchant-rules",
        json={
            "name": "Broken regex",
            "pattern_type": "regex",
            "pattern": "(",
            "category_id": supermarket_id,
        },
    )
    assert invalid_response.status_code == 422
    assert invalid_response.json()["error"]["code"] == "domain_validation_error"

    bakery_transaction = next(
        item for item in client.get("/api/v1/transactions").json()["items"] if item["payee"] == "Bäckerei Küßner"
    )
    manual_response = client.patch(
        f"/api/v1/transactions/{bakery_transaction['id']}/category",
        json={"category_id": reisen_id},
    )
    assert manual_response.status_code == 200

    create_rule = client.post(
        "/api/v1/merchant-rules",
        json={
            "name": "Bakery auto",
            "pattern_type": "contains",
            "pattern": "bäckerei",
            "category_id": supermarket_id,
            "priority": 1,
        },
    )
    assert create_rule.status_code == 201

    run_response = client.post("/api/v1/merchant-rules/apply")
    assert run_response.status_code == 200

    refreshed = next(
        item for item in client.get("/api/v1/transactions").json()["items"] if item["id"] == bakery_transaction["id"]
    )
    assert refreshed["category_name"] == "Reisen"
    assert refreshed["category_assignment_method"] == "manual"


def test_merchant_rules_can_be_updated_disabled_and_deleted(client):
    _import_sample_transactions()
    categories = client.get("/api/v1/categories").json()
    utility_id = next(category["id"] for category in categories if category["name"] == "Nebenkosten")
    travel_id = next(category["id"] for category in categories if category["name"] == "Reisen")

    create_response = client.post(
        "/api/v1/merchant-rules",
        json={
            "name": "Mainova draft",
            "pattern_type": "contains",
            "pattern": "mainova",
            "category_id": utility_id,
            "priority": 10,
        },
    )
    assert create_response.status_code == 201
    rule = create_response.json()

    update_response = client.patch(
        f"/api/v1/merchant-rules/{rule['id']}",
        json={
            "name": "Mainova disabled",
            "category_id": travel_id,
            "priority": 25,
            "is_active": False,
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "Mainova disabled"
    assert updated["category_name"] == "Reisen"
    assert updated["is_active"] is False

    delete_response = client.delete(f"/api/v1/merchant-rules/{rule['id']}")
    assert delete_response.status_code == 204
    assert client.get("/api/v1/merchant-rules").json() == []
