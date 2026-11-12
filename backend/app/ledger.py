"""Double-entry ledger.

Sign convention: Entry.amount > 0 is a debit, < 0 is a credit. Every journal
must sum to zero per currency. Raw balance(code) is debit-positive, so:

* asset accounts (pool:{CC})                      -> balance is cash held
* liability accounts (wallet:{uid}, payable:{CC}) -> -balance is what we owe
* income/equity (fees:{CUR}, equity:{CUR})        -> -balance is the amount
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Account, Entry, JournalTxn


class LedgerError(Exception):
    pass


# ---------------------------------------------------------------- account codes


def pool(country: str) -> str:
    return f"pool:{country}"


def payable(country: str) -> str:
    return f"payable:{country}"


def wallet(user_id: int) -> str:
    return f"wallet:{user_id}"


def fees(currency: str) -> str:
    return f"fees:{currency}"


def fx(currency: str) -> str:
    return f"fx:{currency}"


def equity(currency: str) -> str:
    return f"equity:{currency}"


# ---------------------------------------------------------------- posting


@dataclass(frozen=True)
class Line:
    code: str
    currency: str
    amount: int


def get_or_create_account(db: Session, code: str, currency: str) -> Account:
    acct = db.scalar(select(Account).where(Account.code == code))
    if acct is None:
        acct = Account(code=code, currency=currency)
        db.add(acct)
        db.flush()
    elif acct.currency != currency:
        raise LedgerError(f"Account {code} is {acct.currency}, not {currency}")
    return acct


def lock_accounts(db: Session, codes: list[str]) -> None:
    """SELECT ... FOR UPDATE on the given accounts (no-op on SQLite, which uses BEGIN IMMEDIATE)."""
    db.execute(select(Account.id).where(Account.code.in_(codes)).with_for_update()).all()


def post_journal(db: Session, *, key: str, kind: str, lines: list[Line], memo: str = "") -> JournalTxn:
    if len(lines) < 2:
        raise LedgerError("A journal needs at least two entries")
    totals: dict[str, int] = defaultdict(int)
    for line in lines:
        if type(line.amount) is not int or line.amount == 0:
            raise LedgerError(f"Invalid entry amount {line.amount!r} for {line.code}")
        totals[line.currency] += line.amount
    unbalanced = {cur: total for cur, total in totals.items() if total != 0}
    if unbalanced:
        raise LedgerError(f"Journal {key} does not balance: {unbalanced}")

    txn = JournalTxn(idempotency_key=key, kind=kind, memo=memo)
    db.add(txn)
    db.flush()
    for line in lines:
        acct = get_or_create_account(db, line.code, line.currency)
        db.add(Entry(txn_id=txn.id, account_id=acct.id, amount=line.amount))
    db.flush()
    return txn


def reverse_journal(db: Session, original: JournalTxn, *, key: str, kind: str, memo: str = "") -> JournalTxn:
    lines = [Line(e.account.code, e.account.currency, -e.amount) for e in original.entries]
    return post_journal(db, key=key, kind=kind, lines=lines, memo=memo)


# ---------------------------------------------------------------- reading


def balance(db: Session, code: str) -> int:
    """Raw debit-positive balance of an account (0 if it does not exist yet)."""
    total = db.scalar(
        select(func.coalesce(func.sum(Entry.amount), 0))
        .join(Account, Entry.account_id == Account.id)
        .where(Account.code == code)
    )
    return int(total or 0)


def wallet_balance(db: Session, user_id: int) -> int:
    return -balance(db, wallet(user_id))


def pool_available(db: Session, country: str) -> int:
    """Cash in the pool minus what is already owed to recipients in that country."""
    return balance(db, pool(country)) + balance(db, payable(country))


def check(db: Session) -> dict:
    """Verify every journal and the whole ledger sum to zero per currency."""
    rows = db.execute(
        select(Entry.txn_id, Account.currency, func.sum(Entry.amount))
        .join(Account, Entry.account_id == Account.id)
        .group_by(Entry.txn_id, Account.currency)
    ).all()
    unbalanced = [
        {"txn_id": txn_id, "currency": cur, "sum": int(total)}
        for txn_id, cur, total in rows
        if int(total) != 0
    ]
    totals: dict[str, int] = defaultdict(int)
    for _txn, cur, total in rows:
        totals[cur] += int(total)
    txn_count = db.scalar(select(func.count(JournalTxn.id))) or 0
    entry_count = db.scalar(select(func.count(Entry.id))) or 0
    return {
        "balanced": not unbalanced and all(v == 0 for v in totals.values()),
        "journal_count": int(txn_count),
        "entry_count": int(entry_count),
        "totals_by_currency": dict(totals),
        "unbalanced": unbalanced,
    }
