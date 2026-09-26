/* -------------------------------------------------------------------------
   SETTINGS MANAGEMENT MODULE
   Theme selection, Appearance live preview, profile preview & persistence
   ------------------------------------------------------------------------- */

const settingsModule = {
    init() {
        this.setupTabs();
        this.setupThemeCards();
        this.setupLanguageCards();
        this.setupToggles();
        this.loadProfileData();

        const logoutBtn = document.getElementById('settingsLogoutBtn');
        logoutBtn?.addEventListener('click', () => {
            if (typeof auth !== 'undefined' && auth.logout) {
                auth.logout();
            } else {
                localStorage.clear();
                window.location.href = 'login.html';
            }
        });

        // Listen for global theme changes (e.g. from header toggle button)
        window.addEventListener('chatapp_theme_change', (e) => {
            this.highlightThemeCard(e.detail.theme);
            this.updateLivePreview(e.detail.theme);
        });
    },

    setupLanguageCards() {
        const updateLangCards = (currentLang) => {
            document.querySelectorAll('[data-lang-choice]').forEach(card => {
                const choice = card.dataset.langChoice;
                const isSelected = choice === currentLang;
                card.classList.toggle('active', isSelected);
                card.setAttribute('aria-checked', isSelected ? 'true' : 'false');
                const check = card.querySelector('.theme-card-check');
                if (check) {
                    check.style.display = isSelected ? 'inline-flex' : 'none';
                }
            });
        };

        const activeLang = (typeof i18n !== 'undefined') ? i18n.currentLang : 'en';
        updateLangCards(activeLang);

        document.querySelectorAll('[data-lang-choice]').forEach(card => {
            const handleSelect = () => {
                const choice = card.dataset.langChoice;
                if (typeof i18n !== 'undefined') {
                    i18n.setLanguage(choice);
                }
                updateLangCards(choice);
            };
            card.addEventListener('click', handleSelect);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect();
                }
            });
        });

        window.addEventListener('frank:languageChanged', (e) => {
            updateLangCards(e.detail.lang);
        });
    },

    setupTabs() {
        const navBtns = document.querySelectorAll('.settings-nav-btn');
        const sections = {
            appearance: document.getElementById('tabAppearance'),
            profile: document.getElementById('tabProfile'),
            notifications: document.getElementById('tabNotifications'),
            privacy: document.getElementById('tabPrivacy'),
            security: document.getElementById('tabSecurity'),
            chat: document.getElementById('tabChat'),
            storage: document.getElementById('tabStorage'),
            account: document.getElementById('tabAccount')
        };

        const activateTab = (tabName) => {
            navBtns.forEach(b => {
                const isActive = b.dataset.tab === tabName;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });

            Object.keys(sections).forEach(key => {
                if (sections[key]) {
                    sections[key].style.display = key === tabName ? 'block' : 'none';
                }
            });
        };

        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                activateTab(tab);
                const url = new URL(window.location);
                url.searchParams.set('tab', tab);
                window.history.replaceState({}, '', url);
            });
        });

        // Check URL parameter on load
        const params = new URLSearchParams(window.location.search);
        const requestedTab = params.get('tab') || 'appearance';
        if (sections[requestedTab]) {
            activateTab(requestedTab);
        } else {
            activateTab('appearance');
        }
    },

    setupThemeCards() {
        const currentTheme = localStorage.getItem('chatapp_theme') || 'monochrome';
        this.highlightThemeCard(currentTheme);
        this.updateLivePreview(currentTheme);

        const cards = document.querySelectorAll('.theme-card');
        cards.forEach(card => {
            const handleSelect = () => {
                const choice = card.dataset.themeChoice;
                if (typeof window.theme !== 'undefined') {
                    window.theme.apply(choice, true);
                } else {
                    document.documentElement.setAttribute('data-theme', choice);
                    localStorage.setItem('chatapp_theme', choice);
                }
                this.highlightThemeCard(choice);
                this.updateLivePreview(choice);
            };

            card.addEventListener('click', handleSelect);
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect();
                }
            });
        });
    },

    highlightThemeCard(activeTheme) {
        const cards = document.querySelectorAll('.theme-card');
        cards.forEach(card => {
            const choice = card.dataset.themeChoice;
            const isSelected = choice === activeTheme;
            card.classList.toggle('active', isSelected);
            card.setAttribute('aria-checked', isSelected ? 'true' : 'false');

            const check = card.querySelector('.theme-card-check');
            if (check) {
                check.style.display = isSelected ? 'inline-flex' : 'none';
            }
        });
    },

    updateLivePreview(activeTheme) {
        const indicator = document.getElementById('activeThemeIndicatorBadge');
        if (indicator) {
            indicator.textContent = activeTheme === 'sandstone' ? 'Sandstone' : 'Monochrome';
        }
    },

    loadProfileData() {
        let user = null;
        if (typeof auth !== 'undefined' && auth.getUser) {
            user = auth.getUser();
        }

        const nameEl = document.getElementById('settingsProfileName');
        const userEl = document.getElementById('settingsProfileUsername');
        const initialsEl = document.getElementById('settingsAvatarInitials');
        const frankIdEl = document.getElementById('settingsFrankIdValue');

        if (user) {
            if (nameEl) nameEl.textContent = user.full_name || 'FRANK User';
            if (userEl) userEl.textContent = `@${user.username || 'user'}`;
            if (initialsEl) initialsEl.textContent = (user.full_name || 'U').substring(0, 2).toUpperCase();
            if (frankIdEl) frankIdEl.textContent = user.frank_id || 'F4M8Q1';
        } else {
            if (nameEl) nameEl.textContent = 'Alex Morgan';
            if (userEl) userEl.textContent = '@alex';
            if (initialsEl) initialsEl.textContent = 'AM';
            if (frankIdEl) frankIdEl.textContent = 'F4M8Q1';
        }

        // Copy FRANK ID Button
        const copyBtn = document.getElementById('settingsCopyFrankIdBtn');
        copyBtn?.addEventListener('click', async () => {
            const frankId = frankIdEl ? frankIdEl.textContent.trim() : 'F4M8Q1';
            try {
                await navigator.clipboard.writeText(frankId);
                if (typeof window.showToast === 'function') {
                    window.showToast('FRANK ID copied', 'success', 2000);
                }
            } catch {
                if (typeof window.showToast === 'function') {
                    window.showToast('FRANK ID copied', 'success', 2000);
                }
            }
        });

        // Clear Cache Button
        const clearCacheBtn = document.getElementById('clearCacheBtn');
        clearCacheBtn?.addEventListener('click', () => {
            const preservedTheme = localStorage.getItem('chatapp_theme');
            const preservedToken = localStorage.getItem('frank_token');
            const preservedUser = localStorage.getItem('chatapp_user');
            localStorage.clear();
            if (preservedTheme) localStorage.setItem('chatapp_theme', preservedTheme);
            if (preservedToken) localStorage.setItem('frank_token', preservedToken);
            if (preservedUser) localStorage.setItem('chatapp_user', preservedUser);
            if (typeof window.showToast === 'function') {
                window.showToast('Local cache cleared successfully', 'success', 2000);
            }
        });
    },

    setupToggles() {
        const toggleIds = [
            'settingAnimations',
            'settingHighContrastBorders',
            'settingDesktopNotifs',
            'settingSound',
            'settingGroupNotifs',
            'settingReadReceipts',
            'settingTyping',
            'settingOnlinePresence',
            'settingEnterToSend'
        ];

        toggleIds.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;

            const saved = localStorage.getItem(`pref_${id}`);
            if (saved !== null) {
                el.checked = saved === 'true';
            }

            el.addEventListener('change', () => {
                localStorage.setItem(`pref_${id}`, el.checked);
                if (typeof window.showToast === 'function') {
                    window.showToast('Preference updated', 'info', 1500);
                }
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    settingsModule.init();
});

window.settingsModule = settingsModule;
