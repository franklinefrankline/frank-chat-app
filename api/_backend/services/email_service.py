"""
FRANK Think — Email Service (Gmail SMTP & OTP Delivery)
Provides secure SMTP email delivery over STARTTLS (port 587) with
cryptographically secure templating and safe error handling.
"""

import os
import ssl
import socket
import smtplib
import asyncio
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Tuple, Dict, Any


class EmailService:
    def __init__(self):
        pass

    def get_config(self) -> Dict[str, Any]:
        """
        Retrieves SMTP configuration from environment variables.
        Reloads dynamically so changes to .env take immediate effect.
        """
        try:
            import dotenv
            current_dir = os.path.dirname(__file__)
            candidates = [
                os.path.join(os.path.dirname(current_dir), ".env"),
                os.path.join(os.path.dirname(os.path.dirname(current_dir)), ".env"),
                os.path.abspath("backend/.env"),
                os.path.abspath(".env"),
            ]
            for cand in candidates:
                if os.path.isfile(cand):
                    dotenv.load_dotenv(cand, override=True)
                    break
        except Exception:
            pass

        host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip().strip("'\"")
        port_raw = os.getenv("SMTP_PORT", "587").strip().strip("'\"")
        try:
            port = int(port_raw)
        except ValueError:
            port = 587

        secure_raw = os.getenv("SMTP_SECURE", "false").strip().strip("'\"").lower()
        secure = secure_raw in ["true", "1", "yes"]

        user = os.getenv("SMTP_USER", "").strip().strip("'\"")
        raw_pw = os.getenv("SMTP_PASS", "").strip().strip("'\"")
        # Remove any internal spaces in App Password (e.g. 'abcd efgh ijkl mnop' -> 'abcdefghijklmnop')
        password = raw_pw.replace(" ", "")
        from_email = os.getenv("SMTP_FROM", "").strip().strip("'\"") or user
        from_name = os.getenv("SMTP_FROM_NAME", "FRANK Think").strip().strip("'\"")

        return {
            "host": host,
            "port": port,
            "secure": secure,
            "user": user,
            "pass": password,
            "from_email": from_email,
            "from_name": from_name,
        }

    def is_configured(self) -> bool:
        """
        Checks whether SMTP is properly configured with non-placeholder credentials.
        """
        cfg = self.get_config()
        user = cfg["user"]
        pw = cfg["pass"]

        if not user or not pw:
            return False

        # Reject template placeholders
        placeholders = [
            "your-email@gmail.com",
            "your-16-character-app-password",
            "example@gmail.com",
            "user@gmail.com",
            "password",
            "app_password",
        ]
        if user.lower() in placeholders or pw.lower() in placeholders:
            return False

        return True

    def get_safe_status(self) -> Dict[str, Any]:
        """
        Returns safe configuration status without revealing secrets or passwords.
        """
        cfg = self.get_config()
        configured = self.is_configured()

        masked_user = ""
        if cfg["user"]:
            parts = cfg["user"].split("@")
            if len(parts) == 2:
                u, d = parts
                masked_user = f"{u[:2]}***@{d}"
            else:
                masked_user = f"{cfg['user'][:2]}***"

        return {
            "configured": configured,
            "host": cfg["host"],
            "port": cfg["port"],
            "secure": cfg["secure"],
            "security_mode": "SSL/TLS (Port 465)" if cfg["secure"] else "STARTTLS (Port 587)",
            "sender_name": cfg["from_name"],
            "sender_email": masked_user,
        }

    def verify_connection(self) -> Tuple[bool, str]:
        """
        Verifies SMTP server connectivity and authentication.
        Returns (True, message) on success, or (False, safe_error_message) on failure.
        Never prints or exposes the password.
        """
        if not self.is_configured():
            return (
                False,
                "Gmail SMTP is not configured. Please set SMTP_USER (your Gmail) and SMTP_PASS (your 16-character Google App Password) in backend/.env.",
            )

        cfg = self.get_config()
        host = cfg["host"]
        port = cfg["port"]
        user = cfg["user"]
        pw = cfg["pass"]

        try:
            if cfg["secure"] or port == 465:
                # Direct SSL/TLS connection
                context = ssl.create_default_context()
                server = smtplib.SMTP_SSL(host, port, context=context, timeout=12)
            else:
                # STARTTLS connection (standard for port 587)
                server = smtplib.SMTP(host, port, timeout=12)
                server.ehlo()
                context = ssl.create_default_context()
                server.starttls(context=context)
                server.ehlo()

            server.login(user, pw)
            server.quit()
            return (True, f"Successfully connected and authenticated with Gmail SMTP ({host}:{port}).")

        except smtplib.SMTPAuthenticationError as e:
            code = getattr(e, "smtp_code", 535)
            return (
                False,
                f"Gmail SMTP authentication failed (code {code}). Please verify your Gmail address and 16-character Google App Password (ensure 2-Step Verification is active and App Password has no spaces).",
            )
        except (socket.timeout, TimeoutError):
            return (False, f"Connection to {host}:{port} timed out after 12 seconds.")
        except (socket.gaierror, ConnectionRefusedError) as e:
            return (False, f"Could not connect to {host}:{port}: {str(e)}")
        except Exception as e:
            return (False, f"SMTP connection error: {str(e)}")

    def send_email_sync(
        self,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str,
    ) -> Tuple[bool, str]:
        """
        Sends an email synchronously using Gmail SMTP.
        Returns (True, message_id_or_ok) only after the SMTP server accepts the message
        for the intended recipient. Clearly distinguishes SMTP acceptance from inbox delivery.
        Never logs or exposes passwords, secrets, or OTP values.
        """
        import logging
        from email.utils import make_msgid, formatdate

        logger = logging.getLogger("uvicorn.error")

        clean_to = (to_email or "").strip().lower()
        if not clean_to or "@" not in clean_to or "." not in clean_to.split("@")[-1]:
            masked = f"{clean_to[:2]}***" if clean_to else "***"
            logger.warning(f"[SMTP REJECTED] Invalid recipient address provided: {masked}")
            return (False, f"Invalid recipient email address format: {masked}")

        # Mask helper for sanitized logging
        parts = clean_to.split("@", 1)
        u, d = parts[0], parts[1]
        masked_to = f"{u[:2]}***@{d}" if len(u) > 2 else f"{u[0]}***@{d}"

        if not self.is_configured():
            logger.warning(f"[SMTP UNAVAILABLE] Delivery attempted to {masked_to} but SMTP is not configured in backend/.env")
            return (
                False,
                "SMTP service is not configured. Please provide SMTP_USER and SMTP_PASS in backend/.env.",
            )

        cfg = self.get_config()
        host = cfg["host"]
        port = cfg["port"]
        user = cfg["user"]
        pw = cfg["pass"]
        from_email = cfg["from_email"] or user
        from_name = cfg["from_name"]

        # Build multipart email message with standard RFC 5322 headers
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = clean_to
        msg["Reply-To"] = from_email
        msg["Date"] = formatdate(localtime=True)
        msg_domain = host if "." in host else "gmail.com"
        msg_id = make_msgid(domain=msg_domain)
        msg["Message-ID"] = msg_id
        msg["MIME-Version"] = "1.0"

        # Attach text and html alternatives
        part_text = MIMEText(text_content, "plain", "utf-8")
        part_html = MIMEText(html_content, "html", "utf-8")
        msg.attach(part_text)
        msg.attach(part_html)

        server = None
        try:
            if cfg["secure"] or port == 465:
                logger.info(f"[SMTP CONNECT] Connecting via SSL/TLS to {host}:{port} for recipient {masked_to}")
                context = ssl.create_default_context()
                server = smtplib.SMTP_SSL(host, port, context=context, timeout=15)
            else:
                logger.info(f"[SMTP CONNECT] Connecting via STARTTLS to {host}:{port} for recipient {masked_to}")
                server = smtplib.SMTP(host, port, timeout=15)
                server.ehlo()
                context = ssl.create_default_context()
                server.starttls(context=context)
                server.ehlo()

            # Authenticate using sanitized credentials
            server.login(user, pw)
            logger.info(f"[SMTP AUTH] Successfully authenticated with {host}:{port}")

            # Send message and check SMTP server recipient acceptance
            refused = server.send_message(msg)
            if refused:
                reasons = []
                for rcpt, (code, err_text) in refused.items():
                    decoded = err_text.decode("utf-8", errors="replace") if isinstance(err_text, bytes) else str(err_text)
                    reasons.append(f"{code} {decoded}")
                refused_summary = "; ".join(reasons)
                logger.error(f"[SMTP RECIPIENT REJECTED] Recipient {masked_to} refused by server: {refused_summary}")
                try:
                    server.quit()
                except Exception:
                    pass
                return (False, f"SMTP server rejected recipient: {refused_summary}")

            # Quit session cleanly and log acceptance
            quit_code, _ = server.quit()
            logger.info(f"[SMTP ACCEPTED] Message accepted by {host}:{port} for {masked_to}. Message-ID: {msg_id} (code {quit_code})")
            return (True, f"Email accepted by SMTP server for delivery to {clean_to} (Message-ID: {msg_id}).")

        except smtplib.SMTPAuthenticationError as e:
            err_code = getattr(e, "smtp_code", 535)
            logger.error(f"[SMTP AUTH FAILED] Authentication failed with code {err_code} on {host}:{port}")
            return (
                False,
                f"Gmail authentication failed (code {err_code}). Please verify your Google App Password.",
            )
        except smtplib.SMTPRecipientsRefused as e:
            logger.error(f"[SMTP RECIPIENTS REFUSED] Recipient {masked_to} refused by {host}:{port}")
            return (False, f"Recipient email address was rejected by SMTP server.")
        except smtplib.SMTPSenderRefused as e:
            logger.error(f"[SMTP SENDER REFUSED] Sender address was refused by {host}:{port}")
            return (False, f"Sender address was rejected by SMTP server.")
        except (socket.timeout, TimeoutError):
            logger.error(f"[SMTP TIMEOUT] Connection to {host}:{port} timed out after 15 seconds")
            return (False, f"SMTP delivery failed: connection to {host}:{port} timed out.")
        except smtplib.SMTPException as e:
            logger.error(f"[SMTP ERROR] SMTP protocol error: {type(e).__name__} - {str(e)}")
            return (False, f"SMTP protocol error: {str(e)}")
        except Exception as e:
            logger.error(f"[SMTP UNEXPECTED ERROR] {type(e).__name__} - {str(e)}")
            return (False, f"Email delivery failed: {str(e)}")
        finally:
            if server:
                try:
                    server.close()
                except Exception:
                    pass

    async def send_email_async(
        self,
        to_email: str,
        subject: str,
        text_content: str,
        html_content: str,
    ) -> Tuple[bool, str]:
        """
        Non-blocking async wrapper around send_email_sync using asyncio.to_thread.
        """
        return await asyncio.to_thread(
            self.send_email_sync, to_email, subject, text_content, html_content
        )

    # ---------------- EMAIL TEMPLATES ----------------

    def _render_otp_html(
        self,
        title: str,
        subtitle: str,
        otp_code: str,
        instructions: str,
        expires_in_minutes: int,
        action_button_label: Optional[str] = None,
        action_button_url: Optional[str] = None,
    ) -> str:
        """
        Renders a responsive, professional FRANK Think branded email template.
        """
        btn_html = ""
        if action_button_label and action_button_url:
            btn_html = f"""
            <div style="margin: 28px 0; text-align: center;">
                <a href="{action_button_url}" target="_blank" rel="noopener noreferrer" style="background-color: #ea580c; color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; font-weight: 700; font-size: 15px; display: inline-block; letter-spacing: 0.3px; box-shadow: 0 4px 12px rgba(234, 88, 12, 0.25);">
                    {action_button_label}
                </a>
            </div>
            <div style="margin: 16px 0 24px 0; padding: 14px 18px; background-color: #faf8f5; border-radius: 8px; border: 1px dashed #e7dfd5; text-align: center;">
                <p style="margin: 0 0 6px 0; font-size: 12px; color: #78716c; font-weight: 600;">
                    Can't click the button above? Copy and paste this link into your browser:
                </p>
                <a href="{action_button_url}" target="_blank" rel="noopener noreferrer" style="color: #ea580c; text-decoration: underline; font-size: 12px; word-break: break-all; line-height: 1.4;">
                    {action_button_url}
                </a>
            </div>
            """

        return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f4ed; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #292524; line-height: 1.6;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f7f4ed; padding: 40px 16px;">
        <tr>
            <td align="center">
                <!-- Main Container -->
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; border: 1px solid #e7dfd5; box-shadow: 0 4px 20px rgba(41, 37, 36, 0.06); overflow: hidden;">
                    
                    <!-- Header Bar -->
                    <tr>
                        <td style="background-color: #1c1917; padding: 28px 32px; text-align: center;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td align="center">
                                        <div style="display: inline-flex; align-items: center; gap: 10px;">
                                            <span style="font-size: 24px; font-weight: 900; color: #ffffff; letter-spacing: 1.5px; font-family: 'Inter', sans-serif;">FRANK</span>
                                            <span style="display: inline-block; background-color: #ea580c; color: #ffffff; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 6px; letter-spacing: 1px; text-transform: uppercase;">Think</span>
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td style="padding: 36px 36px 28px 36px;">
                            <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 800; color: #1c1917; letter-spacing: -0.3px;">
                                {title}
                            </h1>
                            <p style="margin: 0 0 20px 0; font-size: 15px; color: #57534e;">
                                {subtitle}
                            </p>
                            
                            <p style="margin: 0 0 24px 0; font-size: 14px; color: #78716c;">
                                {instructions}
                            </p>

                            <!-- OTP Box -->
                            <div style="text-align: center; margin: 28px 0;">
                                <div style="display: inline-block; background-color: #fff7ed; border: 2px dashed #fdba74; border-radius: 12px; padding: 18px 36px; text-align: center;">
                                    <span style="display: block; font-size: 11px; font-weight: 700; color: #9a3412; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px;">Your Verification Code</span>
                                    <span style="font-family: 'SF Pro Display', Consolas, Monaco, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #c2410c; display: block; margin-left: 10px;">
                                        {otp_code}
                                    </span>
                                </div>
                            </div>

                            {btn_html}

                            <div style="background-color: #faf8f5; border-radius: 10px; padding: 14px 18px; margin-top: 24px; border: 1px solid #f0eae1;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td width="20" valign="top" style="padding-right: 10px; font-size: 16px;">⏱</td>
                                        <td style="font-size: 13px; color: #78716c; line-height: 1.5;">
                                            This code will expire in <strong>{expires_in_minutes} minutes</strong>. For your security, never share this code with anyone.
                                        </td>
                                    </tr>
                                </table>
                            </div>

                            <p style="margin: 28px 0 0 0; font-size: 13px; color: #a8a29e; line-height: 1.5;">
                                If you did not request this email, no further action is required. Your FRANK Think account remains secure.
                            </p>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f7f4ed; border-top: 1px solid #e7dfd5; padding: 20px 32px; text-align: center;">
                            <p style="margin: 0; font-size: 12px; color: #a8a29e;">
                                &copy; 2026 FRANK Think. Engineered for effortless, secure communication.
                            </p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>"""

    async def send_registration_otp(
        self,
        to_email: str,
        otp_code: str,
        expires_in_minutes: int = 10,
    ) -> Tuple[bool, str]:
        """
        Sends a registration verification OTP email.
        """
        subject = f"Your FRANK Think Verification Code: {otp_code}"
        subtitle = "Thank you for creating an account on FRANK Think."
        instructions = "Please enter the 6-digit verification code below to verify your email address and activate your account."

        text_content = (
            f"FRANK Think — Account Verification\n\n"
            f"Your 6-digit verification code is: {otp_code}\n\n"
            f"This code will expire in {expires_in_minutes} minutes.\n\n"
            f"If you did not request this code, you can safely ignore this email.\n"
        )

        html_content = self._render_otp_html(
            title="Verify your email address",
            subtitle=subtitle,
            otp_code=otp_code,
            instructions=instructions,
            expires_in_minutes=expires_in_minutes,
        )

        return await self.send_email_async(to_email, subject, text_content, html_content)

    async def send_password_reset_otp(
        self,
        to_email: str,
        otp_code: str,
        reset_link: Optional[str] = None,
        expires_in_minutes: int = 15,
    ) -> Tuple[bool, str]:
        """
        Sends a password reset email with both OTP code and direct reset link.
        """
        subject = f"Reset your FRANK Think Password"
        subtitle = "We received a request to reset your FRANK Think password."
        instructions = "You can enter the verification code below on the reset page, or click the button below to update your password directly."

        text_content = (
            f"FRANK Think — Password Reset\n\n"
            f"Your 6-digit password reset code is: {otp_code}\n\n"
        )
        if reset_link:
            text_content += f"Or reset your password directly using this link:\n{reset_link}\n\n"
        text_content += (
            f"This code will expire in {expires_in_minutes} minutes.\n\n"
            f"If you did not request a password reset, you can safely ignore this email. Your account remains secure.\n"
        )

        html_content = self._render_otp_html(
            title="Reset your FRANK Think Password",
            subtitle=subtitle,
            otp_code=otp_code,
            instructions=instructions,
            expires_in_minutes=expires_in_minutes,
            action_button_label="Reset Password" if reset_link else None,
            action_button_url=reset_link,
        )

        return await self.send_email_async(to_email, subject, text_content, html_content)


# Global singleton instance
email_service = EmailService()
