"""Seed demo data: python -m app.seed

Creates an admin, one agent per country, a KYC-verified Rwandan student, and
prefunds the country pools. Safe to run more than once.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from . import ledger
from .config import get_settings
from .db import Base, make_engine, make_sessionmaker
from .models import JournalTxn, Kyc, Role, User
from .money import COUNTRY_CURRENCY
from .security import hash_password

PASSWORD = "Password123!"

USERS = [
    # phone, name, country, role, kyc
    ("+250788000000", "SikaBridge Admin", "RW", Role.ADMIN, Kyc.VERIFIED),
    ("+250788000001", "Agent Kigali", "RW", Role.AGENT, Kyc.VERIFIED),
    ("+233240000001", "Agent Accra", "GH", Role.AGENT, Kyc.VERIFIED),
    ("+2348030000001", "Agent Lagos", "NG", Role.AGENT, Kyc.VERIFIED),
    ("+250788000010", "Aline Student", "RW", Role.STUDENT, Kyc.VERIFIED),
]

# Pool prefunding in minor units: RW 5,000,000 RWF / GH 50,000.00 GHS / NG 5,000,000.00 NGN
POOL_FUNDING = {"RW": 5_000_000, "GH": 5_000_000, "NG": 500_000_000}


def seed(db: Session, pbkdf2_iterations: int) -> None:
    for phone, name, country, role, kyc in USERS:
        if db.scalar(select(User.id).where(User.phone == phone)):
            continue
        db.add(
            User(
                phone=phone,
                full_name=name,
                country=country,
                role=role,
                kyc_status=kyc,
                password_hash=hash_password(PASSWORD, pbkdf2_iterations),
            )
        )
    db.flush()

    for country, amount in POOL_FUNDING.items():
        key = f"seed:fund:{country}"
        if db.scalar(select(JournalTxn.id).where(JournalTxn.idempotency_key == key)):
            continue
        cur = COUNTRY_CURRENCY[country]
        ledger.post_journal(
            db,
            key=key,
            kind="pool_fund",
            memo=f"Seed prefund {country}",
            lines=[
                ledger.Line(ledger.pool(country), cur, amount),
                ledger.Line(ledger.equity(cur), cur, -amount),
            ],
        )
    db.commit()


def main() -> None:
    settings = get_settings()
    engine = make_engine(settings.database_url)
    Base.metadata.create_all(engine)
    with make_sessionmaker(engine)() as db:
        seed(db, settings.pbkdf2_iterations)
    print("Seeded. All users have password", PASSWORD)
    for phone, name, _c, role, _k in USERS:
        print(f"  {role:8} {phone:16} {name}")


if __name__ == "__main__":
    main()
