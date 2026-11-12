from __future__ import annotations

from collections.abc import Iterator

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .config import Settings
from .models import User
from .security import decode_token

_bearer = HTTPBearer(auto_error=False)


def api_error(status: int, code: str, message: str) -> HTTPException:
    """All domain errors use detail = {"code": ..., "message": ...}."""
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def get_db(request: Request) -> Iterator[Session]:
    db: Session = request.app.state.sessionmaker()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings_dep),
) -> User:
    if creds is None:
        raise api_error(401, "not_authenticated", "Please log in.")
    user_id = decode_token(creds.credentials, settings)
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise api_error(401, "invalid_token", "Your session has expired. Please log in again.")
    return user


def require_role(*roles: str):
    def _dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise api_error(403, "forbidden", "You do not have access to this action.")
        return user

    return _dep
