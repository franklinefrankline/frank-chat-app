/* -------------------------------------------------------------------------
   FRANK THEME MANAGER
   Complete UI Theme System: MONOCHROME & SANDSTONE
   Zero-flash initialization, immediate DOM updates, localStorage & API persistence
   ------------------------------------------------------------------------- */

const theme = {
    KEY: 'chatapp_theme',
    THEMES: {
        MONOCHROME: 'monochrome',
        SANDSTONE: 'sandstone'
    },

    normalize(choice) {
        if (!choice) return this.THEMES.MONOCHROME;
        const c = String(choice).toLowerCase().trim();
        if (c === 'sandstone' || c === 'light') {
            return this.THEMES.SANDSTONE;
        }
        return this.THEMES.MONOCHROME;
    },

    init() {
        const saved = localStorage.getItem(this.KEY);
        const resolved = this.normalize(saved);
        this.apply(resolved, false);
        this.bindEvents();
    },

    apply(choice, notify = true) {
        const activeTheme = this.normalize(choice);
        const isMonochrome = activeTheme === this.THEMES.MONOCHROME;

        // Apply theme token attributes immediately to root and body
        document.documentElement.setAttribute('data-theme', activeTheme);
        if (document.body) {
            document.body.setAttribute('data-theme', activeTheme);
            if (isMonochrome) {
                document.body.classList.add('dark');
            } else {
                document.body.classList.remove('dark');
            }
        }

        // Persist locally
        localStorage.setItem(this.KEY, activeTheme);

        // Update button states & labels across current page
        this.updateButtons(activeTheme);

        // Notify user if triggered interactively
        if (notify && typeof window.showToast === 'function') {
            const displayName = isMonochrome ? 'Monochrome' : 'Sandstone';
            window.showToast(`${displayName} theme enabled`, 'info', 1800);
        }

        // Dispatch theme change event for dynamic components
        window.dispatchEvent(new CustomEvent('chatapp_theme_change', {
            detail: { theme: activeTheme, isMonochrome }
        }));

        // Persist theme to user profile in backend if authenticated
        this.persistToBackend(activeTheme);
    },

    toggle() {
        const current = document.documentElement.getAttribute('data-theme') || this.THEMES.MONOCHROME;
        const nextTheme = current === this.THEMES.MONOCHROME ? this.THEMES.SANDSTONE : this.THEMES.MONOCHROME;
        this.apply(nextTheme, true);
    },

    persistToBackend(activeTheme) {
        if (typeof api !== 'undefined' && typeof api.updateProfile === 'function') {
            api.updateProfile({ theme: activeTheme }).catch(() => {});
            return;
        }
        const token = localStorage.getItem('frank_token') || localStorage.getItem('chatapp_token');
        if (!token) return;

        const base = (window.FRANK_CONFIG && window.FRANK_CONFIG.API_BASE) || '';
        if (base.startsWith('file:') || window.location.protocol === 'file:') return;
        const apiUrl = base ? `${base}/api` : '/api';
        fetch(`${apiUrl}/users/profile`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ theme: activeTheme })
        }).catch(() => {});
    },

    updateButtons(activeTheme) {
        const isMonochrome = activeTheme === this.THEMES.MONOCHROME;

        // Monochrome icon: high-contrast geometric circle/half-circle or sun
        const monochromeIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" title="Monochrome Theme"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a10 10 0 0 0 0 20z" fill="currentColor"></path></svg>`;
        
        // Sandstone icon: warm sun/palette icon
        const sandstoneIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" title="Sandstone Theme"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

        document.querySelectorAll('#themeToggleBtn, #dashboardThemeBtn').forEach(btn => {
            btn.innerHTML = isMonochrome ? sandstoneIcon : monochromeIcon;
            btn.setAttribute('aria-label', isMonochrome ? 'Switch to Sandstone Theme' : 'Switch to Monochrome Theme');
            btn.setAttribute('title', isMonochrome ? 'Switch to Sandstone Theme' : 'Switch to Monochrome Theme');
        });

        const sidebarLabel = document.getElementById('sidebarThemeLabel');
        if (sidebarLabel) {
            sidebarLabel.textContent = isMonochrome ? 'Monochrome' : 'Sandstone';
        }

        // Update theme card active states if present on Settings page
        document.querySelectorAll('.theme-card').forEach(card => {
            const cardTheme = card.dataset.themeChoice;
            const isActive = cardTheme === activeTheme;
            card.classList.toggle('active', isActive);
            card.setAttribute('aria-checked', isActive ? 'true' : 'false');
            
            const checkIndicator = card.querySelector('.theme-card-check');
            if (checkIndicator) {
                checkIndicator.style.display = isActive ? 'flex' : 'none';
            }
        });
    },

    bindEvents() {
        document.addEventListener('DOMContentLoaded', () => {
            const saved = localStorage.getItem(this.KEY);
            this.apply(this.normalize(saved), false);

            document.querySelectorAll('#themeToggleBtn, #dashboardThemeBtn').forEach(btn => {
                // Ensure only one listener attached
                btn.removeEventListener('click', this._btnClickHandler);
                this._btnClickHandler = () => this.toggle();
                btn.addEventListener('click', this._btnClickHandler);
            });
        });
    }
};

// Immediate zero-flash execution before render
(function() {
    const saved = localStorage.getItem('chatapp_theme');
    const resolved = theme.normalize(saved);
    document.documentElement.setAttribute('data-theme', resolved);
    if (document.body) {
        document.body.setAttribute('data-theme', resolved);
        if (resolved === 'monochrome') {
            document.body.classList.add('dark');
        } else {
            document.body.classList.remove('dark');
        }
    }
})();

theme.init();
window.theme = theme;