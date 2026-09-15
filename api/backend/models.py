from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


def get_utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=False)
    bio = Column(String(255), default="Hey there! I am using FRANK.")
    avatar_url = Column(String(255), default="")
    is_online = Column(Boolean, default=False)
    last_seen = Column(DateTime(timezone=True), default=get_utc_now)
    created_at = Column(DateTime(timezone=True), default=get_utc_now)

    # Relationships
    sent_messages = relationship("Message", back_populates="sender", foreign_keys="Message.sender_id")
    received_messages = relationship("Message", back_populates="recipient", foreign_keys="Message.recipient_id")
    group_memberships = relationship("GroupMember", back_populates="user")
    reactions = relationship("Reaction", back_populates="user")
    uploaded_documents = relationship("Document", back_populates="uploader")


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    recipient_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True, index=True)
    content = Column(Text, nullable=False)
    message_type = Column(String(20), default="text")  # text, document, image, file
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
    file_type = Column(String(50), default="document")  # pdf, word, excel, ppt, text, archive, image, other
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
    role = Column(String(20), default="member")  # admin, member
    joined_at = Column(DateTime(timezone=True), default=get_utc_now)

    group = relationship("Group", back_populates="members")
    user = relationship("User", back_populates="group_memberships")
