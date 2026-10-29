"""
FRANK Think — Animated Login UI Redesign Verification Test Suite
Validates visual structure, design fidelity, animation definitions,
authentication element preservation, and responsive mirroring.
"""

import os
import re
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

def test_login_html_structure():
    print("=== Testing login.html Structure and Visual Elements ===")
    login_path = ROOT_DIR / "login.html"
    assert login_path.exists(), f"login.html missing at {login_path}"
    
    with open(login_path, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Stylesheets
    assert 'href="css/login_redesign.css"' in html, "Missing login_redesign.css link"

    # 2. Left Promotional Panel
    assert "login-promo-panel" in html, "Missing left promotional panel (.login-promo-panel)"
    assert "promo-brand-header" in html, "Missing brand header"
    assert "assets/brand/frank-icon.svg" in html, "Missing official FRANK logo SVG"
    assert "Think" in html and "Chat" in html and "Create" in html and "Collaborate" in html, "Missing tagline pill words"
    assert "Welcome Back" in html, "Missing 'Welcome Back' heading"
    assert "to" in html and "FRANK Think" in html, "Missing 'to FRANK Think' in heading"
    assert "frank-gradient-text" in html, "Missing gradient text class on FRANK Think"
    assert "Your all-in-one platform for messaging, document editing, and seamless collaboration." in html, "Missing description"

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
    assert "Secure" in html and "&amp; Private" in html or "& Private" in html, "Missing Secure & Private stat card"

    # 6. Right Login Glassmorphic Card
    assert "login-glass-card" in html, "Missing .login-glass-card"
    assert "card-center-logo-tile" in html, "Missing card centered logo tile"
    assert "Sign In" in html, "Missing 'Sign In' title"
    assert "Enter your credentials to access your FRANK account" in html, "Missing card subtitle"

    # 7. Form Controls & Authentication IDs (Preservation)
    assert 'id="loginForm"' in html, "Missing form id='loginForm'"
    assert 'id="groupUsername"' in html, "Missing groupUsername container"
    assert 'id="loginUsername"' in html, "Missing loginUsername input"
    assert 'id="errorUsername"' in html, "Missing errorUsername container"
    assert 'id="groupPassword"' in html, "Missing groupPassword container"
    assert 'id="loginPassword"' in html, "Missing loginPassword input"
    assert 'id="errorPassword"' in html, "Missing errorPassword container"
    assert 'class="password-toggle-btn input-icon-btn"' in html or 'password-toggle-btn' in html, "Missing password visibility toggle"
    assert 'data-target="loginPassword"' in html, "Missing data-target on password toggle"
    assert 'id="rememberMe"' in html, "Missing rememberMe checkbox"
    assert 'href="forgot-password.html"' in html, "Missing forgot password link"
    assert 'id="loginSubmitBtn"' in html, "Missing loginSubmitBtn submit button"
    assert 'class="btn-text"' in html, "Missing .btn-text inside submit button"
    assert 'id="disabledAccountBanner"' in html, "Missing disabledAccountBanner"
    assert 'id="contactAdminDisabledBtn"' in html, "Missing contactAdminDisabledBtn"

    # 8. Social Login Providers & Links (Google Only)
    assert "OR CONTINUE WITH" in html, "Missing OR CONTINUE WITH divider"
    assert 'id="ssoGoogleBtn"' in html, "Missing Google SSO button"
    assert 'id="ssoAppleBtn"' not in html, "Apple SSO button should be removed"
    assert 'id="ssoMicrosoftBtn"' not in html, "Microsoft SSO button should be removed"
    assert 'href="register.html"' in html, "Missing link to register.html"
    assert 'href="privacy.html"' in html, "Missing link to privacy.html"
    assert 'open-cookie-settings' in html, "Missing cookie settings button"

    # 9. Mobile Compact Artwork
    assert "mobile-top-artwork" in html, "Missing mobile-top-artwork container"

    print("  [PASS] All login.html visual, structural, and functional elements verified successfully!")

def test_login_css_definitions():
    print("=== Testing css/login_redesign.css Definitions & Animations ===")
    css_path = ROOT_DIR / "css" / "login_redesign.css"
    assert css_path.exists(), f"css/login_redesign.css missing at {css_path}"
    
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

    # Responsive Breakpoints & Accessibility
    assert "@media (max-width: 960px)" in css, "Missing mobile @media (max-width: 960px) breakpoint"
    assert "@media (prefers-reduced-motion: reduce)" in css, "Missing prefers-reduced-motion accessibility query"

    print("  [PASS] All CSS variables, animations, and responsive media queries verified successfully!")

def test_mirrors_synced():
    print("=== Testing Frontend Mirrors Synchronization ===")
    mirrors = [
        ROOT_DIR / "frontend",
        ROOT_DIR / "backend" / "frontend",
        ROOT_DIR / "api" / "_backend" / "frontend",
        ROOT_DIR / "android" / "app" / "src" / "main" / "assets" / "public"
    ]

    for mirror in mirrors:
        if mirror.exists():
            login_file = mirror / "login.html"
            css_file = mirror / "css" / "login_redesign.css"
            assert login_file.exists(), f"login.html missing in mirror {mirror}"
            assert css_file.exists(), f"css/login_redesign.css missing in mirror {mirror}"
            
            # Verify mirror contents match root
            with open(ROOT_DIR / "login.html", "r", encoding="utf-8") as f1, open(login_file, "r", encoding="utf-8") as f2:
                assert f1.read() == f2.read(), f"login.html out of sync in {mirror}"
            with open(ROOT_DIR / "css" / "login_redesign.css", "r", encoding="utf-8") as f1, open(css_file, "r", encoding="utf-8") as f2:
                assert f1.read() == f2.read(), f"css/login_redesign.css out of sync in {mirror}"
            print(f"  [PASS] Mirror '{mirror.relative_to(ROOT_DIR)}' is 100% in sync with root!")

if __name__ == "__main__":
    test_login_html_structure()
    test_login_css_definitions()
    test_mirrors_synced()
    print("\nALL LOGIN REDESIGN VERIFICATION TESTS PASSED SUCCESSFULLY!")
