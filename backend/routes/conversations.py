from typing import List, Optional, Any, Dict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import or_, and_, desc

from database import get_db
import models
import schemas
from security import get_current_user
from routes.users import get_conversations as get_users_conversations
from services.translation_service import translation_service

router = APIRouter(prefix="/conversations", tags=["Conversations"])


def mask_message_if_deleted(m: models.Message):
    if getattr(m, "deleted_for_everyone", False):
        m.content = "🚫 This message was deleted"
        m.file_id = None
        m.message_type = "text"
        m.document = None


@router.get("", response_model=List[Dict[str, Any]])
def list_conversations(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns list of conversations for current authenticated user.
    """
    return get_users_conversations(current_user=current_user, db=db)


@router.get("/{conversation_id}")
def get_conversation_details(
    conversation_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fetch details for a specific conversation.
    Enforces authorization: returns 403 if user is not a member.
    """
    # 0. Check if this is self-chat requested by user ID
    if conversation_id == current_user.id:
        conv = db.query(models.Conversation).filter(
            models.Conversation.user_a_id == current_user.id,
            models.Conversation.user_b_id == current_user.id
        ).first()
        if not conv:
            conv = models.Conversation(user_a_id=current_user.id, user_b_id=current_user.id)
            db.add(conv)
            db.commit()
            db.refresh(conv)
        m = db.query(models.ConversationMember).filter(
            models.ConversationMember.conversation_id == conv.id,
            models.ConversationMember.user_id == current_user.id
        ).first()
        if not m:
            db.add(models.ConversationMember(conversation_id=conv.id, user_id=current_user.id))
            db.commit()
        return {
            "id": conv.id,
            "type": "direct",
            "user_a_id": conv.user_a_id,
            "user_b_id": conv.user_b_id,
            "partner_id": current_user.id,
            "partner": schemas.UserResponse.model_validate(current_user),
            "created_at": schemas.format_iso_utc(conv.created_at),
            "updated_at": schemas.format_iso_utc(conv.updated_at)
        }

    # 1. Try finding as a 1-to-1 conversation by primary key
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if conv:
        is_member = (conv.user_a_id == current_user.id or conv.user_b_id == current_user.id)
        if not is_member:
            member_rec = db.query(models.ConversationMember).filter(
                models.ConversationMember.conversation_id == conversation_id,
                models.ConversationMember.user_id == current_user.id
            ).first()
            if member_rec:
                is_member = True

        if is_member:
            partner_id = conv.user_b_id if conv.user_a_id == current_user.id else conv.user_a_id
            partner = db.query(models.User).filter(models.User.id == partner_id).first()
            return {
                "id": conv.id,
                "type": "direct",
                "user_a_id": conv.user_a_id,
                "user_b_id": conv.user_b_id,
                "partner_id": partner_id,
                "partner": (schemas.UserResponse.model_validate(partner) if (partner and partner.id == current_user.id) else (schemas.UserPublicResponse.model_validate(partner) if partner else None)),
                "created_at": schemas.format_iso_utc(conv.created_at),
                "updated_at": schemas.format_iso_utc(conv.updated_at)
            }
        else:
            partner_user = db.query(models.User).filter(models.User.id == conversation_id).first()
            if partner_user:
                ua = min(current_user.id, partner_user.id)
                ub = max(current_user.id, partner_user.id)
                real_conv = db.query(models.Conversation).filter(
                    models.Conversation.user_a_id == ua,
                    models.Conversation.user_b_id == ub
                ).first()
                if real_conv:
                    return {
                        "id": real_conv.id,
                        "type": "direct",
                        "user_a_id": real_conv.user_a_id,
                        "user_b_id": real_conv.user_b_id,
                        "partner_id": partner_user.id,
                        "partner": schemas.UserResponse.model_validate(partner_user) if partner_user.id == current_user.id else schemas.UserPublicResponse.model_validate(partner_user),
                        "created_at": schemas.format_iso_utc(real_conv.created_at),
                        "updated_at": schemas.format_iso_utc(real_conv.updated_at)
                    }
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this conversation."
            )

    # 2. Try finding as a group
    group = db.query(models.Group).filter(models.Group.id == conversation_id).first()
    if group:
        grp_member = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == conversation_id,
            models.GroupMember.user_id == current_user.id
        ).first()
        if not grp_member and group.created_by == current_user.id:
            grp_member = models.GroupMember(
                group_id=conversation_id,
                user_id=current_user.id,
                role="owner",
                joined_at=datetime.now(timezone.utc)
            )
            db.add(grp_member)
            db.commit()
        elif not grp_member and current_user.role == "admin":
            pass
        elif not grp_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this conversation."
            )
        return {
            "id": group.id,
            "type": "group",
            "name": group.name,
            "description": group.description or "",
            "avatar_url": group.avatar_url or "",
            "created_by": group.created_by,
            "created_at": schemas.format_iso_utc(group.created_at)
        }

    # 3. Check if conversation_id was passed as partner_id in a direct chat
    partner = db.query(models.User).filter(models.User.id == conversation_id).first()
    if partner:
        ua = min(current_user.id, partner.id)
        ub = max(current_user.id, partner.id)
        conv = db.query(models.Conversation).filter(
            models.Conversation.user_a_id == ua,
            models.Conversation.user_b_id == ub
        ).first()
        if not conv:
            conv = models.Conversation(user_a_id=ua, user_b_id=ub)
            db.add(conv)
            db.commit()
            db.refresh(conv)

        for uid in set([ua, ub]):
            m = db.query(models.ConversationMember).filter(
                models.ConversationMember.conversation_id == conv.id,
                models.ConversationMember.user_id == uid
            ).first()
            if not m:
                db.add(models.ConversationMember(conversation_id=conv.id, user_id=uid))
        db.commit()

        return {
            "id": conv.id,
            "type": "direct",
            "user_a_id": conv.user_a_id,
            "user_b_id": conv.user_b_id,
            "partner_id": partner.id,
            "partner": schemas.UserResponse.model_validate(partner) if partner.id == current_user.id else schemas.UserPublicResponse.model_validate(partner),
            "created_at": schemas.format_iso_utc(conv.created_at),
            "updated_at": schemas.format_iso_utc(conv.updated_at)
        }

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Conversation not found."
    )


@router.get("/{conversation_id}/messages", response_model=List[schemas.MessageResponse])
async def get_conversation_messages(
    conversation_id: int,
    target_language: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    before_id: Optional[int] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    now_utc = datetime.now(timezone.utc)
    partner_id_to_notify = None

    # Helper function to enrich messages with stars, masking, and read status
    async def enrich_and_return_messages(msgs: List[models.Message]):
        msgs.reverse()
        if partner_id_to_notify:
            for m in msgs:
                if m.recipient_id == current_user.id and m.status != "read":
                    m.status = "read"
                    m.read_at = now_utc
            db.query(models.Message).filter(
                models.Message.sender_id == partner_id_to_notify,
                models.Message.recipient_id == current_user.id,
                models.Message.group_id.is_(None),
                models.Message.status != "read"
            ).update({"status": "read", "read_at": now_utc}, synchronize_session=False)
            db.commit()

            try:
                from websocket.chat import manager
                await manager.send_to_user(partner_id_to_notify, {
                    "type": "messages_read",
                    "partner_id": current_user.id,
                    "reader_id": current_user.id,
                    "read_at": schemas.format_iso_utc(now_utc)
                })
            except Exception:
                pass

        if msgs:
            m_ids = [m.id for m in msgs]
            starred = db.query(models.StarredMessage.message_id).filter(
                models.StarredMessage.user_id == current_user.id,
                models.StarredMessage.message_id.in_(m_ids)
            ).all()
            star_set = {r[0] for r in starred}
            for m in msgs:
                m.is_starred = (m.id in star_set)
                mask_message_if_deleted(m)

        await translation_service.attach_translations_to_messages(msgs, current_user, db, target_language=target_language)
        return msgs

    # Base query options
    base_options = [
        joinedload(models.Message.sender),
        joinedload(models.Message.document),
        selectinload(models.Message.reactions),
        selectinload(models.Message.translations)
    ]

    # 0. Self chat by user id
    if conversation_id == current_user.id:
        q = db.query(models.Message).options(*base_options).filter(
            models.Message.group_id.is_(None),
            models.Message.sender_id == current_user.id,
            models.Message.recipient_id == current_user.id,
            or_(models.Message.deleted_for_sender.is_(False), models.Message.deleted_for_sender.is_(None))
        )
        if before_id:
            q = q.filter(models.Message.id < before_id)
        messages = q.order_by(models.Message.id.desc()).limit(limit).all()
        return await enrich_and_return_messages(messages)

    # 1. Direct conversation by conversation_id
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    if conv:
        is_member = (conv.user_a_id == current_user.id or conv.user_b_id == current_user.id)
        if not is_member:
            m_rec = db.query(models.ConversationMember).filter(
                models.ConversationMember.conversation_id == conversation_id,
                models.ConversationMember.user_id == current_user.id
            ).first()
            if m_rec:
                is_member = True

        if is_member:
            partner_id = conv.user_b_id if conv.user_a_id == current_user.id else conv.user_a_id
            partner_id_to_notify = partner_id
            q = db.query(models.Message).options(*base_options).filter(
                models.Message.group_id.is_(None),
                or_(
                    and_(
                        models.Message.sender_id == current_user.id,
                        models.Message.recipient_id == partner_id,
                        or_(models.Message.deleted_for_sender.is_(False), models.Message.deleted_for_sender.is_(None))
                    ),
                    and_(
                        models.Message.sender_id == partner_id,
                        models.Message.recipient_id == current_user.id,
                        or_(models.Message.deleted_for_recipient.is_(False), models.Message.deleted_for_recipient.is_(None))
                    )
                )
            )
            if before_id:
                q = q.filter(models.Message.id < before_id)
            messages = q.order_by(models.Message.id.desc()).limit(limit).all()
            return await enrich_and_return_messages(messages)

    # 2. Group conversation
    group = db.query(models.Group).filter(models.Group.id == conversation_id).first()
    if group:
        grp_member = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == conversation_id,
            models.GroupMember.user_id == current_user.id
        ).first()
        if not grp_member and group.created_by == current_user.id:
            grp_member = models.GroupMember(
                group_id=conversation_id,
                user_id=current_user.id,
                role="owner",
                joined_at=now_utc
            )
            db.add(grp_member)
            db.commit()
        elif not grp_member and current_user.role == "admin":
            pass
        elif not grp_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this conversation."
            )

        q = db.query(models.Message).options(*base_options).filter(
            models.Message.group_id == conversation_id
        )
        if before_id:
            q = q.filter(models.Message.id < before_id)
        messages = q.order_by(models.Message.id.desc()).limit(limit).all()
        return await enrich_and_return_messages(messages)

    # 3. Direct conversation passed as partner user_id
    partner_user = db.query(models.User).filter(models.User.id == conversation_id).first()
    if partner_user:
        partner_id_to_notify = partner_user.id
        q = db.query(models.Message).options(*base_options).filter(
            models.Message.group_id.is_(None),
            or_(
                and_(
                    models.Message.sender_id == current_user.id,
                    models.Message.recipient_id == partner_user.id,
                    or_(models.Message.deleted_for_sender.is_(False), models.Message.deleted_for_sender.is_(None))
                ),
                and_(
                    models.Message.sender_id == partner_user.id,
                    models.Message.recipient_id == current_user.id,
                    or_(models.Message.deleted_for_recipient.is_(False), models.Message.deleted_for_recipient.is_(None))
                )
            )
        )
        if before_id:
            q = q.filter(models.Message.id < before_id)
        messages = q.order_by(models.Message.id.desc()).limit(limit).all()
        return await enrich_and_return_messages(messages)

    raise HTTPException(status_code=404, detail="Conversation not found")


@router.post("/{conversation_id}/read")
async def mark_conversation_as_read(
    conversation_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    now_utc = datetime.now(timezone.utc)
    # Check if conversation is direct or group
    conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
    partner_id = None
    if conv:
        partner_id = conv.user_b_id if conv.user_a_id == current_user.id else conv.user_a_id
    else:
        partner_user = db.query(models.User).filter(models.User.id == conversation_id).first()
        if partner_user:
            partner_id = partner_user.id

    if partner_id:
        db.query(models.Message).filter(
            models.Message.sender_id == partner_id,
            models.Message.recipient_id == current_user.id,
            models.Message.group_id.is_(None),
            models.Message.status != "read"
        ).update({"status": "read", "read_at": now_utc}, synchronize_session=False)
        db.commit()

        try:
            from websocket.chat import manager
            await manager.send_to_user(partner_id, {
                "type": "messages_read",
                "partner_id": current_user.id,
                "reader_id": current_user.id,
                "read_at": schemas.format_iso_utc(now_utc)
            })
        except Exception:
            pass

    return {"success": True, "read_at": schemas.format_iso_utc(now_utc)}
