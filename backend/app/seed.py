from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.account import Account
from app.models.category import Category


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
    {"name": "Salary", "behavior_type": "income", "is_income": True, "sort_order": 10},
    {"name": "Rent", "behavior_type": "fixed_cost", "is_essential": True, "sort_order": 20},
    {"name": "Groceries", "behavior_type": "variable_spend", "is_essential": True, "is_variable": True, "sort_order": 30},
    {"name": "Restaurants", "behavior_type": "variable_spend", "is_variable": True, "sort_order": 40},
    {"name": "Fuel", "behavior_type": "variable_spend", "is_variable": True, "sort_order": 50},
    {"name": "ETF", "behavior_type": "saving", "is_saving": True, "sort_order": 60},
    {"name": "Notgroschen", "behavior_type": "saving", "is_saving": True, "sort_order": 70},
    {"name": "Travel", "behavior_type": "goal_spend", "sort_order": 80},
]


def seed_defaults(session: Session) -> None:
    account = session.get(Account, DEFAULT_ACCOUNT["id"])
    if account is None:
        session.add(Account(**DEFAULT_ACCOUNT))

    existing_names = set(session.scalars(select(Category.name)).all())
    for category in DEFAULT_CATEGORIES:
        if category["name"] not in existing_names:
            session.add(
                Category(
                    name=category["name"],
                    behavior_type=category["behavior_type"],
                    is_essential=category.get("is_essential", False),
                    is_variable=category.get("is_variable", False),
                    is_income=category.get("is_income", False),
                    is_saving=category.get("is_saving", False),
                    sort_order=category["sort_order"],
                )
            )

    session.commit()


def main() -> None:
    with SessionLocal() as session:
        seed_defaults(session)


if __name__ == "__main__":
    main()
