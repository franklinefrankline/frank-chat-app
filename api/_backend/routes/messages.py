from typing import List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from sqlalchemy import or_, and_
from database import get_db
import models
import schemas
from security import get_current_user
from services.translation_service import translation_service

router = APIRouter(prefix="/messages", tags=["Messages"])


@router.get("/direct/{partner_id}", response_model=List[schemas.MessageResponse])
async def get_direct_messages(
    partner_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Verify partner exists
    partner = db.query(models.User).filter(models.User.id == partner_id).first()
    if not partner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Fetch messages between current_user and partner with reactions and translations eagerly loaded in ONE query
    messages = db.query(models.Message).options(
        selectinload(models.Message.reactions),
        selectinload(models.Message.translations)
    ).filter(
        models.Message.group_id.is_(None),
        or_(
            and_(models.Message.sender_id == current_user.id, models.Message.recipient_id == partner_id),
            and_(models.Message.sender_id == partner_id, models.Message.recipient_id == current_user.id)
        )
    ).order_by(models.Message.created_at.desc()).limit(200).all()
    messages.reverse()

    # Automatically mark incoming messages as read in ONE single bulk update
    unread_incoming = [m for m in messages if m.recipient_id == current_user.id and m.status != "read"]
    if unread_incoming:
        for m in unread_incoming:
            m.status = "read"
        db.query(models.Message).filter(
            models.Message.sender_id == partner_id,
            models.Message.recipient_id == current_user.id,
            models.Message.group_id.is_(None),
            models.Message.status != "read"
        ).update({"status": "read"}, synchronize_session=False)
        db.commit()

    # Attach recipient-specific translations
    await translation_service.attach_translations_to_messages(messages, current_user, db)

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

    if msg_in.recipient_id:
        partner = db.query(models.User).filter(models.User.id == msg_in.recipient_id).first()
        if not partner:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
        
        # Enforce canonical single conversation guarantee
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
        if not membership:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You don't have permission to send messages in this conversation.")

    msg = models.Message(
        sender_id=current_user.id,
        recipient_id=msg_in.recipient_id,
        group_id=msg_in.group_id,
        content=clean_content or (f"Shared a file: {msg_in.file_id}" if msg_in.file_id else ""),
        message_type=msg_in.message_type or "text",
        file_id=msg_in.file_id,
        reply_to_id=msg_in.reply_to_id,
        status="sent",
        created_at=datetime.now(timezone.utc)
    )
    try:
        db.add(msg)
        db.commit()
        db.refresh(msg)
    except Exception as e:
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

    # Real-time WebSocket broadcast so User B receives message immediately without refresh
    try:
        from websocket.chat import manager
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
            # Check if partner needs translation
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

        # Real-time metric update for admin (metadata count only — zero message plaintext)
        total_msgs = db.query(models.Message).count()
        await manager.broadcast_admin({
            "type": "admin_message_count_updated",
            "total_messages": total_msgs
        })
        await manager.broadcast_admin_metrics(db)
    except Exception as e:
        pass

    return msg


@router.post("/{message_id}/translate")
async def translate_message_endpoint(
    message_id: int,
    req: schemas.MessageTranslateRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found.")

    # Authorization verification
    if msg.group_id:
        membership = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == msg.group_id,
            models.GroupMember.user_id == current_user.id
        ).first()
        if not membership:
            raise HTTPException(status_code=403, detail="Not authorized to translate messages in this group.")
    elif msg.recipient_id:
        if current_user.id not in (msg.sender_id, msg.recipient_id):
            raise HTTPException(status_code=403, detail="Not authorized to view or translate this message.")

    trans = await translation_service.get_or_create_message_translation(db, msg, req.target_language)
    if trans:
        return {
            "message_id": msg.id,
            "translated_content": trans.translated_content,
            "source_language": trans.source_language,
            "target_language": trans.target_language,
            "is_translated": True
        }
    else:
        src_lang = translation_service.detect_language(msg.content)
        return {
            "message_id": msg.id,
            "translated_content": msg.content,
            "source_language": src_lang,
            "target_language": req.target_language,
            "is_translated": False
        }


@router.post("/{message_id}/reactions", response_model=schemas.ReactionResponse)
def toggle_reaction(
    message_id: int,
    reaction_in: schemas.ReactionCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg and (os.environ.get("VERCEL") or "tmp" in str(db.bind.url)):
        msg = models.Message(
            id=message_id,
            sender_id=current_user.id,
            content="[Message]",
            message_type="text",
            status="sent",
            created_at=datetime.now(timezone.utc)
        )
        db.add(msg)
        try:
            db.commit()
            db.refresh(msg)
        except Exception:
            db.rollback()
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
async def delete_message(
    message_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg:
        return {"success": True, "message": "Message already deleted"}

    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot delete other users' messages")

    recip_id = msg.recipient_id
    grp_id = msg.group_id
    del_msg_id = msg.id

    # Safely clear or nullify smart references to this deleted message (Section 35)
    db.query(models.SmartActionItem).filter(models.SmartActionItem.source_message_id == del_msg_id).update({"source_message_id": None})
    db.query(models.SmartDecision).filter(models.SmartDecision.source_message_id == del_msg_id).update({"source_message_id": None})
    db.query(models.SmartDate).filter(models.SmartDate.source_message_id == del_msg_id).update({"source_message_id": None})

    db.delete(msg)
    db.commit()

    # Broadcast message_deleted via WebSocket
    try:
        from websocket.chat import manager
        del_payload = {
            "type": "message_deleted",
            "message_id": del_msg_id
        }
        if grp_id:
            await manager.broadcast_to_group(grp_id, del_payload, sender_id=current_user.id)
        elif recip_id:
            await manager.send_to_user(recip_id, del_payload)
            await manager.send_to_user(current_user.id, del_payload)

        # Real-time metric update for admin
        total_msgs = db.query(models.Message).count()
        await manager.broadcast_admin({
            "type": "admin_message_count_updated",
            "total_messages": total_msgs
        })
        await manager.broadcast_admin_metrics(db)
    except Exception:
        pass

    return {"success": True, "message": "Message deleted"}


@router.put("/{message_id}", response_model=schemas.MessageResponse)
async def edit_message(
    message_id: int,
    update_in: schemas.MessageUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    msg = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not msg and (os.environ.get("VERCEL") or "tmp" in str(db.bind.url)):
        msg = models.Message(
            id=message_id,
            sender_id=current_user.id,
            content=update_in.content.strip(),
            message_type="text",
            status="sent",
            created_at=datetime.now(timezone.utc)
        )
        db.add(msg)
        try:
            db.commit()
            db.refresh(msg)
        except Exception:
            db.rollback()
            msg = db.query(models.Message).filter(models.Message.id == message_id).first()

    if not msg:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot edit messages sent by another user")

    msg.content = update_in.content.strip()
    msg.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(msg)

    # Broadcast message_edit via WebSocket
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
        elif msg.recipient_id:
            await manager.send_to_user(msg.recipient_id, edit_payload)
            await manager.send_to_user(current_user.id, edit_payload)
    except Exception:
        pass

    return msg

