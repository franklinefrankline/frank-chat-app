from typing import List, Optional, Any, Dict
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc

from database import get_db
import models
import schemas
from security import get_current_user
from routes.users import get_conversations as get_users_conversations
from services.translation_service import translation_service

router = APIRouter(prefix="/conversations", tags=["Conversations"])


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
                "partner": schemas.UserResponse.model_validate(partner) if partner else None,
                "created_at": schemas.format_iso_utc(conv.created_at),
                "updated_at": schemas.format_iso_utc(conv.updated_at)
            }
        else:
            # If current_user is NOT a member of conv, check if conversation_id was actually passed as partner_id
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
                        "partner": schemas.UserResponse.model_validate(partner_user),
                        "created_at": schemas.format_iso_utc(real_conv.created_at),
                        "updated_at": schemas.format_iso_utc(real_conv.updated_at)
                    }
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this conversation."
            )

    # 2. Try finding as a group conversation
    group = db.query(models.Group).filter(models.Group.id == conversation_id).first()
    if group:
        grp_member = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == conversation_id,
            models.GroupMember.user_id == current_user.id
        ).first()
        if not grp_member:
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
            "partner": schemas.UserResponse.model_validate(partner),
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
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Fetch messages for a specific conversation.
    Enforces authorization:
    - 404 if conversation does not exist.
    - 403 if authenticated user is not a participant/member.
    - 200 with chronological messages if valid member.
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
        messages = db.query(models.Message).filter(
            models.Message.group_id.is_(None),
            models.Message.sender_id == current_user.id,
            models.Message.recipient_id == current_user.id
        ).order_by(models.Message.created_at.desc()).limit(200).all()
        messages.reverse()
        await translation_service.attach_translations_to_messages(messages, current_user, db)
        return messages

    # 1. Try finding as direct conversation by conversation.id
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
            if conv.user_a_id == conv.user_b_id:
                messages = db.query(models.Message).filter(
                    models.Message.group_id.is_(None),
                    models.Message.sender_id == conv.user_a_id,
                    models.Message.recipient_id == conv.user_b_id
                ).order_by(models.Message.created_at.desc()).limit(200).all()
            else:
                messages = db.query(models.Message).filter(
                    models.Message.group_id.is_(None),
                    or_(
                        and_(models.Message.sender_id == conv.user_a_id, models.Message.recipient_id == conv.user_b_id),
                        and_(models.Message.sender_id == conv.user_b_id, models.Message.recipient_id == conv.user_a_id)
                    )
                ).order_by(models.Message.created_at.desc()).limit(200).all()

            messages.reverse()

            for msg in messages:
                if msg.recipient_id == current_user.id and msg.status != "read":
                    msg.status = "read"
            db.commit()

            await translation_service.attach_translations_to_messages(messages, current_user, db)
            return messages
        else:
            # Check if conversation_id was actually passed as partner_id
            partner_user = db.query(models.User).filter(models.User.id == conversation_id).first()
            if partner_user:
                ua = min(current_user.id, partner_user.id)
                ub = max(current_user.id, partner_user.id)
                real_conv = db.query(models.Conversation).filter(
                    models.Conversation.user_a_id == ua,
                    models.Conversation.user_b_id == ub
                ).first()
                if real_conv:
                    messages = db.query(models.Message).filter(
                        models.Message.group_id.is_(None),
                        or_(
                            and_(models.Message.sender_id == current_user.id, models.Message.recipient_id == partner_user.id),
                            and_(models.Message.sender_id == partner_user.id, models.Message.recipient_id == current_user.id)
                        )
                    ).order_by(models.Message.created_at.desc()).limit(200).all()
                    messages.reverse()
                    for msg in messages:
                        if msg.recipient_id == current_user.id and msg.status != "read":
                            msg.status = "read"
                    db.commit()
                    await translation_service.attach_translations_to_messages(messages, current_user, db)
                    return messages
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this conversation."
            )

    # 2. Try finding as group conversation
    group = db.query(models.Group).filter(models.Group.id == conversation_id).first()
    if group:
        grp_member = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == conversation_id,
            models.GroupMember.user_id == current_user.id
        ).first()
        if not grp_member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this conversation."
            )
        messages = db.query(models.Message).filter(
            models.Message.group_id == conversation_id
        ).order_by(models.Message.created_at.desc()).limit(200).all()
        messages.reverse()
        await translation_service.attach_translations_to_messages(messages, current_user, db)
        return messages

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

        messages = db.query(models.Message).filter(
            models.Message.group_id.is_(None),
            or_(
                and_(models.Message.sender_id == current_user.id, models.Message.recipient_id == partner.id),
                and_(models.Message.sender_id == partner.id, models.Message.recipient_id == current_user.id)
            )
        ).order_by(models.Message.created_at.desc()).limit(200).all()
        messages.reverse()

        for msg in messages:
            if msg.recipient_id == current_user.id and msg.status != "read":
                msg.status = "read"
        db.commit()

        await translation_service.attach_translations_to_messages(messages, current_user, db)
        return messages

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Conversation not found."
    )
