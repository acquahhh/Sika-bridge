"""Corridors, quotes and transfers (student side)."""

from __future__ import annotations

from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .. import fx, ledger
from ..config import Settings
from ..deps import api_error, get_current_user, get_db, get_settings_dep, require_role
from ..models import Kyc, Quote, Role, Transfer, TransferStatus, User, utcnow
from ..money import COUNTRY_CURRENCY, MoneyError, format_minor, parse_amount
from ..phones import PHONE_EXAMPLES, normalize_phone, valid_phone
from ..serialize import quote_out, transfer_out

router = APIRouter(tags=["transfers"])


class QuoteIn(BaseModel):
    recv_country: Literal["RW", "GH", "NG"]
    send_amount: str


class TransferIn(BaseModel):
    quote_id: str
    recipient_name: str = Field(min_length=2, max_length=120)
    recipient_phone: str
    payout_method: Literal["momo", "bank"]
    bank_name: str | None = Field(default=None, max_length=80)
    bank_account: str | None = Field(default=None, max_length=40)

    @model_validator(mode="after")
    def _bank_fields(self):
        if self.payout_method == "bank" and not (self.bank_name and self.bank_account):
            raise ValueError("bank_name and bank_account are required for bank payouts")
        return self


def _corridor_or_400(src: str, dst: str) -> None:
    try:
        fx.ensure_corridor(src, dst)
    except fx.CorridorUnavailable as exc:
        raise api_error(400, "corridor_unavailable", exc.message) from exc


@router.get("/corridors")
def corridors():
    return [
        {
            "from_country": src,
            "to_country": dst,
            "from_currency": COUNTRY_CURRENCY[src],
            "to_currency": COUNTRY_CURRENCY[dst],
            "enabled": reason is None,
            "reason": reason,
        }
        for (src, dst), reason in fx.CORRIDORS.items()
    ]


@router.post("/quotes", status_code=201)
def create_quote(
    body: QuoteIn,
    user: User = Depends(require_role(Role.STUDENT)),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    src, dst = user.country, body.recv_country
    _corridor_or_400(src, dst)
    send_cur, recv_cur = COUNTRY_CURRENCY[src], COUNTRY_CURRENCY[dst]
    try:
        send_amount = parse_amount(body.send_amount, send_cur)
    except MoneyError as exc:
        raise api_error(400, "invalid_amount", str(exc)) from exc

    fee = fx.compute_fee(send_amount, send_cur)
    net = send_amount - fee
    if net <= 0:
        raise api_error(
            400,
            "amount_too_small",
            f"The amount must be more than the {format_minor(fee, send_cur)} {send_cur} fee.",
        )
    rate = fx.customer_rate(send_cur, recv_cur)
    receive = fx.convert(net, send_cur, recv_cur, rate)
    if receive <= 0:
        raise api_error(400, "amount_too_small", "The amount is too small to send.")

    now = utcnow()
    quote = Quote(
        user_id=user.id,
        send_country=src,
        recv_country=dst,
        send_currency=send_cur,
        recv_currency=recv_cur,
        send_amount=send_amount,
        fee=fee,
        net_amount=net,
        rate=format(rate, "f"),
        receive_amount=receive,
        created_at=now,
        expires_at=now + timedelta(seconds=settings.quote_ttl_seconds),
    )
    db.add(quote)
    db.commit()
    return quote_out(quote, now)


@router.post("/transfers", status_code=201)
def create_transfer(
    body: TransferIn,
    user: User = Depends(require_role(Role.STUDENT)),
    db: Session = Depends(get_db),
):
    if user.kyc_status != Kyc.VERIFIED:
        raise api_error(
            403, "kyc_pending", "Your identity check (KYC) is still pending. You can send once it is verified."
        )

    quote = db.get(Quote, body.quote_id)
    if quote is None or quote.user_id != user.id:
        raise api_error(404, "quote_not_found", "Quote not found.")
    now = utcnow()
    if quote.used_at is not None:
        raise api_error(409, "quote_used", "This quote has already been used.")
    if quote.expires_at <= now:
        raise api_error(400, "quote_expired", "This quote has expired. Please get a new quote.")
    _corridor_or_400(quote.send_country, quote.recv_country)

    phone = normalize_phone(body.recipient_phone)
    if not valid_phone(phone, quote.recv_country):
        raise api_error(
            400,
            "invalid_phone",
            f"Recipient phone must be a {quote.recv_country} number, e.g. {PHONE_EXAMPLES[quote.recv_country]}.",
        )

    wallet_code = ledger.wallet(user.id)
    ledger.lock_accounts(
        db, [wallet_code, ledger.pool(quote.recv_country), ledger.payable(quote.recv_country)]
    )
    if ledger.wallet_balance(db, user.id) < quote.send_amount:
        raise api_error(400, "insufficient_funds", "Your wallet balance is too low. Top up first.")
    if ledger.pool_available(db, quote.recv_country) < quote.receive_amount:
        raise api_error(
            503,
            "pool_unavailable",
            f"Payouts to {quote.recv_country} are temporarily unavailable for this amount. Try a smaller amount or later.",
        )

    claimed = db.execute(
        update(Quote).where(Quote.id == quote.id, Quote.used_at.is_(None)).values(used_at=now)
    ).rowcount
    if not claimed:
        db.rollback()
        raise api_error(409, "quote_used", "This quote has already been used.")

    transfer = Transfer(
        user_id=user.id,
        quote_id=quote.id,
        send_country=quote.send_country,
        recv_country=quote.recv_country,
        send_currency=quote.send_currency,
        recv_currency=quote.recv_currency,
        send_amount=quote.send_amount,
        fee=quote.fee,
        net_amount=quote.net_amount,
        rate=quote.rate,
        receive_amount=quote.receive_amount,
        recipient_name=body.recipient_name.strip(),
        recipient_phone=phone,
        payout_method=body.payout_method,
        bank_name=body.bank_name if body.payout_method == "bank" else None,
        bank_account=body.bank_account if body.payout_method == "bank" else None,
        status=TransferStatus.PAYOUT_PENDING,
    )
    db.add(transfer)
    db.flush()

    s, r = quote.send_currency, quote.recv_currency
    txn = ledger.post_journal(
        db,
        key=f"transfer:{transfer.id}:fund",
        kind="transfer_fund",
        memo=f"Transfer {transfer.id} {quote.send_country}->{quote.recv_country}",
        lines=[
            ledger.Line(wallet_code, s, quote.send_amount),
            ledger.Line(ledger.fees(s), s, -quote.fee),
            ledger.Line(ledger.fx(s), s, -quote.net_amount),
            ledger.Line(ledger.fx(r), r, quote.receive_amount),
            ledger.Line(ledger.payable(quote.recv_country), r, -quote.receive_amount),
        ],
    )
    transfer.funding_txn_id = txn.id
    db.commit()
    return transfer_out(transfer)


@router.get("/transfers")
def list_transfers(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Transfer).where(Transfer.user_id == user.id).order_by(Transfer.created_at.desc()).limit(100)
    ).all()
    return [transfer_out(t) for t in rows]


@router.get("/transfers/{transfer_id}")
def get_transfer(transfer_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    t = db.get(Transfer, transfer_id)
    if t is None or t.user_id != user.id:
        raise api_error(404, "not_found", "Transfer not found.")
    return transfer_out(t)

