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
