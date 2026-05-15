from datetime import date

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.account import Account
from app.models.category import Category
from app.models.goal import Goal
from app.models.planned_payment import PlannedPayment
from app.models.savings_bucket import SavingsBucket
from app.models.transaction import Transaction
from app.services.forecast_service import (
    ForecastScenarioConfig,
    ScenarioCashAdjustment,
    build_custom_scenario_comparison,
    build_default_forecast,
)
from app.services.savings_bucket_service import EMERGENCY_FUND_BUCKET_TYPE, ETF_BUCKET_TYPE


def _category_id(session, name: str) -> int:
    return session.scalar(select(Category.id).where(Category.name == name))


def _seed_forecast_inputs() -> None:
    with SessionLocal() as session:
        account = session.get(Account, 1)
        assert account is not None
        account.current_balance_manual = 5000.0

        supermarkt_id = _category_id(session, "Supermarkt")
        miete_id = _category_id(session, "Miete")
        gehalt_id = _category_id(session, "Gehalt")
        assert supermarkt_id is not None
        assert miete_id is not None
        assert gehalt_id is not None

        session.add_all(
            [
                Transaction(
                    id="salary-feb",
                    account_id=1,
                    booking_date=date(2026, 2, 27),
                    amount=3000.0,
                    currency="EUR",
                    payee="Employer",
                    purpose="Salary",
                    category_id=gehalt_id,
                ),
                Transaction(
                    id="salary-mar",
                    account_id=1,
                    booking_date=date(2026, 3, 27),
                    amount=3000.0,
                    currency="EUR",
                    payee="Employer",
                    purpose="Salary",
                    category_id=gehalt_id,
                ),
                Transaction(
                    id="salary-apr",
                    account_id=1,
                    booking_date=date(2026, 4, 27),
                    amount=3000.0,
                    currency="EUR",
                    payee="Employer",
                    purpose="Salary",
                    category_id=gehalt_id,
                ),
                Transaction(
                    id="grocery-feb",
                    account_id=1,
                    booking_date=date(2026, 2, 10),
                    amount=-300.0,
                    currency="EUR",
                    payee="Market",
                    purpose="Groceries",
                    category_id=supermarkt_id,
                ),
                Transaction(
                    id="grocery-mar",
                    account_id=1,
                    booking_date=date(2026, 3, 10),
                    amount=-300.0,
                    currency="EUR",
                    payee="Market",
                    purpose="Groceries",
                    category_id=supermarkt_id,
                ),
                Transaction(
                    id="grocery-apr",
                    account_id=1,
                    booking_date=date(2026, 4, 10),
                    amount=-300.0,
                    currency="EUR",
                    payee="Market",
                    purpose="Groceries",
                    category_id=supermarkt_id,
                ),
            ]
        )
        session.add(
            PlannedPayment(
                account_id=1,
                name="Rent",
                amount=1000.0,
                payment_type="rent",
                frequency="monthly",
                day_of_month=3,
                category_id=miete_id,
                is_active=True,
            )
        )
        session.add(
            Goal(
                name="Trip",
                target_amount=1200.0,
                current_saved_amount=200.0,
                priority=1,
                goal_type="travel",
                funding_strategy="priority",
                is_active=True,
            )
        )
        session.commit()

        etf_bucket = session.scalar(select(SavingsBucket).where(SavingsBucket.bucket_type == ETF_BUCKET_TYPE))
        emergency_bucket = session.scalar(
            select(SavingsBucket).where(SavingsBucket.bucket_type == EMERGENCY_FUND_BUCKET_TYPE)
        )
        assert etf_bucket is not None
        assert emergency_bucket is not None
        etf_bucket.current_amount = 500.0
        etf_bucket.monthly_contribution = 200.0
        emergency_bucket.current_amount = 1000.0
        emergency_bucket.monthly_contribution = 100.0
        session.commit()


def test_forecast_service_returns_daily_points_scenarios_and_goal_dates():
    _seed_forecast_inputs()

    with SessionLocal() as session:
        scenarios = build_default_forecast(session=session, reference_date=date(2026, 5, 15))

    by_id = {scenario.scenario_id: scenario for scenario in scenarios}
    assert set(by_id) == {"optimistic", "expected", "conservative"}

    expected_90 = next(h for h in by_id["expected"].horizons if h.days == 90)
    optimistic_365 = next(h for h in by_id["optimistic"].horizons if h.days == 365)
    expected_365 = next(h for h in by_id["expected"].horizons if h.days == 365)
    conservative_365 = next(h for h in by_id["conservative"].horizons if h.days == 365)

    assert len(expected_90.points) == 90
    assert expected_90.points[0].date == date(2026, 5, 15)
    rent_dip = next(point for point in expected_365.points if point.date == date(2026, 6, 3))
    day_before_rent = next(point for point in expected_365.points if point.date == date(2026, 6, 2))
    salary_bump = next(point for point in expected_365.points if point.date == date(2026, 5, 27))
    day_before_salary = next(point for point in expected_365.points if point.date == date(2026, 5, 26))
    assert rent_dip.balance < day_before_rent.balance
    assert salary_bump.balance > day_before_salary.balance

    assert optimistic_365.risk.ending_balance > expected_365.risk.ending_balance > conservative_365.risk.ending_balance
    trip_goal = expected_365.goals[0]
    assert trip_goal.goal_name == "Trip"
    assert trip_goal.affordability_date is not None
    assert trip_goal.projected_saved_amount >= trip_goal.target_amount


def test_custom_scenario_comparison_shows_tradeoff_costs():
    _seed_forecast_inputs()

    with SessionLocal() as session:
            comparison = build_custom_scenario_comparison(
                session=session,
                reference_date=date(2026, 5, 15),
                config=ForecastScenarioConfig(
                    name="Stress case",
                    variable_spending_multiplier=1.2,
                    etf_monthly_contribution_override=350.0,
                    emergency_fund_monthly_contribution_override=200.0,
                    one_off_expenses=(ScenarioCashAdjustment(date=date(2026, 7, 1), amount=900.0, label="Laptop"),),
                ),
            )

    assert comparison.ending_balance_delta_12m < 0
    assert comparison.available_balance_delta_12m < 0
    assert comparison.base.label == "Base case"
    assert comparison.scenario.label == "Stress case"


def test_forecast_refresh_pipeline_updates_after_excluding_transaction(client):
    _seed_forecast_inputs()
    with SessionLocal() as session:
        supermarkt_id = _category_id(session, "Supermarkt")
        session.add(
            Transaction(
                id="large-apr-oneoff",
                account_id=1,
                booking_date=date(2026, 4, 20),
                amount=-1200.0,
                currency="EUR",
                payee="Electronics",
                purpose="One-off purchase",
                category_id=supermarkt_id,
            )
        )
        session.commit()

    before = client.get("/api/v1/forecast")
    assert before.status_code == 200
    before_expected = next(item for item in before.json()["scenarios"] if item["scenario_id"] == "expected")
    before_ending = next(item for item in before_expected["horizons"] if item["days"] == 365)["risk"]["ending_balance"]

    update = client.patch(
        "/api/v1/transactions/large-apr-oneoff/forecast-settings",
        json={"is_excluded_from_forecast": True},
    )
    assert update.status_code == 200

    after = client.get("/api/v1/forecast")
    assert after.status_code == 200
    after_expected = next(item for item in after.json()["scenarios"] if item["scenario_id"] == "expected")
    after_ending = next(item for item in after_expected["horizons"] if item["days"] == 365)["risk"]["ending_balance"]

    assert after_ending > before_ending


def test_goal_api_supports_create_update_and_listing(client):
    create_response = client.post(
        "/api/v1/goals",
        json={
            "name": "New laptop",
            "target_amount": 1800,
            "current_saved_amount": 300,
            "priority": 2,
            "goal_type": "purchase",
            "funding_strategy": "priority",
            "target_date": "2026-12-31",
            "notes": "Work machine",
        },
    )

    assert create_response.status_code == 201
    created = create_response.json()
    assert created["name"] == "New laptop"
    assert created["current_saved_amount"] == 300

    update_response = client.patch(
        f"/api/v1/goals/{created['id']}",
        json={"priority": 1, "funding_strategy": "parallel"},
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["priority"] == 1
    assert updated["funding_strategy"] == "parallel"

    list_response = client.get("/api/v1/goals")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1
