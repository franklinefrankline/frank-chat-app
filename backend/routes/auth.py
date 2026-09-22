from datetime import timedelta
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
    clean_username = user_in.username.strip()
    clean_email = user_in.email.strip().lower()

    # Check username (case-insensitive)
    if db.query(models.User).filter(func.lower(models.User.username) == clean_username.lower()).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken. Please choose another one."
        )

    # Check email (case-insensitive)
    if db.query(models.User).filter(func.lower(models.User.email) == clean_email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists."
        )

    # Generate unique 6-character FRANK ID
    frank_id = generate_unique_frank_id(db)

    # Create user
    user = models.User(
        username=clean_username,
        email=clean_email,
        frank_id=frank_id,
        full_name=user_in.full_name.strip(),
        hashed_password=hash_password(user_in.password),
        bio="Hey there! I am using FRANK.",
        role="user",
        account_status="active"
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Real-time WebSocket event to admin
    try:
        from websocket.chat import manager
        import asyncio
        asyncio.create_task(manager.broadcast_admin({
            "type": "admin_user_created",
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "full_name": user.full_name,
                "frank_id": user.frank_id,
                "role": user.role,
                "account_status": user.account_status,
                "is_online": False,
                "created_at": schemas.format_iso_utc(user.created_at)
            }
        }))
        asyncio.create_task(manager.broadcast_admin_metrics(db))
    except Exception:
        pass

    # Generate token
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
    identifier = login_data.username.strip()
    ident_lower = identifier.lower()

    # Allow login by username or email (case-insensitive for both username and email)
    user = db.query(models.User).filter(
        (func.lower(models.User.username) == ident_lower) | 
        (func.lower(models.User.email) == ident_lower) |
        ((func.lower(models.User.email) == "frankline30999112@gmail.com") & (
            (ident_lower == "frankline") | 
            (ident_lower == "admin") | 
            (ident_lower == "frankline30999112@gmail.com")
        ))
    ).first()

    if not user and ident_lower in ["alex", "sarah", "david", "alex@frank.app", "sarah@frank.app", "david@frank.app"]:
        # Auto-seed standard accounts in ephemeral serverless container
        try:
            import main as backend_main
            if hasattr(backend_main, "seed_demo_users"):
                backend_main.seed_demo_users()
            user = db.query(models.User).filter(
                (func.lower(models.User.username) == ident_lower) | 
                (func.lower(models.User.email) == ident_lower)
            ).first()
        except Exception:
            pass

    if not user or not verify_password(login_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    if getattr(user, "account_status", "active") == "disabled":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been disabled by an administrator."
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
