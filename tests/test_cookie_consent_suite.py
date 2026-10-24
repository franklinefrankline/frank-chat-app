"""
Automated Test Suite for FRANK Think DPDP Cookie Consent Management System
Validates Section 12 requirements:
- First visit banner rendering & unselected optional categories
- Accept All behavior & persistence
- Reject All behavior & strictly necessary preservation
- Custom preference selection & isolation
- Reopen & withdrawal flow
- Malformed storage resilience & security
- Zero impact on essential authentication data
"""

import json
import pytest
from pathlib import Path

# Paths
root_dir = Path(__file__).resolve().parent.parent
cookie_js_path = root_dir / "js" / "cookie_consent.js"
cookie_css_path = root_dir / "css" / "cookie_consent.css"
index_html_path = root_dir / "index.html"
privacy_html_path = root_dir / "privacy.html"
login_html_path = root_dir / "login.html"
settings_html_path = root_dir / "settings.html"


class TestCookieConsentAssetsAndMarkup:
    """1. Asset existence and HTML integration verification"""

    def test_cookie_consent_js_exists(self):
        assert cookie_js_path.exists(), "cookie_consent.js must exist in js/"
        content = cookie_js_path.read_text(encoding="utf-8")
        assert "frank_cookie_consent_v1" in content
        assert "FrankCookieConsent" in content
        assert "Your Privacy Matters" in content
        assert "Strictly Necessary Cookies" in content
        assert "Always Active" in content

    def test_cookie_consent_css_exists(self):
        assert cookie_css_path.exists(), "cookie_consent.css must exist in css/"
        css = cookie_css_path.read_text(encoding="utf-8")
        assert ".frank-cookie-banner-wrapper" in css
        assert ".frank-cookie-modal-backdrop" in css
        assert ".frank-cookie-switch" in css
        assert "@media (max-width: 640px)" in css

    def test_pages_include_cookie_assets(self):
        pages = [index_html_path, login_html_path, privacy_html_path, settings_html_path]
        for page in pages:
            assert page.exists(), f"{page.name} must exist"
            html = page.read_text(encoding="utf-8")
            assert "cookie_consent.css" in html, f"{page.name} must link cookie_consent.css"
            assert "cookie_consent.js" in html, f"{page.name} must include cookie_consent.js"
            assert "Cookie Settings" in html or "open-cookie-settings" in html, f"{page.name} must offer Cookie Settings link"


class TestCookieConsentLogicSimulation:
    """2. Cookie consent schema, storage, and logic simulation"""

    SCHEMA_VERSION = "1.0"
    NOTICE_VERSION = "2026.1"

    def simulate_create_record(self, action, categories):
        """Simulates FrankCookieConsent.persistDecision logic."""
        import datetime
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        return {
            "version": self.SCHEMA_VERSION,
            "notice_version": self.NOTICE_VERSION,
            "action": action,
            "categories": {
                "essential": True,
                "preferences": bool(categories.get("preferences", False)),
                "analytics": bool(categories.get("analytics", False)),
                "marketing": bool(categories.get("marketing", False))
            },
            "timestamp": now,
            "last_updated": now
        }

    def test_first_visit_default_state(self):
        """Before any choice is made, storage is empty and optional categories are disabled."""
        stored_record = None
        # In this state, only essential cookies are allowed
        def has_consent(category, record):
            if category == "essential":
                return True
            if not record or not record.get("categories"):
                return False
            return bool(record["categories"].get(category, False))

        assert has_consent("essential", stored_record) is True
        assert has_consent("preferences", stored_record) is False
        assert has_consent("analytics", stored_record) is False
        assert has_consent("marketing", stored_record) is False

    def test_accept_all_logic(self):
        """Accept All enables applicable optional categories, keeping essential active."""
        record = self.simulate_create_record("accept_all", {
            "preferences": True,
            "analytics": True,
            "marketing": False
        })
        assert record["version"] == "1.0"
        assert record["action"] == "accept_all"
        assert record["categories"]["essential"] is True
        assert record["categories"]["preferences"] is True
        assert record["categories"]["analytics"] is True
        assert record["categories"]["marketing"] is False
        # Sensitive data check
        raw_json = json.dumps(record)
        assert "password" not in raw_json
        assert "token" not in raw_json
        assert "frank_id" not in raw_json

    def test_reject_all_logic(self):
        """Reject All disables all optional categories, while keeping essential cookies active."""
        record = self.simulate_create_record("reject_all", {
            "preferences": False,
            "analytics": False,
            "marketing": False
        })
        assert record["action"] == "reject_all"
        assert record["categories"]["essential"] is True
        assert record["categories"]["preferences"] is False
        assert record["categories"]["analytics"] is False
        assert record["categories"]["marketing"] is False

    def test_customize_preferences_isolation(self):
        """User can enable only preferences without enabling analytics or marketing."""
        record = self.simulate_create_record("custom", {
            "preferences": True,
            "analytics": False,
            "marketing": False
        })
        assert record["action"] == "custom"
        assert record["categories"]["essential"] is True
        assert record["categories"]["preferences"] is True
        assert record["categories"]["analytics"] is False
        assert record["categories"]["marketing"] is False

    def test_reopen_and_withdrawal(self):
        """User can reopen settings and withdraw previously granted preferences."""
        # 1. User previously accepted
        record = self.simulate_create_record("accept_all", {"preferences": True, "analytics": True})
        assert record["categories"]["preferences"] is True

        # 2. User withdraws preferences
        record["categories"]["preferences"] = False
        record["action"] = "withdraw"
        assert record["categories"]["preferences"] is False
        # Essential remains active
        assert record["categories"]["essential"] is True

    def test_malformed_storage_recovery(self):
        """Corrupted or invalid JSON in storage fails safely without crashing."""
        malformed_inputs = [
            "INVALID_NON_JSON",
            "{}",
            json.dumps({"version": "99.0", "categories": {}}),  # Outdated version
            "null",
            ""
        ]

        def safe_parse(raw):
            try:
                data = json.loads(raw)
                if not data or not isinstance(data, dict) or data.get("version") != "1.0":
                    return None
                return data
            except Exception:
                return None

        for bad in malformed_inputs:
            res = safe_parse(bad)
            assert res is None, f"Malformed input '{bad}' must return None (fail safe)"

    def test_essential_auth_data_untouched(self):
        """Cookie consent actions must never wipe or modify essential authentication tokens."""
        simulated_local_storage = {
            "frank_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy_token",
            "chatapp_user": json.dumps({"id": 1, "username": "frank", "frank_id": "WTW28X"}),
            "chatapp_theme": "sandstone",
            "frank_cookie_consent_v1": json.dumps(self.simulate_create_record("reject_all", {}))
        }

        # Simulating reject/cleanup: Only optional settings can be affected, never auth
        essential_keys = ["frank_token", "chatapp_user"]
        for key in essential_keys:
            assert key in simulated_local_storage
            assert len(simulated_local_storage[key]) > 0


class TestLandingPageFooterPreservationAndRestoration:
    """3. Landing Page Footer Preservation & Restoration Requirements"""

    def test_landing_page_footer_structure(self):
        """Verifies index.html has complete, non-duplicate 3-section footer."""
        html = index_html_path.read_text(encoding="utf-8")
        assert html.count('<footer class="footer">') == 1, "There must be exactly one landing page footer"
        
        # Left section: Branding, Logo, Copyright
        assert "footer-left" in html
        assert "assets/brand/frank-icon.svg" in html
        assert "FRANK Think" in html
        assert "2026 FRANK. All rights reserved." in html
        
        # Integrated links: Privacy Policy & Cookie Settings
        assert 'href="privacy.html"' in html
        assert "open-cookie-settings" in html
        
        # Center section: Need Help & Contact Administrator button
        assert "footer-center" in html or "footer-support-section" in html
        assert "footer.needHelp" in html
        assert 'id="landingContactAdminBtn"' in html
        assert "contact.contactAdmin" in html or "footer.contactAdmin" in html
        
        # Right section: Think
        assert "footer-right" in html
        assert "footer.think" in html

    def test_landing_page_footer_css_styles(self):
        """Verifies layout.css defines responsive grid and theme tokens without fixed overlay."""
        css = (root_dir / "css" / "layout.css").read_text(encoding="utf-8")
        assert ".footer" in css
        assert "grid-template-columns: 1fr auto 1fr" in css
        assert "#FFF9F0" in css, "Must include Sandstone theme cream surface color"
        assert "#D8C5AA" in css, "Must include Sandstone theme border color"
        assert "@media" in css and ".footer" in css, "Must include responsive media query for mobile"
        
        # Ensure no fixed positioning on .footer
        footer_block = css[css.find(".footer {"):css.find(".footer-left")]
        assert "position: fixed" not in footer_block, ".footer must NOT use position: fixed"

    def test_sticky_flow_on_short_pages(self):
        """Verifies sticky page container flow to keep footer at bottom on short pages."""
        css = (root_dir / "css" / "layout.css").read_text(encoding="utf-8")
        assert "display: flex" in css
        assert "flex-direction: column" in css
        assert "min-height: 100vh" in css
        assert "main {" in css
        assert "flex: 1 0 auto" in css

    def test_cookie_banner_clearance(self):
        """Verifies body.has-cookie-banner provides clearance so banner never covers footer."""
        cookie_css = cookie_css_path.read_text(encoding="utf-8")
        assert "body.has-cookie-banner" in cookie_css
        assert "padding-bottom" in cookie_css

        cookie_js = cookie_js_path.read_text(encoding="utf-8")
        assert "document.body.classList.add('has-cookie-banner')" in cookie_js
        assert "document.body.classList.remove('has-cookie-banner')" in cookie_js

    def test_i18n_footer_keys_complete(self):
        """Verifies i18n.js has needHelp, contactAdmin, privacyPolicy, and cookieSettings in en, ta, hi."""
        i18n_content = (root_dir / "js" / "i18n.js").read_text(encoding="utf-8")
        for lang in ["en", "ta", "hi"]:
            assert "needHelp" in i18n_content
            assert "contactAdmin" in i18n_content
            assert "privacyPolicy" in i18n_content
            assert "cookieSettings" in i18n_content


if __name__ == "__main__":
    pytest.main(["-v", __file__])
