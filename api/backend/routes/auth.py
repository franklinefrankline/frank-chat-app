import secrets
import hashlib
import time
from datetime import datetime, timezone, timedelta
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
from services.email import (
    send_verification_email,
    send_password_reset_email,
    get_frontend_url
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

    # 4. Create user with normalized email & email_verified = False
    user = models.User(
        frank_id=fid,
        username=clean_username,
        email=clean_email,
        full_name=user_in.full_name.strip(),
        hashed_password=hash_password(user_in.password),
        bio="Hey there! I am using FRANK.",
        email_verified=False
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

    # 5. Generate secure email verification token (32 bytes urlsafe)
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

    verif_token = models.EmailVerificationToken(
        user_id=user.id,
        token_hash=token_hash,
        expires_at=expires_at,
        used=False
    )
    db.add(verif_token)
    db.commit()

    # 6. Send verification email via Resend
    frontend_base = get_frontend_url()
    verify_url = f"{frontend_base}/verify-email?token={raw_token}"
    try:
        send_verification_email(
            to_email=user.email,
            verify_url=verify_url,
            user_name=user.full_name
        )
    except Exception as email_err:
        print(f"[AUTH ERROR] Failed to dispatch verification email: {email_err}")

    return {
        "message": "Account created successfully. We've sent a verification link to your email. Please verify your email before signing in.",
        "email": clean_email,
        "email_verified": False,
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

    # Check email verification status
    if not user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before signing in."
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


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.get("/verify-email", response_model=schemas.VerifyEmailResponse)
def verify_email(token: str, db: Session = Depends(get_db)):
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token is required."
        )

    token_hash = hashlib.sha256(token.strip().encode("utf-8")).hexdigest()
    record = db.query(models.EmailVerificationToken).filter(
        models.EmailVerificationToken.token_hash == token_hash
    ).first()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification link."
        )

    if record.used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link has already been used. Please sign in."
        )

    now_utc = datetime.now(timezone.utc)
    rec_expires = record.expires_at
    if rec_expires.tzinfo is None:
        rec_expires = rec_expires.replace(tzinfo=timezone.utc)

    if now_utc > rec_expires:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link has expired. Please request a new verification email."
        )

    user = db.query(models.User).filter(models.User.id == record.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account not found."
        )

    # If already verified
    if user.email_verified:
        record.used = True
        db.commit()
        return {
            "success": True,
            "message": "Email already verified. Your FRANK account is active.",
            "email_verified": True
        }

    # Mark user as email_verified = True
    user.email_verified = True
    record.used = True

    # Invalidate other pending verification tokens for this user
    db.query(models.EmailVerificationToken).filter(
        models.EmailVerificationToken.user_id == user.id,
        models.EmailVerificationToken.used == False
    ).update({"used": True}, synchronize_session=False)

    db.commit()

    return {
        "success": True,
        "message": "Email verified successfully! Your FRANK account is now active.",
        "email_verified": True
    }


@router.post("/resend-verification")
def resend_verification(req: schemas.ResendVerificationRequest, request: Request, db: Session = Depends(get_db)):
    clean_email = req.email.strip().lower()
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"resend_verif:{client_ip}:{clean_email}"

    if not check_rate_limit(rate_key, max_requests=5, window_seconds=900):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification requests. Please wait a few minutes and try again."
        )

    user = db.query(models.User).filter(models.User.email == clean_email).first()

    # Only send if account exists and is not already verified
    if user and not user.email_verified:
        # Invalidate previous unused verification tokens
        db.query(models.EmailVerificationToken).filter(
            models.EmailVerificationToken.user_id == user.id,
            models.EmailVerificationToken.used == False
        ).update({"used": True}, synchronize_session=False)

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)

        verif_token = models.EmailVerificationToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            used=False
        )
        db.add(verif_token)
        db.commit()

        frontend_base = get_frontend_url()
        verify_url = f"{frontend_base}/verify-email?token={raw_token}"
        try:
            send_verification_email(
                to_email=user.email,
                verify_url=verify_url,
                user_name=user.full_name
            )
        except Exception as email_err:
            print(f"[AUTH ERROR] Failed to resend verification email: {email_err}")

    # Generic response for email enumeration protection
    return {
        "message": "If an unverified account exists with this email, a new verification link has been sent."
    }


@router.post("/forgot-password")
def forgot_password(req: schemas.ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    clean_email = req.email.strip().lower()

    # Rate limit by client IP and normalized email
    client_ip = request.client.host if request.client else "unknown"
    rate_key = f"pwd_reset:{client_ip}:{clean_email}"
    if not check_rate_limit(rate_key, max_requests=5, window_seconds=900):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password reset requests. Please wait a few minutes and try again."
        )

    # 1. Look up user quietly without revealing existence (email enumeration protection)
    user = db.query(models.User).filter(models.User.email == clean_email).first()

    if user:
        # 2. Invalidate previous unused reset tokens for this user
        db.query(models.PasswordResetToken).filter(
            models.PasswordResetToken.user_id == user.id,
            models.PasswordResetToken.used == False
        ).update({"used": True}, synchronize_session=False)

        # 3. Generate cryptographically secure random 32-byte token
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

        # 4. Expiration: 30 minutes from now (UTC)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)

        # 5. Store ONLY the token hash in the database
        reset_record = models.PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            used=False
        )
        db.add(reset_record)
        db.commit()

        # 6. Build reset URL pointing to FRONTEND_URL
        frontend_base = get_frontend_url()
        reset_url = f"{frontend_base}/reset-password?token={raw_token}"

        # 7. Dispatch email via Resend
        try:
            send_password_reset_email(
                to_email=user.email,
                reset_url=reset_url,
                user_name=user.full_name
            )
        except Exception as email_err:
            print(f"[AUTH ERROR] Failed to dispatch reset email: {email_err}")

    # Generic security response: never reveal whether the email exists
    return {
        "message": "If an account exists with this email, password reset instructions have been sent."
    }


@router.get("/verify-reset-token", response_model=schemas.VerifyResetTokenResponse)
def verify_reset_token(token: str, db: Session = Depends(get_db)):
    if not token or not token.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token is required."
        )

    token_hash = hashlib.sha256(token.strip().encode("utf-8")).hexdigest()
    record = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token_hash == token_hash
    ).first()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link."
        )

    if record.used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset link is invalid or has already been used."
        )

    now_utc = datetime.now(timezone.utc)
    # Handle timezone-aware and naive comparison safely
    record_expires = record.expires_at
    if record_expires.tzinfo is None:
        record_expires = record_expires.replace(tzinfo=timezone.utc)

    if now_utc > record_expires:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link has expired. Please request a new password reset link."
        )

    return {"valid": True, "message": "Token is valid."}


@router.post("/reset-password")
def reset_password(req: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    raw_token = req.token.strip()
    if not raw_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token is required."
        )

    if len(req.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long."
        )

    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    record = db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.token_hash == token_hash
    ).first()

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link."
        )

    if record.used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This password reset link is invalid or has already been used."
        )

    now_utc = datetime.now(timezone.utc)
    record_expires = record.expires_at
    if record_expires.tzinfo is None:
        record_expires = record_expires.replace(tzinfo=timezone.utc)

    if now_utc > record_expires:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link has expired. Please request a new password reset link."
        )

    user = db.query(models.User).filter(models.User.id == record.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User account associated with this reset link does not exist."
        )

    # 1. Update password using PBKDF2-HMAC-SHA256
    user.hashed_password = hash_password(req.new_password)
    user.updated_at = datetime.now(timezone.utc)

    # 2. Mark this token as used
    record.used = True

    # 3. Invalidate any other active reset tokens for this user
    db.query(models.PasswordResetToken).filter(
        models.PasswordResetToken.user_id == user.id,
        models.PasswordResetToken.used == False
    ).update({"used": True}, synchronize_session=False)

    db.commit()

    return {
        "success": True,
        "message": "Password reset successfully. Your password has been updated."
    }
