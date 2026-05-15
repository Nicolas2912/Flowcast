from datetime import date

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.category import Category
from app.models.planned_payment import PlannedPayment
from app.models.savings_bucket import SavingsBucket
from app.models.spending_assumption import SpendingAssumption
from app.services.savings_bucket_service import (
    EMERGENCY_FUND_BUCKET_TYPE,
    ETF_BUCKET_TYPE,
    build_savings_plan_summary,
)


def test_savings_buckets_endpoint_creates_default_etf_and_notgroschen(client):
    response = client.get("/api/v1/savings-buckets")

    assert response.status_code == 200
    payload = response.json()
    assert [bucket["bucket_type"] for bucket in payload] == [EMERGENCY_FUND_BUCKET_TYPE, ETF_BUCKET_TYPE]

    emergency_bucket = payload[0]
    assert emergency_bucket["name"] == "Notgroschen"
    assert emergency_bucket["is_protected"] is True
    assert emergency_bucket["allow_scenario_withdrawal"] is True
    assert emergency_bucket["forecast_reserved_amount"] == 0

    etf_bucket = payload[1]
    assert etf_bucket["name"] == "ETF"
    assert etf_bucket["is_protected"] is True
    assert etf_bucket["allow_scenario_withdrawal"] is False


def test_savings_summary_uses_essential_expenses_and_recovery_dates():
    with SessionLocal() as session:
        miete = session.scalar(select(Category).where(Category.name == "Miete"))
        nebenkosten = session.scalar(select(Category).where(Category.name == "Nebenkosten"))
        supermarkt = session.scalar(select(Category).where(Category.name == "Supermarkt"))
        assert miete is not None
        assert nebenkosten is not None
        assert supermarkt is not None

        session.add_all(
            [
                PlannedPayment(
                    account_id=1,
                    name="Warmmiete",
                    amount=1200,
                    payment_type="rent",
                    frequency="monthly",
                    day_of_month=1,
                    category_id=miete.id,
                    is_active=True,
                ),
                PlannedPayment(
                    account_id=1,
                    name="Strom & Gas",
                    amount=200,
                    payment_type="utilities",
                    frequency="monthly",
                    day_of_month=12,
                    category_id=nebenkosten.id,
                    is_active=True,
                ),
                SpendingAssumption(
                    category_id=supermarkt.id,
                    calculation_method="manual_override",
                    auto_monthly_amount=None,
                    manual_monthly_amount=400,
                    effective_monthly_amount=400,
                    is_active=True,
                ),
            ]
        )
        session.commit()

        emergency_bucket = session.scalar(
            select(SavingsBucket).where(SavingsBucket.bucket_type == EMERGENCY_FUND_BUCKET_TYPE)
        )
        etf_bucket = session.scalar(select(SavingsBucket).where(SavingsBucket.bucket_type == ETF_BUCKET_TYPE))
        assert emergency_bucket is not None
        assert etf_bucket is not None

        emergency_bucket.current_amount = 1500
        emergency_bucket.target_amount = 5000
        emergency_bucket.monthly_contribution = 300
        etf_bucket.current_amount = 3000
        etf_bucket.monthly_contribution = 250
        session.commit()

        summary = build_savings_plan_summary(
            session=session,
            scenario_withdrawal_amount=500,
            reference_date=date(2026, 5, 15),
        )

    assert summary.protected_current_amount == 4500
    assert summary.protected_monthly_contribution == 550
    assert summary.essential_monthly_expenses == 1800
    assert summary.three_month_target == 5400
    assert summary.six_month_target == 10800
    assert summary.gap_to_current_target == 3500
    assert summary.target_completion_date == date(2027, 5, 15)
    assert summary.three_month_completion_date == date(2027, 6, 15)
    assert summary.scenario_remaining_amount == 1000
    assert summary.scenario_recovery_date_to_current_target == date(2027, 7, 15)
    assert summary.scenario_recovery_date_to_three_month_target == date(2027, 8, 15)

    breakdown = {(item.label, item.source_type): item.monthly_amount for item in summary.essential_breakdown}
    assert breakdown[("Warmmiete (Miete)", "planned_payment")] == 1200
    assert breakdown[("Strom & Gas (Nebenkosten)", "planned_payment")] == 200
    assert breakdown[("Supermarkt", "spending_assumption")] == 400


def test_savings_bucket_updates_refresh_summary_through_api(client):
    initial = client.get("/api/v1/savings-buckets")
    assert initial.status_code == 200
    bucket_by_type = {bucket["bucket_type"]: bucket for bucket in initial.json()}

    update_response = client.patch(
        f"/api/v1/savings-buckets/{bucket_by_type[EMERGENCY_FUND_BUCKET_TYPE]['id']}",
        json={
            "current_amount": 2200,
            "target_amount": 6000,
            "monthly_contribution": 400,
        },
    )
    assert update_response.status_code == 200
    assert update_response.json()["target_gap"] == 3800

    summary = client.get("/api/v1/savings-buckets/summary?scenario_withdrawal_amount=700")
    assert summary.status_code == 200
    payload = summary.json()
    assert payload["emergency_fund_current_amount"] == 2200
    assert payload["emergency_fund_target_amount"] == 6000
    assert payload["gap_to_current_target"] == 3800
    assert payload["scenario_remaining_amount"] == 1500
    assert payload["scenario_withdrawal_allowed"] is True
