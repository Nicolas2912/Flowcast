from __future__ import annotations

import re
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.errors import NotFoundError
from app.models.category import Category
from app.models.merchant_rule import MerchantRule
from app.models.transaction import Transaction
from app.services.text_normalization import normalize_text


MANUAL_ASSIGNMENT_METHODS = {"manual", "manual_clear"}
RULE_ASSIGNMENT_METHOD = "rule"
PATTERN_TYPES = {"exact", "contains", "regex"}


@dataclass
class CategorizationRunSummary:
    processed_count: int
    matched_count: int
    updated_count: int
    cleared_count: int


def validate_pattern_type(pattern_type: str) -> str:
    normalized = pattern_type.strip().lower()
    if normalized not in PATTERN_TYPES:
        raise ValueError(f"Unsupported pattern type '{pattern_type}'.")
    return normalized


def validate_regex_pattern(pattern: str) -> None:
    try:
        re.compile(pattern, re.IGNORECASE)
    except re.error as exc:
        raise ValueError(f"Invalid regex pattern: {exc}.") from exc


def build_transaction_match_fields(transaction: Transaction) -> list[str]:
    return [
        normalize_text(transaction.payee),
        normalize_text(transaction.purpose),
        normalize_text(transaction.original_text),
        normalize_text(transaction.normalized_text),
    ]


def matches_rule(rule: MerchantRule, transaction: Transaction) -> bool:
    match_fields = [field for field in build_transaction_match_fields(transaction) if field]
    if not match_fields:
        return False

    if rule.pattern_type == "exact":
        normalized_pattern = normalize_text(rule.pattern)
        return any(field == normalized_pattern for field in match_fields)

    haystack = " | ".join(match_fields)
    if rule.pattern_type == "contains":
        return normalize_text(rule.pattern) in haystack

    compiled = re.compile(rule.pattern, re.IGNORECASE)
    return compiled.search(haystack) is not None


def select_matching_rule(rules: list[MerchantRule], transaction: Transaction) -> MerchantRule | None:
    for rule in rules:
        if matches_rule(rule, transaction):
            return rule
    return None


def apply_merchant_rules(*, session: Session) -> CategorizationRunSummary:
    rules = session.scalars(
        select(MerchantRule)
        .where(MerchantRule.is_active.is_(True))
        .options(joinedload(MerchantRule.category))
        .order_by(MerchantRule.priority.asc(), MerchantRule.id.asc())
    ).all()

    transactions = session.scalars(select(Transaction).order_by(Transaction.booking_date.desc(), Transaction.id.asc())).all()

    processed_count = 0
    matched_count = 0
    updated_count = 0
    cleared_count = 0

    for transaction in transactions:
        if transaction.category_assignment_method in MANUAL_ASSIGNMENT_METHODS:
            continue

        processed_count += 1
        rule = select_matching_rule(rules, transaction)
        if rule is None:
            if transaction.category_assignment_method == RULE_ASSIGNMENT_METHOD and transaction.category_id is not None:
                transaction.category_id = None
                transaction.category_assignment_method = None
                updated_count += 1
                cleared_count += 1
            continue

        matched_count += 1
        if transaction.category_id != rule.category_id or transaction.category_assignment_method != RULE_ASSIGNMENT_METHOD:
            transaction.category_id = rule.category_id
            transaction.category_assignment_method = RULE_ASSIGNMENT_METHOD
            updated_count += 1

    session.commit()
    return CategorizationRunSummary(
        processed_count=processed_count,
        matched_count=matched_count,
        updated_count=updated_count,
        cleared_count=cleared_count,
    )


def require_category(session: Session, category_id: int) -> Category:
    category = session.get(Category, category_id)
    if category is None:
        raise NotFoundError("Category", category_id)
    return category
