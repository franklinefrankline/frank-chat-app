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

function showConnectionAlert(formElement) {
    let connAlert = document.getElementById('connectionStatusAlert');
    if (!connAlert) {
        connAlert = document.createElement('div');
        connAlert.id = 'connectionStatusAlert';
        connAlert.style.cssText = 'padding: 16px; background: rgba(245, 158, 11, 0.09); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 12px; margin-bottom: 20px; text-align: center;';
        formElement.parentNode.insertBefore(connAlert, formElement);
    }
    const currentServer = (window.FRANK_CONFIG && window.FRANK_CONFIG.API_BASE) || 'https://frank-chat-app.onrender.com';
    connAlert.innerHTML = `
        <div style="font-weight: 700; color: #f59e0b; font-size: 14px; margin-bottom: 6px; display: flex; align-items: center; justify-content: center; gap: 6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            Backend Server Unreachable
        </div>
        <div style="font-size: 12px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 12px;">
            Cannot reach: <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-size: 11px; word-break: break-all;">${currentServer}</code><br>
            <span style="opacity: 0.85;">Render free instances take ~50s to wake up from idle. If your Render URL is different, you can set it below.</span>
        </div>
        <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
            <button type="button" class="btn btn-secondary btn-sm" id="btnWakeServer" style="font-size: 12px; padding: 6px 14px;">
                <span class="btn-text">⚡ Wake / Ping Server</span>
            </button>
            <button type="button" class="btn btn-secondary btn-sm" id="btnEditServerUrl" style="font-size: 12px; padding: 6px 14px;">
                <span class="btn-text">⚙ Set Backend URL</span>
            </button>
        </div>
        <div id="wakeStatusMsg" style="margin-top: 10px; font-size: 12px; font-weight: 600; display: none;"></div>
    `;

    document.getElementById('btnWakeServer')?.addEventListener('click', async () => {
        const statusEl = document.getElementById('wakeStatusMsg');
        const wakeBtn = document.getElementById('btnWakeServer');
        if (statusEl) {
            statusEl.style.display = 'block';
            statusEl.style.color = '#f59e0b';
            statusEl.textContent = 'Pinging server... Free-tier instances take ~45s to boot.';
        }
        if (wakeBtn) wakeBtn.disabled = true;

        let seconds = 0;
        const timer = setInterval(() => {
            seconds += 2;
            if (statusEl && statusEl.style.color !== 'rgb(16, 185, 129)') {
                statusEl.textContent = `Pinging server... (${seconds}s elapsed)`;
            }
        }, 2000);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 65000);
            const res = await fetch(`${currentServer}/api/health`, { method: 'GET', signal: controller.signal });
            clearTimeout(timeoutId);
            clearInterval(timer);
            if (res.ok) {
                if (statusEl) {
                    statusEl.style.color = '#10b981';
                    statusEl.textContent = '✓ Server is online and ready! Try signing in again.';
                }
                showToast('Server is online!', 'success');
            } else {
                if (statusEl) {
                    statusEl.style.color = '#ef4444';
                    statusEl.textContent = `Server responded with status ${res.status}. Check your Render dashboard URL.`;
                }
            }
        } catch (e) {
            clearInterval(timer);
            if (statusEl) {
                statusEl.style.color = '#ef4444';
                statusEl.textContent = 'Could not reach server. Please verify your Render service URL.';
            }
        } finally {
            if (wakeBtn) wakeBtn.disabled = false;
        }
    });

    document.getElementById('btnEditServerUrl')?.addEventListener('click', () => {
        const newUrl = prompt('Enter your Render backend URL (from dashboard.render.com):', currentServer);
        if (newUrl && newUrl.trim()) {
            const clean = newUrl.trim().replace(/\/+$/, '');
            localStorage.setItem('frank_api_url', clean);
            const wsClean = clean.replace(/^http/, 'ws');
            localStorage.setItem('frank_ws_url', wsClean);
            showToast('Backend URL updated! Reloading page...', 'info');
            setTimeout(() => window.location.reload(), 800);
        }
    });
}

// ---------------- LOGIN FORM HANDLER ----------------
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    const usernameInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');
    const submitBtn = document.getElementById('loginSubmitBtn');

    // Display current backend server status pill
    const currentServer = (window.FRANK_CONFIG && window.FRANK_CONFIG.API_BASE) || 'https://frank-chat-app.onrender.com';
    const serverPill = document.createElement('div');
    serverPill.style.cssText = 'text-align: center; margin-top: 14px; font-size: 11px; color: var(--text-muted);';
    serverPill.innerHTML = `Backend: <span style="font-family: monospace;">${currentServer.replace(/^https?:\/\//, '')}</span> &bull; <a href="javascript:void(0)" id="pillChangeUrl" style="color: var(--primary); text-decoration: underline;">Change</a>`;
    loginForm.appendChild(serverPill);
    document.getElementById('pillChangeUrl')?.addEventListener('click', () => {
        const newUrl = prompt('Enter Backend API URL (e.g. from dashboard.render.com):', currentServer);
        if (newUrl && newUrl.trim()) {
            const clean = newUrl.trim().replace(/\/+$/, '');
            localStorage.setItem('frank_api_url', clean);
            const wsClean = clean.replace(/^http/, 'ws');
            localStorage.setItem('frank_ws_url', wsClean);
            showToast('Backend URL updated! Reloading...', 'info');
            setTimeout(() => window.location.reload(), 600);
        }
    });

    try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('registered')) {
            showToast('Account created successfully! Please sign in.', 'success', 5000);
        }
    } catch (_) {}

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
            const isConnErr = err.status === 0 || (err.message && err.message.toLowerCase().includes('cannot reach'));

            if (isConnErr) {
                showConnectionAlert(loginForm);
                showToast('Cannot reach the FRANK backend server.', 'error', 5000);
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

            // Render direct registration success state
            const cardBody = registerForm.parentNode;
            cardBody.innerHTML = `
                <div class="auth-card-header" style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 2px solid #10b981; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #10b981;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </div>
                    <h1 class="auth-card-title" style="font-size: 22px; font-weight: 700; color: #FFFFFF; margin-bottom: 8px;">Account created successfully</h1>
                    <p class="auth-card-subtitle" style="font-size: 14px; color: var(--text-secondary); line-height: 1.6;">
                        Your FRANK account is ready. You can now sign in.
                    </p>
                </div>
                <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 24px;">
                    <a href="login.html?registered=1" class="btn btn-primary btn-full btn-large">
                        Open Login
                    </a>
                </div>
            `;

            showToast('Account created successfully! Redirecting to login...', 'success', 3000);
            setTimeout(() => {
                window.location.href = 'login.html?registered=1';
            }, 2200);
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
            } else if (err.status === 0 || (err.message && err.message.toLowerCase().includes('cannot reach'))) {
                showConnectionAlert(registerForm);
                showToast('Cannot reach the FRANK backend server.', 'error', 5000);
            } else {
                showToast(err.message || 'Registration failed.', 'error');
            }
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').textContent = 'Create Account';
        }
    });
}
