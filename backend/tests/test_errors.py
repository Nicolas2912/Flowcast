from app.db.session import SessionLocal
from app.models.import_batch import ImportBatch


def test_not_found_error_shape(client):
    response = client.get("/api/v1/categories/999")

    assert response.status_code == 404
    payload = response.json()["error"]
    assert payload["code"] == "not_found"
    assert payload["details"][0]["resource"] == "Category"
    assert payload["request_id"]


def test_validation_error_shape(client):
    response = client.post(
        "/api/v1/planned-payments/validate",
        json={
            "name": "Car insurance",
            "amount": -411.06,
            "frequency": "yearly",
            "payment_type": "insurance",
        },
    )

    assert response.status_code == 422
    payload = response.json()["error"]
    assert payload["code"] == "validation_error"
    assert payload["details"]


def test_import_validation_error_does_not_mutate_state(client):
    response = client.post(
        "/api/v1/imports/c24",
        files={"file": ("broken.csv", b"Transaktionstyp,Betrag\nLastschrift,\n", "text/csv")},
        data={"account_id": "1"},
    )

    assert response.status_code == 422
    payload = response.json()["error"]
    assert payload["code"] == "import_validation_error"
    assert payload["message"]
    with SessionLocal() as session:
        assert session.query(ImportBatch).count() == 0
