from __future__ import annotations

from datetime import timedelta

from app import fx
from app.models import Quote
from app.money import format_minor, parse_amount

from .conftest import (
    ADMIN,
    AGENT_GH,
    AGENT_NG,
    RECIPIENT_GH,
    STUDENT_RW,
    WEBHOOK_SECRET,
    auth,
    top_up,
)


def _pools(client) -> dict:
    data = client.get("/admin/pools", headers=auth(client, ADMIN)).json()
    return {p["country"]: p for p in data["pools"]}


def test_rw_to_gh_full_flow_with_duplicate_webhook(client):
    student = auth(client, STUDENT_RW)
    assert client.get("/auth/me", headers=student).json()["kyc_status"] == "verified"

    # Top up 150,000 RWF; MoMo then retries the same callback.
    dep = top_up(client, student, "150000")
    assert dep["status"] == "SUCCESSFUL" and dep["duplicate"] is False
    dup = client.post(
        "/webhooks/momo",
        json={"reference": dep["momo_reference"], "status": "SUCCESSFUL"},
        headers={"X-Webhook-Secret": WEBHOOK_SECRET},
    )
    assert dup.status_code == 200 and dup.json()["duplicate"] is True
    assert client.get("/wallet", headers=student).json() == {"currency": "RWF", "balance": "150000"}
    assert _pools(client)["RW"]["balance"] == "5150000"

    # Wrong secret is rejected.
    bad = client.post(
        "/webhooks/momo",
        json={"reference": dep["momo_reference"], "status": "SUCCESSFUL"},
        headers={"X-Webhook-Secret": "nope"},
    )
    assert bad.status_code == 401

    # Quote 100,000 RWF -> GHS.
    q = client.post("/quotes", json={"recv_country": "GH", "send_amount": "100000"}, headers=student)
    assert q.status_code == 201, q.text
    quote = q.json()
    assert quote["fee"] == "1500"  # 1.5% of 100,000
    assert quote["net_amount"] == "98500"
    assert quote["rate"] == "0.01058275"  # 15.50/1450 * 0.99, 8dp down
    assert quote["receive_amount"] == "1042.40"  # 98500 * 0.01058275 = 1042.4008.. down
    assert 590 <= quote["expires_in_seconds"] <= 600

    r = client.post("/transfers", json={"quote_id": quote["id"], **RECIPIENT_GH}, headers=student)
    assert r.status_code == 201, r.text
    transfer = r.json()
    assert transfer["status"] == "PAYOUT_PENDING"
    assert client.get("/wallet", headers=student).json()["balance"] == "50000"

    # Quote cannot be reused.
    again = client.post("/transfers", json={"quote_id": quote["id"], **RECIPIENT_GH}, headers=student)
    assert again.status_code == 409

    pools = _pools(client)
    assert pools["GH"]["payable"] == "1042.40"
    assert pools["GH"]["available"] == "48957.60"

    # Ghana agent claims and completes.
    agent = auth(client, AGENT_GH)
    queue = client.get("/agent/payouts", headers=agent).json()
    assert [t["id"] for t in queue] == [transfer["id"]]
    # Nigerian agent can't see or touch it.
    ng = auth(client, AGENT_NG)
    assert client.get("/agent/payouts", headers=ng).json() == []
    assert client.post(f"/agent/payouts/{transfer['id']}/claim", headers=ng).status_code == 404

    r = client.post(f"/agent/payouts/{transfer['id']}/claim", headers=agent)
    assert r.json()["status"] == "IN_PROGRESS"
    r = client.post(
        f"/agent/payouts/{transfer['id']}/complete",
        json={"payout_reference": "MOMO-GH-778899"},
        headers=agent,
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "PAID"
    assert r.json()["payout_reference"] == "MOMO-GH-778899"

    pools = _pools(client)
    assert pools["GH"]["balance"] == "48957.60"
    assert pools["GH"]["payable"] == "0.00"
    fees = client.get("/admin/pools", headers=auth(client, ADMIN)).json()["fees"]
    assert {"currency": "RWF", "earned": "1500"} in fees

    detail = client.get(f"/transfers/{transfer['id']}", headers=student).json()
    assert detail["status"] == "PAID"


def test_failed_payout_refunds_wallet(client):
    student = auth(client, STUDENT_RW)
    top_up(client, student, "20000")
    quote = client.post("/quotes", json={"recv_country": "GH", "send_amount": "10000"}, headers=student).json()
    assert quote["fee"] == "300"  # 1.5% = 150, below the 300 RWF minimum
    t = client.post("/transfers", json={"quote_id": quote["id"], **RECIPIENT_GH}, headers=student).json()
    assert client.get("/wallet", headers=student).json()["balance"] == "10000"

    agent = auth(client, AGENT_GH)
    client.post(f"/agent/payouts/{t['id']}/claim", headers=agent)
    r = client.post(
        f"/agent/payouts/{t['id']}/fail", json={"reason": "Recipient MoMo account blocked"}, headers=agent
    )
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "REFUNDED"
    assert r.json()["failure_reason"] == "Recipient MoMo account blocked"

    # Full refund, fee included, and the GH pool obligation is released.
    assert client.get("/wallet", headers=student).json()["balance"] == "20000"
    assert _pools(client)["GH"]["payable"] == "0.00"

    # Can't complete a refunded payout.
    r = client.post(f"/agent/payouts/{t['id']}/complete", json={"payout_reference": "X-123"}, headers=agent)
    assert r.status_code == 409


def test_pool_too_small_returns_503(client):
    student = auth(client, STUDENT_RW)
    top_up(client, student, "6000000")
    # 6,000,000 RWF ~ 63,000 GHS, but the GH pool only holds 50,000 GHS.
    quote = client.post("/quotes", json={"recv_country": "GH", "send_amount": "6000000"}, headers=student).json()
    r = client.post("/transfers", json={"quote_id": quote["id"], **RECIPIENT_GH}, headers=student)
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "pool_unavailable"
    # Nothing was debited and the quote is still unused.
    assert client.get("/wallet", headers=student).json()["balance"] == "6000000"


def test_unverified_user_gets_403(client):
    r = client.post(
        "/auth/register",
        json={"phone": "+250788555555", "password": "Secret123!", "full_name": "New Student", "country": "RW"},
    )
    assert r.status_code == 201, r.text
    user = r.json()["user"]
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert user["kyc_status"] == "pending" and user["role"] == "student"

    top_up(client, headers, "50000")
    quote = client.post("/quotes", json={"recv_country": "GH", "send_amount": "10000"}, headers=headers).json()
    r = client.post("/transfers", json={"quote_id": quote["id"], **RECIPIENT_GH}, headers=headers)
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "kyc_pending"

    # Admin verifies; the same quote now works.
    admin = auth(client, ADMIN)
    assert client.post(f"/admin/users/{user['id']}/verify-kyc", headers=admin).json()["kyc_status"] == "verified"
    r = client.post("/transfers", json={"quote_id": quote["id"], **RECIPIENT_GH}, headers=headers)
    assert r.status_code == 201, r.text

    # Students can't reach staff endpoints.
    assert client.get("/admin/pools", headers=headers).status_code == 403
    assert client.get("/agent/payouts", headers=headers).status_code == 403


def test_ng_outbound_blocked(client):
    r = client.post(
        "/auth/register",
        json={"phone": "+2348011112222", "password": "Secret123!", "full_name": "Ngozi Okafor", "country": "NG"},
    )
    headers = {"Authorization": f"Bearer {r.json()['access_token']}"}
    r = client.post("/quotes", json={"recv_country": "RW", "send_amount": "10000"}, headers=headers)
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "corridor_unavailable"
    assert "Nigeria" in r.json()["detail"]["message"]
    corridors = client.get("/corridors").json()
    assert {"from_country": "NG", "to_country": "RW"} in [
        {"from_country": c["from_country"], "to_country": c["to_country"]} for c in corridors if not c["enabled"]
    ]


def test_ledger_rejects_unbalanced_and_expired_quote(client):
    from app import ledger

    student = auth(client, STUDENT_RW)
    top_up(client, student, "20000")
    quote = client.post("/quotes", json={"recv_country": "NG", "send_amount": "10000"}, headers=student).json()

    with client.app.state.sessionmaker() as db:
        try:
            ledger.post_journal(
                db,
                key="bad",
                kind="test",
                lines=[ledger.Line("pool:RW", "RWF", 100), ledger.Line("wallet:1", "RWF", -99)],
            )
            raise AssertionError("unbalanced journal was accepted")
        except ledger.LedgerError:
            db.rollback()
        q = db.get(Quote, quote["id"])
        q.expires_at = q.expires_at - timedelta(minutes=11)
        db.commit()

    r = client.post(
        "/transfers",
        json={
            "quote_id": quote["id"],
            "recipient_name": "Chidi Obi",
            "recipient_phone": "+2348031234567",
            "payout_method": "bank",
            "bank_name": "GTBank",
            "bank_account": "0123456789",
        },
        headers=student,
    )
    assert r.status_code == 400
    assert r.json()["detail"]["code"] == "quote_expired"
    check = client.get("/admin/ledger/check", headers=auth(client, ADMIN)).json()
    assert check["balanced"] and check["unbalanced"] == []


def test_money_math_is_exact():
    assert parse_amount("25.50", "GHS") == 2550
    assert format_minor(2550, "GHS") == "25.50"
    assert format_minor(-5, "GHS") == "-0.05"
    for bad in ("1.5", "abc", "-3", "0", "1e5"):
        try:
            parse_amount(bad, "RWF")
            raise AssertionError(f"accepted {bad!r}")
        except ValueError:
            pass
    assert fx.compute_fee(1000, "GHS") == 300  # 10.00 GHS -> min fee 3.00
    assert fx.compute_fee(100_001, "RWF") == 1501  # 1500.015 rounded up
    rate = fx.customer_rate("GHS", "RWF")
    assert str(rate) == "92.61290322"
    assert fx.convert(9700, "GHS", "RWF", rate) == 8983  # 97.00 GHS -> 8983.45 RWF, down
