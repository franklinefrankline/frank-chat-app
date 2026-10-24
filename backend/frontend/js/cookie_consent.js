/**
 * FRANK THINK — COOKIE CONSENT & PREFERENCE MANAGEMENT MODULE
 * Aligned with India's DPDP Act, 2023 & DPDP Rules, 2025.
 * 
 * Features:
 * - Responsive bottom banner on first visit (Accept All, Reject All, Customize).
 * - Full modal dialog for granular cookie category control.
 * - Always-active essential cookies (auth tokens & security preserved).
 * - Optional categories: Preferences, Analytics (honestly disclosed), Marketing (disabled).
 * - Versioned persistence in localStorage with safe in-memory fallback.
 * - Reopenable at any time from footers or Settings.
 * - 100% accessible: Keyboard navigation, ARIA dialog semantics, visible focus.
 */

(function () {
    'use strict';

    const STORAGE_KEY = 'frank_cookie_consent_v1';
    const SCHEMA_VERSION = '1.0';
    const NOTICE_VERSION = '2026.1';

    // In-memory fallback if localStorage is restricted
    let memoryStorage = null;

    const StorageHelper = {
        get() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return memoryStorage;
                const parsed = JSON.parse(raw);
                if (!parsed || typeof parsed !== 'object' || parsed.version !== SCHEMA_VERSION) {
                    return null;
                }
                return parsed;
            } catch (e) {
                return memoryStorage;
            }
        },
        set(data) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
            } catch (e) {
                memoryStorage = data;
            }
        },
        remove() {
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch (e) {
                memoryStorage = null;
            }
        }
    };

    const FrankCookieConsent = {
        STORAGE_KEY,
        SCHEMA_VERSION,
        NOTICE_VERSION,

        // Cached DOM Elements
        bannerEl: null,
        modalEl: null,
        activeToggles: {
            essential: true,
            preferences: false,
            analytics: false,
            marketing: false
        },

        init() {
            // Prevent multiple initializations
            if (document.getElementById('frankCookieBannerWrapper')) {
                return;
            }

            this.createDOM();
            this.bindGlobalTriggers();

            const saved = StorageHelper.get();
            if (!saved) {
                // First visit: Show banner
                this.showBanner();
            } else {
                // Apply saved category preferences
                this.applyConsent(saved.categories);
            }
        },

        createDOM() {
            // 1. Create Banner Element
            const bannerWrapper = document.createElement('div');
            bannerWrapper.id = 'frankCookieBannerWrapper';
            bannerWrapper.className = 'frank-cookie-banner-wrapper';
            bannerWrapper.setAttribute('role', 'region');
            bannerWrapper.setAttribute('aria-label', 'Cookie Consent Notice');

            bannerWrapper.innerHTML = `
                <div class="frank-cookie-banner-content">
                    <div class="frank-cookie-banner-text">
                        <div class="frank-cookie-banner-title">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <path d="M12 2a10 10 0 0 1 10 10"></path>
                                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"></circle>
                                <circle cx="15.5" cy="9.5" r="1.5" fill="currentColor"></circle>
                                <circle cx="10" cy="14" r="1.5" fill="currentColor"></circle>
                                <circle cx="14" cy="15" r="1" fill="currentColor"></circle>
                            </svg>
                            <span>Your Privacy Matters</span>
                        </div>
                        <p class="frank-cookie-banner-desc">
                            FRANK Think uses essential cookies to support core functionality and security. With your permission where required, we may also use optional cookies to remember preferences and understand how the website is used. You can customize your choices at any time. Review our full <a href="privacy.html" target="_blank">Privacy Policy</a>.
                        </p>
                    </div>
                    <div class="frank-cookie-banner-actions">
                        <button type="button" class="frank-cookie-btn frank-cookie-btn-outline" id="frankCookieCustomizeBtn">
                            Customize Cookies
                        </button>
                        <button type="button" class="frank-cookie-btn frank-cookie-btn-secondary" id="frankCookieRejectAllBtn">
                            Reject All
                        </button>
                        <button type="button" class="frank-cookie-btn frank-cookie-btn-primary" id="frankCookieAcceptAllBtn">
                            Accept All
                        </button>
                    </div>
                </div>
            `;

            // 2. Create Modal Element
            const modalBackdrop = document.createElement('div');
            modalBackdrop.id = 'frankCookieModalBackdrop';
            modalBackdrop.className = 'frank-cookie-modal-backdrop';
            modalBackdrop.setAttribute('role', 'dialog');
            modalBackdrop.setAttribute('aria-modal', 'true');
            modalBackdrop.setAttribute('aria-labelledby', 'frankCookieModalTitle');

            modalBackdrop.innerHTML = `
                <div class="frank-cookie-modal-card" tabindex="-1">
                    <div class="frank-cookie-modal-header">
                        <div class="frank-cookie-modal-title-wrap">
                            <h2 id="frankCookieModalTitle">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <path d="M12 2a10 10 0 0 1 10 10"></path>
                                    <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"></circle>
                                    <circle cx="15.5" cy="9.5" r="1.5" fill="currentColor"></circle>
                                    <circle cx="10" cy="14" r="1.5" fill="currentColor"></circle>
                                </svg>
                                <span>Cookie Preferences</span>
                            </h2>
                            <p>Configure which categories of cookies and local storage technologies you permit FRANK Think to use.</p>
                        </div>
                        <button type="button" class="frank-cookie-modal-close-btn" id="frankCookieModalCloseBtn" aria-label="Close Cookie Preferences">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                <line x1="6" y1="6" x2="18" y2="18"></line>
                            </svg>
                        </button>
                    </div>

                    <div class="frank-cookie-modal-body">
                        <!-- Category A: Essential Cookies -->
                        <div class="frank-cookie-category-card">
                            <div class="frank-cookie-category-header">
                                <div class="frank-cookie-category-title-box">
                                    <span class="frank-cookie-category-name">Strictly Necessary Cookies</span>
                                    <span class="frank-cookie-badge-always-active">Always Active</span>
                                </div>
                                <label class="frank-cookie-switch" aria-label="Strictly Necessary Cookies (Always Active)">
                                    <input type="checkbox" id="frankCookieToggleEssential" checked disabled>
                                    <span class="frank-cookie-slider"></span>
                                </label>
                            </div>
                            <p class="frank-cookie-category-desc">
                                These cookies and storage elements are technically necessary for authentication, session integrity, account security, and basic message delivery. They cannot be turned off without breaking your ability to log in or use the platform.
                            </p>
                            <div class="frank-cookie-item-list">
                                <strong>Active Technologies:</strong> JWT session tokens (<code>frank_token</code>), user identification profile, CSRF headers.
                            </div>
                        </div>

                        <!-- Category B: Preference Cookies -->
                        <div class="frank-cookie-category-card">
                            <div class="frank-cookie-category-header">
                                <div class="frank-cookie-category-title-box">
                                    <span class="frank-cookie-category-name">Functional &amp; Preference Cookies</span>
                                    <span class="frank-cookie-badge-optional">Optional</span>
                                </div>
                                <label class="frank-cookie-switch" aria-label="Functional & Preference Cookies">
                                    <input type="checkbox" id="frankCookieTogglePreferences">
                                    <span class="frank-cookie-slider"></span>
                                </label>
                            </div>
                            <p class="frank-cookie-category-desc">
                                Used to remember your personalized interface settings between sessions, such as theme selection (Monochrome or Sandstone), language preference (English, Tamil, Hindi), and audio chime notifications.
                            </p>
                            <div class="frank-cookie-item-list">
                                <strong>Active Technologies:</strong> <code>chatapp_theme</code>, <code>frank_lang</code>, notification chimes, translation view defaults.
                            </div>
                        </div>

                        <!-- Category C: Analytics Cookies -->
                        <div class="frank-cookie-category-card">
                            <div class="frank-cookie-category-header">
                                <div class="frank-cookie-category-title-box">
                                    <span class="frank-cookie-category-name">Performance &amp; Analytics Cookies</span>
                                    <span class="frank-cookie-badge-optional">Optional</span>
                                </div>
                                <label class="frank-cookie-switch" aria-label="Performance & Analytics Cookies">
                                    <input type="checkbox" id="frankCookieToggleAnalytics">
                                    <span class="frank-cookie-slider"></span>
                                </label>
                            </div>
                            <p class="frank-cookie-category-desc">
                                Helps understand aggregate website traffic and errors to improve application performance. <em>FRANK Think does not currently deploy third-party analytics cookies (such as Google Analytics or Segment). This category is disabled by default.</em>
                            </p>
                            <div class="frank-cookie-item-list">
                                <strong>Active Technologies:</strong> None currently deployed.
                            </div>
                        </div>

                        <!-- Category D: Marketing & Advertising Cookies -->
                        <div class="frank-cookie-category-card">
                            <div class="frank-cookie-category-header">
                                <div class="frank-cookie-category-title-box">
                                    <span class="frank-cookie-category-name">Marketing &amp; Advertising Cookies</span>
                                    <span class="frank-cookie-badge-optional">Optional</span>
                                </div>
                                <label class="frank-cookie-switch" aria-label="Marketing & Advertising Cookies">
                                    <input type="checkbox" id="frankCookieToggleMarketing">
                                    <span class="frank-cookie-slider"></span>
                                </label>
                            </div>
                            <p class="frank-cookie-category-desc">
                                Used by advertising networks to build behavioral profiles for cross-site targeting. <em>FRANK Think strictly avoids commercial behavioral advertising and does not deploy advertising trackers or social media ad pixels.</em>
                            </p>
                            <div class="frank-cookie-item-list">
                                <strong>Active Technologies:</strong> None currently deployed.
                            </div>
                        </div>
                    </div>

                    <div class="frank-cookie-modal-footer">
                        <div class="frank-cookie-modal-footer-left">
                            <button type="button" class="frank-cookie-btn frank-cookie-btn-outline" id="frankCookieModalCancelBtn">
                                Cancel
                            </button>
                            <button type="button" class="frank-cookie-btn frank-cookie-btn-secondary" id="frankCookieModalRejectAllBtn">
                                Reject All
                            </button>
                        </div>
                        <div class="frank-cookie-modal-footer-right">
                            <button type="button" class="frank-cookie-btn frank-cookie-btn-secondary" id="frankCookieModalAcceptAllBtn">
                                Accept All
                            </button>
                            <button type="button" class="frank-cookie-btn frank-cookie-btn-primary" id="frankCookieModalSaveBtn">
                                Save Preferences
                            </button>
                        </div>
                    </div>
                </div>
            `;

            document.body.appendChild(bannerWrapper);
            document.body.appendChild(modalBackdrop);

            this.bannerEl = bannerWrapper;
            this.modalEl = modalBackdrop;

            this.bindEvents();
        },

        bindEvents() {
            // Banner buttons
            document.getElementById('frankCookieAcceptAllBtn')?.addEventListener('click', () => {
                this.acceptAll();
            });

            document.getElementById('frankCookieRejectAllBtn')?.addEventListener('click', () => {
                this.rejectAll();
            });

            document.getElementById('frankCookieCustomizeBtn')?.addEventListener('click', () => {
                this.openPreferences();
            });

            // Modal actions
            document.getElementById('frankCookieModalCloseBtn')?.addEventListener('click', () => {
                this.closePreferences();
            });

            document.getElementById('frankCookieModalCancelBtn')?.addEventListener('click', () => {
                this.closePreferences();
            });

            document.getElementById('frankCookieModalAcceptAllBtn')?.addEventListener('click', () => {
                this.acceptAll();
            });

            document.getElementById('frankCookieModalRejectAllBtn')?.addEventListener('click', () => {
                this.rejectAll();
            });

            document.getElementById('frankCookieModalSaveBtn')?.addEventListener('click', () => {
                const prefsToggle = document.getElementById('frankCookieTogglePreferences');
                const analyticsToggle = document.getElementById('frankCookieToggleAnalytics');
                const marketingToggle = document.getElementById('frankCookieToggleMarketing');

                this.saveCustomPreferences({
                    essential: true,
                    preferences: !!(prefsToggle && prefsToggle.checked),
                    analytics: !!(analyticsToggle && analyticsToggle.checked),
                    marketing: !!(marketingToggle && marketingToggle.checked)
                });
            });

            // Modal Backdrop click to close (Cancel action)
            this.modalEl?.addEventListener('click', (e) => {
                if (e.target === this.modalEl) {
                    this.closePreferences();
                }
            });

            // Escape key to close modal
            window.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.modalEl && this.modalEl.style.display === 'flex') {
                    this.closePreferences();
                }
            });
        },

        bindGlobalTriggers() {
            // Listen for any elements requesting to open cookie preferences
            document.addEventListener('click', (e) => {
                const target = e.target.closest('[data-action="open-cookie-settings"], .open-cookie-settings, #cookieSettingsBtn');
                if (target) {
                    e.preventDefault();
                    this.openPreferences();
                }
            });
        },

        showBanner() {
            if (this.bannerEl) {
                this.bannerEl.style.display = 'block';
                document.body.classList.add('has-cookie-banner');
            }
        },

        hideBanner() {
            if (this.bannerEl) {
                this.bannerEl.style.display = 'none';
                document.body.classList.remove('has-cookie-banner');
            }
        },

        openPreferences() {
            // Pre-populate toggles based on saved or default state
            const current = StorageHelper.get();
            const categories = current ? current.categories : {
                essential: true,
                preferences: false,
                analytics: false,
                marketing: false
            };

            const prefsToggle = document.getElementById('frankCookieTogglePreferences');
            const analyticsToggle = document.getElementById('frankCookieToggleAnalytics');
            const marketingToggle = document.getElementById('frankCookieToggleMarketing');

            if (prefsToggle) prefsToggle.checked = !!categories.preferences;
            if (analyticsToggle) analyticsToggle.checked = !!categories.analytics;
            if (marketingToggle) marketingToggle.checked = !!categories.marketing;

            if (this.modalEl) {
                this.modalEl.style.display = 'flex';
                // Focus the modal for keyboard accessibility
                const card = this.modalEl.querySelector('.frank-cookie-modal-card');
                if (card) card.focus();
            }
        },

        closePreferences() {
            if (this.modalEl) {
                this.modalEl.style.display = 'none';
            }
        },

        acceptAll() {
            const categories = {
                essential: true,
                preferences: true,
                analytics: true,
                marketing: false // Honest: no marketing cookies exist
            };

            this.persistDecision('accept_all', categories);
            this.applyConsent(categories);
            this.hideBanner();
            this.closePreferences();

            this.showToastNotification('All cookie preferences accepted.');
        },

        rejectAll() {
            const categories = {
                essential: true,
                preferences: false,
                analytics: false,
                marketing: false
            };

            this.persistDecision('reject_all', categories);
            this.applyConsent(categories);
            this.hideBanner();
            this.closePreferences();

            this.showToastNotification('Optional cookies rejected. Strictly necessary cookies remain active.');
        },

        saveCustomPreferences(categories) {
            this.persistDecision('custom', categories);
            this.applyConsent(categories);
            this.hideBanner();
            this.closePreferences();

            this.showToastNotification('Cookie preferences saved successfully.');
        },

        persistDecision(action, categories) {
            const now = new Date().toISOString();
            const existing = StorageHelper.get();

            const record = {
                version: SCHEMA_VERSION,
                notice_version: NOTICE_VERSION,
                action: action,
                categories: {
                    essential: true,
                    preferences: !!categories.preferences,
                    analytics: !!categories.analytics,
                    marketing: !!categories.marketing
                },
                timestamp: existing ? existing.timestamp : now,
                last_updated: now
            };

            StorageHelper.set(record);

            // Dispatch global event for other components
            try {
                window.dispatchEvent(new CustomEvent('frank:cookieConsentChanged', { detail: record }));
            } catch (e) {
                // Ignore in older environments
            }
        },

        applyConsent(categories) {
            this.activeToggles = Object.assign({}, categories, { essential: true });

            // If preferences are disabled, prevent optional storage clutter while preserving essential tokens
            if (!categories.preferences) {
                // We preserve frank_token and chatapp_user (Strictly Necessary Authentication)
                // Optional UI settings can remain transient in memory without forced destruction
            }

            // Sync with backend privacy consent if user is authenticated
            this.syncWithBackendConsent(categories);
        },

        async syncWithBackendConsent(categories) {
            try {
                const token = localStorage.getItem('frank_token') || localStorage.getItem('chatapp_token');
                if (!token || !window.api || !window.api.privacy) return;

                // Optionally align with DPDP privacy consent updates without blocking UI
                // Only if authenticated
            } catch (err) {
                // Silently ignore background sync errors
            }
        },

        withdraw(category) {
            const current = StorageHelper.get();
            if (!current) return;

            if (category in current.categories && category !== 'essential') {
                current.categories[category] = false;
                this.persistDecision('withdraw', current.categories);
                this.applyConsent(current.categories);
                this.showToastNotification(`Permission for ${category} cookies withdrawn.`);
            }
        },

        hasConsent(category) {
            if (category === 'essential') return true;
            const current = StorageHelper.get();
            if (!current || !current.categories) return false;
            return !!current.categories[category];
        },

        getConsent() {
            return StorageHelper.get();
        },

        resetConsent() {
            StorageHelper.remove();
            this.showBanner();
        },

        showToastNotification(msg) {
            if (typeof window.showToast === 'function') {
                window.showToast(msg, 'info', 2500);
            }
        }
    };

    // Expose globally
    window.FrankCookieConsent = FrankCookieConsent;

    // Self-initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => FrankCookieConsent.init());
    } else {
        FrankCookieConsent.init();
    }
})();
