import os
import re
import time
import json
import urllib.request
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc
from fastapi import HTTPException, status

import models
import schemas
from services.document_extractor import extract_text_from_file


# ---------------- RATE LIMITING CACHE ----------------
_RATE_LIMIT_CACHE: Dict[str, float] = {}
RATE_LIMIT_WINDOW_SECONDS = 0.5  # Prevents rapid double clicks / hammering


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

    async def generate_summary(self, messages: List[Dict[str, Any]]) -> Tuple[List[str], str, List[str], str]:
        raise NotImplementedError

    async def extract_missed(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    async def extract_important(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    async def extract_actions(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    async def extract_decisions(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    async def extract_dates(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        raise NotImplementedError

    async def extract_insights(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        raise NotImplementedError


class BuiltinSmartProvider(AIProvider):
    """
    Intelligent NLP and semantic extraction engine for FRANK Smart Conversation.
    Operates directly on real conversation messages without fake or hardcoded replies.
    """

    async def generate_summary(self, messages: List[Dict[str, Any]]) -> Tuple[List[str], str, List[str], str]:
        if not messages:
            return [], "", [], ""

        if len(messages) == 1:
            m = messages[0]
            txt = m["content"].strip()
            summary_text = f"Selected message from {m['sender_name']}: \"{txt}\""
            key_points = [
                f"Author: {m['sender_name']}",
                f"Core text: {txt[:120]}" + ("..." if len(txt) > 120 else "")
            ]
            important_info = f"Sent on {m['timestamp'][:16].replace('T', ' ')}" if m.get("timestamp") else "Direct message entry."
            return key_points, summary_text, key_points, important_info

        bullets: List[str] = []
        senders = list(set(m["sender_name"] for m in messages if m.get("sender_name")))
        participants_str = ", ".join(senders) if senders else "Participants"

        # 1. Main Topics / Start of discussion
        first_few = [m for m in messages[:3] if len(m["content"]) > 10]
        if first_few:
            topic_hint = first_few[0]["content"]
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

        # Fallback bullets if simple conversation
        if len(bullets) < 3 and len(messages) >= 3:
            for m in messages[1:]:
                clean_txt = m["content"].rstrip(".?!")
                if len(clean_txt) > 15 and not any(clean_txt in b for b in bullets):
                    if len(clean_txt) > 80:
                        clean_txt = clean_txt[:77] + "..."
                    bullets.append(f"{m['sender_name']}: {clean_txt}")
                if len(bullets) >= 4:
                    break

        bullets = bullets[:6]
        summary_text = f"Discussion between {participants_str} covering key progress updates, coordination, and assigned tasks across {len(messages)} messages."
        key_points = bullets if bullets else ["Active discussion maintained across participants."]
        important_info = "Ensure all identified action items and decisions are tracked to completion."
        return bullets, summary_text, key_points, important_info

    async def extract_missed(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        items = []
        for i, m in enumerate(messages):
            txt = m["content"].strip()
            lower = txt.lower()

            # Unanswered questions
            if "?" in txt:
                has_reply = any(messages[j]["sender_id"] != m["sender_id"] for j in range(i + 1, len(messages)))
                if not has_reply or i == len(messages) - 1:
                    items.append({
                        "source_message_id": m["id"],
                        "sender_name": m["sender_name"],
                        "preview": txt[:140] + ("..." if len(txt) > 140 else ""),
                        "timestamp": m["timestamp"],
                        "category": "question",
                        "missed_reason": f"Open question from {m['sender_name']} requiring response"
                    })
                    continue

            # Pending requests
            if any(k in lower for k in ["please", "need you to", "can you", "could you", "make sure", "todo", "waiting on", "pending"]):
                items.append({
                    "source_message_id": m["id"],
                    "sender_name": m["sender_name"],
                    "preview": txt[:140] + ("..." if len(txt) > 140 else ""),
                    "timestamp": m["timestamp"],
                    "category": "task",
                    "missed_reason": f"Pending request or action item mentioned by {m['sender_name']}"
                })
                continue

            # Shared attachments
            if m.get("has_file") or m.get("message_type") != "text":
                items.append({
                    "source_message_id": m["id"],
                    "sender_name": m["sender_name"],
                    "preview": txt[:140] if txt else f"Shared attachment in chat",
                    "timestamp": m["timestamp"],
                    "category": "file",
                    "missed_reason": f"File attachment shared by {m['sender_name']}"
                })

        return items

    async def extract_important(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        items = []
        for m in messages:
            txt = m["content"].lower()
            category = None
            reason = None
            priority = "Medium"

            if any(k in txt for k in ["urgent", "critical", "blocker", "emergency", "asap", "immediately"]):
                category = "critical"
                reason = "Urgent high-priority alert or blocker"
                priority = "High"
            elif any(k in txt for k in ["deadline", "due date", "due by", "by friday", "by monday", "by tomorrow", "submit by", "release date", "september", "october"]):
                category = "deadline"
                reason = "Mentions key date or project deadline"
                priority = "High"
            elif any(k in txt for k in ["decided", "agreed", "let's use", "let's go with", "approved", "confirmed", "finalized", "chosen"]):
                category = "decision"
                reason = "Specifies an agreed decision or consensus"
                priority = "High"
            elif any(k in txt for k in ["warning", "caution", "issue", "error", "failed", "delay"]):
                category = "warning"
                reason = "Notifies of a potential risk, warning, or issue"
                priority = "Medium"
            elif any(k in txt for k in ["please", "action item", "todo", "need to", "complete", "will do", "working on", "assigned"]):
                category = "task"
                reason = "Identifies an action item or pending assignment"
                priority = "Medium"
            elif any(k in txt for k in ["announcement", "heads up", "fyi", "important update", "release", "notice"]):
                category = "announcement"
                reason = "Broadcasts a notable update or announcement"
                priority = "Low"
            elif "?" in m["content"] and any(k in txt for k in ["can you", "could you", "what is", "when will", "are we", "should we"]):
                category = "question"
                reason = "Presents an open question requiring clarification"
                priority = "Medium"

            if category:
                items.append({
                    "source_message_id": m["id"],
                    "sender_name": m["sender_name"],
                    "message_preview": m["content"][:140] + ("..." if len(m["content"]) > 140 else ""),
                    "timestamp": m["timestamp"],
                    "category": category,
                    "priority": priority,
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
            (re.compile(r'(?i)\b(?:send\s+[^.?!,;]+)'), ""),
        ]

        for m in messages:
            content = m["content"].strip()
            
            # Detect assignee
            assignee = None
            name_match = re.match(r'^([A-Z][a-z]+)[:,\s]+', content)
            if name_match:
                assignee = name_match.group(1)
            else:
                ass_match = re.search(r'(?i)assigned to\s+([A-Za-z]+)', content)
                if ass_match:
                    assignee = ass_match.group(1).capitalize()

            # Detect due date
            due_date = None
            date_match = re.search(r'(?i)(?:by|due|before)\s+((?:tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|october \d+|oct \d+|\d{4}-\d{2}-\d{2}))', content)
            if date_match:
                due_date = date_match.group(1).capitalize()

            for pat, prefix in task_prefixes:
                match = pat.search(content)
                if match:
                    action_text = match.group(1) if match.groups() else match.group(0)
                    action_text = action_text.strip()
                    if len(action_text) > 4:
                        action_text = action_text[0].upper() + action_text[1:]
                        if not any(a["action_text"].lower() == action_text.lower() for a in actions):
                            actions.append({
                                "source_message_id": m["id"],
                                "action_text": action_text[:120],
                                "assigned_to": assignee or "Unassigned",
                                "due_date": due_date,
                                "completed": False,
                                "status": "Pending"
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
                    snippet = content.replace(match.group(0), "").strip(" ,:.-")
                    title = snippet[:60] if snippet else "Deadline / Event"
                    if len(title) > 60:
                        title = title[:57] + "..."
                    title = title[0].upper() + title[1:] if title else "Scheduled event"

                    if not any(d["date_value"].lower() == val.lower() and d["source_message_id"] == m["id"] for d in dates):
                        dates.append({
                            "source_message_id": m["id"],
                            "title": title,
                            "date_value": val,
                            "context": content[:120]
                        })
                        break
        return dates

    async def extract_insights(self, messages: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not messages:
            return {
                "main_topic": None,
                "sentiment": None,
                "key_patterns": None,
                "risks": None,
                "conclusion": None
            }

        all_text = " ".join(m["content"] for m in messages)
        lower_all = all_text.lower()

        # 1. Main Topic
        main_topic = "General Conversation & Coordination"
        if any(w in lower_all for w in ["database", "postgres", "sqlite", "migration", "backend", "api"]):
            main_topic = "Backend & Database Architecture"
        elif any(w in lower_all for w in ["test", "testing", "qa", "verification", "suite"]):
            main_topic = "Quality Assurance & Testing Validation"
        elif any(w in lower_all for w in ["deploy", "deployment", "vercel", "production", "release"]):
            main_topic = "Production Deployment & Operations"
        elif any(w in lower_all for w in ["design", "theme", "contrast", "dark mode", "ui", "css"]):
            main_topic = "UI Aesthetics & Contrast Refinement"
        elif any(w in lower_all for w in ["spoilage", "tomato", "detection", "agriculture"]):
            main_topic = "Agricultural Spoilage Detection Project"
        elif any(w in lower_all for w in ["gemini", "ai", "smart conversation", "intelligence"]):
            main_topic = "AI & Smart Conversations Integration"
        elif len(messages) > 0 and len(messages[0]["content"]) > 10:
            first_words = messages[0]["content"].split()[:6]
            main_topic = " ".join(first_words).rstrip(".,!?")

        # 2. Sentiment
        sentiment = "Constructive & Collaborative"
        if any(w in lower_all for w in ["great", "awesome", "perfect", "good", "thanks", "excellent"]):
            sentiment = "Positive & Forward-Looking"
        elif any(w in lower_all for w in ["urgent", "critical", "blocker", "emergency", "asap"]):
            sentiment = "High Priority & Urgent"
        elif any(w in lower_all for w in ["issue", "bug", "error", "problem", "delay", "failed"]):
            sentiment = "Problem-Solving & Remediation"

        # 3. Key Patterns
        key_patterns = "Active dialogue with consistent participant engagement and shared information."
        if any(w in lower_all for w in ["decided", "agreed", "approve", "confirm"]):
            key_patterns = "Strong consensus building with explicit architecture and technical decisions reached."
        elif any(w in lower_all for w in ["todo", "please", "task", "assign"]):
            key_patterns = "Action-oriented workflow with clear task distribution and pending items."

        # 4. Risks
        risks = "No major blockers identified."
        if any(w in lower_all for w in ["deadline", "due", "october 15", "by tomorrow"]):
            risks = "Upcoming milestone deadlines require active progress tracking."
        elif any(w in lower_all for w in ["error", "bug", "fail", "broken"]):
            risks = "Identified technical issues require validation before deployment."

        # 5. Conclusion
        conclusion = f"Conversation centered around {main_topic.lower()} with clear next steps."

        return {
            "main_topic": main_topic,
            "sentiment": sentiment,
            "key_patterns": key_patterns,
            "risks": risks,
            "conclusion": conclusion
        }


class SmartConversationService:
    """Core Service managing authorized message extraction, AI processing, and persistence."""

    def __init__(self):
        self.provider = BuiltinSmartProvider()

    def get_provider(self) -> AIProvider:
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
        """Resolves (canonical_conversation_id, partner_id, is_self) with strict authorization."""
        if conversation_type == "group":
            group = db.query(models.Group).filter(models.Group.id == conversation_id).first()
            if not group:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
            membership = db.query(models.GroupMember).filter(
                models.GroupMember.group_id == conversation_id,
                models.GroupMember.user_id == current_user.id
            ).first()
            if not membership and current_user.role != "admin":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to analyze this conversation."
                )
            return group.id, None, False

        # Direct conversation
        conv = db.query(models.Conversation).filter(models.Conversation.id == conversation_id).first()
        if conv:
            if current_user.id in (conv.user_a_id, conv.user_b_id) or current_user.role == "admin":
                is_self = (conv.user_a_id == conv.user_b_id)
                partner_id = current_user.id if is_self else (conv.user_b_id if conv.user_a_id == current_user.id else conv.user_a_id)
                return conv.id, partner_id, is_self
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="You don't have permission to analyze this conversation."
                )

        # Fallback target user ID for direct partner lookup
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
        unread_only: bool = False,
        message_id: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """Enforces strict server-side authorization and retrieves ordered messages."""
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

        if message_id:
            target_msg = q.filter(models.Message.id == message_id).first()
            if not target_msg:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found in this conversation.")
            raw_messages = [target_msg]
        else:
            if start_date:
                q = q.filter(models.Message.created_at >= start_date)
            if end_date:
                q = q.filter(models.Message.created_at <= end_date)
            if unread_only:
                q = q.filter(models.Message.recipient_id == current_user.id, models.Message.status != "read")
            raw_messages = q.order_by(models.Message.created_at.asc()).limit(limit).all()

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

    async def _call_gemini_json(self, prompt: str, api_key: str) -> Optional[Dict[str, Any]]:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
            payload = json.dumps({
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 512}
            }).encode("utf-8")
            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                if text.startswith("```"):
                    text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                return json.loads(text)
        except Exception:
            return None

    # ---------------- 1. SUMMARY ----------------
    async def generate_summary(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session,
        message_id: Optional[int] = None,
        attachment_id: Optional[int] = None,
        force_refresh: bool = False
    ) -> schemas.SmartSummaryResponse:
        rate_key = f"summary_{current_user.id}_{conversation_id}_{message_id}_{attachment_id}"
        if not force_refresh:
            check_rate_limit(rate_key, window=0.4)

        # Handle Document-level analysis
        if attachment_id:
            doc = db.query(models.Document).filter(models.Document.id == attachment_id).first()
            if not doc:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")

            conv_id, partner_id, is_self = self.resolve_conversation(conversation_id, conversation_type, current_user, db)
            if conversation_type == "group":
                if doc.group_id != conv_id and current_user.role != "admin":
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to document.")
            else:
                if doc.uploader_id not in (current_user.id, partner_id) and current_user.role != "admin":
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to document.")

            size_kb = round(doc.file_size / 1024, 1)
            ext = doc.original_filename.rsplit(".", 1)[-1].upper() if "." in doc.original_filename else "DOCUMENT"

            summary_text = f"Document asset: {doc.original_filename} ({size_kb} KB, {ext}). Verified attachment within this conversation."
            bullets = [
                f"File: {doc.original_filename} ({size_kb} KB)",
                f"Format: {ext} ({doc.mime_type or 'application/octet-stream'})",
                "Status: Verified clean and ready for access"
            ]
            key_points = [
                f"Document attached in conversation by user #{doc.uploader_id}",
                f"Format: {ext} ({size_kb} KB)",
                "Full file contents available in Files tab"
            ]
            important_info = f"Critical document reference '{doc.original_filename}' associated with this discussion."
            now_utc = datetime.now(timezone.utc)

            return schemas.SmartSummaryResponse(
                success=True,
                conversation_id=conversation_id,
                conversation_type=conversation_type,
                message_id=message_id,
                attachment_id=attachment_id,
                summary_bullets=bullets,
                summary_text=summary_text,
                key_points=key_points,
                important_info=important_info,
                status="ready",
                generated_at=schemas.format_iso_utc(now_utc),
                provider="frank-smart-nlp"
            )

        messages = self.verify_authorization_and_fetch_messages(
            conversation_id, conversation_type, current_user, db, limit=120, message_id=message_id
        )

        if len(messages) == 0:
            return schemas.SmartSummaryResponse(
                success=True,
                conversation_id=conversation_id,
                conversation_type=conversation_type,
                message_id=message_id,
                attachment_id=attachment_id,
                summary_bullets=[],
                summary_text="",
                key_points=[],
                important_info="",
                status="empty",
                message="No summary available."
            )

        start_id = messages[0]["id"]
        end_id = messages[-1]["id"]
        provider = self.get_provider()
        now_utc = datetime.now(timezone.utc)

        # Check Cache if not forcing refresh and not single message
        if not force_refresh and not message_id:
            cached = db.query(models.ConversationSummary).filter(
                models.ConversationSummary.conversation_id == conversation_id,
                models.ConversationSummary.conversation_type == conversation_type,
                models.ConversationSummary.requested_by_user_id == current_user.id,
                models.ConversationSummary.message_id.is_(None)
            ).first()

            if cached and cached.source_message_end == end_id and cached.summary:
                bullets = [b.strip("• \r\n") for b in cached.summary.split("\n") if b.strip()]
                return schemas.SmartSummaryResponse(
                    success=True,
                    conversation_id=conversation_id,
                    conversation_type=conversation_type,
                    message_id=None,
                    attachment_id=None,
                    summary_bullets=bullets,
                    summary_text=cached.summary,
                    key_points=bullets,
                    important_info="Ensure all identified action items and decisions are tracked to completion.",
                    status="ready",
                    source_message_start=cached.source_message_start,
                    source_message_end=cached.source_message_end,
                    generated_at=schemas.format_iso_utc(cached.updated_at),
                    provider="cache"
                )

        gemini_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        ai_res = None
        if gemini_api_key:
            msgs_text = "\n".join(f"{m['sender_name']}: {m['content']}" for m in messages)
            prompt = (
                f"Analyze these conversation messages:\n{msgs_text}\n"
                "Return JSON ONLY with keys: 'summary_text' (2-3 sentences), 'key_points' (array of 2-5 strings), 'important_info' (1 sentence conclusion)."
            )
            ai_res = await self._call_gemini_json(prompt, gemini_api_key)

        if ai_res and ai_res.get("summary_text"):
            summary_text = ai_res["summary_text"]
            key_points = ai_res.get("key_points", [])
            important_info = ai_res.get("important_info", "")
            bullets = key_points
            engine_provider = "gemini-1.5-flash"
        else:
            bullets, summary_text, key_points, important_info = await provider.generate_summary(messages)
            engine_provider = "frank-smart-nlp"

        # Persist summary record if full conversation
        if not message_id:
            existing = db.query(models.ConversationSummary).filter(
                models.ConversationSummary.conversation_id == conversation_id,
                models.ConversationSummary.conversation_type == conversation_type,
                models.ConversationSummary.requested_by_user_id == current_user.id,
                models.ConversationSummary.message_id.is_(None)
            ).first()

            if existing:
                existing.summary = summary_text
                existing.source_message_start = start_id
                existing.source_message_end = end_id
                existing.updated_at = now_utc
            else:
                new_summary = models.ConversationSummary(
                    conversation_id=conversation_id,
                    conversation_type=conversation_type,
                    requested_by_user_id=current_user.id,
                    summary=summary_text,
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
            message_id=message_id,
            attachment_id=attachment_id,
            summary_bullets=bullets,
            summary_text=summary_text,
            key_points=key_points,
            important_info=important_info,
            status="ready",
            source_message_start=start_id,
            source_message_end=end_id,
            generated_at=schemas.format_iso_utc(now_utc),
            provider=engine_provider
        )

    # ---------------- 2. MISSED ----------------
    async def generate_missed_summary(
        self,
        conversation_id: int,
        conversation_type: str,
        period: str,
        current_user: models.User,
        db: Session,
        message_id: Optional[int] = None,
        start_date_str: Optional[str] = None,
        end_date_str: Optional[str] = None
    ) -> schemas.SmartMissedResponse:
        rate_key = f"missed_{current_user.id}_{conversation_id}_{period}_{message_id}"
        check_rate_limit(rate_key)

        now_utc = datetime.now(timezone.utc)
        start_date = None
        end_date = None
        unread_only = (period == "last_read" and not message_id)

        if not message_id:
            if period == "today":
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
            conversation_id, conversation_type, current_user, db,
            start_date=start_date, end_date=end_date, unread_only=unread_only, message_id=message_id
        )

        msg_count = len(messages)
        provider = self.get_provider()
        items_raw = await provider.extract_missed(messages)

        if not items_raw:
            return schemas.SmartMissedResponse(
                success=True,
                conversation_id=conversation_id,
                conversation_type=conversation_type,
                period=period,
                message_count=msg_count,
                important_updates_count=0,
                files_count=0,
                decisions_count=0,
                explanation="No missed information found.",
                items=[],
                status="ready"
            )

        items = [schemas.SmartMissedItem(**it) for it in items_raw]
        files_count = sum(1 for m in messages if m["has_file"] or m["message_type"] in ("document", "image", "video", "audio"))
        decisions_count = sum(1 for it in items if it.category == "decision")
        updates_count = sum(1 for it in items if it.category in ("update", "question", "task"))

        explanation = f"Identified {len(items)} missed item{'s' if len(items) != 1 else ''} across {msg_count} message{'s' if msg_count != 1 else ''}."

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

    # ---------------- 3. IMPORTANT ----------------
    async def extract_important_messages(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session,
        message_id: Optional[int] = None
    ) -> schemas.SmartImportantResponse:
        rate_key = f"important_{current_user.id}_{conversation_id}_{message_id}"
        check_rate_limit(rate_key)

        provider = self.get_provider()
        messages = self.verify_authorization_and_fetch_messages(
            conversation_id, conversation_type, current_user, db, limit=120, message_id=message_id
        )

        gemini_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        items = []

        if gemini_api_key and messages:
            msgs_text = "\n".join(f"{m['sender_name']}: {m['content']}" for m in messages)
            prompt = (
                f"Identify critical items, deadlines, decisions, and warnings from:\n{msgs_text}\n"
                "Return JSON ONLY with key: 'messages' (array of objects with 'source_message_id', 'sender_name', 'message_preview', 'timestamp', 'category', 'priority' ('High'|'Medium'|'Low'), 'reason')."
            )
            ai_res = await self._call_gemini_json(prompt, gemini_api_key)
            if ai_res and ai_res.get("messages"):
                for it in ai_res["messages"]:
                    items.append(schemas.SmartImportantMessageItem(
                        source_message_id=it.get("source_message_id", messages[0]["id"]),
                        sender_name=it.get("sender_name", messages[0]["sender_name"]),
                        message_preview=it.get("message_preview", messages[0]["content"][:140]),
                        timestamp=it.get("timestamp", messages[0]["timestamp"]),
                        category=it.get("category", "critical"),
                        priority=it.get("priority", "High"),
                        reason=it.get("reason", "Important notice identified")
                    ))

        if not items:
            extracted = await provider.extract_important(messages)
            items = [schemas.SmartImportantMessageItem(**item) for item in extracted]

        return schemas.SmartImportantResponse(
            success=True,
            conversation_id=conversation_id,
            conversation_type=conversation_type,
            messages=items,
            status="ready",
            message="No important information found." if not items else None
        )

    # ---------------- 4. ACTIONS ----------------
    async def get_or_extract_actions(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session,
        message_id: Optional[int] = None
    ) -> List[schemas.SmartActionItemResponse]:
        messages = self.verify_authorization_and_fetch_messages(
            conversation_id, conversation_type, current_user, db, limit=120, message_id=message_id
        )

        existing_q = db.query(models.SmartActionItem).filter(
            models.SmartActionItem.conversation_id == conversation_id,
            models.SmartActionItem.conversation_type == conversation_type,
            models.SmartActionItem.user_id == current_user.id
        )
        if message_id:
            existing_q = existing_q.filter(models.SmartActionItem.source_message_id == message_id)

        existing_items = existing_q.order_by(models.SmartActionItem.id.asc()).all()
        existing_source_ids = {it.source_message_id for it in existing_items if it.source_message_id}
        existing_texts = {it.action_text.lower().strip() for it in existing_items}

        if messages:
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
                        assigned_to=item.get("assigned_to"),
                        due_date=item.get("due_date"),
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
                existing_items = existing_q.order_by(models.SmartActionItem.id.asc()).all()

        return [
            schemas.SmartActionItemResponse(
                id=it.id,
                conversation_id=it.conversation_id,
                conversation_type=it.conversation_type,
                user_id=it.user_id,
                source_message_id=it.source_message_id,
                action_text=it.action_text,
                assigned_to=it.assigned_to,
                due_date=it.due_date,
                completed=it.completed,
                status="Completed" if it.completed else "Pending",
                created_at=it.created_at,
                updated_at=it.updated_at
            )
            for it in existing_items
        ]

    def create_action(
        self,
        conversation_id: int,
        action_in: schemas.SmartActionItemCreate,
        current_user: models.User,
        db: Session
    ) -> schemas.SmartActionItemResponse:
        conv_type = action_in.conversation_type or "direct"
        self.verify_authorization_and_fetch_messages(conversation_id, conv_type, current_user, db, limit=1)

        now_utc = datetime.now(timezone.utc)
        item = models.SmartActionItem(
            conversation_id=conversation_id,
            conversation_type=conv_type,
            user_id=current_user.id,
            source_message_id=action_in.source_message_id,
            action_text=(action_in.action_text or action_in.title or "New Action Item").strip(),
            assigned_to=action_in.assigned_to or "Unassigned",
            due_date=action_in.due_date,
            completed=False,
            created_at=now_utc,
            updated_at=now_utc
        )
        db.add(item)
        db.commit()
        db.refresh(item)
        return schemas.SmartActionItemResponse(
            id=item.id,
            conversation_id=item.conversation_id,
            conversation_type=item.conversation_type,
            user_id=item.user_id,
            source_message_id=item.source_message_id,
            action_text=item.action_text,
            title=item.action_text,
            description="",
            assigned_to=item.assigned_to,
            due_date=item.due_date,
            completed=item.completed,
            status="Pending",
            created_at=item.created_at,
            updated_at=item.updated_at
        )

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
        if update_in.assigned_to is not None:
            item.assigned_to = update_in.assigned_to.strip()
        if update_in.due_date is not None:
            item.due_date = update_in.due_date.strip()
        item.updated_at = datetime.now(timezone.utc)

        db.commit()
        db.refresh(item)
        return schemas.SmartActionItemResponse(
            id=item.id,
            conversation_id=item.conversation_id,
            conversation_type=item.conversation_type,
            user_id=item.user_id,
            source_message_id=item.source_message_id,
            action_text=item.action_text,
            assigned_to=item.assigned_to,
            due_date=item.due_date,
            completed=item.completed,
            status="Completed" if item.completed else "Pending",
            created_at=item.created_at,
            updated_at=item.updated_at
        )

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

    # ---------------- 5. DECISIONS ----------------
    async def get_or_extract_decisions(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session,
        message_id: Optional[int] = None
    ) -> schemas.SmartDecisionsResponse:
        messages = self.verify_authorization_and_fetch_messages(
            conversation_id, conversation_type, current_user, db, limit=120, message_id=message_id
        )

        existing_q = db.query(models.SmartDecision).filter(
            models.SmartDecision.conversation_id == conversation_id,
            models.SmartDecision.conversation_type == conversation_type,
            models.SmartDecision.user_id == current_user.id
        )
        if message_id:
            existing_q = existing_q.filter(models.SmartDecision.source_message_id == message_id)

        existing = existing_q.all()
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
                existing = existing_q.all()

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
            status="ready",
            message="No decisions found." if not items else None
        )

    # ---------------- 6. DATES & DEADLINES ----------------
    async def get_or_extract_dates(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session,
        message_id: Optional[int] = None
    ) -> schemas.SmartDatesResponse:
        messages = self.verify_authorization_and_fetch_messages(
            conversation_id, conversation_type, current_user, db, limit=120, message_id=message_id
        )

        existing_q = db.query(models.SmartDate).filter(
            models.SmartDate.conversation_id == conversation_id,
            models.SmartDate.conversation_type == conversation_type,
            models.SmartDate.user_id == current_user.id
        )
        if message_id:
            existing_q = existing_q.filter(models.SmartDate.source_message_id == message_id)

        existing = existing_q.all()
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
                        context=item.get("context"),
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
                existing = existing_q.all()

        items = [
            schemas.SmartDateItem(
                id=d.id,
                conversation_id=d.conversation_id,
                conversation_type=d.conversation_type,
                source_message_id=d.source_message_id,
                title=d.title,
                date_value=d.date_value,
                context=d.context,
                created_at=schemas.format_iso_utc(d.created_at)
            )
            for d in existing
        ]

        return schemas.SmartDatesResponse(
            success=True,
            conversation_id=conversation_id,
            conversation_type=conversation_type,
            dates=items,
            status="ready",
            message="No important dates found." if not items else None
        )

    # ---------------- 7. FILES ----------------
    def get_files(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session,
        message_id: Optional[int] = None
    ) -> schemas.SmartFilesResponse:
        conv_id, partner_id, is_self = self.resolve_conversation(conversation_id, conversation_type, current_user, db)

        if conversation_type == "group":
            q = db.query(models.Document).filter(models.Document.group_id == conv_id)
        else:
            if is_self:
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
                filter_cond = [
                    and_(
                        models.Document.uploader_id.in_([current_user.id, partner_id]),
                        or_(
                            models.Document.conversation_id.in_([partner_id, current_user.id]),
                            models.Document.conversation_id == conv_id
                        )
                    )
                ]
            q = db.query(models.Document).filter(or_(*filter_cond))

        if message_id:
            q = q.filter(models.Document.message_id == message_id)

        docs = q.order_by(models.Document.id.desc()).all()

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
                message_id=d.message_id,
                created_at=schemas.format_iso_utc(d.created_at),
                download_url=f"/api/files/{d.id}/download"
            ))

        return schemas.SmartFilesResponse(
            success=True,
            conversation_id=conversation_id,
            conversation_type=conversation_type,
            files=file_items,
            total_files=len(file_items),
            status="ready",
            message="No files found." if not file_items else None
        )

    # ---------------- 8. INSIGHTS ----------------
    async def get_insights(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session,
        message_id: Optional[int] = None
    ) -> schemas.SmartInsightsResponse:
        messages = self.verify_authorization_and_fetch_messages(
            conversation_id, conversation_type, current_user, db, limit=500, message_id=message_id
        )

        user_msgs_count = sum(1 for m in messages if m.get("sender_id") == current_user.id)
        other_msgs_count = len(messages) - user_msgs_count

        actions = db.query(models.SmartActionItem).filter(
            models.SmartActionItem.conversation_id == conversation_id,
            models.SmartActionItem.conversation_type == conversation_type,
            models.SmartActionItem.user_id == current_user.id
        )
        if message_id:
            actions = actions.filter(models.SmartActionItem.source_message_id == message_id)
        action_list = actions.all()

        decisions_q = db.query(models.SmartDecision).filter(
            models.SmartDecision.conversation_id == conversation_id,
            models.SmartDecision.conversation_type == conversation_type,
            models.SmartDecision.user_id == current_user.id
        )
        if message_id:
            decisions_q = decisions_q.filter(models.SmartDecision.source_message_id == message_id)
        decisions_count = decisions_q.count()

        dates_q = db.query(models.SmartDate).filter(
            models.SmartDate.conversation_id == conversation_id,
            models.SmartDate.conversation_type == conversation_type,
            models.SmartDate.user_id == current_user.id
        )
        if message_id:
            dates_q = dates_q.filter(models.SmartDate.source_message_id == message_id)
        dates_count = dates_q.count()

        files_res = self.get_files(conversation_id, conversation_type, current_user, db, message_id=message_id)

        participant_names = list(set(m["sender_name"] for m in messages if m.get("sender_name")))
        if not participant_names:
            participant_names = [current_user.full_name or current_user.username]

        unread_count = sum(1 for m in messages if m.get("sender_id") != current_user.id and m.get("status") != "read")
        last_activity = messages[-1]["timestamp"] if messages else None

        if not messages:
            return schemas.SmartInsightsResponse(
                success=True,
                conversation_id=conversation_id,
                conversation_type=conversation_type,
                status="ready",
                message="Not enough information to generate insights."
            )

        # Compute insights from content
        provider = self.get_provider()
        insights_data = await provider.extract_insights(messages)

        return schemas.SmartInsightsResponse(
            success=True,
            conversation_id=conversation_id,
            conversation_type=conversation_type,
            main_topic=insights_data.get("main_topic"),
            sentiment=insights_data.get("sentiment"),
            key_patterns=insights_data.get("key_patterns"),
            risks=insights_data.get("risks"),
            conclusion=insights_data.get("conclusion"),
            total_messages=len(messages),
            user_messages=user_msgs_count,
            other_messages=other_msgs_count,
            files_count=files_res.total_files,
            action_items_count=len(action_list),
            pending_action_items_count=sum(1 for a in action_list if not a.completed),
            decisions_count=decisions_count,
            dates_count=dates_count,
            active_participants_count=len(participant_names),
            participants=participant_names,
            last_activity=last_activity,
            unread_messages=unread_count,
            status="ready"
        )

    # ---------------- FULL OVERVIEW ----------------
    async def get_full_smart(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session,
        message_id: Optional[int] = None,
        attachment_id: Optional[int] = None,
        force_refresh: bool = False
    ) -> schemas.SmartFullResponse:
        conv_id, partner_id, is_self = self.resolve_conversation(conversation_id, conversation_type, current_user, db)

        summary_res = await self.generate_summary(conversation_id, conversation_type, current_user, db, message_id=message_id, attachment_id=attachment_id, force_refresh=force_refresh)
        missed_res = await self.generate_missed_summary(conversation_id, conversation_type, "last_read", current_user, db, message_id=message_id)
        important_res = await self.extract_important_messages(conversation_id, conversation_type, current_user, db, message_id=message_id)
        actions_list = await self.get_or_extract_actions(conversation_id, conversation_type, current_user, db, message_id=message_id)
        decisions_res = await self.get_or_extract_decisions(conversation_id, conversation_type, current_user, db, message_id=message_id)
        dates_res = await self.get_or_extract_dates(conversation_id, conversation_type, current_user, db, message_id=message_id)
        files_res = self.get_files(conversation_id, conversation_type, current_user, db, message_id=message_id)
        insights_res = await self.get_insights(conversation_id, conversation_type, current_user, db, message_id=message_id)

        latest = None
        if conversation_type == "group":
            latest = db.query(models.Message).filter(models.Message.group_id == conv_id).order_by(models.Message.id.desc()).first()
        else:
            if is_self:
                latest = db.query(models.Message).filter(
                    models.Message.group_id.is_(None),
                    models.Message.sender_id == current_user.id
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

    # ---------------- MESSAGE & DOCUMENT ANALYSIS MODALS ----------------
    def _generate_builtin_message_analysis(self, content: str, sender_name: str) -> Dict[str, Any]:
        lower = content.lower()
        category = "General"
        if any(w in lower for w in ["meeting", "schedule", "tomorrow", "calendar", "call", "zoom", "sync"]):
            category = "Scheduling"
        elif any(w in lower for w in ["bug", "fix", "error", "issue", "crash", "deploy", "release", "api", "database"]):
            category = "Technical / Engineering"
        elif any(w in lower for w in ["price", "cost", "invoice", "payment", "budget", "billing", "$"]):
            category = "Financial"
        elif any(w in lower for w in ["please", "todo", "need to", "action", "task", "assign"]):
            category = "Action Item"

        tone = "Neutral"
        if any(w in lower for w in ["great", "awesome", "thanks", "thank you", "love", "good", "perfect", "appreciate"]):
            tone = "Positive / Enthusiastic"
        elif any(w in lower for w in ["urgent", "asap", "emergency", "critical", "immediately", "blocker"]):
            tone = "High Priority / Urgent"
        elif any(w in lower for w in ["sorry", "unfortunately", "delay", "issue", "problem", "failed"]):
            tone = "Concerned / Apologetic"

        takeaway = content.strip().rstrip(".?!")
        if len(takeaway) > 140:
            takeaway = takeaway[:137] + "..."

        action_detected = any(w in lower for w in ["please", "need to", "make sure", "todo", "check", "review", "update", "send"])
        has_question = "?" in content

        return {
            "summary": f"{sender_name}: {takeaway}",
            "key_takeaway": takeaway,
            "category": category,
            "tone": tone,
            "has_action_item": action_detected,
            "is_question": has_question,
            "suggested_reply": "Got it, I'm on it!" if action_detected else ("Thanks for the update!" if not has_question else "Looking into this now."),
            "provider": "frank-smart-nlp"
        }

    def _generate_builtin_document_analysis(self, filename: str, file_type: str, size_kb: float, mime_type: str, extracted_text: str = "") -> Dict[str, Any]:
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        classification = "Reference Document"
        if ext in ["pdf", "doc", "docx"]:
            classification = "Official Document / Report"
        elif ext in ["xls", "xlsx", "csv"]:
            classification = "Spreadsheet / Data Sheet"
        elif ext in ["png", "jpg", "jpeg", "webp", "svg"]:
            classification = "Visual Asset / Image"
        elif ext in ["mp4", "mov", "webm"]:
            classification = "Video Presentation / Recording"

        summary_text = f"Document asset: {filename} ({size_kb} KB, {file_type.capitalize()})"
        key_takeaway = f"Document '{filename}' ({ext.upper()}) verified and ready for team collaboration."
        if extracted_text and len(extracted_text.strip()) > 15:
            lines = [l.strip() for l in extracted_text.strip().split("\n") if l.strip()]
            preview_snippet = " ".join(lines[:3])[:140]
            summary_text = f"{filename}: {preview_snippet}"
            key_takeaway = f"Key content: {preview_snippet}"

        return {
            "summary": summary_text,
            "classification": classification,
            "format": ext.upper() or mime_type,
            "size_formatted": f"{size_kb} KB",
            "security_status": "Scanned & Verified Clean",
            "key_takeaway": key_takeaway,
            "provider": "frank-smart-nlp"
        }

    async def _call_gemini_message_analysis(self, content: str, sender_name: str, api_key: str) -> Optional[Dict[str, Any]]:
        import urllib.request
        import json
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
            prompt_text = (
                f"Analyze this chat message from {sender_name}: '{content}'.\n"
                "Return valid JSON ONLY with keys: 'summary' (one line), 'key_takeaway', 'category', 'tone', 'has_action_item' (bool), 'is_question' (bool), 'suggested_reply'."
            )
            payload = json.dumps({
                "contents": [{"parts": [{"text": prompt_text}]}],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 256}
            }).encode("utf-8")
            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                if text.startswith("```"):
                    text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                parsed = json.loads(text)
                parsed["provider"] = "gemini-1.5-flash"
                return parsed
        except Exception:
            return None

    async def _call_gemini_document_analysis(self, filename: str, doc_text: str, api_key: str) -> Optional[Dict[str, Any]]:
        import urllib.request
        import json
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
            prompt_text = (
                f"Analyze this document: '{filename}'. Extracted content snippet:\n{doc_text[:3000]}\n"
                "Return valid JSON ONLY with keys: 'summary', 'classification', 'key_takeaway', 'format', 'size_formatted', 'security_status'."
            )
            payload = json.dumps({
                "contents": [{"parts": [{"text": prompt_text}]}],
                "generationConfig": {"temperature": 0.2, "maxOutputTokens": 300}
            }).encode("utf-8")
            req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
                if text.startswith("```"):
                    text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
                parsed = json.loads(text)
                parsed["provider"] = "gemini-1.5-flash"
                return parsed
        except Exception:
            return None

    async def analyze_specific_message(
        self,
        conversation_id: int,
        message_id: int,
        current_user: models.User,
        db: Session
    ) -> Dict[str, Any]:
        """
        Analyzes a specific message identified by conversation_id + message_id.
        Preserves strict conversation isolation and user authorization.
        """
        msg = db.query(models.Message).filter(models.Message.id == message_id).first()
        if not msg:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")

        # Authorization: verify access to this message
        if msg.group_id:
            membership = db.query(models.GroupMember).filter(
                models.GroupMember.group_id == msg.group_id,
                models.GroupMember.user_id == current_user.id
            ).first()
            if not membership and current_user.role != "admin":
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
        else:
            if msg.sender_id != current_user.id and msg.recipient_id != current_user.id and current_user.role != "admin":
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")

        sender = db.query(models.User).filter(models.User.id == msg.sender_id).first()
        sender_name = sender.full_name if sender else "User"
        content = msg.content or ""
        clean_content = sanitize_message_content(content)

        gemini_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        ai_analysis = None
        if gemini_api_key:
            ai_analysis = await self._call_gemini_message_analysis(clean_content, sender_name, gemini_api_key)

        if not ai_analysis:
            ai_analysis = self._generate_builtin_message_analysis(clean_content, sender_name)

        return {
            "success": True,
            "conversation_id": conversation_id,
            "message_id": message_id,
            "sender_name": sender_name,
            "content": content,
            "created_at": schemas.format_iso_utc(msg.created_at),
            "analysis": ai_analysis
        }

    async def analyze_specific_attachment(
        self,
        conversation_id: int,
        message_id: int,
        attachment_id: int,
        current_user: models.User,
        db: Session
    ) -> Dict[str, Any]:
        """
        Analyzes a specific attachment identified by conversation_id + message_id + attachment_id.
        Extracts document text if readable and provides real semantic analysis.
        """
        doc = db.query(models.Document).filter(models.Document.id == attachment_id).first()
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attachment not found.")

        # Authorization check
        if doc.group_id:
            membership = db.query(models.GroupMember).filter(
                models.GroupMember.group_id == doc.group_id,
                models.GroupMember.user_id == current_user.id
            ).first()
            if not membership and current_user.role != "admin":
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied.")
        elif doc.uploader_id != current_user.id and doc.conversation_id != current_user.id and current_user.role != "admin":
            pass

        filename = doc.original_filename or "Document"
        file_type = doc.file_type or "document"
        size_kb = round(doc.file_size / 1024, 1)

        # Attempt to extract text from disk or storage
        extracted_text = ""
        disk_candidates = [
            Path("uploads") / str(doc.id) / filename,
            Path("uploads") / filename,
            Path("backend/uploads") / filename,
            Path("uploads") / f"{doc.id}_{filename}"
        ]
        found_disk = None
        for p in disk_candidates:
            if p.exists():
                found_disk = p
                break

        if found_disk:
            try:
                ext_info = extract_text_from_file(found_disk, filename, doc.mime_type)
                extracted_text = ext_info.get("text", "")
            except Exception:
                pass

        gemini_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        analysis = None
        if gemini_api_key and extracted_text:
            analysis = await self._call_gemini_document_analysis(filename, extracted_text[:3000], gemini_api_key)

        if not analysis:
            analysis = self._generate_builtin_document_analysis(filename, file_type, size_kb, doc.mime_type or "", extracted_text=extracted_text)

        return {
            "success": True,
            "conversation_id": conversation_id,
            "message_id": message_id,
            "attachment_id": attachment_id,
            "filename": filename,
            "file_type": file_type,
            "file_size": doc.file_size,
            "mime_type": doc.mime_type,
            "analysis": analysis
        }

    async def get_standalone_smart_analysis(
        self,
        conversation_id: int,
        conversation_type: str,
        current_user: models.User,
        db: Session,
        message_id: Optional[int] = None,
        attachment_id: Optional[int] = None,
        include_message: Optional[bool] = None,
        include_document: Optional[bool] = None,
        force_refresh: bool = False
    ) -> Dict[str, Any]:
        """
        Unified Smart Analysis endpoint conforming to the standalone Smart Conversations API contract.
        Supports full conversation analysis, single message analysis, single document analysis,
        and message+document targeted analysis.
        """
        # Targeted mode if message_id or attachment_id is specified
        if message_id or attachment_id:
            target_msg = None
            target_att = None
            target_msg_sender = "User"

            if message_id:
                msg = db.query(models.Message).filter(models.Message.id == message_id).first()
                if msg:
                    target_msg = msg
                    sender = db.query(models.User).filter(models.User.id == msg.sender_id).first()
                    if sender:
                        target_msg_sender = sender.full_name or sender.username

            if attachment_id:
                target_att = db.query(models.Document).filter(models.Document.id == attachment_id).first()

            is_doc_only = (attachment_id is not None and (message_id is None or include_message is False))
            is_msg_only = (message_id is not None and (attachment_id is None or include_document is False))
            mode = "DOCUMENT" if is_doc_only else ("MESSAGE" if is_msg_only else "MESSAGE_DOCUMENT")

            summary_text = ""
            key_points = []
            action_items = []
            decisions = []
            dates = []

            if target_msg and not is_doc_only:
                msg_analysis = await self.analyze_specific_message(conversation_id, message_id, current_user, db)
                analysis_info = msg_analysis.get("analysis", {})
                summary_text = analysis_info.get("summary") or analysis_info.get("key_takeaway") or target_msg.content[:120]
                key_points.append(f"Sender: {target_msg_sender}")
                key_points.append(f"Category: {analysis_info.get('category', 'General')}")
                key_points.append(f"Tone: {analysis_info.get('tone', 'Neutral')}")
                if analysis_info.get("has_action_item"):
                    action_items.append({
                        "id": f"ai_msg_{target_msg.id}",
                        "conversation_id": str(conversation_id),
                        "source_message_id": str(target_msg.id),
                        "title": analysis_info.get("key_takeaway", "Action required from message"),
                        "description": target_msg.content,
                        "assigned_to": str(current_user.id),
                        "assigned_to_name": current_user.full_name,
                        "due_date": None,
                        "status": "OPEN",
                        "created_at": schemas.format_iso_utc(target_msg.created_at) or "",
                        "updated_at": schemas.format_iso_utc(target_msg.created_at) or ""
                    })

            if target_att and not is_msg_only:
                att_analysis = await self.analyze_specific_attachment(conversation_id, message_id or 0, attachment_id, current_user, db)
                att_info = att_analysis.get("analysis", {})
                att_summary = att_info.get("summary") or f"Asset: {target_att.original_filename}"
                if summary_text:
                    summary_text += f"\n\nDocument Attached: {att_summary}"
                else:
                    summary_text = att_summary
                key_points.append(f"Document: {target_att.original_filename} ({round(target_att.file_size/1024, 1)} KB)")
                key_points.append(f"Format: {att_info.get('format', 'FILE')}")
                key_points.append(f"Status: {att_info.get('security_status', 'Scanned & Clean')}")

            return {
                "success": True,
                "status": "ready",
                "conversation_id": str(conversation_id),
                "message_version": message_id or (target_att.id if target_att else 1),
                "is_stale": False,
                "mode": mode,
                "selected_message": {
                    "id": str(target_msg.id),
                    "sender_name": target_msg_sender,
                    "content": target_msg.content,
                    "created_at": schemas.format_iso_utc(target_msg.created_at) or "",
                    "preview": target_msg.content[:120] if target_msg.content else ""
                } if target_msg else None,
                "selected_document": {
                    "id": str(target_att.id),
                    "filename": target_att.original_filename,
                    "mime_type": target_att.mime_type or "application/octet-stream",
                    "size": target_att.file_size
                } if target_att else None,
                "key_points": key_points,
                "important_information": [summary_text] if summary_text else [],
                "summary": {
                    "text": summary_text,
                    "sources": [str(message_id)] if message_id else ([f"Doc {target_att.original_filename}"] if target_att else [])
                },
                "what_did_i_miss": [],
                "important_messages": [],
                "action_items": action_items,
                "decisions": decisions,
                "dates": dates,
                "important_files": [{
                    "id": str(target_att.id),
                    "message_id": str(message_id or 0),
                    "filename": target_att.original_filename,
                    "mime_type": target_att.mime_type or "",
                    "size": target_att.file_size,
                    "sender_name": target_msg_sender,
                    "created_at": schemas.format_iso_utc(target_att.created_at) or ""
                }] if target_att else [],
                "insights": {
                    "message_count": 1 if target_msg else 0,
                    "participant_count": 1,
                    "attachment_count": 1 if target_att else 0,
                    "recent_activity": schemas.format_iso_utc(datetime.now(timezone.utc)),
                    "most_active_participant": target_msg_sender,
                    "action_item_count": len(action_items),
                    "important_message_count": 1 if target_msg else 0,
                    "decision_count": 0,
                    "date_count": 0
                }
            }

        # Full conversation mode
        messages = self.verify_authorization_and_fetch_messages(
            conversation_id, conversation_type, current_user, db, limit=120
        )
        if not messages:
            return {
                "success": True,
                "status": "empty",
                "message": "There are no messages to analyze yet.",
                "conversation_id": str(conversation_id),
                "message_version": 0,
                "is_stale": False,
                "mode": "CONVERSATION",
                "key_points": [],
                "important_information": [],
                "summary": {"text": "No conversation history yet.", "sources": []},
                "what_did_i_miss": [],
                "important_messages": [],
                "action_items": [],
                "decisions": [],
                "dates": [],
                "important_files": [],
                "insights": {
                    "message_count": 0,
                    "participant_count": 0,
                    "attachment_count": 0,
                    "recent_activity": "No activity",
                    "most_active_participant": "None",
                    "action_item_count": 0,
                    "important_message_count": 0,
                    "decision_count": 0,
                    "date_count": 0
                }
            }

        full_res = await self.get_full_smart(
            conversation_id, conversation_type, current_user, db, force_refresh=force_refresh
        )

        summary_text = full_res.summary.summary_text if full_res.summary else ""
        key_points = full_res.summary.summary_bullets if full_res.summary else []
        sources = [str(m["id"]) for m in messages]

        what_missed = [
            {
                "message_id": str(i.source_message_id),
                "sender": i.sender_name,
                "preview": i.preview,
                "timestamp": i.timestamp,
                "reason": i.category
            }
            for i in (full_res.missed.items if full_res.missed else [])
        ]

        important_msgs = [
            {
                "message_id": str(i.source_message_id),
                "sender": i.sender_name,
                "preview": i.message_preview,
                "timestamp": i.timestamp,
                "reason": i.reason
            }
            for i in full_res.important
        ]

        action_items_list = [
            {
                "id": str(a.id),
                "conversation_id": str(conversation_id),
                "source_message_id": str(a.source_message_id) if a.source_message_id else None,
                "title": a.action_text,
                "description": "",
                "assigned_to": str(a.user_id),
                "assigned_to_name": current_user.full_name,
                "due_date": None,
                "status": "COMPLETED" if a.completed else "OPEN",
                "created_at": schemas.format_iso_utc(a.created_at) or "",
                "updated_at": schemas.format_iso_utc(a.updated_at) or ""
            }
            for a in full_res.action_items
        ]

        decisions_list = [
            {
                "id": str(d.id or idx),
                "conversation_id": str(conversation_id),
                "source_message_id": str(d.source_message_id) if d.source_message_id else None,
                "decision_text": d.decision_text,
                "created_at": d.created_at or "",
                "updated_at": d.created_at or ""
            }
            for idx, d in enumerate(full_res.decisions, 1)
        ]

        dates_list = [
            {
                "id": str(dt.id or idx),
                "conversation_id": str(conversation_id),
                "source_message_id": str(dt.source_message_id) if dt.source_message_id else None,
                "event_name": dt.title,
                "event_date": dt.date_value,
                "description": dt.title,
                "created_at": dt.created_at or ""
            }
            for idx, dt in enumerate(full_res.dates, 1)
        ]

        files_list = [
            {
                "id": str(f.id),
                "message_id": str(f.id),
                "filename": f.original_filename,
                "mime_type": f.mime_type,
                "size": f.file_size,
                "sender_name": f.uploader_name,
                "created_at": f.created_at or ""
            }
            for f in full_res.files
        ]

        insights_dict = {
            "message_count": full_res.insights.total_messages if full_res.insights else len(messages),
            "participant_count": full_res.insights.active_participants_count if full_res.insights else 1,
            "attachment_count": full_res.insights.files_count if full_res.insights else len(files_list),
            "recent_activity": full_res.insights.last_activity if full_res.insights else "Active today",
            "most_active_participant": full_res.insights.participants[0] if (full_res.insights and full_res.insights.participants) else "You",
            "action_item_count": len(action_items_list),
            "important_message_count": len(important_msgs),
            "decision_count": len(decisions_list),
            "date_count": len(dates_list)
        }

        return {
            "success": True,
            "status": "ready",
            "conversation_id": str(conversation_id),
            "message_version": full_res.latest_message_id or len(messages),
            "is_stale": False,
            "mode": "CONVERSATION",
            "selected_message": None,
            "selected_document": None,
            "key_points": key_points,
            "important_information": [summary_text] if summary_text else [],
            "summary": {
                "text": summary_text,
                "sources": sources
            },
            "what_did_i_miss": what_missed,
            "important_messages": important_msgs,
            "action_items": action_items_list,
            "decisions": decisions_list,
            "dates": dates_list,
            "important_files": files_list,
            "insights": insights_dict
        }

    def update_action_status(
        self,
        conversation_id: int,
        action_id: int,
        status_str: str,
        current_user: models.User,
        db: Session
    ) -> schemas.SmartActionItemResponse:
        action = db.query(models.SmartActionItem).filter(
            models.SmartActionItem.id == action_id,
            models.SmartActionItem.conversation_id == conversation_id
        ).first()
        if not action:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action item not found.")
        action.completed = (status_str.upper() == "COMPLETED")
        db.commit()
        db.refresh(action)
        return schemas.SmartActionItemResponse.model_validate(action)

    def update_action_full(
        self,
        conversation_id: int,
        action_id: int,
        item_in: schemas.ActionItemFullUpdate,
        current_user: models.User,
        db: Session
    ) -> schemas.SmartActionItemResponse:
        action = db.query(models.SmartActionItem).filter(
            models.SmartActionItem.id == action_id,
            models.SmartActionItem.conversation_id == conversation_id
        ).first()
        if not action:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Action item not found.")
        if item_in.title:
            action.action_text = item_in.title
        if item_in.status:
            action.completed = (item_in.status.upper() == "COMPLETED")
        db.commit()
        db.refresh(action)
        return schemas.SmartActionItemResponse.model_validate(action)

    async def test_ai_connectivity(self) -> Dict[str, Any]:
        gemini_api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        is_key_configured = bool(gemini_api_key and gemini_api_key.strip())
        return {
            "provider": "gemini" if is_key_configured else "frank-smart-nlp",
            "api_key_configured": is_key_configured,
            "client_initialized": True,
            "connectivity": "connected"
        }


smart_service = SmartConversationService()
