"""Wallet top-ups via (mock) MTN MoMo request-to-pay, confirmed by webhook."""

from __future__ import annotations

import hmac
from typing import Literal

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from .. import ledger
from ..config import Settings
from ..deps import api_error, get_current_user, get_db, get_settings_dep, require_role
from ..models import Deposit, DepositStatus, Role, User
from ..money import COUNTRY_CURRENCY, MoneyError, format_minor, parse_amount
from ..serialize import deposit_out

router = APIRouter(tags=["wallet"])


class DepositIn(BaseModel):
    amount: str


class MomoWebhookIn(BaseModel):
    reference: str
    status: Literal["SUCCESSFUL", "FAILED"]


@router.get("/wallet")
def get_wallet(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    currency = COUNTRY_CURRENCY[user.country]
    return {
        "currency": currency,
        "balance": format_minor(ledger.wallet_balance(db, user.id), currency),
    }


@router.post("/deposits", status_code=201)
def create_deposit(
    body: DepositIn,
    user: User = Depends(require_role(Role.STUDENT)),
    db: Session = Depends(get_db),
):
    currency = COUNTRY_CURRENCY[user.country]
    try:
        amount = parse_amount(body.amount, currency)
    except MoneyError as exc:
        raise api_error(400, "invalid_amount", str(exc)) from exc
    deposit = Deposit(user_id=user.id, currency=currency, amount=amount)
    db.add(deposit)
    db.commit()
    # A real integration would call MoMo's requesttopay here with deposit.momo_reference
    # as the X-Reference-Id; the user then approves on their phone and MoMo calls us back.
    return {**deposit_out(deposit), "message": "Approve the payment request on your phone."}


@router.get("/deposits")
def list_deposits(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Deposit).where(Deposit.user_id == user.id).order_by(Deposit.created_at.desc()).limit(50)
    ).all()
    return [deposit_out(d) for d in rows]


@router.get("/deposits/{deposit_id}")
def get_deposit(deposit_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = db.get(Deposit, deposit_id)
    if d is None or d.user_id != user.id:
        raise api_error(404, "not_found", "Deposit not found.")
    return deposit_out(d)


@router.post("/webhooks/momo")
def momo_webhook(
    body: MomoWebhookIn,
    x_webhook_secret: str | None = Header(default=None),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    if not x_webhook_secret or not hmac.compare_digest(x_webhook_secret, settings.webhook_secret):
        raise api_error(401, "invalid_signature", "Invalid webhook secret.")

    deposit = db.scalar(select(Deposit).where(Deposit.momo_reference == body.reference))
    if deposit is None:
        raise api_error(404, "not_found", "Unknown payment reference.")

    # Idempotent: only the first callback that moves the deposit out of PENDING has any effect.
    moved = db.execute(
        update(Deposit)
        .where(Deposit.id == deposit.id, Deposit.status == DepositStatus.PENDING)
        .values(status=body.status)
    ).rowcount
    if not moved:
        db.rollback()
        db.refresh(deposit)
        return {**deposit_out(deposit), "duplicate": True}

    if body.status == DepositStatus.SUCCESSFUL:
        user = db.get(User, deposit.user_id)
        txn = ledger.post_journal(
            db,
            key=f"deposit:{deposit.id}",
            kind="deposit",
            memo=f"MoMo deposit {deposit.momo_reference}",
            lines=[
                ledger.Line(ledger.pool(user.country), deposit.currency, deposit.amount),
                ledger.Line(ledger.wallet(user.id), deposit.currency, -deposit.amount),
            ],
        )
        deposit.journal_txn_id = txn.id
    db.commit()
    db.refresh(deposit)
    return {**deposit_out(deposit), "duplicate": False}
