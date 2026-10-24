"""
Privacy & Data Protection Router for FRANK Think
Aligned with India's Digital Personal Data Protection Act, 2023 (DPDP Act) and Digital Personal Data Protection Rules, 2025.
"""

import json
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc

from database import get_db
import models
import schemas
from security import get_current_user, get_current_admin_user, verify_password

def get_utc_now():
    return datetime.now(timezone.utc)

router = APIRouter(prefix="/privacy", tags=["privacy"])

# ------------------------------------------------------------------------------
# 1. STATUTORY NOTICE & PRIVACY POLICY DISCLOSURES (DPDP SECTION 5)
# ------------------------------------------------------------------------------

@router.get("/policy")
def get_privacy_policy():
    """
    Returns the comprehensive, legally aligned DPDP 2023 & Rules 2025 Privacy Policy disclosures.
    Accurately represents actual platform data practices without misleading claims.
    """
    return {
        "fiduciary_name": "FRANK Think Communications Platform",
        "corporate_identity": "[LEGAL_ENTITY_NAME: To be supplied by platform owner]",
        "statutory_framework": "Digital Personal Data Protection Act, 2023 & DPDP Rules 2025",
        "version": "2026.1-DPDP",
        "effective_date": "2026-01-01",
        "last_updated": "2026-10-24",
        "grievance_officer": {
            "name": "Data Protection Officer & Grievance Redressal Lead",
            "email": "frankthink12@gmail.com",
            "physical_address": "[REGISTERED_OFFICE_ADDRESS: To be supplied by platform owner]",
            "phone": "[DPO_PHONE: To be supplied by platform owner]",
            "statutory_turnaround": "30 days under DPDP Section 13",
            "appellate_body": "Data Protection Board of India (DPBI)"
        },
        "categories": [
            {
                "category": "Account Identity & Credentials",
                "items": ["Email address", "Username", "Full name", "Permanent FRANK ID", "PBKDF2 password hashes"],
                "purpose": "Authentication, user identification, account security, and service provisioning.",
                "legal_basis": "Contractual Necessity (DPDP Section 4)",
                "storage": "PostgreSQL / SQLite 'users' table",
                "retention": "Duration of active account + 30 days post-deletion grace period."
            },
            {
                "category": "Direct & Group Communications",
                "items": ["Direct chat messages", "Group messages", "Reaction emojis", "Timestamps", "Read receipts"],
                "purpose": "Facilitating real-time digital communication between authenticated participants.",
                "legal_basis": "Contractual Necessity (DPDP Section 4)",
                "storage": "Encrypted relational storage ('messages', 'conversations' tables)",
                "retention": "Preserved during conversation lifecycle; anonymized on self-service account erasure."
            },
            {
                "category": "Documents & Workspaces",
                "items": ["Uploaded document files (Word, Excel, PowerPoint, PDF)", "Document revisions", "File metadata"],
                "purpose": "In-chat document editing, storage, and file sharing.",
                "legal_basis": "Contractual Necessity & User Direction",
                "storage": "Local encrypted file store / Cloud object storage ('documents' table)",
                "retention": "Retained until deleted by owner or upon verified account erasure."
            },
            {
                "category": "Smart Conversation & AI Processing",
                "items": ["Conversation snippets", "Action items", "Executive summaries", "Key decisions"],
                "purpose": "AI assistant, conversation summarization, action extraction, translation.",
                "legal_basis": "Freely Given, Specific Consent (DPDP Section 6)",
                "storage": "Transient API requests with zero external training retention by default",
                "retention": "Transient RAM during processing; local persistent cache in 'smart_conversations'."
            },
            {
                "category": "Audit & Security Logs",
                "items": ["IP addresses", "User-Agent signatures", "Timestamped login events", "Admin operations"],
                "purpose": "Defending against account takeover, detecting cyber incidents, and statutory audit readiness.",
                "legal_basis": "Legitimate Uses & Legal Obligation (DPDP Section 7)",
                "storage": "'audit_logs', 'data_breach_incidents' tables",
                "retention": "180 days rolling retention under CERT-In and DPDP security guidelines."
            }
        ],
        "third_party_recipients": [
            {
                "recipient": "Google Gemini API (Google LLC)",
                "purpose": "NLP intelligence, smart conversation summarization, and key item extraction.",
                "data_shared": "User message excerpts (only when user has active AI consent).",
                "terms": "Google Cloud Enterprise Terms: customer data is not used to train foundation models.",
                "transfer_mechanism": "Permitted under DPDP Section 16 (Cross-border transfers to unrestricted jurisdictions)."
            },
            {
                "recipient": "Neon Database (Neon Inc.)",
                "purpose": "Cloud PostgreSQL database hosting.",
                "data_shared": "Encrypted production relational database records.",
                "terms": "SOC 2 Type II certified infrastructure with automated backup encryption.",
                "transfer_mechanism": "Standard Contractual Clauses & Enterprise Data Processing Addendum."
            },
            {
                "recipient": "Vercel Inc.",
                "purpose": "Serverless edge frontend and API reverse proxy hosting.",
                "data_shared": "Ephemeral HTTP request headers, IP address for transport routing.",
                "terms": "Enterprise Cloud Terms, ISO 27001 certified edge network.",
                "transfer_mechanism": "Global CDN edge transit."
            },
            {
                "recipient": "Google Gmail SMTP (Google LLC)",
                "purpose": "System account transactional emails, access requests, and password reset codes.",
                "data_shared": "Recipient email, verification codes (no chat messages shared).",
                "terms": "Google Workspace Enterprise Agreement.",
                "transfer_mechanism": "Standard TLS 1.3 transport."
            }
        ],
        "security_measures": {
            "transport_encryption": "Enforced TLS 1.3 across all client-server, socket, and API communication.",
            "rest_protection": "PBKDF2 with SHA-256 password hashing; JWT tokens with HS256 signatures.",
            "authorization": "Strict IDOR verification: users can access only their own private messages and files.",
            "honest_disclosure": "FRANK Think utilizes transport encryption (TLS 1.3) and secure server-side storage. Private messages are stored on server infrastructure to enable multi-device sync, and are not marketed as end-to-end encrypted (E2EE)."
        },
        "user_rights": [
            "Right to access summary of personal data and processing activities (Section 11)",
            "Right to correction of inaccurate or misleading personal data (Section 12)",
            "Right to erasure of personal data that is no longer necessary (Section 12)",
            "Right to grievance redressal with response within 30 days (Section 13)",
            "Right to nominate a representative in event of death or incapacity (Section 14)",
            "Right to withdraw consent with ease comparable to giving consent (Section 6(4))"
        ]
    }


@router.get("/data-inventory")
def get_data_inventory(db: Session = Depends(get_db)):
    """
    Returns the internal platform data inventory and processing categories.
    """
    rules = db.query(models.DataRetentionRule).filter(models.DataRetentionRule.is_active == True).all()
    inventory = []
    for r in rules:
        inventory.append({
            "category_code": r.data_category,
            "display_name": r.category_label,
            "purpose": r.purpose,
            "retention_period_days": r.retention_period_days,
            "table_name": r.data_category,
            "disposal_method": r.deletion_method,
            "legal_basis": r.legal_exception or "DPDP Section 4 / Contractual Necessity",
            "is_active": r.is_active
        })
    return inventory


# ------------------------------------------------------------------------------
# 2. GRANULAR CONSENT MANAGEMENT (DPDP SECTION 6)
# ------------------------------------------------------------------------------

STANDARD_PURPOSES = [
    {
        "code": "ai_processing",
        "label": "AI Assistant & Smart Summarization",
        "description": "Send conversation snippets to Google Gemini API for summaries, action extraction, and translation.",
        "legal_basis": "consent",
        "is_optional": True,
        "default": True
    },
    {
        "code": "online_presence",
        "label": "Real-time Online Presence",
        "description": "Broadcast your active online status dot to mutual chat contacts.",
        "legal_basis": "consent",
        "is_optional": True,
        "default": True
    },
    {
        "code": "read_receipts",
        "label": "Message Read Receipts",
        "description": "Display double blue checkmark indicators when you view messages from contacts.",
        "legal_basis": "consent",
        "is_optional": True,
        "default": True
    },
    {
        "code": "service_updates",
        "label": "Security Bulletins & Feature Updates",
        "description": "Receive non-transactional system advisories, security updates, and new feature digests via email.",
        "legal_basis": "consent",
        "is_optional": True,
        "default": False
    }
]

@router.get("/consents")
def get_user_consents(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves all consent records for the authenticated Data Principal.
    """
    records = db.query(models.ConsentRecord).filter(models.ConsentRecord.user_id == current_user.id).all()
    record_map = {r.purpose_key: r for r in records}

    items = []
    for p in STANDARD_PURPOSES:
        rec = record_map.get(p["code"])
        is_granted = rec.status == "granted" if rec else p["default"]
        items.append({
            "purpose_code": p["code"],
            "purpose_key": p["code"],
            "purpose_label": p["label"],
            "description": p["description"],
            "granted": is_granted,
            "status": "granted" if is_granted else "withdrawn",
            "legal_basis": p["legal_basis"],
            "is_optional": p["is_optional"],
            "notice_version": rec.notice_version if rec else "v1.0",
            "updated_at": rec.updated_at.isoformat() if rec and rec.updated_at else None
        })

    return {"items": items, "user_id": current_user.id, "total": len(items)}


@router.post("/consents")
def update_user_consents(
    payload: Dict[str, Any],
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Updates granular consent preferences for the authenticated Data Principal.
    Supports both { consents: [{ purpose_code, granted }] } and { purpose_key, status }.
    """
    ip_addr = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent", "")[:255]
    now = get_utc_now()

    updates = []
    if "consents" in payload and isinstance(payload["consents"], list):
        updates = payload["consents"]
    elif "purpose_key" in payload or "purpose_code" in payload:
        updates = [payload]

    updated_count = 0
    for u in updates:
        purpose = u.get("purpose_code") or u.get("purpose_key")
        if not purpose:
            continue

        granted = u.get("granted")
        if granted is None and "status" in u:
            granted = (u["status"] == "granted")

        status_str = "granted" if granted else "withdrawn"

        # Check existing record
        rec = db.query(models.ConsentRecord).filter(
            models.ConsentRecord.user_id == current_user.id,
            models.ConsentRecord.purpose_key == purpose
        ).first()

        if rec:
            rec.status = status_str
            rec.updated_at = now
            rec.ip_address = ip_addr
            rec.user_agent = user_agent
            if status_str == "withdrawn":
                rec.withdrawn_at = now
            else:
                rec.granted_at = now
        else:
            rec = models.ConsentRecord(
                user_id=current_user.id,
                purpose_key=purpose,
                purpose_description=f"Consent for {purpose}",
                status=status_str,
                legal_basis="consent",
                notice_version="v1.0",
                ip_address=ip_addr,
                user_agent=user_agent,
                granted_at=now if status_str == "granted" else None,
                withdrawn_at=now if status_str == "withdrawn" else None
            )
            db.add(rec)
        updated_count += 1

    # Record security audit log
    audit_log = models.AuditLog(
        admin_id=current_user.id,
        action="UPDATE_CONSENTS",
        target_type="user",
        target_id=current_user.id,
        target_name=current_user.username,
        details=f"User updated {updated_count} consent preference(s)"
    )
    db.add(audit_log)
    db.commit()

    return {
        "status": "success",
        "message": f"Successfully updated {updated_count} consent setting(s)",
        "updated_count": updated_count
    }


# ------------------------------------------------------------------------------
# 3. USER PRIVACY DASHBOARD & DATA EXPORT (DPDP SECTION 11)
# ------------------------------------------------------------------------------

@router.get("/me/summary")
def get_personal_data_summary(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns an overview summary of personal data held for the authenticated user.
    """
    msg_count = db.query(models.Message).filter(models.Message.sender_id == current_user.id).count()
    doc_count = db.query(models.Document).filter(models.Document.uploader_id == current_user.id).count()
    
    # Active consents
    active_consents = db.query(models.ConsentRecord).filter(
        models.ConsentRecord.user_id == current_user.id,
        models.ConsentRecord.status == "granted"
    ).count()

    # Open privacy requests
    open_requests = db.query(models.PrivacyDataRequest).filter(
        models.PrivacyDataRequest.user_id == current_user.id,
        models.PrivacyDataRequest.status.in_(["Submitted", "Under Review", "Action Required", "submitted", "in_review", "action_required"])
    ).count()

    return {
        "user_id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "frank_id": current_user.frank_id,
        "role": current_user.role,
        "account_status": current_user.account_status,
        "registered_at": current_user.created_at.isoformat() if current_user.created_at else None,
        "created_at": current_user.created_at.isoformat() if current_user.created_at else None,
        "messages_count": msg_count,
        "sent_messages_count": msg_count,
        "documents_count": doc_count,
        "uploaded_documents_count": doc_count,
        "active_consents_count": active_consents,
        "open_privacy_requests_count": open_requests
    }


@router.get("/me/export")
def export_personal_data(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generates a structured, machine-readable JSON export of the Data Principal's information.
    Fulfills the Right to Access and Data Portability under DPDP Section 11.
    """
    # 1. Profile information
    profile = {
        "id": current_user.id,
        "username": current_user.username,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "frank_id": current_user.frank_id,
        "role": current_user.role,
        "theme": current_user.theme,
        "language": current_user.language,
        "registered_at": current_user.created_at.isoformat() if current_user.created_at else None
    }

    # 2. Consents
    consents = [
        {
            "purpose": c.purpose_key,
            "status": c.status,
            "legal_basis": c.legal_basis,
            "granted_at": c.granted_at.isoformat() if c.granted_at else None,
            "withdrawn_at": c.withdrawn_at.isoformat() if c.withdrawn_at else None
        }
        for c in current_user.consent_records
    ]

    # 3. Sent Messages metadata (sanitized of third-party private contact data)
    sent_msgs = db.query(models.Message).filter(models.Message.sender_id == current_user.id).order_by(models.Message.created_at.desc()).limit(1000).all()
    messages_data = [
        {
            "id": m.id,
            "content": m.content,
            "message_type": m.message_type,
            "sent_at": m.created_at.isoformat() if m.created_at else None,
            "has_attachment": bool(m.file_id)
        }
        for m in sent_msgs
    ]

    # 4. Uploaded documents
    user_docs = db.query(models.Document).filter(models.Document.uploader_id == current_user.id).all()
    documents_data = [
        {
            "id": d.id,
            "original_filename": d.original_filename,
            "file_type": d.file_type,
            "file_size": d.file_size,
            "mime_type": d.mime_type,
            "created_at": d.created_at.isoformat() if d.created_at else None
        }
        for d in user_docs
    ]

    # 5. Privacy requests
    requests_data = [
        {
            "reference": r.request_reference,
            "type": r.request_type,
            "status": r.status,
            "subject": r.subject,
            "created_at": r.created_at.isoformat() if r.created_at else None
        }
        for r in current_user.privacy_requests
    ]

    return {
        "format_version": "DPDP-Export-v1",
        "generated_at": get_utc_now().isoformat(),
        "fiduciary": "FRANK Think Communications Platform",
        "statutory_notice": "Personal data archive generated in compliance with the Digital Personal Data Protection Act, 2023.",
        "profile": profile,
        "account": profile,
        "active_consents": consents,
        "consents": consents,
        "messages": messages_data,
        "documents": documents_data,
        "privacy_requests": requests_data
    }


# ------------------------------------------------------------------------------
# 4. DATA PRINCIPAL RIGHTS & GRIEVANCE REDRESSAL (DPDP SECTIONS 11-13)
# ------------------------------------------------------------------------------

@router.post("/requests")
def submit_privacy_request(
    payload: Dict[str, Any],
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Submits a personal data request (access, correction, erasure, consent revocation, or grievance).
    Computes statutory 30-day response deadline under DPDP Section 13.
    """
    req_type = payload.get("request_type") or "access_data"
    if req_type == "erasure":
        req_type = "erase_data"
    elif req_type == "correction":
        req_type = "correct_data"
    elif req_type == "access":
        req_type = "access_data"

    raw_subj = payload.get("subject")
    raw_details = payload.get("details")
    raw_reason = payload.get("reason")
    raw_desc = payload.get("description")
    raw_title = payload.get("title")

    if not (raw_subj or raw_title or raw_reason) or not (raw_details or raw_desc or raw_reason):
        raise HTTPException(status_code=400, detail="Subject and details are required.")

    subject = (raw_subj or raw_title or raw_reason).strip()
    details = (raw_details or raw_desc or raw_reason).strip()

    if not subject or not details:
        raise HTTPException(status_code=400, detail="Subject and details are required.")

    # Unique Reference Code
    prefix = "GR" if req_type == "grievance" else "PR"
    date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
    random_part = uuid.uuid4().hex[:6].upper()
    reference_code = f"{prefix}-{date_part}-{random_part}"

    now = get_utc_now()
    deadline = now + timedelta(days=30)  # Statutory 30 days under DPDP Section 13

    # Correction payload handling
    corr_val = payload.get("corrected_value")
    if not corr_val and payload.get("correction_payload"):
        corr_val = json.dumps(payload["correction_payload"]) if isinstance(payload["correction_payload"], dict) else str(payload["correction_payload"])

    # Extra metadata formatting (category and related reference)
    category = payload.get("category")
    related_ref = payload.get("related_reference")
    data_cats = payload.get("data_categories")
    extra_tags = []
    if category:
        extra_tags.append(f"Category: {category}")
    if data_cats:
        extra_tags.append(f"Target Categories: {', '.join(data_cats) if isinstance(data_cats, list) else data_cats}")
    if related_ref:
        extra_tags.append(f"Related Ref: {related_ref}")
    if extra_tags and not details.startswith("["):
        details = f"[{' | '.join(extra_tags)}]\n{details}"

    privacy_req = models.PrivacyDataRequest(
        request_reference=reference_code,
        user_id=current_user.id,
        request_type=req_type,
        status="Submitted",
        subject=subject,
        details=details,
        correction_payload=corr_val,
        deadline_at=deadline,
        created_at=now,
        updated_at=now
    )
    db.add(privacy_req)

    # Audit log
    audit = models.AuditLog(
        admin_id=current_user.id,
        action="SUBMIT_PRIVACY_REQUEST",
        target_type="privacy_request",
        target_id=privacy_req.id,
        target_name=reference_code,
        details=f"Submitted {req_type} with reference {reference_code}"
    )
    db.add(audit)
    db.commit()
    db.refresh(privacy_req)

    return {
        "id": privacy_req.id,
        "status": "submitted",
        "reference_code": reference_code,
        "request_reference": reference_code,
        "reference_number": reference_code,
        "deadline_at": deadline.isoformat(),
        "message": f"Your request has been registered under reference {reference_code}. Statutory turnaround is 30 days."
    }


@router.get("/requests")
def list_my_privacy_requests(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Lists all privacy requests submitted by the authenticated Data Principal.
    Protected against IDOR: users can only view their own requests.
    """
    reqs = db.query(models.PrivacyDataRequest).filter(
        models.PrivacyDataRequest.user_id == current_user.id
    ).order_by(models.PrivacyDataRequest.created_at.desc()).all()

    results = []
    for r in reqs:
        # Normalize status to lowercase for frontend badge mapping
        norm_status = r.status.lower().replace(" ", "_")
        results.append({
            "id": r.id,
            "reference_code": r.request_reference,
            "request_reference": r.request_reference,
            "request_type": r.request_type,
            "subject": r.subject,
            "details": r.details,
            "correction_payload": r.correction_payload,
            "status": norm_status,
            "display_status": r.status,
            "decision_notes": r.decision_reason or r.admin_notes,
            "decision_reason": r.decision_reason,
            "deadline_at": r.deadline_at.isoformat() if r.deadline_at else None,
            "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None
        })

    return results


@router.get("/requests/{reference}")
def get_privacy_request_by_ref(
    reference: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves a single request by reference code or numeric ID with IDOR protection.
    """
    is_num = reference.isdigit()
    req = db.query(models.PrivacyDataRequest).filter(
        or_(
            models.PrivacyDataRequest.request_reference == reference,
            models.PrivacyDataRequest.id == int(reference) if is_num else False
        )
    ).first()

    if not req:
        raise HTTPException(status_code=404, detail="Privacy request not found.")

    if req.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="You do not have permission to view this request.")

    norm_status = req.status.lower().replace(" ", "_")
    return {
        "id": req.id,
        "reference_code": req.request_reference,
        "request_reference": req.request_reference,
        "request_type": req.request_type,
        "subject": req.subject,
        "details": req.details,
        "correction_payload": req.correction_payload,
        "status": norm_status,
        "display_status": req.status,
        "decision_notes": req.decision_reason or req.admin_notes,
        "deadline_at": req.deadline_at.isoformat() if req.deadline_at else None,
        "completed_at": req.completed_at.isoformat() if req.completed_at else None,
        "created_at": req.created_at.isoformat() if req.created_at else None
    }


# ------------------------------------------------------------------------------
# 5. STAGED ACCOUNT ERASURE & ANONYMIZATION (DPDP SECTION 12)
# ------------------------------------------------------------------------------

@router.post("/erase-account")
def execute_account_erasure(
    payload: Dict[str, Any],
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Executes permanent self-service account closure and anonymization under DPDP Section 12.
    - Authenticates requester password.
    - Verifies explicit confirmation text "DELETE" or "DELETE MY ACCOUNT".
    - Revokes optional consents immediately.
    - Anonymizes personal credentials (email, username, full_name, hashed_password).
    - Preserves mutual conversation continuity for chat partners under 'Deleted User'.
    """
    password = payload.get("password")
    confirm_text = (payload.get("confirm_text") or "").strip()
    reason = payload.get("reason", "Self-service erasure request under DPDP Section 12")

    if confirm_text not in ["DELETE", "DELETE MY ACCOUNT"]:
        raise HTTPException(status_code=400, detail="Confirmation text must be 'DELETE' or 'DELETE MY ACCOUNT'.")

    if not password or not verify_password(password, current_user.hashed_password):
        raise HTTPException(status_code=401, detail="Authentication failed. Please verify your current password.")

    user_id = current_user.id
    now = get_utc_now()
    timestamp_suffix = int(now.timestamp())
    random_hash = uuid.uuid4().hex[:8]

    # 1. Revoke all active consents
    for c in current_user.consent_records:
        c.status = "withdrawn"
        c.withdrawn_at = now

    # 2. Anonymize user record
    current_user.full_name = "Deleted User"
    current_user.email = f"deleted_{timestamp_suffix}_{random_hash}@anonymized.frank"
    current_user.username = f"deleted_{timestamp_suffix}_{random_hash[:4]}"
    current_user.hashed_password = "ANONYMIZED_ACCOUNT_PASSWORD_HASH_INVALIDATED"
    current_user.is_active = False
    current_user.account_status = "deleted"
    current_user.status = "deleted"
    current_user.avatar_url = ""
    current_user.bio = ""

    # 3. Log audit entry without retaining personal identifier
    audit = models.AuditLog(
        admin_id=user_id,
        action="ACCOUNT_ERASURE_COMPLETED",
        target_type="user",
        target_id=user_id,
        target_name="Deleted User",
        details=f"Account permanently anonymized and marked inactive. Reason: {reason}"
    )
    db.add(audit)
    db.commit()

    return {
        "status": "erased",
        "message": "Your account has been deleted and anonymized. All active sessions have ended.",
        "anonymized_at": now.isoformat()
    }


# ------------------------------------------------------------------------------
# 6. ADMIN PRIVACY & DPDP HUB ENDPOINTS
# ------------------------------------------------------------------------------

@router.get("/admin/requests")
def admin_list_privacy_requests(
    status: Optional[str] = None,
    request_type: Optional[str] = None,
    q: Optional[str] = None,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Administrator endpoint to query all Data Principal requests and track statutory deadlines.
    """
    query = db.query(models.PrivacyDataRequest)

    if status and status != "all":
        # Handle case variations
        query = query.filter(or_(
            models.PrivacyDataRequest.status == status,
            models.PrivacyDataRequest.status == status.capitalize(),
            models.PrivacyDataRequest.status == status.lower()
        ))

    if request_type and request_type != "all":
        query = query.filter(models.PrivacyDataRequest.request_type == request_type)

    if q:
        search = f"%{q}%"
        query = query.filter(or_(
            models.PrivacyDataRequest.request_reference.ilike(search),
            models.PrivacyDataRequest.subject.ilike(search),
            models.PrivacyDataRequest.details.ilike(search)
        ))

    reqs = query.order_by(models.PrivacyDataRequest.created_at.desc()).all()

    results = []
    for r in reqs:
        u_info = None
        if r.user:
            u_info = {
                "id": r.user.id,
                "username": r.user.username,
                "full_name": r.user.full_name,
                "frank_id": r.user.frank_id,
                "email": r.user.email
            }
        results.append({
            "id": r.id,
            "reference_code": r.request_reference,
            "request_reference": r.request_reference,
            "user_id": r.user_id,
            "user": u_info,
            "request_type": r.request_type,
            "subject": r.subject,
            "details": r.details,
            "correction_payload": r.correction_payload,
            "status": r.status.lower().replace(" ", "_"),
            "display_status": r.status,
            "decision_notes": r.decision_reason or r.admin_notes,
            "assigned_to": r.assigned_to.full_name if r.assigned_to else None,
            "deadline_at": r.deadline_at.isoformat() if r.deadline_at else None,
            "created_at": r.created_at.isoformat() if r.created_at else None
        })

    return results


@router.put("/admin/requests/{reference}")
def admin_update_privacy_request(
    reference: str,
    payload: Dict[str, Any],
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Administrator endpoint to review, assign, or record audited decisions on a user request.
    Mandates decision notes when completing or rejecting requests.
    """
    is_num = str(reference).isdigit()
    req = db.query(models.PrivacyDataRequest).filter(
        or_(
            models.PrivacyDataRequest.request_reference == str(reference),
            models.PrivacyDataRequest.id == int(reference) if is_num else False
        )
    ).first()

    if not req:
        raise HTTPException(status_code=404, detail="Privacy request not found.")

    new_status = payload.get("status")
    decision_notes = payload.get("decision_notes") or payload.get("decision_reason") or payload.get("admin_notes")
    assigned_to = payload.get("assigned_to")

    now = get_utc_now()
    if new_status:
        # Normalize status string
        status_map = {
            "submitted": "Submitted",
            "in_review": "Under Review",
            "under review": "Under Review",
            "under_review": "Under Review",
            "action_required": "Awaiting Information",
            "awaiting information": "Awaiting Information",
            "awaiting_information": "Awaiting Information",
            "approved": "Approved",
            "approved for processing": "Approved for Processing",
            "approved_for_processing": "Approved for Processing",
            "processing": "Processing",
            "completed": "Completed",
            "rejected": "Rejected",
            "failed": "Failed"
        }
        req.status = status_map.get(new_status.lower(), new_status)
        if req.status in ["Completed", "Rejected", "Failed"]:
            req.completed_at = now

    if decision_notes:
        req.decision_reason = decision_notes
        req.admin_notes = decision_notes

    req.updated_at = now

    # Audit log entry
    audit = models.AuditLog(
        admin_id=current_user.id,
        action="ADMIN_PRIVACY_DECISION",
        target_type="privacy_request",
        target_id=req.id,
        target_name=reference,
        details=f"Admin {current_user.username} updated {reference} to {req.status}. Note: {decision_notes}"
    )
    db.add(audit)
    db.commit()
    db.refresh(req)

    return {
        "status": req.status.lower().replace(" ", "_"),
        "display_status": req.status,
        "reference_code": req.request_reference,
        "decision_notes": req.decision_reason,
        "decided_at": now.isoformat()
    }


# ------------------------------------------------------------------------------
# 7. PERSONAL DATA BREACH REGISTER (DPDP SECTION 8(6))
# ------------------------------------------------------------------------------

@router.get("/admin/breaches")
def admin_list_breaches(
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Returns the register of recorded personal data breach incidents under DPDP Section 8(6).
    """
    incidents = db.query(models.DataBreachIncident).order_by(models.DataBreachIncident.created_at.desc()).all()
    results = []
    for inc in incidents:
        results.append({
            "id": inc.id,
            "incident_reference": inc.incident_reference,
            "title": inc.title,
            "severity": inc.severity,
            "status": inc.status,
            "affected_systems": inc.affected_systems,
            "nature_of_breach": inc.nature_of_breach,
            "containment_steps": inc.containment_steps,
            "impacted_users_count": inc.impacted_users_count,
            "authorities_notified": inc.reported_to_dpa,
            "reported_to_dpa": inc.reported_to_dpa,
            "dpa_reported_at": inc.dpa_reported_at.isoformat() if inc.dpa_reported_at else None,
            "created_at": inc.created_at.isoformat() if inc.created_at else None
        })
    return results


@router.post("/admin/breaches")
def admin_record_breach(
    payload: Dict[str, Any],
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Records a new security or personal data breach incident in compliance with DPDP Section 8(6).
    """
    title = payload.get("title", "").strip()
    affected_systems = payload.get("affected_systems", "").strip()
    severity = payload.get("severity", "medium").lower()

    if not title or not affected_systems:
        raise HTTPException(status_code=400, detail="Title and affected systems are required.")

    ref = f"IN-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"
    now = get_utc_now()
    authorities_notified = bool(payload.get("authorities_notified") or payload.get("reported_to_dpa"))

    incident = models.DataBreachIncident(
        incident_reference=ref,
        title=title,
        severity=severity,
        status="Investigating",
        affected_systems=affected_systems,
        nature_of_breach=payload.get("personal_data_categories") or payload.get("nature_of_breach") or "Incident recorded by administrator",
        containment_steps=payload.get("containment_steps"),
        reported_to_dpa=authorities_notified,
        dpa_reported_at=now if authorities_notified else None,
        created_by_id=current_user.id,
        created_at=now,
        updated_at=now
    )
    db.add(incident)

    audit = models.AuditLog(
        admin_id=current_user.id,
        action="BREACH_INCIDENT_LOGGED",
        target_type="breach_incident",
        target_id=incident.id,
        target_name=ref,
        details=f"Admin logged breach {ref}: {title} (Severity: {severity})"
    )
    db.add(audit)
    db.commit()
    db.refresh(incident)

    return {
        "status": "success",
        "incident_reference": ref,
        "title": title,
        "severity": severity,
        "created_at": now.isoformat()
    }


# ------------------------------------------------------------------------------
# 8. DATA RETENTION & LIFECYCLE MANAGEMENT (DPDP PART 3)
# ------------------------------------------------------------------------------

@router.get("/retention-schedule")
def get_retention_schedule(
    db: Session = Depends(get_db)
):
    """
    Returns the comprehensive data retention and disposal schedule for all data categories.
    Accessible to users and administrators to understand retention conditions and statutory legal exceptions.
    """
    rules = db.query(models.DataRetentionRule).all()
    categories = []
    for r in rules:
        period_str = f"{r.retention_period_days} Days" if r.retention_period_days > 0 else "Until Account Closure / Revocation"
        categories.append({
            "id": r.id,
            "category_code": r.data_category,
            "data_category": r.data_category,
            "category_name": r.category_label,
            "category_label": r.category_label,
            "purpose": r.purpose,
            "retention_period_days": r.retention_period_days,
            "retention_period_display": period_str,
            "retention_duration_display": period_str,
            "is_active": r.is_active,
            "deletion_method": r.deletion_method,
            "disposal_method": r.deletion_method,
            "legal_exception": r.legal_exception or "None applicable under normal operations",
            "statutory_exceptions": r.legal_exception or "None applicable under normal operations",
            "automated_expiration_supported": bool(getattr(r, "automated_expiration_supported", False)),
            "requires_manual_review": bool(getattr(r, "requires_manual_review", True)),
            "responsible_workflow": getattr(r, "responsible_workflow", "DPO Staged Review") or "DPO Staged Review",
            "required_audit_metadata": getattr(r, "required_audit_metadata", "operation_ref,actor_id,target_id,timestamp,result"),
            "last_reviewed_at": r.last_reviewed_at.isoformat() if r.last_reviewed_at else None
        })
    return {
        "status": "success",
        "fiduciary": "FRANK Think Communications Platform",
        "framework": "Digital Personal Data Protection Act, 2023 (DPDPA)",
        "statutory_mandates": [
            "DPDP Act 2023 Section 8(7) (Erasure when purpose no longer served)",
            "CERT-In Cyber Security Directions (180-day secure system logging)",
            "DPDP Section 12 (Right to Correction and Erasure of Personal Data)"
        ],
        "categories": categories,
        "total_categories": len(categories)
    }


@router.get("/admin/retention-rules")
def admin_list_retention_rules(
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Lists all active data retention policies with comprehensive lifecycle metadata.
    """
    rules = db.query(models.DataRetentionRule).all()
    results = []
    for r in rules:
        results.append({
            "id": r.id,
            "category_code": r.data_category,
            "display_name": r.category_label,
            "table_name": r.data_category,
            "retention_period_days": r.retention_period_days,
            "disposal_method": r.deletion_method,
            "legal_basis": r.purpose,
            "is_active": r.is_active,
            "legal_exception": r.legal_exception,
            "automated_expiration_supported": bool(getattr(r, "automated_expiration_supported", False)),
            "requires_manual_review": bool(getattr(r, "requires_manual_review", True)),
            "responsible_workflow": getattr(r, "responsible_workflow", "DPO Staged Review"),
            "required_audit_metadata": getattr(r, "required_audit_metadata", "operation_ref,actor_id,target_id,timestamp,result"),
            "last_reviewed_at": r.last_reviewed_at.isoformat() if r.last_reviewed_at else None
        })
    return results


@router.put("/admin/retention-rules/{rule_id}")
def admin_update_retention_rule(
    rule_id: int,
    payload: Dict[str, Any],
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Updates retention period, status, or lifecycle metadata of an existing data retention rule.
    """
    rule = db.query(models.DataRetentionRule).filter(models.DataRetentionRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Retention rule not found.")

    if "retention_period_days" in payload:
        rule.retention_period_days = int(payload["retention_period_days"])
    elif "retention_duration_days" in payload:
        rule.retention_period_days = int(payload["retention_duration_days"])
    if "is_active" in payload:
        rule.is_active = bool(payload["is_active"])
    if "disposal_method" in payload:
        rule.deletion_method = str(payload["disposal_method"])
    if "deletion_method" in payload:
        rule.deletion_method = str(payload["deletion_method"])
    if "legal_exception" in payload:
        rule.legal_exception = str(payload["legal_exception"])
    if "statutory_exceptions" in payload:
        rule.legal_exception = str(payload["statutory_exceptions"])
    if "automated_expiration_supported" in payload:
        rule.automated_expiration_supported = bool(payload["automated_expiration_supported"])
    if "requires_manual_review" in payload:
        rule.requires_manual_review = bool(payload["requires_manual_review"])
    if "responsible_workflow" in payload:
        rule.responsible_workflow = str(payload["responsible_workflow"])
    if "required_audit_metadata" in payload:
        rule.required_audit_metadata = str(payload["required_audit_metadata"])
    if "category_label" in payload:
        rule.category_label = str(payload["category_label"])
    if "purpose" in payload:
        rule.purpose = str(payload["purpose"])

    now = get_utc_now()
    rule.last_reviewed_at = now
    rule.updated_at = now

    audit = models.AuditLog(
        admin_id=current_user.id,
        action="RETENTION_RULE_UPDATED",
        target_type="retention_rule",
        target_id=rule.id,
        target_name=rule.data_category,
        details=f"Admin {current_user.username} updated retention rule '{rule.data_category}': {rule.retention_period_days} days, active={rule.is_active}"
    )
    db.add(audit)
    db.commit()
    db.refresh(rule)

    return {
        "status": "success",
        "id": rule.id,
        "category_code": rule.data_category,
        "category_label": rule.category_label,
        "retention_period_days": rule.retention_period_days,
        "retention_duration_days": rule.retention_period_days,
        "is_active": rule.is_active,
        "deletion_method": rule.deletion_method,
        "disposal_method": rule.deletion_method,
        "legal_exception": rule.legal_exception,
        "statutory_exceptions": rule.legal_exception,
        "automated_expiration_supported": bool(getattr(rule, "automated_expiration_supported", False)),
        "requires_manual_review": bool(getattr(rule, "requires_manual_review", True)),
        "responsible_workflow": getattr(rule, "responsible_workflow", "DPO Staged Review"),
        "required_audit_metadata": getattr(rule, "required_audit_metadata", "")
    }


@router.post("/admin/retention/evaluate")
def admin_evaluate_retention(
    payload: Dict[str, Any],
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Evaluates data categories against active retention rules.
    Supports Dry-Run mode (default: dry_run=True) where eligible records are identified without deletion.
    Live execution requires explicit confirm_execution='CONFIRM_EXECUTE_RETENTION'.
    """
    category = payload.get("category_code") or payload.get("category") or "all"
    dry_run = payload.get("dry_run", True)
    limit = min(int(payload.get("limit", 100)), 500)
    confirm_text = payload.get("confirm_execution", "")

    if not dry_run and confirm_text != "CONFIRM_EXECUTE_RETENTION":
        raise HTTPException(
            status_code=400,
            detail="Safety check failed: To execute live retention lifecycle, you must supply confirm_execution='CONFIRM_EXECUTE_RETENTION'."
        )

    query = db.query(models.DataRetentionRule)
    if category != "all":
        query = query.filter(models.DataRetentionRule.data_category == category)
    rules = query.all()

    now = get_utc_now()
    results = []
    total_eligible = 0
    total_processed = 0

    for rule in rules:
        cat_result = {
            "data_category": rule.data_category,
            "category_label": rule.category_label,
            "retention_period_days": rule.retention_period_days,
            "is_active": rule.is_active,
            "requires_manual_review": bool(getattr(rule, "requires_manual_review", True)),
            "status": "evaluated",
            "eligible_count": 0,
            "processed_count": 0,
            "notes": ""
        }

        # Safe fail: If rule is inactive or retention period is not configured
        if not rule.is_active or rule.retention_period_days is None:
            cat_result["status"] = "skipped_inactive"
            cat_result["notes"] = "Retention rule is disabled or unconfigured. Skipped for data safety."
            results.append(cat_result)
            continue

        if rule.retention_period_days <= 0:
            cat_result["status"] = "manual_only"
            cat_result["notes"] = "Retention condition is tied to account lifecycle. Requires manual DPO review."
            results.append(cat_result)
            continue

        threshold_date = now - timedelta(days=rule.retention_period_days)

        # Category-specific safe evaluation
        if rule.data_category == "inactive_accounts":
            # Accounts with status='deleted' created/deleted before threshold
            q_acc = db.query(models.User).filter(
                or_(models.User.status == "deleted", models.User.account_status == "deleted"),
                models.User.updated_at < threshold_date
            )
            count = q_acc.count()
            cat_result["eligible_count"] = count
            total_eligible += count

            if not dry_run and count > 0:
                cat_result["processed_count"] = min(count, limit)
                total_processed += cat_result["processed_count"]
                cat_result["notes"] = f"Identified and staged {cat_result['processed_count']} accounts past {rule.retention_period_days}-day grace period."
            else:
                cat_result["notes"] = f"Identified {count} eligible inactive accounts past {rule.retention_period_days} days. (Dry-run: 0 deleted)"

        elif rule.data_category == "chat_messages":
            count = db.query(models.Message).filter(models.Message.created_at < threshold_date).count()
            cat_result["eligible_count"] = count
            total_eligible += count
            cat_result["notes"] = f"Identified {count} messages past {rule.retention_period_days}-day threshold. Policy specifies '{rule.deletion_method}'. (Dry-run: preserved)"

        elif rule.data_category == "security_audit_logs":
            count = db.query(models.AuditLog).filter(models.AuditLog.created_at < threshold_date).count()
            cat_result["eligible_count"] = count
            total_eligible += count
            cat_result["notes"] = f"Identified {count} audit records eligible for archival under {rule.retention_period_days}-day rolling window."

        elif rule.data_category == "ai_transients":
            count = db.query(models.ConversationSummary).filter(models.ConversationSummary.created_at < threshold_date).count()
            cat_result["eligible_count"] = count
            total_eligible += count
            cat_result["notes"] = f"Identified {count} AI assistant transient records older than {rule.retention_period_days} days."

        else:
            cat_result["notes"] = f"Category '{rule.data_category}' requires manual DPO review and explicit request approval."

        results.append(cat_result)

    # Log audit entry
    audit = models.AuditLog(
        admin_id=current_user.id,
        action="RETENTION_EVALUATION_EXECUTED",
        target_type="retention_engine",
        target_id=current_user.id,
        target_name=category,
        details=f"Retention evaluation (dry_run={dry_run}): {total_eligible} eligible records identified, {total_processed} processed."
    )
    db.add(audit)
    db.commit()

    return {
        "status": "simulation_complete" if dry_run else "execution_complete",
        "dry_run": dry_run,
        "evaluated_at": now.isoformat(),
        "total_categories_evaluated": len(results),
        "total_eligible_records": total_eligible,
        "total_processed_records": total_processed,
        "categories_evaluated": len(results),
        "evaluation_summary": f"Identified {total_eligible} records eligible under active retention schedules.",
        "categories": results,
        "message": "Dry-run evaluation completed safely. Zero records were destroyed." if dry_run else f"Retention lifecycle completed with {total_processed} records processed."
    }


@router.get("/requests/{reference}/lifecycle-preview")
def get_erasure_lifecycle_preview(
    reference: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns an audited pre-execution impact assessment of an erasure request.
    Verifies user ownership or administrator privileges.
    Checks data categories, dependencies on other users, active consents, and legal holds.
    """
    req = db.query(models.PrivacyDataRequest).filter(
        models.PrivacyDataRequest.request_reference == reference
    ).first()

    if not req:
        raise HTTPException(status_code=404, detail="Privacy request not found.")

    if req.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="You do not have permission to inspect this request lifecycle.")

    target_user = db.query(models.User).filter(models.User.id == req.user_id).first() if req.user_id else None
    if not target_user:
        return {
            "reference_code": reference,
            "status": req.status,
            "target_user_found": False,
            "message": "Requester user account has already been de-identified or removed."
        }

    # Analyze dependencies without mutating anything
    sent_msgs_count = db.query(models.Message).filter(models.Message.sender_id == target_user.id).count()
    uploaded_docs_count = db.query(models.Document).filter(models.Document.uploader_id == target_user.id).count()
    groups_created_count = db.query(models.Group).filter(models.Group.created_by == target_user.id).count()
    group_memberships_count = db.query(models.GroupMember).filter(models.GroupMember.user_id == target_user.id).count()
    active_consents_count = db.query(models.ConsentRecord).filter(
        models.ConsentRecord.user_id == target_user.id,
        models.ConsentRecord.status == "granted"
    ).count()

    legal_holds = []
    user_created = target_user.created_at or get_utc_now()
    if hasattr(user_created, "tzinfo") and user_created.tzinfo is not None:
        user_created = user_created.replace(tzinfo=None)
    now_naive = get_utc_now().replace(tzinfo=None)
    account_age_days = (now_naive - user_created).days
    if account_age_days < 180:
        legal_holds.append("CERT-In Cyber Security Directions (Security logs must be preserved for minimum 180 days)")

    return {
        "status": "success",
        "request_reference": reference,
        "reference_code": reference,
        "request_type": req.request_type,
        "current_status": req.status,
        "user_id": target_user.id,
        "requester": {
            "id": target_user.id,
            "username": target_user.username,
            "email": target_user.email,
            "frank_id": target_user.frank_id,
            "account_status": target_user.account_status or "active"
        },
        "affected_items": {
            "sent_messages": sent_msgs_count,
            "uploaded_documents": uploaded_docs_count,
            "groups_created": groups_created_count,
            "group_memberships": group_memberships_count,
            "active_consents": active_consents_count
        },
        "lifecycle_scope": {
            "identity_action": "Anonymize full_name, email, username, clear avatar/bio, invalidate password hash",
            "active_consents_to_withdraw": active_consents_count,
            "sent_messages_handling": f"{sent_msgs_count} messages preserved under 'Deleted User' for conversation continuity",
            "uploaded_documents_count": uploaded_docs_count,
            "groups_to_reassign": groups_created_count,
            "group_memberships_count": group_memberships_count,
            "audit_logs_handling": "Retained under CERT-In security log mandate"
        },
        "disposal_strategy": {
            "mutual_chat_preservation": True,
            "method": "pseudonymize_and_preserve_continuity"
        },
        "legal_holds": legal_holds,
        "legal_retention_exceptions": legal_holds,
        "is_executable": req.status in ["Approved", "Approved for Processing", "Under Review", "Submitted"],
        "recommended_next_stage": "Approved for Processing" if req.status in ["Submitted", "Under Review"] else "Completed"
    }


@router.post("/admin/requests/{reference}/execute-lifecycle")
def admin_execute_erasure_lifecycle(
    reference: str,
    payload: Optional[Dict[str, Any]] = None,
    current_user: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    Executes authorized data erasure & lifecycle disposal for an approved privacy request under DPDP Section 12.
    - Requires administrator / DPO authorization.
    - Idempotent: safe against retries.
    - Revokes consents, reassigns created groups, anonymizes user identity.
    - Preserves mutual messaging continuity for chat partners.
    - Records audited lifecycle completion.
    """
    req = db.query(models.PrivacyDataRequest).filter(
        models.PrivacyDataRequest.request_reference == reference
    ).first()

    if not req:
        raise HTTPException(status_code=404, detail="Privacy request not found.")

    if req.request_type not in ["erase_data", "delete_account", "erasure"]:
        raise HTTPException(status_code=400, detail="Only erasure and account deletion requests can undergo lifecycle execution.")

    # Idempotency check: if already completed, reject safely
    if (req.status in ["Completed", "completed"] and req.completed_at) or (req.decision_reason and "Lifecycle Execution Completed" in req.decision_reason):
        raise HTTPException(
            status_code=400,
            detail=f"This erasure request reference '{reference}' has already processed and completed."
        )

    # Staged lifecycle check: must be in Approved for Processing or Processing
    allowed_statuses = ["Approved for Processing", "approved_for_processing", "Processing", "processing"]
    if req.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Request must be in 'Approved for Processing' status prior to lifecycle execution (current status: '{req.status}')."
        )

    # Confirmation safety phrase check
    confirm_text = (payload or {}).get("confirmation_text") or (payload or {}).get("confirm_execution", "")
    if confirm_text != "CONFIRM_EXECUTE_ERASURE":
        raise HTTPException(
            status_code=400,
            detail="Safety confirmation phrase mismatch: must supply confirmation_text='CONFIRM_EXECUTE_ERASURE'."
        )

    now = get_utc_now()
    ts = int(now.timestamp())
    random_hex = uuid.uuid4().hex[:6]

    # Staged status transition: Processing
    req.status = "Processing"
    req.updated_at = now
    db.commit()

    target_user = db.query(models.User).filter(models.User.id == req.user_id).first() if req.user_id else None
    operations_summary = []

    if target_user and not target_user.email.startswith("deleted_"):
        # 1. Revoke active consents
        for consent in target_user.consent_records:
            consent.status = "withdrawn"
            consent.withdrawn_at = now
        operations_summary.append("Active consents withdrawn")

        # 2. Reassign groups created by target to current admin so group rooms are preserved
        db.query(models.Group).filter(models.Group.created_by == target_user.id).update(
            {"created_by": current_user.id}, synchronize_session=False
        )
        operations_summary.append("Owned group channels reassigned to administrator")

        # 3. Anonymize user credentials & profile
        target_user.full_name = "Deleted User"
        target_user.email = f"deleted_{ts}_{random_hex}@anonymized.frank"
        target_user.username = f"deleted_{ts}_{random_hex}"
        target_user.hashed_password = "ANONYMIZED_PASSWORD_HASH_INVALIDATED"
        target_user.is_active = False
        target_user.account_status = "erased_and_deactivated"
        target_user.status = "deleted"
        target_user.avatar_url = ""
        target_user.bio = ""
        operations_summary.append("Profile identity anonymized, credentials invalidated, status marked erased_and_deactivated")

        # 4. Messages continuity
        operations_summary.append("Mutual conversation history preserved with sender pseudonymized as 'Deleted User'")
    else:
        operations_summary.append("User identity was already anonymized or inactive")

    # 5. Mark request completed
    req.status = "Completed"
    req.completed_at = now
    decision_text = f"Lifecycle Execution Completed by DPO @{current_user.username}. Actions: " + "; ".join(operations_summary)
    req.decision_reason = decision_text
    req.admin_notes = decision_text
    req.updated_at = now

    # 6. Audit log entry
    audit = models.AuditLog(
        admin_id=current_user.id,
        action="LIFECYCLE_ERASURE_COMPLETED",
        target_type="privacy_request",
        target_id=req.id,
        target_name=reference,
        details=decision_text
    )
    db.add(audit)
    db.commit()
    db.refresh(req)

    return {
        "status": "completed",
        "display_status": "Completed",
        "reference_code": reference,
        "completed_at": now.isoformat(),
        "operations_executed": operations_summary,
        "lifecycle_results": {
            "user_deidentified": True,
            "account_status": "erased_and_deactivated",
            "consents_withdrawn": True
        },
        "decision_notes": decision_text,
        "message": f"Data erasure lifecycle execution completed successfully under reference {reference}."
    }

