from __future__ import annotations

import re


WHITESPACE_RE = re.compile(r"\s+")


def normalize_text(*parts: str | None) -> str:
    text = " ".join(part.strip() for part in parts if part and part.strip())
    text = text.casefold()
    return WHITESPACE_RE.sub(" ", text).strip()
