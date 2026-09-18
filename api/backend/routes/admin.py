import math
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc, func

from database import get_db
import models
import schemas
from security import get_current_admin
from services.user_cleanup import (
    delete_user_data_only,
    delete_user_account_permanently,
    force_disconnect_ws
)

router = APIRouter(prefix="/api/admin", tags=["Admin Portal"])


def log_admin_action(
    db: Session,
    admin_user: models.User,
    action: str,
    target_user_id: Optional[int] = None,
    target_identifier: Optional[str] = None,
    details: Optional[str] = None,
    ip_address: Optional[str] = None,
    status_str: str = "success"
):
    """Helper to record audit logs for all administrative actions."""
    try:
        log_entry = models.AdminAuditLog(
            admin_user_id=admin_user.id if admin_user else None,
            action=action,
            target_user_id=target_user_id,
            target_identifier=target_identifier,
            details=details,
            ip_address=ip_address,
            status=status_str
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        print(f"Audit log recording error: {e}")
        db.rollback()


@router.get("/me", response_model=schemas.UserResponse)
def get_admin_me(current_admin: models.User = Depends(get_current_admin)):
    """Verifies that the requester is an active administrator."""
    return current_admin


@router.get("/stats", response_model=schemas.AdminStatsResponse)
def get_system_stats(
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Returns authentic system metrics calculated directly from the database.
    Zero fake or hardcoded values.
    """
    total_users = db.query(func.count(models.User.id)).scalar() or 0
    active_users = db.query(func.count(models.User.id)).filter(models.User.is_active == True).scalar() or 0
    disabled_users = db.query(func.count(models.User.id)).filter(models.User.is_active == False).scalar() or 0
    verified_users = db.query(func.count(models.User.id)).filter(models.User.is_verified == True).scalar() or 0
    unverified_users = db.query(func.count(models.User.id)).filter(models.User.is_verified == False).scalar() or 0
    admin_users = db.query(func.count(models.User.id)).filter(models.User.role == "admin").scalar() or 0

    total_messages = db.query(func.count(models.Message.id)).scalar() or 0
    total_groups = db.query(func.count(models.Group.id)).scalar() or 0
    total_files = db.query(func.count(models.Document.id)).scalar() or 0

    storage_bytes = db.query(func.sum(models.Document.file_size)).scalar() or 0

    return schemas.AdminStatsResponse(
        total_users=total_users,
        active_users=active_users,
        disabled_users=disabled_users,
        verified_users=verified_users,
        unverified_users=unverified_users,
        admin_users=admin_users,
        total_messages=total_messages,
        total_groups=total_groups,
        total_files=total_files,
        storage_used_bytes=int(storage_bytes)
    )


@router.get("/users", response_model=schemas.AdminUsersPaginatedResponse)
def list_users(
    search: Optional[str] = Query(None, description="Search term for username, email, name, frank_id"),
    role: Optional[str] = Query(None, description="Filter by role ('all', 'admin', 'user')"),
    is_active: Optional[bool] = Query(None, description="Filter active status"),
    is_verified: Optional[bool] = Query(None, description="Filter verification status"),
    sort_by: str = Query("created_at", description="Sort field: created_at, username, last_seen"),
    sort_order: str = Query("desc", description="Sort order: asc, desc"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Items per page"),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Search, filter, and paginate users with server-side queries.
    """
    query = db.query(models.User)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.User.username.ilike(s),
                models.User.email.ilike(s),
                models.User.full_name.ilike(s),
                models.User.frank_id.ilike(s)
            )
        )

    if role and role.lower() != "all":
        query = query.filter(models.User.role == role.lower())

    if is_active is not None:
        query = query.filter(models.User.is_active == is_active)

    if is_verified is not None:
        query = query.filter(models.User.is_verified == is_verified)

    # Sorting
    sort_col = models.User.created_at
    if sort_by == "username":
        sort_col = models.User.username
    elif sort_by == "last_seen":
        sort_col = models.User.last_seen

    if sort_order.lower() == "asc":
        query = query.order_by(asc(sort_col))
    else:
        query = query.order_by(desc(sort_col))

    total = query.count()
    total_pages = max(1, math.ceil(total / limit))
    offset = (page - 1) * limit
    users = query.offset(offset).limit(limit).all()

    items = []
    for u in users:
        items.append(schemas.AdminUserListItem(
            id=u.id,
            username=u.username,
            email=u.email,
            full_name=u.full_name,
            frank_id=u.frank_id,
            role=u.role or "user",
            is_active=bool(u.is_active),
            is_verified=bool(u.is_verified),
            is_online=bool(u.is_online),
            last_seen=schemas.format_iso_utc(u.last_seen) if u.last_seen else None,
            created_at=schemas.format_iso_utc(u.created_at),
            avatar_url=u.avatar_url
        ))

    return schemas.AdminUsersPaginatedResponse(
        users=items,
        total=total,
        page=page,
        limit=limit,
        pages=total_pages
    )


@router.get("/users/{user_id}", response_model=schemas.AdminUserDetailResponse)
def get_user_detail(
    user_id: int,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Returns full details and activity summary counts for a single user.
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    messages_count = db.query(func.count(models.Message.id)).filter(models.Message.sender_id == user.id).scalar() or 0
    files_count = db.query(func.count(models.Document.id)).filter(models.Document.uploader_id == user.id).scalar() or 0
    groups_owned = db.query(func.count(models.Group.id)).filter(models.Group.created_by == user.id).scalar() or 0
    groups_joined = db.query(func.count(models.GroupMember.id)).filter(models.GroupMember.user_id == user.id).scalar() or 0

    return schemas.AdminUserDetailResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        full_name=user.full_name,
        frank_id=user.frank_id,
        role=user.role or "user",
        is_active=bool(user.is_active),
        is_verified=bool(user.is_verified),
        is_online=bool(user.is_online),
        last_seen=schemas.format_iso_utc(user.last_seen) if user.last_seen else None,
        created_at=schemas.format_iso_utc(user.created_at),
        avatar_url=user.avatar_url,
        bio=user.bio,
        messages_sent_count=messages_count,
        files_uploaded_count=files_count,
        groups_owned_count=groups_owned,
        groups_joined_count=groups_joined
    )


@router.put("/users/{user_id}/status")
async def update_user_status(
    user_id: int,
    payload: schemas.AdminUserStatusUpdate,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Enable or disable user account.
    If disabled, active websocket sessions are immediately terminated.
    """
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot modify their own active status."
        )

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    prev_status = user.is_active
    user.is_active = payload.is_active
    db.commit()
    db.refresh(user)

    action = "user_enabled" if payload.is_active else "user_disabled"
    detail_msg = f"Status changed from {prev_status} to {payload.is_active}."
    if payload.reason:
        detail_msg += f" Reason: {payload.reason}"

    client_ip = request.client.host if request.client else None
    log_admin_action(
        db=db,
        admin_user=current_admin,
        action=action,
        target_user_id=user.id,
        target_identifier=user.username,
        details=detail_msg,
        ip_address=client_ip
    )

    if not payload.is_active:
        # Forcibly close websocket connections
        await force_disconnect_ws(user.id, reason="account_disabled")

    return {
        "success": True,
        "message": f"User account has been {'enabled' if payload.is_active else 'disabled'}.",
        "user": {
            "id": user.id,
            "username": user.username,
            "is_active": user.is_active
        }
    }


@router.delete("/users/{user_id}/data")
def delete_user_data(
    user_id: int,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Wipes user content (messages, uploaded documents, disk files, bio, avatar),
    while preserving the User account record so credentials remain valid.
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    result = delete_user_data_only(db, user)

    client_ip = request.client.host if request.client else None
    log_admin_action(
        db=db,
        admin_user=current_admin,
        action="delete_user_data",
        target_user_id=user.id,
        target_identifier=user.username,
        details=f"Wiped user data: {result['messages_deleted']} messages, {result['files_deleted']} files.",
        ip_address=client_ip
    )

    return {
        "success": True,
        "message": f"User content for '{user.username}' successfully wiped. Account credentials remain active.",
        "details": result
    }


@router.delete("/users/{user_id}")
async def delete_user_account(
    user_id: int,
    request: Request,
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Permanently and transactionally deletes the user account, associated files,
    conversations, and group ownerships. Cannot be undone.
    """
    if user_id == current_admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Administrators cannot delete their own account via the Admin Portal. Please use account settings or another administrator account."
        )

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    username = user.username
    target_id = user.id

    # Forcibly close websocket connections before deleting records
    await force_disconnect_ws(target_id, reason="account_deleted")

    result = delete_user_account_permanently(db, user)

    client_ip = request.client.host if request.client else None
    log_admin_action(
        db=db,
        admin_user=current_admin,
        action="delete_user_account",
        target_user_id=target_id,
        target_identifier=username,
        details=f"Account permanently deleted. {result['files_deleted']} physical files removed.",
        ip_address=client_ip
    )

    return {
        "success": True,
        "message": f"User account '{username}' has been permanently deleted.",
        "details": result
    }


@router.get("/conversations")
def get_conversations_admin(
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Returns administrative summary of active groups and conversations.
    """
    groups = db.query(models.Group).order_by(desc(models.Group.created_at)).limit(50).all()
    results = []
    for g in groups:
        member_count = db.query(func.count(models.GroupMember.id)).filter(models.GroupMember.group_id == g.id).scalar() or 0
        msg_count = db.query(func.count(models.Message.id)).filter(models.Message.group_id == g.id).scalar() or 0
        creator = db.query(models.User).filter(models.User.id == g.created_by).first()

        results.append({
            "id": g.id,
            "type": "group",
            "name": g.name,
            "description": g.description,
            "creator_username": creator.username if creator else "System",
            "member_count": member_count,
            "message_count": msg_count,
            "created_at": schemas.format_iso_utc(g.created_at)
        })

    return results


@router.get("/audit-logs", response_model=schemas.AdminAuditLogsPaginatedResponse)
def get_audit_logs(
    action: Optional[str] = Query(None, description="Filter by action name"),
    target_user_id: Optional[int] = Query(None, description="Filter by target user ID"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=100, description="Logs per page"),
    current_admin: models.User = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Retrieves chronological audit logs for administrative actions.
    """
    query = db.query(models.AdminAuditLog)

    if action:
        query = query.filter(models.AdminAuditLog.action == action.strip())

    if target_user_id:
        query = query.filter(models.AdminAuditLog.target_user_id == target_user_id)

    query = query.order_by(desc(models.AdminAuditLog.created_at))

    total = query.count()
    total_pages = max(1, math.ceil(total / limit))
    offset = (page - 1) * limit
    logs = query.offset(offset).limit(limit).all()

    items = []
    for log in logs:
        admin_user = db.query(models.User).filter(models.User.id == log.admin_user_id).first() if log.admin_user_id else None
        items.append(schemas.AdminAuditLogItem(
            id=log.id,
            admin_user_id=log.admin_user_id,
            admin_email=admin_user.email if admin_user else "System/Deleted Admin",
            admin_username=admin_user.username if admin_user else "Unknown",
            action=log.action,
            target_user_id=log.target_user_id,
            target_identifier=log.target_identifier,
            details=log.details,
            ip_address=log.ip_address,
            status=log.status or "success",
            created_at=schemas.format_iso_utc(log.created_at)
        ))

    return schemas.AdminAuditLogsPaginatedResponse(
        logs=items,
        total=total,
        page=page,
        limit=limit,
        pages=total_pages
    )
