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
            account: document.getElementById('tabAccount'),
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

                if (tab === 'account') {
                    this.loadAccountInfo();
                }
            });
        });

        this.setupAccountTab();
    },

    async loadAccountInfo() {
        try {
            const user = await api.getMe();
            const uName = document.getElementById('settingsUsernameDisplay');
            const uEmail = document.getElementById('settingsEmailDisplay');
            const uFrankId = document.getElementById('settingsFrankIdDisplay');

            if (uName) uName.textContent = `@${user.username}`;
            if (uEmail) uEmail.textContent = user.email;
            if (uFrankId) uFrankId.textContent = user.frank_id || '------';
        } catch (e) {
            console.warn('Could not load profile for account tab:', e);
        }
    },

    setupAccountTab() {
        const openModalBtn = document.getElementById('openDeleteSelfModalBtn');
        const modal = document.getElementById('deleteSelfModal');
        const closeModalBtn = document.getElementById('closeDeleteSelfModalBtn');
        const cancelBtn = document.getElementById('cancelDeleteSelfBtn');
        const confirmBtn = document.getElementById('confirmDeleteSelfBtn');
        const pwdInput = document.getElementById('deleteSelfPassword');
        const confirmInput = document.getElementById('deleteSelfConfirmText');
        const errorBox = document.getElementById('deleteSelfModalError');

        if (!modal) return;

        const closeModal = () => {
            modal.style.display = 'none';
            if (pwdInput) pwdInput.value = '';
            if (confirmInput) confirmInput.value = '';
            if (confirmBtn) confirmBtn.disabled = true;
            if (errorBox) {
                errorBox.style.display = 'none';
                errorBox.textContent = '';
            }
        };

        openModalBtn?.addEventListener('click', () => {
            modal.style.display = 'flex';
        });

        closeModalBtn?.addEventListener('click', closeModal);
        cancelBtn?.addEventListener('click', closeModal);

        const validateInputs = () => {
            const isConfirmed = (confirmInput?.value.trim().toUpperCase() === 'DELETE');
            const hasPwd = Boolean(pwdInput?.value);
            if (confirmBtn) confirmBtn.disabled = !(isConfirmed && hasPwd);
        };

        pwdInput?.addEventListener('input', validateInputs);
        confirmInput?.addEventListener('input', validateInputs);

        confirmBtn?.addEventListener('click', async () => {
            if (!pwdInput?.value) return;
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Deleting...';
            if (errorBox) errorBox.style.display = 'none';

            try {
                await api.deleteMyAccount(pwdInput.value, confirmInput.value);
                api.setToken(null);
                localStorage.removeItem('chatapp_user');
                alert('Your FRANK account and all data have been permanently deleted.');
                window.location.href = 'login.html?account_deleted=1';
            } catch (err) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Delete Forever';
                if (errorBox) {
                    errorBox.textContent = err.message || 'Failed to delete account. Please verify your password.';
                    errorBox.style.display = 'block';
                }
            }
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
            'settingMessageNotifs',
            'settingDesktopNotifs',
            'settingSound',
            'settingVibration',
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

                if (id === 'settingDesktopNotifs' && el.checked) {
                    if ('Notification' in window && Notification.permission === 'default') {
                        Notification.requestPermission().then(permission => {
                            if (permission === 'granted') {
                                showToast('Browser notifications enabled', 'success', 2000);
                            } else {
                                showToast('Browser notifications blocked in browser settings', 'warning', 3000);
                            }
                        }).catch(() => {});
                    }
                }

                if (id === 'settingCustomCursor') {
                    if (el.checked) {
                        document.documentElement.classList.remove('no-custom-cursor');
                    } else {
                        document.documentElement.classList.add('no-custom-cursor');
                    }
                }
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    settingsModule.init();
});

window.settingsModule = settingsModule;
