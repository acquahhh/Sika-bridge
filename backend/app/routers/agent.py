"""Payout agents: country-scoped queue, claim, complete, fail."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from .. import ledger
from ..deps import api_error, get_db, require_role
from ..models import JournalTxn, Role, Transfer, TransferStatus, User, utcnow
from ..serialize import transfer_out

router = APIRouter(prefix="/agent", tags=["agent"])
agent_only = require_role(Role.AGENT)


class CompleteIn(BaseModel):
    payout_reference: str = Field(min_length=3, max_length=80)


class FailIn(BaseModel):
    reason: str = Field(min_length=3, max_length=255)


def _load(db: Session, transfer_id: str, agent: User) -> Transfer:
    t = db.get(Transfer, transfer_id)
    if t is None or t.recv_country != agent.country:
        raise api_error(404, "not_found", "Payout not found.")
    return t


def _transition(db: Session, t: Transfer, *, from_status: str, held_by: int | None, **values) -> None:
    """Atomically move a transfer from one status to another, or 409 if someone beat us to it."""
    q = update(Transfer).where(Transfer.id == t.id, Transfer.status == from_status)
    if held_by is not None:
        q = q.where(Transfer.agent_id == held_by)
    if not db.execute(q.values(updated_at=utcnow(), **values)).rowcount:
        db.rollback()
        raise api_error(409, "invalid_state", "This payout is no longer in a state that allows that action.")


@router.get("/payouts")
def list_payouts(agent: User = Depends(agent_only), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(Transfer)
        .where(
            Transfer.recv_country == agent.country,
            or_(
                Transfer.status == TransferStatus.PAYOUT_PENDING,
                (Transfer.status == TransferStatus.IN_PROGRESS) & (Transfer.agent_id == agent.id),
            ),
        )
        .order_by(Transfer.created_at.asc())
    ).all()
    return [transfer_out(t) for t in rows]


@router.post("/payouts/{transfer_id}/claim")
def claim(transfer_id: str, agent: User = Depends(agent_only), db: Session = Depends(get_db)):
    t = _load(db, transfer_id, agent)
    _transition(
        db, t, from_status=TransferStatus.PAYOUT_PENDING, held_by=None,
        status=TransferStatus.IN_PROGRESS, agent_id=agent.id,
    )
    db.commit()
    db.refresh(t)
    return transfer_out(t)


@router.post("/payouts/{transfer_id}/complete")
def complete(
    transfer_id: str, body: CompleteIn, agent: User = Depends(agent_only), db: Session = Depends(get_db)
):
    t = _load(db, transfer_id, agent)
    _transition(
        db, t, from_status=TransferStatus.IN_PROGRESS, held_by=agent.id,
        status=TransferStatus.PAID, payout_reference=body.payout_reference.strip(),
    )
    txn = ledger.post_journal(
        db,
        key=f"transfer:{t.id}:payout",
        kind="transfer_payout",
        memo=f"Payout {t.id} ref {body.payout_reference.strip()}",
        lines=[
            ledger.Line(ledger.payable(t.recv_country), t.recv_currency, t.receive_amount),
            ledger.Line(ledger.pool(t.recv_country), t.recv_currency, -t.receive_amount),
        ],
    )
    db.execute(update(Transfer).where(Transfer.id == t.id).values(payout_txn_id=txn.id))
    db.commit()
    db.refresh(t)
    return transfer_out(t)


@router.post("/payouts/{transfer_id}/fail")
def fail(transfer_id: str, body: FailIn, agent: User = Depends(agent_only), db: Session = Depends(get_db)):
    t = _load(db, transfer_id, agent)
    # An agent can fail a payout they hold, or one still waiting in the queue.
    if t.status == TransferStatus.IN_PROGRESS:
        _transition(
            db, t, from_status=TransferStatus.IN_PROGRESS, held_by=agent.id,
            status=TransferStatus.REFUNDED, failure_reason=body.reason.strip(),
        )
    else:
        _transition(
            db, t, from_status=TransferStatus.PAYOUT_PENDING, held_by=None,
            status=TransferStatus.REFUNDED, failure_reason=body.reason.strip(), agent_id=agent.id,
        )
    funding = db.get(JournalTxn, t.funding_txn_id)
    txn = ledger.reverse_journal(
        db, funding, key=f"transfer:{t.id}:refund", kind="transfer_refund", memo=f"Refund {t.id}: {body.reason.strip()}"
    )
    db.execute(update(Transfer).where(Transfer.id == t.id).values(refund_txn_id=txn.id))
    db.commit()
    db.refresh(t)
    return transfer_out(t)
