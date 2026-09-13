/* -------------------------------------------------------------------------
   THEME MANAGER (LIGHT, DARK, SYSTEM)
   Zero-flash theme initialization with localStorage persistence
   ------------------------------------------------------------------------- */

const theme = {
    KEY: 'chatapp_theme',

    init() {
        const saved = localStorage.getItem(this.KEY) || 'light';
        this.apply(saved, false);
        this.bindEvents();
    },

    apply(choice, notify = true) {
        let isDark = false;
        if (choice === 'dark') {
            isDark = true;
        } else if (choice === 'system') {
            isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        } else {
            isDark = false;
        }

        if (isDark) {
            document.body.classList.add('dark');
        } else {
            document.body.classList.remove('dark');
        }

        localStorage.setItem(this.KEY, choice);
        this.updateButtons(isDark);

        if (notify && typeof window.showToast === 'function') {
            window.showToast(`${isDark ? 'Dark' : 'Light'} theme enabled`, 'info', 1800);
        }

        window.dispatchEvent(new CustomEvent('chatapp_theme_change', { detail: { theme: choice, isDark } }));
    },

    toggle() {
        const isCurrentlyDark = document.body.classList.contains('dark');
        this.apply(isCurrentlyDark ? 'light' : 'dark', true);
    },

    updateButtons(isDark) {
        const moonIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
        const sunIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

        document.querySelectorAll('#themeToggleBtn, #dashboardThemeBtn').forEach(btn => {
            btn.innerHTML = isDark ? sunIcon : moonIcon;
            btn.setAttribute('aria-label', isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode');
        });
    },

    bindEvents() {
        document.querySelectorAll('#themeToggleBtn, #dashboardThemeBtn').forEach(btn => {
            btn.addEventListener('click', () => this.toggle());
        });

        // Listen for OS scheme adjustments
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
            if (localStorage.getItem(this.KEY) === 'system') {
                this.apply('system', false);
            }
        });
    }
};

// Immediate execution to prevent FOUC (flash of unstyled content)
theme.init();

window.theme = theme;