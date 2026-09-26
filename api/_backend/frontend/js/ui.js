/* -------------------------------------------------------------------------
   GLOBAL UI INTERACTIONS & CUSTOM CURSOR
   Desktop custom cursor, dropdown handlers, and landing page preview animation
   ------------------------------------------------------------------------- */

const uiModule = {
    init() {
        this.setupCustomCursor();
        this.setupDropdowns();
        this.setupLandingMobileDrawer();
        this.setupLandingPreviewAnimation();
    },

    setupCustomCursor() {
        // Disabled: Use standard system cursor
        const cursor = document.getElementById('customCursor');
        if (cursor) cursor.remove();
        const dot = document.getElementById('customCursorDot');
        if (dot) dot.remove();
    },

    setupDropdowns() {
        document.addEventListener('click', (e) => {
            // Ignore dropdown toggle if clicking copy button or language selector
            if (e.target.closest('.btn-copy-frank-id') || e.target.closest('.lang-selector-container')) {
                return;
            }

            // Dropdown trigger buttons
            const trigger = e.target.closest('[aria-haspopup="true"]');
            if (trigger) {
                const menu = trigger.querySelector('.dropdown-menu');
                if (menu) {
                    const isOpen = menu.classList.contains('show');
                    document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
                    if (!isOpen) {
                        menu.classList.add('show');
                        trigger.setAttribute('aria-expanded', 'true');
                    } else {
                        trigger.setAttribute('aria-expanded', 'false');
                    }
                }
                return;
            }

            // Click outside any open dropdown
            if (!e.target.closest('.dropdown-menu')) {
                document.querySelectorAll('.dropdown-menu.show').forEach(m => {
                    m.classList.remove('show');
                    const parentTrigger = m.closest('[aria-haspopup="true"]');
                    if (parentTrigger) parentTrigger.setAttribute('aria-expanded', 'false');
                });
            }
        });
    },

    setupLandingMobileDrawer() {
        const toggleBtn = document.getElementById('landingMobileToggle');
        const drawer = document.getElementById('landingMobileDrawer');
        const overlay = document.getElementById('landingMobileOverlay');
        const closeBtn = document.getElementById('landingMobileCloseBtn');

        if (!drawer) return;

        const openDrawer = () => {
            drawer.classList.add('open');
            if (overlay) overlay.classList.add('show');
            document.body.style.overflow = 'hidden';
        };

        const closeDrawer = () => {
            drawer.classList.remove('open');
            if (overlay) overlay.classList.remove('show');
            document.body.style.overflow = '';
        };

        if (toggleBtn) toggleBtn.addEventListener('click', openDrawer);
        if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
        if (overlay) overlay.addEventListener('click', closeDrawer);

        drawer.querySelectorAll('.landing-mobile-link, .landing-mobile-actions a').forEach(link => {
            link.addEventListener('click', closeDrawer);
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && drawer.classList.contains('open')) {
                closeDrawer();
            }
        });
    },

    setupFrankIdCopy() {
        // Global click delegation for all FRANK ID copy buttons
        document.addEventListener('click', (e) => {
            const copyBtn = e.target.closest('.btn-copy-frank-id');
            if (copyBtn) {
                e.preventDefault();
                e.stopPropagation();

                let fid = copyBtn.dataset.frankId;
                if (!fid) {
                    const container = copyBtn.closest('.frank-id-copy-group, .sidebar-user, .dropdown-user-header, .frank-id-card, .profile-card, .detail-row');
                    if (container) {
                        const badge = container.querySelector('.frank-id-badge, #sidebarUserFrankId, #menuUserFrankId, #profileFrankId, #profileCardFrankId');
                        if (badge) fid = badge.textContent;
                    }
                }
                if (!fid && typeof auth !== 'undefined' && auth.getUser) {
                    const u = auth.getUser();
                    if (u && u.frank_id) fid = u.frank_id;
                }

                copyFrankId(fid, copyBtn);
                return;
            }

            // Also support clicking directly on .frank-id-badge in sidebar
            const badge = e.target.closest('.frank-id-badge#sidebarUserFrankId');
            if (badge) {
                e.preventDefault();
                e.stopPropagation();
                const btn = badge.parentElement ? badge.parentElement.querySelector('.btn-copy-frank-id') : null;
                copyFrankId(badge.textContent, btn);
            }
        });

        // Accessible keyboard trigger (Enter / Space)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                const copyBtn = document.activeElement && document.activeElement.closest('.btn-copy-frank-id');
                if (copyBtn) {
                    e.preventDefault();
                    e.stopPropagation();
                    copyBtn.click();
                }
            }
        });
    },

    setupLandingPreviewAnimation() {
        const previewContainer = document.getElementById('previewMessagesContainer');
        if (!previewContainer) return;

        const demoScript = [
            { text: "Could you send over the updated design assets?", type: "received", delay: 2500 },
            { text: "Sending them right now! 📦", type: "sent", delay: 4500 },
            { text: "Received! The new glassmorphic theme looks stunning.", type: "received", delay: 7000 }
        ];

        demoScript.forEach(item => {
            setTimeout(() => {
                const bubble = document.createElement('div');
                bubble.className = `preview-bubble ${item.type}`;
                bubble.textContent = item.text;
                previewContainer.appendChild(bubble);
                previewContainer.scrollTop = previewContainer.scrollHeight;
            }, item.delay);
        });
    }
};

/* ---------------- REUSABLE PROFESSIONAL FRANK ID COPY FUNCTION ---------------- */
async function copyFrankId(rawId, btnEl) {
    let cleanId = '';
    if (typeof rawId === 'string') {
        cleanId = rawId.trim();
    } else if (rawId && rawId.textContent) {
        cleanId = rawId.textContent.trim();
    }

    // Fallback to active user frank_id if missing or placeholder
    if (!cleanId || cleanId === '------' || cleanId.toLowerCase() === 'loading...') {
        const u = (typeof auth !== 'undefined' && auth.getUser) ? auth.getUser() : null;
        if (u && u.frank_id) cleanId = u.frank_id.trim();
    }

    // Strip any labels such as "ID: " or "FRANK ID: " to copy strictly the 6-character code
    cleanId = cleanId.replace(/^(ID:\s*|FRANK ID:\s*)/i, '').trim();

    if (!cleanId || cleanId === '------') {
        if (typeof showToast === 'function') {
            showToast('Unable to copy FRANK ID', 'error');
        }
        return false;
    }

    let success = false;
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(cleanId);
            success = true;
        }
    } catch (err) {
        console.warn('Clipboard API error, falling back:', err);
    }

    if (!success) {
        // Fallback for non-secure contexts or legacy browsers
        try {
            const ta = document.createElement('textarea');
            ta.value = cleanId;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '0';
            ta.setAttribute('readonly', '');
            document.body.appendChild(ta);
            ta.select();
            ta.setSelectionRange(0, 99999);
            success = document.execCommand('copy');
            document.body.removeChild(ta);
        } catch (fbErr) {
            console.error('execCommand copy fallback failed:', fbErr);
        }
    }

    if (success) {
        if (typeof showToast === 'function') {
            showToast('✓ FRANK ID copied', 'success');
        }

        // Apply temporary visual feedback to button(s)
        const buttons = btnEl ? [btnEl] : Array.from(document.querySelectorAll('.btn-copy-frank-id'));
        buttons.forEach(btn => {
            if (!btn) return;
            btn.classList.add('copied');
            const copyIcon = btn.querySelector('.copy-icon');
            const checkIcon = btn.querySelector('.check-icon');
            const textEl = btn.querySelector('.copy-btn-text, .copy-btn-label');
            const prevTitle = btn.getAttribute('title') || 'Copy FRANK ID';
            const prevAria = btn.getAttribute('aria-label') || 'Copy FRANK ID';

            if (copyIcon) copyIcon.style.display = 'none';
            if (checkIcon) checkIcon.style.display = 'inline-block';
            if (textEl) textEl.textContent = 'Copied';
            btn.setAttribute('title', 'Copied');
            btn.setAttribute('aria-label', 'Copied');

            clearTimeout(btn._copyTimer);
            btn._copyTimer = setTimeout(() => {
                btn.classList.remove('copied');
                if (copyIcon) copyIcon.style.display = '';
                if (checkIcon) checkIcon.style.display = 'none';
                if (textEl) textEl.textContent = 'Copy';
                btn.setAttribute('title', prevTitle);
                btn.setAttribute('aria-label', prevAria);
            }, 1800);
        });
        return true;
    } else {
        if (typeof showToast === 'function') {
            showToast('Unable to copy FRANK ID', 'error');
        }
        return false;
    }
}

window.copyFrankId = copyFrankId;

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        uiModule.init();
        uiModule.setupFrankIdCopy();
    });
} else {
    uiModule.init();
    uiModule.setupFrankIdCopy();
}

window.uiModule = uiModule;

