from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
from database import get_db
import models
import schemas
from security import get_current_user

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.get("", response_model=List[schemas.UserResponse])
def get_users(
    q: Optional[str] = Query(None, description="Search by username or name"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = db.query(models.User).filter(models.User.id != current_user.id)
    if q:
        search_pattern = f"%{q.strip()}%"
        query = query.filter(
            or_(
                models.User.username.ilike(search_pattern),
                models.User.full_name.ilike(search_pattern)
            )
        )
    return query.order_by(models.User.full_name).limit(50).all()


@router.get("/profile", response_model=schemas.UserResponse)
def get_profile(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.put("/profile", response_model=schemas.UserResponse)
def update_profile(
    user_update: schemas.UserUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if user_update.full_name is not None:
        current_user.full_name = user_update.full_name.strip()
    if user_update.bio is not None:
        current_user.bio = user_update.bio.strip()
    if user_update.avatar_url is not None:
        current_user.avatar_url = user_update.avatar_url.strip()

    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/conversations")
def get_conversations(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns list of recent direct and group conversations with last message,
    unread count, and details.
    """
    conversations = {}

    # 1. Fetch direct messages involving current user
    messages = db.query(models.Message).filter(
        or_(
            models.Message.sender_id == current_user.id,
            models.Message.recipient_id == current_user.id
        ),
        models.Message.group_id.is_(None)
    ).order_by(desc(models.Message.created_at)).all()

    for msg in messages:
        partner_id = msg.recipient_id if msg.sender_id == current_user.id else msg.sender_id
        conv_key = f"direct_{partner_id}"
        if conv_key not in conversations:
            partner = db.query(models.User).filter(models.User.id == partner_id).first()
            if not partner:
                continue

            unread = db.query(models.Message).filter(
                models.Message.sender_id == partner_id,
                models.Message.recipient_id == current_user.id,
                models.Message.status != "read"
            ).count()

            conversations[conv_key] = {
                "id": partner.id,
                "type": "direct",
                "name": partner.full_name,
                "username": partner.username,
                "avatar_url": partner.avatar_url,
                "frank_id": partner.frank_id,
                "is_online": partner.is_online,
                "last_seen": schemas.format_iso_utc(partner.last_seen) if partner.last_seen else None,
                "last_message": {
                    "id": msg.id,
                    "content": msg.content,
                    "message_type": msg.message_type or "text",
                    "sender_id": msg.sender_id,
                    "created_at": schemas.format_iso_utc(msg.created_at),
                    "status": msg.status
                },
                "unread_count": unread
            }

    # 2. Fetch all groups user is a member of
    memberships = db.query(models.GroupMember).filter(models.GroupMember.user_id == current_user.id).all()
    for m in memberships:
        group = db.query(models.Group).filter(models.Group.id == m.group_id).first()
        if not group:
            continue

        conv_key = f"group_{group.id}"
        count = db.query(models.GroupMember).filter(models.GroupMember.group_id == group.id).count()

        last_grp_msg = db.query(models.Message).filter(
            models.Message.group_id == group.id
        ).order_by(desc(models.Message.created_at)).first()

        last_msg_dict = None
        if last_grp_msg:
            sender = db.query(models.User).filter(models.User.id == last_grp_msg.sender_id).first()
            last_msg_dict = {
                "id": last_grp_msg.id,
                "content": last_grp_msg.content,
                "message_type": last_grp_msg.message_type or "text",
                "sender_id": last_grp_msg.sender_id,
                "sender_name": sender.full_name if sender else "User",
                "created_at": schemas.format_iso_utc(last_grp_msg.created_at),
                "status": last_grp_msg.status
            }

        conversations[conv_key] = {
            "id": group.id,
            "type": "group",
            "name": group.name,
            "description": group.description or "",
            "avatar_url": group.avatar_url or "",
            "members_count": count,
            "created_by": group.created_by,
            "is_online": True,
            "last_seen": None,
            "last_message": last_msg_dict,
            "unread_count": 0
        }

    conv_list = list(conversations.values())
    # Sort by recent message time descending
    conv_list.sort(
        key=lambda c: c["last_message"]["created_at"] if c.get("last_message") else "1970-01-01T00:00:00",
        reverse=True
    )
    return conv_list


@router.get("/frank/{frank_id}", response_model=schemas.UserResponse)
def get_user_by_frank_id(
    frank_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    clean_id = (frank_id or "").strip().upper()
    import re
    if len(clean_id) != 6 or not re.match(r"^[A-Z0-9]{6}$", clean_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Enter a valid 6-character FRANK ID."
        )

    user = db.query(models.User).filter(models.User.frank_id == clean_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No user found with this FRANK ID."
        )

    return user


@router.get("/{user_id}", response_model=schemas.UserResponse)
def get_user_by_id(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
