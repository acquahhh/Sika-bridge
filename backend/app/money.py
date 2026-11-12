"""Money helpers.

All amounts are stored as integer minor units. The API accepts and returns
decimal *strings*. Floats are never used anywhere in money handling.
"""

from __future__ import annotations

import re
from decimal import Decimal

CURRENCY_EXPONENT: dict[str, int] = {"RWF": 0, "GHS": 2, "NGN": 2}
COUNTRY_CURRENCY: dict[str, str] = {"RW": "RWF", "GH": "GHS", "NG": "NGN"}
COUNTRIES = tuple(COUNTRY_CURRENCY)

_AMOUNT_RE = re.compile(r"^\d{1,15}(\.\d{1,8})?$")


class MoneyError(ValueError):
    pass


def parse_amount(value: object, currency: str) -> int:
    """Parse a positive decimal string like "1500" or "25.50" into minor units."""
    if not isinstance(value, str) or not _AMOUNT_RE.match(value):
        raise MoneyError('Amount must be a positive decimal string, e.g. "1500" or "25.50".')
    exp = CURRENCY_EXPONENT[currency]
    minor = Decimal(value).scaleb(exp)
    if minor != minor.to_integral_value():
        raise MoneyError(f"{currency} amounts allow at most {exp} decimal places.")
    result = int(minor)
    if result <= 0:
        raise MoneyError("Amount must be greater than zero.")
    return result


def format_minor(minor: int, currency: str) -> str:
    """Format integer minor units as a plain decimal string ("1042.40", "-300")."""
    exp = CURRENCY_EXPONENT[currency]
    if exp == 0:
        return str(minor)
    sign = "-" if minor < 0 else ""
    whole, frac = divmod(abs(minor), 10**exp)
    return f"{sign}{whole}.{frac:0{exp}d}"
