import secrets
import hashlib
import time
from datetime import datetime, timezone, timedelta
from typing import Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from database import get_db, generate_unique_frank_id
import models
import schemas
from security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    decode_token
)
router = APIRouter(prefix="/api/auth", tags=["Authentication"])


# Rate limiting tracking: key -> list of UTC timestamps
_RESET_RATE_LIMITS = {}


def check_rate_limit(key: str, max_requests: int = 5, window_seconds: int = 900) -> bool:
    now = time.time()
    timestamps = _RESET_RATE_LIMITS.get(key, [])
    timestamps = [t for t in timestamps if now - t < window_seconds]
    if len(timestamps) >= max_requests:
        _RESET_RATE_LIMITS[key] = timestamps
        return False
    timestamps.append(now)
    _RESET_RATE_LIMITS[key] = timestamps
    return True


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(user_in: schemas.UserRegister, request: Request = None, db: Session = Depends(get_db)):
    clean_email = user_in.email.strip().lower()
    clean_username = user_in.username.strip()

    # Rate limiting for registration: max 10 attempts per 15 min per IP
    if request and request.client:
        client_ip = request.client.host
        if not check_rate_limit(f"reg:{client_ip}", max_requests=10, window_seconds=900):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many registration attempts. Please try again in a few minutes."
            )

    # 1. Check email (case-insensitive)
    if db.query(models.User).filter(models.User.email.ilike(clean_email)).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered. Please sign in or reset your password."
        )

    # 2. Check username (case-insensitive)
    if db.query(models.User).filter(models.User.username.ilike(clean_username)).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken. Please choose another one."
        )

    # 3. Generate permanent 6-character unique FRANK ID
    fid = generate_unique_frank_id(db)

    # 4. Create user with normalized email & email_verified = True, is_active = True
    user = models.User(
        frank_id=fid,
        username=clean_username,
        email=clean_email,
        full_name=user_in.full_name.strip(),
        hashed_password=hash_password(user_in.password),
        bio="Hey there! I am using FRANK.",
        email_verified=True,
        is_active=True
    )
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        # Concurrency race condition: duplicate email or username
        if db.query(models.User).filter(models.User.email.ilike(clean_email)).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered. Please sign in or reset your password."
            )
        if db.query(models.User).filter(models.User.username.ilike(clean_username)).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken. Please choose another one."
            )
        # Collision retry
        fid = generate_unique_frank_id(db)
        user.frank_id = fid
        try:
            db.add(user)
            db.commit()
            db.refresh(user)
        except Exception:
            db.rollback()
            raise HTTPException(status_code=500, detail="Account registration could not be completed.")

    return {
        "success": True,
        "message": "Account created successfully! Your FRANK account is ready. You can now sign in.",
        "email": clean_email,
        "frank_id": fid
    }


@router.post("/login", response_model=schemas.Token)
def login(login_data: schemas.UserLogin, db: Session = Depends(get_db)):
    identifier = login_data.username.strip()
    identifier_lower = identifier.lower()

    # Allow login by username (case-insensitive) or normalized email
    user = db.query(models.User).filter(
        (models.User.username == identifier) |
        (models.User.username.ilike(identifier)) |
        (models.User.email == identifier_lower) |
        (models.User.email.ilike(identifier_lower))
    ).first()

    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Check active status
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been disabled. Please contact an administrator."
        )

    # Guarantee user has a permanent frank_id (for any legacy accounts)
    # Once assigned, NEVER regenerate frank_id on login
    if not user.frank_id:
        user.frank_id = generate_unique_frank_id(db)
        db.commit()
        db.refresh(user)

    # Issue token
    token_str = create_access_token(
        data={"sub": user.username, "user_id": user.id},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return schemas.Token(
        access_token=token_str,
        token_type="bearer",
        user=schemas.UserResponse.from_orm(user)
    )


class EnsureFrankIdRequest(BaseModel):
    preferred_id: Optional[str] = None


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not current_user.frank_id or len(str(current_user.frank_id).strip()) != 6:
        current_user.frank_id = generate_unique_frank_id(db)
        try:
            db.commit()
            db.refresh(current_user)
        except Exception:
            db.rollback()
    return current_user


@router.post("/ensure-frank-id", response_model=schemas.UserResponse)
def ensure_frank_id(
    body: Optional[EnsureFrankIdRequest] = None,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not current_user.frank_id or len(str(current_user.frank_id).strip()) != 6:
        if body and body.preferred_id and len(body.preferred_id.strip()) == 6:
            candidate = body.preferred_id.strip().upper()
            existing = db.query(models.User).filter(models.User.frank_id == candidate).first()
            if not existing:
                current_user.frank_id = candidate
        if not current_user.frank_id:
            current_user.frank_id = generate_unique_frank_id(db)
        try:
            db.commit()
            db.refresh(current_user)
        except Exception:
            db.rollback()
    return current_user



@router.post("/forgot-password")
def forgot_password(req: schemas.ForgotPasswordRequest, request: Request = None, db: Session = Depends(get_db)):
    return {
        "success": False,
        "message": "Password recovery is currently unavailable. Please contact an administrator."
    }


@router.get("/verify-reset-token")
def verify_reset_token(token: str, db: Session = Depends(get_db)):
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Password recovery is currently unavailable. Please contact an administrator."
    )


@router.post("/reset-password")
def reset_password(req: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Password recovery is currently unavailable. Please contact an administrator."
    )


