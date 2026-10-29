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
from email.mime.image import MIMEImage
from typing import Optional, Tuple, Dict, Any


class EmailService:
    def __init__(self):
        pass

    def get_config(self) -> Dict[str, Any]:
        """
        Retrieves SMTP configuration from environment variables.
        Reloads dynamically so changes to .env take immediate effect.
        """
        if not os.getenv("SMTP_USER"):
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
        inline_images: Optional[Dict[str, str]] = None,
    ) -> Tuple[bool, str]:
        """
        Sends an email synchronously using Gmail SMTP.
        Returns (True, message_id_or_ok) only after the SMTP server accepts the message
        for the intended recipient. Clearly distinguishes SMTP acceptance from inbox delivery.
        Supports embedded inline images (CID) via multipart/related without leaking secrets.
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
        msg_domain = host if "." in host else "gmail.com"
        msg_id = make_msgid(domain=msg_domain)

        if inline_images:
            # Standard multipart/related container for embedded CID inline assets
            msg = MIMEMultipart("related")
            msg["Subject"] = subject
            msg["From"] = f"{from_name} <{from_email}>"
            msg["To"] = clean_to
            msg["Reply-To"] = from_email
            msg["Date"] = formatdate(localtime=True)
            msg["Message-ID"] = msg_id
            msg["MIME-Version"] = "1.0"

            alt_part = MIMEMultipart("alternative")
            alt_part.attach(MIMEText(text_content, "plain", "utf-8"))
            alt_part.attach(MIMEText(html_content, "html", "utf-8"))
            msg.attach(alt_part)

            for cid_name, img_path in inline_images.items():
                if img_path and os.path.isfile(img_path):
                    try:
                        with open(img_path, "rb") as f:
                            img_data = f.read()
                        ext = os.path.splitext(img_path)[1].lstrip(".").lower()
                        subtype = "png" if ext == "png" else ("jpeg" if ext in ["jpg", "jpeg"] else "octet-stream")
                        img_part = MIMEImage(img_data, _subtype=subtype)
                        img_part.add_header("Content-ID", f"<{cid_name}>")
                        img_part.add_header("Content-Disposition", "inline")
                        msg.attach(img_part)
                    except Exception as e:
                        logger.warning(f"[SMTP ATTACH NOTE] Could not attach CID inline image {cid_name}: {e}")
        else:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = f"{from_name} <{from_email}>"
            msg["To"] = clean_to
            msg["Reply-To"] = from_email
            msg["Date"] = formatdate(localtime=True)
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
        inline_images: Optional[Dict[str, str]] = None,
    ) -> Tuple[bool, str]:
        """
        Non-blocking async wrapper around send_email_sync using asyncio.to_thread.
        """
        return await asyncio.to_thread(
            self.send_email_sync, to_email, subject, text_content, html_content, inline_images
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
        Renders a responsive, cyber-secure FRANK Think branded email template matching Reference Image 2:
        Dark navy background, electric blue & purple gradients, violet bordered card, 6-digit code positions,
        clock expiry notice, and shield security notice. 100% email-client compatible (Gmail, Outlook, Apple Mail).
        """
        btn_html = ""
        if action_button_label and action_button_url:
            btn_html = f"""
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 24px auto 14px auto;">
                <tr>
                    <td align="center" style="border-radius: 12px; background: linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #7c3aed 100%); background-color: #6366f1; box-shadow: 0 8px 22px rgba(99, 102, 241, 0.38);">
                        <a href="{action_button_url}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 36px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 15px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 12px; letter-spacing: 0.2px;">
                            {action_button_label} &rarr;
                        </a>
                    </td>
                </tr>
            </table>
            <div style="margin: 8px auto 20px auto; max-width: 460px; text-align: center; word-break: break-all;">
                <span style="font-size: 11px; color: #94a3b8;">Can't click the button? Copy and paste this link:</span><br/>
                <a href="{action_button_url}" target="_blank" rel="noopener noreferrer" style="color: #6366f1; font-size: 11px; word-break: break-all; text-decoration: underline;">
                    {action_button_url}
                </a>
            </div>
            """

        digits = [ch for ch in str(otp_code or "000000").strip()]
        if len(digits) == 6:
            boxes = []
            for d in digits:
                boxes.append(f"""
                <td align="center" valign="middle" style="padding: 0 4px;">
                    <div style="width: 44px; height: 54px; line-height: 54px; background-color: #f4f7ff; border: 1.5px solid #c7d2fe; border-radius: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'SF Pro Display', Monaco, monospace; font-size: 28px; font-weight: 800; color: #3730a3; text-align: center; box-shadow: 0 2px 6px rgba(99, 102, 241, 0.08);">{d}</div>
                </td>""")
            code_boxes_html = "".join(boxes)
        else:
            code_boxes_html = f"""
            <td align="center" valign="middle" style="padding: 0 8px;">
                <div style="padding: 10px 24px; background-color: #f4f7ff; border: 1.5px solid #c7d2fe; border-radius: 12px; font-family: monospace; font-size: 28px; font-weight: 800; color: #3730a3; letter-spacing: 8px;">
                    {otp_code}
                </div>
            </td>"""

        return f"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{title}</title>
    <!--[if mso]>
    <style type="text/css">
        body, table, td, h1, p, a, div, span {{ font-family: Segoe UI, Arial, sans-serif !important; }}
    </style>
    <![endif]-->
    <style type="text/css">
        body, table, td, a {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
        table, td {{ mso-table-lspace: 0pt; mso-table-rspace: 0pt; }}
        img {{ -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }}
        @media only screen and (max-width: 580px) {{
            .email-outer-table {{ padding: 18px 8px !important; }}
            .email-container {{ width: 100% !important; border-radius: 20px !important; }}
            .card-body-padding {{ padding: 26px 18px 22px 18px !important; }}
            .code-digit-box {{ width: 38px !important; height: 48px !important; line-height: 48px !important; font-size: 24px !important; }}
        }}
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #070b19; background: radial-gradient(circle at 50% 15%, #10193e 0%, #080d21 50%, #050814 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.6;">
    <table role="presentation" class="email-outer-table" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #070b19; padding: 40px 16px;">
        <tr>
            <td align="center">
                <!-- Main Verification Card -->
                <table role="presentation" class="email-container" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 520px; background-color: #ffffff; border-radius: 26px; border: 1.5px solid #8b5cf6; box-shadow: 0 16px 50px rgba(124, 58, 237, 0.35), 0 0 35px rgba(37, 99, 235, 0.25); overflow: hidden;">
                    
                    <!-- Dark Branded Header Bar -->
                    <tr>
                        <td style="background-color: #0b0f24; padding: 22px 28px; text-align: center; border-bottom: 1px solid rgba(255, 255, 255, 0.08);">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
                                <tr>
                                    <td valign="middle" style="padding-right: 12px;">
                                        <div style="width: 40px; height: 40px; background-color: #0b0f28; border-radius: 11px; border: 1px solid rgba(59, 130, 246, 0.4); text-align: center; line-height: 40px;">
                                            <span style="font-size: 22px; font-weight: 900; color: #38bdf8; font-family: sans-serif;">F</span>
                                        </div>
                                    </td>
                                    <td valign="middle" align="left">
                                        <div style="line-height: 1.15;">
                                            <span style="font-size: 21px; font-weight: 900; color: #ffffff; letter-spacing: 0.8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">FRANK</span>
                                            <span style="display: block; font-size: 12px; font-weight: 500; color: #94a3b8; letter-spacing: 0.6px;">Think</span>
                                        </div>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Body Content -->
                    <tr>
                        <td class="card-body-padding" style="padding: 34px 34px 28px 34px; text-align: center; background-color: #ffffff;">
                            <h1 style="margin: 0 0 10px 0; font-size: 23px; font-weight: 850; color: #0f172a; letter-spacing: -0.3px; line-height: 1.25;">
                                {title}
                            </h1>
                            <p style="margin: 0 0 6px 0; font-size: 14px; color: #475569; line-height: 1.45;">
                                {subtitle}
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b; line-height: 1.5;">
                                {instructions}
                            </p>

                            <!-- Section Label -->
                            <div style="margin-bottom: 12px;">
                                <span style="font-size: 11px; font-weight: 800; color: #6366f1; letter-spacing: 1.8px; text-transform: uppercase;">
                                    YOUR VERIFICATION CODE
                                </span>
                            </div>

                            <!-- 6 Split Digit Positions Table -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto 24px auto;">
                                <tr>
                                    {code_boxes_html}
                                </tr>
                            </table>

                            {btn_html}

                            <!-- Notice 1: Expiry in 15 Minutes with Clock -->
                            <div style="background-color: #eff4fe; border: 1px solid #dbeafe; border-radius: 12px; padding: 13px 18px; margin-top: 18px; text-align: left;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td width="24" valign="middle" style="padding-right: 10px; font-size: 18px; line-height: 1;">
                                            &#9201;
                                        </td>
                                        <td style="font-size: 13px; color: #1e3a8a; line-height: 1.45;">
                                            This code expires in <strong>{expires_in_minutes} minutes</strong>. Never share this code with anyone.
                                        </td>
                                    </tr>
                                </table>
                            </div>

                            <!-- Notice 2: Unsolicited Email Protection -->
                            <div style="margin-top: 14px; text-align: left; padding: 0 4px;">
                                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                                    <tr>
                                        <td width="20" valign="top" style="padding-right: 8px; font-size: 14px; line-height: 1.3; color: #6366f1;">
                                            &#128737;
                                        </td>
                                        <td style="font-size: 12px; color: #64748b; line-height: 1.45;">
                                            If you did not request this email, no action is required. Your FRANK Think account remains secure.
                                        </td>
                                    </tr>
                                </table>
                            </div>

                            <!-- Divider Line -->
                            <div style="border-top: 1px solid #e2e8f0; margin: 24px 0 16px 0;"></div>

                            <!-- Footer -->
                            <p style="margin: 0; font-size: 11.5px; color: #94a3b8; text-align: center;">
                                &copy; 2026 FRANK Think &middot; Secure communication, made simple.
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
        expires_in_minutes: int = 15,
    ) -> Tuple[bool, str]:
        """
        Sends a registration verification OTP email.
        """
        subject = f"{otp_code} is your FRANK Think verification code"
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

    def _find_asset_path(self, relative_path: str) -> Optional[str]:
        """
        Locates an asset file across common directories (backend, root, api/_backend).
        """
        current_dir = os.path.dirname(os.path.abspath(__file__))
        candidates = [
            os.path.abspath(os.path.join(current_dir, "..", "..", relative_path)),
            os.path.abspath(os.path.join(current_dir, "..", "..", "frontend", relative_path)),
            os.path.abspath(os.path.join(current_dir, "..", relative_path)),
            os.path.abspath(os.path.join(current_dir, "..", "frontend", relative_path)),
            os.path.abspath(os.path.join(os.getcwd(), relative_path)),
            os.path.abspath(os.path.join(os.getcwd(), "frontend", relative_path)),
        ]
        for cand in candidates:
            if os.path.isfile(cand):
                return cand
        return None

    def _render_password_reset_html(
        self,
        otp_code: str,
        reset_link: Optional[str] = None,
        expires_in_minutes: int = 15,
        logo_src: Optional[str] = None,
        lock_src: Optional[str] = None,
        app_url: Optional[str] = None,
    ) -> str:
        """
        Renders the premium FRANK Think glassmorphism password-reset email template,
        faithfully matching the approved reference design with table-based email compatibility,
        without image attachments or external image dependencies.
        """
        app_url = (app_url or "https://fnk.vercel.app").rstrip("/")
        digits = [ch for ch in str(otp_code or "143249").strip()]
        if len(digits) == 6:
            boxes = []
            for d in digits:
                boxes.append(f"""
                <td align="center" valign="middle" style="padding: 0 4px;">
                    <div class="code-digit-box" style="width: 44px; height: 54px; line-height: 54px; background-color: #ffffff; border: 1.2px solid #ded6fa; border-radius: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'SF Pro Display', Monaco, monospace; font-size: 30px; font-weight: 800; color: #3730a3; text-align: center; box-shadow: 0 2px 8px rgba(124, 58, 237, 0.07);">
                        {d}
                    </div>
                </td>""")
            code_boxes_html = "".join(boxes)
        else:
            code_boxes_html = f"""
            <td align="center" valign="middle" style="padding: 0 8px;">
                <div style="padding: 10px 24px; background-color: #ffffff; border: 1.2px solid #ded6fa; border-radius: 12px; font-family: monospace; font-size: 28px; font-weight: 800; color: #3730a3; letter-spacing: 6px;">
                    {otp_code}
                </div>
            </td>"""

        reset_btn_html = ""
        if reset_link:
            reset_btn_html = f"""
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 26px auto 14px auto;">
                <tr>
                    <td align="center" style="border-radius: 32px; background: linear-gradient(135deg, #8b5cf6 0%, #6d28d9 50%, #7c3aed 100%); background-color: #7c3aed; box-shadow: 0 10px 28px rgba(109, 40, 217, 0.38);">
                        <a href="{reset_link}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 16px 42px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: 700; color: #ffffff; text-decoration: none; border-radius: 32px; letter-spacing: 0.3px; white-space: nowrap;">
                            <span style="font-size: 15px; margin-right: 8px;">&#128274;</span>Reset Password<span style="font-size: 16px; margin-left: 8px;">&rarr;</span>
                        </a>
                    </td>
                </tr>
            </table>
            <div style="margin: 0 auto 24px auto; max-width: 460px; text-align: center; word-break: break-all; overflow-wrap: break-word; padding: 0 8px;">
                <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #94a3b8;">
                    Can't click the button? Copy and paste this link:
                </span>
                <br/>
                <a href="{reset_link}" target="_blank" rel="noopener noreferrer" style="color: #6366f1; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; word-break: break-all; text-decoration: underline; line-height: 1.4;">
                    {reset_link}
                </a>
            </div>
            """

        return f"""<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reset your FRANK Think password</title>
    <!--[if mso]>
    <style type="text/css">
        body, table, td, h1, p, a {{ font-family: Segoe UI, Arial, sans-serif !important; }}
    </style>
    <![endif]-->
    <style type="text/css">
        body, table, td, a {{ -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }}
        table, td {{ mso-table-lspace: 0pt; mso-table-rspace: 0pt; }}
        img {{ -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }}
        @media only screen and (max-width: 580px) {{
            .email-outer-table {{ padding: 16px 6px !important; }}
            .email-container {{ width: 100% !important; border-radius: 20px !important; }}
            .card-padding {{ padding: 22px 16px !important; }}
            .header-table tr, .header-table td {{ display: block !important; width: 100% !important; text-align: left !important; }}
            .header-badge-col {{ margin-top: 10px !important; }}
            .header-badge-table {{ float: left !important; margin: 0 !important; }}
            .hero-col {{ display: block !important; width: 100% !important; max-width: 100% !important; }}
            .hero-title {{ font-size: 24px !important; line-height: 1.2 !important; }}
            .code-digit-box {{ width: 38px !important; height: 48px !important; line-height: 48px !important; font-size: 26px !important; }}
            .footer-col {{ display: block !important; width: 100% !important; text-align: center !important; }}
            .footer-social-table {{ float: none !important; margin: 12px auto 0 auto !important; }}
        }}
    </style>
</head>
<body style="margin: 0; padding: 0; background-color: #ece8f9; background: radial-gradient(circle at 85% 15%, #e6dcfd 0%, #f6f3fc 45%, #ede6fa 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a; line-height: 1.6;">

    <!-- Wrapper Table -->
    <table role="presentation" class="email-outer-table" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #ece8f9; padding: 36px 12px;">
        <tr>
            <td align="center">
                <!-- Main Glassmorphic Card -->
                <table role="presentation" class="email-container" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 580px; background-color: #ffffff; border-radius: 32px; border: 1px solid #ebe4f9; box-shadow: 0 20px 60px rgba(124, 58, 237, 0.09), 0 2px 8px rgba(0, 0, 0, 0.02); overflow: hidden;">
                    <tr>
                        <td class="card-padding" style="padding: 38px 38px 30px 38px;">
                            
                            <!-- Header Table: Logo on Left, Security Badge on Right -->
                            <table role="presentation" class="header-table" width="100%" cellspacing="0" cellpadding="0" border="0">
                                <tr>
                                    <td valign="middle">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                                            <tr>
                                                <td style="vertical-align: middle; padding-right: 12px;">
                                                    <div style="width: 40px; height: 40px; background-color: #4f46e5; border-radius: 10px; text-align: center; line-height: 40px;">
                                                        <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 22px; font-weight: 900; color: #ffffff;">F</span>
                                                    </div>
                                                </td>
                                                <td style="vertical-align: middle;">
                                                    <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 23px; font-weight: 900; color: #0f172a; letter-spacing: 0.6px; line-height: 1;">FRANK</span><span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 23px; font-weight: 700; color: #f97316; letter-spacing: 0.6px; line-height: 1; margin-left: 4px;">Think</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    <td valign="middle" align="right" class="header-badge-col">
                                        <table role="presentation" class="header-badge-table" cellspacing="0" cellpadding="0" border="0" align="right" style="border: 1px solid #ddd6fe; background-color: #ffffff; border-radius: 20px; padding: 5px 12px; box-shadow: 0 1px 3px rgba(124, 58, 237, 0.05);">
                                            <tr>
                                                <td style="vertical-align: middle; padding-right: 6px; font-size: 13px; color: #6366f1;">
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                                        <path d="M9 12l2 2 4-4"></path>
                                                    </svg>
                                                </td>
                                                <td style="vertical-align: middle; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 700; color: #6366f1; white-space: nowrap; letter-spacing: 0.2px;">
                                                    Your Account Security
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                            <!-- Hero Section: Clean Title and Instructions -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top: 18px;">
                                <tr>
                                    <td class="hero-col" width="100%" valign="middle">
                                        <p style="margin: 12px 0 8px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; color: #6366f1; text-transform: uppercase;">PASSWORD RESET REQUEST &#8212;</p>
                                        <h1 class="hero-title" style="margin: 0 0 14px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 28px; font-weight: 900; line-height: 1.2; color: #0f172a; letter-spacing: -0.5px;">
                                            Reset your <span style="color: #4338ca;">FRANK Think</span> password
                                        </h1>
                                        <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.55; color: #64748b;">
                                            We received a request to reset your FRANK Think password. Use the verification code below to continue.
                                        </p>
                                    </td>
                                </tr>
                            </table>

                            <!-- Verification Code Panel -->
                            <div style="margin: 28px 0 20px 0; background: linear-gradient(180deg, #fbfaff 0%, #f4f0fd 100%); background-color: #f7f4fe; border: 1.5px solid #e1d8fa; border-radius: 22px; padding: 24px 14px 20px 14px; text-align: center; box-shadow: 0 4px 18px rgba(124, 58, 237, 0.05);">
                                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; font-weight: 800; letter-spacing: 2px; color: #7c3aed; text-transform: uppercase; margin-bottom: 16px;">
                                    YOUR VERIFICATION CODE
                                </div>
                                
                                <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin: 0 auto;">
                                    <tr>
                                        {code_boxes_html}
                                    </tr>
                                </table>
                                
                                <div style="margin-top: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; color: #64748b;">
                                    This code will expire in <strong style="color: #4338ca; font-weight: 800;">{expires_in_minutes} minutes</strong>.
                                </div>
                            </div>

                            <!-- Reset Password Button -->
                            {reset_btn_html}

                            <!-- Security Notices -->
                            <!-- Notice 1 -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8f6fe; border: 1px solid #ebe5f8; border-radius: 14px; padding: 13px 16px; margin-bottom: 12px;">
                                <tr>
                                    <td width="36" valign="middle" style="padding-right: 12px;">
                                        <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="width: 32px; height: 32px; background-color: #ede9fe; border-radius: 50%;">
                                            <tr>
                                                <td align="center" valign="middle" style="font-size: 15px; color: #6366f1;">
                                                    &#9201;
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                    <td valign="middle" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.5; color: #64748b;">
                                        <strong style="color: #1e1b4b; display: block; font-size: 12px;">This code will expire in <span style="color: #4338ca;">{expires_in_minutes} minutes</span>.</strong>
                                        <span>For your security, never share this code with anyone.</span>
                                    </td>
                                </tr>
                            </table>

                            <!-- Notice 2 -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="padding: 6px 12px 18px 12px;">
                                <tr>
                                    <td width="32" valign="middle" style="padding-right: 10px;">
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                            <path d="M9 12l2 2 4-4"></path>
                                        </svg>
                                    </td>
                                    <td valign="middle" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; line-height: 1.5; color: #64748b;">
                                        <strong style="color: #4338ca; display: block; font-size: 12px;">If you did not request this email, no further action is required.</strong>
                                        <span>Your FRANK Think account remains secure.</span>
                                    </td>
                                </tr>
                            </table>

                            <!-- Footer -->
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top: 1px solid #ede8fa; padding-top: 22px;">
                                <tr>
                                    <td valign="middle" class="footer-col">
                                        <p style="margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 12px; font-weight: 600; color: #64748b;">
                                            &copy; 2026 FRANK Think.
                                        </p>
                                        <p style="margin: 3px 0 0 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 11px; color: #94a3b8;">
                                            Engineered for effortless, secure communication.
                                        </p>
                                    </td>
                                    <td valign="middle" align="right" class="footer-col">
                                        <table role="presentation" class="footer-social-table" cellspacing="0" cellpadding="0" border="0" align="right">
                                            <tr>
                                                <td style="padding-left: 6px;">
                                                    <a href="{app_url}" target="_blank" rel="noopener noreferrer" style="display: block; width: 28px; height: 28px; background-color: #f1edfb; border-radius: 50%; text-align: center; line-height: 28px; color: #64748b; text-decoration: none; font-size: 11px; font-weight: 700;" title="LinkedIn">in</a>
                                                </td>
                                                <td style="padding-left: 6px;">
                                                    <a href="{app_url}" target="_blank" rel="noopener noreferrer" style="display: block; width: 28px; height: 28px; background-color: #f1edfb; border-radius: 50%; text-align: center; line-height: 28px; color: #64748b; text-decoration: none; font-size: 11px; font-weight: 700;" title="X (Twitter)">&#120143;</a>
                                                </td>
                                                <td style="padding-left: 6px;">
                                                    <a href="{app_url}" target="_blank" rel="noopener noreferrer" style="display: block; width: 28px; height: 28px; background-color: #f1edfb; border-radius: 50%; text-align: center; line-height: 28px; color: #64748b; text-decoration: none; font-size: 11px; font-weight: 700;" title="YouTube">&#9654;</a>
                                                </td>
                                                <td style="padding-left: 6px;">
                                                    <a href="{app_url}" target="_blank" rel="noopener noreferrer" style="display: block; width: 28px; height: 28px; background-color: #f1edfb; border-radius: 50%; text-align: center; line-height: 28px; color: #64748b; text-decoration: none; font-size: 13px; font-weight: 700;" title="Website">&#127760;</a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>

</body>
</html>"""

    async def send_password_reset_otp(
        self,
        to_email: str,
        otp_code: str,
        reset_link: Optional[str] = None,
        expires_in_minutes: int = 15,
    ) -> Tuple[bool, str]:
        """
        Sends a password reset email with the OTP code and direct reset link,
        rendered using the approved FRANK Think design without image attachments.
        """
        subject = f"{otp_code} is your FRANK Think password reset code"

        text_content = (
            f"FRANK Think — Password Reset Request\n\n"
            f"Reset your FRANK Think password\n"
            f"We received a request to reset your FRANK Think password. Use the verification code below to continue.\n\n"
            f"YOUR VERIFICATION CODE: {otp_code}\n\n"
            f"This code will expire in {expires_in_minutes} minutes.\n\n"
        )
        if reset_link:
            text_content += f"Reset Password directly using this link:\n{reset_link}\n\n"
        text_content += (
            f"For your security, never share this code with anyone.\n\n"
            f"If you did not request this email, no further action is required. Your FRANK Think account remains secure.\n\n"
            f"© 2026 FRANK Think. Engineered for effortless, secure communication.\n"
        )

        frontend_base = (os.getenv("FRONTEND_URL") or "").strip().rstrip("/")
        if not frontend_base or "localhost" in frontend_base or "127.0.0.1" in frontend_base:
            db_url = os.getenv("DATABASE_URL", "").lower()
            is_prod = (os.getenv("ENVIRONMENT", "").lower() == "production") or ("neon.tech" in db_url) or bool(os.getenv("VERCEL"))
            if is_prod:
                frontend_base = "https://fnk.vercel.app"
            else:
                port = os.getenv("PORT", "8000")
                frontend_base = f"http://localhost:{port}"

        html_content = self._render_password_reset_html(
            otp_code=otp_code,
            reset_link=reset_link,
            expires_in_minutes=expires_in_minutes,
            app_url=frontend_base,
        )

        return await self.send_email_async(
            to_email,
            subject,
            text_content,
            html_content,
            inline_images=None,
        )


# Global singleton instance
email_service = EmailService()
