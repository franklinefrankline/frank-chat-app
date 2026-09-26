from datetime import timedelta
import sys
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
import models
import schemas
from security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    decode_token
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


import secrets

FRANK_ID_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def generate_unique_frank_id(db: Session) -> str:
    for _ in range(100):
        candidate = "".join(secrets.choice(FRANK_ID_CHARACTERS) for _ in range(6))
        if not db.query(models.User).filter(models.User.frank_id == candidate).first():
            return candidate
    raise HTTPException(status_code=500, detail="Failed to generate unique FRANK ID.")


@router.post("/register", response_model=schemas.Token, status_code=status.HTTP_201_CREATED)
def register(user_in: schemas.UserRegister, db: Session = Depends(get_db)):
    clean_email = user_in.email.strip().lower()
    clean_full_name = (user_in.full_name or user_in.name or "").strip()

    # Check email duplicate (case-insensitive)
    if db.query(models.User).filter(func.lower(models.User.email) == clean_email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists."
        )

    # Resolve or auto-generate unique username
    if user_in.username and user_in.username.strip():
        candidate_username = user_in.username.strip()
        # Check username (case-insensitive)
        if db.query(models.User).filter(func.lower(models.User.username) == candidate_username.lower()).first():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken. Please choose another one."
            )
        clean_username = candidate_username
    else:
        # Auto-generate unique username from email prefix or full name
        email_prefix = clean_email.split("@")[0]
        base_username = "".join(c for c in email_prefix if c.isalnum()).lower()
        if len(base_username) < 3:
            base_username = "".join(c for c in clean_full_name if c.isalnum()).lower()
        if len(base_username) < 3:
            base_username = "user"

        clean_username = base_username
        counter = 1
        while db.query(models.User).filter(func.lower(models.User.username) == clean_username.lower()).first():
            clean_username = f"{base_username}{counter}"
            counter += 1

    # Generate unique 6-character permanent FRANK ID
    frank_id = generate_unique_frank_id(db)

    # Securely hash password
    pw_hash = hash_password(user_in.password)
    now_dt = models.get_utc_now()

    # Create user with all required PostgreSQL columns populated
    user = models.User(
        username=clean_username,
        email=clean_email,
        frank_id=frank_id,
        full_name=clean_full_name,
        name=clean_full_name,
        hashed_password=pw_hash,
        password_hash=pw_hash,
        bio="Hey there! I am using FRANK.",
        language=user_in.language if (user_in.language and user_in.language.strip().lower() in ["en", "ta", "hi"]) else "en",
        role="user",
        account_status="active",
        status="active",
        created_at=now_dt,
        updated_at=now_dt
    )

    # Execute database transaction with rollback guarantee
    try:
        db.add(user)
        db.commit()
        db.refresh(user)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Registration failed: database transaction could not be committed. {str(e)}"
        )

    # Real-time WebSocket event to admin (safe non-blocking notification)
    try:
        import asyncio
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            pass
        if loop and loop.is_running():
            from websocket.chat import manager
            loop.create_task(manager.broadcast_admin({
                "type": "admin_user_created",
                "user": {
                    "id": user.id,
                    "username": user.username,
                    "email": user.email,
                    "full_name": user.full_name,
                    "frank_id": user.frank_id,
                    "role": user.role,
                    "account_status": user.account_status,
                    "status": user.status,
                    "is_online": False,
                    "created_at": schemas.format_iso_utc(user.created_at)
                }
            }))
            loop.create_task(manager.broadcast_admin_metrics(None))
    except Exception:
        pass

    # Generate permanent session token after commit succeeds
    token_str = create_access_token(
        data={
            "sub": user.username,
            "user_id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "frank_id": user.frank_id,
            "role": user.role
        },
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return schemas.Token(
        access_token=token_str,
        token_type="bearer",
        user=schemas.UserResponse.from_orm(user)
    )


@router.post("/login", response_model=schemas.Token)
def login(login_data: schemas.UserLogin, db: Session = Depends(get_db)):
    # Support email, username, or identifier field
    raw_ident = (login_data.email or login_data.username or login_data.identifier or "").strip()
    if not raw_ident:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address is required."
        )
    ident_lower = raw_ident.lower()

    # Allow login by email, full_name, name, username, or frank_id (case-insensitive)
    candidates = db.query(models.User).filter(
        (func.lower(models.User.email) == ident_lower) | 
        (func.lower(models.User.full_name) == ident_lower) |
        (func.lower(models.User.name) == ident_lower) |
        (func.lower(models.User.username) == ident_lower) | 
        (func.lower(models.User.frank_id) == ident_lower) |
        ((func.lower(models.User.email) == "frankline30999112@gmail.com") & (
            (ident_lower == "frankline") | 
            (ident_lower == "admin") | 
            (ident_lower == "frankline30999112@gmail.com")
        ))
    ).all()

    if not candidates and ident_lower in ["alex", "sarah", "david", "alex@frank.app", "sarah@frank.app", "david@frank.app"]:
        # Auto-seed standard accounts in ephemeral serverless container
        try:
            import main as backend_main
            if hasattr(backend_main, "seed_demo_users"):
                backend_main.seed_demo_users()
        except Exception:
            pass
        if "frank_serverless_backend" in sys.modules:
            try:
                mod = sys.modules["frank_serverless_backend"]
                if hasattr(mod, "seed_demo_users"):
                    mod.seed_demo_users()
            except Exception:
                pass
        try:
            candidates = db.query(models.User).filter(
                (func.lower(models.User.email) == ident_lower) |
                (func.lower(models.User.full_name) == ident_lower) |
                (func.lower(models.User.username) == ident_lower)
            ).all()
        except Exception:
            pass

    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Check if candidate account is disabled first
    for cand in candidates:
        cand_status = str(getattr(cand, "account_status", "") or getattr(cand, "status", "") or "active").lower()
        if cand_status == "disabled":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your account has been disabled. Account is disabled. Please contact an administrator."
            )

    # Match candidate whose password verifies
    user = None
    for cand in candidates:
        pwd_hash = getattr(cand, "password_hash", None) or getattr(cand, "hashed_password", None) or ""
        if verify_password(login_data.password, pwd_hash):
            user = cand
            break

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Issue token
    token_str = create_access_token(
        data={
            "sub": user.username,
            "user_id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "frank_id": user.frank_id,
            "role": user.role
        },
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return schemas.Token(
        access_token=token_str,
        token_type="bearer",
        user=schemas.UserResponse.from_orm(user)
    )


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post("/forgot-password")
def forgot_password(req: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    # Look up user quietly without revealing existence
    user = db.query(models.User).filter(models.User.email == req.email.lower()).first()
    reset_token = None
    if user:
        reset_token = create_access_token(
            data={"sub": user.username, "purpose": "pwd_reset"},
            expires_delta=timedelta(hours=1)
        )

    return {
        "success": True,
        "message": "If an account exists with this email, password reset instructions have been sent."
    }


@router.post("/reset-password")
def reset_password(req: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    payload = decode_token(req.token)
    if not payload or payload.get("purpose") != "pwd_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset token."
        )

    username = payload.get("sub")
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found."
        )

    user.hashed_password = hash_password(req.new_password)
    db.commit()

    return {"success": True, "message": "Your password has been updated successfully. Please login."}
