from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.seed import PASSWORD, seed

WEBHOOK_SECRET = "test-webhook-secret"

ADMIN = "+250788000000"
AGENT_RW = "+250788000001"
AGENT_GH = "+233240000001"
AGENT_NG = "+2348030000001"
STUDENT_RW = "+250788000010"


@pytest.fixture()
def client(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        jwt_secret="test-jwt-secret-that-is-at-least-32-bytes",
        webhook_secret=WEBHOOK_SECRET,
        pbkdf2_iterations=1_000,
    )
    app = create_app(settings)
    with TestClient(app) as c:
        with app.state.sessionmaker() as db:
            seed(db, settings.pbkdf2_iterations)
        yield c
        # Every test ends with a balanced ledger.
        check = c.get("/admin/ledger/check", headers=auth(c, ADMIN)).json()
        assert check["balanced"], check


def auth(client: TestClient, phone: str, password: str = PASSWORD) -> dict:
    r = client.post("/auth/login", json={"phone": phone, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def top_up(client: TestClient, headers: dict, amount: str) -> dict:
    r = client.post("/deposits", json={"amount": amount}, headers=headers)
    assert r.status_code == 201, r.text
    dep = r.json()
    r = client.post(
        "/webhooks/momo",
        json={"reference": dep["momo_reference"], "status": "SUCCESSFUL"},
        headers={"X-Webhook-Secret": WEBHOOK_SECRET},
    )
    assert r.status_code == 200, r.text
    return r.json()


RECIPIENT_GH = {
    "recipient_name": "Kwame Mensah",
    "recipient_phone": "+233241234567",
    "payout_method": "momo",
}
