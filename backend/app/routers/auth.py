from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import Settings
from ..deps import api_error, get_current_user, get_db, get_settings_dep
from ..models import Kyc, Role, User
from ..phones import PHONE_EXAMPLES, normalize_phone, valid_phone
from ..security import create_token, hash_password, verify_password
from ..serialize import user_out

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterIn(BaseModel):
    phone: str
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=120)
    country: Literal["RW", "GH", "NG"]


class LoginIn(BaseModel):
    phone: str
    password: str


def _token_response(user: User, settings: Settings) -> dict:
    return {
        "access_token": create_token(user.id, user.role, settings),
        "token_type": "bearer",
        "user": user_out(user),
    }


@router.post("/register", status_code=201)
def register(
    body: RegisterIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    phone = normalize_phone(body.phone)
    if not valid_phone(phone, body.country):
        raise api_error(
            400,
            "invalid_phone",
            f"Enter the phone in international format for {body.country}, e.g. {PHONE_EXAMPLES[body.country]}.",
        )
    if db.scalar(select(User.id).where(User.phone == phone)):
        raise api_error(409, "phone_taken", "An account with this phone number already exists.")
    user = User(
        phone=phone,
        full_name=body.full_name.strip(),
        country=body.country,
        role=Role.STUDENT,
        kyc_status=Kyc.PENDING,
        password_hash=hash_password(body.password, settings.pbkdf2_iterations),
    )
    db.add(user)
    db.commit()
    return _token_response(user, settings)


@router.post("/login")
def login(
    body: LoginIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
):
    user = db.scalar(select(User).where(User.phone == normalize_phone(body.phone)))
    if user is None or not verify_password(body.password, user.password_hash):
        raise api_error(401, "invalid_credentials", "Phone number or password is incorrect.")
    return _token_response(user, settings)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)
