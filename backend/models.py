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
    hashed_password = Column(String(255), nullable=True)
    password_hash = Column(String(255), nullable=True)
    full_name = Column(String(100), nullable=False)
    name = Column(String(100), nullable=True)
    bio = Column(String(255), default="Hey there! I am using FRANK.")
    avatar_url = Column(String(255), default="")
    theme = Column(String(20), default="light")
    language = Column(String(10), default="en", nullable=False)
    auto_translate = Column(Boolean, default=True, nullable=False)
    default_view_translation = Column(Boolean, default=True, nullable=False)
    status = Column(String(20), default="active")
    role = Column(String(20), default="user", nullable=False)
    account_status = Column(String(20), default="active", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime(timezone=True), default=get_utc_now)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


    # Relationships
    sent_messages = relationship("Message", back_populates="sender", foreign_keys="Message.sender_id")
    received_messages = relationship("Message", back_populates="recipient", foreign_keys="Message.recipient_id")
    group_memberships = relationship("GroupMember", back_populates="user")
    conversation_memberships = relationship("ConversationMember", back_populates="user", cascade="all, delete-orphan")
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
    translations = relationship("MessageTranslation", back_populates="message", cascade="all, delete-orphan")


class MessageTranslation(Base):
    __tablename__ = "message_translations"
    __table_args__ = (
        UniqueConstraint("message_id", "target_language", name="uq_msg_target_lang"),
    )

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
    source_language = Column(String(10), nullable=False, default="en")
    target_language = Column(String(10), nullable=False, index=True)
    translated_content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    message = relationship("Message", back_populates="translations")


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
    file_data = Column(Text, nullable=True)  # Base64 payload for resilient multi-instance serverless retrieval
    current_version_number = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, index=True)

    uploader = relationship("User", back_populates="uploaded_documents")
    group = relationship("Group", back_populates="documents")
    versions = relationship("DocumentVersion", back_populates="document", cascade="all, delete-orphan", order_by="DocumentVersion.version_number.desc()")


class DocumentVersion(Base):
    __tablename__ = "document_versions"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False, default=1)
    stored_filename = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    file_data = Column(Text, nullable=True)  # Base64 payload for resilient multi-instance serverless retrieval
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    change_summary = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now, index=True)

    document = relationship("Document", back_populates="versions")
    created_by = relationship("User")


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
    members = relationship("ConversationMember", back_populates="conversation", cascade="all, delete-orphan")


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_conv_member"),
    )

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), default="member")
    joined_at = Column(DateTime(timezone=True), default=get_utc_now)

    conversation = relationship("Conversation", back_populates="members")
    user = relationship("User", back_populates="conversation_memberships")


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


class UploadChunk(Base):
    __tablename__ = "upload_chunks"

    id = Column(Integer, primary_key=True, index=True)
    upload_id = Column(String(64), index=True, nullable=False)
    chunk_index = Column(Integer, nullable=False)
    total_chunks = Column(Integer, nullable=False)
    chunk_data = Column(Text, nullable=True)  # Base64 encoded chunk data for multi-instance serverless resilience
    created_at = Column(DateTime(timezone=True), default=get_utc_now)


class ConversationSummary(Base):
    __tablename__ = "conversation_summaries"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, nullable=False, index=True)
    conversation_type = Column(String(20), default="direct", nullable=False)
    requested_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    message_id = Column(Integer, nullable=True)
    attachment_id = Column(Integer, nullable=True)
    summary = Column(Text, nullable=False)
    missed_summary = Column(Text, nullable=True)
    source_message_start = Column(Integer, nullable=True)
    source_message_end = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


class SmartActionItem(Base):
    __tablename__ = "smart_action_items"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, nullable=False, index=True)
    conversation_type = Column(String(20), default="direct", nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source_message_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    action_text = Column(String(500), nullable=False)
    assigned_to = Column(String(100), nullable=True)
    due_date = Column(String(100), nullable=True)
    completed = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


class SmartDecision(Base):
    __tablename__ = "smart_decisions"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, nullable=False, index=True)
    conversation_type = Column(String(20), default="direct", nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source_message_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    decision_text = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)


class SmartDate(Base):
    __tablename__ = "smart_dates"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, nullable=False, index=True)
    conversation_type = Column(String(20), default="direct", nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    source_message_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    title = Column(String(255), nullable=False)
    date_value = Column(String(100), nullable=False)
    context = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)
    updated_at = Column(DateTime(timezone=True), default=get_utc_now, onupdate=get_utc_now)
