/* =========================================================================
   FRANK — ADMIN DASHBOARD CONTROLLER
   Real-time system management, metrics, user moderation & audit logs
   ========================================================================= */

(function () {
    'use strict';

    const toast = {
        success: (msg, dur) => (window.toast?.success ? window.toast.success(msg, dur) : (window.showToast ? window.showToast(msg, 'success', dur) : console.log(msg))),
        error: (msg, dur) => (window.toast?.error ? window.toast.error(msg, dur) : (window.showToast ? window.showToast(msg, 'error', dur) : console.error(msg))),
        info: (msg, dur) => (window.toast?.info ? window.toast.info(msg, dur) : (window.showToast ? window.showToast(msg, 'info', dur) : console.log(msg))),
        warning: (msg, dur) => (window.toast?.warning ? window.toast.warning(msg, dur) : (window.showToast ? window.showToast(msg, 'warning', dur) : console.warn(msg)))
    };

    class AdminController {
        constructor() {
            this.currentUser = null;
            this.activeSection = 'overview';
            this.metrics = null;

            // Users state
            this.users = [];
            this.usersPagination = {
                page: 1,
                limit: 15,
                total: 0,
                totalPages: 1
            };
            this.userFilters = {
                q: '',
                status: '',
                role: ''
            };
            this.searchDebounceTimer = null;

            // Audit logs state
            this.auditLogs = [];
            this.auditPagination = {
                page: 1,
                limit: 20,
                total: 0,
                totalPages: 1
            };

            // Groups state
            this.groups = [];

            // Modal confirm state
            this.confirmCallback = null;
        }

        async init() {
            try {
                // 1. Authenticate and enforce Admin role
                const user = (auth.getCurrentUser ? await auth.getCurrentUser() : null) || 
                             (typeof api !== 'undefined' && api.getCurrentUser ? await api.getCurrentUser() : null) || 
                             auth.getUser();
                if (!user) {
                    window.location.href = 'login.html';
                    return;
                }

                if (user.role !== 'admin') {
                    toast.error('Access denied: Administrator privileges required.');
                    window.location.href = 'dashboard.html';
                    return;
                }

                this.currentUser = user;
                this.renderAdminProfileInfo();

                // 2. Setup Navigation and UI Handlers
                this.bindNavigationEvents();
                this.bindSearchAndFilterEvents();
                this.bindModalEvents();
                this.bindActionEvents();

                // 3. Connect WebSocket and register admin listeners
                this.setupWebSocket();

                // 4. Initial Data Load
                await this.loadMetrics();
                await this.loadUsers();
                await this.loadGroups();
                await this.loadAuditLogs();
                await this.loadActivity();

            } catch (err) {
                console.error('Failed to initialize AdminController:', err);
                toast.error('Failed to load admin workspace. Please refresh.');
            }
        }

        /* -----------------------------------------------------------------
           1. USER PROFILE & TOPBAR RENDERING
           ----------------------------------------------------------------- */
        renderAdminProfileInfo() {
            if (!this.currentUser) return;
            const name = this.currentUser.full_name || this.currentUser.username || 'Admin';
            const initials = this.getInitials(name);

            // Sidebar
            const sbName = document.getElementById('adminSidebarName');
            const sbInit = document.getElementById('adminSidebarInitials');
            if (sbName) sbName.textContent = name;
            if (sbInit) sbInit.textContent = initials;

            // Profile Section
            const pName = document.getElementById('profileCardName');
            const pUser = document.getElementById('profileCardUsername');
            const pInit = document.getElementById('profileCardInitials');
            const pEmail = document.getElementById('profileCardEmail');
            const pFrankId = document.getElementById('profileCardFrankId');

            if (pName) pName.textContent = name;
            if (pUser) pUser.textContent = `@${this.currentUser.username}`;
            if (pInit) pInit.textContent = initials;
            if (pEmail) pEmail.textContent = this.currentUser.email || '—';
            if (pFrankId) pFrankId.textContent = this.currentUser.frank_id || 'ADM001';
        }

        getInitials(name) {
            if (!name) return 'AD';
            const parts = name.trim().split(/\s+/);
            if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }

        escapeHtml(str) {
            if (str === null || str === undefined) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        formatDate(dateStr) {
            if (!dateStr) return '—';
            try {
                const d = new Date(dateStr);
                return d.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            } catch (e) {
                return dateStr;
            }
        }

        /* -----------------------------------------------------------------
           2. NAVIGATION & TAB SWITCHING
           ----------------------------------------------------------------- */
        bindNavigationEvents() {
            const navItems = document.querySelectorAll('.sidebar-nav .nav-item[data-section]');
            navItems.forEach(item => {
                item.addEventListener('click', () => {
                    const section = item.getAttribute('data-section');
                    this.switchSection(section);
                });
            });

            // Mobile Nav Toggle
            const mobileBtn = document.getElementById('adminMobileNavBtn');
            const sidebar = document.getElementById('adminSidebar');
            const overlay = document.getElementById('adminMobileOverlay');

            if (mobileBtn && sidebar && overlay) {
                mobileBtn.addEventListener('click', () => {
                    const isOpen = sidebar.classList.toggle('open');
                    overlay.classList.toggle('active', isOpen);
                    overlay.classList.toggle('show', isOpen);
                });

                overlay.addEventListener('click', () => {
                    sidebar.classList.remove('open');
                    overlay.classList.remove('active');
                    overlay.classList.remove('show');
                });
            }

            // Global Refresh Button
            const refreshBtn = document.getElementById('adminRefreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async () => {
                    const icon = refreshBtn.querySelector('.refresh-icon');
                    if (icon) icon.classList.add('spinning');
                    refreshBtn.disabled = true;

                    try {
                        await Promise.all([
                            this.loadMetrics(),
                            this.loadUsers(),
                            this.loadGroups(),
                            this.loadAuditLogs(),
                            this.loadActivity()
                        ]);
                        toast.success('Admin data synchronized');
                    } catch (e) {
                        toast.error('Sync failed');
                    } finally {
                        setTimeout(() => {
                            if (icon) icon.classList.remove('spinning');
                            refreshBtn.disabled = false;
                        }, 500);
                    }
                });
            }

            // Sign out handlers
            const signOutBtn = document.getElementById('adminSignOutBtn');
            const profileSignOutBtn = document.getElementById('profileSignOutBtn');
            const handleSignOut = () => {
                auth.logout();
                window.location.href = 'login.html';
            };
            if (signOutBtn) signOutBtn.addEventListener('click', handleSignOut);
            if (profileSignOutBtn) profileSignOutBtn.addEventListener('click', handleSignOut);
        }

        switchSection(sectionId) {
            this.activeSection = sectionId;

            // Update sidebar nav active state
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
                if (item.getAttribute('data-section') === sectionId) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });

            // Update visible section
            const sections = {
                'overview': { el: document.getElementById('sectionOverview'), title: 'Overview & Metrics' },
                'users': { el: document.getElementById('sectionUsers'), title: 'User Management' },
                'groups': { el: document.getElementById('sectionGroups'), title: 'Groups & Channels' },
                'audit': { el: document.getElementById('sectionAudit'), title: 'Audit Logs' },
                'profile': { el: document.getElementById('sectionProfile'), title: 'Admin Profile' }
            };

            Object.entries(sections).forEach(([key, config]) => {
                if (config.el) {
                    if (key === sectionId) {
                        config.el.classList.add('active');
                        const topbarTitle = document.getElementById('adminTopbarTitle');
                        if (topbarTitle) topbarTitle.textContent = config.title;
                    } else {
                        config.el.classList.remove('active');
                    }
                }
            });

            // Close mobile menu if open
            const sidebar = document.getElementById('adminSidebar');
            const overlay = document.getElementById('adminMobileOverlay');
            if (sidebar) sidebar.classList.remove('open');
            if (overlay) overlay.classList.remove('active');
        }

        /* -----------------------------------------------------------------
           3. SEARCH & FILTER CONTROLS
           ----------------------------------------------------------------- */
        bindSearchAndFilterEvents() {
            // User search input with debounce
            const searchInput = document.getElementById('adminUserSearchInput');
            const clearBtn = document.getElementById('adminClearSearchBtn');

            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    const val = searchInput.value.trim();
                    if (clearBtn) clearBtn.style.display = val ? 'inline-block' : 'none';

                    if (this.searchDebounceTimer) clearTimeout(this.searchDebounceTimer);
                    this.searchDebounceTimer = setTimeout(() => {
                        this.userFilters.q = val;
                        this.usersPagination.page = 1;
                        this.loadUsers();
                    }, 300);
                });
            }

            if (clearBtn && searchInput) {
                clearBtn.addEventListener('click', () => {
                    searchInput.value = '';
                    clearBtn.style.display = 'none';
                    this.userFilters.q = '';
                    this.usersPagination.page = 1;
                    this.loadUsers();
                });
            }

            // Filter chips
            const chips = document.querySelectorAll('#userFilterChips .filter-chip');
            chips.forEach(chip => {
                chip.addEventListener('click', () => {
                    chips.forEach(c => c.classList.remove('active'));
                    chip.classList.add('active');

                    const filter = chip.getAttribute('data-filter');
                    if (filter === 'all') {
                        this.userFilters.status = '';
                        this.userFilters.role = '';
                    } else if (filter === 'active' || filter === 'disabled') {
                        this.userFilters.status = filter;
                        this.userFilters.role = '';
                    } else if (filter === 'admin' || filter === 'user') {
                        this.userFilters.status = '';
                        this.userFilters.role = filter;
                    }

                    this.usersPagination.page = 1;
                    this.loadUsers();
                });
            });

            // User pagination buttons
            const prevUserBtn = document.getElementById('usersPrevBtn');
            const nextUserBtn = document.getElementById('usersNextBtn');

            if (prevUserBtn) {
                prevUserBtn.addEventListener('click', () => {
                    if (this.usersPagination.page > 1) {
                        this.usersPagination.page--;
                        this.loadUsers();
                    }
                });
            }

            if (nextUserBtn) {
                nextUserBtn.addEventListener('click', () => {
                    if (this.usersPagination.page < this.usersPagination.totalPages) {
                        this.usersPagination.page++;
                        this.loadUsers();
                    }
                });
            }

            // Audit pagination buttons
            const prevAuditBtn = document.getElementById('auditPrevBtn');
            const nextAuditBtn = document.getElementById('auditNextBtn');

            if (prevAuditBtn) {
                prevAuditBtn.addEventListener('click', () => {
                    if (this.auditPagination.page > 1) {
                        this.auditPagination.page--;
                        this.loadAuditLogs();
                    }
                });
            }

            if (nextAuditBtn) {
                nextAuditBtn.addEventListener('click', () => {
                    if (this.auditPagination.page < this.auditPagination.totalPages) {
                        this.auditPagination.page++;
                        this.loadAuditLogs();
                    }
                });
            }
        }

        /* -----------------------------------------------------------------
           4. MODAL MANAGEMENT (USER DETAILS & CONFIRMATION)
           ----------------------------------------------------------------- */
        bindModalEvents() {
            // User details modal close
            const closeDetailsBtn = document.getElementById('closeUserDetailsModalBtn');
            const detailsModal = document.getElementById('adminUserDetailsModal');
            if (closeDetailsBtn && detailsModal) {
                closeDetailsBtn.addEventListener('click', () => {
                    detailsModal.classList.remove('open', 'active');
                });
                detailsModal.addEventListener('click', (e) => {
                    if (e.target === detailsModal) detailsModal.classList.remove('open', 'active');
                });
            }

            // Confirmation modal close & submit
            const confirmModal = document.getElementById('adminConfirmModal');
            const confirmCloseBtn = document.getElementById('adminConfirmCloseBtn');
            const confirmCancelBtn = document.getElementById('adminConfirmCancelBtn');
            const confirmSubmitBtn = document.getElementById('adminConfirmSubmitBtn');

            const closeConfirm = () => {
                if (confirmModal) confirmModal.classList.remove('open', 'active');
                this.confirmCallback = null;
            };

            if (confirmCloseBtn) confirmCloseBtn.addEventListener('click', closeConfirm);
            if (confirmCancelBtn) confirmCancelBtn.addEventListener('click', closeConfirm);
            if (confirmModal) {
                confirmModal.addEventListener('click', (e) => {
                    if (e.target === confirmModal) closeConfirm();
                });
            }

            // Keyboard Escape dismiss
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    if (confirmModal) confirmModal.classList.remove('open', 'active');
                    if (detailsModal) detailsModal.classList.remove('open', 'active');
                    this.confirmCallback = null;
                }
            });

            if (confirmSubmitBtn) {
                confirmSubmitBtn.addEventListener('click', async () => {
                    if (typeof this.confirmCallback === 'function') {
                        confirmSubmitBtn.disabled = true;
                        try {
                            await this.confirmCallback();
                        } catch (err) {
                            console.error('Error executing confirm callback:', err);
                        } finally {
                            confirmSubmitBtn.disabled = false;
                            closeConfirm();
                        }
                    }
                });
            }
        }

        showConfirmDialog({ title, message, warning, confirmText, confirmClass, onConfirm }) {
            const modal = document.getElementById('adminConfirmModal');
            const titleEl = document.getElementById('adminConfirmTitle');
            const msgEl = document.getElementById('adminConfirmMessage');
            const warnEl = document.getElementById('adminConfirmWarning');
            const submitBtn = document.getElementById('adminConfirmSubmitBtn');

            if (!modal || !titleEl || !msgEl || !submitBtn) return;

            titleEl.textContent = title || 'Confirm Action';
            msgEl.textContent = message || 'Are you sure you want to proceed?';

            if (warning) {
                warnEl.textContent = warning;
                warnEl.style.display = 'block';
            } else {
                warnEl.style.display = 'none';
            }

            submitBtn.textContent = confirmText || 'Confirm';
            submitBtn.className = `btn ${confirmClass || 'btn-danger'}`;
            this.confirmCallback = onConfirm;

            modal.classList.add('open', 'active');
        }

        /* -----------------------------------------------------------------
           5. DATA LOADING: METRICS, USERS, GROUPS, AUDIT, ACTIVITY
           ----------------------------------------------------------------- */
        async loadMetrics() {
            try {
                const res = await api.getAdminMetrics();
                if (!res) return;
                this.metrics = res;

                this.animateCounter('metricTotalUsers', res.total_users || 0);
                this.animateCounter('metricActiveAccounts', res.active_accounts ?? res.active_users ?? 0);
                this.animateCounter('metricDisabledAccounts', res.disabled_accounts ?? res.disabled_users ?? 0);
                this.animateCounter('metricEmailVerified', res.email_verified ?? res.verified_emails ?? 0);
                this.animateCounter('metricTotalMessages', res.total_messages || 0);
                this.animateCounter('metricTotalGroups', res.groups ?? res.total_groups ?? 0);
                this.animateCounter('metricTotalFiles', res.files ?? res.total_files ?? 0);
            } catch (err) {
                console.error('Failed to load metrics:', err);
            }
        }

        animateCounter(id, targetVal) {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = targetVal.toLocaleString();
        }

        async loadUsers() {
            const tbody = document.getElementById('usersTableBody');
            if (!tbody) return;

            try {
                const params = {
                    page: this.usersPagination.page,
                    limit: this.usersPagination.limit
                };
                if (this.userFilters.q) params.q = this.userFilters.q;
                if (this.userFilters.status) params.status = this.userFilters.status;
                if (this.userFilters.role) params.role = this.userFilters.role;

                const res = await api.getAdminUsers(params);
                if (!res) return;

                this.users = res.users || [];
                this.usersPagination.total = res.total || 0;
                this.usersPagination.page = res.page || 1;
                this.usersPagination.totalPages = res.pages || 1;

                this.renderUsersTable();
                this.renderUsersPagination();
            } catch (err) {
                console.error('Failed to load users:', err);
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; color: var(--danger); padding: 24px;">
                            Failed to load users. ${this.escapeHtml(err.message || '')}
                        </td>
                    </tr>
                `;
            }
        }

        renderUsersTable() {
            const tbody = document.getElementById('usersTableBody');
            if (!tbody) return;

            if (this.users.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 36px;">
                            No user accounts matched the filter criteria.
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = this.users.map(u => {
                const isSelf = this.currentUser && this.currentUser.id === u.id;
                const statusBadge = u.account_status === 'disabled'
                    ? `<span class="badge-status-disabled">● Disabled</span>`
                    : `<span class="badge-status-active">● Active</span>`;

                const roleBadge = u.role === 'admin'
                    ? `<span class="badge-role-admin">Admin</span>`
                    : `<span class="badge-role-user">User</span>`;

                const statusActionBtn = u.account_status === 'disabled'
                    ? `<button type="button" class="btn-action btn-action-status-enable" data-action="enable" data-id="${u.id}" data-name="${this.escapeHtml(u.full_name || u.username)}">Enable</button>`
                    : `<button type="button" class="btn-action btn-action-status-disable" data-action="disable" data-id="${u.id}" data-name="${this.escapeHtml(u.full_name || u.username)}" ${isSelf ? 'disabled title="Cannot disable your own admin account"' : ''}>Disable</button>`;

                const deleteAccountBtn = isSelf
                    ? `<button type="button" class="btn-action btn-action-delete" disabled title="Cannot delete your own admin account" style="opacity:0.4; cursor:not-allowed;">Delete</button>`
                    : `<button type="button" class="btn-action btn-action-delete" data-action="delete-account" data-id="${u.id}" data-name="${this.escapeHtml(u.full_name || u.username)}" data-email="${this.escapeHtml(u.email)}">Delete</button>`;

                return `
                    <tr data-user-id="${u.id}">
                        <td>
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="avatar avatar-sm" style="flex-shrink:0;">
                                    <span>${this.getInitials(u.full_name || u.username)}</span>
                                </div>
                                <div style="min-width:0;">
                                    <div style="font-weight: 700; color: var(--text);">${this.escapeHtml(u.full_name || u.username)} ${isSelf ? '<span style="font-size:10px; color:var(--primary); font-weight:800;">(YOU)</span>' : ''}</div>
                                    <div style="font-size: 11px; color: var(--text-muted);">@${this.escapeHtml(u.username)}</div>
                                </div>
                            </div>
                        </td>
                        <td style="color: var(--text-secondary);">${this.escapeHtml(u.email || '—')}</td>
                        <td>
                            <span style="font-family: monospace; font-weight: 700; background: var(--surface-elevated); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border); color: var(--accent-cyan); font-size: 12px;">
                                ${this.escapeHtml(u.frank_id || '—')}
                            </span>
                        </td>
                        <td>${roleBadge}</td>
                        <td>${statusBadge}</td>
                        <td style="color: var(--text-muted); font-size: 12px;">${this.formatDate(u.created_at)}</td>
                        <td style="text-align: right;">
                            <div class="action-buttons-wrap">
                                <button type="button" class="btn-action btn-action-view" data-action="view" data-id="${u.id}">View</button>
                                ${statusActionBtn}
                                <button type="button" class="btn-action btn-action-wipe" data-action="delete-data" data-id="${u.id}" data-name="${this.escapeHtml(u.full_name || u.username)}" title="Delete user messages and documents without removing account">Wipe Data</button>
                                ${deleteAccountBtn}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        renderUsersPagination() {
            const info = document.getElementById('usersPaginationInfo');
            const pageNum = document.getElementById('usersPageNum');
            const prevBtn = document.getElementById('usersPrevBtn');
            const nextBtn = document.getElementById('usersNextBtn');

            const { page, limit, total, totalPages } = this.usersPagination;
            const start = total === 0 ? 0 : (page - 1) * limit + 1;
            const end = Math.min(page * limit, total);

            if (info) info.textContent = `Showing ${start}–${end} of ${total} users`;
            if (pageNum) pageNum.textContent = `Page ${page} of ${totalPages || 1}`;

            if (prevBtn) prevBtn.disabled = page <= 1;
            if (nextBtn) nextBtn.disabled = page >= totalPages;
        }

        bindActionEvents() {
            const tbody = document.getElementById('usersTableBody');
            if (!tbody) return;

            tbody.addEventListener('click', async (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn || btn.disabled) return;

                const action = btn.getAttribute('data-action');
                const userId = parseInt(btn.getAttribute('data-id'), 10);
                const userName = btn.getAttribute('data-name') || 'User';
                const userEmail = btn.getAttribute('data-email') || '';

                if (action === 'view') {
                    this.showUserDetails(userId);
                } else if (action === 'disable') {
                    this.handleStatusChange(userId, userName, 'disabled');
                } else if (action === 'enable') {
                    this.handleStatusChange(userId, userName, 'active');
                } else if (action === 'delete-data') {
                    this.handleDeleteUserData(userId, userName);
                } else if (action === 'delete-account') {
                    this.handleDeleteUserAccount(userId, userName, userEmail);
                }
            });
        }

        async showUserDetails(userId) {
            const modal = document.getElementById('adminUserDetailsModal');
            const body = document.getElementById('userDetailsModalBody');
            if (!modal || !body) return;

            modal.classList.add('open', 'active');
            body.innerHTML = `<div class="spinner" style="margin: 24px auto;"></div>`;

            try {
                const user = await api.getAdminUserDetails(userId);
                if (!user) {
                    body.innerHTML = `<p style="color:var(--danger); text-align:center;">Failed to load user details.</p>`;
                    return;
                }

                body.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
                        <div class="avatar avatar-lg">
                            <span>${this.getInitials(user.full_name || user.username)}</span>
                        </div>
                        <div>
                            <div style="font-size: 16px; font-weight: 800; color: var(--text);">${this.escapeHtml(user.full_name || user.username)}</div>
                            <div style="font-size: 13px; color: var(--text-muted);">@${this.escapeHtml(user.username)}</div>
                            <div style="margin-top: 4px; display: flex; gap: 6px;">
                                <span class="${user.role === 'admin' ? 'badge-role-admin' : 'badge-role-user'}">${user.role}</span>
                                <span class="${user.account_status === 'disabled' ? 'badge-status-disabled' : 'badge-status-active'}">${user.account_status}</span>
                            </div>
                        </div>
                    </div>

                    <div class="detail-row">
                        <span class="detail-label">User ID</span>
                        <span class="detail-value">#${user.id}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Email Address</span>
                        <span class="detail-value">${this.escapeHtml(user.email || '—')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">FRANK ID</span>
                        <span class="detail-value" style="font-family: monospace; color: var(--accent-cyan); font-weight: 800;">${this.escapeHtml(user.frank_id || '—')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Email Verified</span>
                        <span class="detail-value">${user.email_verified ? 'Yes (Verified)' : 'No (Pending)'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Registered At</span>
                        <span class="detail-value">${this.formatDate(user.created_at)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">Last Updated</span>
                        <span class="detail-value">${this.formatDate(user.updated_at)}</span>
                    </div>

                    <div style="margin-top: 20px; padding: 14px; background: var(--surface-elevated); border-radius: var(--radius-md); border: 1px solid var(--border);">
                        <div style="font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">Activity Summary (Metadata Only)</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; text-align: center;">
                            <div>
                                <div style="font-size: 18px; font-weight: 800; color: var(--text);">${user.message_count || 0}</div>
                                <div style="font-size: 11px; color: var(--text-muted);">Messages</div>
                            </div>
                            <div>
                                <div style="font-size: 18px; font-weight: 800; color: var(--text);">${user.file_count || 0}</div>
                                <div style="font-size: 11px; color: var(--text-muted);">Files</div>
                            </div>
                            <div>
                                <div style="font-size: 18px; font-weight: 800; color: var(--text);">${user.group_count || 0}</div>
                                <div style="font-size: 11px; color: var(--text-muted);">Groups</div>
                            </div>
                        </div>
                    </div>
                `;
            } catch (err) {
                body.innerHTML = `<p style="color:var(--danger); text-align:center;">Error: ${this.escapeHtml(err.message || '')}</p>`;
            }
        }

        handleStatusChange(userId, userName, newStatus) {
            const isDisabling = newStatus === 'disabled';
            this.showConfirmDialog({
                title: isDisabling ? 'Disable User Account' : 'Enable User Account',
                message: isDisabling
                    ? `Are you sure you want to disable ${userName}'s account? The user will be immediately disconnected and prevented from authenticating.`
                    : `Are you sure you want to enable ${userName}'s account? The user will be allowed to log in.`,
                confirmText: isDisabling ? 'Disable Account' : 'Enable Account',
                confirmClass: isDisabling ? 'btn-danger' : 'btn-primary',
                onConfirm: async () => {
                    try {
                        await api.updateAdminUserStatus(userId, newStatus);
                        toast.success(`User ${userName} is now ${newStatus}`);
                        await Promise.all([this.loadUsers(), this.loadMetrics(), this.loadAuditLogs()]);
                    } catch (err) {
                        toast.error(err.message || 'Failed to update user status');
                    }
                }
            });
        }

        handleDeleteUserData(userId, userName) {
            this.showConfirmDialog({
                title: 'Delete User Data',
                message: `Are you sure you want to delete all messages, media attachments, and activity history for ${userName}? The user account will remain active, but their personal data will be completely purged.`,
                warning: 'This action cannot be undone. All messages and files created by this user will be deleted.',
                confirmText: 'Wipe User Data',
                confirmClass: 'btn-danger',
                onConfirm: async () => {
                    try {
                        await api.deleteAdminUserData(userId);
                        toast.success(`Data purged for ${userName}`);
                        await Promise.all([this.loadMetrics(), this.loadAuditLogs()]);
                    } catch (err) {
                        toast.error(err.message || 'Failed to delete user data');
                    }
                }
            });
        }

        handleDeleteUserAccount(userId, userName, userEmail) {
            this.showConfirmDialog({
                title: 'Delete Account?',
                message: `Are you sure you want to permanently delete the account for ${userName} (${userEmail})?`,
                warning: 'This action cannot be undone.',
                confirmText: 'Delete Account',
                confirmClass: 'btn-danger',
                onConfirm: async () => {
                    try {
                        await api.deleteAdminUserAccount(userId);
                        toast.success(`Account for ${userName} permanently deleted`);
                        await Promise.all([this.loadUsers(), this.loadMetrics(), this.loadAuditLogs()]);
                    } catch (err) {
                        toast.error(err.message || 'Failed to delete user account');
                    }
                }
            });
        }

        async loadGroups() {
            const tbody = document.getElementById('groupsTableBody');
            if (!tbody) return;

            try {
                const res = await api.getAdminGroups();
                this.groups = Array.isArray(res) ? res : (res && res.groups ? res.groups : []);

                if (this.groups.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 36px;">
                                No group channels found in the database.
                            </td>
                        </tr>
                    `;
                    return;
                }

                tbody.innerHTML = this.groups.map(g => `
                    <tr>
                        <td style="font-weight: 700; color: var(--text);">${this.escapeHtml(g.name)}</td>
                        <td><span style="font-family: monospace; font-size: 11px; color: var(--text-muted);">#${g.id}</span></td>
                        <td>
                            <span class="badge ${g.is_private ? 'badge-secondary' : 'badge-primary'}">
                                ${g.is_private ? 'Private' : 'Public'}
                            </span>
                        </td>
                        <td style="color: var(--text-secondary);">${this.escapeHtml(g.creator_name || `User #${g.created_by}`)}</td>
                        <td>
                            <span style="font-weight: 700;">${g.member_count || 0}</span>
                            <span style="color: var(--text-muted); font-size: 12px;"> members</span>
                        </td>
                        <td style="color: var(--text-muted); font-size: 12px;">${this.formatDate(g.created_at)}</td>
                    </tr>
                `).join('');
            } catch (err) {
                console.error('Failed to load groups:', err);
                tbody.innerHTML = `
                    <tr>
                        <td colspan="6" style="text-align: center; color: var(--danger); padding: 24px;">
                            Failed to load groups. ${this.escapeHtml(err.message || '')}
                        </td>
                    </tr>
                `;
            }
        }

        async loadAuditLogs() {
            const tbody = document.getElementById('auditTableBody');
            if (!tbody) return;

            try {
                const res = await api.getAdminAuditLogs({
                    page: this.auditPagination.page,
                    limit: this.auditPagination.limit
                });

                if (!res) return;
                this.auditLogs = res.logs || [];
                this.auditPagination.total = res.total || 0;
                this.auditPagination.page = res.page || 1;
                this.auditPagination.totalPages = res.pages || 1;

                if (this.auditLogs.length === 0) {
                    tbody.innerHTML = `
                        <tr>
                            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 36px;">
                                No administrative audit entries recorded yet.
                            </td>
                        </tr>
                    `;
                    return;
                }

                tbody.innerHTML = this.auditLogs.map(log => `
                    <tr>
                        <td style="white-space: nowrap; color: var(--text-muted); font-size: 12px;">${this.formatDate(log.created_at)}</td>
                        <td style="font-weight: 600; color: var(--text);">${this.escapeHtml(log.admin_name || `Admin #${log.admin_id}`)}</td>
                        <td>
                            <span class="badge ${this.getAuditBadgeClass(log.action)}">
                                ${this.escapeHtml(log.action)}
                            </span>
                        </td>
                        <td style="font-weight: 600; color: var(--text-secondary);">${this.escapeHtml(log.target_type || '—')} #${log.target_id || ''}</td>
                        <td style="color: var(--text-secondary); font-size: 12px;">${this.escapeHtml(log.details || '—')}</td>
                    </tr>
                `).join('');

                this.renderAuditPagination();
            } catch (err) {
                console.error('Failed to load audit logs:', err);
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; color: var(--danger); padding: 24px;">
                            Failed to load audit logs. ${this.escapeHtml(err.message || '')}
                        </td>
                    </tr>
                `;
            }
        }

        renderAuditPagination() {
            const info = document.getElementById('auditPaginationInfo');
            const pageNum = document.getElementById('auditPageNum');
            const prevBtn = document.getElementById('auditPrevBtn');
            const nextBtn = document.getElementById('auditNextBtn');

            const { page, limit, total, totalPages } = this.auditPagination;
            const start = total === 0 ? 0 : (page - 1) * limit + 1;
            const end = Math.min(page * limit, total);

            if (info) info.textContent = `Showing ${start}–${end} of ${total} logs`;
            if (pageNum) pageNum.textContent = `Page ${page} of ${totalPages || 1}`;

            if (prevBtn) prevBtn.disabled = page <= 1;
            if (nextBtn) nextBtn.disabled = page >= totalPages;
        }

        getAuditBadgeClass(action) {
            if (!action) return 'badge-secondary';
            const a = action.toLowerCase();
            if (a.includes('delete') || a.includes('disable')) return 'badge-danger';
            if (a.includes('enable') || a.includes('create')) return 'badge-success';
            if (a.includes('update') || a.includes('status')) return 'badge-warning';
            return 'badge-primary';
        }

        async loadActivity() {
            const list = document.getElementById('liveActivityList');
            if (!list) return;

            try {
                const activities = await api.getAdminActivity();
                if (!Array.isArray(activities) || activities.length === 0) {
                    list.innerHTML = `
                        <div style="text-align: center; color: var(--text-muted); padding: 24px; font-size: 13px;">
                            No recent system activity.
                        </div>
                    `;
                    return;
                }

                list.innerHTML = activities.map(item => `
                    <div class="activity-item">
                        <div class="activity-desc">
                            <span class="activity-badge ${this.getAuditBadgeClass(item.type)}">${this.escapeHtml(item.type)}</span>
                            <span>${this.escapeHtml(item.description)}</span>
                        </div>
                        <span class="activity-time">${this.formatDate(item.timestamp)}</span>
                    </div>
                `).join('');
            } catch (err) {
                console.error('Failed to load activity:', err);
                list.innerHTML = `
                    <div style="text-align: center; color: var(--danger); padding: 16px; font-size: 13px;">
                        Failed to load activity stream.
                    </div>
                `;
            }
        }

        /* -----------------------------------------------------------------
           6. REAL-TIME WEBSOCKET LISTENERS
           ----------------------------------------------------------------- */
        setupWebSocket() {
            if (!window.wsClient) return;

            window.wsClient.connect();

            // Status updates
            window.wsClient.on('status', (data) => {
                const badge = document.getElementById('adminLiveBadge');
                if (!badge) return;
                if (data.status === 'connected') {
                    badge.innerHTML = `<span class="live-dot"></span> LIVE`;
                    badge.style.color = 'var(--success)';
                    badge.style.borderColor = 'rgba(34, 197, 94, 0.25)';
                } else if (data.status === 'serverless_sync') {
                    badge.innerHTML = `<span class="live-dot" style="background:var(--primary); box-shadow:0 0 8px var(--primary);"></span> CLOUD SYNC`;
                    badge.style.color = 'var(--primary)';
                    badge.style.borderColor = 'rgba(37, 99, 235, 0.25)';
                } else if (data.status === 'connecting' || data.status === 'reconnecting') {
                    badge.innerHTML = `<span class="live-dot" style="background:var(--warning); box-shadow:none;"></span> SYNCING`;
                    badge.style.color = 'var(--warning)';
                    badge.style.borderColor = 'rgba(245, 158, 11, 0.25)';
                } else {
                    badge.innerHTML = `<span class="live-dot" style="background:var(--danger); box-shadow:none;"></span> OFFLINE`;
                    badge.style.color = 'var(--danger)';
                    badge.style.borderColor = 'rgba(239, 68, 68, 0.25)';
                }
            });

            // Fallback sync when in serverless mode or disconnected
            if (this._adminSyncTimer) clearInterval(this._adminSyncTimer);
            this._adminSyncTimer = setInterval(async () => {
                if (window.wsClient && window.wsClient.isConnected) return;
                try {
                    await this.loadMetrics();
                    if (this.activeSection === 'overview') {
                        await this.loadActivity();
                    }
                } catch {}
            }, 6000);

            // Metrics updated
            window.wsClient.on('admin_metrics_updated', (data) => {
                if (data.metrics) {
                    this.metrics = data.metrics;
                    this.animateCounter('metricTotalUsers', data.metrics.total_users || 0);
                    this.animateCounter('metricActiveAccounts', data.metrics.active_accounts ?? data.metrics.active_users ?? 0);
                    this.animateCounter('metricDisabledAccounts', data.metrics.disabled_accounts ?? data.metrics.disabled_users ?? 0);
                    this.animateCounter('metricEmailVerified', data.metrics.email_verified ?? data.metrics.verified_emails ?? 0);
                    this.animateCounter('metricTotalMessages', data.metrics.total_messages || 0);
                    this.animateCounter('metricTotalGroups', data.metrics.groups ?? data.metrics.total_groups ?? 0);
                    this.animateCounter('metricTotalFiles', data.metrics.files ?? data.metrics.total_files ?? 0);
                }
            });

            // User created
            window.wsClient.on('admin_user_created', (data) => {
                if (data.metrics) {
                    this.animateCounter('metricTotalUsers', data.metrics.total_users || 0);
                    this.animateCounter('metricActiveAccounts', data.metrics.active_users || 0);
                }
                this.loadUsers();
                this.prependActivityItem({
                    type: 'user_created',
                    description: `New user registered: ${data.user ? (data.user.full_name || data.user.username) : 'User'}`,
                    timestamp: new Date().toISOString()
                });
            });

            // User updated / status changed
            window.wsClient.on('admin_user_updated', (data) => {
                if (data.metrics) {
                    this.animateCounter('metricActiveAccounts', data.metrics.active_users || 0);
                    this.animateCounter('metricDisabledAccounts', data.metrics.disabled_users || 0);
                }
                this.loadUsers();
            });

            // User deleted
            window.wsClient.on('admin_user_deleted', (data) => {
                if (data.metrics) {
                    this.animateCounter('metricTotalUsers', data.metrics.total_users || 0);
                    this.animateCounter('metricActiveAccounts', data.metrics.active_users || 0);
                    this.animateCounter('metricDisabledAccounts', data.metrics.disabled_users || 0);
                }
                this.loadMetrics();
                this.loadUsers();
            });

            // Group created
            window.wsClient.on('admin_group_created', (data) => {
                if (data.metrics) {
                    this.animateCounter('metricTotalGroups', data.metrics.total_groups || 0);
                }
                this.loadMetrics();
                this.loadGroups();
                this.prependActivityItem({
                    type: 'group_created',
                    description: `New group created: ${data.group ? data.group.name : 'Group'}`,
                    timestamp: new Date().toISOString()
                });
            });

            // Group deleted
            window.wsClient.on('admin_group_deleted', (data) => {
                this.loadMetrics();
                this.loadGroups();
            });

            // Audit log created
            window.wsClient.on('admin_audit_created', (data) => {
                const log = data.audit || data.log;
                if (log) {
                    this.loadAuditLogs();
                    this.prependActivityItem({
                        type: log.action || 'admin_action',
                        description: `${log.admin_name || 'Admin'}: ${(log.action || '').replace(/_/g, ' ')} on ${log.target_type || ''} ${log.target_name || ''}`,
                        timestamp: log.created_at || new Date().toISOString()
                    });
                }
            });

            // Message count update
            window.wsClient.on('admin_message_count_updated', (data) => {
                if (typeof data.total_messages === 'number') {
                    this.animateCounter('metricTotalMessages', data.total_messages);
                } else {
                    this.loadMetrics();
                }
            });

            // File count update
            window.wsClient.on('admin_file_count_updated', (data) => {
                const count = typeof data.files === 'number' ? data.files : (typeof data.total_files === 'number' ? data.total_files : null);
                if (count !== null) {
                    this.animateCounter('metricTotalFiles', count);
                } else {
                    this.loadMetrics();
                }
            });
        }

        prependActivityItem(item) {
            const list = document.getElementById('liveActivityList');
            if (!list) return;

            // Remove empty state if present
            const empty = list.querySelector('.empty-state');
            if (empty) empty.remove();

            const div = document.createElement('div');
            div.className = 'activity-item';
            div.innerHTML = `
                <div class="activity-desc">
                    <span class="activity-badge ${this.getAuditBadgeClass(item.type)}">${this.escapeHtml(item.type)}</span>
                    <span>${this.escapeHtml(item.description)}</span>
                </div>
                <span class="activity-time">${this.formatDate(item.timestamp)}</span>
            `;

            if (list.firstChild) {
                list.insertBefore(div, list.firstChild);
            } else {
                list.appendChild(div);
            }

            // Keep max 20 items in live list
            while (list.children.length > 20) {
                list.removeChild(list.lastChild);
            }
        }
    }

    // Initialize controller on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        window.adminController = new AdminController();
        window.adminController.init();
    });

})();
