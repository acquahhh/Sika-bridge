from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    """Naive UTC timestamp (SQLite drops tzinfo, so we store naive UTC everywhere)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def new_id() -> str:
    return uuid.uuid4().hex


class Role:
    STUDENT = "student"
    AGENT = "agent"
    ADMIN = "admin"


class Kyc:
    PENDING = "pending"
    VERIFIED = "verified"


class TransferStatus:
    PAYOUT_PENDING = "PAYOUT_PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    PAID = "PAID"
    REFUNDED = "REFUNDED"


class DepositStatus:
    PENDING = "PENDING"
    SUCCESSFUL = "SUCCESSFUL"
    FAILED = "FAILED"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    country: Mapped[str] = mapped_column(String(2))
    role: Mapped[str] = mapped_column(String(16), default=Role.STUDENT)
    kyc_status: Mapped[str] = mapped_column(String(16), default=Kyc.PENDING)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---------------------------------------------------------------- ledger


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    currency: Mapped[str] = mapped_column(String(3))


class JournalTxn(Base):
    __tablename__ = "journal_txns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # Unique key makes every posting idempotent at the database level.
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True)
    kind: Mapped[str] = mapped_column(String(32))
    memo: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    entries: Mapped[list[Entry]] = relationship(back_populates="txn", lazy="selectin")


class Entry(Base):
    """One leg of a journal. amount > 0 is a debit, amount < 0 is a credit."""

    __tablename__ = "entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    txn_id: Mapped[int] = mapped_column(ForeignKey("journal_txns.id"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    amount: Mapped[int] = mapped_column(BigInteger)

    txn: Mapped[JournalTxn] = relationship(back_populates="entries")
    account: Mapped[Account] = relationship(lazy="joined")


# ---------------------------------------------------------------- business objects


class Deposit(Base):
    __tablename__ = "deposits"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    currency: Mapped[str] = mapped_column(String(3))
    amount: Mapped[int] = mapped_column(BigInteger)
    momo_reference: Mapped[str] = mapped_column(String(64), unique=True, default=new_id)
    status: Mapped[str] = mapped_column(String(16), default=DepositStatus.PENDING)
    journal_txn_id: Mapped[int | None] = mapped_column(ForeignKey("journal_txns.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    send_country: Mapped[str] = mapped_column(String(2))
    recv_country: Mapped[str] = mapped_column(String(2))
    send_currency: Mapped[str] = mapped_column(String(3))
    recv_currency: Mapped[str] = mapped_column(String(3))
    send_amount: Mapped[int] = mapped_column(BigInteger)
    fee: Mapped[int] = mapped_column(BigInteger)
    net_amount: Mapped[int] = mapped_column(BigInteger)
    rate: Mapped[str] = mapped_column(String(32))  # Decimal as string, 8dp
    receive_amount: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime)


class Transfer(Base):
    __tablename__ = "transfers"
    __table_args__ = (UniqueConstraint("quote_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    quote_id: Mapped[str] = mapped_column(ForeignKey("quotes.id"))
    send_country: Mapped[str] = mapped_column(String(2))
    recv_country: Mapped[str] = mapped_column(String(2), index=True)
    send_currency: Mapped[str] = mapped_column(String(3))
    recv_currency: Mapped[str] = mapped_column(String(3))
    send_amount: Mapped[int] = mapped_column(BigInteger)
    fee: Mapped[int] = mapped_column(BigInteger)
    net_amount: Mapped[int] = mapped_column(BigInteger)
    rate: Mapped[str] = mapped_column(String(32))
    receive_amount: Mapped[int] = mapped_column(BigInteger)

    recipient_name: Mapped[str] = mapped_column(String(120))
    recipient_phone: Mapped[str] = mapped_column(String(20))
    payout_method: Mapped[str] = mapped_column(String(8))  # momo | bank
    bank_name: Mapped[str | None] = mapped_column(String(80))
    bank_account: Mapped[str | None] = mapped_column(String(40))

    status: Mapped[str] = mapped_column(String(16), default=TransferStatus.PAYOUT_PENDING, index=True)
    agent_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    payout_reference: Mapped[str | None] = mapped_column(String(80))
    failure_reason: Mapped[str | None] = mapped_column(String(255))

    funding_txn_id: Mapped[int | None] = mapped_column(ForeignKey("journal_txns.id"))
    payout_txn_id: Mapped[int | None] = mapped_column(ForeignKey("journal_txns.id"))
    refund_txn_id: Mapped[int | None] = mapped_column(ForeignKey("journal_txns.id"))

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
