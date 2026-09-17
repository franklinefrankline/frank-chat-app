from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from database import get_db
import models
import schemas
from security import get_current_user
from websocket.chat import manager

router = APIRouter(prefix="/api/messages", tags=["Messages"])


@router.get("/direct/{partner_id}", response_model=List[schemas.MessageResponse])
def get_direct_messages(
    partner_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify partner exists
    partner = db.query(models.User).filter(models.User.id == partner_id).first()
    if not partner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Fetch messages between current_user and partner
    messages = db.query(models.Message).filter(
        models.Message.group_id.is_(None),
        or_(
            and_(models.Message.sender_id == current_user.id, models.Message.recipient_id == partner_id),
            and_(models.Message.sender_id == partner_id, models.Message.recipient_id == current_user.id)
        )
    ).order_by(models.Message.created_at.asc()).limit(100).all()

    # Automatically mark incoming messages as read
    for msg in messages:
        if msg.recipient_id == current_user.id and msg.status != "read":
            msg.status = "read"
    db.commit()

    return messages


@router.post("", response_model=schemas.MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    msg_in: schemas.MessageCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not msg_in.recipient_id and not msg_in.group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either recipient_id or group_id is required."
        )

    conv_id = None
    if msg_in.recipient_id:
        partner = db.query(models.User).filter(models.User.id == msg_in.recipient_id).first()
        if not partner:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipient not found")
        u_a = min(current_user.id, partner.id)
        u_b = max(current_user.id, partner.id)
        conv = db.query(models.Conversation).filter(
            models.Conversation.user_a_id == u_a,
            models.Conversation.user_b_id == u_b
        ).first()
        if not conv:
            conv = models.Conversation(
                user_a_id=u_a,
                user_b_id=u_b,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
            db.add(conv)
            db.commit()
            db.refresh(conv)
        else:
            conv.updated_at = datetime.now(timezone.utc)
            db.commit()
        conv_id = conv.id

    if msg_in.group_id:
        membership = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == msg_in.group_id,
            models.GroupMember.user_id == current_user.id
        ).first()
        if not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")

    msg = models.Message(
        conversation_id=conv_id,
        sender_id=current_user.id,
        recipient_id=msg_in.recipient_id,
        group_id=msg_in.group_id,
        content=msg_in.content.strip(),
        message_type=msg_in.message_type or "text",
        file_id=msg_in.file_id,
        reply_to_id=msg_in.reply_to_id,
        status="sent",
        created_at=datetime.now(timezone.utc)
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)

    if msg_in.file_id:
        doc = db.query(models.Document).filter(models.Document.id == msg_in.file_id).first()
        if doc:
            doc.message_id = msg.id
            if msg_in.group_id:
                doc.group_id = msg_in.group_id
            elif msg_in.recipient_id:
                doc.conversation_id = msg_in.recipient_id
            db.commit()
            db.refresh(msg)

    # Real-time WebSocket broadcasting
    doc_payload = None
    if msg.document:
        doc_payload = {
            "id": msg.document.id,
            "filename": msg.document.original_filename,
            "file_url": f"/api/files/{msg.document.id}/view",
            "file_size": msg.document.file_size,
            "file_type": msg.document.file_type
        }

    msg_payload = {
        "type": "message",
        "id": msg.id,
        "conversation_id": msg.conversation_id,
        "sender_id": msg.sender_id,
        "recipient_id": msg.recipient_id,
        "group_id": msg.group_id,
        "content": msg.content,
        "message_type": msg.message_type or "text",
        "file_id": msg.file_id,
        "reply_to_id": msg.reply_to_id,
        "status": msg.status,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
        "sender": {
            "id": current_user.id,
            "name": current_user.name,
            "email": current_user.email,
            "avatar_url": current_user.avatar_url,
            "frank_id": current_user.frank_id
        },
        "document": doc_payload,
        "reactions": []
    }

    try:
        await manager.broadcast_message_event(
            msg_payload,
            sender_id=current_user.id,
            recipient_id=msg_in.recipient_id,
            group_id=msg_in.group_id
        )
    except Exception as e:
        print(f"WebSocket broadcast error: {e}")

    return msg


@router.post("/{message_id}/reactions", response_model=schemas.ReactionResponse)
async def toggle_reaction(
    message_id: int,
    reaction_in: schemas.ReactionCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    existing = db.query(models.Reaction).filter(
        models.Reaction.message_id == message_id,
        models.Reaction.user_id == current_user.id,
        models.Reaction.emoji == reaction_in.emoji
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        res = schemas.ReactionResponse(
            id=existing.id,
            message_id=message_id,
            user_id=current_user.id,
            emoji=reaction_in.emoji
        )
        action = "removed"
    else:
        new_r = models.Reaction(
            message_id=message_id,
            user_id=current_user.id,
            emoji=reaction_in.emoji
        )
        db.add(new_r)
        db.commit()
        db.refresh(new_r)
        res = new_r
        action = "added"

    # Broadcast reaction event
    try:
        partner_id = msg.recipient_id if msg.sender_id == current_user.id else msg.sender_id
        await manager.broadcast_message_event(
            {
                "type": "reaction",
                "message_id": message_id,
                "user_id": current_user.id,
                "emoji": reaction_in.emoji,
                "action": action
            },
            sender_id=current_user.id,
            recipient_id=partner_id,
            group_id=msg.group_id
        )
    except Exception as e:
        print(f"WebSocket reaction broadcast error: {e}")

    return res


@router.delete("/{message_id}")
async def delete_message(
    message_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete other users' messages")

    recipient_id = msg.recipient_id
    group_id = msg.group_id

    db.delete(msg)
    db.commit()

    # Broadcast message deletion
    try:
        await manager.broadcast_message_event(
            {
                "type": "message_deleted",
                "message_id": message_id
            },
            sender_id=current_user.id,
            recipient_id=recipient_id,
            group_id=group_id
        )
    except Exception as e:
        print(f"WebSocket delete broadcast error: {e}")

    return {"success": True, "message": "Message deleted"}


@router.put("/{message_id}", response_model=schemas.MessageResponse)
async def edit_message(
    message_id: int,
    update_in: schemas.MessageUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit messages sent by another user")

    msg.content = update_in.content.strip()
    msg.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)

    # Broadcast edit event
    try:
        await manager.broadcast_message_event(
            {
                "type": "message_edited",
                "message_id": msg.id,
                "content": msg.content,
                "updated_at": msg.updated_at.isoformat() if msg.updated_at else None
            },
            sender_id=current_user.id,
            recipient_id=msg.recipient_id,
            group_id=msg.group_id
        )
    except Exception as e:
        print(f"WebSocket edit broadcast error: {e}")

    return msg
