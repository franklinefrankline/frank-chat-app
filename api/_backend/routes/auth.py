import os
import hashlib
import hmac
import secrets
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
    decode_token
)
from services.email_service import email_service

router = APIRouter(prefix="/auth", tags=["Authentication"])

FRANK_ID_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


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
    elif user_in.otp_code and user_in.otp_code.strip():
        otp_cand = db.query(models.OTPCode).filter(
            models.OTPCode.email == clean_email,
            models.OTPCode.purpose == "registration",
            models.OTPCode.is_used == False,
            models.OTPCode.expires_at > now_dt
        ).order_by(models.OTPCode.id.desc()).first()
        if not otp_cand:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Verification code is invalid or has expired. Please request a new code."
            )
        if otp_cand.attempts >= otp_cand.max_attempts:
            otp_cand.is_used = True
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Maximum verification attempts exceeded. Please request a new code."
            )
        if not verify_otp_code(user_in.otp_code.strip(), otp_cand.code_hash):
            otp_cand.attempts += 1
            db.commit()
            remaining = max(0, otp_cand.max_attempts - otp_cand.attempts)
            msg = "Invalid verification code."
            if remaining > 0:
                msg += f" {remaining} attempts remaining."
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=msg
            )
        otp_cand.is_used = True
    else:
        if email_service.is_configured():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email verification code is required to complete registration. Please verify your email."
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
        is_active=True,
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

    if not candidates and ident_lower in ["admin", "frankline", "frankline30999112@gmail.com", "alex", "sarah", "david", "alex@frank.app", "sarah@frank.app", "david@frank.app"]:
        # Auto-seed standard accounts in ephemeral serverless container
        try:
            admin_cand = db.query(models.User).filter(
                (models.User.email == "frankline30999112@gmail.com") | (models.User.username == "frankline")
            ).first()
            if not admin_cand:
                admin_cand = models.User(
                    username="frankline",
                    email="frankline30999112@gmail.com",
                    frank_id="A00001",
                    full_name="Frankline (Super Admin)",
                    name="Frankline (Super Admin)",
                    bio="FRANK System Super Administrator",
                    avatar_url="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
                    hashed_password=hash_password("#Frankline2006"),
                    password_hash=hash_password("#Frankline2006"),
                    role="admin",
                    account_status="active",
                    is_online=True
                )
                db.add(admin_cand)
                db.commit()
        except Exception:
            pass
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
        if is_active is False or cand_status in ["disabled", "deactivated", "inactive"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is disabled. Please contact an administrator."
            )
    else:
        # Check if all matching candidate(s) are deactivated
        all_deactivated = all(
            (getattr(cand, "is_active", True) is False) or
            (str(getattr(cand, "account_status", "") or getattr(cand, "status", "") or "active").lower() in ["disabled", "deactivated", "inactive"])
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

    return schemas.Token(
        access_token=token_str,
        token_type="bearer",
        user=schemas.UserResponse.from_orm(user)
    )


@router.get("/me", response_model=schemas.UserResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user


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

    # If registration, ensure account doesn't already exist
    if purpose == "registration":
        existing = db.query(models.User).filter(func.lower(models.User.email) == clean_email).first()
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

    # Invalidate previous unused codes for this email and purpose
    db.query(models.OTPCode).filter(
        func.lower(models.OTPCode.email) == clean_email,
        models.OTPCode.purpose == purpose,
        models.OTPCode.is_used == False
    ).update({"is_used": True})

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
        expires_at=now_dt + timedelta(minutes=10),
        created_at=now_dt
    )
    db.add(otp_rec)
    db.commit()

    # Deliver via email_service
    if purpose == "registration":
        delivered, msg = await email_service.send_registration_otp(clean_email, otp_code, expires_in_minutes=10)
    else:
        frontend_base = os.getenv("FRONTEND_URL", "http://localhost:8000").rstrip("/")
        reset_link = f"{frontend_base}/reset-password.html?email={clean_email}&token={token}"
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
        "message": f"Verification code accepted by SMTP server for delivery to {clean_email}. Please check your inbox and spam folder.",
        "smtp_accepted": True
    }


@router.post("/verify-otp")
@router.post("/register/verify-otp")
def verify_otp(req: schemas.VerifyOTPRequest, db: Session = Depends(get_db)):
    clean_email = req.email.strip().lower()
    purpose = (req.purpose or "registration").strip().lower()
    code = req.code.strip()

    now_dt = models.get_utc_now()
    otp_rec = db.query(models.OTPCode).filter(
        func.lower(models.OTPCode.email) == clean_email,
        models.OTPCode.purpose == purpose,
        models.OTPCode.is_used == False,
        models.OTPCode.expires_at > now_dt
    ).order_by(models.OTPCode.id.desc()).first()

    if not otp_rec:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code is invalid or has expired. Please request a new code."
        )

    if otp_rec.attempts >= otp_rec.max_attempts:
        otp_rec.is_used = True
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum verification attempts exceeded. Please request a new code."
        )

    if not verify_otp_code(code, otp_rec.code_hash):
        otp_rec.attempts += 1
        db.commit()
        remaining = max(0, otp_rec.max_attempts - otp_rec.attempts)
        detail = "Incorrect verification code."
        if remaining > 0:
            detail += f" {remaining} attempts remaining."
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    # OTP is verified! Mark as used and return verification token
    otp_rec.is_used = True
    db.commit()

    return {
        "success": True,
        "message": "Email verified successfully.",
        "verification_token": otp_rec.token
    }


@router.post("/forgot-password")
async def forgot_password(req: schemas.ForgotPasswordRequest, db: Session = Depends(get_db)):
    clean_email = req.email.strip().lower()
    user = db.query(models.User).filter(func.lower(models.User.email) == clean_email).first()

    if not email_service.is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email delivery is unavailable: SMTP credentials are not configured in backend/.env."
        )

    if user:
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

        # Invalidate older unused reset codes
        db.query(models.OTPCode).filter(
            func.lower(models.OTPCode.email) == clean_email,
            models.OTPCode.purpose == "password_reset",
            models.OTPCode.is_used == False
        ).update({"is_used": True})

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

        frontend_base = os.getenv("FRONTEND_URL", "http://localhost:8000").rstrip("/")
        reset_link = f"{frontend_base}/reset-password.html?email={clean_email}&token={reset_token}"

        sent, send_err = await email_service.send_password_reset_otp(
            clean_email, otp_code, reset_link=reset_link, expires_in_minutes=15
        )
        if not sent:
            print(f"[Auth] Password reset delivery note: {send_err}")
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
        "message": "If an account exists with this email, password reset instructions have been sent."
    }


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
        candidates = db.query(models.OTPCode).filter(
            func.lower(models.OTPCode.email) == clean_email,
            models.OTPCode.purpose == "password_reset",
            models.OTPCode.is_used == False,
            models.OTPCode.expires_at > now_dt
        ).order_by(models.OTPCode.id.desc()).all()

        for cand in candidates:
            if cand.attempts >= cand.max_attempts:
                cand.is_used = True
                db.commit()
                continue
            if verify_otp_code(candidate_code, cand.code_hash):
                otp_rec = cand
                break
            else:
                cand.attempts += 1
                if cand.attempts >= cand.max_attempts:
                    cand.is_used = True
                db.commit()
                remaining = max(0, cand.max_attempts - cand.attempts)
                if remaining > 0:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid verification code. {remaining} attempts remaining."
                    )
                else:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Maximum verification attempts exceeded. Please request a new reset code."
                    )

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

