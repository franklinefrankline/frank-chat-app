"""
FRANK Think — Animated Registration UI Redesign Verification Test Suite
Validates visual structure, design fidelity, animation definitions,
field validation, password strength meter, DPDP notice, consent checkbox,
and responsive mirroring.
"""

import os
import re
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

def test_register_html_structure():
    print("=== Testing register.html Structure and Visual Elements ===")
    reg_path = ROOT_DIR / "register.html"
    assert reg_path.exists(), f"register.html missing at {reg_path}"
    
    with open(reg_path, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Stylesheets
    assert 'href="css/register_redesign.css"' in html, "Missing register_redesign.css link"

    # 2. Left Promotional Panel
    assert "register-promo-panel" in html, "Missing left promotional panel (.register-promo-panel)"
    assert "promo-brand-header" in html, "Missing brand header"
    assert "assets/brand/frank-icon.svg" in html, "Missing official FRANK logo SVG"
    assert "Think" in html and "Chat" in html and "Create" in html and "Collaborate" in html, "Missing tagline pill words"
    assert "Create an Account" in html, "Missing 'Create an Account' heading"
    assert "Join" in html and "FRANK Think" in html, "Missing 'Join FRANK Think' in heading"
    assert "frank-gradient-text" in html, "Missing gradient text class on FRANK Think"
    assert "Get started with secure real-time messaging, document editing, and seamless collaboration." in html, "Missing description"

    # 3. Features
    assert "Real-time messaging app and group chat platform" in html, "Missing Feature 1"
    assert "Online office suite and document editing platform with file sharing" in html, "Missing Feature 2"
    assert "Private chat application and online document workspace" in html, "Missing Feature 3"

    # 4. 3D Logo Artwork Stage & 4 Orbiting Cards
    assert "frank-central-tile" in html, "Missing central floating 3D logo tile"
    assert "promo-artwork-stage" in html, "Missing promotional artwork stage"
    assert "promo-orbit-ring" in html, "Missing orbital rings"
    assert "card-messaging" in html, "Missing orbiting messaging card"
    assert "card-documents" in html, "Missing orbiting documents card"
    assert "card-cloud" in html, "Missing orbiting cloud card"
    assert "card-collab" in html, "Missing orbiting collaboration card"

    # 5. Statistics Cards
    assert "10K+" in html and "Active Users" in html, "Missing 10K+ Active Users stat card"
    assert "1M+" in html and "Documents" in html, "Missing 1M+ Documents stat card"
    assert "Secure" in html and ("&amp; Private" in html or "& Private" in html), "Missing Secure & Private stat card"

    # 6. Right Registration Glassmorphic Card
    assert "register-glass-card" in html, "Missing .register-glass-card"
    assert "card-center-logo-tile" in html, "Missing card centered logo tile"
    assert "Join FRANK for secure real-time messaging" in html, "Missing subtitle"

    # 7. Form Controls & 4 Fields Preservation
    assert 'id="registerForm"' in html, "Missing form id='registerForm'"
    assert 'id="regFullName"' in html, "Missing regFullName input"
    assert 'id="regEmail"' in html, "Missing regEmail input"
    assert 'id="regPassword"' in html, "Missing regPassword input"
    assert 'id="regConfirmPassword"' in html, "Missing regConfirmPassword input"
    assert 'id="strengthBar"' in html, "Missing strengthBar"
    assert 'id="strengthLabel"' in html, "Missing strengthLabel"
    assert 'password-toggle-btn' in html, "Missing password toggle button"
    assert 'data-target="regPassword"' in html, "Missing data-target for regPassword"
    assert 'data-target="regConfirmPassword"' in html, "Missing data-target for regConfirmPassword"

    # 8. DPDP Privacy Notice & Single Consent Checkbox
    assert "DPDP Privacy Notice" in html, "Missing DPDP Privacy Notice title"
    assert "We process your name, email, and credentials for account delivery and secure communication." in html, "Missing DPDP notice text"
    assert 'id="regTerms"' in html, "Missing regTerms consent checkbox"
    assert "I agree to the" in html and "Terms of Service" in html and "Privacy Policy" in html, "Missing consent agreement label"
    
    # Verify separate age and marketing checkboxes are removed from visible form
    assert 'id="regAgeConsent"' not in html, "Separate regAgeConsent should be removed from visible form"
    assert 'id="regOptCommunications"' not in html, "Separate regOptCommunications should be removed from visible form"

    # 9. Create Account Submit Button & OTP Step
    assert 'id="registerSubmitBtn"' in html, "Missing registerSubmitBtn"
    assert 'class="btn-text"' in html, "Missing .btn-text inside submit button"
    assert 'id="registerOtpStep"' in html, "Missing registerOtpStep container"
    assert 'id="regOtpCode"' in html, "Missing regOtpCode input"
    assert 'id="verifyOtpSubmitBtn"' in html, "Missing verifyOtpSubmitBtn"

    # 10. Links & Mobile Artwork
    assert 'href="login.html"' in html, "Missing link to login.html"
    assert 'href="privacy.html"' in html, "Missing link to privacy.html"
    assert 'open-cookie-settings' in html, "Missing cookie settings button"
    assert "mobile-top-artwork" in html, "Missing mobile-top-artwork container"

    print("  [PASS] All register.html visual, structural, and functional elements verified successfully!")

def test_register_css_definitions():
    print("=== Testing css/register_redesign.css Definitions & Animations ===")
    css_path = ROOT_DIR / "css" / "register_redesign.css"
    assert css_path.exists(), f"css/register_redesign.css missing at {css_path}"
    
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()

    # Color Palette Tokens
    required_tokens = [
        "--frank-cream", "--frank-beige", "--frank-peach",
        "--frank-orange", "--frank-brown", "--frank-navy",
        "--frank-blue", "--frank-cyan", "--frank-purple", "--frank-magenta"
    ]
    for token in required_tokens:
        assert token in css, f"Missing token {token} in CSS"

    # Animation Keyframes
    required_animations = [
        "@keyframes floatTile",
        "@keyframes pulseGlow",
        "@keyframes floatCard1",
        "@keyframes floatCard2",
        "@keyframes floatCard3",
        "@keyframes floatCard4",
        "@keyframes rotateRing",
        "@keyframes pulseBlob",
        "@keyframes floatParticle"
    ]
    for anim in required_animations:
        assert anim in css, f"Missing animation {anim} in CSS"

    # Strength bar states
    assert ".password-meter-bar.weak" in css, "Missing weak meter class"
    assert ".password-meter-bar.fair" in css, "Missing fair meter class"
    assert ".password-meter-bar.good" in css, "Missing good meter class"
    assert ".password-meter-bar.strong" in css, "Missing strong meter class"

    # Responsive Breakpoints & Accessibility
    assert "@media (max-width: 960px)" in css, "Missing mobile @media (max-width: 960px) breakpoint"
    assert "@media (prefers-reduced-motion: reduce)" in css, "Missing prefers-reduced-motion accessibility query"

    print("  [PASS] All CSS variables, animations, and responsive media queries verified successfully!")

def test_mirrors_synced():
    print("=== Testing Frontend Mirrors Synchronization for Register ===")
    mirrors = [
        ROOT_DIR / "frontend",
        ROOT_DIR / "backend" / "frontend",
        ROOT_DIR / "api" / "_backend" / "frontend",
        ROOT_DIR / "android" / "app" / "src" / "main" / "assets" / "public"
    ]

    for mirror in mirrors:
        if mirror.exists():
            reg_file = mirror / "register.html"
            css_file = mirror / "css" / "register_redesign.css"
            assert reg_file.exists(), f"register.html missing in mirror {mirror}"
            assert css_file.exists(), f"css/register_redesign.css missing in mirror {mirror}"
            
            with open(ROOT_DIR / "register.html", "r", encoding="utf-8") as f1, open(reg_file, "r", encoding="utf-8") as f2:
                assert f1.read() == f2.read(), f"register.html out of sync in {mirror}"
            with open(ROOT_DIR / "css" / "register_redesign.css", "r", encoding="utf-8") as f1, open(css_file, "r", encoding="utf-8") as f2:
                assert f1.read() == f2.read(), f"css/register_redesign.css out of sync in {mirror}"
            print(f"  [PASS] Mirror '{mirror.relative_to(ROOT_DIR)}' is 100% in sync with root!")

if __name__ == "__main__":
    test_register_html_structure()
    test_register_css_definitions()
    test_mirrors_synced()
    print("\nALL REGISTER REDESIGN VERIFICATION TESTS PASSED SUCCESSFULLY!")
