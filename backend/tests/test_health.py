from sqlalchemy import text

from app.db.session import SessionLocal
from app.seed import seed_defaults


def test_health_endpoint_returns_ok(client):
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["database"] == "ok"
    assert response.headers["x-request-id"]


def test_seed_is_idempotent():
    with SessionLocal() as session:
        seed_defaults(session)
        seed_defaults(session)

        accounts = session.execute(text("SELECT COUNT(*) FROM accounts")).scalar_one()
        categories = session.execute(text("SELECT COUNT(*) FROM categories")).scalar_one()

    assert accounts == 1
    assert categories == 25
