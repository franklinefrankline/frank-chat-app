from datetime import datetime, timezone
from sqlalchemy import Column, Integer, Float, String, Text, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from database import Base


def get_utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    frank_id = Column(String(6), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    bio = Column(String(255), default="Hey there! I am using FRANK.")
    avatar_url = Column(String(255), default="")
    theme = Column(String(20), default="light")
    status = Column(String(20), default="offline")
    role = Column(String(20), default="user", nullable=False)
    account_status = Column(String(20), default="active", nullable=False)
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime(timezone=True), default=get_utc_now)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    # Relationships
    sent_messages = relationship("Message", back_populates="sender", foreign_keys="Message.sender_id")
    received_messages = relationship("Message", back_populates="recipient", foreign_keys="Message.recipient_id")
    group_memberships = relationship("GroupMember", back_populates="user")
    reactions = relationship("Reaction", back_populates="user")
    uploaded_documents = relationship("Document", back_populates="uploader")
    audit_logs = relationship("AuditLog", back_populates="admin", foreign_keys="AuditLog.admin_id")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)
    content = Column(Text, nullable=False)
    message_type = Column(String(20), default="text")  # text, document, image, video, audio
    file_id = Column(Integer, ForeignKey("documents.id", use_alter=True, name="fk_message_document"), nullable=True)
    reply_to_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    status = Column(String(20), default="sent")  # sent, delivered, read
    created_at = Column(DateTime(timezone=True), default=get_utc_now, index=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    sender = relationship("User", back_populates="sent_messages", foreign_keys=[sender_id])
    recipient = relationship("User", back_populates="received_messages", foreign_keys=[recipient_id])
    group = relationship("Group", back_populates="messages")
    document = relationship("Document", foreign_keys=[file_id], post_update=True)
    reactions = relationship("Reaction", back_populates="message", cascade="all, delete-orphan")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id", use_alter=True, name="fk_document_message"), nullable=True)
    uploader_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    conversation_id = Column(Integer, nullable=True, index=True)  # Partner user ID if direct
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)  # in bytes
    mime_type = Column(String(100), nullable=False)
    file_type = Column(String(50), default="document")  # pdf, word, excel, ppt, text, archive, image, video, audio, other
    duration = Column(Float, nullable=True)  # in seconds for audio/voice and video
    created_at = Column(DateTime(timezone=True), default=get_utc_now, index=True)

    uploader = relationship("User", back_populates="uploaded_documents")
    group = relationship("Group", back_populates="documents")


class Reaction(Base):
    __tablename__ = "reactions"

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    emoji = Column(String(10), nullable=False)

    message = relationship("Message", back_populates="reactions")
    user = relationship("User", back_populates="reactions")


class Group(Base):
    __tablename__ = "groups"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255), default="")
    avatar_url = Column(String(255), default="")
    privacy = Column(String(20), default="private", nullable=False)  # private, public
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    members = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="group", cascade="all, delete-orphan")
    documents = relationship("Document", back_populates="group", cascade="all, delete-orphan")


class GroupMember(Base):
    __tablename__ = "group_members"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(20), default="member")  # owner, admin, member
    joined_at = Column(DateTime(timezone=True), default=get_utc_now)

    group = relationship("Group", back_populates="members")
    user = relationship("User", back_populates="group_memberships")


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        UniqueConstraint("user_a_id", "user_b_id", name="uq_conversation_users"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_a_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    user_b_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)

    user_a = relationship("User", foreign_keys=[user_a_id])
    user_b = relationship("User", foreign_keys=[user_b_id])


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    action = Column(String(50), nullable=False)
    target_type = Column(String(50), nullable=False)  # user, group, system
    target_id = Column(Integer, nullable=True)
    target_name = Column(String(100), nullable=True)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, index=True)

    admin = relationship("User", back_populates="audit_logs", foreign_keys=[admin_id])


class ConversationPreference(Base):
    __tablename__ = "conversation_preferences"
    __table_args__ = (
        UniqueConstraint("user_id", "conversation_type", "conversation_id", name="uq_user_conv_pref"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    conversation_type = Column(String(20), nullable=False)  # direct, group
    conversation_id = Column(Integer, nullable=False, index=True)
    is_pinned = Column(Boolean, default=False)
    is_favorite = Column(Boolean, default=False)
    is_muted = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)



