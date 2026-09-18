import os
import asyncio
from pathlib import Path
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import or_

import models

# Upload directory configuration (mirroring backend/routes/files.py)
BASE_DIR = Path(__file__).resolve().parent.parent
if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
    UPLOAD_DIR = Path("/tmp") / os.getenv("UPLOAD_DIRECTORY", "uploads")
else:
    UPLOAD_DIR = BASE_DIR / os.getenv("UPLOAD_DIRECTORY", "uploads")

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def safe_delete_file_from_disk(file_ref: Optional[str]) -> bool:
    """
    Safely deletes a file from the uploads directory, preventing path traversal.
    Returns True if file was deleted, False otherwise.
    """
    if not file_ref or not isinstance(file_ref, str):
        return False
    try:
        # file_ref may be full URL, /api/files/download/filename, or just filename
        cleaned = file_ref.split("?")[0].strip()
        filename = cleaned.split("/")[-1].split("\\")[-1]
        if not filename or filename in (".", ".."):
            return False

        target_path = (UPLOAD_DIR / filename).resolve()
        # Strictly verify that target_path is within UPLOAD_DIR
        if target_path.is_relative_to(UPLOAD_DIR.resolve()) and target_path.is_file():
            target_path.unlink(missing_ok=True)
            return True
    except Exception as e:
        print(f"Error safely deleting file {file_ref}: {e}")
    return False


async def force_disconnect_ws(user_id: int, reason: str = "account_deleted"):
    """Disconnects any active websocket connections for this user."""
    try:
        from websocket.chat import manager
        await manager.force_disconnect_user(user_id, reason=reason)
    except Exception as e:
        print(f"WS disconnect note: {e}")


def delete_user_data_only(db: Session, user: models.User) -> Dict[str, Any]:
    """
    Clears all user-generated data (messages, reactions, documents, bio, avatar),
    while preserving the User account record so the user can still log in with a clean slate.
    """
    files_deleted_count = 0
    messages_deleted_count = 0

    # 1. Delete avatar file if stored locally
    if user.avatar_url:
        if safe_delete_file_from_disk(user.avatar_url):
            files_deleted_count += 1
        user.avatar_url = ""

    user.bio = ""

    # 2. Find and delete documents uploaded by user
    docs = db.query(models.Document).filter(models.Document.uploader_id == user.id).all()
    for doc in docs:
        if safe_delete_file_from_disk(doc.stored_filename):
            files_deleted_count += 1
        db.delete(doc)
    db.flush()

    # 3. Find messages sent by this user
    user_messages = db.query(models.Message).filter(models.Message.sender_id == user.id).all()
    user_msg_ids = [m.id for m in user_messages]

    # Delete reactions on those messages or made by this user
    db.query(models.Reaction).filter(
        or_(
            models.Reaction.user_id == user.id,
            models.Reaction.message_id.in_(user_msg_ids) if user_msg_ids else False
        )
    ).delete(synchronize_session=False)

    # Delete the messages sent by this user
    for msg in user_messages:
        messages_deleted_count += 1
        db.delete(msg)
    db.flush()

    db.commit()
    db.refresh(user)

    return {
        "user_id": user.id,
        "username": user.username,
        "messages_deleted": messages_deleted_count,
        "files_deleted": files_deleted_count,
        "status": "data_cleared"
    }


def delete_user_account_permanently(db: Session, user: models.User) -> Dict[str, Any]:
    """
    Permanently and transactionally deletes a user account, all associated data,
    group ownership reassignments, and physical files.
    """
    user_id = user.id
    files_deleted_count = 0

    # 1. Safe physical file deletion for avatar
    if user.avatar_url:
        if safe_delete_file_from_disk(user.avatar_url):
            files_deleted_count += 1

    # 2. Safe physical file deletion for documents uploaded by user
    docs = db.query(models.Document).filter(models.Document.uploader_id == user_id).all()
    for doc in docs:
        if safe_delete_file_from_disk(doc.stored_filename):
            files_deleted_count += 1
        db.delete(doc)
    db.flush()

    # 3. Handle groups created by this user
    owned_groups = db.query(models.Group).filter(models.Group.created_by == user_id).all()
    for group in owned_groups:
        # Look for other members ordered by joined_at ASC
        other_member = db.query(models.GroupMember).filter(
            models.GroupMember.group_id == group.id,
            models.GroupMember.user_id != user_id
        ).order_by(models.GroupMember.joined_at.asc()).first()

        if other_member:
            # Transfer group ownership
            group.created_by = other_member.user_id
            other_member.role = "admin"
        else:
            # Group is empty without this user; delete group documents, messages, members, and group
            group_docs = db.query(models.Document).filter(models.Document.group_id == group.id).all()
            for g_doc in group_docs:
                safe_delete_file_from_disk(g_doc.stored_filename)
                db.delete(g_doc)
            db.flush()

            # Reactions on group messages
            group_messages = db.query(models.Message).filter(models.Message.group_id == group.id).all()
            g_msg_ids = [m.id for m in group_messages]
            if g_msg_ids:
                db.query(models.Reaction).filter(models.Reaction.message_id.in_(g_msg_ids)).delete(synchronize_session=False)

            db.query(models.Message).filter(models.Message.group_id == group.id).delete(synchronize_session=False)
            db.query(models.GroupMember).filter(models.GroupMember.group_id == group.id).delete(synchronize_session=False)
            db.delete(group)
    db.flush()

    # 4. Delete user's group memberships in other groups
    db.query(models.GroupMember).filter(models.GroupMember.user_id == user_id).delete(synchronize_session=False)

    # 5. Delete reactions made by this user
    db.query(models.Reaction).filter(models.Reaction.user_id == user_id).delete(synchronize_session=False)

    # 6. Delete direct messages involving this user (sent or received) and their reactions
    direct_msgs = db.query(models.Message).filter(
        or_(
            models.Message.sender_id == user_id,
            models.Message.recipient_id == user_id
        )
    ).all()
    direct_msg_ids = [m.id for m in direct_msgs]
    if direct_msg_ids:
        db.query(models.Reaction).filter(models.Reaction.message_id.in_(direct_msg_ids)).delete(synchronize_session=False)
        for d_msg in direct_msgs:
            db.delete(d_msg)
    db.flush()

    # 7. Delete 1-on-1 conversations involving this user
    db.query(models.Conversation).filter(
        or_(
            models.Conversation.user_a_id == user_id,
            models.Conversation.user_b_id == user_id
        )
    ).delete(synchronize_session=False)

    # 8. Delete password reset tokens
    db.query(models.PasswordResetToken).filter(models.PasswordResetToken.user_id == user_id).delete(synchronize_session=False)

    # 9. Anonymize admin audit logs where this user was the admin
    db.query(models.AdminAuditLog).filter(models.AdminAuditLog.admin_user_id == user_id).update(
        {"admin_user_id": None}, synchronize_session=False
    )

    # 10. Delete the user record
    db.delete(user)
    db.commit()

    return {
        "user_id": user_id,
        "files_deleted": files_deleted_count,
        "status": "account_permanently_deleted"
    }
