from sqlalchemy import text

from app.db.session import SessionLocal


def test_categories_seed_parent_child_structure(client):
    response = client.get("/api/v1/categories")

    assert response.status_code == 200
    categories = response.json()
    assert len(categories) == 25

    by_name = {category["name"]: category for category in categories}
    assert by_name["Gehalt"]["parent_name"] == "Einnahmen"
    assert by_name["Gehalt"]["behavior_type"] == "income"
    assert by_name["Supermarkt"]["is_variable"] is True
    assert by_name["Miete"]["behavior_type"] == "fixed_expense"
    assert by_name["Interne Umbuchung"]["behavior_type"] == "internal_transfer"
    assert by_name["Rueckerstattung"]["behavior_type"] == "refund"
    assert by_name["Ausgeschlossen"]["is_excluded"] is True


def test_can_create_and_update_category(client):
    categories = client.get("/api/v1/categories").json()
    everyday_id = next(category["id"] for category in categories if category["name"] == "Alltag")

    create_response = client.post(
        "/api/v1/categories",
        json={
            "name": "Haustiere",
            "parent_id": everyday_id,
            "behavior_type": "variable_expense",
            "is_variable": True,
            "sort_order": 35,
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["parent_name"] == "Alltag"
    assert created["is_variable"] is True

    update_response = client.patch(
        f"/api/v1/categories/{created['id']}",
        json={
            "name": "Haustierbedarf",
            "is_essential": True,
            "sort_order": 36,
        },
    )

    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["name"] == "Haustierbedarf"
    assert updated["is_essential"] is True
    assert updated["sort_order"] == 36


def test_category_name_must_stay_unique(client):
    response = client.post(
        "/api/v1/categories",
        json={
            "name": "Gehalt",
            "behavior_type": "income",
            "is_income": True,
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "domain_validation_error"


def test_seed_remains_idempotent_with_new_hierarchy():
    from app.seed import seed_defaults

    with SessionLocal() as session:
        seed_defaults(session)
        seed_defaults(session)
        categories = session.execute(text("SELECT COUNT(*) FROM categories")).scalar_one()

    assert categories == 25
