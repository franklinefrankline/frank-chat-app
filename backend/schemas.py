from datetime import datetime, timezone
from typing import Optional, List, Any, Union, Dict
from pydantic import BaseModel, Field, field_serializer, model_validator

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
    username: Optional[str] = Field(None, max_length=50)
    email: str = Field(..., min_length=5, max_length=120)
    full_name: str = Field(..., min_length=1, max_length=100)
    name: Optional[str] = Field(None, max_length=100)


class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=100)
    name: Optional[str] = Field(None, max_length=100)
    email: str = Field(..., min_length=5, max_length=120)
    password: str = Field(..., min_length=6, max_length=128)
    username: Optional[str] = Field(None, max_length=50)
    language: Optional[str] = Field("en", max_length=10)
    otp_code: Optional[str] = Field(None, max_length=20)
    verification_token: Optional[str] = Field(None, max_length=128)


class UserLogin(BaseModel):
    email: Optional[str] = None
    username: Optional[str] = None
    identifier: Optional[str] = None
    password: str


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    theme: Optional[str] = None
    language: Optional[str] = None
    auto_translate: Optional[bool] = None
    default_view_translation: Optional[bool] = None


class UserResponse(UserBase):
    id: int
    frank_id: str
    name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    theme: Optional[str] = "monochrome"
    language: Optional[str] = "en"
    auto_translate: Optional[bool] = True
    default_view_translation: Optional[bool] = True
    role: str = "user"
    status: str = "active"
    account_status: str = "active"
    is_active: bool = True
    is_online: bool = False
    last_seen: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

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
    is_active: bool = True
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
    current_version_number: Optional[int] = 1
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentVersionResponse(BaseModel):
    id: int
    document_id: int
    version_number: int
    file_size: int
    created_by_id: int
    created_by_name: Optional[str] = None
    change_summary: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class DocumentSaveRequest(BaseModel):
    content: Optional[str] = None
    base_version_number: Optional[int] = None
    change_summary: Optional[str] = None
    save_as_new_version: bool = True
    structured_data: Optional[dict] = None


class SendUpdatedFileRequest(BaseModel):
    conversation_id: Optional[int] = None
    recipient_id: Optional[int] = None
    group_id: Optional[int] = None
    comment: Optional[str] = None


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
    translated_content: Optional[str] = None
    source_language: Optional[str] = None
    target_language: Optional[str] = None

    @field_serializer("created_at", "updated_at", check_fields=False)
    def serialize_utc_datetime(self, dt: Optional[datetime], _info) -> Optional[str]:
        return format_iso_utc(dt)

    class Config:
        from_attributes = True


class MessageTranslateRequest(BaseModel):
    target_language: str = Field("ta", min_length=2, max_length=10)


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



# ---------------- PASSWORD RESET & OTP SCHEMAS ----------------

class SendOTPRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    purpose: Optional[str] = Field("registration", max_length=50)


class VerifyOTPRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)
    code: str = Field(..., min_length=4, max_length=20)
    purpose: Optional[str] = Field("registration", max_length=50)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=120)


class ResetPasswordRequest(BaseModel):
    token: Optional[str] = None
    code: Optional[str] = None
    email: Optional[str] = None
    new_password: str = Field(..., min_length=6, max_length=128)


# ---------------- SMART CONVERSATION SCHEMAS ----------------

class SmartSummaryRequest(BaseModel):
    conversation_type: Optional[str] = "direct"  # direct or group
    message_id: Optional[int] = None
    attachment_id: Optional[int] = None
    force_refresh: Optional[bool] = False


class SmartSummaryResponse(BaseModel):
    success: bool = True
    conversation_id: int
    conversation_type: str = "direct"
    message_id: Optional[int] = None
    attachment_id: Optional[int] = None
    summary_bullets: List[str] = []
    summary_text: str = ""
    key_points: List[str] = []
    important_info: str = ""
    status: str = "ready"  # ready, insufficient_content, not_configured, unavailable
    message: Optional[str] = None
    source_message_start: Optional[int] = None
    source_message_end: Optional[int] = None
    generated_at: Optional[str] = None
    provider: Optional[str] = None
    sources: List[int] = []
    selected_message: Optional[Dict[str, Any]] = None


class SmartMissedRequest(BaseModel):
    conversation_type: Optional[str] = "direct"
    message_id: Optional[int] = None
    period: str = "last_read"  # last_read, today, yesterday, last_7_days, custom
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class SmartMissedItem(BaseModel):
    source_message_id: Optional[int] = None
    sender_name: str
    preview: str
    timestamp: str
    category: str = "update"  # question, pending, unaddressed, update, task
    missed_reason: Optional[str] = None


class SmartMissedResponse(BaseModel):
    success: bool = True
    conversation_id: int
    conversation_type: str = "direct"
    period: str
    message_count: int = 0
    important_updates_count: int = 0
    files_count: int = 0
    decisions_count: int = 0
    explanation: str = ""
    items: List[SmartMissedItem] = []
    status: str = "ready"
    message: Optional[str] = None


class SmartImportantMessageItem(BaseModel):
    source_message_id: Optional[int] = None
    sender_name: str
    message_preview: str
    timestamp: str
    category: str  # deadline, decision, task, warning, critical, announcement, question, shared_info
    priority: str = "Medium"  # High, Medium, Low
    reason: str


class SmartImportantResponse(BaseModel):
    success: bool = True
    conversation_id: int
    conversation_type: str = "direct"
    messages: List[SmartImportantMessageItem] = []
    status: str = "ready"
    message: Optional[str] = None


class SmartActionItemCreate(BaseModel):
    conversation_type: Optional[str] = "direct"
    source_message_id: Optional[int] = None
    action_text: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def resolve_action_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            val = data.get("action_text") or data.get("title") or data.get("description") or "New Action Item"
            data["action_text"] = val
            if not data.get("title"):
                data["title"] = val
        return data


class SmartActionItemUpdate(BaseModel):
    completed: Optional[bool] = None
    action_text: Optional[str] = None
    title: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None


class SmartActionItemResponse(BaseModel):
    id: int
    conversation_id: int
    conversation_type: str = "direct"
    user_id: int
    source_message_id: Optional[int] = None
    action_text: str
    title: Optional[str] = None
    description: Optional[str] = ""
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    completed: bool
    status: str = "Pending"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @field_serializer("created_at", "updated_at", check_fields=False)
    def serialize_utc_datetime(self, dt: Optional[datetime], _info) -> Optional[str]:
        return format_iso_utc(dt)

    class Config:
        from_attributes = True


class SmartDecisionItem(BaseModel):
    id: Optional[int] = None
    conversation_id: int
    conversation_type: str = "direct"
    source_message_id: Optional[int] = None
    decision_text: str
    created_at: Optional[str] = None


class SmartDecisionsResponse(BaseModel):
    success: bool = True
    conversation_id: int
    conversation_type: str = "direct"
    decisions: List[SmartDecisionItem] = []
    status: str = "ready"
    message: Optional[str] = None


class SmartDateItem(BaseModel):
    id: Optional[int] = None
    conversation_id: int
    conversation_type: str = "direct"
    source_message_id: Optional[int] = None
    title: str
    date_value: str
    context: Optional[str] = None
    created_at: Optional[str] = None


class SmartDatesResponse(BaseModel):
    success: bool = True
    conversation_id: int
    conversation_type: str = "direct"
    dates: List[SmartDateItem] = []
    status: str = "ready"
    message: Optional[str] = None


class SmartOverviewResponse(BaseModel):
    success: bool = True
    conversation_id: int
    conversation_type: str = "direct"
    has_summary: bool = False
    action_items_count: int = 0
    pending_action_items_count: int = 0
    decisions_count: int = 0
    dates_count: int = 0
    latest_message_id: Optional[int] = None


class SmartFileItem(BaseModel):
    id: int
    original_filename: str
    file_size: int
    file_type: str = "document"
    mime_type: str = ""
    uploader_name: str = "Participant"
    message_id: Optional[int] = None
    created_at: Optional[str] = None
    download_url: Optional[str] = None


class SmartFilesResponse(BaseModel):
    success: bool = True
    conversation_id: int
    conversation_type: str = "direct"
    files: List[SmartFileItem] = []
    total_files: int = 0
    status: str = "ready"
    message: Optional[str] = None


class SmartInsightsResponse(BaseModel):
    success: bool = True
    conversation_id: int
    conversation_type: str = "direct"
    main_topic: Optional[str] = None
    sentiment: Optional[str] = None
    key_patterns: Optional[str] = None
    risks: Optional[str] = None
    conclusion: Optional[str] = None
    total_messages: int = 0
    user_messages: int = 0
    other_messages: int = 0
    files_count: int = 0
    action_items_count: int = 0
    pending_action_items_count: int = 0
    decisions_count: int = 0
    dates_count: int = 0
    active_participants_count: int = 0
    participants: List[str] = []
    last_activity: Optional[str] = None
    unread_messages: int = 0
    status: str = "ready"
    message: Optional[str] = None


class SmartFullResponse(BaseModel):
    success: bool = True
    conversation_id: int
    conversation_type: str = "direct"
    summary: Optional[SmartSummaryResponse] = None
    missed: Optional[SmartMissedResponse] = None
    important: List[SmartImportantMessageItem] = []
    action_items: List[SmartActionItemResponse] = []
    decisions: List[SmartDecisionItem] = []
    dates: List[SmartDateItem] = []
    files: List[SmartFileItem] = []
    insights: Optional[SmartInsightsResponse] = None
    has_summary: bool = False
    action_items_count: int = 0
    pending_action_items_count: int = 0
    decisions_count: int = 0
    dates_count: int = 0
    latest_message_id: Optional[int] = None


class SmartAnalysisRequest(BaseModel):
    conversation_id: Optional[Any] = None
    conversation_type: Optional[str] = "direct"
    force_refresh: bool = False
    message_id: Optional[Any] = None
    attachment_id: Optional[Any] = None
    include_message: Optional[bool] = None
    include_document: Optional[bool] = None
    analysis_type: Optional[str] = "summary"


class ActionItemStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(OPEN|COMPLETED|CANCELLED|open|completed|cancelled)$")


class ActionItemFullUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[Any] = None
    due_date: Optional[str] = None
    status: Optional[str] = None


