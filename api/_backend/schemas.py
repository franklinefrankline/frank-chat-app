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
    frank_id: str
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str = "user"
    account_status: str = "active"
    is_online: bool = False
    last_seen: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UserPreviewResponse(BaseModel):
    id: int
    username: str
    full_name: str
    frank_id: str
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    is_online: bool = False

    class Config:
        from_attributes = True


# ---------------- ADMIN SCHEMAS ----------------

class AdminMetricsResponse(BaseModel):
    total_users: int
    active_accounts: int
    disabled_accounts: int
    email_verified: int
    total_messages: int
    groups: int
    files: int


class AdminUserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    frank_id: str
    role: str = "user"
    account_status: str = "active"
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    is_online: bool = False
    last_seen: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserListResponse(BaseModel):
    total: int
    page: int
    limit: int
    pages: int
    users: List[AdminUserResponse]


class AdminUserStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(active|disabled)$")


class AdminGroupResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = ""
    privacy: str = "private"
    created_by: int
    creator_name: Optional[str] = "User"
    members_count: int = 1
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogResponse(BaseModel):
    id: int
    admin_id: int
    admin_name: Optional[str] = "Admin"
    admin_username: Optional[str] = "admin"
    action: str
    target_type: str
    target_id: Optional[int] = None
    target_name: Optional[str] = None
    details: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    total: int
    page: int
    limit: int
    pages: int
    logs: List[AuditLogResponse]


class ActivityItem(BaseModel):
    id: str
    title: str
    description: str
    category: str
    created_at: str



# ---------------- CONVERSATION SCHEMAS ----------------

class ConversationCreate(BaseModel):
    target_user_id: Optional[int] = None
    frank_id: Optional[str] = None


class ConversationResponse(BaseModel):
    id: int
    user_a_id: int
    user_b_id: int
    created_at: datetime
    updated_at: datetime
    other_user: Optional[UserResponse] = None

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
    duration: Optional[float] = None
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
    sender_id: int
    recipient_id: Optional[int] = None
    group_id: Optional[int] = None
    content: str
    message_type: str = "text"
    file_id: Optional[int] = None
    reply_to_id: Optional[int] = None
    status: Optional[str] = "sent"
    created_at: Optional[datetime] = None
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
    privacy: Optional[str] = "private"  # private by default
    member_ids: List[int] = []


class GroupUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    privacy: Optional[str] = None


class GroupMemberAdd(BaseModel):
    user_ids: List[int] = []


class GroupRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(admin|member)$")


class GroupMemberResponse(BaseModel):
    id: int
    user_id: int
    role: str
    joined_at: datetime
    user: UserResponse

    class Config:
        from_attributes = True


class GroupResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    avatar_url: Optional[str] = None
    privacy: str = "private"
    created_by: int
    created_at: datetime
    members_count: int = 0
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
