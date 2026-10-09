import os
import re
import json
import logging
import asyncio
from typing import Optional, Dict, Any, Tuple
from sqlalchemy.orm import Session
from datetime import datetime, timezone

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    import urllib.request
    import urllib.error
    HAS_HTTPX = False

import models

logger = logging.getLogger("frank.translation_service")

# Supported language codes and descriptive names
LANGUAGE_NAMES = {
    "en": "English",
    "ta": "Tamil",
    "hi": "Hindi"
}

# Instant offline dictionary for common chat expressions and immediate fallback
OFFLINE_DICTIONARY: Dict[Tuple[str, str], str] = {
    # English -> Tamil
    ("good morning! how are you?", "ta"): "காலை வணக்கம்! நீங்கள் எப்படி இருக்கிறீர்கள்?",
    ("good morning", "ta"): "காலை வணக்கம்",
    ("good evening", "ta"): "மாலை வணக்கம்",
    ("good night", "ta"): "இனிய இரவு",
    ("how are you?", "ta"): "நீங்கள் எப்படி இருக்கிறீர்கள்?",
    ("how are you", "ta"): "நீங்கள் எப்படி இருக்கிறீர்கள்?",
    ("i am doing well.", "ta"): "நான் நலமாக இருக்கிறேன்.",
    ("i am doing well", "ta"): "நான் நலமாக இருக்கிறேன்.",
    ("i am fine.", "ta"): "நான் நலமாக இருக்கிறேன்.",
    ("i am fine", "ta"): "நான் நலமாக இருக்கிறேன்.",
    ("hello", "ta"): "வணக்கம்",
    ("hi", "ta"): "வணக்கம்",
    ("hey", "ta"): "வணக்கம்",
    ("thank you", "ta"): "நன்றி",
    ("thanks", "ta"): "நன்றி",
    ("welcome", "ta"): "நல்வரவு",
    ("yes", "ta"): "ஆம்",
    ("no", "ta"): "இல்லை",
    ("okay", "ta"): "சரி",
    ("ok", "ta"): "சரி",
    ("bye", "ta"): "சென்று வருகிறேன்",
    ("goodbye", "ta"): "சென்று வருகிறேன்",
    ("see you soon", "ta"): "விரைவில் சந்திப்போம்",
    ("what are you doing?", "ta"): "நீங்கள் என்ன செய்கிறீர்கள்?",
    ("lets catch up later", "ta"): "பிறகு பேசலாம்",
    ("welcome to frank!", "ta"): "FRANK-க்கு நல்வரவு!",

    # Tamil -> English
    ("காலை வணக்கம்! நீங்கள் எப்படி இருக்கிறீர்கள்?", "en"): "Good morning! How are you?",
    ("காலை வணக்கம்", "en"): "Good morning",
    ("மாலை வணக்கம்", "en"): "Good evening",
    ("இனிய இரவு", "en"): "Good night",
    ("நீங்கள் எப்படி இருக்கிறீர்கள்?", "en"): "How are you?",
    ("நீங்கள் எப்படி இருக்கிறீர்கள்", "en"): "How are you?",
    ("நான் நலமாக இருக்கிறேன்.", "en"): "I am doing well.",
    ("நான் நலமாக இருக்கிறேன்", "en"): "I am doing well.",
    ("வணக்கம்", "en"): "Hello",
    ("நன்றி", "en"): "Thank you",
    ("ஆம்", "en"): "Yes",
    ("இல்லை", "en"): "No",
    ("சரி", "en"): "Okay",
    ("சென்று வருகிறேன்", "en"): "Goodbye",
    ("விரைவில் சந்திப்போம்", "en"): "See you soon",

    # English -> Hindi
    ("good morning! how are you?", "hi"): "सुप्रभात! आप कैसे हैं?",
    ("good morning", "hi"): "सुप्रभात",
    ("good evening", "hi"): "शुभ संध्या",
    ("good night", "hi"): "शुभ रात्रि",
    ("how are you?", "hi"): "आप कैसे हैं?",
    ("how are you", "hi"): "आप कैसे हैं?",
    ("i am doing well.", "hi"): "मैं ठीक हूँ।",
    ("i am doing well", "hi"): "मैं ठीक हूँ।",
    ("i am fine.", "hi"): "मैं ठीक हूँ।",
    ("i am fine", "hi"): "मैं ठीक हूँ।",
    ("hello", "hi"): "नमस्ते",
    ("hi", "hi"): "नमस्ते",
    ("thank you", "hi"): "धन्यवाद",
    ("thanks", "hi"): "धन्यवाद",
    ("yes", "hi"): "हाँ",
    ("no", "hi"): "नहीं",
    ("okay", "hi"): "ठीक है",
    ("ok", "hi"): "ठीक है",
    ("bye", "hi"): "अलविदा",

    # Hindi -> English
    ("सुप्रभात! आप कैसे हैं?", "en"): "Good morning! How are you?",
    ("सुप्रभात", "en"): "Good morning",
    ("शुभ संध्या", "en"): "Good evening",
    ("शुभ रात्रि", "en"): "Good night",
    ("आप कैसे हैं?", "en"): "How are you?",
    ("मैं ठीक हूँ।", "en"): "I am doing well.",
    ("नमस्ते", "en"): "Hello",
    ("धन्यवाद", "en"): "Thank you",
    ("हाँ", "en"): "Yes",
    ("नहीं", "en"): "No",
    ("ठीक है", "en"): "Okay",

    # Tamil <-> Hindi
    ("காலை வணக்கம்! நீங்கள் எப்படி இருக்கிறீர்கள்?", "hi"): "सुप्रभात! आप कैसे हैं?",
    ("நான் நலமாக இருக்கிறேன்.", "hi"): "मैं ठीक हूँ।",
    ("வணக்கம்", "hi"): "नमस्ते",
    ("நன்றி", "hi"): "धन्यवाद",
    ("सुप्रभात! आप कैसे हैं?", "ta"): "காலை வணக்கம்! நீங்கள் எப்படி இருக்கிறீர்கள்?",
    ("நான் நலமாக இருக்கிறேன்", "hi"): "मैं ठीक हूँ।",
    ("नमस्ते", "ta"): "வணக்கம்",
    ("धन्यवाद", "ta"): "நன்றி"
}


class TranslationService:
    def __init__(self):
        self.api_key = (
            os.getenv("GEMINI_API_KEY") or
            os.getenv("GOOGLE_API_KEY") or
            ""
        ).strip()
        self.model = "gemini-3.5-flash-lite"
        self._memory_cache: Dict[Tuple[str, str], str] = {}

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def normalize_lang(self, code: Optional[str]) -> str:
        if not code or not isinstance(code, str):
            return "en"
        code = code.strip().lower()[:2]
        return code if code in LANGUAGE_NAMES else "en"

    def detect_language(self, text: str) -> str:
        """
        Accurately detects source language using Unicode code-point distributions.
        - Tamil: U+0B80 - U+0BFF
        - Hindi/Devanagari: U+0900 - U+097F
        - Default: en (English/Latin)
        """
        if not text or not isinstance(text, str):
            return "en"

        clean = text.strip()
        if not clean:
            return "en"

        tamil_count = len(re.findall(r'[\u0B80-\u0BFF]', clean))
        hindi_count = len(re.findall(r'[\u0900-\u097F]', clean))

        if tamil_count > 0 and tamil_count >= hindi_count:
            return "ta"
        if hindi_count > 0 and hindi_count > tamil_count:
            return "hi"
        return "en"

    async def translate_text(
        self,
        text: str,
        target_language: str,
        source_language: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Translates text to target_language.
        Returns dict with:
        {
            "translated_text": str,
            "source_language": str,
            "target_language": str,
            "is_translated": bool
        }
        """
        if not text or not isinstance(text, str):
            return {
                "translated_text": text or "",
                "source_language": "en",
                "target_language": target_language,
                "is_translated": False
            }

        text = text.strip()
        target_lang = self.normalize_lang(target_language)
        src_lang = self.normalize_lang(source_language) if source_language else self.detect_language(text)

        # If target matches detected source, no translation is needed
        if target_lang == src_lang:
            return {
                "translated_text": text,
                "source_language": src_lang,
                "target_language": target_lang,
                "is_translated": False
            }

        # Check in-memory cache
        cache_key = (text.strip().lower(), target_lang)
        if cache_key in self._memory_cache:
            return {
                "translated_text": self._memory_cache[cache_key],
                "source_language": src_lang,
                "target_language": target_lang,
                "is_translated": True
            }

        # Check offline dictionary
        if cache_key in OFFLINE_DICTIONARY:
            result_text = OFFLINE_DICTIONARY[cache_key]
            self._memory_cache[cache_key] = result_text
            return {
                "translated_text": result_text,
                "source_language": src_lang,
                "target_language": target_lang,
                "is_translated": True
            }

        # If Gemini is configured, invoke it with strict instructions
        if self.is_configured():
            try:
                src_name = LANGUAGE_NAMES.get(src_lang, "English")
                tgt_name = LANGUAGE_NAMES.get(target_lang, "Tamil")

                system_prompt = (
                    "You are a professional, high-fidelity real-time translator for FRANK chat application. "
                    f"Translate the user message from {src_name} to natural, fluent, and conversational {tgt_name}. "
                    "CRITICAL RULES:\n"
                    "- Output ONLY the translated sentence with no preamble, quotes, explanations, or notes.\n"
                    "- Preserve original punctuation, numbers, formatting, URLs, and emojis.\n"
                    "- Use natural, everyday phrasing rather than robotic literal translation."
                )

                translated = await self._call_gemini_translation(system_prompt, text)
                if translated:
                    clean_trans = translated.strip()
                    self._memory_cache[cache_key] = clean_trans
                    return {
                        "translated_text": clean_trans,
                        "source_language": src_lang,
                        "target_language": target_lang,
                        "is_translated": True
                    }
            except Exception as e:
                logger.warning(f"Gemini translation call failed: {e}")

        # Safe fallback: return original text
        return {
            "translated_text": text,
            "source_language": src_lang,
            "target_language": target_lang,
            "is_translated": False
        }

    async def _call_gemini_translation(self, system_prompt: str, user_text: str, timeout: float = 6.0) -> Optional[str]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent?key={self.api_key}"
        payload = {
            "system_instruction": {
                "parts": [{"text": system_prompt}]
            },
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": user_text}]
                }
            ]
        }

        try:
            if HAS_HTTPX:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    resp = await client.post(url, json=payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        candidates = data.get("candidates", [])
                        if candidates:
                            parts = candidates[0].get("content", {}).get("parts", [])
                            if parts:
                                return parts[0].get("text", "").strip()
                    logger.warning(f"Gemini API returned status {resp.status_code}")
                    return None
            else:
                def _urllib_req():
                    req_bytes = json.dumps(payload).encode("utf-8")
                    req = urllib.request.Request(
                        url,
                        data=req_bytes,
                        headers={"Content-Type": "application/json"},
                        method="POST"
                    )
                    with urllib.request.urlopen(req, timeout=timeout) as response:
                        if response.status == 200:
                            data = json.loads(response.read().decode("utf-8"))
                            candidates = data.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                if parts:
                                    return parts[0].get("text", "").strip()
                        return None
                return await asyncio.to_thread(_urllib_req)
        except Exception as err:
            logger.error(f"Error calling Gemini translation: {err}")
            return None

    async def get_or_create_message_translation(
        self,
        db: Session,
        message: models.Message,
        target_language: str,
        source_language: Optional[str] = None
    ) -> Optional[models.MessageTranslation]:
        """
        Retrieves cached translation from DB or generates a new one and stores it.
        Preserves original message canonically in Message table!
        """
        if not message or not message.content:
            return None

        clean_content = message.content.strip()
        if not clean_content:
            return None

        tgt_lang = self.normalize_lang(target_language)
        src_lang = self.normalize_lang(source_language) if source_language else self.detect_language(clean_content)

        # If source and target are the same, no translation required
        if tgt_lang == src_lang:
            return None

        # Check existing translation in database
        existing = db.query(models.MessageTranslation).filter(
            models.MessageTranslation.message_id == message.id,
            models.MessageTranslation.target_language == tgt_lang
        ).first()

        if existing:
            return existing

        # Generate translation
        res = await self.translate_text(clean_content, tgt_lang, src_lang)
        if not res.get("is_translated"):
            return None

        trans_record = models.MessageTranslation(
            message_id=message.id,
            source_language=res.get("source_language", src_lang),
            target_language=tgt_lang,
            translated_content=res.get("translated_text", clean_content)
        )
        try:
            db.add(trans_record)
            db.commit()
            db.refresh(trans_record)
            return trans_record
        except Exception as e:
            db.rollback()
            # If concurrent insert happened, fetch existing
            return db.query(models.MessageTranslation).filter(
                models.MessageTranslation.message_id == message.id,
                models.MessageTranslation.target_language == tgt_lang
            ).first()

    async def attach_translations_to_messages(
        self,
        messages: list,
        current_user: models.User,
        db: Session
    ) -> list:
        """
        Attaches recipient-specific translation to messages according to current_user.language.
        Only translates incoming messages (sender != current_user) when user.auto_translate is True.
        """
        if not current_user or not getattr(current_user, "auto_translate", True):
            return messages

        user_lang = self.normalize_lang(getattr(current_user, "language", "en"))
        for msg in messages:
            if not getattr(msg, "content", None):
                continue

            # If sender is current_user, sender always views their own canonical original message
            if msg.sender_id == current_user.id:
                continue

            # Check if this message already has cached translation in relations
            trans = None
            if hasattr(msg, "translations") and msg.translations:
                for t in msg.translations:
                    if t.target_language == user_lang:
                        trans = t
                        break

            if trans:
                msg.translated_content = trans.translated_content
                msg.source_language = trans.source_language
                msg.target_language = trans.target_language
            else:
                src_lang = self.detect_language(msg.content)
                if src_lang != user_lang:
                    t_rec = await self.get_or_create_message_translation(db, msg, user_lang, src_lang)
                    if t_rec:
                        msg.translated_content = t_rec.translated_content
                        msg.source_language = t_rec.source_language
                        msg.target_language = t_rec.target_language

        return messages


translation_service = TranslationService()

