from datetime import UTC, datetime, timedelta

import structlog
from fastapi import Depends, HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, ValidationError
from sqlalchemy import text

from app.platform.config.config import settings

logger = structlog.get_logger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer()


class TokenData(BaseModel):
    user_id: str
    email: str
    role: str


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(UTC) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode["exp"] = expire
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> TokenData:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        email = payload.get("email")
        role = payload.get("role", "viewer")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return TokenData(user_id=user_id, email=email, role=role)
    except (JWTError, ValidationError) as e:
        logger.warning("auth.token_invalid", error=str(e))
        raise HTTPException(status_code=401, detail="Could not validate credentials") from e


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(bearer_scheme),
) -> TokenData:
    token_data = decode_token(credentials.credentials)
    from app.platform.db.database import AsyncSessionLocal

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                'SELECT email, role, "isActive", "employmentStatus" '
                'FROM "User" WHERE id = :user_id'
            ),
            {"user_id": token_data.user_id},
        )
        user = result.mappings().first()
    if (
        not user
        or not user["isActive"]
        or user["employmentStatus"] in {"suspended", "terminated"}
    ):
        raise HTTPException(status_code=401, detail="Account is not active")
    return TokenData(
        user_id=token_data.user_id,
        email=user["email"],
        role=user["role"],
    )


def require_roles(*roles: str):
    async def _check(current_user: TokenData = Depends(get_current_user)) -> TokenData:
        if current_user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return current_user
    return _check
