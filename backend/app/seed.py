from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.account import Account
from app.models.category import Category
from app.services.savings_bucket_service import ensure_default_savings_buckets


DEFAULT_ACCOUNT = {
    "id": 1,
    "name": "Main C24 Account",
    "provider": "c24",
    "account_type": "checking",
    "currency": "EUR",
    "opening_balance": 0.0,
    "is_active": True,
}


DEFAULT_CATEGORIES = [
    {"name": "Einnahmen", "behavior_type": "group", "sort_order": 10},
    {"name": "Gehalt", "parent_name": "Einnahmen", "behavior_type": "income", "is_income": True, "sort_order": 11},
    {"name": "Bonus & Erstattung", "parent_name": "Einnahmen", "behavior_type": "income", "is_income": True, "sort_order": 12},
    {"name": "Wohnen", "behavior_type": "group", "sort_order": 20},
    {"name": "Miete", "parent_name": "Wohnen", "behavior_type": "fixed_expense", "is_essential": True, "sort_order": 21},
    {"name": "Nebenkosten", "parent_name": "Wohnen", "behavior_type": "fixed_expense", "is_essential": True, "sort_order": 22},
    {"name": "Alltag", "behavior_type": "group", "sort_order": 30},
    {"name": "Supermarkt", "parent_name": "Alltag", "behavior_type": "variable_expense", "is_essential": True, "is_variable": True, "sort_order": 31},
    {"name": "Drogerie", "parent_name": "Alltag", "behavior_type": "variable_expense", "is_essential": True, "is_variable": True, "sort_order": 32},
    {"name": "Restaurant & Cafe", "parent_name": "Alltag", "behavior_type": "variable_expense", "is_variable": True, "sort_order": 33},
    {"name": "Shopping", "parent_name": "Alltag", "behavior_type": "variable_expense", "is_variable": True, "sort_order": 34},
    {"name": "Mobilitaet", "behavior_type": "group", "sort_order": 40},
    {"name": "Tanken", "parent_name": "Mobilitaet", "behavior_type": "variable_expense", "is_variable": True, "sort_order": 41},
    {"name": "OePNV & Bahn", "parent_name": "Mobilitaet", "behavior_type": "variable_expense", "is_variable": True, "sort_order": 42},
    {"name": "Auto", "parent_name": "Mobilitaet", "behavior_type": "fixed_expense", "sort_order": 43},
    {"name": "Freizeit & Reisen", "behavior_type": "group", "sort_order": 50},
    {"name": "Freizeit", "parent_name": "Freizeit & Reisen", "behavior_type": "variable_expense", "is_variable": True, "sort_order": 51},
    {"name": "Reisen", "parent_name": "Freizeit & Reisen", "behavior_type": "variable_expense", "is_variable": True, "sort_order": 52},
    {"name": "Sparen & Ziele", "behavior_type": "group", "sort_order": 60},
    {"name": "ETF-Sparplan", "parent_name": "Sparen & Ziele", "behavior_type": "saving", "is_saving": True, "sort_order": 61},
    {"name": "Notgroschen", "parent_name": "Sparen & Ziele", "behavior_type": "saving", "is_saving": True, "sort_order": 62},
    {"name": "Transfers & Korrekturen", "behavior_type": "group", "sort_order": 70},
    {"name": "Interne Umbuchung", "parent_name": "Transfers & Korrekturen", "behavior_type": "internal_transfer", "sort_order": 71},
    {"name": "Rueckerstattung", "parent_name": "Transfers & Korrekturen", "behavior_type": "refund", "sort_order": 72},
    {"name": "Ausgeschlossen", "parent_name": "Transfers & Korrekturen", "behavior_type": "excluded", "is_excluded": True, "sort_order": 73},
]


def seed_defaults(session: Session) -> None:
    account = session.get(Account, DEFAULT_ACCOUNT["id"])
    if account is None:
        session.add(Account(**DEFAULT_ACCOUNT))

    existing_categories = {category.name: category for category in session.scalars(select(Category)).all()}
    for category in DEFAULT_CATEGORIES:
        parent_name = category.get("parent_name")
        parent = existing_categories.get(parent_name) if parent_name else None

        model = existing_categories.get(category["name"])
        if model is None:
            model = Category(name=category["name"])
            session.add(model)
            existing_categories[category["name"]] = model

        model.parent = parent
        model.behavior_type = category["behavior_type"]
        model.is_essential = category.get("is_essential", False)
        model.is_variable = category.get("is_variable", False)
        model.is_income = category.get("is_income", False)
        model.is_saving = category.get("is_saving", False)
        model.is_excluded = category.get("is_excluded", False)
        model.sort_order = category["sort_order"]

    session.commit()
    ensure_default_savings_buckets(session)


def main() -> None:
    with SessionLocal() as session:
        seed_defaults(session)


if __name__ == "__main__":
    main()
