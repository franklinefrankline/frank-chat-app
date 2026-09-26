import os
from pathlib import Path
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
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
    total_users = db.query(models.User).count()
    active_accounts = db.query(models.User).filter(models.User.account_status == "active").count()
    disabled_accounts = db.query(models.User).filter(models.User.account_status == "disabled").count()
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
    status: Optional[str] = Query("all", description="Filter by status: all, active, disabled"),
    role: Optional[str] = Query("all", description="Filter by role: all, admin, user"),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Paginated, searchable, filterable list of users with safe metadata only."""
    query = db.query(models.User)

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
        query = query.filter(models.User.account_status == status.lower())

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
    """Helper to update user account status, record standardized audit log, and disconnect sockets if disabled."""
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change the status of your own administrator account."
        )

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    clean_status = (new_status or "").strip().lower()
    if clean_status not in ["active", "disabled"]:
        clean_status = "disabled" if "disab" in clean_status else "active"

    user.account_status = clean_status
    user.status = clean_status
    if clean_status == "disabled":
        user.is_online = False

    action_name = "ADMIN_DISABLED_USER" if clean_status == "disabled" else "ADMIN_ENABLED_USER"
    audit = models.AuditLog(
        admin_id=current_admin.id,
        action=action_name,
        target_type="user",
        target_id=user.id,
        target_name=user.full_name,
        details=f"Account status set to {clean_status} by admin {current_admin.username}"
    )
    db.add(audit)
    db.commit()
    db.refresh(user)
    db.refresh(audit)

    # Disconnect user's active sockets if disabled
    if clean_status == "disabled":
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
    """Enable or disable user account. Disconnects active WebSocket sessions if disabled."""
    return await _set_user_status(user_id, status_in.status, current_admin, db)


@router.post("/users/{user_id}/disable", response_model=schemas.AdminUserResponse)
async def disable_user(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Disable user account, disconnect active sockets, and record ADMIN_DISABLED_USER."""
    return await _set_user_status(user_id, "disabled", current_admin, db)


@router.post("/users/{user_id}/enable", response_model=schemas.AdminUserResponse)
async def enable_user(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Enable user account and record ADMIN_ENABLED_USER."""
    return await _set_user_status(user_id, "active", current_admin, db)


@router.delete("/users/{user_id}/data")
async def delete_user_data(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    DELETE USER DATA: Wipes the user's sent messages and uploaded documents
    while preserving the user account itself.
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # 1. Clean up user's uploaded files from disk and database
    docs = db.query(models.Document).filter(models.Document.uploader_id == user.id).all()
    upload_dir = Path(__file__).resolve().parent.parent / "uploads"
    for doc in docs:
        if doc.stored_filename:
            file_path = upload_dir / doc.stored_filename
            if file_path.exists():
                try:
                    os.remove(file_path)
                except Exception:
                    pass
        db.delete(doc)

    # 2. Delete user's sent messages (reactions cascade automatically)
    db.query(models.Message).filter(models.Message.sender_id == user.id).delete(synchronize_session=False)

    # 3. Log audit event
    audit = models.AuditLog(
        admin_id=current_admin.id,
        action="user_data_deleted",
        target_type="user",
        target_id=user.id,
        target_name=user.full_name,
        details=f"Cleared all sent messages and uploaded files for user {user.username}"
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)

    # Broadcast live updates to admin
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

    return {"success": True, "message": f"All messages and files for {user.full_name} have been deleted."}


@router.delete("/users/{user_id}")
async def delete_user_account(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    DELETE ACCOUNT: Permanently deletes the user account, cascading relationships,
    cleaning up uploaded files, invalidating active sessions, and disconnecting WebSockets.
    """
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own administrator account."
        )

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    target_name = user.full_name
    target_username = user.username
    target_email = user.email
    target_frank_id = user.frank_id

    # 1. Disconnect any active WebSocket connections immediately
    try:
        await manager.disconnect_user(user.id)
    except Exception:
        pass

    # 2. Clean up user's physical files and document records
    upload_dir = Path(__file__).resolve().parent.parent / "uploads"
    docs = db.query(models.Document).filter(models.Document.uploader_id == user.id).all()
    for doc in docs:
        if doc.stored_filename:
            file_path = upload_dir / doc.stored_filename
            if file_path.exists():
                try:
                    os.remove(file_path)
                except Exception:
                    pass
        db.delete(doc)

    # 3. Delete user's reactions
    db.query(models.Reaction).filter(models.Reaction.user_id == user.id).delete(synchronize_session=False)

    # 4. Delete messages sent or received by user
    db.query(models.Message).filter(
        or_(models.Message.sender_id == user.id, models.Message.recipient_id == user.id)
    ).delete(synchronize_session=False)

    # 5. Delete group memberships
    db.query(models.GroupMember).filter(models.GroupMember.user_id == user.id).delete(synchronize_session=False)

    # 6. Reassign any groups created by this user to current_admin so foreign keys are preserved
    db.query(models.Group).filter(models.Group.created_by == user.id).update(
        {"created_by": current_admin.id}, synchronize_session=False
    )

    # 7. Delete conversation preferences involving user
    db.query(models.ConversationPreference).filter(models.ConversationPreference.user_id == user.id).delete(synchronize_session=False)

    # 8. Delete private conversations involving user
    db.query(models.Conversation).filter(
        or_(models.Conversation.user_a_id == user.id, models.Conversation.user_b_id == user.id)
    ).delete(synchronize_session=False)

    # 9. Reassign any audit logs where user was admin to current admin
    db.query(models.AuditLog).filter(models.AuditLog.admin_id == user.id).update(
        {"admin_id": current_admin.id}, synchronize_session=False
    )

    # 10. Permanently delete user account record
    db.delete(user)

    # 11. Record immutable audit log
    audit = models.AuditLog(
        admin_id=current_admin.id,
        action="account_deleted",
        target_type="user",
        target_id=user_id,
        target_name=target_name,
        details=f"Permanently deleted user account @{target_username} ({target_name}, {target_email}, FRANK ID: {target_frank_id}) from Railway PostgreSQL"
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)

    # 12. Broadcast live updates to admin sockets
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

    return {"success": True, "message": f"Account for {target_name} permanently deleted."}


@router.get("/groups", response_model=List[schemas.AdminGroupResponse])
def get_groups_metadata(
    current_admin: models.User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """Group metadata only. Absolutely NO chat messages or message content."""
    groups = db.query(models.Group).order_by(models.Group.created_at.desc()).all()
    results = []
    for g in groups:
        count = db.query(models.GroupMember).filter(models.GroupMember.group_id == g.id).count()
        creator = db.query(models.User).filter(models.User.id == g.created_by).first()
        results.append(schemas.AdminGroupResponse(
            id=g.id,
            name=g.name,
            description=g.description or "",
            privacy=g.privacy,
            created_by=g.created_by,
            creator_name=creator.full_name if creator else "User",
            members_count=count,
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
    log_responses = []
    for log in logs:
        admin_user = db.query(models.User).filter(models.User.id == log.admin_id).first()
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
