import os
import hashlib
import hmac
import secrets
import re
import urllib.parse
from datetime import timedelta, timezone
from typing import Tuple, Optional
import sys
import httpx
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from database import get_db
import models
import schemas
from security import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    get_current_user_optional,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    decode_token
)
from services.email_service import email_service

router = APIRouter(prefix="/auth", tags=["Authentication"])

FRANK_ID_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def get_frontend_base_url(request: Optional[Request] = None) -> str:
    """
    Resolves the frontend base URL accurately:
    - If a valid request is passed with a host, matches that host (e.g. https://fnk.vercel.app).
    - Production: Uses FRONTEND_URL environment variable, defaulting to https://fnk.vercel.app.
    - Local development: Uses FRONTEND_URL or defaults to http://localhost:8000.
    - Guarantees valid protocol (https:// or http://) and strips trailing slashes.
    """
    if request:
        req_host = (request.headers.get("x-forwarded-host") or request.headers.get("host") or "").split(",")[0].strip()
        if req_host:
            proto = request.headers.get("x-forwarded-proto", "https" if ("vercel" in req_host or "fnk." in req_host) else "http")
            if "localhost" in req_host or "127.0.0.1" in req_host:
                return f"http://{req_host}".rstrip("/")
            return f"{proto}://{req_host}".rstrip("/")
    """
    Resolves the frontend base URL accurately:
    - Production: Uses FRONTEND_URL environment variable, defaulting to https://frank-chat-app.vercel.app in Vercel/production environments.
    - Local development: Uses FRONTEND_URL or defaults to http://localhost:8000.
    - Guarantees valid protocol (https:// or http://) and strips trailing slashes.
    - NEVER leaks localhost or 127.0.0.1 into production reset emails.
    """
    raw = (os.getenv("FRONTEND_URL") or "").strip()
    db_url = os.getenv("DATABASE_URL", "").lower()
    is_neon_db = "neon.tech" in db_url or "aws" in db_url or "postgres" in db_url
    is_vercel = os.getenv("VERCEL") == "1" or bool(os.getenv("VERCEL_ENV")) or bool(os.getenv("VERCEL_URL"))
    is_prod_env = (os.getenv("ENVIRONMENT", "").lower() == "production") or is_neon_db or is_vercel

    if is_prod_env:
        if not raw or "localhost" in raw or "127.0.0.1" in raw:
            raw = "https://fnk.vercel.app"
    else:
        if not raw:
            port = os.getenv("PORT", "8000")
            raw = f"http://localhost:{port}"

    # If protocol is missing, ensure valid scheme
    if not raw.startswith("http://") and not raw.startswith("https://"):
        if "localhost" in raw or "127.0.0.1" in raw:
            raw = f"http://{raw}"
        else:
            raw = f"https://{raw}"

    # In production or Vercel, never allow localhost fallback
    if is_prod_env and ("localhost" in raw or "127.0.0.1" in raw):
        raw = "https://fnk.vercel.app"

    return raw.rstrip("/")


def build_password_reset_url(email: str, token: str) -> str:
    """
    Constructs an absolute, valid password reset URL with URL-encoded query parameters.
    """
    base = get_frontend_base_url()
    safe_email = urllib.parse.quote(email.strip().lower())
    safe_token = urllib.parse.quote(token.strip())
    return f"{base}/reset-password.html?email={safe_email}&token={safe_token}"


def generate_unique_frank_id(db: Session) -> str:
    for _ in range(100):
        candidate = "".join(secrets.choice(FRANK_ID_CHARACTERS) for _ in range(6))
        if not db.query(models.User).filter(models.User.frank_id == candidate).first():
            return candidate
    raise HTTPException(status_code=500, detail="Failed to generate unique FRANK ID.")


def generate_otp(length: int = 6) -> str:
    """Generate cryptographically secure numeric OTP"""
    return "".join(secrets.choice("0123456789") for _ in range(length))


def hash_otp_code(code: str) -> str:
    """Hash OTP with random 16-byte salt for secure storage"""
    salt = os.urandom(16).hex()
    hashed = hashlib.sha256(f"{salt}:{code.strip()}".encode("utf-8")).hexdigest()
    return f"{salt}${hashed}"


def verify_otp_code(candidate: str, stored_hash: str) -> bool:
    """Timing-safe OTP verification against salted hash"""
    if not stored_hash or "$" not in stored_hash:
        return False
    try:
        parts = stored_hash.split("$", 1)
        if len(parts) != 2:
            return False
        salt, expected_hash = parts
        candidate_hash = hashlib.sha256(f"{salt}:{candidate.strip()}".encode("utf-8")).hexdigest()
        return hmac.compare_digest(candidate_hash, expected_hash)
    except Exception:
        return False



def check_and_consume_otp(
    db: Session, clean_email: str, purpose: str, candidate_code: str
) -> Tuple[bool, Optional[models.OTPCode], str]:
    """
    Validates a candidate OTP against all active, unexpired OTP records for the given email and purpose.
    Prevents race conditions where earlier sent emails arriving out-of-order were rejected.
    Consumes all active codes on success to prevent reuse.
    """
    clean_candidate = (candidate_code or "").strip()
    if not clean_candidate or len(clean_candidate) != 6 or not clean_candidate.isdigit():
        return False, None, "Please enter a valid 6-digit verification code."

    now_dt = models.get_utc_now()
    active_codes = (
        db.query(models.OTPCode)
        .filter(
            func.lower(models.OTPCode.email) == clean_email.lower(),
            models.OTPCode.purpose == purpose,
            models.OTPCode.is_used == False,
            models.OTPCode.expires_at > now_dt,
        )
        .order_by(models.OTPCode.id.desc())
        .all()
    )

    if not active_codes:
        return False, None, "Verification code is invalid or has expired. Please request a new code."

    matched = None
    for rec in active_codes:
        if rec.attempts >= rec.max_attempts:
            continue
        if verify_otp_code(clean_candidate, rec.code_hash):
            matched = rec
            break

    if matched:
        # Code is correct! Mark all active codes for this email and purpose as used
        for rec in active_codes:
            rec.is_used = True
        db.commit()
        return True, matched, "Verification successful."
    else:
        # Candidate did not match any active unexpired code. Increment attempts on newest
        newest = active_codes[0]
        newest.attempts += 1
        if newest.attempts >= newest.max_attempts:
            newest.is_used = True
        db.commit()
        remaining = max(0, newest.max_attempts - newest.attempts)
        if remaining > 0:
            return (
                False,
                None,
                f"Invalid verification code. {remaining} attempt{'s' if remaining != 1 else ''} remaining. Please check your latest email or Spam folder.",
            )
        else:
            return (
                False,
                None,
                "Maximum verification attempts exceeded. Please request a new verification code.",
            )


@router.post("/register", response_model=schemas.Token, status_code=status.HTTP_201_CREATED)
def register(user_in: schemas.UserRegister, request: Request, response: Response, db: Session = Depends(get_db)):
    # Check if admin-only mode is explicitly enabled (default: false to allow registration)
    if os.getenv("ADMIN_ONLY_MODE", "false").lower() in ["true", "1", "yes"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration is currently disabled. Access is restricted to the administrator."
        )

    clean_email = user_in.email.strip().lower()
    clean_full_name = (user_in.full_name or user_in.name or "").strip()

    # Check email duplicate (case-insensitive) against active non-deleted accounts
    active_email_user = db.query(models.User).filter(
        func.lower(models.User.email) == clean_email,
        or_(models.User.status.is_(None), models.User.status != "deleted"),
        or_(models.User.account_status.is_(None), models.User.account_status != "deleted")
    ).first()
    if active_email_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists."
        )

    # If verification_token or otp_code was provided: verify it against active registration OTP records
    now_dt = models.get_utc_now()
    if user_in.verification_token and user_in.verification_token.strip():
        tok = user_in.verification_token.strip()
        otp_cand = db.query(models.OTPCode).filter(
            models.OTPCode.email == clean_email,
            models.OTPCode.purpose == "registration",
            models.OTPCode.token == tok,
            models.OTPCode.expires_at > now_dt
        ).first()
        if not otp_cand:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification session has expired or is invalid. Please request a new code."
            )
        otp_cand.is_used = True
        db.commit()
    elif user_in.otp_code and user_in.otp_code.strip():
        ok, matched_rec, err_msg = check_and_consume_otp(
            db, clean_email, "registration", user_in.otp_code.strip()
        )
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg
            )
    else:
        if email_service.is_configured():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email verification code is required to complete registration. Please verify your email."
            )

    # Resolve or auto-generate unique username
    if user_in.username and user_in.username.strip():
        candidate_username = user_in.username.strip()
        # Check username (case-insensitive) against active non-deleted accounts
        if db.query(models.User).filter(
            func.lower(models.User.username) == candidate_username.lower(),
            or_(models.User.status.is_(None), models.User.status != "deleted"),
            or_(models.User.account_status.is_(None), models.User.account_status != "deleted")
        ).first():
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
        while db.query(models.User).filter(
            func.lower(models.User.username) == clean_username.lower(),
            or_(models.User.status.is_(None), models.User.status != "deleted"),
            or_(models.User.account_status.is_(None), models.User.account_status != "deleted")
        ).first():
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
        is_active=True,
        created_at=now_dt,
        updated_at=now_dt
    )

    # Execute database transaction with rollback guarantee
    try:
        db.add(user)
        db.commit()
        db.refresh(user)

        # DPDP Act 2023: Record notice acceptance and default consent entries
        initial_consents = [
            models.ConsentRecord(
                user_id=user.id,
                purpose_key="core_messaging",
                purpose_description="Core messaging, account delivery, and security verification.",
                status="granted",
                legal_basis="contractual_necessity",
                notice_version="2026.1",
                granted_at=now_dt
            ),
            models.ConsentRecord(
                user_id=user.id,
                purpose_key="ai_processing",
                purpose_description="Smart Conversation AI processing via Google Gemini.",
                status="granted",
                legal_basis="consent",
                notice_version="2026.1",
                granted_at=now_dt
            ),
            models.ConsentRecord(
                user_id=user.id,
                purpose_key="activity_presence",
                purpose_description="Real-time online presence and typing indicators.",
                status="granted",
                legal_basis="consent",
                notice_version="2026.1",
                granted_at=now_dt
            ),
            models.ConsentRecord(
                user_id=user.id,
                purpose_key="read_receipts",
                purpose_description="Double checkmark message read receipts.",
                status="granted",
                legal_basis="consent",
                notice_version="2026.1",
                granted_at=now_dt
            ),
            models.ConsentRecord(
                user_id=user.id,
                purpose_key="product_communications",
                purpose_description="Non-transactional feature updates and security advisories.",
                status="withdrawn",
                legal_basis="consent",
                notice_version="2026.1",
                withdrawn_at=now_dt
            )
        ]
        db.add_all(initial_consents)
        db.commit()
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

    # Set secure persistent cookie matching deployment scheme
    is_secure = request.url.scheme == "https" or "vercel" in (request.url.netloc or "")
    response.set_cookie(
        key="frank_token",
        value=token_str,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=False,
        samesite="lax",
        secure=is_secure
    )

    # Set secure persistent cookie matching deployment scheme
    is_secure = request.url.scheme == "https" or "vercel" in (request.url.netloc or "")
    response.set_cookie(
        key="frank_token",
        value=token_str,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=False,
        samesite="lax",
        secure=is_secure
    )

    return schemas.Token(
        access_token=token_str,
        token_type="bearer",
        user=schemas.UserResponse.from_orm(user)
    )


@router.post("/login", response_model=schemas.Token)
def login(login_data: schemas.UserLogin, request: Request, response: Response, db: Session = Depends(get_db)):
    # Support email, username, or identifier field
    raw_ident = (login_data.email or login_data.username or login_data.identifier or "").strip()
    if not raw_ident:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email address is required."
        )
    ident_lower = raw_ident.lower()

    # Allow login by email, full_name, name, username, or frank_id (case-insensitive)
    try:
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
    except Exception as db_err:
        import logging
        logging.error(f"[AUTH LOGIN DB ERROR] Database lookup failed: {db_err}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service is temporarily unavailable. Please try again shortly."
        )

    if not candidates:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Match candidate whose password verifies
    user = None
    for cand in candidates:
        pwd_hash = getattr(cand, "password_hash", None) or getattr(cand, "hashed_password", None) or ""
        if verify_password(login_data.password, pwd_hash):
            user = cand
            break

    # If candidate matched, verify whether the account is deactivated / disabled
    if user:
        cand_status = str(getattr(user, "account_status", "") or getattr(user, "status", "") or "active").lower()
        is_active = getattr(user, "is_active", True)
        if is_active is False or cand_status in ["disabled", "deactivated", "inactive", "deleted"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled. Please contact an administrator."
            )
    else:
        # Check if all matching candidate(s) are deactivated
        all_deactivated = all(
            (getattr(cand, "is_active", True) is False) or
            (str(getattr(cand, "account_status", "") or getattr(cand, "status", "") or "active").lower() in ["disabled", "deactivated", "inactive", "deleted"])
            for cand in candidates
        )
        if all_deactivated:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled. Please contact an administrator."
            )
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

    # Set secure persistent cookie matching deployment scheme
    is_secure = request.url.scheme == "https" or "vercel" in (request.url.netloc or "")
    response.set_cookie(
        key="frank_token",
        value=token_str,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=False,
        samesite="lax",
        secure=is_secure
    )

    return schemas.Token(
        access_token=token_str,
        token_type="bearer",
        user=schemas.UserResponse.from_orm(user)
    )


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post("/logout")
def logout(response: Response, user: Optional[models.User] = Depends(get_current_user_optional)):
    """
    Revokes server-side session cookies and returns successful logout response.
    """
    response.delete_cookie("frank_token")
    response.delete_cookie("chatapp_token")
    response.delete_cookie("frank_oauth_state")
    return {"status": "success", "message": "Successfully logged out"}


@router.post("/send-otp")
@router.post("/register/send-otp")
async def send_otp(req: schemas.SendOTPRequest, db: Session = Depends(get_db)):
    clean_email = req.email.strip().lower()
    purpose = (req.purpose or "registration").strip().lower()

    if not clean_email or "@" not in clean_email or "." not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address."
        )

    if purpose not in ["registration", "password_reset"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid OTP purpose specified."
        )

    if not email_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email delivery is unavailable: SMTP credentials are not configured in backend/.env."
        )

    # If registration, check if admin-only mode is explicitly enabled
    if purpose == "registration":
        if os.getenv("ADMIN_ONLY_MODE", "false").lower() in ["true", "1", "yes"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Public registration is currently disabled. Access is restricted to the administrator."
            )
        existing = db.query(models.User).filter(
            func.lower(models.User.email) == clean_email,
            or_(models.User.status.is_(None), models.User.status != "deleted"),
            or_(models.User.account_status.is_(None), models.User.account_status != "deleted")
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email already exists. Please sign in instead."
            )

    # Rate limiting: max 1 send per 60 seconds
    now_dt = models.get_utc_now()
    recent = db.query(models.OTPCode).filter(
        func.lower(models.OTPCode.email) == clean_email,
        models.OTPCode.purpose == purpose,
        models.OTPCode.is_used == False,
        models.OTPCode.created_at > now_dt - timedelta(seconds=60)
    ).first()
    if recent:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait 60 seconds before requesting a new verification code."
        )

    # Note: We do NOT immediately mark previous codes as used.
    # Leaving existing unexpired codes valid allows users whose emails arrive
    # out-of-order due to network or spam filtering delays to still verify.

    otp_code = generate_otp(6)
    token = secrets.token_urlsafe(32)
    otp_rec = models.OTPCode(
        email=clean_email,
        purpose=purpose,
        code_hash=hash_otp_code(otp_code),
        token=token,
        attempts=0,
        max_attempts=5,
        is_used=False,
        expires_at=now_dt + timedelta(minutes=15),
        created_at=now_dt
    )
    db.add(otp_rec)
    db.commit()

    # Deliver via email_service
    if purpose == "registration":
        delivered, msg = await email_service.send_registration_otp(clean_email, otp_code, expires_in_minutes=15)
    else:
        reset_link = build_password_reset_url(clean_email, token)
        delivered, msg = await email_service.send_password_reset_otp(clean_email, otp_code, reset_link=reset_link, expires_in_minutes=15)

    if not delivered:
        # Mark OTP as unusable if delivery failed
        otp_rec.is_used = True
        db.commit()
        if not email_service.is_configured():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Email delivery is unavailable: SMTP credentials are not configured in backend/.env."
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Email delivery failed: {msg}"
        )

    return {
        "success": True,
        "message": f"Verification code sent to {clean_email}. Please check your Inbox and Spam / Junk folder.",
        "smtp_accepted": True
    }


@router.post("/verify-otp")
@router.post("/register/verify-otp")
def verify_otp(req: schemas.VerifyOTPRequest, db: Session = Depends(get_db)):
    clean_email = req.email.strip().lower()
    purpose = (req.purpose or "registration").strip().lower()
    code = req.code.strip()

    ok, matched_rec, err_msg = check_and_consume_otp(db, clean_email, purpose, code)
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=err_msg)

    return {
        "success": True,
        "message": "Email verified successfully.",
        "verification_token": matched_rec.token
    }


@router.post("/forgot-password")
async def forgot_password(req: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    clean_email = (req.email or "").strip().lower()

    if not clean_email or "@" not in clean_email or "." not in clean_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address."
        )

    if not email_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email delivery is unavailable: SMTP credentials are not configured in backend/.env."
        )

    user = db.query(models.User).filter(
        func.lower(models.User.email) == clean_email,
        or_(models.User.status.is_(None), models.User.status != "deleted"),
        or_(models.User.account_status.is_(None), models.User.account_status != "deleted")
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active account was found for {clean_email}. Please check your email spelling or create a new account."
        )

    now_dt = models.get_utc_now()
    # Rate limit: max 1 per 60 seconds
    recent = db.query(models.OTPCode).filter(
        func.lower(models.OTPCode.email) == clean_email,
        models.OTPCode.purpose == "password_reset",
        models.OTPCode.is_used == False,
        models.OTPCode.created_at > now_dt - timedelta(seconds=60)
    ).first()

    if recent:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait 60 seconds before requesting another reset email."
        )

    otp_code = generate_otp(6)
    reset_token = secrets.token_urlsafe(32)
    otp_rec = models.OTPCode(
        email=clean_email,
        purpose="password_reset",
        code_hash=hash_otp_code(otp_code),
        token=reset_token,
        attempts=0,
        max_attempts=5,
        is_used=False,
        expires_at=now_dt + timedelta(minutes=15),
        created_at=now_dt
    )
    db.add(otp_rec)
    db.commit()

    reset_link = build_password_reset_url(clean_email, reset_token)

    sent, send_err = await email_service.send_password_reset_otp(
        clean_email, otp_code, reset_link=reset_link, expires_in_minutes=15
    )
    if not sent:
        print(f"[Auth] Password reset delivery note: {send_err}")
        otp_rec.is_used = True
        db.commit()
        if not email_service.is_configured():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Email delivery is unavailable: SMTP credentials are not configured in backend/.env."
            )
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Email delivery failed: {send_err}"
        )

    return {
        "success": True,
        "message": f"Password reset instructions have been dispatched to {clean_email}. Please check your Inbox and Spam / Junk folder.",
        "email": clean_email
    }


@router.get("/validate-reset-token")
def validate_reset_token(token: str, email: str = None, db: Session = Depends(get_db)):
    """
    Validates a password reset token before the user submits a new password.
    Returns status and user email if valid; raises 400 with a descriptive error if invalid, expired, or already used.
    """
    candidate_token = (token or "").strip()
    if not candidate_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token is required."
        )

    now_dt = models.get_utc_now()
    otp_rec = db.query(models.OTPCode).filter(
        models.OTPCode.token == candidate_token,
        models.OTPCode.purpose == "password_reset"
    ).order_by(models.OTPCode.id.desc()).first()

    if otp_rec:
        if otp_rec.is_used:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This password reset link has already been used. Please request a new one."
            )
        exp = otp_rec.expires_at
        if exp is not None:
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            now = now_dt if now_dt.tzinfo else now_dt.replace(tzinfo=timezone.utc)
            if exp <= now:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This password reset link has expired. Please request a new one."
                )
        return {
            "valid": True,
            "email": otp_rec.email,
            "message": "Reset token is valid."
        }

    # Fallback support for legacy JWT reset tokens
    payload = decode_token(candidate_token)
    if payload and payload.get("purpose") == "pwd_reset":
        username = payload.get("sub")
        user = db.query(models.User).filter(models.User.username == username).first()
        if user:
            return {
                "valid": True,
                "email": user.email,
                "message": "Reset token is valid."
            }

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired password reset link."
    )


@router.post("/reset-password")
def reset_password(req: schemas.ResetPasswordRequest, db: Session = Depends(get_db)):
    clean_email = (req.email or "").strip().lower()
    candidate_code = (req.code or "").strip()
    candidate_token = (req.token or "").strip()

    if not candidate_token and not (candidate_code and clean_email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset token or 6-digit verification code with email is required."
        )

    otp_rec = None
    now_dt = models.get_utc_now()

    if candidate_token:
        otp_rec = db.query(models.OTPCode).filter(
            models.OTPCode.token == candidate_token,
            models.OTPCode.purpose == "password_reset",
            models.OTPCode.is_used == False,
            models.OTPCode.expires_at > now_dt
        ).first()

    if not otp_rec and candidate_code and clean_email:
        ok, matched_rec, err_msg = check_and_consume_otp(
            db, clean_email, "password_reset", candidate_code
        )
        if not ok:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg
            )
        otp_rec = matched_rec

    if not otp_rec and candidate_token:
        # Fallback support for legacy JWT reset tokens
        payload = decode_token(candidate_token)
        if payload and payload.get("purpose") == "pwd_reset":
            username = payload.get("sub")
            user = db.query(models.User).filter(models.User.username == username).first()
            if user:
                pw_hash = hash_password(req.new_password)
                user.hashed_password = pw_hash
                user.password_hash = pw_hash
                db.commit()
                return {"success": True, "message": "Your password has been updated successfully. Please login."}

    if not otp_rec:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset code or token."
        )

    user = db.query(models.User).filter(func.lower(models.User.email) == otp_rec.email.lower()).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account associated with this reset request was not found."
        )

    pw_hash = hash_password(req.new_password)
    user.hashed_password = pw_hash
    user.password_hash = pw_hash

    # Single-use invalidation
    otp_rec.is_used = True
    db.commit()

    return {"success": True, "message": "Your password has been updated successfully. Please login."}


@router.get("/smtp/status")
def get_smtp_status():
    """Safe status of SMTP configuration without leaking secrets"""
    return email_service.get_safe_status()


@router.post("/smtp/verify")
def verify_smtp_connection():
    """Verify live connectivity and authentication with Gmail SMTP"""
    ok, msg = email_service.verify_connection()
    return {
        "success": ok,
        "message": msg,
        "status": email_service.get_safe_status()
    }


# ==============================================================================
# GOOGLE OAUTH 2.0 INTEGRATION (Personal & Google Workspace Accounts)
# ==============================================================================

def get_google_oauth_config(request: Optional[Request] = None) -> Tuple[str, str, str, bool]:
    """
    Returns (client_id, client_secret, redirect_uri, is_configured).
    Resolves the canonical redirect URI accurately for both production and local development.
    """
    client_id = (os.getenv("GOOGLE_CLIENT_ID") or os.getenv("GOOGLE_OAUTH_CLIENT_ID") or "").strip()
    client_secret = (os.getenv("GOOGLE_CLIENT_SECRET") or os.getenv("GOOGLE_OAUTH_CLIENT_SECRET") or "").strip()
    explicit_redirect = (os.getenv("GOOGLE_REDIRECT_URI") or os.getenv("GOOGLE_OAUTH_REDIRECT_URI") or "").strip()

    if explicit_redirect:
        redirect_uri = explicit_redirect
    else:
        # Determine host dynamically from request headers if available
        if request and request.headers.get("x-forwarded-host"):
            proto = request.headers.get("x-forwarded-proto", "https")
            host = request.headers.get("x-forwarded-host")
            base = f"{proto}://{host}".rstrip("/")
        elif request and request.headers.get("host") and ("localhost" in request.headers.get("host") or "127.0.0.1" in request.headers.get("host")):
            base = f"http://{request.headers.get('host')}".rstrip("/")
        else:
            base = get_frontend_base_url(request).rstrip("/")
        redirect_uri = f"{base}/api/auth/google/callback"

    is_configured = bool(client_id and client_secret)
    return client_id, client_secret, redirect_uri, is_configured


def process_google_user(
    google_email: str,
    google_sub: str,
    google_name: str,
    google_picture: str,
    db: Session
) -> Tuple[models.User, str]:
    """
    Looks up or provisions a user authenticated via Google OAuth.
    Supports all personal Google accounts and Google Workspace accounts.
    Preserves account linking, security checks, and token generation.
    """
    clean_email = google_email.strip().lower()

    # 1. Optional domain filtering if explicitly configured
    allowed_domains_raw = (os.getenv("GOOGLE_ALLOWED_DOMAINS") or "").strip().lower()
    if allowed_domains_raw:
        allowed_domains = [d.strip() for d in allowed_domains_raw.split(",") if d.strip()]
        user_domain = clean_email.split("@")[-1]
        if user_domain not in allowed_domains:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Google account domain (@{user_domain}) is not authorized to sign in."
            )

    # 2. Check if user already exists by email (case-insensitive) or linked oauth_id
    user = db.query(models.User).filter(
        (func.lower(models.User.email) == clean_email) |
        ((models.User.oauth_provider == "google") & (models.User.oauth_id == str(google_sub)))
    ).first()

    if user:
        # Verify account status
        cand_status = str(getattr(user, "account_status", "") or getattr(user, "status", "") or "active").lower()
        is_active = getattr(user, "is_active", True)
        if is_active is False or cand_status in ["disabled", "deactivated", "inactive", "deleted"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled. Please contact an administrator."
            )

        # Link Google OAuth details if not already set
        updated = False
        if not getattr(user, "oauth_provider", None):
            user.oauth_provider = "google"
            user.oauth_id = str(google_sub)
            updated = True
        if google_picture and not getattr(user, "avatar_url", ""):
            user.avatar_url = google_picture
            updated = True
        if updated:
            db.commit()
            db.refresh(user)
    else:
        # Check if public registration is disabled
        if os.getenv("ADMIN_ONLY_MODE", "false").lower() in ["true", "1", "yes"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Public registration is currently disabled. Access is restricted to the administrator."
            )

        # Generate unique username from Google email
        base_uname = re.sub(r"[^a-zA-Z0-9_]", "", clean_email.split("@")[0].lower())[:40] or "user"
        uname = base_uname
        counter = 1
        while db.query(models.User).filter(func.lower(models.User.username) == uname).first():
            uname = f"{base_uname[:35]}_{secrets.randbelow(900) + 100}"
            counter += 1
            if counter > 50:
                uname = f"u_{secrets.token_hex(4)}"
                break

        frank_id = generate_unique_frank_id(db)
        display_name = google_name or uname
        oauth_pwd_hash = hash_password(secrets.token_urlsafe(32))
        user = models.User(
            username=uname,
            email=clean_email,
            full_name=display_name,
            name=display_name,
            frank_id=frank_id,
            hashed_password=oauth_pwd_hash,
            password_hash=oauth_pwd_hash,
            oauth_provider="google",
            oauth_id=str(google_sub),
            avatar_url=google_picture or "",
            role="user",
            account_status="active",
            is_active=True,
            language="en",
            theme="light",
            bio="Hey there! I am using FRANK."
        )
        db.add(user)
        db.commit()
        db.refresh(user)

    # Issue standard FRANK JWT token
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
    return user, token_str


@router.get("/google/status")
def google_auth_status(request: Request):
    """
    Public diagnostic check for Google OAuth availability.
    Returns configuration status without leaking client secrets.
    """
    client_id, _, redirect_uri, is_configured = get_google_oauth_config(request)
    return {
        "configured": is_configured,
        "client_id_configured": bool(client_id),
        "redirect_uri": redirect_uri,
        "allowed_account_types": "all_personal_and_workspace" if not os.getenv("GOOGLE_ALLOWED_DOMAINS") else os.getenv("GOOGLE_ALLOWED_DOMAINS")
    }


@router.get("/google/url")
def get_google_auth_url(request: Request, response: Response):
    """
    Generates a secure Google OAuth authorization URL with CSRF state protection.
    """
    client_id, _, redirect_uri, is_configured = get_google_oauth_config(request)
    if not is_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google Sign-In is not configured yet. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in server environment variables."
        )

    state = secrets.token_urlsafe(32)
    response.set_cookie(
        key="frank_oauth_state",
        value=state,
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https" or "vercel" in request.url.netloc
    )

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account"
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    return {
        "url": auth_url,
        "state": state,
        "redirect_uri": redirect_uri,
        "configured": True
    }


@router.get("/google")
@router.get("/google/login")
def initiate_google_oauth(request: Request):
    """
    Browser-direct redirect to Google OAuth consent screen.
    """
    client_id, _, redirect_uri, is_configured = get_google_oauth_config(request)
    frontend_base = get_frontend_base_url()
    if not is_configured:
        msg = urllib.parse.quote("Google Sign-In is not configured yet. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in server environment variables.")
        return RedirectResponse(
            url=f"{frontend_base}/login.html?oauth_error=not_configured&message={msg}",
            status_code=status.HTTP_307_TEMPORARY_REDIRECT
        )

    state = secrets.token_urlsafe(32)
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "offline",
        "prompt": "select_account"
    }
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"
    redirect_resp = RedirectResponse(url=auth_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    redirect_resp.set_cookie(
        key="frank_oauth_state",
        value=state,
        max_age=600,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https" or "vercel" in request.url.netloc
    )
    return redirect_resp


@router.api_route("/google/callback", methods=["GET", "POST"])
async def google_oauth_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Handles Google OAuth redirect callback.
    Exchanges code for tokens, fetches profile info, validates email, links or creates user,
    and redirects user to frontend with an authenticated session.
    """
    frontend_base = get_frontend_base_url(request)

    # 1. User cancelled or error returned by Google
    if error:
        if error == "access_denied":
            msg = urllib.parse.quote("Google sign-in was cancelled.")
            return RedirectResponse(f"{frontend_base}/login.html?oauth_error=cancelled&message={msg}")
        msg = urllib.parse.quote(f"Google sign-in failed: {error_description or error}")
        return RedirectResponse(f"{frontend_base}/login.html?oauth_error=failed&message={msg}")

    # 2. Missing authorization code
    if not code:
        msg = urllib.parse.quote("No authorization code was received from Google.")
        return RedirectResponse(f"{frontend_base}/login.html?oauth_error=no_code&message={msg}")

    # 3. State verification
    stored_state = request.cookies.get("frank_oauth_state")
    if stored_state and state and not hmac.compare_digest(state, stored_state):
        msg = urllib.parse.quote("Invalid OAuth state parameter. Please try again.")
        return RedirectResponse(f"{frontend_base}/login.html?oauth_error=invalid_state&message={msg}")

    # 4. Exchange authorization code for tokens
    client_id, client_secret, redirect_uri, is_configured = get_google_oauth_config(request)
    if not is_configured:
        msg = urllib.parse.quote("Google Sign-In is not configured yet. GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in server environment variables.")
        return RedirectResponse(f"{frontend_base}/login.html?oauth_error=not_configured&message={msg}")

    token_url = "https://oauth2.googleapis.com/token"
    token_payload = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            token_resp = await client.post(token_url, data=token_payload)
            if token_resp.status_code != 200:
                import logging
                logging.error(f"[GOOGLE OAUTH ERROR] Token exchange failed ({token_resp.status_code}): {token_resp.text}")
                msg = urllib.parse.quote("Failed to exchange authorization code with Google.")
                return RedirectResponse(f"{frontend_base}/login.html?oauth_error=token_failed&message={msg}")

            token_data = token_resp.json()
            google_access_token = token_data.get("access_token")
            if not google_access_token:
                msg = urllib.parse.quote("Google did not return an access token.")
                return RedirectResponse(f"{frontend_base}/login.html?oauth_error=no_token&message={msg}")

            userinfo_resp = await client.get(
                "https://www.googleapis.com/oauth2/v3/userinfo",
                headers={"Authorization": f"Bearer {google_access_token}"}
            )
            if userinfo_resp.status_code != 200:
                import logging
                logging.error(f"[GOOGLE OAUTH ERROR] Userinfo fetch failed ({userinfo_resp.status_code}): {userinfo_resp.text}")
                msg = urllib.parse.quote("Failed to retrieve Google profile information.")
                return RedirectResponse(f"{frontend_base}/login.html?oauth_error=userinfo_failed&message={msg}")

            user_info = userinfo_resp.json()
    except Exception as exc:
        import logging
        logging.error(f"[GOOGLE OAUTH EXCEPTION] {exc}")
        msg = urllib.parse.quote("Unable to communicate with Google authentication servers. Please try again.")
        return RedirectResponse(f"{frontend_base}/login.html?oauth_error=network_error&message={msg}")

    google_sub = user_info.get("sub")
    google_email = (user_info.get("email") or "").strip().lower()
    google_name = (user_info.get("name") or "").strip()
    google_picture = user_info.get("picture") or ""
    email_verified = bool(user_info.get("email_verified", True))

    if not google_email:
        msg = urllib.parse.quote("Your Google account does not provide an email address.")
        return RedirectResponse(f"{frontend_base}/login.html?oauth_error=no_email&message={msg}")

    if not email_verified:
        msg = urllib.parse.quote("Your Google email address is not verified by Google.")
        return RedirectResponse(f"{frontend_base}/login.html?oauth_error=unverified_email&message={msg}")

    try:
        user, token_str = process_google_user(
            google_email=google_email,
            google_sub=google_sub,
            google_name=google_name,
            google_picture=google_picture,
            db=db
        )
    except HTTPException as http_exc:
        msg = urllib.parse.quote(http_exc.detail)
        return RedirectResponse(f"{frontend_base}/login.html?oauth_error=auth_failed&message={msg}")

    # Set up authenticated redirect response
    redirect_target = f"{frontend_base}/login.html?oauth_token={urllib.parse.quote(token_str)}&role={user.role}"
    redirect_resp = RedirectResponse(url=redirect_target, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    redirect_resp.delete_cookie("frank_oauth_state")
    redirect_resp.set_cookie(
        key="frank_token",
        value=token_str,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        httponly=False,
        samesite="lax",
        secure=request.url.scheme == "https" or "vercel" in request.url.netloc
    )
    return redirect_resp


@router.post("/google/token", response_model=schemas.Token)
async def google_token_login(req: schemas.GoogleTokenLogin, db: Session = Depends(get_db)):
    """
    Direct token verification endpoint for Google One-Tap or mobile app integrations.
    Validates Google ID token via Google's tokeninfo API.
    """
    if not req.id_token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="id_token parameter is required."
        )

    tokeninfo_url = f"https://oauth2.googleapis.com/tokeninfo?id_token={urllib.parse.quote(req.id_token.strip())}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.get(tokeninfo_url)
            if r.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid or expired Google ID token."
                )
            info = r.json()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to communicate with Google authentication service: {exc}"
        )

    google_sub = info.get("sub")
    google_email = (info.get("email") or "").strip().lower()
    google_name = (info.get("name") or "").strip()
    google_picture = info.get("picture") or ""
    email_verified = info.get("email_verified") in [True, "true", "True", 1, "1"]

    if not google_email:
        raise HTTPException(status_code=400, detail="Google token does not contain an email address.")
    if not email_verified:
        raise HTTPException(status_code=400, detail="Google email address is not verified.")

    # Validate audience / client ID if configured
    client_id = (os.getenv("GOOGLE_CLIENT_ID") or "").strip()
    aud = info.get("aud")
    if client_id and aud and aud != client_id:
        raise HTTPException(status_code=401, detail="Google token audience does not match application client ID.")

    user, token_str = process_google_user(
        google_email=google_email,
        google_sub=google_sub,
        google_name=google_name,
        google_picture=google_picture,
        db=db
    )

    return schemas.Token(
        access_token=token_str,
        token_type="bearer",
        user=schemas.UserResponse.from_orm(user)
    )

