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


# ─── Helper: build a self-conversation response dict ─────────────────────────
def _self_conv_dict(conv: models.Conversation, current_user: models.User, last_msg=None) -> dict:
    last_msg_dict = None
    if last_msg:
        last_msg_dict = {
            "id": last_msg.id,
            "content": last_msg.content,
            "message_type": last_msg.message_type or "text",
            "sender_id": last_msg.sender_id,
            "created_at": schemas.format_iso_utc(last_msg.created_at),
            "status": last_msg.status
        }
    return {
        "id": current_user.id,          # Use user_id as conversation ID for self-chat
        "conv_id": conv.id,             # Real DB conversation ID
        "type": "self",
        "name": "My Notes",
        "username": current_user.username,
        "full_name": current_user.full_name,
        "frank_id": current_user.frank_id,
        "avatar_url": current_user.avatar_url,
        "is_online": True,
        "last_seen": None,
        "last_message": last_msg_dict,
        "unread_count": 0
    }


# ─── POST /api/conversations/self ────────────────────────────────────────────
@router.post("/self", status_code=status.HTTP_200_OK)
def create_or_get_self_conversation(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create or retrieve the self-chat conversation for the authenticated user.
    Self-chat is represented as a Conversation where user_a_id == user_b_id == current_user.id.
    Idempotent — safe to call multiple times, always returns the same conversation.
    """
    existing = db.query(models.Conversation).filter(
        models.Conversation.user_a_id == current_user.id,
        models.Conversation.user_b_id == current_user.id
    ).first()

    if existing:
        last_msg = db.query(models.Message).filter(
            models.Message.conversation_id == existing.id
        ).order_by(desc(models.Message.created_at)).first()
        return _self_conv_dict(existing, current_user, last_msg)

    try:
        new_conv = models.Conversation(
            user_a_id=current_user.id,
            user_b_id=current_user.id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(new_conv)
        db.commit()
        db.refresh(new_conv)
        return _self_conv_dict(new_conv, current_user)
    except Exception:
        db.rollback()
        # Race condition — fetch the one just created
        existing = db.query(models.Conversation).filter(
            models.Conversation.user_a_id == current_user.id,
            models.Conversation.user_b_id == current_user.id
        ).first()
        if existing:
            return _self_conv_dict(existing, current_user)
        raise HTTPException(status_code=500, detail="Failed to initialize self-conversation")


# ─── GET /api/conversations/self ─────────────────────────────────────────────
@router.get("/self")
def get_self_conversation(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get the self-chat conversation for the authenticated user.
    Creates it automatically if it doesn't yet exist.
    """
    existing = db.query(models.Conversation).filter(
        models.Conversation.user_a_id == current_user.id,
        models.Conversation.user_b_id == current_user.id
    ).first()

    if not existing:
        # Auto-create
        existing = models.Conversation(
            user_a_id=current_user.id,
            user_b_id=current_user.id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(existing)
        db.commit()
        db.refresh(existing)

    last_msg = db.query(models.Message).filter(
        models.Message.conversation_id == existing.id
    ).order_by(desc(models.Message.created_at)).first()

    return _self_conv_dict(existing, current_user, last_msg)


def get_or_create_private_conversation(user_a_id: int, user_b_id: int, db: Session) -> tuple[models.Conversation, bool]:
    """
    Get or create a private conversation between user_a and user_b.
    Normalizes pair IDs to user_a < user_b to ensure only ONE conversation exists per user pair.
    Returns (conversation, is_new: bool).
    """
    if user_a_id == user_b_id:
        existing = db.query(models.Conversation).filter(
            models.Conversation.user_a_id == user_a_id,
            models.Conversation.user_b_id == user_b_id
        ).first()
        if existing:
            return existing, False
        new_conv = models.Conversation(
            user_a_id=user_a_id,
            user_b_id=user_b_id,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(new_conv)
        db.commit()
        db.refresh(new_conv)
        return new_conv, True

    u_min = min(user_a_id, user_b_id)
    u_max = max(user_a_id, user_b_id)

    # Check if conversation already exists
    existing = db.query(models.Conversation).filter(
        models.Conversation.user_a_id == u_min,
        models.Conversation.user_b_id == u_max
    ).first()
    if existing:
        return existing, False

    # Atomically create conversation
    try:
        new_conv = models.Conversation(
            user_a_id=u_min,
            user_b_id=u_max,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        db.add(new_conv)
        db.commit()
        db.refresh(new_conv)
        return new_conv, True
    except Exception:
        db.rollback()
        existing = db.query(models.Conversation).filter(
            models.Conversation.user_a_id == u_min,
            models.Conversation.user_b_id == u_max
        ).first()
        if existing:
            return existing, False
        raise HTTPException(status_code=500, detail="Failed to initialize conversation")


# ─── POST /api/conversations/private ─────────────────────────────────────────
@router.post("/private", response_model=schemas.ConversationResponse, status_code=status.HTTP_200_OK)
async def create_or_get_private_conversation(
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

    # If trying to start a conversation with self — redirect to self-chat
    if target_user.id == current_user.id:
        conv, is_new = get_or_create_private_conversation(current_user.id, current_user.id, db)
        last_msg = db.query(models.Message).filter(
            models.Message.conversation_id == conv.id
        ).order_by(desc(models.Message.created_at)).first()
        last_msg_dict = None
        if last_msg:
            last_msg_dict = {
                "id": last_msg.id,
                "content": last_msg.content,
                "message_type": last_msg.message_type or "text",
                "sender_id": last_msg.sender_id,
                "created_at": schemas.format_iso_utc(last_msg.created_at),
                "status": last_msg.status
            }
        return schemas.ConversationResponse(
            id=conv.id,
            conversation_id=conv.id,
            user_a_id=conv.user_a_id,
            user_b_id=conv.user_b_id,
            partner=schemas.UserResponse.from_orm(current_user),
            other_user=schemas.UserResponse.from_orm(current_user),
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            last_message=last_msg_dict,
            unread_count=0,
            is_new=is_new
        )

    # Get or create normalized private conversation
    conv, is_new = get_or_create_private_conversation(current_user.id, target_user.id, db)

    # Real-time WebSocket notification if target_user is online
    try:
        from websocket.chat import manager
        # Notify User B (recipient / target_user)
        await manager.send_to_user(target_user.id, {
            "type": "conversation_created",
            "conversation": {
                "id": current_user.id,
                "conv_id": conv.id,
                "type": "direct",
                "name": current_user.full_name,
                "username": current_user.username,
                "frank_id": current_user.frank_id,
                "avatar_url": current_user.avatar_url,
                "is_online": True,
                "last_seen": None,
                "last_message": None,
                "unread_count": 0
            },
            "notification": {
                "title": "New Connection",
                "body": f"{current_user.full_name} connected with you on FRANK."
            }
        })
        # Also notify sender's other sessions/tabs if active
        await manager.send_to_user(current_user.id, {
            "type": "conversation_created",
            "conversation": {
                "id": target_user.id,
                "conv_id": conv.id,
                "type": "direct",
                "name": target_user.full_name,
                "username": target_user.username,
                "frank_id": target_user.frank_id,
                "avatar_url": target_user.avatar_url,
                "is_online": target_user.is_online,
                "last_seen": schemas.format_iso_utc(target_user.last_seen) if target_user.last_seen else None,
                "last_message": None,
                "unread_count": 0
            }
        })
    except Exception:
        pass

    last_msg = db.query(models.Message).filter(
        models.Message.conversation_id == conv.id
    ).order_by(desc(models.Message.created_at)).first()

    last_msg_dict = None
    if last_msg:
        last_msg_dict = {
            "id": last_msg.id,
            "content": last_msg.content,
            "message_type": last_msg.message_type or "text",
            "sender_id": last_msg.sender_id,
            "created_at": schemas.format_iso_utc(last_msg.created_at),
            "status": last_msg.status
        }

    return schemas.ConversationResponse(
        id=conv.id,
        conversation_id=conv.id,
        user_a_id=conv.user_a_id,
        user_b_id=conv.user_b_id,
        partner=schemas.UserResponse.from_orm(target_user),
        other_user=schemas.UserResponse.from_orm(target_user),
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        last_message=last_msg_dict,
        unread_count=0,
        is_new=is_new
    )


# ─── GET /api/conversations ───────────────────────────────────────────────────
@router.get("", response_model=List[dict])
def list_conversations(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns unified list of direct, group, and self conversations for the authenticated user.
    Self-chat is always included and pinned at the top.
    """
    conversations = {}

    # 0. Self-chat — include if it already exists in DB
    self_conv = db.query(models.Conversation).filter(
        models.Conversation.user_a_id == current_user.id,
        models.Conversation.user_b_id == current_user.id
    ).first()

    if self_conv:
        last_self_msg = db.query(models.Message).filter(
            models.Message.conversation_id == self_conv.id
        ).order_by(desc(models.Message.created_at)).first()

        conversations["self"] = {
            "id": current_user.id,
            "conv_id": self_conv.id,
            "type": "self",
            "name": "My Notes",
            "username": current_user.username,
            "full_name": current_user.full_name,
            "frank_id": current_user.frank_id,
            "avatar_url": current_user.avatar_url,
            "is_online": True,
            "last_seen": None,
            "last_message": {
                "id": last_self_msg.id,
                "content": last_self_msg.content,
                "message_type": last_self_msg.message_type or "text",
                "sender_id": last_self_msg.sender_id,
                "created_at": schemas.format_iso_utc(last_self_msg.created_at),
                "status": last_self_msg.status
            } if last_self_msg else None,
            "unread_count": 0,
            "_sort_key": schemas.format_iso_utc(last_self_msg.created_at) if last_self_msg else schemas.format_iso_utc(self_conv.created_at)
        }

    # 1. Direct messages involving current user (excluding self-to-self)
    direct_msgs = db.query(models.Message).filter(
        or_(
            models.Message.sender_id == current_user.id,
            models.Message.recipient_id == current_user.id
        ),
        models.Message.group_id.is_(None),
        models.Message.sender_id != models.Message.recipient_id  # Exclude self-messages
    ).order_by(desc(models.Message.created_at)).all()

    for msg in direct_msgs:
        partner_id = msg.recipient_id if msg.sender_id == current_user.id else msg.sender_id
        if partner_id == current_user.id:
            continue  # Skip self-messages in direct list
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

            real_conv_id = msg.conversation_id
            if not real_conv_id:
                u_min = min(current_user.id, partner.id)
                u_max = max(current_user.id, partner.id)
                c_obj = db.query(models.Conversation).filter(
                    models.Conversation.user_a_id == u_min,
                    models.Conversation.user_b_id == u_max
                ).first()
                if c_obj:
                    real_conv_id = c_obj.id

            conversations[conv_key] = {
                "id": partner.id,
                "conv_id": real_conv_id,
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
                "unread_count": unread,
                "_sort_key": schemas.format_iso_utc(msg.created_at)
            }

    # 1.5 Direct conversations explicitly initiated (including those with 0 messages)
    existing_convs = db.query(models.Conversation).filter(
        or_(
            models.Conversation.user_a_id == current_user.id,
            models.Conversation.user_b_id == current_user.id
        ),
        models.Conversation.user_a_id != models.Conversation.user_b_id
    ).all()

    for conv in existing_convs:
        partner_id = conv.user_b_id if conv.user_a_id == current_user.id else conv.user_a_id
        conv_key = f"direct_{partner_id}"
        if conv_key not in conversations:
            partner = db.query(models.User).filter(models.User.id == partner_id).first()
            if not partner:
                continue
            conversations[conv_key] = {
                "id": partner.id,
                "conv_id": conv.id,
                "type": "direct",
                "name": partner.full_name,
                "username": partner.username,
                "frank_id": partner.frank_id,
                "avatar_url": partner.avatar_url,
                "is_online": partner.is_online,
                "last_seen": schemas.format_iso_utc(partner.last_seen) if partner.last_seen else None,
                "last_message": None,
                "unread_count": 0,
                "_sort_key": schemas.format_iso_utc(conv.created_at)
            }

    # 2. Groups where current_user is a member
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
            "unread_count": 0,
            "_sort_key": last_msg_dict["created_at"] if last_msg_dict else "1970-01-01T00:00:00Z"
        }

    # Sort: self always first if present, then by last_message/creation time descending
    conv_list = list(conversations.values())
    conv_list.sort(
        key=lambda c: (
            1 if c["type"] == "self" else 0,
            c.get("_sort_key", "1970-01-01T00:00:00Z")
        ),
        reverse=True
    )
    # Clean up internal sort key
    for c in conv_list:
        c.pop("_sort_key", None)

    return conv_list


# ─── GET /api/conversations/{id} ──────────────────────────────────────────────
@router.get("/{conversation_id}", response_model=schemas.ConversationResponse)
def get_conversation_by_id(
    conversation_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    # Authorization: current user must be a participant
    if current_user.id != conv.user_a_id and current_user.id != conv.user_b_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this conversation.")

    last_msg = db.query(models.Message).filter(
        models.Message.conversation_id == conv.id
    ).order_by(desc(models.Message.created_at)).first()
    last_msg_dict = None
    if last_msg:
        last_msg_dict = {
            "id": last_msg.id,
            "content": last_msg.content,
            "message_type": last_msg.message_type or "text",
            "sender_id": last_msg.sender_id,
            "created_at": schemas.format_iso_utc(last_msg.created_at),
            "status": last_msg.status
        }

    # Self-chat
    if conv.user_a_id == conv.user_b_id:
        return schemas.ConversationResponse(
            id=conv.id,
            conversation_id=conv.id,
            user_a_id=conv.user_a_id,
            user_b_id=conv.user_b_id,
            partner=schemas.UserResponse.from_orm(current_user),
            other_user=schemas.UserResponse.from_orm(current_user),
            created_at=conv.created_at,
            updated_at=conv.updated_at,
            last_message=last_msg_dict,
            unread_count=0,
            is_new=False
        )

    partner_id = conv.user_b_id if current_user.id == conv.user_a_id else conv.user_a_id
    partner = db.query(models.User).filter(models.User.id == partner_id).first()

    return schemas.ConversationResponse(
        id=conv.id,
        conversation_id=conv.id,
        user_a_id=conv.user_a_id,
        user_b_id=conv.user_b_id,
        partner=schemas.UserResponse.from_orm(partner) if partner else None,
        other_user=schemas.UserResponse.from_orm(partner) if partner else None,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        last_message=last_msg_dict,
        unread_count=0,
        is_new=False
    )


# ─── GET /api/conversations/{id}/messages ────────────────────────────────────
@router.get("/{conversation_id}/messages", response_model=List[schemas.MessageResponse])
def get_conversation_messages(
    conversation_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if not conv:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    # Authorization: current user must be a participant
    if current_user.id != conv.user_a_id and current_user.id != conv.user_b_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this conversation.")

    messages = db.query(models.Message).filter(
        models.Message.conversation_id == conv.id
    ).order_by(models.Message.created_at.asc()).limit(200).all()

    return messages
