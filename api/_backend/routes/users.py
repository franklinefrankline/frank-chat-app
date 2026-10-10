from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, func, and_
from database import get_db
import models
import schemas
from security import get_current_user

router = APIRouter(prefix="/users", tags=["Users"])


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
                models.User.full_name.ilike(search_pattern),
                models.User.frank_id.ilike(search_pattern)
            )
        )
    return query.order_by(models.User.full_name).limit(50).all()


@router.get("/me", response_model=schemas.UserResponse)
def get_users_me(current_user: models.User = Depends(get_current_user)):
    return current_user


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
        current_user.name = current_user.full_name
    elif user_update.name is not None:
        current_user.name = user_update.name.strip()
        current_user.full_name = current_user.name
    if user_update.bio is not None:
        current_user.bio = user_update.bio.strip()
    if user_update.avatar_url is not None:
        current_user.avatar_url = user_update.avatar_url.strip()
    if user_update.theme is not None:
        clean_theme = user_update.theme.strip().lower()
        if clean_theme in ["monochrome", "sandstone", "dark", "light"]:
            current_user.theme = "sandstone" if clean_theme in ["sandstone", "light"] else "monochrome"
    if user_update.language is not None:
        clean_lang = user_update.language.strip().lower()
        if clean_lang in ["en", "ta", "hi"]:
            current_user.language = clean_lang
    if user_update.auto_translate is not None:
        current_user.auto_translate = user_update.auto_translate
    if user_update.default_view_translation is not None:
        current_user.default_view_translation = user_update.default_view_translation

    db.commit()
    db.refresh(current_user)
    return current_user


@router.get("/frank/{frank_id}", response_model=schemas.UserPreviewResponse)
def get_user_by_frank_id(
    frank_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    clean_id = frank_id.strip().upper()
    if len(clean_id) != 6 or not clean_id.isalnum():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="FRANK ID must be exactly 6 alphanumeric characters."
        )

    user = db.query(models.User).filter(models.User.frank_id == clean_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="FRANK ID not found"
        )

    return user


@router.post("/conversations/private", response_model=schemas.ConversationResponse)
def get_or_create_private_conversation(
    conv_data: schemas.ConversationCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    target_user = None
    if conv_data.target_user_id:
        target_user = db.query(models.User).filter(models.User.id == conv_data.target_user_id).first()
    elif conv_data.frank_id:
        clean_id = conv_data.frank_id.strip().upper()
        target_user = db.query(models.User).filter(models.User.frank_id == clean_id).first()

    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found.")

    # Canonical order enforces single conversation guarantee (supports self-conversation)
    user_a = min(current_user.id, target_user.id)
    user_b = max(current_user.id, target_user.id)

    conv = db.query(models.Conversation).filter(
        models.Conversation.user_a_id == user_a,
        models.Conversation.user_b_id == user_b
    ).first()

    if not conv:
        conv = models.Conversation(user_a_id=user_a, user_b_id=user_b)
        db.add(conv)
        db.commit()
        db.refresh(conv)

    return schemas.ConversationResponse(
        id=conv.id,
        user_a_id=conv.user_a_id,
        user_b_id=conv.user_b_id,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        other_user=schemas.UserResponse.from_orm(target_user)
    )


@router.get("/conversations/preferences")
def get_conversation_preferences(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    prefs = db.query(models.ConversationPreference).filter(
        models.ConversationPreference.user_id == current_user.id
    ).all()
    pinned = []
    favorites = []
    muted = []
    for p in prefs:
        key = f"{p.conversation_type}_{p.conversation_id}"
        if p.is_pinned:
            pinned.append(key)
        if p.is_favorite:
            favorites.append(key)
        if p.is_muted:
            muted.append(key)
    return {
        "pinned": pinned,
        "favorites": favorites,
        "muted": muted
    }


@router.post("/conversations/preferences")
def update_conversation_preference(
    pref_data: dict,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    conv_type = pref_data.get("conversation_type", "direct")
    conv_id = int(pref_data.get("conversation_id", 0))

    pref = db.query(models.ConversationPreference).filter(
        models.ConversationPreference.user_id == current_user.id,
        models.ConversationPreference.conversation_type == conv_type,
        models.ConversationPreference.conversation_id == conv_id
    ).first()

    if not pref:
        pref = models.ConversationPreference(
            user_id=current_user.id,
            conversation_type=conv_type,
            conversation_id=conv_id
        )
        db.add(pref)

    # Support key/value format (key="favorite", value=True)
    pref_key = pref_data.get("key")
    if pref_key:
        value = bool(pref_data.get("value", True))
        if pref_key in ["favorite", "is_favorite"]:
            pref.is_favorite = value
        elif pref_key in ["pin", "is_pinned"]:
            pref.is_pinned = value
        elif pref_key in ["mute", "is_muted"]:
            pref.is_muted = value

    # Support direct boolean flags (is_favorite=True, is_pinned=True, is_muted=False)
    if "is_favorite" in pref_data:
        pref.is_favorite = bool(pref_data["is_favorite"])
    if "is_pinned" in pref_data:
        pref.is_pinned = bool(pref_data["is_pinned"])
    if "is_muted" in pref_data:
        pref.is_muted = bool(pref_data["is_muted"])

    db.commit()
    return {
        "success": True,
        "is_favorite": pref.is_favorite,
        "is_pinned": pref.is_pinned,
        "is_muted": pref.is_muted
    }


@router.delete("/conversations/direct/{partner_id}")
def delete_direct_conversation(
    partner_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    ua = min(current_user.id, partner_id)
    ub = max(current_user.id, partner_id)
    conv = db.query(models.Conversation).filter(
        models.Conversation.user_a_id == ua,
        models.Conversation.user_b_id == ub
    ).first()
    if conv:
        db.delete(conv)
        db.commit()
    return {"success": True, "message": "Conversation removed"}


@router.get("/conversations")
def get_conversations(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns list of recent direct and group conversations with last message,
    unread count, and details. Highly optimized with batched bulk queries.
    """
    conversations = {}

    # 1. Load preferences in ONE query
    prefs = db.query(models.ConversationPreference).filter(
        models.ConversationPreference.user_id == current_user.id
    ).all()
    pref_map = {f"{p.conversation_type}_{p.conversation_id}": p for p in prefs}

    # 2. Fetch established direct conversations for current user in ONE query
    stored_convs = db.query(models.Conversation).filter(
        or_(
            models.Conversation.user_a_id == current_user.id,
            models.Conversation.user_b_id == current_user.id
        )
    ).all()

    # Collect partner IDs
    partner_ids = set()
    partner_to_conv = {}
    for sc in stored_convs:
        is_self = (sc.user_a_id == current_user.id and sc.user_b_id == current_user.id)
        pid = current_user.id if is_self else (sc.user_b_id if sc.user_a_id == current_user.id else sc.user_a_id)
        partner_ids.add(pid)
        partner_to_conv[pid] = sc

    # 3. Fetch recent direct messages involving current user (up to 300) in ONE query
    recent_msgs = db.query(models.Message).filter(
        or_(
            models.Message.sender_id == current_user.id,
            models.Message.recipient_id == current_user.id
        ),
        models.Message.group_id.is_(None)
    ).order_by(desc(models.Message.created_at)).limit(300).all()

    # Extract last message per partner and collect additional partner IDs
    last_msg_map = {}
    for msg in recent_msgs:
        pid = msg.recipient_id if msg.sender_id == current_user.id else msg.sender_id
        partner_ids.add(pid)
        if pid not in last_msg_map:
            last_msg_map[pid] = {
                "id": msg.id,
                "content": msg.content,
                "message_type": msg.message_type or "text",
                "sender_id": msg.sender_id,
                "created_at": schemas.format_iso_utc(msg.created_at),
                "status": msg.status
            }

    # 4. Fetch all relevant partner user rows in ONE query
    partner_ids.add(current_user.id)
    partners = db.query(models.User).filter(models.User.id.in_(list(partner_ids))).all()
    user_map = {u.id: u for u in partners}

    # 5. Fetch unread counts per sender in ONE GROUP BY query
    unread_raw = db.query(
        models.Message.sender_id,
        func.count(models.Message.id)
    ).filter(
        models.Message.recipient_id == current_user.id,
        models.Message.group_id.is_(None),
        models.Message.status != "read"
    ).group_by(models.Message.sender_id).all()
    unread_map = {r[0]: r[1] for r in unread_raw}

    # Build direct conversation objects
    for pid in partner_ids:
        partner = user_map.get(pid)
        if not partner:
            continue
        is_self = (pid == current_user.id)
        conv_key = f"direct_{pid}"
        p = pref_map.get(conv_key)
        sc = partner_to_conv.get(pid)
        conv_id = sc.id if sc else pid

        conversations[conv_key] = {
            "id": partner.id,
            "conversation_id": conv_id,
            "partner_id": partner.id,
            "type": "direct",
            "name": f"{partner.full_name} (You)" if is_self else partner.full_name,
            "username": partner.username,
            "frank_id": partner.frank_id,
            "bio": "Message yourself • Notes & bookmarks" if is_self else partner.bio,
            "avatar_url": partner.avatar_url,
            "is_online": partner.is_online,
            "last_seen": schemas.format_iso_utc(partner.last_seen) if partner.last_seen else None,
            "last_message": last_msg_map.get(pid),
            "unread_count": unread_map.get(pid, 0),
            "is_pinned": p.is_pinned if p else False,
            "is_favorite": p.is_favorite if p else False,
            "is_muted": p.is_muted if p else False
        }

    # 6. Fetch all groups current user is a member of in ONE query
    memberships = db.query(models.GroupMember).filter(models.GroupMember.user_id == current_user.id).all()
    group_ids = [m.group_id for m in memberships]

    if group_ids:
        # Load group records in ONE query
        groups = db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()

        # Load member counts in ONE query
        counts_raw = db.query(
            models.GroupMember.group_id,
            func.count(models.GroupMember.id)
        ).filter(models.GroupMember.group_id.in_(group_ids)).group_by(models.GroupMember.group_id).all()
        counts_map = {r[0]: r[1] for r in counts_raw}

        # Load recent group messages in ONE query
        grp_msgs = db.query(models.Message).filter(
            models.Message.group_id.in_(group_ids)
        ).order_by(desc(models.Message.created_at)).limit(200).all()

        grp_last_msg = {}
        grp_sender_ids = set()
        for gm in grp_msgs:
            if gm.group_id not in grp_last_msg:
                grp_last_msg[gm.group_id] = gm
                grp_sender_ids.add(gm.sender_id)

        # Pre-fetch group message senders in ONE query
        grp_senders = db.query(models.User).filter(models.User.id.in_(list(grp_sender_ids))).all() if grp_sender_ids else []
        grp_sender_map = {u.id: u for u in grp_senders}

        for group in groups:
            conv_key = f"group_{group.id}"
            p = pref_map.get(conv_key)
            last_msg = grp_last_msg.get(group.id)
            last_msg_dict = None
            if last_msg:
                snd = grp_sender_map.get(last_msg.sender_id)
                last_msg_dict = {
                    "id": last_msg.id,
                    "content": last_msg.content,
                    "message_type": last_msg.message_type or "text",
                    "sender_id": last_msg.sender_id,
                    "sender_name": snd.full_name if snd else "User",
                    "created_at": schemas.format_iso_utc(last_msg.created_at),
                    "status": last_msg.status
                }

            conversations[conv_key] = {
                "id": group.id,
                "conversation_id": group.id,
                "type": "group",
                "name": group.name,
                "description": group.description or "",
                "avatar_url": group.avatar_url or "",
                "members_count": counts_map.get(group.id, 1),
                "created_by": group.created_by,
                "is_online": True,
                "last_seen": None,
                "last_message": last_msg_dict,
                "unread_count": 0,
                "is_pinned": p.is_pinned if p else False,
                "is_favorite": p.is_favorite if p else False,
                "is_muted": p.is_muted if p else False
            }

    # 7. Guarantee self-conversation (Notes to Self) is always present
    self_key = f"direct_{current_user.id}"
    if self_key not in conversations:
        p = pref_map.get(self_key)
        sc = partner_to_conv.get(current_user.id)
        conv_id = sc.id if sc else current_user.id
        conversations[self_key] = {
            "id": current_user.id,
            "conversation_id": conv_id,
            "partner_id": current_user.id,
            "type": "direct",
            "name": f"{current_user.full_name} (You)",
            "username": current_user.username,
            "frank_id": current_user.frank_id,
            "bio": "Message yourself • Notes & bookmarks",
            "avatar_url": current_user.avatar_url,
            "is_online": True,
            "last_seen": None,
            "last_message": None,
            "unread_count": 0,
            "is_pinned": p.is_pinned if p else False,
            "is_favorite": p.is_favorite if p else False,
            "is_muted": p.is_muted if p else False
        }

    conv_list = list(conversations.values())
    conv_list.sort(
        key=lambda c: (
            1 if c.get("is_pinned") else 0,
            c["last_message"]["created_at"] if c.get("last_message") else "1970-01-01T00:00:00"
        ),
        reverse=True
    )
    return conv_list


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


async def _perform_user_deletion(target_user: models.User, db: Session):
    target_id = target_user.id
    target_username = target_user.username

    # 1. Disconnect active WebSockets
    try:
        from websocket.chat import manager
        await manager.disconnect_user(target_id)
    except Exception:
        pass

    # 2. Clean up uploaded files and documents
    import os
    from pathlib import Path
    upload_dir = Path(__file__).resolve().parent.parent / "uploads"
    docs = db.query(models.Document).filter(models.Document.uploader_id == target_id).all()
    for doc in docs:
        if doc.stored_filename:
            file_path = upload_dir / doc.stored_filename
            if file_path.exists():
                try:
                    os.remove(file_path)
                except Exception:
                    pass
        db.delete(doc)

    # 3. Delete reactions
    db.query(models.Reaction).filter(models.Reaction.user_id == target_id).delete(synchronize_session=False)

    # 4. Delete messages
    db.query(models.Message).filter(
        or_(models.Message.sender_id == target_id, models.Message.recipient_id == target_id)
    ).delete(synchronize_session=False)

    # 5. Delete group memberships
    db.query(models.GroupMember).filter(models.GroupMember.user_id == target_id).delete(synchronize_session=False)

    # 6. Reassign groups created by user
    admin_fallback = db.query(models.User).filter(models.User.role == "admin").first()
    new_owner_id = admin_fallback.id if admin_fallback else None
    if new_owner_id:
        db.query(models.Group).filter(models.Group.created_by == target_id).update(
            {"created_by": new_owner_id}, synchronize_session=False
        )

    # 7. Delete conversation preferences & conversations
    db.query(models.ConversationPreference).filter(models.ConversationPreference.user_id == target_id).delete(synchronize_session=False)
    db.query(models.Conversation).filter(
        or_(models.Conversation.user_a_id == target_id, models.Conversation.user_b_id == target_id)
    ).delete(synchronize_session=False)

    # 8. Reassign audit logs if target was admin
    if new_owner_id and target_id != new_owner_id:
        db.query(models.AuditLog).filter(models.AuditLog.admin_id == target_id).update(
            {"admin_id": new_owner_id}, synchronize_session=False
        )

    # 9. Delete user record from database
    db.delete(target_user)
    db.commit()

    return {"success": True, "message": f"Account @{target_username} has been permanently deleted."}


@router.delete("/me")
async def delete_own_account(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Self-account deletion for the authenticated user."""
    return await _perform_user_deletion(current_user, db)


@router.delete("/{user_id}")
async def delete_user_by_id(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Delete user by ID.
    NEVER allows an unauthorized normal user to delete another user's account.
    """
    if user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete another user's account."
        )

    target_user = current_user
    if user_id != current_user.id and current_user.role == "admin":
        target_user = db.query(models.User).filter(models.User.id == user_id).first()
        if not target_user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    return await _perform_user_deletion(target_user, db)

