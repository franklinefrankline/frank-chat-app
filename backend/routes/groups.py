from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from database import get_db
import models
import schemas
from security import get_current_user

router = APIRouter(prefix="/api/groups", tags=["Groups"])

ROLE_RANKS = {
    "owner": 3,
    "admin": 2,
    "member": 1
}


def get_member_role(group_id: int, user_id: int, db: Session) -> Optional[str]:
    mem = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user_id
    ).first()
    return mem.role if mem else None


@router.get("", response_model=List[schemas.GroupResponse])
def get_user_groups(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    memberships = db.query(models.GroupMember).filter(models.GroupMember.user_id == current_user.id).all()
    group_ids = [m.group_id for m in memberships]
    roles_map = {m.group_id: m.role for m in memberships}

    if not group_ids:
        return []

    groups = db.query(models.Group).filter(models.Group.id.in_(group_ids)).all()
    result = []
    for g in groups:
        count = db.query(models.GroupMember).filter(models.GroupMember.group_id == g.id).count()
        
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
            is_private=getattr(g, "is_private", True),
            created_by=g.created_by,
            created_at=g.created_at,
            members_count=count,
            current_user_role=roles_map.get(g.id, "member"),
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

    is_private = getattr(group, "is_private", True)
    if is_private and not membership:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You don't have permission to access this private group."
        )

    count = db.query(models.GroupMember).filter(models.GroupMember.group_id == group.id).count()
    return schemas.GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        avatar_url=group.avatar_url,
        is_private=is_private,
        created_by=group.created_by,
        created_at=group.created_at,
        members_count=count,
        current_user_role=membership.role if membership else None
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
        is_private=group_in.is_private if group_in.is_private is not None else True,
        created_by=current_user.id,
        created_at=datetime.now(timezone.utc)
    )
    db.add(group)
    db.commit()
    db.refresh(group)

    # Add creator automatically as OWNER
    owner_member = models.GroupMember(
        group_id=group.id,
        user_id=current_user.id,
        role="owner",
        joined_at=datetime.now(timezone.utc)
    )
    db.add(owner_member)

    # Add other specified initial members
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
    return schemas.GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        avatar_url=group.avatar_url,
        is_private=group.is_private,
        created_by=group.created_by,
        created_at=group.created_at,
        members_count=count,
        current_user_role="owner"
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

    caller_role = get_member_role(group_id, current_user.id, db)
    if not caller_role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group.")

    # Only OWNER or ADMIN can edit group information
    if caller_role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only group Owner or Admins can edit group information.")

    if group_in.name is not None:
        group.name = group_in.name.strip()
    if group_in.description is not None:
        group.description = group_in.description.strip()
    if group_in.avatar_url is not None:
        group.avatar_url = group_in.avatar_url.strip()
    if group_in.is_private is not None:
        # Only OWNER can toggle group privacy
        if caller_role != "owner":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only group Owner can change group privacy.")
        group.is_private = group_in.is_private

    db.commit()
    db.refresh(group)

    count = db.query(models.GroupMember).filter(models.GroupMember.group_id == group.id).count()
    return schemas.GroupResponse(
        id=group.id,
        name=group.name,
        description=group.description,
        avatar_url=group.avatar_url,
        is_private=group.is_private,
        created_by=group.created_by,
        created_at=group.created_at,
        members_count=count,
        current_user_role=caller_role
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

    caller_role = get_member_role(group_id, current_user.id, db)
    if caller_role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the group Owner can delete this group.")

    db.delete(group)
    db.commit()
    return {"success": True, "message": f"Group '{group.name}' has been deleted."}


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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not a member of this group."
        )

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
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")

    membership = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == current_user.id
    ).first()
    if not membership and getattr(group, "is_private", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view members of this private group.")

    members = db.query(models.GroupMember).filter(models.GroupMember.group_id == group_id).all()
    return members


@router.post("/{group_id}/members", response_model=List[schemas.GroupMemberResponse])
def add_group_members(
    group_id: int,
    add_in: schemas.GroupMemberAdd,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found.")

    caller_role = get_member_role(group_id, current_user.id, db)
    if not caller_role:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this group.")

    # Only OWNER and ADMIN can add members
    if caller_role not in ["owner", "admin"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only group Owner and Admins can add members.")

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

    caller_role = get_member_role(group_id, current_user.id, db)
    if not caller_role:
        raise HTTPException(status_code=403, detail="Not a member of this group.")

    target_membership = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user_id
    ).first()

    if not target_membership:
        raise HTTPException(status_code=404, detail="Member not found in this group.")

    target_role = target_membership.role

    # Case 1: Leaving group voluntarily
    if user_id == current_user.id:
        if caller_role == "owner":
            # Check if other members exist
            other_members = db.query(models.GroupMember).filter(
                models.GroupMember.group_id == group_id,
                models.GroupMember.user_id != current_user.id
            ).count()
            if other_members > 0:
                raise HTTPException(
                    status_code=400,
                    detail="Owner cannot leave without transferring ownership first. Assign a new Owner or delete the group."
                )
            else:
                db.delete(target_membership)
                db.delete(group)
                db.commit()
                return {"success": True, "message": "Owner left and group was deleted."}

        action_text = f"{current_user.full_name} left the group."
    else:
        # Case 2: Removing someone else
        if caller_role == "member":
            raise HTTPException(status_code=403, detail="Normal members cannot remove other members.")

        if target_role == "owner":
            raise HTTPException(status_code=403, detail="The group Owner cannot be removed.")

        if caller_role == "admin" and target_role == "admin":
            raise HTTPException(status_code=403, detail="Admins cannot remove other Admins.")

        target_user = db.query(models.User).filter(models.User.id == user_id).first()
        target_name = target_user.full_name if target_user else "User"
        action_text = f"{current_user.full_name} removed {target_name} from the group."

    db.delete(target_membership)

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


@router.patch("/{group_id}/members/{user_id}/role", response_model=schemas.GroupMemberResponse)
def update_group_member_role(
    group_id: int,
    user_id: int,
    role_in: schemas.GroupMemberRoleUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    group = db.query(models.Group).filter(models.Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found.")

    caller_role = get_member_role(group_id, current_user.id, db)
    if caller_role != "owner":
        raise HTTPException(status_code=403, detail="Only the group Owner can change member roles.")

    target_membership = db.query(models.GroupMember).filter(
        models.GroupMember.group_id == group_id,
        models.GroupMember.user_id == user_id
    ).first()

    if not target_membership:
        raise HTTPException(status_code=404, detail="Target member not found in this group.")

    if target_membership.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Owner cannot change their own role.")

    new_role = role_in.role.lower()
    if new_role not in ["admin", "member"]:
        raise HTTPException(status_code=400, detail="Invalid role. Must be 'admin' or 'member'.")

    target_membership.role = new_role
    db.commit()
    db.refresh(target_membership)

    target_user = db.query(models.User).filter(models.User.id == user_id).first()
    target_name = target_user.full_name if target_user else "User"

    action = "promoted to Admin" if new_role == "admin" else "demoted to Member"
    sys_msg = models.Message(
        sender_id=current_user.id,
        group_id=group_id,
        content=f"{target_name} was {action} by the Owner.",
        status="sent",
        created_at=datetime.now(timezone.utc)
    )
    db.add(sys_msg)
    db.commit()

    return target_membership
