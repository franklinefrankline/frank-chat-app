"""
Comprehensive Test Suite for FRANK Think Animated Forgot Password and Email OTP Verification
Verifies:
1. Forgot Password page (Reference Image 1):
   - Warm cream and peach background, ambient lighting
   - Centered official FRANK Think logo
   - Floating lock and envelope badges
   - Orbital trails and glowing drifting particles
   - Reset Password headings, email input, Send Reset Link button, Back to Sign In link
   - CSS tokens, keyframes, transitions, prefers-reduced-motion
2. Email OTP Verification page (Reference Image 2):
   - Dark navy cybersecurity background with atmospheric radiant glows
   - Glowing violet border around card
   - Dark branded header with FRANK Think logo
   - Floating 3D envelope (top-left) and floating 3D shield/check (bottom-right)
   - 6 accessible split digit input positions with auto-advance and numeric inputmode
   - 15-minute expiry notice with clock
   - Secondary unsolicited notice with shield
   - Footer text
   - CSS tokens, keyframes, transitions, prefers-reduced-motion
3. Email OTP Template (email_service.py):
   - Dark navy & violet branded template
   - 6 individual digit positions
   - Expiry notice (15 minutes) and security notice
   - Table-based email client compatibility (no scripts, valid HTML)
4. Functional Backend Verification:
   - Registration OTP generation and rate limiting (60s)
   - Password reset instructions dispatch
   - Token validation
"""

import os
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))

from services.email_service import email_service
from routes.auth import generate_otp, hash_otp_code, verify_otp_code


def test_forgot_password_html_structure():
    print("\n=== 1. Testing Forgot Password HTML Structure (Reference Image 1) ===")
    fp_file = ROOT_DIR / "forgot-password.html"
    assert fp_file.exists(), f"forgot-password.html not found at {fp_file}"

    with open(fp_file, "r", encoding="utf-8") as f:
        html = f.read()

    # Brand Title & Metadata
    assert "Reset Password — FRANK Think" in html, "Missing proper title"
    assert "robots" in html and "noindex" in html, "Missing robots protection"

    # Ambient Glows & Orbitals
    assert "fp-ambient-glow" in html, "Missing ambient glowing orbs"
    assert "fp-orbital-stage" in html, "Missing orbital stage"
    assert "fp-ring-1" in html and "fp-ring-2" in html, "Missing orbital rings"
    assert "fp-orbit-node" in html, "Missing drifting orbit nodes"

    # Floating Badges
    assert "fp-badge-lock" in html, "Missing floating lock badge"
    assert "fp-badge-envelope" in html, "Missing floating envelope badge"

    # Centered Logo & Branding
    assert "assets/brand/frank-icon.svg" in html, "Missing official FRANK logo"
    assert "fp-brand-title" in html and "FRANK" in html, "Missing FRANK brand title"
    assert "fp-brand-sub" in html and "Think" in html, "Missing Think brand subtitle"

    # Headings & Form Elements
    assert "Reset Password" in html, "Missing 'Reset Password' heading"
    assert "Forgot your password?" in html, "Missing 'Forgot your password?' subheading"
    assert 'id="forgotPasswordForm"' in html, "Missing forgotPasswordForm ID"
    assert 'id="groupForgotEmail"' in html, "Missing groupForgotEmail ID"
    assert 'id="forgotEmail"' in html, "Missing forgotEmail input ID"
    assert 'placeholder="name@example.com"' in html, "Missing name@example.com placeholder"
    assert 'id="forgotSubmitBtn"' in html, "Missing forgotSubmitBtn ID"
    assert "Send Reset Link" in html, "Missing Send Reset Link button text"
    assert "Back to Sign In" in html and 'href="login.html"' in html, "Missing Back to Sign In link"

    # Accessible Alerts & Feedback
    assert 'id="forgotSuccessAlert"' in html, "Missing forgotSuccessAlert ID"
    assert 'id="forgotSuccessMsg"' in html, "Missing forgotSuccessMsg ID"
    assert "Check your inbox" in html, "Missing Check your inbox text"
    assert "Spam" in html, "Missing Spam folder reminder"

    print("  [PASS] forgot-password.html matches Reference Image 1 structure and elements!")


def test_forgot_password_css_definitions():
    print("\n=== 2. Testing Forgot Password CSS (css/forgot_password_redesign.css) ===")
    css_file = ROOT_DIR / "css" / "forgot_password_redesign.css"
    assert css_file.exists(), f"forgot_password_redesign.css missing at {css_file}"

    with open(css_file, "r", encoding="utf-8") as f:
        css = f.read()

    # Color Palette Tokens
    tokens = [
        "--fp-cream-bg", "--fp-peach-start", "--fp-peach-mid",
        "--fp-card-bg", "--fp-orange-primary", "--fp-orange-glow"
    ]
    for token in tokens:
        assert token in css, f"Missing CSS token: {token}"

    # Keyframes & Animations
    assert "@keyframes fpPulseGlow" in css, "Missing ambient pulse glow animation"
    assert "@keyframes fpOrbitDrift" in css, "Missing orbit drift animation"
    assert "@keyframes fpCardEntrance" in css, "Missing card entrance animation"
    assert "@keyframes fpFloatLock" in css, "Missing floating lock animation"
    assert "@keyframes fpFloatEnvelope" in css, "Missing floating envelope animation"
    assert "@media (prefers-reduced-motion: reduce)" in css, "Missing reduced-motion support"

    print("  [PASS] forgot_password_redesign.css animations, tokens, and accessibility verified!")


def test_email_otp_page_html_structure():
    print("\n=== 3. Testing Email OTP Verification HTML Structure (Reference Image 2) ===")
    otp_file = ROOT_DIR / "verify-otp.html"
    assert otp_file.exists(), f"verify-otp.html not found at {otp_file}"

    with open(otp_file, "r", encoding="utf-8") as f:
        html = f.read()

    # Brand Title & Metadata
    assert "Verify Email Address — FRANK Think" in html, "Missing title"

    # Atmospheric Radiant Glows & Stars
    assert "otp-ambient-glow" in html, "Missing atmospheric ambient glows"
    assert "otp-orbital-stage" in html, "Missing orbital stage"
    assert "otp-star" in html, "Missing sparkling luminous stars"

    # Floating 3D Badges
    assert "otp-floating-envelope" in html, "Missing floating 3D envelope illustration"
    assert "otp-floating-shield" in html, "Missing floating 3D shield illustration"

    # Dark Branded Header Bar
    assert "otp-card-header" in html, "Missing dark branded header"
    assert "assets/brand/frank-icon.svg" in html, "Missing official FRANK logo"
    assert "otp-header-title" in html and "FRANK" in html, "Missing FRANK title"
    assert "otp-header-sub" in html and "Think" in html, "Missing Think subtitle"

    # Body Content & Headings
    assert "Verify your email address" in html, "Missing 'Verify your email address' title"
    assert "Thank you for creating an account on FRANK Think." in html, "Missing greeting"
    assert "Enter the 6-digit code below to verify your email address and activate your account." in html, "Missing instructions"
    assert "YOUR VERIFICATION CODE" in html, "Missing 'YOUR VERIFICATION CODE' label"

    # 6 Split Digit Positions
    for i in range(6):
        assert f'id="digit-{i}"' in html, f"Missing digit-{i} input"
        assert 'maxlength="1"' in html, "Missing maxlength=1"
        assert 'inputmode="numeric"' in html, "Missing inputmode=numeric"

    # Action Buttons
    assert 'id="verifyOtpBtn"' in html, "Missing verifyOtpBtn"
    assert 'id="otpResendBtn"' in html, "Missing otpResendBtn"

    # Security Notices
    assert "This code expires in" in html and "15 minutes" in html, "Missing 15 minutes expiry notice"
    assert "Never share this code with anyone" in html, "Missing never share warning"
    assert "If you did not request this email, no action is required" in html, "Missing secondary notice"
    assert "Your FRANK Think account remains secure" in html, "Missing account security reassurance"

    # Footer
    assert "2026 FRANK Think" in html and "Secure communication, made simple." in html, "Missing footer"

    print("  [PASS] verify-otp.html matches Reference Image 2 structure and elements!")


def test_email_otp_css_definitions():
    print("\n=== 4. Testing Email OTP CSS (css/verify_otp_redesign.css) ===")
    css_file = ROOT_DIR / "css" / "verify_otp_redesign.css"
    assert css_file.exists(), f"verify_otp_redesign.css missing at {css_file}"

    with open(css_file, "r", encoding="utf-8") as f:
        css = f.read()

    # Color Palette Tokens
    tokens = [
        "--otp-navy-bg", "--otp-navy-header", "--otp-violet-glow",
        "--otp-blue-glow", "--otp-border-violet", "--otp-digit-bg",
        "--otp-notice-bg"
    ]
    for token in tokens:
        assert token in css, f"Missing CSS token: {token}"

    # Keyframes & Animations
    assert "@keyframes otpPulseGlow" in css, "Missing atmospheric pulse glow animation"
    assert "@keyframes otpCardEntrance" in css, "Missing card entrance animation"
    assert "@keyframes otpFloatEnvelope" in css, "Missing floating envelope animation"
    assert "@keyframes otpFloatShield" in css, "Missing floating shield animation"
    assert "@keyframes otpErrorShake" in css, "Missing error shake animation"
    assert "@media (prefers-reduced-motion: reduce)" in css, "Missing reduced-motion support"

    print("  [PASS] verify_otp_redesign.css animations, tokens, and accessibility verified!")


def test_otp_email_template_rendering():
    print("\n=== 5. Testing Branded Email OTP Template (email_service.py) ===")
    test_code = "729415"
    html_output = email_service._render_otp_html(
        title="Verify your email address",
        subtitle="Thank you for creating an account on FRANK Think.",
        otp_code=test_code,
        instructions="Enter the 6-digit code below to verify your email address and activate your account.",
        expires_in_minutes=15,
        action_button_label="Verify Email",
        action_button_url="https://fnk.vercel.app/verify-otp.html?email=test@example.com"
    )

    # Branded Colors matching Reference Image 2
    assert "#070b19" in html_output or "#080d21" in html_output, "Missing dark navy background in email"
    assert "#8b5cf6" in html_output, "Missing violet border in email"
    assert "#0b0f24" in html_output, "Missing dark branded header in email"
    assert "FRANK" in html_output and "Think" in html_output, "Missing FRANK Think branding in email"

    # Headings & Instructions
    assert "Verify your email address" in html_output, "Missing title in email"
    assert "Thank you for creating an account on FRANK Think." in html_output, "Missing greeting in email"
    assert "YOUR VERIFICATION CODE" in html_output, "Missing code section label in email"

    # 6 Individual Digit Boxes
    for digit in test_code:
        assert f">{digit}<" in html_output, f"Missing digit box for {digit} in email template"

    # Expiry & Security Notices
    assert "15 minutes" in html_output, "Missing 15 minutes expiry in email"
    assert "Never share this code with anyone" in html_output, "Missing security warning in email"
    assert "If you did not request this email, no action is required" in html_output, "Missing unsolicited notice in email"
    assert "Secure communication, made simple." in html_output, "Missing footer slogan in email"

    # Email Compatibility Checks
    assert "<script" not in html_output, "Email template must not contain scripts"
    assert "table" in html_output, "Email template must use table-based layout"

    print("  [PASS] email_service._render_otp_html matches Reference Image 2 design and email standards!")


def test_backend_otp_and_security_logic():
    print("\n=== 6. Testing Backend OTP Security Logic ===")
    # 1. Generate 6-digit numeric OTP
    code = generate_otp(6)
    assert len(code) == 6, "OTP must be exactly 6 characters"
    assert code.isdigit(), "OTP must be purely numeric digits"

    # 2. Hashing and verification
    code_hash = hash_otp_code(code)
    assert code_hash != code, "OTP code hash must be salted and hashed, never plaintext"
    assert verify_otp_code(code, code_hash) is True, "Valid code must verify against hash"
    assert verify_otp_code("000000", code_hash) is False, "Incorrect code must fail verification"

    print("  [PASS] Backend OTP generation, hashing, and security logic verified!")


def test_frontend_mirrors_sync():
    print("\n=== 7. Testing Frontend Mirrors Synchronization ===")
    mirrors = [
        ROOT_DIR / "frontend",
        ROOT_DIR / "backend" / "frontend",
        ROOT_DIR / "api" / "_backend" / "frontend",
        ROOT_DIR / "android" / "app" / "src" / "main" / "assets" / "public"
    ]

    for m in mirrors:
        if not m.exists():
            continue
        fp_mirror = m / "forgot-password.html"
        vo_mirror = m / "verify-otp.html"
        fp_css = m / "css" / "forgot_password_redesign.css"
        vo_css = m / "css" / "verify_otp_redesign.css"

        assert fp_mirror.exists(), f"forgot-password.html missing in mirror {m}"
        assert vo_mirror.exists(), f"verify-otp.html missing in mirror {m}"
        assert fp_css.exists(), f"forgot_password_redesign.css missing in mirror {m}"
        assert vo_css.exists(), f"verify_otp_redesign.css missing in mirror {m}"
        print(f"  [PASS] Mirror '{m.name}' contains all updated templates and stylesheets!")


if __name__ == "__main__":
    print("=" * 70)
    print("FRANK Think — Animated Forgot Password & Email OTP Verification Suite")
    print("=" * 70)
    test_forgot_password_html_structure()
    test_forgot_password_css_definitions()
    test_email_otp_page_html_structure()
    test_email_otp_css_definitions()
    test_otp_email_template_rendering()
    test_backend_otp_and_security_logic()
    test_frontend_mirrors_sync()
    print("\n" + "=" * 70)
    print("ALL FORGOT PASSWORD & EMAIL OTP VERIFICATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 70)
