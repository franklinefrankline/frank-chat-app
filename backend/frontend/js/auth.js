/* -------------------------------------------------------------------------
   AUTHENTICATION & ROUTE GUARDS
   Validation, token management, and form submissions
   ------------------------------------------------------------------------- */

const auth = {
    getToken() {
        return (typeof api !== 'undefined' && api.getToken)
            ? api.getToken()
            : (localStorage.getItem('chatapp_token') || localStorage.getItem('frank_token') || localStorage.getItem('frank_auth_token'));
    },

    isAuthenticated() {
        return !!this.getToken();
    },

    hasSavedSession() {
        return !!this.getToken();
    },

    getUser() {
        try {
            const raw = localStorage.getItem('chatapp_user');
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    },

    async getCurrentUser() {
        if (typeof api !== 'undefined' && api.getCurrentUser) {
            try {
                const user = await api.getCurrentUser();
                if (user && user.id) {
                    this.setUser(user);
                    return user;
                }
            } catch (e) {}
        }
        return this.getUser();
    },

    setUser(user) {
        if (user) {
            localStorage.setItem('chatapp_user', JSON.stringify(user));
            if (user.theme && typeof window.theme !== 'undefined') {
                window.theme.apply(user.theme, false);
            }
            if (user.language && typeof window.i18n !== 'undefined') {
                if (typeof window.i18n.getLanguage === 'function' && window.i18n.getLanguage() !== user.language) {
                    window.i18n.setLanguage(user.language, { saveToDb: false, silent: true });
                }
            }
        } else {
            localStorage.removeItem('chatapp_user');
        }
    },

    clearSession() {
        if (typeof api !== 'undefined' && api.setToken) {
            api.setToken(null);
        } else {
            localStorage.removeItem('chatapp_token');
            localStorage.removeItem('frank_token');
            localStorage.removeItem('frank_auth_token');
            sessionStorage.removeItem('chatapp_token');
            sessionStorage.removeItem('frank_token');
            sessionStorage.removeItem('frank_auth_token');
        }
        localStorage.removeItem('chatapp_user');
        sessionStorage.removeItem('chatapp_user');
        try {
            document.cookie = 'frank_token=; Max-Age=0; path=/;';
            document.cookie = 'chatapp_token=; Max-Age=0; path=/;';
        } catch (e) {}
    },

    async validateSession() {
        const token = this.getToken();
        if (!token) {
            return { valid: false, reason: 'no_token' };
        }
        if (typeof api !== 'undefined' && api.isTokenExpired && api.isTokenExpired(token)) {
            this.clearSession();
            return { valid: false, reason: 'expired' };
        }
        try {
            const user = await api.getCurrentUser();
            if (user && user.id) {
                this.setUser(user);
                return { valid: true, user };
            }
            this.clearSession();
            return { valid: false, reason: 'invalid_user' };
        } catch (err) {
            if (err.status === 401 || err.status === 403) {
                this.clearSession();
                return {
                    valid: false,
                    reason: err.status === 403 ? 'disabled' : 'unauthorized',
                    message: err.message
                };
            }
            // Preserve session for offline mobile or network failure
            const cachedUser = this.getUser();
            if (cachedUser && (!navigator.onLine || err.name === 'TypeError' || String(err).includes('fetch') || String(err).includes('NetworkError'))) {
                return { valid: true, user: cachedUser, offline: true };
            }
            if (err.status >= 500 && cachedUser) {
                return { valid: true, user: cachedUser, serverError: true };
            }
            return { valid: false, reason: 'error', error: err };
        }
    },

    showStartupScreen(title = 'FRANK', subtitle = 'Think') {
        let loader = document.getElementById('appLoadingScreen');
        if (!loader) {
            loader = document.createElement('div');
            loader.className = 'app-loading-screen';
            loader.id = 'appLoadingScreen';
            loader.innerHTML = `
                <div class="frank-logo-anim-stage splash">
                    <div class="frank-anim-glow" aria-hidden="true"></div>
                    <div class="frank-anim-emblem" style="width: 84px; height: 84px; filter: drop-shadow(0 0 24px rgba(59, 130, 246, 0.45));">
                        <img src="assets/brand/frank-icon.svg" alt="FRANK Logo" width="84" height="84" style="border-radius: 20px; display: block;" onerror="this.onerror=null; this.src='favicon.png';">
                    </div>
                    <div class="frank-anim-wordmark" style="margin-top: 16px; font-size: 26px; font-weight: 900; letter-spacing: 2px;">${title}</div>
                    <div class="frank-anim-tagline" style="margin-top: 6px; font-size: 14px; font-weight: 600; color: #94A3B8;">${subtitle}</div>
                    <div class="frank-loading-bar-wrap" style="width: 120px; height: 3px; background: rgba(255,255,255,0.08); border-radius: 9999px; margin-top: 20px; overflow: hidden; position: relative;">
                        <div class="frank-loading-bar-fill" style="width: 50%; height: 100%; background: linear-gradient(90deg, #2563EB, #7C3AED, #D946EF, #06B6D4); border-radius: 9999px; animation: frankBarShimmer 0.9s infinite ease-in-out;"></div>
                    </div>
                </div>
            `;
            if (document.body) {
                document.body.prepend(loader);
            } else {
                document.addEventListener('DOMContentLoaded', () => document.body && document.body.prepend(loader));
            }
        } else {
            loader.classList.remove('fade-out');
        }
    },

    dismissStartupScreen() {
        document.documentElement.classList.remove('app-checking-session');
        const loader = document.getElementById('appLoadingScreen');
        if (loader && !loader.classList.contains('fade-out')) {
            loader.classList.add('fade-out');
            setTimeout(() => {
                if (loader && loader.parentNode) loader.remove();
            }, 380);
        }
    },

    guard() {
        const rawPath = (window.location.pathname || '').replace(/\/+$/, '') || '/';
        const path = rawPath.toLowerCase();
        const hasSession = this.hasSavedSession();
        const user = this.getUser();

        const protectedRoutes = [
            'dashboard.html', 'chat.html', 'profile.html', 'settings.html', 'admin.html', 'spreadsheet.html',
            '/dashboard', '/chat', '/profile', '/settings', '/admin', '/spreadsheet'
        ];
        const guestOnlyRoutes = [
            'login.html', 'register.html',
            '/login', '/register'
        ];

        const isProtected = protectedRoutes.some(route => path.endsWith(route) || path === route);
        const isGuestOnly = guestOnlyRoutes.some(route => path.endsWith(route) || path === route);
        const isRoot = !isProtected && !isGuestOnly && (path === '/' || path === '' || path === '/index.html' || path.endsWith('/index.html') || path === 'index.html');
        const isAdminRoute = path.endsWith('admin.html') || path === '/admin';

        // 1. Protected routes: If not authenticated, redirect to login
        if (isProtected && !hasSession) {
            window.location.replace('login.html');
            return;
        }

        // 2. Protected admin route: User authenticated but not admin
        if (isAdminRoute && hasSession && (!user || user.role !== 'admin')) {
            window.location.replace('dashboard.html');
            return;
        }

        // 3. Guest-only routes (login, register)
        if (isGuestOnly) {
            const searchParams = new URLSearchParams(window.location.search);
            const isLogout = searchParams.get('logout') === '1';
            const isExpired = searchParams.get('expired') === '1';

            if (isLogout || isExpired) {
                this.clearSession();
                this.dismissStartupScreen();
                if (typeof showToast === 'function') {
                    if (isLogout) showToast('You have been logged out successfully.', 'info');
                    if (isExpired) showToast('Your session has expired. Please sign in again.', 'warning');
                }
                return;
            }

            // If user has saved session: validate before deciding whether to redirect
            if (hasSession) {
                this.showStartupScreen('FRANK', 'Restoring Session...');
                this.validateSession().then(result => {
                    if (result.valid && result.user) {
                        const target = (result.user.role === 'admin') ? 'admin.html' : 'dashboard.html';
                        window.location.replace(target);
                    } else {
                        this.clearSession();
                        this.dismissStartupScreen();
                        if (result.reason === 'expired' && typeof showToast === 'function') {
                            showToast('Your session has expired. Please sign in again.', 'warning');
                        }
                    }
                }).catch(() => {
                    this.dismissStartupScreen();
                });
                return;
            } else {
                this.dismissStartupScreen();
            }
        }

        // 4. Root / Landing page (index.html, /)
        if (isRoot) {
            if (hasSession) {
                this.showStartupScreen('FRANK', 'Opening Chats...');
                this.validateSession().then(result => {
                    if (result.valid && result.user) {
                        const target = (result.user.role === 'admin') ? 'admin.html' : 'dashboard.html';
                        window.location.replace(target);
                    } else {
                        this.clearSession();
                        this.dismissStartupScreen();
                    }
                }).catch(() => {
                    this.dismissStartupScreen();
                });
            } else {
                this.dismissStartupScreen();
            }
        }
    },

    async logout() {
        if (typeof window.wsClient !== 'undefined' && window.wsClient) {
            window.wsClient.disconnect();
        }
        if (typeof api !== 'undefined' && api.logout) {
            await api.logout();
        } else {
            this.clearSession();
            window.location.replace('login.html?logout=1');
        }
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

            showToast(`Welcome back, ${data.user.full_name}!`, 'success');
            setTimeout(() => {
                if (data.user && data.user.role === 'admin') {
                    window.location.replace('admin.html');
                } else {
                    window.location.replace('dashboard.html');
                }
            }, 300);
        } catch (err) {
            const isAccountDisabled = (err.status === 403) || (err.message && (
                err.message.toLowerCase().includes('disabled') || 
                err.message.toLowerCase().includes('deactivated') ||
                err.message.toLowerCase().includes('contact an administrator')
            ));

            const disabledBanner = document.getElementById('disabledAccountBanner');
            if (isAccountDisabled && disabledBanner) {
                disabledBanner.style.display = 'block';
                const msgEl = document.getElementById('disabledAccountMessage');
                if (msgEl) {
                    msgEl.textContent = err.message || (window.i18n ? window.i18n.t('contact.disabledNotice') : 'Account is disabled. Please contact an administrator.');
                }
                const contactBtn = document.getElementById('contactAdminDisabledBtn');
                if (contactBtn && !contactBtn.dataset.bound) {
                    contactBtn.dataset.bound = 'true';
                    contactBtn.addEventListener('click', () => {
                        if (typeof window.openContactAdminModal === 'function') {
                            window.openContactAdminModal({
                                email: usernameInput ? usernameInput.value.trim() : '',
                                source: 'disabled_account'
                            });
                        }
                    });
                }
            } else if (disabledBanner) {
                disabledBanner.style.display = 'none';
            }

            showToast(err.message || 'Invalid username or password.', 'error');
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').textContent = 'Sign In';
        }
    });

    usernameInput?.addEventListener('input', () => {
        const disabledBanner = document.getElementById('disabledAccountBanner');
        if (disabledBanner) disabledBanner.style.display = 'none';
    });
}

// ---------------- REGISTER FORM HANDLER ----------------
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    const fullNameInput = document.getElementById('regFullName');
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

    const stepFields = document.getElementById('registerStepFields');
    const otpStep = document.getElementById('registerOtpStep');
    const otpCodeInput = document.getElementById('regOtpCode');
    const verifyOtpBtn = document.getElementById('verifyOtpSubmitBtn');
    const resendOtpBtn = document.getElementById('resendOtpBtn');
    const backBtn = document.getElementById('backToRegisterBtn');
    const otpTargetEmail = document.getElementById('otpTargetEmail');

    let resendTimer = null;
    let resendCountdown = 60;
    let isRegistering = false;
    let isVerifyingOtp = false;
    let isResendingOtp = false;

    function resetSubmitBtnState() {
        if (!submitBtn) return;
        submitBtn.disabled = false;
        const btnText = submitBtn.querySelector('.btn-text');
        const defaultText = (typeof window.i18n !== 'undefined' && window.i18n.t) 
            ? window.i18n.t('auth.createAccount') 
            : 'Create Account';
        if (btnText) {
            btnText.textContent = defaultText;
        } else {
            submitBtn.textContent = defaultText;
        }
    }

    function startResendCooldown() {
        if (resendTimer) clearInterval(resendTimer);
        resendCountdown = 30;
        if (!resendOtpBtn) return;
        resendOtpBtn.disabled = true;
        const btnText = resendOtpBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = `Resend Code (${resendCountdown}s)`;
        resendTimer = setInterval(() => {
            resendCountdown--;
            if (resendCountdown <= 0) {
                clearInterval(resendTimer);
                resendTimer = null;
                resendOtpBtn.disabled = false;
                if (btnText) btnText.textContent = 'Resend Code';
            } else {
                if (btnText) btnText.textContent = `Resend Code (${resendCountdown}s)`;
            }
        }, 1000);
    }

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Prevent duplicate submissions
        if (isRegistering) return;

        const full_name = fullNameInput.value.trim();
        const email = emailInput.value.trim();
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

        const ageConsentInput = document.getElementById('regAgeConsent');
        if (ageConsentInput && !ageConsentInput.checked) {
            ageConsentInput.closest('.form-group')?.classList.add('has-error');
            hasError = true;
        } else if (ageConsentInput) {
            ageConsentInput.closest('.form-group')?.classList.remove('has-error');
        }

        if (!terms) {
            termsInput.closest('.form-group').classList.add('has-error');
            hasError = true;
        } else {
            termsInput.closest('.form-group').classList.remove('has-error');
        }

        if (hasError) return;

        isRegistering = true;
        submitBtn.disabled = true;
        const submitText = submitBtn.querySelector('.btn-text');
        if (submitText) submitText.textContent = 'Sending verification code...';
        else submitBtn.textContent = 'Sending verification code...';

        try {
            // Attempt to send OTP code via Gmail SMTP
            const res = await api.sendOTP(email, 'registration');
            showToast(res.message || `Verification code sent to ${email}`, 'success');

            // Store pending registration details for OTP verification continuity
            try {
                sessionStorage.setItem('pending_registration_payload', JSON.stringify({ full_name, email, password, terms }));
                sessionStorage.setItem('pending_reg_email', email);
                sessionStorage.setItem('pending_otp_purpose', 'registration');
            } catch (e) {}

            const currentStepFields = document.getElementById('registerStepFields') || stepFields;
            const currentOtpStep = document.getElementById('registerOtpStep') || otpStep;
            const currentTargetEmail = document.getElementById('otpTargetEmail') || otpTargetEmail;
            const currentOtpInput = document.getElementById('regOtpCode') || otpCodeInput;

            if (currentStepFields && currentOtpStep) {
                currentStepFields.style.display = 'none';
                currentOtpStep.style.display = 'block';
                if (currentTargetEmail) currentTargetEmail.textContent = email;
                if (currentOtpInput) {
                    currentOtpInput.value = '';
                    setTimeout(() => currentOtpInput.focus(), 50);
                }
                startResendCooldown();
            }
            // Reset submit button state so that if the user returns to this step, it is fully enabled
            resetSubmitBtnState();
        } catch (err) {
            resetSubmitBtnState();
            const errorMsg = err.message || (err.data && (err.data.detail || err.data.message)) || 'Failed to send verification code. Please try again.';
            showToast(errorMsg, 'error');
        } finally {
            isRegistering = false;
        }
    });

    // Verification code submission
    verifyOtpBtn?.addEventListener('click', async () => {
        if (isVerifyingOtp) return;

        const full_name = fullNameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const code = (otpCodeInput?.value || '').trim();

        if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
            document.getElementById('groupOtpCode')?.classList.add('has-error');
            showToast('Please enter the 6-digit verification code.', 'error');
            return;
        }
        document.getElementById('groupOtpCode')?.classList.remove('has-error');

        isVerifyingOtp = true;
        verifyOtpBtn.disabled = true;
        const btnText = verifyOtpBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'Verifying & Creating Account...';

        try {
            const lang = (typeof i18n !== 'undefined' && i18n.currentLang) ? i18n.currentLang : 'en';
            const data = await api.register({
                full_name,
                email,
                password,
                language: lang,
                otp_code: code
            });
            api.setToken(data.access_token);
            auth.setUser(data.user);
            showToast('Account verified and created successfully! Welcome to FRANK.', 'success');
            setTimeout(() => {
                window.location.replace('dashboard.html');
            }, 300);
        } catch (err) {
            const msg = err.message || (err.data && (err.data.detail || err.data.message)) || 'Invalid verification code.';
            showToast(msg, 'error');
            verifyOtpBtn.disabled = false;
            if (btnText) btnText.textContent = 'Verify & Create Account';
        } finally {
            isVerifyingOtp = false;
        }
    });

    // Resend code handler
    resendOtpBtn?.addEventListener('click', async () => {
        if (isResendingOtp || resendOtpBtn.disabled) return;
        const email = emailInput.value.trim();
        if (!email) return;

        isResendingOtp = true;
        resendOtpBtn.disabled = true;
        const btnText = resendOtpBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'Resending Code...';

        try {
            const res = await api.sendOTP(email, 'registration');
            showToast(res.message || `New verification code sent to ${email}. Please check your Inbox and Spam / Junk folder.`, 'success');
            startResendCooldown();
        } catch (err) {
            const msg = err.message || (err.data && (err.data.detail || err.data.message)) || 'Failed to resend code.';
            showToast(msg, 'error');
            resendOtpBtn.disabled = false;
            if (btnText) btnText.textContent = 'Resend Code';
        } finally {
            isResendingOtp = false;
        }
    });

    // Back to registration edit details
    backBtn?.addEventListener('click', () => {
        const currentStepFields = document.getElementById('registerStepFields') || stepFields;
        const currentOtpStep = document.getElementById('registerOtpStep') || otpStep;
        if (currentStepFields && currentOtpStep) {
            currentOtpStep.style.display = 'none';
            currentStepFields.style.display = 'block';
            resetSubmitBtnState();
            setTimeout(() => {
                emailInput?.focus();
            }, 50);
        }
    });

    // Auto-submit when 6 digits are typed
    otpCodeInput?.addEventListener('input', () => {
        const val = otpCodeInput.value.replace(/\D/g, '');
        otpCodeInput.value = val;
        if (val.length === 6) {
            verifyOtpBtn?.click();
        }
    });

    otpCodeInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            verifyOtpBtn?.click();
        }
    });
}
