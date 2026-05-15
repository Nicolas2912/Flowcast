from datetime import date

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.category import Category
from app.models.transaction import Transaction
from app.services.spending_assumption_service import recalculate_spending_assumptions


def _category_id(session, name: str) -> int:
    return session.scalar(select(Category.id).where(Category.name == name))


def test_spending_assumptions_use_last_three_complete_months_and_exclusions():
    with SessionLocal() as session:
        supermarket_id = _category_id(session, "Supermarkt")
        shopping_id = _category_id(session, "Shopping")

        session.add_all(
            [
                Transaction(
                    id="grocery-feb",
                    account_id=1,
                    booking_date=date(2026, 2, 10),
                    amount=-100.0,
                    currency="EUR",
                    payee="Supermarket",
                    purpose="Groceries",
                    category_id=supermarket_id,
                ),
                Transaction(
                    id="grocery-mar",
                    account_id=1,
                    booking_date=date(2026, 3, 10),
                    amount=-200.0,
                    currency="EUR",
                    payee="Supermarket",
                    purpose="Groceries",
                    category_id=supermarket_id,
                ),
                Transaction(
                    id="grocery-apr",
                    account_id=1,
                    booking_date=date(2026, 4, 10),
                    amount=-300.0,
                    currency="EUR",
                    payee="Supermarket",
                    purpose="Groceries",
                    category_id=supermarket_id,
                ),
                Transaction(
                    id="grocery-may",
                    account_id=1,
                    booking_date=date(2026, 5, 5),
                    amount=-999.0,
                    currency="EUR",
                    payee="Supermarket",
                    purpose="Current month",
                    category_id=supermarket_id,
                ),
                Transaction(
                    id="shopping-feb",
                    account_id=1,
                    booking_date=date(2026, 2, 6),
                    amount=-50.0,
                    currency="EUR",
                    payee="Store",
                    purpose="Shopping",
                    category_id=shopping_id,
                ),
                Transaction(
                    id="shopping-mar",
                    account_id=1,
                    booking_date=date(2026, 3, 6),
                    amount=-50.0,
                    currency="EUR",
                    payee="Store",
                    purpose="Shopping",
                    category_id=shopping_id,
                ),
                Transaction(
                    id="shopping-apr",
                    account_id=1,
                    booking_date=date(2026, 4, 6),
                    amount=-50.0,
                    currency="EUR",
                    payee="Store",
                    purpose="Shopping",
                    category_id=shopping_id,
                ),
                Transaction(
                    id="laptop-apr",
                    account_id=1,
                    booking_date=date(2026, 4, 20),
                    amount=-1400.0,
                    currency="EUR",
                    payee="Apple",
                    purpose="Laptop",
                    category_id=shopping_id,
                    is_excluded_from_forecast=True,
                ),
            ]
        )
        session.commit()

        snapshots = recalculate_spending_assumptions(session=session, reference_date=date(2026, 5, 14))

    by_name = {snapshot.assumption.category.name: snapshot for snapshot in snapshots}
    assert by_name["Supermarkt"].baseline_months == ["2026-02", "2026-03", "2026-04"]
    assert by_name["Supermarkt"].assumption.auto_monthly_amount == 200.0
    assert by_name["Supermarkt"].assumption.effective_monthly_amount == 200.0
    assert by_name["Shopping"].assumption.auto_monthly_amount == 50.0
    assert by_name["Shopping"].confidence == "high"


def test_spending_assumptions_support_manual_override_and_revert(client):
    with SessionLocal() as session:
        supermarket_id = _category_id(session, "Supermarkt")
        session.add_all(
            [
                Transaction(
                    id="groceries-mar",
                    account_id=1,
                    booking_date=date(2026, 3, 5),
                    amount=-120.0,
                    currency="EUR",
                    payee="Store",
                    purpose="Groceries",
                    category_id=supermarket_id,
                ),
                Transaction(
                    id="groceries-apr",
                    account_id=1,
                    booking_date=date(2026, 4, 5),
                    amount=-180.0,
                    currency="EUR",
                    payee="Store",
                    purpose="Groceries",
                    category_id=supermarket_id,
                ),
            ]
        )
        session.commit()

    assumptions_response = client.post("/api/v1/spending-assumptions/recalculate")
    assert assumptions_response.status_code == 200
    supermarket = next(item for item in assumptions_response.json() if item["category_name"] == "Supermarkt")
    assert supermarket["confidence"] == "low"

    override_response = client.patch(
        f"/api/v1/spending-assumptions/{supermarket['id']}",
        json={"manual_monthly_amount": 250.0},
    )
    assert override_response.status_code == 200
    overridden = override_response.json()
    assert overridden["calculation_method"] == "manual_override"
    assert overridden["manual_monthly_amount"] == 250.0
    assert overridden["effective_monthly_amount"] == 250.0

    revert_response = client.patch(
        f"/api/v1/spending-assumptions/{supermarket['id']}",
        json={"revert_to_automatic": True},
    )
    assert revert_response.status_code == 200
    reverted = revert_response.json()
    assert reverted["calculation_method"] == "automatic"
    assert reverted["manual_monthly_amount"] is None
    assert reverted["effective_monthly_amount"] == reverted["auto_monthly_amount"]


def test_transaction_forecast_settings_endpoint_updates_exclusion_flag(client):
    with SessionLocal() as session:
        supermarket_id = _category_id(session, "Supermarkt")
        session.add(
            Transaction(
                id="exclude-me",
                account_id=1,
                booking_date=date(2026, 4, 8),
                amount=-75.0,
                currency="EUR",
                payee="Store",
                purpose="One-off",
                category_id=supermarket_id,
            )
        )
        session.commit()

    response = client.patch(
        "/api/v1/transactions/exclude-me/forecast-settings",
        json={"is_excluded_from_forecast": True},
    )
    assert response.status_code == 200
    assert response.json()["is_excluded_from_forecast"] is True
