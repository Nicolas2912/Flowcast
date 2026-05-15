from datetime import date, datetime

from app.db.session import SessionLocal
from app.models.planned_payment import PlannedPayment
from app.services.planned_payment_service import compute_planned_payment_schedule


def test_planned_payment_api_supports_create_update_and_deactivate(client):
    create_response = client.post(
        "/api/v1/planned-payments",
        json={
            "account_id": 1,
            "name": "Car insurance",
            "amount": 822.12,
            "frequency": "yearly",
            "payment_type": "insurance",
            "exact_date": "2026-11-15",
            "category_id": 11,
            "notes": "Annual car policy",
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "Car insurance"
    assert created["frequency"] == "yearly"
    assert created["monthly_equivalent"] == 68.51
    assert created["next_charge_date"] == "2026-11-15"
    assert created["category_name"] == "Nebenkosten"

    quarterly_response = client.post(
        "/api/v1/planned-payments",
        json={
            "account_id": 1,
            "name": "GEZ",
            "amount": 55.08,
            "frequency": "quarterly",
            "payment_type": "broadcast_fee",
            "exact_date": "2026-07-15",
            "category_id": 11,
        },
    )
    assert quarterly_response.status_code == 201
    assert quarterly_response.json()["monthly_equivalent"] == 18.36

    update_response = client.patch(
        f"/api/v1/planned-payments/{created['id']}",
        json={"is_active": False},
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["is_active"] is False
    assert updated["next_charge_date"] is None

    list_response = client.get("/api/v1/planned-payments")
    assert list_response.status_code == 200
    items = list_response.json()
    assert len(items) == 2


def test_planned_payment_schedule_edge_cases():
    monthly = PlannedPayment(
        id=1,
        account_id=1,
        name="Rent",
        amount=780.0,
        payment_type="rent",
        frequency="monthly",
        day_of_month=31,
        is_active=True,
        created_at=datetime(2026, 1, 1),
        updated_at=datetime(2026, 1, 1),
    )
    monthly_schedule = compute_planned_payment_schedule(monthly, reference_date=date(2026, 2, 20))
    assert monthly_schedule.next_charge_date == date(2026, 2, 28)
    assert monthly_schedule.monthly_equivalent == 780.0

    quarterly = PlannedPayment(
        id=2,
        account_id=1,
        name="Trainerpauschale",
        amount=4.98,
        payment_type="fee",
        frequency="quarterly",
        exact_date=date(2026, 1, 15),
        is_active=True,
        created_at=datetime(2026, 1, 1),
        updated_at=datetime(2026, 1, 1),
    )
    quarterly_schedule = compute_planned_payment_schedule(quarterly, reference_date=date(2026, 5, 14))
    assert quarterly_schedule.next_charge_date == date(2026, 7, 15)
    assert quarterly_schedule.monthly_equivalent == 1.66

    yearly = PlannedPayment(
        id=3,
        account_id=1,
        name="Leap-year bill",
        amount=120.0,
        payment_type="subscription",
        frequency="yearly",
        exact_date=date(2024, 2, 29),
        is_active=True,
        created_at=datetime(2026, 1, 1),
        updated_at=datetime(2026, 1, 1),
    )
    yearly_schedule = compute_planned_payment_schedule(yearly, reference_date=date(2026, 1, 10))
    assert yearly_schedule.next_charge_date == date(2026, 2, 28)
    assert yearly_schedule.monthly_equivalent == 10.0

    one_time = PlannedPayment(
        id=4,
        account_id=1,
        name="Laptop",
        amount=1500.0,
        payment_type="purchase",
        frequency="one_time",
        exact_date=date(2026, 4, 1),
        is_active=True,
        created_at=datetime(2026, 1, 1),
        updated_at=datetime(2026, 1, 1),
    )
    one_time_schedule = compute_planned_payment_schedule(one_time, reference_date=date(2026, 5, 1))
    assert one_time_schedule.next_charge_date is None
    assert one_time_schedule.monthly_equivalent == 0.0


def test_planned_payment_validation_endpoint_accepts_quarterly(client):
    response = client.post(
        "/api/v1/planned-payments/validate",
        json={
            "name": "GEZ",
            "amount": 55.08,
            "frequency": "quarterly",
            "payment_type": "fee",
            "exact_date": "2026-07-15",
        },
    )

    assert response.status_code == 200
    assert response.json()["normalized_frequency"] == "quarterly"


def test_planned_payment_list_handles_existing_records(client):
    with SessionLocal() as session:
        session.add(
            PlannedPayment(
                account_id=1,
                name="Subscription",
                amount=12.99,
                payment_type="subscription",
                frequency="monthly",
                day_of_month=12,
                is_active=True,
            )
        )
        session.commit()

    response = client.get("/api/v1/planned-payments")
    assert response.status_code == 200
    assert response.json()[0]["monthly_equivalent"] == 12.99
