from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from database import get_db
import models
import schemas
from security import get_current_user

router = APIRouter(prefix="/groups", tags=["Groups"])


def get_user_role_in_group(group_id: int, user_id: int, db: Session) -> Optional[str]:
    mem = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user_id
    ).first()
    if not mem:
        return None
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if group and group.created_by == user_id:
        return "owner"
    return mem.role


@router.get("", response_model=List[schemas.GroupResponse])
def get_user_groups(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    memberships = db.query(models.GroupMember).filter(models.GroupMember.user_id == current_user.id).all()
    group_ids = [m.group_id for m in memberships]

    if not group_ids:
        return []

    groups = db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()
    result = []
    for g in groups:
        count = db.query(models.GroupMember).filter(models.GroupMember.group_id == g.id).count()

        # Last message
        last_msg = db.query(models.Message).filter(
            models.Message.group_id == g.id
        ).order_by(desc(models.Message.created_at)).first()

        last_msg_dict = None
        if last_msg:
            sender = db.query(models.User).filter(models.User.id == last_msg.sender_id).first()
            last_msg_dict = {
                "id": last_msg.id,
                "content": last_msg.content,
                "message_type": last_msg.message_type,
                "sender_id": last_msg.sender_id,
                "sender_name": sender.full_name if sender else "User",
                "created_at": schemas.format_iso_utc(last_msg.created_at),
                "status": last_msg.status
            }

        g_resp = schemas.GroupResponse(
            id=g.id,
            name=g.name,
            description=g.description,
            avatar_url=g.avatar_url,
            privacy=g.privacy or "private",
            created_by=g.created_by,
            created_at=g.created_at,
            members_count=count,
            last_message=last_msg_dict,
            unread_count=0
        )
        result.append(g_resp)
    return result


@router.get("/{group_id}", response_model=schemas.GroupResponse)
def get_group_details(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")

    membership = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == current_user.id
    ).first()

    # Private groups must not be visible to non-members
    if (group.privacy == "private" or not group.privacy) and not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Private group.")

    count = db.query(models.GroupMember).filter(models.GroupMember.group_id == group.id).count()
    return schemas.GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        avatar_url=group.avatar_url,
        privacy=group.privacy or "private",
        created_by=group.created_by,
        created_at=group.created_at,
        members_count=count
    )


@router.post("", response_model=schemas.GroupResponse, status_code=status.HTTP_201_CREATED)
def create_group(
    group_in: schemas.GroupCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group = models.Group(
        name=group_in.name.strip(),
        description=(group_in.description or "").strip(),
        avatar_url=group_in.avatar_url or "",
        privacy=group_in.privacy or "private",
        created_by=current_user.id,
        created_at=datetime.now(timezone.utc)
    )
    db.add(group)
    db.commit()
    db.refresh(group)

    # Add creator as owner member
    owner_member = models.GroupMember(
        group_id=group.id,
        user_id=current_user.id,
        role="owner",
        joined_at=datetime.now(timezone.utc)
    )
    db.add(owner_member)

    # Add other specified members
    for uid in set(group_in.member_ids):
        if uid != current_user.id:
            user = db.query(models.User).filter(models.User.id == uid).first()
            if user:
                member = models.GroupMember(
                    group_id=group.id,
                    user_id=uid,
                    role="member",
                    joined_at=datetime.now(timezone.utc)
                )
                db.add(member)

    intro_msg = models.Message(
        sender_id=current_user.id,
        group_id=group.id,
        content=f"{current_user.full_name} created the group \"{group.name}\".",
        status="sent",
        created_at=datetime.now(timezone.utc)
    )
    db.add(intro_msg)
    db.commit()

    count = db.query(models.GroupMember).filter(models.GroupMember.group_id == group.id).count()

    # Real-time WebSocket event to admin
    try:
        from websocket.chat import manager
        import asyncio
        asyncio.create_task(manager.broadcast_admin({
            "type": "admin_group_created",
            "group": {
                "id": group.id,
                "name": group.name,
                "privacy": group.privacy,
                "created_by": group.created_by,
                "members_count": count
            }
        }))
        asyncio.create_task(manager.broadcast_admin_metrics(db))
    except Exception:
        pass

    return schemas.GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        avatar_url=group.avatar_url,
        privacy=group.privacy or "private",
        created_by=group.created_by,
        created_at=group.created_at,
        members_count=count
    )


@router.put("/{group_id}", response_model=schemas.GroupResponse)
def update_group(
    group_id: int,
    group_in: schemas.GroupUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")

    actor_role = get_user_role_in_group(group_id, current_user.id, db)
    if actor_role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owners and admins can update group settings.")

    if group_in.name is not None:
        group.name = group_in.name.strip()
    if group_in.description is not None:
        group.description = group_in.description.strip()
    if group_in.avatar_url is not None:
        group.avatar_url = group_in.avatar_url.strip()
    if group_in.privacy is not None:
        group.privacy = group_in.privacy

    db.commit()
    db.refresh(group)

    count = db.query(models.GroupMember).filter(models.GroupMember.group_id == group.id).count()
    return schemas.GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        avatar_url=group.avatar_url,
        privacy=group.privacy or "private",
        created_by=group.created_by,
        created_at=group.created_at,
        members_count=count
    )


@router.delete("/{group_id}")
def delete_group(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")

    if group.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the group owner can delete this group.")

    group_name = group.name
    group_id_val = group.id
    db.delete(group)
    db.commit()

    # Real-time WebSocket broadcast to admin
    try:
        from websocket.chat import manager
        import asyncio
        asyncio.create_task(manager.broadcast_admin({
            "type": "admin_group_deleted",
            "group_id": group_id_val
        }))
        asyncio.create_task(manager.broadcast_admin_metrics(db))
    except Exception:
        pass

    return {"success": True, "message": f"Group '{group_name}' has been deleted."}


@router.get("/{group_id}/messages", response_model=List[schemas.MessageResponse])
def get_group_messages(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    membership = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == current_user.id
    ).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group.")

    messages = db.query(models.Message).filter(
        models.Message.group_id == group_id
    ).order_by(models.Message.created_at.asc()).limit(100).all()

    return messages


@router.get("/{group_id}/members", response_model=List[schemas.GroupMemberResponse])
def get_group_members(
    group_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    membership = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == current_user.id
    ).first()
    if not membership:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group.")

    members = db.query(models.GroupMember).filter(models.GroupMember.group_id == group_id).all()
    return members


@router.post("/{group_id}/members", response_model=List[schemas.GroupMemberResponse])
def add_group_members(
    group_id: int,
    add_in: schemas.GroupMemberAdd,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    actor_role = get_user_role_in_group(group_id, current_user.id, db)
    if actor_role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only owners and admins can add members to this group.")

    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")

    added_names = []
    for uid in add_in.user_ids:
        exists = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == group_id,
            models.GroupMember.user_id == uid
        ).first()
        if not exists:
            user = db.query(models.User).filter(models.User.id == uid).first()
            if user:
                new_mem = models.GroupMember(
                    group_id=group_id,
                    user_id=uid,
                    role="member",
                    joined_at=datetime.now(timezone.utc)
                )
                db.add(new_mem)
                added_names.append(user.full_name)

    if added_names:
        sys_msg = models.Message(
            sender_id=current_user.id,
            group_id=group_id,
            content=f"{current_user.full_name} added {', '.join(added_names)} to the group.",
            status="sent",
            created_at=datetime.now(timezone.utc)
        )
        db.add(sys_msg)

    db.commit()

    return db.query(models.GroupMember).filter(models.GroupMember.group_id == group_id).all()


@router.patch("/{group_id}/members/{user_id}/role", response_model=schemas.GroupMemberResponse)
def update_member_role(
    group_id: int,
    user_id: int,
    role_in: schemas.GroupRoleUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")

    if group.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the group owner can modify member roles.")

    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot alter the role of the group owner.")

    target_membership = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user_id
    ).first()
    if not target_membership:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found in this group.")

    target_membership.role = role_in.role
    db.commit()
    db.refresh(target_membership)
    return target_membership


@router.delete("/{group_id}/members/{user_id}")
def remove_group_member(
    group_id: int,
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    target_membership = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user_id
    ).first()

    if not target_membership:
        raise HTTPException(status_code=404, detail="Member not found in this group")

    # If leaving the group voluntarily
    if current_user.id == user_id:
        if group.created_by == current_user.id:
            # Owner leaving: transfer or delete
            remaining = db.query(models.GroupMember).filter(
                models.GroupMember.group_id == group_id,
                models.GroupMember.user_id != current_user.id
            ).all()
            if remaining:
                new_owner = next((m for m in remaining if m.role == "admin"), remaining[0])
                group.created_by = new_owner.user_id
                new_owner.role = "owner"
            else:
                db.delete(group)
                db.commit()
                return {"success": True, "message": "Group deleted as owner left."}
    else:
        # Removing someone else
        actor_role = get_user_role_in_group(group_id, current_user.id, db)
        if actor_role not in ["owner", "admin"]:
            raise HTTPException(status_code=403, detail="Not authorized to remove members from this group.")

        target_role = get_user_role_in_group(group_id, user_id, db)
        if target_role == "owner":
            raise HTTPException(status_code=403, detail="Cannot remove the group owner.")
        if actor_role == "admin" and target_role == "admin":
            raise HTTPException(status_code=403, detail="Admins cannot remove other admins.")

    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    user_name = target_user.full_name if target_user else "User"

    db.delete(target_membership)

    action_text = f"{user_name} left the group." if user_id == current_user.id else f"{current_user.full_name} removed {user_name} from the group."
    sys_msg = models.Message(
        sender_id=current_user.id,
        group_id=group_id,
        content=action_text,
        status="sent",
        created_at=datetime.now(timezone.utc)
    )
    db.add(sys_msg)
    db.commit()

    return {"success": True, "message": action_text}

