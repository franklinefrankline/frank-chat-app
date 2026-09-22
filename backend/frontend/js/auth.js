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
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    },

    async getCurrentUser() {
        if (typeof api !== 'undefined' && api.getCurrentUser) {
            try {
                const user = await api.getCurrentUser();
                if (user) {
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
        } else {
            localStorage.removeItem('chatapp_user');
        }
    },

    guard() {
        const path = window.location.pathname.replace(/\/+$/, '') || '/';
        const isAuth = this.isAuthenticated();
        const user = this.getUser();

        const protectedRoutes = [
            'dashboard.html', 'chat.html', 'profile.html', 'settings.html', 'admin.html',
            '/dashboard', '/chat', '/profile', '/settings', '/admin'
        ];
        const guestOnlyRoutes = [
            'login.html', 'register.html',
            '/login', '/register'
        ];

        const isProtected = protectedRoutes.some(route => path.endsWith(route) || path === route);
        const isGuestOnly = guestOnlyRoutes.some(route => path.endsWith(route) || path === route);
        const isAdminRoute = path.endsWith('admin.html') || path === '/admin';

        if (isProtected && !isAuth) {
            window.location.href = 'login.html';
        } else if (isAdminRoute && isAuth && (!user || user.role !== 'admin')) {
            // Normal user trying to access admin dashboard -> redirect to user dashboard
            window.location.href = 'dashboard.html';
        } else if (isGuestOnly && isAuth) {
            if (user && user.role === 'admin') {
                window.location.href = 'admin.html';
            } else {
                window.location.href = 'dashboard.html';
            }
        }
    },

    logout() {
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

            showToast(`Welcome back, ${data.user.full_name}!`, 'success');
            setTimeout(() => {
                if (data.user && data.user.role === 'admin') {
                    window.location.href = 'admin.html';
                } else {
                    window.location.href = 'dashboard.html';
                }
            }, 500);
        } catch (err) {
            showToast(err.message || 'Invalid username or password.', 'error');
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').textContent = 'Sign In';
        }
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

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

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
            const data = await api.register({ full_name, email, password });
            api.setToken(data.access_token);
            auth.setUser(data.user);

            showToast('Account created successfully!', 'success');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 500);
        } catch (err) {
            showToast(err.message || 'Registration failed.', 'error');
            submitBtn.disabled = false;
            submitBtn.querySelector('.btn-text').textContent = 'Create Account';
        }
    });
}
