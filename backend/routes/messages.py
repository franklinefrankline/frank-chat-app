import os
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, selectinload, joinedload
from sqlalchemy import or_, and_, desc
from database import get_db
import models
import schemas
from security import get_current_user
from services.translation_service import translation_service

router = APIRouter(prefix="/messages", tags=["Messages"])


def mask_message_if_deleted(m: models.Message):
    if getattr(m, "deleted_for_everyone", False):
        m.content = "🚫 This message was deleted"
        m.file_id = None
        m.message_type = "text"
        m.document = None


@router.get("/direct/{partner_id}", response_model=List[schemas.MessageResponse])
async def get_direct_messages(
    partner_id: int,
    target_language: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    before_id: Optional[int] = Query(None),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    partner = db.query(models.User).filter(models.User.id == partner_id).first()
    if not partner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    query = db.query(models.Message).options(
        joinedload(models.Message.sender),
        joinedload(models.Message.document),
        selectinload(models.Message.reactions),
        selectinload(models.Message.translations)
    ).filter(
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
        query = query.filter(models.Message.id < before_id)

    messages = query.order_by(models.Message.id.desc()).limit(limit).all()
    messages.reverse()

    # Automatically mark incoming unread messages as read
    unread_incoming = [m for m in messages if m.recipient_id == current_user.id and m.status != "read"]
    now_utc = datetime.now(timezone.utc)
    if unread_incoming:
        for m in unread_incoming:
            m.status = "read"
            m.read_at = now_utc
        db.query(models.Message).filter(
            models.Message.sender_id == partner_id,
            models.Message.recipient_id == current_user.id,
            models.Message.group_id.is_(None),
            models.Message.status != "read"
        ).update({"status": "read", "read_at": now_utc}, synchronize_session=False)
        db.commit()

        # Emit WebSocket messages_read receipt
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

    # Check which messages are starred by current_user
    if messages:
        msg_ids = [m.id for m in messages]
        starred_records = db.query(models.StarredMessage.message_id).filter(
            models.StarredMessage.user_id == current_user.id,
            models.StarredMessage.message_id.in_(msg_ids)
        ).all()
        starred_set = {r[0] for r in starred_records}
        for m in messages:
            m.is_starred = (m.id in starred_set)
            mask_message_if_deleted(m)

    # Attach recipient-specific translations
    await translation_service.attach_translations_to_messages(messages, current_user, db, target_language=target_language)
    return messages


@router.post("", response_model=schemas.MessageResponse, status_code=status.HTTP_201_CREATED)
async def send_message(
    msg_in: schemas.MessageCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    clean_content = (msg_in.content or "").strip()
    if not clean_content and not msg_in.file_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid message."
        )

    if not msg_in.recipient_id and not msg_in.group_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either recipient_id or group_id is required."
        )

    from websocket.chat import manager

    initial_status = "sent"
    now_utc = datetime.now(timezone.utc)
    delivered_time = None

    if msg_in.recipient_id:
        partner = db.query(models.User).filter(models.User.id == msg_in.recipient_id).first()
        if not partner:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
        
        # Determine if recipient is online right now
        if msg_in.recipient_id in manager.active_connections:
            initial_status = "delivered"
            delivered_time = now_utc

        ua = min(current_user.id, msg_in.recipient_id)
        ub = max(current_user.id, msg_in.recipient_id)
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
            m_rec = db.query(models.ConversationMember).filter(
                models.ConversationMember.conversation_id == conv.id,
                models.ConversationMember.user_id == uid
            ).first()
            if not m_rec:
                db.add(models.ConversationMember(conversation_id=conv.id, user_id=uid))
        db.commit()

    if msg_in.group_id:
        group = db.query(models.Group).filter(models.Group.id == msg_in.group_id).first()
        if not group:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
        membership = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == msg_in.group_id,
            models.GroupMember.user_id == current_user.id
        ).first()
        if not membership and group.created_by == current_user.id:
            membership = models.GroupMember(
                group_id=msg_in.group_id,
                user_id=current_user.id,
                role="owner",
                joined_at=now_utc
            )
            db.add(membership)
            db.commit()
        elif not membership and current_user.role == "admin":
            pass
        elif not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have permission to send messages in this conversation.")

    msg = models.Message(
        sender_id=current_user.id,
        recipient_id=msg_in.recipient_id,
        group_id=msg_in.group_id,
        content=clean_content or (f"Shared a file: {msg_in.file_id}" if msg_in.file_id else ""),
        message_type=msg_in.message_type or "text",
        file_id=msg_in.file_id,
        reply_to_id=msg_in.reply_to_id,
        status=initial_status,
        delivered_at=delivered_time,
        created_at=now_utc
    )
    try:
        db.add(msg)
        db.commit()
        db.refresh(msg)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to send the message. Please try again."
        )

    doc_data = None
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
            doc_data = {
                "id": doc.id,
                "original_filename": doc.original_filename,
                "file_size": doc.file_size,
                "mime_type": doc.mime_type,
                "file_type": doc.file_type,
                "duration": doc.duration,
                "created_at": schemas.format_iso_utc(doc.created_at)
            }

    # Broadcast WebSocket
    try:
        msg_payload = {
            "type": "message",
            "message": {
                "id": msg.id,
                "message_id": msg.id,
                "sender_id": msg.sender_id,
                "recipient_id": msg.recipient_id,
                "group_id": msg.group_id,
                "content": msg.content,
                "message_type": msg.message_type,
                "file_id": msg.file_id,
                "document": doc_data,
                "reply_to_id": msg.reply_to_id,
                "status": msg.status,
                "is_forwarded": bool(getattr(msg, "is_forwarded", False)),
                "is_pinned": bool(getattr(msg, "is_pinned", False)),
                "is_starred": False,
                "created_at": schemas.format_iso_utc(msg.created_at),
                "updated_at": schemas.format_iso_utc(msg.updated_at) if msg.updated_at else None,
                "sender": {
                    "id": current_user.id,
                    "username": current_user.username,
                    "full_name": current_user.full_name,
                    "avatar_url": current_user.avatar_url
                },
                "reactions": []
            }
        }
        if msg.group_id:
            await manager.broadcast_to_group(msg.group_id, msg_payload, sender_id=current_user.id, db=db, msg_obj=msg)
        elif msg.recipient_id:
            partner = db.query(models.User).filter(models.User.id == msg.recipient_id).first()
            import copy
            recipient_payload = copy.deepcopy(msg_payload)
            if partner and getattr(partner, "auto_translate", True) and msg.content:
                partner_lang = getattr(partner, "language", "en") or "en"
                src_lang = translation_service.detect_language(msg.content)
                if partner_lang != src_lang:
                    trans_rec = await translation_service.get_or_create_message_translation(db, msg, partner_lang, src_lang)
                    if trans_rec:
                        recipient_payload["message"]["translated_content"] = trans_rec.translated_content
                        recipient_payload["message"]["source_language"] = trans_rec.source_language
                        recipient_payload["message"]["target_language"] = trans_rec.target_language

            await manager.send_to_user(msg.recipient_id, recipient_payload)
            if msg.recipient_id != current_user.id:
                await manager.send_to_user(current_user.id, msg_payload)

        total_msgs = db.query(models.Message).count()
        await manager.broadcast_admin({
            "type": "admin_message_count_updated",
            "total_messages": total_msgs
        })
        await manager.broadcast_admin_metrics(db)
    except Exception:
        pass

    try:
        msg.sender = current_user
        if msg_in.file_id and 'doc' in locals() and doc:
            msg.document = doc
    except Exception:
        pass

    return msg


@router.delete("/{message_id}")
async def delete_message(
    message_id: int,
    delete_type: str = Query("me", regex="^(me|everyone)$"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        return {"success": True, "message": "Message already deleted", "message_id": message_id}

    from websocket.chat import manager

    if delete_type == "everyone":
        # Only sender or group admin/owner can delete for everyone
        is_sender = (msg.sender_id == current_user.id)
        is_admin_or_owner = False
        if msg.group_id:
            membership = db.query(models.GroupMember).filter(
                models.GroupMember.group_id == msg.group_id,
                models.GroupMember.user_id == current_user.id
            ).first()
            if membership and membership.role in ("owner", "admin"):
                is_admin_or_owner = True
        if current_user.role == "admin":
            is_admin_or_owner = True

        if not (is_sender or is_admin_or_owner):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot delete this message for everyone."
            )

        msg.deleted_for_everyone = True
        msg.updated_at = datetime.now(timezone.utc)
        db.commit()

        del_payload = {
            "type": "message_deleted",
            "message_id": msg.id,
            "delete_type": "everyone",
            "sender_id": msg.sender_id
        }
        if msg.group_id:
            await manager.broadcast_to_group(msg.group_id, del_payload, sender_id=current_user.id)
            await manager.send_to_user(current_user.id, del_payload)
        elif msg.recipient_id:
            await manager.send_to_user(msg.recipient_id, del_payload)
            await manager.send_to_user(current_user.id, del_payload)

        return {"success": True, "message": "Message deleted for everyone", "delete_type": "everyone", "message_id": msg.id}

    else:
        # Delete for me only
        if msg.sender_id == current_user.id:
            msg.deleted_for_sender = True
        if msg.recipient_id == current_user.id:
            msg.deleted_for_recipient = True
        db.commit()

        del_payload = {
            "type": "message_deleted",
            "message_id": msg.id,
            "delete_type": "me",
            "user_id": current_user.id
        }
        await manager.send_to_user(current_user.id, del_payload)
        return {"success": True, "message": "Message deleted for you", "delete_type": "me", "message_id": msg.id}


@router.post("/{message_id}/pin")
async def toggle_pin_message(
    message_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    new_pin = not bool(getattr(msg, "is_pinned", False))
    msg.is_pinned = new_pin
    msg.pinned_at = datetime.now(timezone.utc) if new_pin else None
    db.commit()

    from websocket.chat import manager
    pin_payload = {
        "type": "message_pinned",
        "message_id": msg.id,
        "is_pinned": new_pin,
        "pinned_at": schemas.format_iso_utc(msg.pinned_at) if msg.pinned_at else None
    }
    if msg.group_id:
        await manager.broadcast_to_group(msg.group_id, pin_payload)
        await manager.send_to_user(current_user.id, pin_payload)
    elif msg.recipient_id:
        await manager.send_to_user(msg.recipient_id, pin_payload)
        await manager.send_to_user(current_user.id, pin_payload)

    return {"success": True, "message_id": msg.id, "is_pinned": new_pin}


@router.post("/{message_id}/star")
def toggle_star_message(
    message_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")

    star = db.query(models.StarredMessage).filter(
        models.StarredMessage.user_id == current_user.id,
        models.StarredMessage.message_id == message_id
    ).first()

    if star:
        db.delete(star)
        db.commit()
        return {"success": True, "message_id": message_id, "is_starred": False}
    else:
        new_star = models.StarredMessage(user_id=current_user.id, message_id=message_id)
        db.add(new_star)
        db.commit()
        return {"success": True, "message_id": message_id, "is_starred": True}


@router.get("/starred", response_model=List[schemas.MessageResponse])
def get_starred_messages(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    stars = db.query(models.StarredMessage).options(
        joinedload(models.StarredMessage.message).joinedload(models.Message.sender),
        joinedload(models.StarredMessage.message).joinedload(models.Message.document)
    ).filter(
        models.StarredMessage.user_id == current_user.id
    ).order_by(models.StarredMessage.created_at.desc()).all()

    result = []
    for s in stars:
        m = s.message
        if not m:
            continue
        # Filter if deleted for user
        if m.sender_id == current_user.id and getattr(m, "deleted_for_sender", False):
            continue
        if m.recipient_id == current_user.id and getattr(m, "deleted_for_recipient", False):
            continue
        mask_message_if_deleted(m)
        m.is_starred = True
        result.append(m)
    return result


@router.post("/{message_id}/forward", response_model=List[schemas.MessageResponse])
async def forward_message(
    message_id: int,
    req: schemas.MessageForwardRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    source_msg = db.query(models.Message).options(
        joinedload(models.Message.document)
    ).filter(models.Message.id == message_id).first()
    if not source_msg:
        raise HTTPException(status_code=404, detail="Source message not found")

    from websocket.chat import manager
    created_messages = []
    now_utc = datetime.now(timezone.utc)

    # 1. Forward to recipients
    for r_id in req.recipient_ids:
        if r_id == current_user.id:
            continue
        partner = db.query(models.User).filter(models.User.id == r_id).first()
        if not partner:
            continue

        init_status = "delivered" if r_id in manager.active_connections else "sent"
        del_time = now_utc if init_status == "delivered" else None

        fwd_msg = models.Message(
            sender_id=current_user.id,
            recipient_id=r_id,
            content=source_msg.content,
            message_type=source_msg.message_type,
            file_id=source_msg.file_id,
            is_forwarded=True,
            status=init_status,
            delivered_at=del_time,
            created_at=now_utc
        )
        db.add(fwd_msg)
        db.commit()
        db.refresh(fwd_msg)
        fwd_msg.sender = current_user
        fwd_msg.document = source_msg.document
        created_messages.append(fwd_msg)

        # Broadcast
        try:
            payload = {
                "type": "message",
                "message": {
                    "id": fwd_msg.id,
                    "message_id": fwd_msg.id,
                    "sender_id": current_user.id,
                    "recipient_id": r_id,
                    "content": fwd_msg.content,
                    "message_type": fwd_msg.message_type,
                    "file_id": fwd_msg.file_id,
                    "is_forwarded": True,
                    "status": fwd_msg.status,
                    "created_at": schemas.format_iso_utc(fwd_msg.created_at),
                    "sender": {
                        "id": current_user.id,
                        "username": current_user.username,
                        "full_name": current_user.full_name,
                        "avatar_url": current_user.avatar_url
                    }
                }
            }
            await manager.send_to_user(r_id, payload)
            await manager.send_to_user(current_user.id, payload)
        except Exception:
            pass

    # 2. Forward to groups
    for g_id in req.group_ids:
        group = db.query(models.Group).filter(models.Group.id == g_id).first()
        if not group:
            continue
        fwd_msg = models.Message(
            sender_id=current_user.id,
            group_id=g_id,
            content=source_msg.content,
            message_type=source_msg.message_type,
            file_id=source_msg.file_id,
            is_forwarded=True,
            status="sent",
            created_at=now_utc
        )
        db.add(fwd_msg)
        db.commit()
        db.refresh(fwd_msg)
        fwd_msg.sender = current_user
        fwd_msg.document = source_msg.document
        created_messages.append(fwd_msg)

        try:
            payload = {
                "type": "message",
                "message": {
                    "id": fwd_msg.id,
                    "message_id": fwd_msg.id,
                    "sender_id": current_user.id,
                    "group_id": g_id,
                    "content": fwd_msg.content,
                    "message_type": fwd_msg.message_type,
                    "file_id": fwd_msg.file_id,
                    "is_forwarded": True,
                    "status": fwd_msg.status,
                    "created_at": schemas.format_iso_utc(fwd_msg.created_at),
                    "sender": {
                        "id": current_user.id,
                        "username": current_user.username,
                        "full_name": current_user.full_name,
                        "avatar_url": current_user.avatar_url
                    }
                }
            }
            await manager.broadcast_to_group(g_id, payload, sender_id=current_user.id)
            await manager.send_to_user(current_user.id, payload)
        except Exception:
            pass

    return created_messages


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

    try:
        from websocket.chat import manager
        edit_payload = {
            "type": "message_edit",
            "message": {
                "id": msg.id,
                "message_id": msg.id,
                "sender_id": msg.sender_id,
                "recipient_id": msg.recipient_id,
                "group_id": msg.group_id,
                "content": msg.content,
                "created_at": schemas.format_iso_utc(msg.created_at),
                "updated_at": schemas.format_iso_utc(msg.updated_at)
            }
        }
        if msg.group_id:
            await manager.broadcast_to_group(msg.group_id, edit_payload, sender_id=current_user.id)
            await manager.send_to_user(current_user.id, edit_payload)
        elif msg.recipient_id:
            await manager.send_to_user(msg.recipient_id, edit_payload)
            await manager.send_to_user(current_user.id, edit_payload)
    except Exception:
        pass

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
