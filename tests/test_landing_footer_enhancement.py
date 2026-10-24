"""
Automated Test Suite for FRANK Think Landing Page Footer Professional Enhancement
Validates:
1. Complete preservation of existing theme (cream/beige #FFF9F0, border #D8C5AA, typography)
2. 3-section balanced layout (Left: brand & legal, Center: support/contact, Right: Think signature)
3. Responsive behavior for desktop, tablet, and mobile
4. Accessibility, focus states, and button/link behavior
5. Zero regressions in contact modal or cookie consent integration
"""

import pytest
from pathlib import Path

root_dir = Path(__file__).resolve().parent.parent
index_html_path = root_dir / "index.html"
layout_css_path = root_dir / "css" / "layout.css"
i18n_js_path = root_dir / "js" / "i18n.js"


class TestLandingPageFooterEnhancement:

    @pytest.fixture(autouse=True)
    def setup(self):
        self.html = index_html_path.read_text(encoding="utf-8")
        self.css = layout_css_path.read_text(encoding="utf-8")
        self.i18n = i18n_js_path.read_text(encoding="utf-8")

    def test_single_non_duplicate_footer(self):
        """Must have exactly one footer element on the landing page."""
        assert self.html.count('<footer class="footer">') == 1

    def test_left_section_brand_and_legal(self):
        """Left section must contain logo, brand title, copyright, and separate legal links."""
        assert "footer-left" in self.html
        assert "footer-brand-wrap" in self.html
        assert "assets/brand/frank-icon.svg" in self.html
        assert "FRANK Think" in self.html
        assert "2026 FRANK. All rights reserved." in self.html
        assert "footer-links-wrap" in self.html
        assert 'href="privacy.html"' in self.html
        assert "open-cookie-settings" in self.html
        assert "footer-legal-divider" in self.html

    def test_center_section_support_action(self):
        """Center section must contain Need Help? and Contact Administrator button with envelope icon."""
        assert "footer-center" in self.html
        assert "footer-support-section" in self.html
        assert "footer.needHelp" in self.html
        assert 'id="landingContactAdminBtn"' in self.html
        assert "footer-contact-icon" in self.html
        assert "footer.contactAdmin" in self.html

    def test_right_section_brand_signature(self):
        """Right section must contain Think brand signature with subtle styling."""
        assert "footer-right" in self.html
        assert "footer-signature" in self.html
        assert "footer.think" in self.html

    def test_desktop_grid_layout(self):
        """Desktop CSS must use balanced 3-column grid without fixed positioning."""
        assert "grid-template-columns: 1fr auto 1fr" in self.css
        # Check alignment properties
        assert "justify-self: start" in self.css
        assert "justify-self: center" in self.css
        assert "justify-self: end" in self.css
        # Ensure no fixed positioning
        footer_idx = self.css.find(".footer {")
        footer_block = self.css[footer_idx:footer_idx + 400]
        assert "position: fixed" not in footer_block

    def test_sandstone_theme_colors(self):
        """Footer must use Sandstone theme cream surface, beige border, and warm text colors."""
        assert '[data-theme="sandstone"] .footer' in self.css
        assert "#FFF9F0" in self.css, "Sandstone surface cream"
        assert "#D8C5AA" in self.css, "Sandstone border"
        assert "#67584A" in self.css, "Warm slate secondary text"
        assert "#76543B" in self.css, "Accent link color"
        assert "#F8EFE2" in self.css, "Button surface color"

    def test_monochrome_dark_theme_support(self):
        """Footer must also cleanly support Monochrome/dark mode."""
        assert '[data-theme="monochrome"] .footer' in self.css
        assert "#111111" in self.css
        assert "#2D2D2D" in self.css

    def test_tablet_and_mobile_responsive_breakpoints(self):
        """Must define distinct responsive rules for tablet (960px) and mobile (768px)."""
        assert "@media (max-width: 960px)" in self.css
        assert "@media (max-width: 768px)" in self.css
        # Find responsive mobile rule for .footer
        assert ".footer {\n        display: flex;\n        flex-direction: column;" in self.css
        assert "text-align: center" in self.css

    def test_accessibility_and_focus_states(self):
        """Interactive elements must provide clear focus-visible states and cursor pointer."""
        assert ":focus-visible" in self.css
        assert ".footer-legal-link:focus-visible" in self.css
        assert ".footer-legal-btn:focus-visible" in self.css
        assert ".footer-contact-btn:focus-visible" in self.css
        assert "outline: 2px solid" in self.css

    def test_contact_modal_listener_preserved(self):
        """The click listener on #landingContactAdminBtn must be preserved and call openContactAdminModal."""
        assert "landingContactAdminBtn" in self.html
        assert "openContactAdminModal" in self.html


if __name__ == "__main__":
    pytest.main(["-v", __file__])
