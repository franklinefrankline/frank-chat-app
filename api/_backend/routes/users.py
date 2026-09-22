from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc
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
                models.User.full_name.ilike(search_pattern)
            )
        )
    return query.order_by(models.User.full_name).limit(50).all()


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
    if user_update.bio is not None:
        current_user.bio = user_update.bio.strip()
    if user_update.avatar_url is not None:
        current_user.avatar_url = user_update.avatar_url.strip()

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
    unread count, and details.
    """
    conversations = {}

    # Load preferences
    prefs = db.query(models.ConversationPreference).filter(
        models.ConversationPreference.user_id == current_user.id
    ).all()
    pref_map = {f"{p.conversation_type}_{p.conversation_id}": p for p in prefs}

    # 1. Fetch established direct conversations for current user
    stored_convs = db.query(models.Conversation).filter(
        or_(
            models.Conversation.user_a_id == current_user.id,
            models.Conversation.user_b_id == current_user.id
        )
    ).all()

    for sc in stored_convs:
        is_self = (sc.user_a_id == current_user.id and sc.user_b_id == current_user.id)
        partner_id = current_user.id if is_self else (sc.user_b_id if sc.user_a_id == current_user.id else sc.user_a_id)
        partner = db.query(models.User).filter(models.User.id == partner_id).first()
        if not partner:
            continue
        conv_key = f"direct_{partner_id}"
        p = pref_map.get(conv_key)
        conversations[conv_key] = {
            "id": partner.id,
            "type": "direct",
            "name": f"{partner.full_name} (You)" if is_self else partner.full_name,
            "username": partner.username,
            "frank_id": partner.frank_id,
            "bio": "Message yourself • Notes & bookmarks" if is_self else partner.bio,
            "avatar_url": partner.avatar_url,
            "is_online": partner.is_online,
            "last_seen": schemas.format_iso_utc(partner.last_seen) if partner.last_seen else None,
            "last_message": None,
            "unread_count": 0,
            "is_pinned": p.is_pinned if p else False,
            "is_favorite": p.is_favorite if p else False,
            "is_muted": p.is_muted if p else False
        }

    # 2. Fetch direct messages involving current user to populate last_message & unread_count
    messages = db.query(models.Message).filter(
        or_(
            models.Message.sender_id == current_user.id,
            models.Message.recipient_id == current_user.id
        ),
        models.Message.group_id.is_(None)
    ).order_by(desc(models.Message.created_at)).all()

    for msg in messages:
        partner_id = msg.recipient_id if msg.sender_id == current_user.id else msg.sender_id
        is_self = (partner_id == current_user.id and msg.sender_id == current_user.id)
        conv_key = f"direct_{partner_id}"
        partner = db.query(models.User).filter(models.User.id == partner_id).first()
        if not partner:
            continue

        unread = db.query(models.Message).filter(
            models.Message.sender_id == partner_id,
            models.Message.recipient_id == current_user.id,
            models.Message.status != "read"
        ).count()

        p = pref_map.get(conv_key)
        if conv_key not in conversations:
            conversations[conv_key] = {
                "id": partner.id,
                "type": "direct",
                "name": f"{partner.full_name} (You)" if is_self else partner.full_name,
                "username": partner.username,
                "frank_id": partner.frank_id,
                "bio": "Message yourself • Notes & bookmarks" if is_self else partner.bio,
                "avatar_url": partner.avatar_url,
                "is_online": partner.is_online,
                "last_seen": schemas.format_iso_utc(partner.last_seen) if partner.last_seen else None,
                "last_message": None,
                "unread_count": 0,
                "is_pinned": p.is_pinned if p else False,
                "is_favorite": p.is_favorite if p else False,
                "is_muted": p.is_muted if p else False
            }

        if conversations[conv_key]["last_message"] is None:
            conversations[conv_key]["last_message"] = {
                "id": msg.id,
                "content": msg.content,
                "message_type": msg.message_type or "text",
                "sender_id": msg.sender_id,
                "created_at": schemas.format_iso_utc(msg.created_at),
                "status": msg.status
            }
            conversations[conv_key]["unread_count"] = unread

    # 3. Fetch all groups user is a member of
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

        p = pref_map.get(conv_key)
        conversations[conv_key] = {
            "id": group.id,
            "type": "group",
            "name": group.name,
            "description": group.description or "",
            "avatar_url": group.avatar_url or "",
            "members_count": count,
            "created_by": group.created_by,
            "is_online": True,
            "last_seen": None,
            "last_message": last_msg_dict,
            "unread_count": 0,
            "is_pinned": p.is_pinned if p else False,
            "is_favorite": p.is_favorite if p else False,
            "is_muted": p.is_muted if p else False
        }

    # 4. Guarantee self-conversation (Notes to Self) is always present
    self_key = f"direct_{current_user.id}"
    if self_key not in conversations:
        p = pref_map.get(self_key)
        conversations[self_key] = {
            "id": current_user.id,
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
    # Sort: pinned first, then by recent message time descending
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

