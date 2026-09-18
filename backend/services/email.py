import os
import json
import urllib.request
import urllib.error
import logging
from pathlib import Path

logger = logging.getLogger("frank.services.email")

RESEND_API_URL = "https://api.resend.com/emails"


def _ensure_env_loaded():
    if not os.getenv("RESEND_API_KEY"):
        base = Path(__file__).resolve().parent
        for candidate in [base.parent / ".env", base.parent.parent / ".env", Path(".env"), Path("backend/.env")]:
            if candidate.exists():
                try:
                    with open(candidate, "r", encoding="utf-8") as f:
                        for line in f:
                            line = line.strip()
                            if line and not line.startswith("#") and "=" in line:
                                k, v = line.split("=", 1)
                                os.environ.setdefault(k.strip(), v.strip())
                except Exception:
                    pass
            if os.getenv("RESEND_API_KEY"):
                break


def get_resend_api_key() -> str:
    _ensure_env_loaded()
    return os.getenv("RESEND_API_KEY", "").strip()


def get_email_from() -> str:
    _ensure_env_loaded()
    # Use environment configured sender, default to Resend sandbox sender for testing
    return os.getenv("EMAIL_FROM", "FRANK <onboarding@resend.dev>").strip()


def get_frontend_url() -> str:
    _ensure_env_loaded()
    return os.getenv("FRONTEND_URL", "https://frank-chat-app.vercel.app").rstrip("/")


def build_reset_email_html(reset_url: str, user_name: str = "") -> str:
    name_greeting = f"Hello {user_name}," if user_name else "Hello,"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset your FRANK password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #050817; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #FFFFFF;">
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #050817; padding: 40px 16px;">
        <tr>
            <td align="center">
                <!-- Main Container -->
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #0B1026; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.08); overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);">
                    
                    <!-- Header with Branding -->
                    <tr>
                        <td align="center" style="padding: 36px 32px 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
                            <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center">
                                        <!-- Gradient Logo Block -->
                                        <div style="width: 52px; height: 52px; border-radius: 14px; background: linear-gradient(135deg, #2563EB 0%, #7C3AED 50%, #D946EF 100%); line-height: 52px; text-align: center; margin-bottom: 12px; box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4);">
                                            <span style="font-size: 26px; font-weight: 900; color: #FFFFFF; font-family: 'Inter', sans-serif;">F</span>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center">
                                        <span style="font-size: 22px; font-weight: 800; letter-spacing: 2px; color: #FFFFFF; text-transform: uppercase;">FRANK</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center">
                                        <span style="font-size: 11px; font-weight: 700; letter-spacing: 3px; color: #06B6D4; text-transform: uppercase; margin-top: 2px; display: block;">THINK</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 32px 36px;">
                            <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #FFFFFF; line-height: 1.3;">Reset your password</h1>
                            <p style="margin: 0 0 12px; font-size: 15px; color: #94A3B8; line-height: 1.6;">
                                {name_greeting}
                            </p>
                            <p style="margin: 0 0 24px; font-size: 15px; color: #CBD5E1; line-height: 1.6;">
                                We received a request to reset your FRANK password. Click the button below to create a new password.
                            </p>

                            <!-- Call to Action Button -->
                            <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                                <tr>
                                    <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);">
                                        <a href="{reset_url}" target="_blank" rel="noopener noreferrer" style="font-size: 15px; font-weight: 700; color: #FFFFFF; text-decoration: none; padding: 14px 32px; border-radius: 10px; display: inline-block; letter-spacing: 0.5px;">
                                            Reset Password
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Expiration Notice -->
                            <div style="background-color: rgba(37, 99, 235, 0.08); border-left: 3px solid #2563EB; border-radius: 6px; padding: 12px 16px; margin: 24px 0;">
                                <p style="margin: 0; font-size: 13px; color: #94A3B8; line-height: 1.5;">
                                    ⏰ <strong>Note:</strong> This password reset link is valid for <strong>30 minutes</strong> and can only be used once.
                                </p>
                            </div>

                            <!-- Fallback Link -->
                            <p style="margin: 24px 0 0; font-size: 12px; color: #64748B; line-height: 1.6; word-break: break-all;">
                                If the button above does not work, copy and paste this link into your web browser:<br>
                                <a href="{reset_url}" style="color: #3B82F6; text-decoration: underline;">{reset_url}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Footer & Security Notice -->
                    <tr>
                        <td style="padding: 24px 36px; background-color: rgba(0, 0, 0, 0.25); border-top: 1px solid rgba(255, 255, 255, 0.06);">
                            <p style="margin: 0 0 8px; font-size: 12px; color: #64748B; line-height: 1.5;">
                                If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
                            </p>
                            <p style="margin: 0; font-size: 12px; color: #475569; line-height: 1.5;">
                                For security reasons, never share this link with anyone.
                            </p>
                            <p style="margin: 16px 0 0; font-size: 11px; color: #334155; text-align: center;">
                                &copy; 2026 FRANK &bull; Think &bull; Real-time Private Messaging
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""


def build_reset_email_text(reset_url: str, user_name: str = "") -> str:
    name_greeting = f"Hello {user_name}," if user_name else "Hello,"
    return f"""FRANK - Think
Reset your password

{name_greeting}

We received a request to reset your FRANK password.
To create a new password, open the link below:

{reset_url}

This password reset link will expire in 30 minutes.

If you did not request a password reset, you can safely ignore this email.
For security reasons, never share this link with anyone.

--
FRANK - Think
https://frank-chat.vercel.app
"""


def send_password_reset_email(to_email: str, reset_url: str, user_name: str = "") -> bool:
    api_key = get_resend_api_key()
    if not api_key:
        logger.warning("[EMAIL SERVICE] RESEND_API_KEY is not configured. Email will not be sent.")
        return False

    email_from = get_email_from()
    html_content = build_reset_email_html(reset_url, user_name)
    text_content = build_reset_email_text(reset_url, user_name)

    payload = {
        "from": email_from,
        "to": [to_email],
        "subject": "Reset your FRANK password",
        "html": html_content,
        "text": text_content,
    }

    req_data = json.dumps(payload).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "FRANK-Backend/2.0"
    }

    req = urllib.request.Request(RESEND_API_URL, data=req_data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            status_code = resp.getcode()
            if status_code in (200, 201):
                logger.info(f"[EMAIL SERVICE] Password reset email dispatched to recipient.")
                return True
            else:
                logger.warning(f"[EMAIL SERVICE] Resend returned unexpected status code: {status_code}")
                return False
    except urllib.error.HTTPError as e:
        error_body = ""
        try:
            error_body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            pass
        logger.error(f"[EMAIL SERVICE] Resend HTTPError {e.code}: {error_body}")
        return False
    except Exception as e:
        logger.error(f"[EMAIL SERVICE] Failed to send email via Resend: {e}")
        return False


def build_verification_email_html(verify_url: str, user_name: str = "") -> str:
    name_greeting = f"Hello {user_name}," if user_name else "Hello,"
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Verify your FRANK email address</title>
</head>
<body style="margin: 0; padding: 0; background-color: #050817; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #FFFFFF;">
    <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #050817; padding: 40px 16px;">
        <tr>
            <td align="center">
                <!-- Main Container -->
                <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 540px; background-color: #0B1026; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.08); overflow: hidden; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);">
                    
                    <!-- Header with Branding -->
                    <tr>
                        <td align="center" style="padding: 36px 32px 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.06);">
                            <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                                <tr>
                                    <td align="center">
                                        <!-- Gradient Logo Block -->
                                        <div style="width: 52px; height: 52px; border-radius: 14px; background: linear-gradient(135deg, #2563EB 0%, #7C3AED 50%, #D946EF 100%); line-height: 52px; text-align: center; margin-bottom: 12px; box-shadow: 0 4px 16px rgba(37, 99, 235, 0.4);">
                                            <span style="font-size: 26px; font-weight: 900; color: #FFFFFF; font-family: 'Inter', sans-serif;">F</span>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center">
                                        <span style="font-size: 22px; font-weight: 800; letter-spacing: 2px; color: #FFFFFF; text-transform: uppercase;">FRANK</span>
                                    </td>
                                </tr>
                                <tr>
                                    <td align="center">
                                        <span style="font-size: 11px; font-weight: 700; letter-spacing: 3px; color: #06B6D4; text-transform: uppercase; margin-top: 2px; display: block;">THINK</span>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 32px 36px;">
                            <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #FFFFFF; line-height: 1.3;">Welcome to FRANK</h1>
                            <p style="margin: 0 0 12px; font-size: 15px; color: #94A3B8; line-height: 1.6;">
                                {name_greeting}
                            </p>
                            <p style="margin: 0 0 24px; font-size: 15px; color: #CBD5E1; line-height: 1.6;">
                                Please verify your email address to activate your FRANK account and start chatting in real time.
                            </p>

                            <!-- Call to Action Button -->
                            <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 28px 0;">
                                <tr>
                                    <td align="center" style="border-radius: 10px; background: linear-gradient(135deg, #2563EB 0%, #3B82F6 100%);">
                                        <a href="{verify_url}" target="_blank" rel="noopener noreferrer" style="font-size: 15px; font-weight: 700; color: #FFFFFF; text-decoration: none; padding: 14px 32px; border-radius: 10px; display: inline-block; letter-spacing: 0.5px;">
                                            Verify Email
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <!-- Expiration Notice -->
                            <div style="background-color: rgba(37, 99, 235, 0.08); border-left: 3px solid #2563EB; border-radius: 6px; padding: 12px 16px; margin: 24px 0;">
                                <p style="margin: 0; font-size: 13px; color: #94A3B8; line-height: 1.5;">
                                    ⏰ <strong>Note:</strong> This verification link will expire in <strong>24 hours</strong>.
                                </p>
                            </div>

                            <!-- Fallback Link -->
                            <p style="margin: 24px 0 0; font-size: 12px; color: #64748B; line-height: 1.6; word-break: break-all;">
                                If the button above does not work, copy and paste this link into your web browser:<br>
                                <a href="{verify_url}" style="color: #3B82F6; text-decoration: underline;">{verify_url}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Footer & Security Notice -->
                    <tr>
                        <td style="padding: 24px 36px; background-color: rgba(0, 0, 0, 0.25); border-top: 1px solid rgba(255, 255, 255, 0.06);">
                            <p style="margin: 0 0 8px; font-size: 12px; color: #64748B; line-height: 1.5;">
                                If you did not create a FRANK account, you can safely ignore this email. No account will be activated.
                            </p>
                            <p style="margin: 0; font-size: 12px; color: #475569; line-height: 1.5;">
                                For security reasons, never share this link with anyone.
                            </p>
                            <p style="margin: 16px 0 0; font-size: 11px; color: #334155; text-align: center;">
                                &copy; 2026 FRANK &bull; Think &bull; Real-time Private Messaging
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""


def build_verification_email_text(verify_url: str, user_name: str = "") -> str:
    name_greeting = f"Hello {user_name}," if user_name else "Hello,"
    return f"""FRANK - Think
Welcome to FRANK

{name_greeting}

Please verify your email address to activate your FRANK account.
To complete verification, open the link below:

{verify_url}

This verification link will expire in 24 hours.

If you did not create a FRANK account, you can safely ignore this email.

--
FRANK - Think
https://frank-chat.vercel.app
"""


def send_verification_email(to_email: str, verify_url: str, user_name: str = "") -> bool:
    api_key = get_resend_api_key()
    if not api_key:
        logger.warning("[EMAIL SERVICE] RESEND_API_KEY is not configured. Verification email will not be sent.")
        return False

    email_from = get_email_from()
    html_content = build_verification_email_html(verify_url, user_name)
    text_content = build_verification_email_text(verify_url, user_name)

    payload = {
        "from": email_from,
        "to": [to_email],
        "subject": "Verify your FRANK email address",
        "html": html_content,
        "text": text_content,
    }

    req_data = json.dumps(payload).encode("utf-8")
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "FRANK-Backend/2.0"
    }

    req = urllib.request.Request(RESEND_API_URL, data=req_data, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            status_code = resp.getcode()
            if status_code in (200, 201):
                logger.info(f"[EMAIL SERVICE] Verification email dispatched to recipient.")
                return True
            else:
                logger.warning(f"[EMAIL SERVICE] Resend returned unexpected status code: {status_code}")
                return False
    except urllib.error.HTTPError as e:
        error_body = ""
        try:
            error_body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            pass
        logger.error(f"[EMAIL SERVICE] Resend HTTPError {e.code}: {error_body}")
        return False
    except Exception as e:
        logger.error(f"[EMAIL SERVICE] Failed to send verification email via Resend: {e}")
        return False

