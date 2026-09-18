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


class UserPublicProfile(BaseModel):
    id: int
    username: str
    full_name: str
    frank_id: str
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    is_online: bool = False
    last_seen: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UserResponse(UserBase):
    id: int
    frank_id: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    is_online: bool = False
    email_verified: bool = False
    role: str = "user"
    is_active: bool = True
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
    conversation_id: Optional[int] = None
    user_a_id: int
    user_b_id: int
    partner: Optional[UserResponse] = None
    other_user: Optional[UserResponse] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_message: Optional[dict] = None
    unread_count: int = 0
    is_new: bool = False

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
    token: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=128)


class VerifyResetTokenResponse(BaseModel):
    valid: bool = True
    message: Optional[str] = None


# ---------------- EMAIL VERIFICATION SCHEMAS ----------------

class ResendVerificationRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)


class VerifyEmailResponse(BaseModel):
    success: bool = True
    message: str


class RegisterResponse(BaseModel):
    message: str
    email: str
    email_verified: bool = False
    frank_id: str


# ---------------- ACCOUNT DELETION SCHEMAS ----------------
class UserDeleteSelfRequest(BaseModel):
    password: str = Field(..., min_length=1, description="Current password for identity verification")
    confirm_text: Optional[str] = None


# ---------------- ADMIN PORTAL SCHEMAS ----------------
class AdminUserListItem(BaseModel):
    id: int
    frank_id: Optional[str] = None
    username: str
    email: str
    full_name: str
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    role: str = "user"
    is_active: bool = True
    email_verified: bool = False
    is_online: bool = False
    created_at: Optional[datetime] = None
    last_seen: Optional[datetime] = None

    class Config:
        from_attributes = True


class AdminStatsResponse(BaseModel):
    total_users: int
    verified_users: int
    unverified_users: int
    active_users: int
    disabled_users: int
    total_conversations: int
    total_messages: int
    total_groups: int
    total_files: int
    total_file_bytes: int
    recent_registrations: List[AdminUserListItem]


class AdminUsersPaginatedResponse(BaseModel):
    items: List[AdminUserListItem]
    total: int
    page: int
    limit: int
    pages: int


class AdminUserDetailResponse(AdminUserListItem):
    conversation_count: int = 0
    message_count: int = 0
    group_count: int = 0
    file_count: int = 0


class AdminUserStatusUpdate(BaseModel):
    is_active: bool
    reason: Optional[str] = None


class AdminAuditLogItem(BaseModel):
    id: int
    admin_user_id: Optional[int] = None
    admin_username: Optional[str] = None
    action: str
    target_user_id: Optional[int] = None
    target_identifier: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    status: str = "success"
    created_at: datetime

    class Config:
        from_attributes = True


class AdminAuditLogsPaginatedResponse(BaseModel):
    items: List[AdminAuditLogItem]
    total: int
    page: int
    limit: int
    pages: int


