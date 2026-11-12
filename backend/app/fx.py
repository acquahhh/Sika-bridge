"""Pricing: corridors, fees and FX rates. Pure functions, no I/O."""

from __future__ import annotations

from decimal import ROUND_CEILING, ROUND_DOWN, Decimal, localcontext

from .money import CURRENCY_EXPONENT

# Placeholder mid-market rates: units of currency per 1 USD.
USD_RATES: dict[str, Decimal] = {
    "RWF": Decimal("1450"),
    "GHS": Decimal("15.50"),
    "NGN": Decimal("1550"),
}
SPREAD = Decimal("0.01")
FEE_RATE = Decimal("0.015")
# Minimum fee in minor units of the *send* currency: 300 RWF, 3.00 GHS.
MIN_FEE_MINOR: dict[str, int] = {"RWF": 300, "GHS": 300}
RATE_QUANTUM = Decimal("0.00000001")  # 8 dp

# (from_country, to_country) -> None if enabled, otherwise the reason it is disabled.
CORRIDORS: dict[tuple[str, str], str | None] = {
    ("RW", "GH"): None,
    ("GH", "RW"): None,
    ("RW", "NG"): None,
    ("NG", "RW"): "Transfers out of Nigeria are not available (Nigerian IMTO outbound rules).",
}


class CorridorUnavailable(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


def ensure_corridor(src: str, dst: str) -> None:
    if (src, dst) not in CORRIDORS:
        raise CorridorUnavailable(f"Sending from {src} to {dst} is not supported.")
    reason = CORRIDORS[(src, dst)]
    if reason:
        raise CorridorUnavailable(reason)


def compute_fee(send_minor: int, currency: str) -> int:
    """1.5% of the send amount, rounded up to the minor unit, with a minimum fee."""
    pct = (Decimal(send_minor) * FEE_RATE).to_integral_value(rounding=ROUND_CEILING)
    return max(int(pct), MIN_FEE_MINOR[currency])


def customer_rate(send_currency: str, recv_currency: str) -> Decimal:
    """Recipient-currency units per 1 send-currency unit, after spread, 8dp rounded down."""
    with localcontext() as ctx:
        ctx.prec = 40
        mid = USD_RATES[recv_currency] / USD_RATES[send_currency]
        return (mid * (1 - SPREAD)).quantize(RATE_QUANTUM, rounding=ROUND_DOWN)


def convert(net_minor: int, send_currency: str, recv_currency: str, rate: Decimal) -> int:
    """Convert send minor units to recipient minor units, rounding down."""
    with localcontext() as ctx:
        ctx.prec = 40
        major = Decimal(net_minor).scaleb(-CURRENCY_EXPONENT[send_currency]) * rate
        recv = major.scaleb(CURRENCY_EXPONENT[recv_currency]).to_integral_value(rounding=ROUND_DOWN)
    return int(recv)
