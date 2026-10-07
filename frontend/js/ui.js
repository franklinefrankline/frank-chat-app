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

    positionAnchoredMenu(menu, trigger) {
        if (!menu || !trigger) return;

        // Make menu visible offscreen/fixed to measure natural dimensions
        menu.style.visibility = 'hidden';
        menu.style.display = 'block';
        menu.style.position = 'fixed';
        menu.style.zIndex = '350';
        menu.style.maxHeight = '';
        menu.style.overflowY = 'visible';

        const triggerRect = trigger.getBoundingClientRect();
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        const margin = 8;

        let targetWidth = 268;
        if (viewportW <= 480) {
            targetWidth = Math.min(360, viewportW - (margin * 2));
        } else {
            targetWidth = Math.min(270, viewportW - (margin * 2));
        }
        menu.style.width = `${targetWidth}px`;

        const naturalHeight = menu.offsetHeight || menu.scrollHeight || 420;
        const spaceBelow = viewportH - triggerRect.bottom;
        const spaceAbove = triggerRect.top;

        let top = 0;
        let maxHeight = viewportH - (margin * 2);

        // Vertical collision: if space below is limited and space above is larger, open UPWARD
        if (spaceBelow < (naturalHeight + margin) && spaceAbove > spaceBelow) {
            top = triggerRect.top - naturalHeight - 6;
            if (top < margin) {
                top = margin;
                maxHeight = Math.max(160, triggerRect.top - margin - 6);
            } else {
                maxHeight = Math.max(160, naturalHeight);
            }
        } else {
            // Open DOWNWARD
            top = triggerRect.bottom + 6;
            if (top + naturalHeight > viewportH - margin) {
                maxHeight = Math.max(160, viewportH - top - margin);
            } else {
                maxHeight = Math.max(160, naturalHeight);
            }
        }

        menu.style.maxHeight = `${maxHeight}px`;
        menu.style.overflowY = 'auto';

        const finalHeight = menu.offsetHeight;
        if (spaceBelow < (naturalHeight + margin) && spaceAbove > spaceBelow) {
            top = Math.max(margin, triggerRect.top - finalHeight - 6);
        }

        // Horizontal alignment: anchor to trigger
        let left = 0;
        if (viewportW <= 480) {
            left = Math.max(margin, (viewportW - targetWidth) / 2);
        } else {
            const triggerCenter = triggerRect.left + (triggerRect.width / 2);
            if (triggerCenter < viewportW / 2) {
                left = triggerRect.left;
                if (left + targetWidth > viewportW - margin) {
                    left = viewportW - targetWidth - margin;
                }
            } else {
                left = triggerRect.right - targetWidth;
                if (left < margin) {
                    left = margin;
                }
            }
        }

        // Viewport bounds clamp
        left = Math.max(margin, Math.min(left, viewportW - targetWidth - margin));
        top = Math.max(margin, Math.min(top, viewportH - finalHeight - margin));

        menu.style.top = `${Math.round(top)}px`;
        menu.style.left = `${Math.round(left)}px`;
        menu.style.right = 'auto';
        menu.style.bottom = 'auto';
        menu.style.visibility = 'visible';
    },

    closeAllDropdowns() {
        document.querySelectorAll('.dropdown-menu.show, .dropdown-menu.open').forEach(m => {
            m.classList.remove('show', 'open');
            m.style.display = 'none';
            m.style.visibility = '';
            const parentTrigger = m.closest('[aria-haspopup="true"]') || document.querySelector(`[aria-controls="${m.id}"]`);
            if (parentTrigger) parentTrigger.setAttribute('aria-expanded', 'false');
        });
        document.querySelectorAll('[aria-haspopup="true"][aria-expanded="true"]').forEach(t => {
            t.setAttribute('aria-expanded', 'false');
        });
        this.activeAnchoredDropdown = null;
        this.activeAnchoredTrigger = null;
    },

    setupDropdowns() {
        window.positionAnchoredMenu = this.positionAnchoredMenu.bind(this);
        window.closeAllDropdowns = this.closeAllDropdowns.bind(this);

        document.addEventListener('click', (e) => {
            // Ignore if clicking copy button, language selector, theme toggle or desktop profile elements
            if (e.target.closest('.btn-copy-frank-id') || e.target.closest('.lang-selector-container') || e.target.closest('#desktopProfileBtn') || e.target.closest('#desktopProfileDropdown') || e.target.closest('#sidebarThemeToggleBtn, #desktopThemeToggleBtn, #themeToggleBtn, #dashboardThemeBtn')) {
                return;
            }

            // Dropdown trigger buttons
            const trigger = e.target.closest('[aria-haspopup="true"]');
            if (trigger) {
                let menu = trigger.querySelector('.dropdown-menu');
                if (!menu && trigger.id === 'sidebarUserCard') {
                    menu = document.getElementById('sidebarUserMenu');
                }

                if (menu) {
                    e.stopPropagation();
                    const isOpen = menu.classList.contains('show') || menu.classList.contains('open');
                    this.closeAllDropdowns();
                    if (!isOpen) {
                        menu.classList.add('show', 'open');
                        trigger.setAttribute('aria-expanded', 'true');
                        this.positionAnchoredMenu(menu, trigger);
                        this.activeAnchoredDropdown = menu;
                        this.activeAnchoredTrigger = trigger;
                    }
                    return;
                }
            }

            // Click outside any open dropdown
            if (!e.target.closest('.dropdown-menu')) {
                this.closeAllDropdowns();
            }
        });

        // Auto-close on link or modal click inside sidebar menu
        document.addEventListener('click', (e) => {
            const actionItem = e.target.closest('.sidebar-user-menu a, .sidebar-user-menu [data-open-modal], .sidebar-user-menu .danger');
            if (actionItem) {
                setTimeout(() => this.closeAllDropdowns(), 80);
            }
        });

        // Escape key closes active dropdown
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.activeAnchoredDropdown) {
                const trigger = this.activeAnchoredTrigger;
                this.closeAllDropdowns();
                trigger?.focus();
            }
        });

        // Trigger activation via Enter / Space on trigger
        document.addEventListener('keydown', (e) => {
            const trigger = e.target.closest('#sidebarUserCard');
            if (trigger && (e.key === 'Enter' || e.key === ' ') && !e.target.closest('.btn-copy-frank-id')) {
                e.preventDefault();
                trigger.click();
            }
        });

        // Arrow navigation inside open dropdown
        document.addEventListener('keydown', (e) => {
            if (!this.activeAnchoredDropdown) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                const items = Array.from(this.activeAnchoredDropdown.querySelectorAll('.dropdown-item:not([disabled])'));
                if (!items.length) return;
                e.preventDefault();
                const activeIdx = items.indexOf(document.activeElement);
                let nextIdx = 0;
                if (e.key === 'ArrowDown') {
                    nextIdx = activeIdx >= 0 ? (activeIdx + 1) % items.length : 0;
                } else {
                    nextIdx = activeIdx > 0 ? activeIdx - 1 : items.length - 1;
                }
                items[nextIdx].focus();
            }
        });

        // Window resize & scroll repositioning
        window.addEventListener('resize', () => {
            if (this.activeAnchoredDropdown && this.activeAnchoredTrigger) {
                this.positionAnchoredMenu(this.activeAnchoredDropdown, this.activeAnchoredTrigger);
            }
        });
        window.addEventListener('scroll', () => {
            if (this.activeAnchoredDropdown && this.activeAnchoredTrigger) {
                this.positionAnchoredMenu(this.activeAnchoredDropdown, this.activeAnchoredTrigger);
            }
        }, true);
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

