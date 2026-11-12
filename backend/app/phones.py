from __future__ import annotations

import re

# E.164 numbers for the supported countries.
PHONE_PATTERNS: dict[str, re.Pattern[str]] = {
    "RW": re.compile(r"^\+250\d{9}$"),
    "GH": re.compile(r"^\+233\d{9}$"),
    "NG": re.compile(r"^\+234\d{10}$"),
}
PHONE_EXAMPLES = {"RW": "+250788123456", "GH": "+233241234567", "NG": "+2348031234567"}


def normalize_phone(raw: str) -> str:
    return re.sub(r"[\s\-()]", "", raw or "")


def valid_phone(phone: str, country: str) -> bool:
    pattern = PHONE_PATTERNS.get(country)
    return bool(pattern and pattern.match(phone))
