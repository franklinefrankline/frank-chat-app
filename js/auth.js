/* -------------------------------------------------------------------------
   AUTHENTICATION & ROUTE GUARDS
   Validation, token management, and form submissions
   ------------------------------------------------------------------------- */

const auth = {
    isAuthenticated() {
        return !!localStorage.getItem('chatapp_token');
    },

    getUser() {
        try {
            const raw = localStorage.getItem('chatapp_user');
            const user = raw ? JSON.parse(raw) : null;
            if (user && (!user.frank_id || user.frank_id === '------' || String(user.frank_id).trim().length !== 6)) {
                user.frank_id = this.getFrankId(user);
            }
            return user;
        } catch {
            return null;
        }
    },

    setUser(user) {
        if (user) {
            if (!user.frank_id || user.frank_id === '------' || String(user.frank_id).trim().length !== 6) {
                user.frank_id = this.getFrankId(user);
            }
            localStorage.setItem('chatapp_user', JSON.stringify(user));
        } else {
            localStorage.removeItem('chatapp_user');
        }
    },

    getFrankId(user) {
        if (!user) {
            try {
                const raw = localStorage.getItem('chatapp_user');
                user = raw ? JSON.parse(raw) : null;
            } catch {
                user = null;
            }
        }
        if (!user) return '------';

        // 1. If valid 6-character FRANK ID exists, normalize to uppercase and cache
        if (user.frank_id && user.frank_id !== '------' && String(user.frank_id).trim().length === 6) {
            const cleanId = String(user.frank_id).trim().toUpperCase();
            user.frank_id = cleanId;
            const key = `frank_id_perm_${user.id || user.username || 'me'}`;
            localStorage.setItem(key, cleanId);
            return cleanId;
        }

        // 2. Check persistent per-user storage in localStorage
        const storedKey = `frank_id_perm_${user.id || user.username || 'me'}`;
        const cached = localStorage.getItem(storedKey);
        if (cached && cached.trim().length === 6) {
            user.frank_id = cached.trim().toUpperCase();
            return user.frank_id;
        }

        // 3. Deterministically generate a permanent 6-character identifier from user identity
        const seedStr = `${user.id || ''}_${user.username || ''}_${user.email || ''}_FRANK_PERM_ID`;
        let hash = 5381;
        for (let i = 0; i < seedStr.length; i++) {
            hash = ((hash << 5) + hash) + seedStr.charCodeAt(i);
            hash |= 0;
        }
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let generatedFid = '';
        let absHash = Math.abs(hash);
        for (let i = 0; i < 6; i++) {
            generatedFid += chars[absHash % chars.length];
            absHash = Math.floor(absHash / chars.length) + (i * 13) + 7;
        }
        while (generatedFid.length < 6) {
            generatedFid += 'X';
        }

        user.frank_id = generatedFid;
        localStorage.setItem(storedKey, generatedFid);

        // Async notify backend to sync
        if (typeof api !== 'undefined' && api.ensureFrankId) {
            api.ensureFrankId(generatedFid).catch(() => {});
        }

        return generatedFid;
    },

    guard() {
        const path = window.location.pathname.toLowerCase();
        const isAuth = this.isAuthenticated();

        const protectedPages = ['dashboard', 'dashboard.html', 'chat', 'chat.html', 'profile', 'profile.html', 'settings', 'settings.html'];
        const guestOnlyPages = ['login', 'login.html', 'register', 'register.html'];

        const isProtected = protectedPages.some(page => path.endsWith('/' + page) || path.endsWith(page));
        const isGuestOnly = guestOnlyPages.some(page => path.endsWith('/' + page) || path.endsWith(page));

        if (isProtected && !isAuth) {
            window.location.replace('login.html');
        } else if (isGuestOnly && isAuth) {
            window.location.replace('dashboard.html');
        }
    },

    logout() {
        if (typeof window.notificationsModule !== 'undefined' && window.notificationsModule) {
            window.notificationsModule.updateUnreadBadge(0);
        }
        if (typeof window.wsClient !== 'undefined' && window.wsClient) {
            window.wsClient.disconnect();
        }
        api.logout();
    }
};

// Execute route check
auth.guard();
window.auth = auth;

// Global Password Visibility Toggles
document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('.password-toggle-btn');
    if (!toggleBtn) return;

    const targetId = toggleBtn.dataset.target;
    const input = document.getElementById(targetId);
    if (!input) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';

    const eyeIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const eyeOffIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

    toggleBtn.innerHTML = isPassword ? eyeOffIcon : eyeIcon;
});

// ---------------- LOGIN FORM HANDLER ----------------
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const submitBtn = document.getElementById('loginSubmitBtn');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        let hasError = false;
        if (!username) {
            document.getElementById('groupUsername').classList.add('has-error');
            hasError = true;
        } else {
            document.getElementById('groupUsername').classList.remove('has-error');
        }

        if (!password || password.length < 6) {
            document.getElementById('groupPassword').classList.add('has-error');
            hasError = true;
        } else {
            document.getElementById('groupPassword').classList.remove('has-error');
        }

        if (hasError) return;

        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-text').textContent = 'Signing in...';

        try {
            const data = await api.login(username, password);
            api.setToken(data.access_token);
            auth.setUser(data.user);

            showToast(`Welcome back, ${data.user.full_name}!`, 'success', 1000);
            window.location.replace('dashboard.html');
        } catch (err) {
            const isUnverified = err.status === 403 || (err.message && err.message.toLowerCase().includes('verify your email'));
            if (isUnverified) {
                let unverifiedBanner = document.getElementById('loginUnverifiedAlert');
                if (!unverifiedBanner) {
                    unverifiedBanner = document.createElement('div');
                    unverifiedBanner.id = 'loginUnverifiedAlert';
                    unverifiedBanner.style.cssText = 'padding: 16px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 12px; margin-bottom: 20px; text-align: center;';
                    loginForm.parentNode.insertBefore(unverifiedBanner, loginForm);
                }
                unverifiedBanner.innerHTML = `
                    <div style="font-weight: 700; color: #ef4444; font-size: 15px; margin-bottom: 6px;">Email verification required</div>
                    <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 12px;">Please verify your email before signing in. Check your inbox for the activation link.</div>
                    <button type="button" class="btn btn-secondary btn-full" id="bannerResendBtn" style="font-size: 13px; padding: 8px 16px;">
                        <span class="btn-text">Resend Verification Email</span>
                    </button>
                `;
                const bannerBtn = document.getElementById('bannerResendBtn');
                bannerBtn?.addEventListener('click', async () => {
                    const identifier = usernameInput.value.trim();
                    if (!identifier || !identifier.includes('@')) {
                        showToast('Please enter your email in the username/email field above to resend.', 'warning');
                        usernameInput.focus();
                        return;
                    }
                    bannerBtn.disabled = true;
                    bannerBtn.querySelector('.btn-text').textContent = 'Sending...';
                    try {
                        const res = await api.resendVerification(identifier);
                        showToast(res.message || 'Verification link sent! Check your inbox.', 'success', 4000);
                        bannerBtn.querySelector('.btn-text').textContent = 'Email Sent!';
                    } catch (rErr) {
                        showToast(rErr.message || 'Failed to resend verification email.', 'error');
                        bannerBtn.disabled = false;
                        bannerBtn.querySelector('.btn-text').textContent = 'Resend Verification Email';
                    }
                });
                showToast('Please verify your email before signing in.', 'warning', 4000);
            } else {
                showToast(err.message || 'Invalid username or password.', 'error');
            }
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').textContent = 'Sign In';
        }
    });
}

// ---------------- REGISTER FORM HANDLER ----------------
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    const fullNameInput = document.getElementById('regFullName');
    const usernameInput = document.getElementById('regUsername');
    const emailInput = document.getElementById('regEmail');
    const passwordInput = document.getElementById('regPassword');
    const confirmInput = document.getElementById('regConfirmPassword');
    const termsInput = document.getElementById('regTerms');
    const strengthBar = document.getElementById('strengthBar');
    const strengthLabel = document.getElementById('strengthLabel');
    const submitBtn = document.getElementById('registerSubmitBtn');

    // Dynamic password strength meter
    passwordInput?.addEventListener('input', () => {
        const val = passwordInput.value;
        let score = 0;
        if (val.length >= 6) score++;
        if (val.length >= 10) score++;
        if (/[A-Z]/.test(val) && /[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        strengthBar.className = 'password-meter-bar';
        if (!val) {
            strengthBar.style.width = '0%';
            strengthLabel.textContent = 'Password strength: None';
        } else if (score <= 1) {
            strengthBar.classList.add('weak');
            strengthLabel.textContent = 'Password strength: Weak';
        } else if (score === 2) {
            strengthBar.classList.add('fair');
            strengthLabel.textContent = 'Password strength: Fair';
        } else if (score === 3) {
            strengthBar.classList.add('good');
            strengthLabel.textContent = 'Password strength: Good';
        } else {
            strengthBar.classList.add('strong');
            strengthLabel.textContent = 'Password strength: Strong';
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const full_name = fullNameInput.value.trim();
        const username = usernameInput.value.trim();
        const email = emailInput.value.trim().toLowerCase();
        const password = passwordInput.value;
        const confirmPass = confirmInput.value;
        const terms = termsInput.checked;

        let hasError = false;

        if (!full_name) {
            document.getElementById('groupFullName').classList.add('has-error');
            hasError = true;
        } else {
            document.getElementById('groupFullName').classList.remove('has-error');
        }

        if (!username || username.length < 3) {
            document.getElementById('groupUsername').classList.add('has-error');
            hasError = true;
        } else {
            document.getElementById('groupUsername').classList.remove('has-error');
        }

        if (!email || !email.includes('@')) {
            document.getElementById('groupEmail').classList.add('has-error');
            hasError = true;
        } else {
            document.getElementById('groupEmail').classList.remove('has-error');
        }

        if (!password || password.length < 6) {
            document.getElementById('groupPassword').classList.add('has-error');
            hasError = true;
        } else {
            document.getElementById('groupPassword').classList.remove('has-error');
        }

        if (password !== confirmPass) {
            document.getElementById('groupConfirmPassword').classList.add('has-error');
            hasError = true;
        } else {
            document.getElementById('groupConfirmPassword').classList.remove('has-error');
        }

        if (!terms) {
            termsInput.closest('.form-group').classList.add('has-error');
            hasError = true;
        } else {
            termsInput.closest('.form-group').classList.remove('has-error');
        }

        if (hasError) return;

        submitBtn.disabled = true;
        submitBtn.querySelector('.btn-text').textContent = 'Creating account...';

        try {
            const data = await api.register({ full_name, username, email, password });

            // Render unverified registration confirmation state
            const cardBody = registerForm.parentNode;
            cardBody.innerHTML = `
                <div class="auth-card-header" style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(37, 99, 235, 0.15); border: 2px solid var(--primary); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: var(--primary);">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                    </div>
                    <h1 class="auth-card-title" style="font-size: 22px; font-weight: 700; color: #FFFFFF; margin-bottom: 8px;">Account created successfully</h1>
                    <p class="auth-card-subtitle" style="font-size: 14px; color: var(--text-secondary); line-height: 1.6;">
                        We've sent a verification link to <strong style="color: #FFFFFF;">${data.email || email}</strong>.<br>
                        Please verify your email before signing in.
                    </p>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 24px;">
                    <a href="login.html" class="btn btn-primary btn-full btn-large">
                        Open Login
                    </a>
                    <button type="button" class="btn btn-secondary btn-full" id="regResendBtn">
                        <span class="btn-text">Resend Verification Email</span>
                    </button>
                </div>
                <div style="text-align: center; margin-top: 20px;">
                    <span style="font-size: 12px; color: var(--text-muted);">Didn't receive the email? Check your spam folder or click resend above.</span>
                </div>
            `;

            const regResendBtn = document.getElementById('regResendBtn');
            regResendBtn?.addEventListener('click', async () => {
                regResendBtn.disabled = true;
                regResendBtn.querySelector('.btn-text').textContent = 'Sending...';
                try {
                    const res = await api.resendVerification(data.email || email);
                    showToast(res.message || 'Verification link sent! Check your inbox.', 'success', 4000);
                    regResendBtn.querySelector('.btn-text').textContent = 'Email Sent!';
                } catch (err) {
                    showToast(err.message || 'Failed to resend verification email.', 'error');
                    regResendBtn.disabled = false;
                    regResendBtn.querySelector('.btn-text').textContent = 'Resend Verification Email';
                }
            });

            showToast('Account created! Please check your email.', 'success', 4000);
        } catch (err) {
            const isDuplicate = err.message && err.message.toLowerCase().includes('already registered');
            if (isDuplicate) {
                showToast('Email already registered. Please sign in or reset your password.', 'error', 5000);
                let dupAlert = document.getElementById('registerDuplicateAlert');
                if (!dupAlert) {
                    dupAlert = document.createElement('div');
                    dupAlert.id = 'registerDuplicateAlert';
                    dupAlert.style.cssText = 'padding: 14px; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 10px; margin-bottom: 16px; text-align: center;';
                    registerForm.parentNode.insertBefore(dupAlert, registerForm);
                }
                dupAlert.innerHTML = `
                    <div style="font-weight: 700; color: #ef4444; font-size: 14px; margin-bottom: 6px;">Email already registered</div>
                    <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 10px;">An account with this email already exists. Please sign in or reset your password.</div>
                    <div style="display: flex; gap: 8px; justify-content: center;">
                        <a href="login.html" class="btn btn-primary" style="font-size: 12px; padding: 6px 14px;">Sign In</a>
                        <a href="forgot-password.html" class="btn btn-secondary" style="font-size: 12px; padding: 6px 14px;">Forgot Password</a>
                    </div>
                `;
            } else {
                showToast(err.message || 'Registration failed.', 'error');
            }
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').textContent = 'Create Account';
        }
    });
}
