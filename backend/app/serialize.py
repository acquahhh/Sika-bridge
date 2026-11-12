"""Convert ORM objects to API dicts. Money always leaves the API as a decimal string."""

from __future__ import annotations

from datetime import datetime

from .models import Deposit, Quote, Transfer, User
from .money import COUNTRY_CURRENCY, format_minor


def iso(dt: datetime | None) -> str | None:
    return dt.isoformat(timespec="seconds") + "Z" if dt else None


def user_out(u: User) -> dict:
    return {
        "id": u.id,
        "phone": u.phone,
        "full_name": u.full_name,
        "country": u.country,
        "currency": COUNTRY_CURRENCY[u.country],
        "role": u.role,
        "kyc_status": u.kyc_status,
        "created_at": iso(u.created_at),
    }


def deposit_out(d: Deposit) -> dict:
    return {
        "id": d.id,
        "amount": format_minor(d.amount, d.currency),
        "currency": d.currency,
        "momo_reference": d.momo_reference,
        "status": d.status,
        "created_at": iso(d.created_at),
        "updated_at": iso(d.updated_at),
    }


def quote_out(q: Quote, now: datetime) -> dict:
    return {
        "id": q.id,
        "send_country": q.send_country,
        "recv_country": q.recv_country,
        "send_currency": q.send_currency,
        "recv_currency": q.recv_currency,
        "send_amount": format_minor(q.send_amount, q.send_currency),
        "fee": format_minor(q.fee, q.send_currency),
        "net_amount": format_minor(q.net_amount, q.send_currency),
        "rate": q.rate,
        "receive_amount": format_minor(q.receive_amount, q.recv_currency),
        "created_at": iso(q.created_at),
        "expires_at": iso(q.expires_at),
        "expires_in_seconds": max(0, int((q.expires_at - now).total_seconds())),
        "used": q.used_at is not None,
    }


def transfer_out(t: Transfer) -> dict:
    return {
        "id": t.id,
        "quote_id": t.quote_id,
        "send_country": t.send_country,
        "recv_country": t.recv_country,
        "send_currency": t.send_currency,
        "recv_currency": t.recv_currency,
        "send_amount": format_minor(t.send_amount, t.send_currency),
        "fee": format_minor(t.fee, t.send_currency),
        "net_amount": format_minor(t.net_amount, t.send_currency),
        "rate": t.rate,
        "receive_amount": format_minor(t.receive_amount, t.recv_currency),
        "recipient_name": t.recipient_name,
        "recipient_phone": t.recipient_phone,
        "payout_method": t.payout_method,
        "bank_name": t.bank_name,
        "bank_account": t.bank_account,
        "status": t.status,
        "agent_id": t.agent_id,
        "payout_reference": t.payout_reference,
        "failure_reason": t.failure_reason,
        "created_at": iso(t.created_at),
        "updated_at": iso(t.updated_at),
    }
