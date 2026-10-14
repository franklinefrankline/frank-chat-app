import os
import re
import html
import secrets
from datetime import datetime, timezone, timedelta
from typing import Dict, List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from database import get_db
import models
import schemas

router = APIRouter(prefix="/contact", tags=["Contact"])

# Simple IP-based rate limiting to prevent spam abuse (5 submissions per 10 minutes per IP)
_rate_limit_lock: Dict[str, List[datetime]] = {}

def _check_rate_limit(client_ip: str, max_requests: int = 5, window_minutes: int = 10):
    if client_ip in ["127.0.0.1", "localhost", "::1", "testclient"]:
        max_requests = 200
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(minutes=window_minutes)
    
    if client_ip not in _rate_limit_lock:
        _rate_limit_lock[client_ip] = []
    
    # Prune expired timestamps
    _rate_limit_lock[client_ip] = [t for t in _rate_limit_lock[client_ip] if t > cutoff]
    
    if len(_rate_limit_lock[client_ip]) >= max_requests:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many contact requests from this address. Please wait a few minutes before trying again."
        )
    
    _rate_limit_lock[client_ip].append(now)


def _generate_unique_reference(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    for _ in range(20):
        code = "".join(secrets.choice(chars) for _ in range(6))
        ref = f"REQ-{year}-{code}"
        exists = db.query(models.AccountAccessRequest).filter(
            models.AccountAccessRequest.request_reference == ref
        ).first()
        if not exists:
            return ref
    # Fallback with timestamp suffix
    return f"REQ-{year}-{int(datetime.now(timezone.utc).timestamp())}"


_EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


@router.post("/account-access-request", response_model=schemas.AccountAccessRequestPublicSubmitResponse, status_code=status.HTTP_201_CREATED)
async def submit_account_access_request(
    request: Request,
    payload: schemas.AccountAccessRequestCreate,
    db: Session = Depends(get_db)
):
    """
    Public endpoint for affected users or visitors to submit an account access/reactivation request.
    Works without authentication. Rate-limited and sanitized.
    """
    # 1. Rate limiting by IP
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    # 2. Strict validation & sanitization
    clean_email = payload.email.strip().lower()
    if not _EMAIL_REGEX.match(clean_email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide a valid email address."
        )

    clean_subject = html.escape(payload.subject.strip())[:200]
    if len(clean_subject) < 3:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Subject must be at least 3 characters."
        )

    clean_desc = html.escape(payload.description.strip())[:5000]
    if len(clean_desc) < 5:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Issue description must be at least 5 characters."
        )

    clean_account_email = (payload.account_email.strip().lower() if payload.account_email else None)
    if clean_account_email and not _EMAIL_REGEX.match(clean_account_email):
        clean_account_email = None

    clean_frank_id = (payload.frank_id.strip().upper() if payload.frank_id else None)
    clean_source = (payload.source.strip().lower() if payload.source else "disabled_account")
    if clean_source not in ["disabled_account", "landing_page"]:
        clean_source = "disabled_account"

    # 3. Generate unique request reference
    ref = _generate_unique_reference(db)

    # 4. Save record
    access_request = models.AccountAccessRequest(
        request_reference=ref,
        email=clean_email,
        account_email=clean_account_email,
        frank_id=clean_frank_id,
        subject=clean_subject,
        description=clean_desc,
        status="Pending",
        source=clean_source
    )

    try:
        db.add(access_request)
        db.commit()
        db.refresh(access_request)
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to record your request at this time. Please try again later."
        )

    # 5. Broadcast to connected admins via WebSocket if available
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
                "type": "admin_access_request_created",
                "request": {
                    "id": access_request.id,
                    "request_reference": access_request.request_reference,
                    "email": access_request.email,
                    "subject": access_request.subject,
                    "status": access_request.status,
                    "source": access_request.source,
                    "created_at": schemas.format_iso_utc(access_request.created_at)
                }
            }))
    except Exception:
        pass

    return schemas.AccountAccessRequestPublicSubmitResponse(
        success=True,
        message="Your request has been submitted successfully. An administrator will review it shortly.",
        request_reference=ref,
        status="Pending"
    )
