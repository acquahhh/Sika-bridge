from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Header
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import ledger
from ..deps import api_error, get_db, require_role
from ..models import Kyc, Role, User, new_id
from ..money import COUNTRIES, COUNTRY_CURRENCY, CURRENCY_EXPONENT, MoneyError, format_minor, parse_amount
from ..serialize import user_out

router = APIRouter(prefix="/admin", tags=["admin"])
admin_only = require_role(Role.ADMIN)


class FundPoolIn(BaseModel):
    country: Literal["RW", "GH", "NG"]
    amount: str


def _pool_out(db: Session, country: str) -> dict:
    cur = COUNTRY_CURRENCY[country]
    cash = ledger.balance(db, ledger.pool(country))
    owed = -ledger.balance(db, ledger.payable(country))
    return {
        "country": country,
        "currency": cur,
        "balance": format_minor(cash, cur),
        "payable": format_minor(owed, cur),
        "available": format_minor(cash - owed, cur),
    }


@router.get("/pools")
def pools(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    return {
        "pools": [_pool_out(db, cc) for cc in COUNTRIES],
        "fees": [
            {"currency": cur, "earned": format_minor(-ledger.balance(db, ledger.fees(cur)), cur)}
            for cur in CURRENCY_EXPONENT
        ],
    }


@router.post("/pools/fund", status_code=201)
def fund_pool(
    body: FundPoolIn,
    idempotency_key: str | None = Header(default=None),
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    cur = COUNTRY_CURRENCY[body.country]
    try:
        amount = parse_amount(body.amount, cur)
    except MoneyError as exc:
        raise api_error(400, "invalid_amount", str(exc)) from exc
    try:
        ledger.post_journal(
            db,
            key=f"fund:{idempotency_key or new_id()}",
            kind="pool_fund",
            memo=f"Prefund pool {body.country}",
            lines=[
                ledger.Line(ledger.pool(body.country), cur, amount),
                ledger.Line(ledger.equity(cur), cur, -amount),
            ],
        )
        db.commit()
    except IntegrityError:
        db.rollback()  # same Idempotency-Key already applied
    return _pool_out(db, body.country)


@router.get("/users")
def list_users(
    kyc_status: str | None = None,
    _: User = Depends(admin_only),
    db: Session = Depends(get_db),
):
    q = select(User).order_by(User.id)
    if kyc_status:
        q = q.where(User.kyc_status == kyc_status)
    return [user_out(u) for u in db.scalars(q.limit(200)).all()]


@router.post("/users/{user_id}/verify-kyc")
def verify_kyc(user_id: int, _: User = Depends(admin_only), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if user is None:
        raise api_error(404, "not_found", f"No user with id {user_id}.")
    user.kyc_status = Kyc.VERIFIED
    db.commit()
    return user_out(user)


@router.get("/ledger/check")
def ledger_check(_: User = Depends(admin_only), db: Session = Depends(get_db)):
    result = ledger.check(db)
    result["totals_by_currency"] = {
        cur: format_minor(v, cur) for cur, v in result["totals_by_currency"].items()
    }
    return result
