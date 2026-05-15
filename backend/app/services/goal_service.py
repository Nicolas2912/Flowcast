from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import DomainValidationError, NotFoundError
from app.models.goal import Goal


SUPPORTED_GOAL_TYPES = {"lifestyle", "travel", "purchase", "buffer", "custom"}
SUPPORTED_FUNDING_STRATEGIES = {"priority", "parallel"}


def list_goals(*, session: Session) -> list[Goal]:
    return session.scalars(select(Goal).order_by(Goal.priority.asc(), Goal.id.asc())).all()


def get_goal(*, session: Session, goal_id: int) -> Goal:
    goal = session.get(Goal, goal_id)
    if goal is None:
        raise NotFoundError("Goal", goal_id)
    return goal


def require_goal(session: Session, goal_id: int) -> Goal:
    return get_goal(session=session, goal_id=goal_id)


def normalize_goal_type(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in SUPPORTED_GOAL_TYPES:
        raise DomainValidationError("Unsupported goal_type.", [{"field": "goal_type", "message": normalized}])
    return normalized


def normalize_funding_strategy(value: str) -> str:
    normalized = value.strip().lower()
    if normalized not in SUPPORTED_FUNDING_STRATEGIES:
        raise DomainValidationError(
            "Unsupported funding_strategy.",
            [{"field": "funding_strategy", "message": normalized}],
        )
    return normalized
