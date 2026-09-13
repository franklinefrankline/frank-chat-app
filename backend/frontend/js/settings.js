/* -------------------------------------------------------------------------
   SETTINGS MANAGEMENT MODULE
   Settings tabs switching, theme selection, and preference persistence
   ------------------------------------------------------------------------- */

const settingsModule = {
    init() {
        this.setupTabs();
        this.setupThemeCards();
        this.setupToggles();

        const logoutBtn = document.getElementById('settingsLogoutBtn');
        logoutBtn?.addEventListener('click', () => auth.logout());
    },

    setupTabs() {
        const navBtns = document.querySelectorAll('.settings-nav-btn');
        const sections = {
            appearance: document.getElementById('tabAppearance'),
            notifications: document.getElementById('tabNotifications'),
            privacy: document.getElementById('tabPrivacy'),
            security: document.getElementById('tabSecurity'),
            about: document.getElementById('tabAbout')
        };

        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                navBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const tab = btn.dataset.tab;
                Object.keys(sections).forEach(key => {
                    if (sections[key]) {
                        sections[key].style.display = key === tab ? 'block' : 'none';
                    }
                });
            });
        });
    },

    setupThemeCards() {
        const currentTheme = localStorage.getItem('chatapp_theme') || 'light';
        const cards = document.querySelectorAll('.theme-card');

        const highlight = (t) => {
            cards.forEach(card => {
                card.classList.toggle('active', card.dataset.themeChoice === t);
            });
        };

        highlight(currentTheme);

        cards.forEach(card => {
            card.addEventListener('click', () => {
                const choice = card.dataset.themeChoice;
                theme.apply(choice, true);
                highlight(choice);
            });
        });
    },

    setupToggles() {
        const toggleIds = [
            'settingAnimations',
            'settingCustomCursor',
            'settingDesktopNotifs',
            'settingSound',
            'settingGroupNotifs',
            'settingReadReceipts',
            'settingTyping',
            'settingOnlinePresence'
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
                showToast('Preference updated', 'info', 1500);

                if (id === 'settingCustomCursor') {
                    const cursor = document.getElementById('customCursor');
                    const dot = document.getElementById('customCursorDot');
                    if (cursor) cursor.style.display = el.checked ? 'block' : 'none';
                    if (dot) dot.style.display = el.checked ? 'block' : 'none';
                }
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    settingsModule.init();
});

window.settingsModule = settingsModule;
