from typing import List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from database import get_db
import models
import schemas
from security import get_current_user

router = APIRouter(prefix="/messages", tags=["Messages"])


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
def send_message(
    msg_in: schemas.MessageCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not msg_in.recipient_id and not msg_in.group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either recipient_id or group_id is required."
        )

    if msg_in.recipient_id:
        partner = db.query(models.User).filter(models.User.id == msg_in.recipient_id).first()
        if not partner:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipient not found")

    if msg_in.group_id:
        membership = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == msg_in.group_id,
            models.GroupMember.user_id == current_user.id
        ).first()
        if not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group")

    msg = models.Message(
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

    return msg


@router.post("/{message_id}/reactions", response_model=schemas.ReactionResponse)
def toggle_reaction(
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
        return schemas.ReactionResponse(
            id=existing.id,
            message_id=message_id,
            user_id=current_user.id,
            emoji=reaction_in.emoji
        )
    else:
        new_r = models.Reaction(
            message_id=message_id,
            user_id=current_user.id,
            emoji=reaction_in.emoji
        )
        db.add(new_r)
        db.commit()
        db.refresh(new_r)
        return new_r


@router.delete("/{message_id}")
def delete_message(
    message_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete other users' messages")

    db.delete(msg)
    db.commit()
    return {"success": True, "message": "Message deleted"}


@router.put("/{message_id}", response_model=schemas.MessageResponse)
def edit_message(
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
    return msg
