from typing import List, Optional
from datetime import datetime, timezone
import re
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc
from sqlalchemy.exc import IntegrityError

from database import get_db
import models
import schemas
from security import get_current_user

router = APIRouter(prefix="/api/conversations", tags=["Conversations"])


@router.post("/private", response_model=schemas.ConversationResponse, status_code=status.HTTP_200_OK)
def create_or_get_private_conversation(
    conv_in: schemas.PrivateConversationCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_user = None

    if conv_in.frank_id:
        clean_fid = conv_in.frank_id.strip().upper()
        if len(clean_fid) != 6 or not re.match(r"^[A-Z0-9]{6}$", clean_fid):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Enter a valid 6-character FRANK ID."
            )
        target_user = db.query(models.User).filter(models.User.frank_id == clean_fid).first()
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No user found with this FRANK ID."
            )
    elif conv_in.target_user_id:
        target_user = db.query(models.User).filter(models.User.id == conv_in.target_user_id).first()
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Target user not found."
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either frank_id or target_user_id is required."
        )

    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot create a conversation with yourself."
        )

    # Normalize pair IDs to guarantee uniqueness: user_a < user_b
    user_a_id = min(current_user.id, target_user.id)
    user_b_id = max(current_user.id, target_user.id)

    # 1. Check if conversation already exists
    existing = db.query(models.Conversation).filter(
        models.Conversation.user_a_id == user_a_id,
        models.Conversation.user_b_id == user_b_id
    ).first()

    if existing:
        return schemas.ConversationResponse(
            id=existing.id,
            user_a_id=existing.user_a_id,
            user_b_id=existing.user_b_id,
            partner=schemas.UserResponse.from_orm(target_user),
            created_at=existing.created_at,
            updated_at=existing.updated_at
        )

    # 2. Atomically create conversation with race-condition safety
    try:
        new_conv = models.Conversation(
            user_a_id=user_a_id,
            user_b_id=user_b_id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(new_conv)
        db.commit()
        db.refresh(new_conv)

        return schemas.ConversationResponse(
            id=new_conv.id,
            user_a_id=new_conv.user_a_id,
            user_b_id=new_conv.user_b_id,
            partner=schemas.UserResponse.from_orm(target_user),
            created_at=new_conv.created_at,
            updated_at=new_conv.updated_at
        )
    except Exception:
        db.rollback()
        # Concurrently created by target user
        existing = db.query(models.Conversation).filter(
            models.Conversation.user_a_id == user_a_id,
            models.Conversation.user_b_id == user_b_id
        ).first()
        if existing:
            return schemas.ConversationResponse(
                id=existing.id,
                user_a_id=existing.user_a_id,
                user_b_id=existing.user_b_id,
                partner=schemas.UserResponse.from_orm(target_user),
                created_at=existing.created_at,
                updated_at=existing.updated_at
            )
        raise HTTPException(status_code=500, detail="Failed to initialize conversation")


@router.get("", response_model=List[dict])
def list_conversations(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns unified list of direct and group conversations for the authenticated user.
    """
    conversations = {}

    # 1. Fetch direct messages involving current user
    direct_msgs = db.query(models.Message).filter(
        or_(
            models.Message.sender_id == current_user.id,
            models.Message.recipient_id == current_user.id
        ),
        models.Message.group_id.is_(None)
    ).order_by(desc(models.Message.created_at)).all()

    for msg in direct_msgs:
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
                "frank_id": partner.frank_id,
                "avatar_url": partner.avatar_url,
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

    # 2. Fetch groups where current_user is an active member
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
            "is_private": group.is_private if hasattr(group, "is_private") else True,
            "current_user_role": m.role,
            "members_count": count,
            "created_by": group.created_by,
            "is_online": True,
            "last_seen": None,
            "last_message": last_msg_dict,
            "unread_count": 0
        }

    conv_list = list(conversations.values())
    conv_list.sort(
        key=lambda c: c["last_message"]["created_at"] if c.get("last_message") else "1970-01-01T00:00:00",
        reverse=True
    )
    return conv_list


@router.get("/{conversation_id}", response_model=schemas.ConversationResponse)
def get_conversation_by_id(
    conversation_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    # Strict authorization: Current user must be participant (user_a or user_b)
    if current_user.id != conv.user_a_id and current_user.id != conv.user_b_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this conversation.")

    partner_id = conv.user_b_id if current_user.id == conv.user_a_id else conv.user_a_id
    partner = db.query(models.User).filter(models.User.id == partner_id).first()

    return schemas.ConversationResponse(
        id=conv.id,
        user_a_id=conv.user_a_id,
        user_b_id=conv.user_b_id,
        partner=schemas.UserResponse.from_orm(partner) if partner else None,
        created_at=conv.created_at,
        updated_at=conv.updated_at
    )
