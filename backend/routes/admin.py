import os
from pathlib import Path
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, func, case, and_
from database import get_db
import models
import schemas
from security import get_current_admin_user
from websocket.chat import manager

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/metrics", response_model=schemas.AdminMetricsResponse)
def get_metrics(
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Return real-time metrics calculated directly from database records."""
    not_deleted = or_(models.User.status.is_(None), models.User.status != "deleted")
    user_counts = db.query(
        func.count(models.User.id).label("total"),
        func.count(case((and_(models.User.is_active == True, models.User.account_status == "active"), 1))).label("active"),
        func.count(case((or_(models.User.account_status.in_(["disabled", "deactivated", "inactive"]), models.User.is_active == False), 1))).label("disabled")
    ).filter(not_deleted).first()

    total_users = user_counts.total if user_counts else 0
    active_accounts = user_counts.active if user_counts else 0
    disabled_accounts = user_counts.disabled if user_counts else 0

    total_messages = db.query(models.Message).count()
    groups_count = db.query(models.Group).count()
    files_count = db.query(models.Document).count()
    email_verified = active_accounts

    return schemas.AdminMetricsResponse(
        total_users=total_users,
        active_accounts=active_accounts,
        disabled_accounts=disabled_accounts,
        email_verified=email_verified,
        total_messages=total_messages,
        groups=groups_count,
        files=files_count
    )


@router.get("/users", response_model=schemas.AdminUserListResponse)
def get_users(
    q: Optional[str] = Query(None, description="Search by name, username, email, or FRANK ID"),
    status: Optional[str] = Query("all", description="Filter by status: all, active, disabled, deactivated"),
    role: Optional[str] = Query("all", description="Filter by role: all, admin, user"),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Paginated, searchable, filterable list of users with safe metadata only."""
    query = db.query(models.User).filter(or_(models.User.status.is_(None), models.User.status != "deleted"))

    if q and q.strip():
        pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(
                models.User.full_name.ilike(pattern),
                models.User.username.ilike(pattern),
                models.User.email.ilike(pattern),
                models.User.frank_id.ilike(pattern)
            )
        )

    if status and status.lower() != "all":
        clean_s = status.lower()
        if clean_s in ["disabled", "deactivated", "inactive"]:
            query = query.filter(
                or_(
                    models.User.account_status.in_(["disabled", "deactivated", "inactive"]),
                    models.User.is_active == False
                )
            )
        elif clean_s in ["active", "activated"]:
            query = query.filter(
                models.User.account_status == "active",
                models.User.is_active == True
            )
        else:
            query = query.filter(models.User.account_status == clean_s)

    if role and role.lower() != "all":
        query = query.filter(models.User.role == role.lower())

    total = query.count()
    pages = max(1, (total + limit - 1) // limit)
    offset = (page - 1) * limit

    users = query.order_by(models.User.created_at.desc()).offset(offset).limit(limit).all()

    return schemas.AdminUserListResponse(
        total=total,
        page=page,
        limit=limit,
        pages=pages,
        users=[schemas.AdminUserResponse.from_orm(u) for u in users]
    )


@router.get("/users/{user_id}")
def get_user_details(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Retrieve administrative user metadata details. Zero access to private chat content."""
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    messages_count = db.query(models.Message).filter(models.Message.sender_id == user.id).count()
    groups_count = db.query(models.GroupMember).filter(models.GroupMember.user_id == user.id).count()
    files_count = db.query(models.Document).filter(models.Document.uploader_id == user.id).count()

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "frank_id": user.frank_id,
        "role": user.role,
        "account_status": user.account_status,
        "bio": user.bio,
        "avatar_url": user.avatar_url,
        "is_online": user.is_online,
        "last_seen": schemas.format_iso_utc(user.last_seen) if user.last_seen else None,
        "created_at": schemas.format_iso_utc(user.created_at),
        "messages_count": messages_count,
        "groups_count": groups_count,
        "files_count": files_count
    }


async def _set_user_status(user_id: int, new_status: str, current_admin: models.User, db: Session) -> schemas.AdminUserResponse:
    """Helper to update user account status, record standardized audit log, and disconnect sockets if deactivated."""
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change the status of your own administrator account."
        )

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    clean_status = (new_status or "").strip().lower()
    is_deactivating = clean_status in ["disabled", "deactivated", "inactive", "disable", "deactivate"]

    # Prevent deactivating the last active administrator
    if user.role == "admin" and is_deactivating:
        active_admin_count = db.query(models.User).filter(
            models.User.role == "admin",
            models.User.is_active == True,
            models.User.account_status == "active",
            models.User.id != user_id
        ).count()
        if active_admin_count < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate the last remaining active administrator account."
            )

    if is_deactivating:
        user.is_active = False
        user.is_online = False
        user.account_status = "deactivated"
        user.status = "deactivated"
        action_name = "ADMIN_DEACTIVATED_USER"
        log_detail = f"Account deactivated by admin @{current_admin.username}"
    else:
        user.is_active = True
        user.account_status = "active"
        user.status = "active"
        action_name = "ADMIN_ACTIVATED_USER"
        log_detail = f"Account activated by admin @{current_admin.username}"

    audit = models.AuditLog(
        admin_id=current_admin.id,
        action=action_name,
        target_type="user",
        target_id=user.id,
        target_name=user.full_name or user.username,
        details=log_detail
    )
    db.add(audit)
    db.commit()
    db.refresh(user)
    db.refresh(audit)

    # Disconnect user's active sockets if deactivated
    if not user.is_active:
        try:
            await manager.disconnect_user(user.id)
        except Exception as e:
            print(f"Disconnect socket note: {e}")

    # Broadcast live updates to admin connections
    user_data = {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "full_name": user.full_name,
        "frank_id": user.frank_id,
        "role": user.role,
        "account_status": user.account_status,
        "is_active": user.is_active,
        "is_online": user.is_online,
        "created_at": schemas.format_iso_utc(user.created_at)
    }
    try:
        await manager.broadcast_admin({
            "type": "admin_user_updated",
            "user": user_data
        })
        await manager.broadcast_admin_metrics(db)
        await manager.broadcast_admin({
            "type": "admin_audit_created",
            "audit": {
                "id": audit.id,
                "admin_id": current_admin.id,
                "admin_name": current_admin.full_name,
                "admin_username": current_admin.username,
                "action": audit.action,
                "target_type": audit.target_type,
                "target_id": audit.target_id,
                "target_name": audit.target_name,
                "details": audit.details,
                "created_at": schemas.format_iso_utc(audit.created_at)
            }
        })
    except Exception:
        pass

    return schemas.AdminUserResponse.from_orm(user)


@router.put("/users/{user_id}/status", response_model=schemas.AdminUserResponse)
async def update_user_status(
    user_id: int,
    status_in: schemas.AdminUserStatusUpdate,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Enable, activate, disable, or deactivate user account."""
    return await _set_user_status(user_id, status_in.status, current_admin, db)


@router.post("/users/{user_id}/activate", response_model=schemas.AdminUserResponse)
async def activate_user(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Activate user account."""
    return await _set_user_status(user_id, "active", current_admin, db)


@router.post("/users/{user_id}/deactivate", response_model=schemas.AdminUserResponse)
async def deactivate_user(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Deactivate user account and disconnect active sockets."""
    return await _set_user_status(user_id, "deactivated", current_admin, db)


@router.post("/users/{user_id}/disable", response_model=schemas.AdminUserResponse)
async def disable_user(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Disable user account, disconnect active sockets, and record audit log."""
    return await _set_user_status(user_id, "deactivated", current_admin, db)


@router.post("/users/{user_id}/enable", response_model=schemas.AdminUserResponse)
async def enable_user(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Enable user account and record audit log."""
    return await _set_user_status(user_id, "active", current_admin, db)


@router.post("/users/{user_id}/reactivate", response_model=schemas.AdminUserResponse)
async def reactivate_user(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Reactivate user account."""
    return await _set_user_status(user_id, "active", current_admin, db)


@router.delete("/users/{user_id}/data")
async def delete_user_data(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    DATA PRESERVATION: Protects the user's sent messages and uploaded documents.
    Historical data is retained to ensure complete conversation context and record preservation.
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Data preservation: Keep all messages, media attachments, and activity history intact
    audit = models.AuditLog(
        admin_id=current_admin.id,
        action="user_data_retained",
        target_type="user",
        target_id=user.id,
        target_name=user.full_name or user.username,
        details=f"User data protected and retained for @{user.username} under retention policy"
    )
    db.add(audit)
    db.commit()

    return {"success": True, "message": f"Historical messages and files for {user.full_name or user.username} are safely preserved."}


@router.delete("/users/{user_id}")
async def delete_user_account(
    user_id: int,
    soft: bool = Query(True, description="Safe soft-deletion preserves message and conversation history"),
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    DELETE ACCOUNT: Deactivates the selected user account, safely preserving
    all message and conversation history, documents, and shared data.
    """
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own administrator account."
        )

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Prevent deleting the last remaining active administrator account
    if user.role == "admin":
        active_admin_count = db.query(models.User).filter(
            models.User.role == "admin",
            models.User.is_active == True,
            models.User.account_status == "active",
            models.User.id != user_id
        ).count()
        if active_admin_count < 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the last remaining active administrator account."
            )

    target_name = user.full_name or user.username
    target_username = user.username
    target_email = user.email
    target_frank_id = user.frank_id

    # 1. Disconnect any active WebSocket connections immediately
    try:
        await manager.disconnect_user(user.id)
    except Exception:
        pass

    # 2. Release email and username to satisfy unique database constraint and permit re-registration
    ts = int(datetime.now(timezone.utc).timestamp())
    if not user.email.startswith("deleted_"):
        user.email = f"deleted_{ts}_{user.email}"
    if not user.username.startswith("deleted_"):
        user.username = f"deleted_{ts}_{user.username}"

    # 3. Safe data preservation: Retain account ID and foreign keys while deactivating access
    user.is_active = False
    user.account_status = "deleted"
    user.status = "deleted"
    user.is_online = False

    # Reassign groups created by target to current_admin so group channels are preserved
    db.query(models.Group).filter(models.Group.created_by == user.id).update(
        {"created_by": current_admin.id}, synchronize_session=False
    )

    # Reassign target's audit logs to current_admin to preserve system history
    db.query(models.AuditLog).filter(models.AuditLog.admin_id == user.id).update(
        {"admin_id": current_admin.id}, synchronize_session=False
    )

    audit = models.AuditLog(
        admin_id=current_admin.id,
        action="account_deleted",
        target_type="user",
        target_id=user_id,
        target_name=target_name,
        details=f"Deactivated user account @{target_username} ({target_name}, {target_email}, FRANK ID: {target_frank_id}) with all chat history and data preserved."
    )
    db.add(audit)
    db.commit()

    # Broadcast live updates to admin sockets
    try:
        await manager.broadcast_admin({
            "type": "admin_user_deleted",
            "user_id": user_id
        })
        await manager.broadcast_admin_metrics(db)
        await manager.broadcast_admin({
            "type": "admin_audit_created",
            "audit": {
                "id": audit.id,
                "admin_id": current_admin.id,
                "admin_name": current_admin.full_name,
                "admin_username": current_admin.username,
                "action": audit.action,
                "target_type": audit.target_type,
                "target_id": audit.target_id,
                "target_name": audit.target_name,
                "details": audit.details,
                "created_at": schemas.format_iso_utc(audit.created_at)
            }
        })
    except Exception:
        pass

    return {"success": True, "message": f"Account for {target_name} deactivated. All historical data and messages have been preserved."}


@router.get("/groups", response_model=List[schemas.AdminGroupResponse])
def get_groups_metadata(
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Group metadata only. Absolutely NO chat messages or message content."""
    groups = db.query(models.Group).order_by(models.Group.created_at.desc()).all()
    if not groups:
        return []

    group_ids = [g.id for g in groups]
    creator_ids = list(set(g.created_by for g in groups if g.created_by))

    # Single batch query for member counts
    counts_raw = db.query(
        models.GroupMember.group_id,
        func.count(models.GroupMember.id)
    ).filter(models.GroupMember.group_id.in_(group_ids)).group_by(models.GroupMember.group_id).all()
    count_map = {r[0]: r[1] for r in counts_raw}

    # Single batch query for creators
    creators = db.query(models.User).filter(models.User.id.in_(creator_ids)).all() if creator_ids else []
    creator_map = {u.id: u for u in creators}

    results = []
    for g in groups:
        creator = creator_map.get(g.created_by)
        results.append(schemas.AdminGroupResponse(
            id=g.id,
            name=g.name,
            description=g.description or "",
            privacy=g.privacy,
            created_by=g.created_by,
            creator_name=creator.full_name if creator else "User",
            members_count=count_map.get(g.id, 1),
            created_at=g.created_at
        ))
    return results


@router.get("/audit-logs", response_model=schemas.AuditLogListResponse)
def get_audit_logs(
    page: int = Query(1, ge=1),
    limit: int = Query(15, ge=1, le=100),
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Retrieve chronological audit logs of administrative actions."""
    query = db.query(models.AuditLog)
    total = query.count()
    pages = max(1, (total + limit - 1) // limit)
    offset = (page - 1) * limit

    logs = query.order_by(models.AuditLog.created_at.desc()).offset(offset).limit(limit).all()

    # Single batch query for admin users
    admin_ids = list(set(l.admin_id for l in logs if l.admin_id))
    admins = db.query(models.User).filter(models.User.id.in_(admin_ids)).all() if admin_ids else []
    admin_map = {u.id: u for u in admins}

    log_responses = []
    for log in logs:
        admin_user = admin_map.get(log.admin_id)
        log_responses.append(schemas.AuditLogResponse(
            id=log.id,
            admin_id=log.admin_id,
            admin_name=admin_user.full_name if admin_user else "Admin",
            admin_username=admin_user.username if admin_user else "admin",
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            target_name=log.target_name,
            details=log.details,
            created_at=log.created_at
        ))

    return schemas.AuditLogListResponse(
        total=total,
        page=page,
        limit=limit,
        pages=pages,
        logs=log_responses
    )


@router.get("/activity", response_model=List[schemas.ActivityItem])
def get_live_activity(
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Live activity metadata stream. Only system events, strictly NO message plaintext."""
    activities = []

    # Recent user registrations
    recent_users = db.query(models.User).order_by(models.User.created_at.desc()).limit(5).all()
    for u in recent_users:
        activities.append(schemas.ActivityItem(
            id=f"user-{u.id}",
            title="User Registered",
            description=f"{u.full_name} (@{u.username}) joined with FRANK ID {u.frank_id}",
            category="user",
            created_at=schemas.format_iso_utc(u.created_at)
        ))

    # Recent group creations
    recent_groups = db.query(models.Group).order_by(models.Group.created_at.desc()).limit(5).all()
    for g in recent_groups:
        activities.append(schemas.ActivityItem(
            id=f"group-{g.id}",
            title="Group Created",
            description=f"Group '{g.name}' was created ({g.privacy})",
            category="group",
            created_at=schemas.format_iso_utc(g.created_at)
        ))

    # Recent audit actions
    recent_audits = db.query(models.AuditLog).order_by(models.AuditLog.created_at.desc()).limit(5).all()
    for a in recent_audits:
        activities.append(schemas.ActivityItem(
            id=f"audit-{a.id}",
            title=f"Admin Action: {a.action.replace('_', ' ').title()}",
            description=a.details or f"Action on {a.target_type} {a.target_name or ''}",
            category="security",
            created_at=schemas.format_iso_utc(a.created_at)
        ))

    # Sort all by created_at desc
    activities.sort(key=lambda x: x.created_at, reverse=True)
    return activities[:15]


# ---------------- ACCOUNT ACCESS REQUESTS MANAGEMENT ----------------

@router.get("/access-requests", response_model=schemas.AccountAccessRequestListResponse)
def get_account_access_requests(
    q: Optional[str] = Query(None, description="Search by request reference, contact email, account email, or subject"),
    status: Optional[str] = Query("all", description="Filter by status: all, Pending, In Review, Resolved, Rejected"),
    source: Optional[str] = Query("all", description="Filter by source: all, disabled_account, landing_page"),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """List, filter, and search account access requests submitted by users or visitors."""
    query = db.query(models.AccountAccessRequest)

    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                models.AccountAccessRequest.request_reference.ilike(term),
                models.AccountAccessRequest.email.ilike(term),
                models.AccountAccessRequest.account_email.ilike(term),
                models.AccountAccessRequest.subject.ilike(term)
            )
        )

    if status and status.lower() != "all":
        status_clean = status.strip()
        query = query.filter(func.lower(models.AccountAccessRequest.status) == status_clean.lower())

    if source and source.lower() != "all":
        source_clean = source.strip()
        query = query.filter(func.lower(models.AccountAccessRequest.source) == source_clean.lower())

    total = query.count()
    pending_count = db.query(models.AccountAccessRequest).filter(
        func.lower(models.AccountAccessRequest.status) == "pending"
    ).count()

    total_pages = max(1, (total + limit - 1) // limit)
    offset = (page - 1) * limit
    items = query.order_by(models.AccountAccessRequest.created_at.desc()).offset(offset).limit(limit).all()

    return schemas.AccountAccessRequestListResponse(
        items=[schemas.AccountAccessRequestResponse.from_orm(it) for it in items],
        total=total,
        page=page,
        page_size=limit,
        total_pages=total_pages,
        pending_count=pending_count
    )


@router.get("/access-requests/{request_id}", response_model=schemas.AccountAccessRequestResponse)
def get_account_access_request_details(
    request_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Retrieve full details of an account access request."""
    req = db.query(models.AccountAccessRequest).filter(models.AccountAccessRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account access request not found.")
    return schemas.AccountAccessRequestResponse.from_orm(req)


@router.put("/access-requests/{request_id}", response_model=schemas.AccountAccessRequestResponse)
def update_account_access_request(
    request_id: int,
    payload: schemas.AccountAccessRequestUpdate,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Update status and/or administrator private notes for an account access request."""
    req = db.query(models.AccountAccessRequest).filter(models.AccountAccessRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account access request not found.")

    if payload.status:
        req.status = payload.status
    if payload.admin_notes is not None:
        req.admin_notes = payload.admin_notes.strip()

    req.updated_at = models.get_utc_now()

    # Log audit entry
    audit = models.AuditLog(
        admin_id=current_admin.id,
        action="update_access_request",
        target_type="access_request",
        target_id=req.id,
        target_name=req.request_reference,
        details=f"Status set to {req.status}"
    )
    db.add(audit)

    db.commit()
    db.refresh(req)

    return schemas.AccountAccessRequestResponse.from_orm(req)

