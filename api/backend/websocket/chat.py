import json
import logging
from typing import Dict, List, Set
from datetime import datetime, timezone
from fastapi import WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from database import SessionLocal
import models
import schemas
from security import get_user_from_token

logger = logging.getLogger("chatapp.websocket")


class ConnectionManager:
    def __init__(self):
        # Maps user_id -> List[WebSocket]
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        try:
            uid = int(user_id)
        except (ValueError, TypeError):
            return
        await websocket.accept()
        if uid not in self.active_connections:
            self.active_connections[uid] = []
        self.active_connections[uid].append(websocket)

        # Update user status to online in database
        db = SessionLocal()
        try:
            user = db.query(models.User).filter(models.User.id == uid).first()
            if user:
                user.is_online = True
                user.last_seen = datetime.now(timezone.utc)
                db.commit()
        finally:
            db.close()

        # Broadcast presence change to other users
        await self.broadcast({
            "type": "presence",
            "user_id": uid,
            "is_online": True,
            "last_seen": schemas.format_iso_utc(datetime.now(timezone.utc))
        }, exclude_user_id=uid)

    async def disconnect(self, user_id: int, websocket: WebSocket):
        try:
            uid = int(user_id)
        except (ValueError, TypeError):
            return
        if uid in self.active_connections:
            if websocket in self.active_connections[uid]:
                self.active_connections[uid].remove(websocket)
            if not self.active_connections[uid]:
                del self.active_connections[uid]

                # Mark user as offline in database
                db = SessionLocal()
                try:
                    user = db.query(models.User).filter(models.User.id == uid).first()
                    if user:
                        user.is_online = False
                        user.last_seen = datetime.now(timezone.utc)
                        db.commit()
                finally:
                    db.close()

                # Broadcast offline status
                await self.broadcast({
                    "type": "presence",
                    "user_id": uid,
                    "is_online": False,
                    "last_seen": schemas.format_iso_utc(datetime.now(timezone.utc))
                }, exclude_user_id=uid)

    async def send_to_user(self, user_id: int, data: dict):
        try:
            uid = int(user_id) if user_id is not None else None
        except (ValueError, TypeError):
            return
        if uid is not None and uid in self.active_connections:
            message_text = json.dumps(data)
            dead_sockets = []
            for ws in list(self.active_connections[uid]):
                try:
                    await ws.send_text(message_text)
                except Exception:
                    dead_sockets.append(ws)
            for ws in dead_sockets:
                if ws in self.active_connections.get(uid, []):
                    self.active_connections[uid].remove(ws)

    async def broadcast(self, data: dict, exclude_user_id: int = None):
        message_text = json.dumps(data)
        try:
            ex_uid = int(exclude_user_id) if exclude_user_id is not None else None
        except (ValueError, TypeError):
            ex_uid = None
        for uid, sockets in list(self.active_connections.items()):
            if ex_uid is not None and uid == ex_uid:
                continue
            for ws in list(sockets):
                try:
                    await ws.send_text(message_text)
                except Exception:
                    pass

    async def broadcast_to_group(self, group_id: int, data: dict, sender_id: int = None):
        try:
            gid = int(group_id)
        except (ValueError, TypeError):
            return
        db = SessionLocal()
        try:
            members = db.query(models.GroupMember).filter(models.GroupMember.group_id == gid).all()
            member_ids = [m.user_id for m in members]
        finally:
            db.close()

        message_text = json.dumps(data)
        for member_id in member_ids:
            try:
                mid = int(member_id)
            except (ValueError, TypeError):
                continue
            if mid in self.active_connections:
                for ws in list(self.active_connections[mid]):
                    try:
                        await ws.send_text(message_text)
                    except Exception:
                        pass


manager = ConnectionManager()


async def handle_websocket_connection(websocket: WebSocket, token: str):
    db = SessionLocal()
    try:
        user = get_user_from_token(token, db)
    finally:
        db.close()

    if not user:
        await websocket.close(code=1008)
        return

    user_id = user.id
    await manager.connect(user_id, websocket)

    try:
        while True:
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except Exception:
                continue

            event_type = data.get("type")

            try:
                # 1. SEND DIRECT OR GROUP MESSAGE
                if event_type == "message":
                    recipient_raw = data.get("recipient_id")
                    group_raw = data.get("group_id")
                    try:
                        recipient_id = int(recipient_raw) if recipient_raw is not None else None
                    except (ValueError, TypeError):
                        recipient_id = None
                    try:
                        group_id = int(group_raw) if group_raw is not None else None
                    except (ValueError, TypeError):
                        group_id = None

                    content = (data.get("content") or "").strip()
                    message_type = data.get("message_type", "text")
                    file_id = data.get("file_id")
                    reply_to_id = data.get("reply_to_id")

                    if not content and not file_id:
                        continue

                    db_session = SessionLocal()
                    try:
                        if group_id:
                            membership = db_session.query(models.GroupMember).filter(
                                models.GroupMember.group_id == group_id,
                                models.GroupMember.user_id == user_id
                            ).first()
                            if not membership:
                                continue

                        if recipient_id:
                            ua = min(user_id, recipient_id)
                            ub = max(user_id, recipient_id)
                            conv = db_session.query(models.Conversation).filter(
                                models.Conversation.user_a_id == ua,
                                models.Conversation.user_b_id == ub
                            ).first()
                            if not conv:
                                conv = models.Conversation(user_a_id=ua, user_b_id=ub)
                                db_session.add(conv)
                                db_session.commit()

                        msg = models.Message(
                            sender_id=user_id,
                            recipient_id=recipient_id,
                            group_id=group_id,
                            content=content or (f"Shared a file: {data.get('filename', 'document')}" if file_id else ""),
                            message_type=message_type,
                            file_id=file_id,
                            reply_to_id=reply_to_id,
                            status="sent",
                            created_at=datetime.now(timezone.utc)
                        )
                        db_session.add(msg)
                        db_session.commit()
                        db_session.refresh(msg)

                        doc_data = None
                        if file_id:
                            doc = db_session.query(models.Document).filter(models.Document.id == file_id).first()
                            if doc:
                                doc.message_id = msg.id
                                if group_id:
                                    doc.group_id = group_id
                                elif recipient_id:
                                    doc.conversation_id = recipient_id
                                db_session.commit()
                                doc_data = {
                                    "id": doc.id,
                                    "original_filename": doc.original_filename,
                                    "file_size": doc.file_size,
                                    "mime_type": doc.mime_type,
                                    "file_type": doc.file_type,
                                    "duration": doc.duration,
                                    "created_at": schemas.format_iso_utc(doc.created_at)
                                }

                        sender_user = db_session.query(models.User).filter(models.User.id == user_id).first()

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
                                    "id": sender_user.id,
                                    "username": sender_user.username,
                                    "full_name": sender_user.full_name,
                                    "avatar_url": sender_user.avatar_url
                                },
                                "reactions": []
                            }
                        }

                        # Echo to sender
                        await manager.send_to_user(user_id, msg_payload)

                        if group_id:
                            await manager.broadcast_to_group(group_id, msg_payload, sender_id=user_id)
                        elif recipient_id:
                            # Update status to delivered if recipient is online
                            if recipient_id in manager.active_connections:
                                msg.status = "delivered"
                                db_session.commit()
                                msg_payload["message"]["status"] = "delivered"

                            await manager.send_to_user(recipient_id, msg_payload)

                    finally:
                        db_session.close()

                # 2. TYPING INDICATOR
                elif event_type == "typing":
                    recipient_raw = data.get("recipient_id")
                    group_raw = data.get("group_id")
                    try:
                        recipient_id = int(recipient_raw) if recipient_raw is not None else None
                    except (ValueError, TypeError):
                        recipient_id = None
                    try:
                        group_id = int(group_raw) if group_raw is not None else None
                    except (ValueError, TypeError):
                        group_id = None
                    is_typing = bool(data.get("is_typing", True))

                    typing_payload = {
                        "type": "typing",
                        "sender_id": user_id,
                        "recipient_id": recipient_id,
                        "group_id": group_id,
                        "is_typing": is_typing
                    }

                    if group_id:
                        await manager.broadcast_to_group(group_id, typing_payload, sender_id=user_id)
                    elif recipient_id:
                        await manager.send_to_user(recipient_id, typing_payload)

                # 3. EDIT MESSAGE
                elif event_type == "edit_message":
                    try:
                        edit_msg_id = int(data.get("message_id")) if data.get("message_id") else None
                    except (ValueError, TypeError):
                        edit_msg_id = None
                    new_content = (data.get("content") or "").strip()
                    if edit_msg_id and new_content:
                        db_session = SessionLocal()
                        try:
                            edit_msg = db_session.query(models.Message).filter(models.Message.id == edit_msg_id).first()
                            if edit_msg and edit_msg.sender_id == user_id:
                                edit_msg.content = new_content
                                edit_msg.updated_at = datetime.now(timezone.utc)
                                db_session.commit()
                                db_session.refresh(edit_msg)

                                edit_payload = {
                                    "type": "message_edit",
                                    "message": {
                                        "id": edit_msg.id,
                                        "message_id": edit_msg.id,
                                        "sender_id": edit_msg.sender_id,
                                        "recipient_id": edit_msg.recipient_id,
                                        "group_id": edit_msg.group_id,
                                        "content": edit_msg.content,
                                        "created_at": schemas.format_iso_utc(edit_msg.created_at),
                                        "updated_at": schemas.format_iso_utc(edit_msg.updated_at)
                                    }
                                }

                                await manager.send_to_user(user_id, edit_payload)
                                if edit_msg.group_id:
                                    await manager.broadcast_to_group(edit_msg.group_id, edit_payload, sender_id=user_id)
                                elif edit_msg.recipient_id:
                                    await manager.send_to_user(edit_msg.recipient_id, edit_payload)
                        finally:
                            db_session.close()

                # 4. MESSAGE REACTION
                elif event_type == "reaction":
                    try:
                        message_id = int(data.get("message_id")) if data.get("message_id") else None
                    except (ValueError, TypeError):
                        message_id = None
                    emoji = data.get("emoji")

                    if message_id and emoji:
                        db_session = SessionLocal()
                        try:
                            existing = db_session.query(models.Reaction).filter(
                                models.Reaction.message_id == message_id,
                                models.Reaction.user_id == user_id,
                                models.Reaction.emoji == emoji
                            ).first()

                            action = "added"
                            if existing:
                                db_session.delete(existing)
                                action = "removed"
                            else:
                                new_reaction = models.Reaction(
                                    message_id=message_id,
                                    user_id=user_id,
                                    emoji=emoji
                                )
                                db_session.add(new_reaction)
                            db_session.commit()

                            msg = db_session.query(models.Message).filter(models.Message.id == message_id).first()
                            if msg:
                                reaction_payload = {
                                    "type": "reaction",
                                    "message_id": message_id,
                                    "user_id": user_id,
                                    "emoji": emoji,
                                    "action": action
                                }
                                await manager.send_to_user(msg.sender_id, reaction_payload)
                                if msg.recipient_id:
                                    await manager.send_to_user(msg.recipient_id, reaction_payload)
                                elif msg.group_id:
                                    await manager.broadcast_to_group(msg.group_id, reaction_payload)
                        finally:
                            db_session.close()

                # 5. READ RECEIPT
                elif event_type == "read":
                    raw_ids = data.get("message_ids", [])
                    message_ids = []
                    for raw_id in raw_ids:
                        try:
                            message_ids.append(int(raw_id))
                        except (ValueError, TypeError):
                            pass
                    if message_ids:
                        db_session = SessionLocal()
                        try:
                            for mid in message_ids:
                                m = db_session.query(models.Message).filter(models.Message.id == mid).first()
                                if m and m.recipient_id == user_id and m.status != "read":
                                    m.status = "read"
                                    db_session.commit()
                                    await manager.send_to_user(m.sender_id, {
                                        "type": "read",
                                        "message_id": mid,
                                        "reader_id": user_id
                                    })
                        finally:
                            db_session.close()

                # 6. GROUP EVENTS REALTIME BROADCAST
                elif event_type in ("group:update", "member:added", "member:removed"):
                    group_raw = data.get("group_id")
                    try:
                        group_id = int(group_raw) if group_raw is not None else None
                    except (ValueError, TypeError):
                        group_id = None
                    if group_id:
                        await manager.broadcast_to_group(group_id, data, sender_id=user_id)

            except Exception as frame_err:
                logger.exception(f"Error handling WebSocket frame for user {user_id}: {frame_err}")

    except WebSocketDisconnect:
        await manager.disconnect(user_id, websocket)
    except Exception as err:
        logger.error(f"WebSocket error for user {user_id}: {err}")
        await manager.disconnect(user_id, websocket)
