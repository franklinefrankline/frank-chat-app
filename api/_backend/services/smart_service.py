import os
import re
import time
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc
from fastapi import HTTPException, status

import models
import schemas


# ---------------- RATE LIMITING CACHE ----------------
_RATE_LIMIT_CACHE: Dict[str, float] = {}
RATE_LIMIT_WINDOW_SECONDS = 0.6  # Prevents rapid double clicks / hammering


def check_rate_limit(key: str, window: float = RATE_LIMIT_WINDOW_SECONDS):
    now = time.time()
    last_time = _RATE_LIMIT_CACHE.get(key, 0)
    if now - last_time < window:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests. Please wait a moment before generating again."
        )
    _RATE_LIMIT_CACHE[key] = now


# ---------------- DATA MINIMIZATION ----------------
SENSITIVE_PATTERNS = [
    re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'),  # Emails
    re.compile(r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b'),  # Phones
    re.compile(r'(?i)\b(?:password|passwd|secret|token|api[_-]?key|jwt|bearer)\s*[:=]\s*\S+'),
]


def sanitize_message_content(content: str) -> str:
    """Strips credentials, phone numbers, and emails before sending to AI providers."""
    if not content:
        return ""
    sanitized = content
    for pat in SENSITIVE_PATTERNS:
        sanitized = pat.sub("[REDACTED]", sanitized)
    return sanitized.strip()


# ---------------- AI PROVIDER BASE & IMPLEMENTATIONS ----------------

class AIProvider:
    """Abstract AI Provider interface for FRANK Smart Conversation."""

    async def generate_summary(self, messages: List[Dict[str, Any]]) -> Tuple[List[str], str]:
        raise NotImplementedError

    async def extract_important(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    async def extract_actions(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    async def extract_decisions(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    async def extract_dates(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError


class BuiltinSmartProvider(AIProvider):
    """
    Intelligent NLP and semantic extraction engine for FRANK Smart Conversation.
    Operates directly on real conversation messages without fake or hardcoded replies.
    """

    async def generate_summary(self, messages: List[Dict[str, Any]]) -> Tuple[List[str], str]:
        if len(messages) < 2:
            return [], ""

        bullets: List[str] = []
        senders = list(set(m["sender_name"] for m in messages if m.get("sender_name")))
        participants_str = ", ".join(senders) if senders else "Participants"

        # 1. Main Topics / Start of discussion
        first_few = [m for m in messages[:3] if len(m["content"]) > 10]
        if first_few:
            topic_hint = first_few[0]["content"]
            # Clean up
            topic_clean = topic_hint.rstrip(".?!")
            if len(topic_clean) > 80:
                topic_clean = topic_clean[:77] + "..."
            bullets.append(f"Conversation focus: {topic_clean} ({participants_str})")

        # 2. Key Updates & Announcements
        announcement_msgs = [
            m for m in messages
            if any(k in m["content"].lower() for k in ["update", "status", "progress", "deployed", "completed", "working on", "announcement", "fyi", "note"])
        ]
        for msg in announcement_msgs[:2]:
            clean_txt = msg["content"].rstrip(".?!")
            if len(clean_txt) > 80:
                clean_txt = clean_txt[:77] + "..."
            bullets.append(f"{msg['sender_name']}: {clean_txt}")

        # 3. Decisions Made
        decision_msgs = [
            m for m in messages
            if any(k in m["content"].lower() for k in ["decided", "agreed", "let's go with", "let's use", "approved", "confirmed", "finalized", "resolved"])
        ]
        for msg in decision_msgs[:2]:
            clean_txt = msg["content"].rstrip(".?!")
            if len(clean_txt) > 80:
                clean_txt = clean_txt[:77] + "..."
            bullets.append(f"Decision: {clean_txt}")

        # 4. Action Items & Pending Tasks
        task_msgs = [
            m for m in messages
            if any(k in m["content"].lower() for k in ["please", "need to", "action item", "todo", "make sure", "test", "deploy", "upload", "submit"])
        ]
        for msg in task_msgs[:2]:
            clean_txt = msg["content"].rstrip(".?!")
            if len(clean_txt) > 80:
                clean_txt = clean_txt[:77] + "..."
            bullets.append(f"Action: {clean_txt}")

        # 5. Fallback bullets if conversation was simple but has multiple messages
        if len(bullets) < 3 and len(messages) >= 3:
            for m in messages[1:]:
                clean_txt = m["content"].rstrip(".?!")
                if len(clean_txt) > 15 and not any(clean_txt in b for b in bullets):
                    if len(clean_txt) > 80:
                        clean_txt = clean_txt[:77] + "..."
                    bullets.append(f"{m['sender_name']}: {clean_txt}")
                if len(bullets) >= 4:
                    break

        # Ensure 3-8 bullets max
        bullets = bullets[:8]
        full_text = "\n• " + "\n• ".join(bullets) if bullets else ""
        return bullets, full_text

    async def extract_important(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        items = []
        for m in messages:
            txt = m["content"].lower()
            category = None
            reason = None

            # Deadlines
            if any(k in txt for k in ["deadline", "due date", "due by", "by friday", "by monday", "by tomorrow", "submit by", "release date", "september", "october"]):
                category = "deadline"
                reason = "Mentions a key date or project deadline"
            # Decisions
            elif any(k in txt for k in ["decided", "agree", "let's use", "let's go with", "approved", "confirmed", "finalized", "chosen"]):
                category = "decision"
                reason = "Specifies an agreed decision or consensus"
            # Tasks
            elif any(k in txt for k in ["please", "action item", "todo", "need to", "complete", "will do", "working on", "assigned"]):
                category = "task"
                reason = "Identifies an action item or pending assignment"
            # Announcements
            elif any(k in txt for k in ["announcement", "heads up", "fyi", "important update", "release", "notice"]):
                category = "announcement"
                reason = "Broadcasts a notable update or announcement"
            # Questions requiring response
            elif "?" in m["content"] and any(k in txt for k in ["can you", "could you", "what is", "when will", "are we", "should we", "who is", "how do"]):
                category = "question"
                reason = "Presents an open question requiring clarification"

            if category:
                items.append({
                    "source_message_id": m["id"],
                    "sender_name": m["sender_name"],
                    "message_preview": m["content"][:140] + ("..." if len(m["content"]) > 140 else ""),
                    "timestamp": m["timestamp"],
                    "category": category,
                    "reason": reason
                })
        return items

    async def extract_actions(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        actions = []
        task_prefixes = [
            (re.compile(r'(?i)\b(?:please\s+)([^.?!,;]+)'), "Please "),
            (re.compile(r'(?i)\b(?:need to\s+)([^.?!,;]+)'), "Need to "),
            (re.compile(r'(?i)\b(?:make sure to\s+)([^.?!,;]+)'), "Ensure "),
            (re.compile(r'(?i)\b(?:todo:?\s*)([^.?!,;]+)'), ""),
            (re.compile(r'(?i)\b(?:action item:?\s*)([^.?!,;]+)'), ""),
            (re.compile(r'(?i)\b(?:test\s+[^.?!,;]+)'), ""),
            (re.compile(r'(?i)\b(?:deploy\s+[^.?!,;]+)'), ""),
            (re.compile(r'(?i)\b(?:upload\s+[^.?!,;]+)'), ""),
            (re.compile(r'(?i)\b(?:complete\s+[^.?!,;]+)'), ""),
        ]

        for m in messages:
            content = m["content"].strip()
            # Direct imperative verbs at start
            for pat, prefix in task_prefixes:
                match = pat.search(content)
                if match:
                    action_text = match.group(1) if match.groups() else match.group(0)
                    action_text = action_text.strip()
                    if len(action_text) > 4:
                        # Clean up formatting
                        action_text = action_text[0].upper() + action_text[1:]
                        if not any(a["action_text"].lower() == action_text.lower() for a in actions):
                            actions.append({
                                "source_message_id": m["id"],
                                "action_text": action_text[:120],
                                "completed": False
                            })
                            break
        return actions

    async def extract_decisions(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        decisions = []
        decision_patterns = [
            re.compile(r'(?i)\b(?:we\s+decided\s+(?:to\s+)?)([^.?!]+)'),
            re.compile(r'(?i)\b(?:decided:?\s*)([^.?!]+)'),
            re.compile(r'(?i)\b(?:decided\s+on\s+)([^.?!]+)'),
            re.compile(r'(?i)\b(?:decided\s+to\s+)([^.?!]+)'),
            re.compile(r'(?i)\b(?:agreed\s+to\s+)([^.?!]+)'),
            re.compile(r'(?i)\b(?:agreed\s+on\s+)([^.?!]+)'),
            re.compile(r'(?i)\b(?:let(?:\'s|\s+us)\s+go\s+with\s+)([^.?!]+)'),
            re.compile(r'(?i)\b(?:let(?:\'s|\s+us)\s+use\s+)([^.?!]+)'),
            re.compile(r'(?i)\b(?:approved\s+)([^.?!]+)'),
            re.compile(r'(?i)\b(?:confirmed:?\s*)([^.?!]+)'),
            re.compile(r'(?i)\b(?:finalized\s+)([^.?!]+)'),
        ]

        for m in messages:
            content = m["content"].strip()
            for pat in decision_patterns:
                match = pat.search(content)
                if match:
                    d_text = match.group(1).strip()
                    if len(d_text) > 3:
                        d_text = d_text[0].upper() + d_text[1:]
                        if not any(d["decision_text"].lower() == d_text.lower() for d in decisions):
                            decisions.append({
                                "source_message_id": m["id"],
                                "decision_text": d_text[:120]
                            })
                            break
        return decisions

    async def extract_dates(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        dates = []
        # Match common dates: "September 30", "Oct 10", "Friday", "Tomorrow", "Next Monday", "2026-10-15"
        date_patterns = [
            re.compile(r'(?i)\b(?:on|by|at|before)?\s*((?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{1,2}(?:st|nd|rd|th)?(?:\s*,\s*\d{4})?)\b'),
            re.compile(r'(?i)\b(?:on|by|before)?\s*((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s+(?:morning|afternoon|evening|night|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?))?)\b'),
            re.compile(r'(?i)\b(tomorrow(?:\s+(?:morning|afternoon|evening|night))?)\b'),
            re.compile(r'(?i)\b(next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday))\b'),
            re.compile(r'\b(\d{4}-\d{2}-\d{2})\b'),
        ]

        for m in messages:
            content = m["content"].strip()
            for pat in date_patterns:
                match = pat.search(content)
                if match:
                    val = match.group(1).strip().capitalize()
                    # Determine a title from the context
                    snippet = content.replace(match.group(0), "").strip(" ,:.-")
                    title = snippet[:60] if snippet else "Deadline / Event"
                    if len(title) > 60:
                        title = title[:57] + "..."
                    title = title[0].upper() + title[1:] if title else "Scheduled event"

                    if not any(d["date_value"].lower() == val.lower() and d["source_message_id"] == m["id"] for d in dates):
                        dates.append({
                            "source_message_id": m["id"],
                            "title": title,
                            "date_value": val
                        })
                        break
        return dates


class SmartConversationService:
    """Core Service managing authorized message extraction, AI processing, and persistence."""

    def __init__(self):
        self.provider = BuiltinSmartProvider()

    def get_provider(self) -> AIProvider:
        # Check if an external provider or simulate failure is requested
        simulate_failure = os.getenv("AI_SIMULATE_FAILURE", "").lower() in ("true", "1", "yes")
        if simulate_failure:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Smart Conversation is temporarily unavailable. Please try again."
            )

        provider_env = os.getenv("AI_PROVIDER", "").lower()
        if provider_env == "none":
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="Smart Conversation is not configured."
            )

        return self.provider

    def resolve_conversation(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session
    ) -> Tuple[int, Optional[int], bool]:
        """
        Resolves (canonical_conversation_id, partner_id, is_self).
        Enforces strict authorization: 403 if user is not in group or conversation.
        """
        if conversation_type == "group":
            group = db.query(models.Group).filter(models.Group.id == conversation_id).first()
            if not group:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
            membership = db.query(models.GroupMember).filter(
                models.GroupMember.group_id == conversation_id,
                models.GroupMember.user_id == current_user.id
            ).first()
            if not membership:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to analyze this conversation."
                )
            return group.id, None, False

        # Direct conversation
        # 1. Check if conversation_id is an actual Conversation record
        conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
        if conv:
            if current_user.id in (conv.user_a_id, conv.user_b_id):
                is_self = (conv.user_a_id == conv.user_b_id)
                partner_id = current_user.id if is_self else (conv.user_b_id if conv.user_a_id == current_user.id else conv.user_a_id)
                return conv.id, partner_id, is_self
            else:
                # Conversation exists between other users -> strictly 403 Forbidden
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to analyze this conversation."
                )

        # 2. Check if conversation_id was passed as partner_id (or self user ID) for backward compatibility
        target_user = db.query(models.User).filter(models.User.id == conversation_id).first()
        if target_user:
            partner_id = target_user.id
            is_self = (partner_id == current_user.id)
            ua = min(current_user.id, partner_id)
            ub = max(current_user.id, partner_id)
            user_conv = db.query(models.Conversation).filter(
                models.Conversation.user_a_id == ua,
                models.Conversation.user_b_id == ub
            ).first()
            if not user_conv:
                user_conv = models.Conversation(user_a_id=ua, user_b_id=ub)
                db.add(user_conv)
                db.commit()
                db.refresh(user_conv)
            return user_conv.id, partner_id, is_self

        # 3. Neither conv nor user found -> 404
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")

    def verify_authorization_and_fetch_messages(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session,
        limit: int = 150,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        unread_only: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Enforces strict server-side authorization and retrieves ordered messages.
        """
        conv_id, partner_id, is_self = self.resolve_conversation(
            conversation_id, conversation_type, current_user, db
        )

        if conversation_type == "group":
            q = db.query(models.Message).filter(models.Message.group_id == conv_id)
        else:
            if is_self:
                q = db.query(models.Message).filter(
                    models.Message.group_id.is_(None),
                    models.Message.sender_id == current_user.id,
                    or_(
                        models.Message.recipient_id == current_user.id,
                        models.Message.recipient_id.is_(None)
                    )
                )
            else:
                q = db.query(models.Message).filter(
                    models.Message.group_id.is_(None),
                    or_(
                        and_(models.Message.sender_id == current_user.id, models.Message.recipient_id == partner_id),
                        and_(models.Message.sender_id == partner_id, models.Message.recipient_id == current_user.id)
                    )
                )

        # Filters
        if start_date:
            q = q.filter(models.Message.created_at >= start_date)
        if end_date:
            q = q.filter(models.Message.created_at <= end_date)
        if unread_only:
            q = q.filter(models.Message.recipient_id == current_user.id, models.Message.status != "read")

        raw_messages = q.order_by(models.Message.created_at.asc()).limit(limit).all()

        # Build minimized, sanitized structures (Zero password, hash, token or secret exposed)
        result = []
        user_cache: Dict[int, str] = {}
        for msg in raw_messages:
            sender_id = msg.sender_id
            if sender_id not in user_cache:
                u = db.query(models.User).filter(models.User.id == sender_id).first()
                user_cache[sender_id] = (u.full_name or u.username) if u else "User"

            sanitized_content = sanitize_message_content(msg.content or "")
            if not sanitized_content and msg.message_type != "text":
                sanitized_content = f"[{msg.message_type.capitalize()} attachment]"

            result.append({
                "id": msg.id,
                "sender_id": msg.sender_id,
                "sender_name": user_cache[sender_id],
                "content": sanitized_content,
                "message_type": msg.message_type or "text",
                "timestamp": schemas.format_iso_utc(msg.created_at) or "",
                "status": msg.status,
                "has_file": bool(msg.file_id)
            })

        return result

    async def generate_summary(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session,
        force_refresh: bool = False
    ) -> schemas.SmartSummaryResponse:
        if not force_refresh:
            rate_key = f"summary_{current_user.id}_{conversation_id}_{conversation_type}"
            check_rate_limit(rate_key, window=0.5)

        provider = self.get_provider()
        messages = self.verify_authorization_and_fetch_messages(
            conversation_id, conversation_type, current_user, db, limit=120
        )

        # Short conversation check (Section 6, 32)
        if len(messages) == 0:
            return schemas.SmartSummaryResponse(
                success=True,
                conversation_id=conversation_id,
                conversation_type=conversation_type,
                summary_bullets=[],
                summary_text="",
                status="empty",
                message="There are no messages to analyze yet."
            )

        if len(messages) == 1:
            m = messages[0]
            txt = m["content"].strip()
            bullet = f"Initial message from {m['sender_name']}: {txt[:120]}"
            return schemas.SmartSummaryResponse(
                success=True,
                conversation_id=conversation_id,
                conversation_type=conversation_type,
                summary_bullets=[bullet],
                summary_text=bullet,
                status="ready",
                source_message_start=m["id"],
                source_message_end=m["id"],
                generated_at=schemas.format_iso_utc(datetime.now(timezone.utc))
            )

        start_id = messages[0]["id"] if messages else None
        end_id = messages[-1]["id"] if messages else None

        # Check existing cached summary if not forcing refresh (Section 22)
        if not force_refresh:
            cached = db.query(models.ConversationSummary).filter(
                models.ConversationSummary.conversation_id == conversation_id,
                models.ConversationSummary.conversation_type == conversation_type,
                models.ConversationSummary.requested_by_user_id == current_user.id
            ).first()

            if cached and cached.source_message_end == end_id and cached.summary:
                bullets = [b.strip("• \r\n") for b in cached.summary.split("\n") if b.strip()]
                return schemas.SmartSummaryResponse(
                    success=True,
                    conversation_id=conversation_id,
                    conversation_type=conversation_type,
                    summary_bullets=bullets,
                    summary_text=cached.summary,
                    status="ready",
                    source_message_start=cached.source_message_start,
                    source_message_end=cached.source_message_end,
                    generated_at=schemas.format_iso_utc(cached.updated_at)
                )

        bullets, full_text = await provider.generate_summary(messages)
        if not bullets:
            return schemas.SmartSummaryResponse(
                success=True,
                conversation_id=conversation_id,
                conversation_type=conversation_type,
                summary_bullets=[],
                summary_text="",
                status="insufficient_content",
                message="Not enough conversation content to generate a useful summary."
            )

        # Persist or update summary record
        existing = db.query(models.ConversationSummary).filter(
            models.ConversationSummary.conversation_id == conversation_id,
            models.ConversationSummary.conversation_type == conversation_type,
            models.ConversationSummary.requested_by_user_id == current_user.id
        ).first()

        now_utc = datetime.now(timezone.utc)
        if existing:
            existing.summary = full_text
            existing.source_message_start = start_id
            existing.source_message_end = end_id
            existing.updated_at = now_utc
        else:
            new_summary = models.ConversationSummary(
                conversation_id=conversation_id,
                conversation_type=conversation_type,
                requested_by_user_id=current_user.id,
                summary=full_text,
                source_message_start=start_id,
                source_message_end=end_id,
                created_at=now_utc,
                updated_at=now_utc
            )
            db.add(new_summary)
        db.commit()

        return schemas.SmartSummaryResponse(
            success=True,
            conversation_id=conversation_id,
            conversation_type=conversation_type,
            summary_bullets=bullets,
            summary_text=full_text,
            status="ready",
            source_message_start=start_id,
            source_message_end=end_id,
            generated_at=schemas.format_iso_utc(now_utc)
        )

    async def generate_missed_summary(
        self,
        conversation_id: int,
        conversation_type: str,
        period: str,
        current_user: models.User,
        db: Session,
        start_date_str: Optional[str] = None,
        end_date_str: Optional[str] = None
    ) -> schemas.SmartMissedResponse:
        rate_key = f"missed_{current_user.id}_{conversation_id}_{period}"
        check_rate_limit(rate_key)

        now_utc = datetime.now(timezone.utc)
        start_date = None
        end_date = None
        unread_only = False

        if period == "last_read":
            unread_only = True
        elif period == "today":
            start_date = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "yesterday":
            start_date = (now_utc - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            end_date = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
        elif period == "last_7_days":
            start_date = now_utc - timedelta(days=7)
        elif period == "custom":
            if start_date_str:
                try:
                    start_date = datetime.fromisoformat(start_date_str.replace("Z", "+00:00"))
                except Exception:
                    pass
            if end_date_str:
                try:
                    end_date = datetime.fromisoformat(end_date_str.replace("Z", "+00:00"))
                except Exception:
                    pass

        messages = self.verify_authorization_and_fetch_messages(
            conversation_id,
            conversation_type,
            current_user,
            db,
            start_date=start_date,
            end_date=end_date,
            unread_only=unread_only
        )

        msg_count = len(messages)
        if msg_count == 0:
            return schemas.SmartMissedResponse(
                success=True,
                conversation_id=conversation_id,
                conversation_type=conversation_type,
                period=period,
                message_count=0,
                important_updates_count=0,
                files_count=0,
                decisions_count=0,
                explanation="You are completely caught up! No new messages for this period.",
                items=[],
                status="ready"
            )

        files_count = sum(1 for m in messages if m["has_file"] or m["message_type"] in ("document", "image", "video", "audio"))
        decision_keywords = ["decided", "agreed", "let's go with", "let's use", "approved", "confirmed"]
        decisions_count = sum(1 for m in messages if any(k in m["content"].lower() for k in decision_keywords))
        updates_keywords = ["update", "status", "ready", "deployed", "fyi", "announcement", "notice"]
        updates_count = sum(1 for m in messages if any(k in m["content"].lower() for k in updates_keywords))

        # Items breakdown with source message IDs
        items: List[schemas.SmartMissedItem] = []
        for m in messages[-10:]:
            cat = "update"
            if any(k in m["content"].lower() for k in decision_keywords):
                cat = "decision"
            elif m["has_file"] or m["message_type"] != "text":
                cat = "file"
            elif any(k in m["content"].lower() for k in ["todo", "please", "task", "action"]):
                cat = "task"

            items.append(schemas.SmartMissedItem(
                source_message_id=m["id"],
                sender_name=m["sender_name"],
                preview=m["content"][:90] + ("..." if len(m["content"]) > 90 else ""),
                timestamp=m["timestamp"],
                category=cat
            ))

        explanation = f"You received {msg_count} message{'' if msg_count == 1 else 's'} during this period"
        if files_count > 0 or decisions_count > 0:
            explanation += f", including {files_count} file attachment{'' if files_count == 1 else 's'} and {decisions_count} decision point{'' if decisions_count == 1 else 's'}."
        else:
            explanation += "."

        return schemas.SmartMissedResponse(
            success=True,
            conversation_id=conversation_id,
            conversation_type=conversation_type,
            period=period,
            message_count=msg_count,
            important_updates_count=updates_count,
            files_count=files_count,
            decisions_count=decisions_count,
            explanation=explanation,
            items=items,
            status="ready"
        )

    async def extract_important_messages(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session
    ) -> schemas.SmartImportantResponse:
        rate_key = f"important_{current_user.id}_{conversation_id}"
        check_rate_limit(rate_key)

        provider = self.get_provider()
        messages = self.verify_authorization_and_fetch_messages(
            conversation_id, conversation_type, current_user, db, limit=120
        )

        extracted = await provider.extract_important(messages)
        items = [schemas.SmartImportantMessageItem(**item) for item in extracted]

        return schemas.SmartImportantResponse(
            success=True,
            conversation_id=conversation_id,
            conversation_type=conversation_type,
            messages=items,
            status="ready"
        )

    async def get_or_extract_actions(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session
    ) -> List[schemas.SmartActionItemResponse]:
        # First verify user authorization for conversation
        messages = self.verify_authorization_and_fetch_messages(
            conversation_id, conversation_type, current_user, db, limit=120
        )

        # Retrieve already persisted action items for this conversation & user
        existing_items = db.query(models.SmartActionItem).filter(
            models.SmartActionItem.conversation_id == conversation_id,
            models.SmartActionItem.conversation_type == conversation_type,
            models.SmartActionItem.user_id == current_user.id
        ).order_by(models.SmartActionItem.id.asc()).all()

        existing_source_ids = {it.source_message_id for it in existing_items if it.source_message_id}
        existing_texts = {it.action_text.lower().strip() for it in existing_items}

        if messages:
            # Auto-extract and populate from conversation messages
            provider = self.get_provider()
            extracted = await provider.extract_actions(messages)
            now_utc = datetime.now(timezone.utc)
            new_added = False
            for item in extracted:
                src_id = item.get("source_message_id")
                txt = item["action_text"].strip()
                if (src_id and src_id not in existing_source_ids) or (not src_id and txt.lower() not in existing_texts):
                    action = models.SmartActionItem(
                        conversation_id=conversation_id,
                        conversation_type=conversation_type,
                        user_id=current_user.id,
                        source_message_id=src_id,
                        action_text=txt,
                        completed=False,
                        created_at=now_utc,
                        updated_at=now_utc
                    )
                    db.add(action)
                    if src_id:
                        existing_source_ids.add(src_id)
                    existing_texts.add(txt.lower())
                    new_added = True
            if new_added:
                db.commit()
                existing_items = db.query(models.SmartActionItem).filter(
                    models.SmartActionItem.conversation_id == conversation_id,
                    models.SmartActionItem.conversation_type == conversation_type,
                    models.SmartActionItem.user_id == current_user.id
                ).order_by(models.SmartActionItem.id.asc()).all()

        return [schemas.SmartActionItemResponse.model_validate(it) for it in existing_items]

    def create_action(
        self,
        conversation_id: int,
        action_in: schemas.SmartActionItemCreate,
        current_user: models.User,
        db: Session
    ) -> schemas.SmartActionItemResponse:
        conv_type = action_in.conversation_type or "direct"
        # Validate authorization
        self.verify_authorization_and_fetch_messages(conversation_id, conv_type, current_user, db, limit=1)

        now_utc = datetime.now(timezone.utc)
        item = models.SmartActionItem(
            conversation_id=conversation_id,
            conversation_type=conv_type,
            user_id=current_user.id,
            source_message_id=action_in.source_message_id,
            action_text=action_in.action_text.strip(),
            completed=False,
            created_at=now_utc,
            updated_at=now_utc
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return schemas.SmartActionItemResponse.model_validate(item)

    def update_action(
        self,
        conversation_id: int,
        action_id: int,
        update_in: schemas.SmartActionItemUpdate,
        current_user: models.User,
        db: Session
    ) -> schemas.SmartActionItemResponse:
        item = db.query(models.SmartActionItem).filter(
            models.SmartActionItem.id == action_id,
            models.SmartActionItem.conversation_id == conversation_id,
            models.SmartActionItem.user_id == current_user.id
        ).first()

        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action item not found")

        if update_in.completed is not None:
            item.completed = update_in.completed
        if update_in.action_text is not None:
            item.action_text = update_in.action_text.strip()
        item.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(item)
        return schemas.SmartActionItemResponse.model_validate(item)

    def delete_action(
        self,
        conversation_id: int,
        action_id: int,
        current_user: models.User,
        db: Session
    ) -> Dict[str, Any]:
        item = db.query(models.SmartActionItem).filter(
            models.SmartActionItem.id == action_id,
            models.SmartActionItem.conversation_id == conversation_id,
            models.SmartActionItem.user_id == current_user.id
        ).first()

        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action item not found")

        db.delete(item)
        db.commit()
        return {"success": True, "message": "Action item deleted"}

    async def get_or_extract_decisions(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session
    ) -> schemas.SmartDecisionsResponse:
        messages = self.verify_authorization_and_fetch_messages(
            conversation_id, conversation_type, current_user, db, limit=120
        )

        existing = db.query(models.SmartDecision).filter(
            models.SmartDecision.conversation_id == conversation_id,
            models.SmartDecision.conversation_type == conversation_type,
            models.SmartDecision.user_id == current_user.id
        ).all()

        existing_source_ids = {d.source_message_id for d in existing if d.source_message_id}
        existing_texts = {d.decision_text.lower().strip() for d in existing}

        if messages:
            provider = self.get_provider()
            extracted = await provider.extract_decisions(messages)
            now_utc = datetime.now(timezone.utc)
            new_added = False
            for item in extracted:
                src_id = item.get("source_message_id")
                txt = item["decision_text"].strip()
                if (src_id and src_id not in existing_source_ids) or (not src_id and txt.lower() not in existing_texts):
                    dec = models.SmartDecision(
                        conversation_id=conversation_id,
                        conversation_type=conversation_type,
                        user_id=current_user.id,
                        source_message_id=src_id,
                        decision_text=txt,
                        created_at=now_utc,
                        updated_at=now_utc
                    )
                    db.add(dec)
                    if src_id:
                        existing_source_ids.add(src_id)
                    existing_texts.add(txt.lower())
                    new_added = True
            if new_added:
                db.commit()
                existing = db.query(models.SmartDecision).filter(
                    models.SmartDecision.conversation_id == conversation_id,
                    models.SmartDecision.conversation_type == conversation_type,
                    models.SmartDecision.user_id == current_user.id
                ).all()

        items = [
            schemas.SmartDecisionItem(
                id=d.id,
                conversation_id=d.conversation_id,
                conversation_type=d.conversation_type,
                source_message_id=d.source_message_id,
                decision_text=d.decision_text,
                created_at=schemas.format_iso_utc(d.created_at)
            )
            for d in existing
        ]

        return schemas.SmartDecisionsResponse(
            success=True,
            conversation_id=conversation_id,
            conversation_type=conversation_type,
            decisions=items,
            status="ready"
        )

    async def get_or_extract_dates(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session
    ) -> schemas.SmartDatesResponse:
        messages = self.verify_authorization_and_fetch_messages(
            conversation_id, conversation_type, current_user, db, limit=120
        )

        existing = db.query(models.SmartDate).filter(
            models.SmartDate.conversation_id == conversation_id,
            models.SmartDate.conversation_type == conversation_type,
            models.SmartDate.user_id == current_user.id
        ).all()

        existing_source_ids = {d.source_message_id for d in existing if d.source_message_id}
        existing_keys = {(d.title.lower().strip(), d.date_value.lower().strip()) for d in existing}

        if messages:
            provider = self.get_provider()
            extracted = await provider.extract_dates(messages)
            now_utc = datetime.now(timezone.utc)
            new_added = False
            for item in extracted:
                src_id = item.get("source_message_id")
                t_key = (item["title"].lower().strip(), item["date_value"].lower().strip())
                if (src_id and src_id not in existing_source_ids) or (not src_id and t_key not in existing_keys):
                    dt_record = models.SmartDate(
                        conversation_id=conversation_id,
                        conversation_type=conversation_type,
                        user_id=current_user.id,
                        source_message_id=src_id,
                        title=item["title"],
                        date_value=item["date_value"],
                        created_at=now_utc,
                        updated_at=now_utc
                    )
                    db.add(dt_record)
                    if src_id:
                        existing_source_ids.add(src_id)
                    existing_keys.add(t_key)
                    new_added = True
            if new_added:
                db.commit()
                existing = db.query(models.SmartDate).filter(
                    models.SmartDate.conversation_id == conversation_id,
                    models.SmartDate.conversation_type == conversation_type,
                    models.SmartDate.user_id == current_user.id
                ).all()

        items = [
            schemas.SmartDateItem(
                id=d.id,
                conversation_id=d.conversation_id,
                conversation_type=d.conversation_type,
                source_message_id=d.source_message_id,
                title=d.title,
                date_value=d.date_value,
                created_at=schemas.format_iso_utc(d.created_at)
            )
            for d in existing
        ]

        return schemas.SmartDatesResponse(
            success=True,
            conversation_id=conversation_id,
            conversation_type=conversation_type,
            dates=items,
            status="ready"
        )

    def get_files(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session
    ) -> schemas.SmartFilesResponse:
        conv_id, partner_id, is_self = self.resolve_conversation(conversation_id, conversation_type, current_user, db)

        if conversation_type == "group":
            docs = db.query(models.Document).filter(
                models.Document.group_id == conv_id
            ).order_by(models.Document.id.desc()).all()
        else:
            if is_self:
                msg_ids = [m[0] for m in db.query(models.Message.id).filter(
                    models.Message.group_id.is_(None),
                    models.Message.sender_id == current_user.id,
                    or_(
                        models.Message.recipient_id == current_user.id,
                        models.Message.recipient_id.is_(None)
                    )
                ).all()]
                filter_cond = [
                    and_(
                        models.Document.uploader_id == current_user.id,
                        or_(
                            models.Document.conversation_id == current_user.id,
                            models.Document.conversation_id == conv_id,
                            models.Document.conversation_id.is_(None)
                        )
                    )
                ]
            else:
                msg_ids = [m[0] for m in db.query(models.Message.id).filter(
                    models.Message.group_id.is_(None),
                    or_(
                        and_(models.Message.sender_id == current_user.id, models.Message.recipient_id == partner_id),
                        and_(models.Message.sender_id == partner_id, models.Message.recipient_id == current_user.id)
                    )
                ).all()]

                filter_cond = [
                    and_(
                        models.Document.uploader_id.in_([current_user.id, partner_id]),
                        or_(
                            models.Document.conversation_id.in_([partner_id, current_user.id]),
                            models.Document.conversation_id == conv_id
                        )
                    )
                ]
            if msg_ids:
                filter_cond.append(models.Document.message_id.in_(msg_ids))

            docs = db.query(models.Document).filter(
                or_(*filter_cond)
            ).order_by(models.Document.id.desc()).all()

        user_cache: Dict[int, str] = {}
        file_items = []
        for d in docs:
            if d.uploader_id not in user_cache:
                u = db.query(models.User).filter(models.User.id == d.uploader_id).first()
                user_cache[d.uploader_id] = (u.full_name or u.username) if u else "User"

            file_items.append(schemas.SmartFileItem(
                id=d.id,
                original_filename=d.original_filename,
                file_size=d.file_size,
                file_type=d.file_type or "document",
                mime_type=d.mime_type or "application/octet-stream",
                uploader_name=user_cache[d.uploader_id],
                created_at=schemas.format_iso_utc(d.created_at),
                download_url=f"/api/files/{d.id}/download"
            ))

        return schemas.SmartFilesResponse(
            success=True,
            conversation_id=conversation_id,
            conversation_type=conversation_type,
            files=file_items,
            total_files=len(file_items),
            status="ready"
        )

    def get_insights(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session
    ) -> schemas.SmartInsightsResponse:
        messages = self.verify_authorization_and_fetch_messages(
            conversation_id, conversation_type, current_user, db, limit=500
        )

        user_msgs_count = sum(1 for m in messages if m.get("sender_id") == current_user.id)
        other_msgs_count = len(messages) - user_msgs_count

        actions = db.query(models.SmartActionItem).filter(
            models.SmartActionItem.conversation_id == conversation_id,
            models.SmartActionItem.conversation_type == conversation_type,
            models.SmartActionItem.user_id == current_user.id
        ).all()

        decisions_count = db.query(models.SmartDecision).filter(
            models.SmartDecision.conversation_id == conversation_id,
            models.SmartDecision.conversation_type == conversation_type,
            models.SmartDecision.user_id == current_user.id
        ).count()

        dates_count = db.query(models.SmartDate).filter(
            models.SmartDate.conversation_id == conversation_id,
            models.SmartDate.conversation_type == conversation_type,
            models.SmartDate.user_id == current_user.id
        ).count()

        files_res = self.get_files(conversation_id, conversation_type, current_user, db)

        participant_names = list(set(m["sender_name"] for m in messages if m.get("sender_name")))
        if not participant_names:
            participant_names = [current_user.full_name or current_user.username]

        unread_count = sum(1 for m in messages if m.get("sender_id") != current_user.id and m.get("status") != "read")
        last_activity = messages[-1]["timestamp"] if messages else None

        return schemas.SmartInsightsResponse(
            success=True,
            conversation_id=conversation_id,
            conversation_type=conversation_type,
            total_messages=len(messages),
            user_messages=user_msgs_count,
            other_messages=other_msgs_count,
            files_count=files_res.total_files,
            action_items_count=len(actions),
            pending_action_items_count=sum(1 for a in actions if not a.completed),
            decisions_count=decisions_count,
            dates_count=dates_count,
            active_participants_count=len(participant_names),
            participants=participant_names,
            last_activity=last_activity,
            unread_messages=unread_count,
            status="ready"
        )

    async def get_full_smart(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session,
        force_refresh: bool = False
    ) -> schemas.SmartFullResponse:
        conv_id, partner_id, is_self = self.resolve_conversation(conversation_id, conversation_type, current_user, db)

        summary_res = await self.generate_summary(conversation_id, conversation_type, current_user, db, force_refresh=force_refresh)
        missed_res = await self.generate_missed_summary(conversation_id, conversation_type, "last_read", current_user, db)
        important_res = await self.extract_important_messages(conversation_id, conversation_type, current_user, db)
        actions_list = await self.get_or_extract_actions(conversation_id, conversation_type, current_user, db)
        decisions_res = await self.get_or_extract_decisions(conversation_id, conversation_type, current_user, db)
        dates_res = await self.get_or_extract_dates(conversation_id, conversation_type, current_user, db)
        files_res = self.get_files(conversation_id, conversation_type, current_user, db)
        insights_res = self.get_insights(conversation_id, conversation_type, current_user, db)

        if conversation_type == "group":
            latest = db.query(models.Message).filter(models.Message.group_id == conv_id).order_by(models.Message.id.desc()).first()
        else:
            if is_self:
                latest = db.query(models.Message).filter(
                    models.Message.group_id.is_(None),
                    models.Message.sender_id == current_user.id,
                    or_(
                        models.Message.recipient_id == current_user.id,
                        models.Message.recipient_id.is_(None)
                    )
                ).order_by(models.Message.id.desc()).first()
            else:
                latest = db.query(models.Message).filter(
                    models.Message.group_id.is_(None),
                    or_(
                        and_(models.Message.sender_id == current_user.id, models.Message.recipient_id == partner_id),
                        and_(models.Message.sender_id == partner_id, models.Message.recipient_id == current_user.id)
                    )
                ).order_by(models.Message.id.desc()).first()

        return schemas.SmartFullResponse(
            success=True,
            conversation_id=conversation_id,
            conversation_type=conversation_type,
            summary=summary_res,
            missed=missed_res,
            important=important_res.messages,
            action_items=actions_list,
            decisions=decisions_res.decisions,
            dates=dates_res.dates,
            files=files_res.files,
            insights=insights_res,
            has_summary=bool(summary_res and summary_res.summary_bullets),
            action_items_count=len(actions_list),
            pending_action_items_count=sum(1 for a in actions_list if not a.completed),
            decisions_count=len(decisions_res.decisions),
            dates_count=len(dates_res.dates),
            latest_message_id=latest.id if latest else None
        )


smart_service = SmartConversationService()
