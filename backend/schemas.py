from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, field_serializer

def format_iso_utc(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------------- USER SCHEMAS ----------------

class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., min_length=5, max_length=120)
    full_name: str = Field(..., min_length=1, max_length=100)


class UserRegister(UserBase):
    password: str = Field(..., min_length=6, max_length=128)


class UserLogin(BaseModel):
    username: str
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None


class UserResponse(UserBase):
    id: int
    frank_id: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    is_online: bool = False
    last_seen: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------- CONVERSATION SCHEMAS ----------------

class PrivateConversationCreate(BaseModel):
    target_user_id: Optional[int] = None
    frank_id: Optional[str] = None


class ConversationResponse(BaseModel):
    id: int
    user_a_id: int
    user_b_id: int
    partner: Optional[UserResponse] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_message: Optional[dict] = None
    unread_count: int = 0

    class Config:
        from_attributes = True


# ---------------- TOKEN SCHEMAS ----------------

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TokenPayload(BaseModel):
    sub: Optional[str] = None


# ---------------- DOCUMENT SCHEMAS ----------------

class DocumentResponse(BaseModel):
    id: int
    message_id: Optional[int] = None
    uploader_id: int
    conversation_id: Optional[int] = None
    group_id: Optional[int] = None
    original_filename: str
    file_size: int
    mime_type: str
    file_type: str
    created_at: datetime

    class Config:
        from_attributes = True


# ---------------- REACTION SCHEMAS ----------------

class ReactionCreate(BaseModel):
    emoji: str = Field(..., max_length=10)


class ReactionResponse(BaseModel):
    id: int
    message_id: int
    user_id: int
    emoji: str

    class Config:
        from_attributes = True


# ---------------- MESSAGE SCHEMAS ----------------

class MessageCreate(BaseModel):
    recipient_id: Optional[int] = None
    group_id: Optional[int] = None
    content: str = Field(..., min_length=1)
    message_type: Optional[str] = "text"  # text, document, image, file
    file_id: Optional[int] = None
    reply_to_id: Optional[int] = None


class MessageUpdate(BaseModel):
    content: str = Field(..., min_length=1)


class MessageResponse(BaseModel):
    id: int
    conversation_id: Optional[int] = None
    sender_id: int
    recipient_id: Optional[int] = None
    group_id: Optional[int] = None
    content: str
    message_type: str = "text"
    file_id: Optional[int] = None
    reply_to_id: Optional[int] = None
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None
    sender: Optional[UserResponse] = None
    document: Optional[DocumentResponse] = None
    reactions: List[ReactionResponse] = []

    @field_serializer("created_at", "updated_at", check_fields=False)
    def serialize_utc_datetime(self, dt: Optional[datetime], _info) -> Optional[str]:
        return format_iso_utc(dt)

    class Config:
        from_attributes = True


# ---------------- GROUP SCHEMAS ----------------

class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = ""
    avatar_url: Optional[str] = ""
    is_private: Optional[bool] = True
    member_ids: List[int] = []


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    is_private: Optional[bool] = None


class GroupMemberAdd(BaseModel):
    user_ids: List[int] = []


class GroupMemberRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(admin|member)$")


class GroupMemberResponse(BaseModel):
    id: int
    user_id: int
    role: str  # owner, admin, member
    joined_at: datetime
    user: UserResponse

    class Config:
        from_attributes = True


class GroupResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    is_private: bool = True
    created_by: int
    created_at: datetime
    members_count: int = 0
    current_user_role: Optional[str] = None
    last_message: Optional[dict] = None
    unread_count: int = 0

    class Config:
        from_attributes = True


# ---------------- PASSWORD RESET SCHEMAS ----------------

class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=6, max_length=128)
