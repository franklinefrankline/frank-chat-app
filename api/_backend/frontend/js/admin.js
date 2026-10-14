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

            // Account access requests state
            this.accessRequests = [];
            this.accessRequestsPagination = {
                page: 1,
                limit: 10,
                total: 0,
                totalPages: 1
            };
            this.accessRequestsFilters = {
                q: '',
                status: 'all',
                source: 'all'
            };
            this.accessRequestsDebounce = null;

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
                this.bindAccessRequestsEvents();
                this.bindModalEvents();
                this.bindActionEvents();

                // 3. Connect WebSocket and register admin listeners
                this.setupWebSocket();

                // Multilingual UI listener
                window.addEventListener('frank:languageChanged', () => {
                    this.renderAdminProfileInfo();
                    if (this.users && this.users.length > 0) {
                        this.renderUsersTable();
                        this.renderUsersPagination();
                    }
                    if (this.groups && this.groups.length > 0) {
                        this.renderGroupsTable();
                    }
                    if (this.auditLogs && this.auditLogs.length > 0) {
                        this.renderAuditTable();
                        this.renderAuditPagination();
                    }
                    if (this.accessRequests && this.accessRequests.length > 0) {
                        this.renderAccessRequestsTable();
                        this.renderAccessRequestsPagination();
                    }
                    this.switchSection(this.activeSection);
                });

                // 4. Initial Data Load
                await this.loadMetrics();
                await this.loadAccessRequestsMetrics();
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

            // Mobile Nav Toggle & Drawer
            const mobileBtn = document.getElementById('adminMobileNavBtn');
            const closeBtn = document.getElementById('adminMobileCloseBtn');
            const sidebar = document.getElementById('adminSidebar');
            const overlay = document.getElementById('adminMobileOverlay');

            const closeAdminSidebar = () => {
                if (sidebar) sidebar.classList.remove('open');
                if (overlay) {
                    overlay.classList.remove('active');
                    overlay.classList.remove('show');
                }
            };

            const openAdminSidebar = () => {
                if (sidebar) sidebar.classList.add('open');
                if (overlay) {
                    overlay.classList.add('active');
                    overlay.classList.add('show');
                }
            };

            if (mobileBtn && sidebar) {
                mobileBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (sidebar.classList.contains('open')) {
                        closeAdminSidebar();
                    } else {
                        openAdminSidebar();
                    }
                });
            }

            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeAdminSidebar();
                });
            }

            if (overlay) {
                overlay.addEventListener('click', closeAdminSidebar);
            }

            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && sidebar && sidebar.classList.contains('open')) {
                    closeAdminSidebar();
                }
            });

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
            const drawerSignOutBtn = document.getElementById('adminDrawerSignOutBtn');
            const headerSignOutBtn = document.getElementById('adminHeaderSignOutBtn');

            const handleSignOut = (e) => {
                if (e) e.preventDefault();
                auth.logout();
                window.location.href = 'login.html';
            };
            if (signOutBtn) signOutBtn.addEventListener('click', handleSignOut);
            if (profileSignOutBtn) profileSignOutBtn.addEventListener('click', handleSignOut);
            if (drawerSignOutBtn) drawerSignOutBtn.addEventListener('click', handleSignOut);
            if (headerSignOutBtn) headerSignOutBtn.addEventListener('click', handleSignOut);
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
                'overview': { el: document.getElementById('sectionOverview'), key: 'admin.metrics', title: 'Overview & Metrics' },
                'users': { el: document.getElementById('sectionUsers'), key: 'admin.userManagement', title: 'User Management' },
                'groups': { el: document.getElementById('sectionGroups'), key: 'admin.groupsChats', title: 'Groups & Channels' },
                'audit': { el: document.getElementById('sectionAudit'), key: 'admin.auditLogs', title: 'Audit Logs' },
                'access-requests': { el: document.getElementById('sectionAccessRequests'), key: 'admin.accessRequests', title: 'Account Access Requests' },
                'profile': { el: document.getElementById('sectionProfile'), key: 'admin.adminProfile', title: 'Admin Profile' }
            };

            Object.entries(sections).forEach(([key, config]) => {
                if (config.el) {
                    if (key === sectionId) {
                        config.el.classList.add('active');
                        const topbarTitle = document.getElementById('adminTopbarTitle');
                        if (topbarTitle) {
                            topbarTitle.setAttribute('data-i18n', config.key);
                            topbarTitle.textContent = (window.i18n ? window.i18n.t(config.key) : null) || config.title;
                        }
                    } else {
                        config.el.classList.remove('active');
                    }
                }
            });

            // Close mobile menu if open
            const sidebar = document.getElementById('adminSidebar');
            const overlay = document.getElementById('adminMobileOverlay');
            if (sidebar) sidebar.classList.remove('open');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.classList.remove('show');
            }

            // Trigger section-specific loads
            if (sectionId === 'access-requests') {
                this.loadAccessRequests();
            }
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
                const emptyMsg = window.i18n ? window.i18n.t('admin.noUsersMatched', 'No user accounts matched the filter criteria.') : 'No user accounts matched the filter criteria.';
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 36px;">
                            ${emptyMsg}
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = this.users.map(u => {
                const isSelf = this.currentUser && this.currentUser.id === u.id;
                const isInactive = u.account_status === 'disabled' || u.account_status === 'deactivated' || u.is_active === false;
                const statusBadge = isInactive
                    ? `<span class="badge-status-disabled">● ${window.i18n ? window.i18n.t('admin.deactivated', 'DEACTIVATED') : 'DEACTIVATED'}</span>`
                    : `<span class="badge-status-active">● ${window.i18n ? window.i18n.t('admin.active', 'ACTIVE') : 'ACTIVE'}</span>`;

                const roleBadge = u.role === 'admin'
                    ? `<span class="badge-role-admin">${window.i18n ? window.i18n.t('admin.roleAdmin', 'Admin') : 'Admin'}</span>`
                    : `<span class="badge-role-user">${window.i18n ? window.i18n.t('admin.user', 'User') : 'User'}</span>`;

                const activateText = window.i18n ? window.i18n.t('admin.activate', 'Activate') : 'Activate';
                const deactivateText = window.i18n ? window.i18n.t('admin.deactivate', 'Deactivate') : 'Deactivate';
                const deleteText = window.i18n ? window.i18n.t('common.delete', 'Delete') : 'Delete';
                const viewText = window.i18n ? window.i18n.t('common.view', 'View') : 'View';
                const wipeText = window.i18n ? window.i18n.t('admin.wipeData', 'Wipe Data') : 'Wipe Data';
                const youText = window.i18n ? window.i18n.t('common.you', 'YOU') : 'YOU';

                const statusActionBtn = isInactive
                    ? `<button type="button" class="btn-action btn-action-activate btn-action-status-enable" data-action="activate" data-id="${u.id}" data-name="${this.escapeHtml(u.full_name || u.username)}">${activateText}</button>`
                    : `<button type="button" class="btn-action btn-action-deactivate btn-action-status-disable" data-action="deactivate" data-id="${u.id}" data-name="${this.escapeHtml(u.full_name || u.username)}" ${isSelf ? 'disabled title="Cannot deactivate your own admin account"' : ''}>${deactivateText}</button>`;

                const deleteAccountBtn = isSelf
                    ? `<button type="button" class="btn-action btn-action-delete" disabled title="Cannot delete your own admin account" style="opacity:0.4; cursor:not-allowed;">${deleteText}</button>`
                    : `<button type="button" class="btn-action btn-action-delete" data-action="delete-account" data-id="${u.id}" data-name="${this.escapeHtml(u.full_name || u.username)}" data-email="${this.escapeHtml(u.email || '')}" data-frank-id="${this.escapeHtml(u.frank_id || '')}">${deleteText}</button>`;

                return `
                    <tr data-user-id="${u.id}">
                        <td data-label="User">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="avatar avatar-sm" style="flex-shrink:0;">
                                    <span>${this.getInitials(u.full_name || u.username)}</span>
                                </div>
                                <div style="min-width:0;">
                                    <div style="font-weight: 700; color: var(--text);">${this.escapeHtml(u.full_name || u.username)} ${isSelf ? `<span style="font-size:10px; color:var(--primary); font-weight:800;">(${youText})</span>` : ''}</div>
                                    <div style="font-size: 11px; color: var(--text-muted);">@${this.escapeHtml(u.username)}</div>
                                </div>
                            </div>
                        </td>
                        <td data-label="Email" style="color: var(--text-secondary);">${this.escapeHtml(u.email || '—')}</td>
                        <td data-label="FRANK ID">
                            <span style="font-family: monospace; font-weight: 700; background: var(--surface-elevated); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border); color: var(--accent-cyan); font-size: 12px;">
                                ${this.escapeHtml(u.frank_id || '—')}
                            </span>
                        </td>
                        <td data-label="Role">${roleBadge}</td>
                        <td data-label="Status">${statusBadge}</td>
                        <td data-label="Created" style="color: var(--text-muted); font-size: 12px;">${this.formatDate(u.created_at)}</td>
                        <td data-label="Actions" style="text-align: right;">
                            <div class="action-buttons-wrap">
                                <button type="button" class="btn-action btn-action-view" data-action="view" data-id="${u.id}">${viewText}</button>
                                ${statusActionBtn}
                                <button type="button" class="btn-action btn-action-wipe" data-action="delete-data" data-id="${u.id}" data-name="${this.escapeHtml(u.full_name || u.username)}" title="Delete user messages and documents without removing account">${wipeText}</button>
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

            const showingLabel = window.i18n ? window.i18n.t('admin.showing', 'Showing') : 'Showing';
            const ofLabel = window.i18n ? window.i18n.t('common.of', 'of') : 'of';
            const usersLabel = window.i18n ? window.i18n.t('admin.users', 'users') : 'users';
            const pageLabel = window.i18n ? window.i18n.t('common.page', 'Page') : 'Page';

            if (info) info.textContent = `${showingLabel} ${start}–${end} ${ofLabel} ${total} ${usersLabel}`;
            if (pageNum) pageNum.textContent = `${pageLabel} ${page} ${ofLabel} ${totalPages || 1}`;

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
                } else if (action === 'deactivate' || action === 'disable') {
                    this.handleStatusChange(userId, userName, 'deactivated');
                } else if (action === 'activate' || action === 'enable') {
                    this.handleStatusChange(userId, userName, 'active');
                } else if (action === 'delete-data') {
                    this.handleDeleteUserData(userId, userName);
                } else if (action === 'delete-account') {
                    const userFid = btn.getAttribute('data-frank-id') || '';
                    this.handleDeleteUserAccount(userId, userName, userEmail, userFid);
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

                const isSelf = this.currentUser && this.currentUser.id === user.id;
                const isInactive = user.account_status === 'disabled' || user.account_status === 'deactivated' || user.is_active === false;

                const youText = window.i18n ? window.i18n.t('common.you', 'YOU') : 'YOU';
                const roleText = user.role === 'admin' ? (window.i18n ? window.i18n.t('admin.roleAdmin', 'Admin') : 'Admin') : (window.i18n ? window.i18n.t('admin.user', 'User') : 'User');
                const statusText = isInactive ? (window.i18n ? window.i18n.t('admin.deactivated', 'deactivated') : 'deactivated') : (window.i18n ? window.i18n.t('admin.active', 'active') : 'active');
                const emailLabel = window.i18n ? window.i18n.t('admin.thEmail', 'Email Address') : 'Email Address';
                const regLabel = window.i18n ? window.i18n.t('admin.registeredAt', 'Registered At') : 'Registered At';
                const lastSeenLabel = window.i18n ? window.i18n.t('admin.lastSeen', 'Last Seen') : 'Last Seen';
                const neverText = window.i18n ? window.i18n.t('common.never', 'Never') : 'Never';
                const activitySummaryLabel = window.i18n ? window.i18n.t('admin.activitySummary', 'Activity Summary (Metadata Only)') : 'Activity Summary (Metadata Only)';
                const messagesLabel = window.i18n ? window.i18n.t('admin.totalMessages', 'Messages') : 'Messages';
                const filesLabel = window.i18n ? window.i18n.t('admin.filesDocs', 'Files') : 'Files';
                const groupsLabel = window.i18n ? window.i18n.t('admin.groupsChannels', 'Groups') : 'Groups';
                const activateBtnText = window.i18n ? window.i18n.t('admin.activateAccount', 'Activate Account') : 'Activate Account';
                const deactivateBtnText = window.i18n ? window.i18n.t('admin.deactivateAccount', 'Deactivate Account') : 'Deactivate Account';
                const deleteBtnText = window.i18n ? window.i18n.t('admin.deleteAccount', 'Delete Account') : 'Delete Account';
                const closeBtnText = window.i18n ? window.i18n.t('common.close', 'Close') : 'Close';

                body.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid var(--border);">
                        <div class="avatar avatar-lg">
                            <span>${this.getInitials(user.full_name || user.username)}</span>
                        </div>
                        <div>
                            <div style="font-size: 16px; font-weight: 800; color: var(--text);">${this.escapeHtml(user.full_name || user.username)} ${isSelf ? `<span style="font-size:11px; color:var(--primary); font-weight:800;">(${youText})</span>` : ''}</div>
                            <div style="font-size: 13px; color: var(--text-muted);">@${this.escapeHtml(user.username)}</div>
                            <div style="margin-top: 4px; display: flex; gap: 6px;">
                                <span class="${user.role === 'admin' ? 'badge-role-admin' : 'badge-role-user'}">${roleText}</span>
                                <span class="${isInactive ? 'badge-status-disabled' : 'badge-status-active'}">${statusText}</span>
                            </div>
                        </div>
                    </div>

                    <div class="detail-row">
                        <span class="detail-label">User ID</span>
                        <span class="detail-value">#${user.id}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${emailLabel}</span>
                        <span class="detail-value">${this.escapeHtml(user.email || '—')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">FRANK ID</span>
                        <span class="detail-value" style="font-family: monospace; color: var(--accent-cyan); font-weight: 800;">${this.escapeHtml(user.frank_id || '—')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${regLabel}</span>
                        <span class="detail-value">${this.formatDate(user.created_at)}</span>
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">${lastSeenLabel}</span>
                        <span class="detail-value">${user.last_seen ? this.formatDate(user.last_seen) : neverText}</span>
                    </div>

                    <div style="margin-top: 16px; padding: 14px; background: var(--surface-elevated); border-radius: var(--radius-md); border: 1px solid var(--border);">
                        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 8px;">${activitySummaryLabel}</div>
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; text-align: center;">
                            <div>
                                <div style="font-size: 18px; font-weight: 800; color: var(--text);">${user.messages_count ?? user.message_count ?? 0}</div>
                                <div style="font-size: 11px; color: var(--text-muted);">${messagesLabel}</div>
                            </div>
                            <div>
                                <div style="font-size: 18px; font-weight: 800; color: var(--text);">${user.files_count ?? user.file_count ?? 0}</div>
                                <div style="font-size: 11px; color: var(--text-muted);">${filesLabel}</div>
                            </div>
                            <div>
                                <div style="font-size: 18px; font-weight: 800; color: var(--text);">${user.groups_count ?? user.group_count ?? 0}</div>
                                <div style="font-size: 11px; color: var(--text-muted);">${groupsLabel}</div>
                            </div>
                        </div>
                    </div>

                    <!-- Administrator Account Controls -->
                    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
                        <div style="display: flex; gap: 8px; align-items: center;">
                            ${isSelf ? `
                                <span style="font-size: 12px; color: var(--text-muted); font-style: italic;">Cannot modify or delete your own admin account</span>
                            ` : `
                                ${isInactive ? `
                                    <button type="button" class="btn btn-primary btn-sm" id="modalActivateAccountBtn" data-id="${user.id}" data-name="${this.escapeHtml(user.full_name || user.username)}" style="font-weight: 700;">
                                        ${activateBtnText}
                                    </button>
                                ` : `
                                    <button type="button" class="btn btn-warning btn-sm" id="modalDeactivateAccountBtn" data-id="${user.id}" data-name="${this.escapeHtml(user.full_name || user.username)}" style="font-weight: 700; background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);">
                                        ${deactivateBtnText}
                                    </button>
                                `}
                                <button type="button" class="btn btn-danger btn-sm" id="modalDeleteAccountBtn" data-id="${user.id}" data-name="${this.escapeHtml(user.full_name || user.username)}" data-email="${this.escapeHtml(user.email || '')}" data-frank-id="${this.escapeHtml(user.frank_id || '')}" style="display: inline-flex; align-items: center; gap: 6px; font-weight: 700;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                    ${deleteBtnText}
                                </button>
                            `}
                        </div>
                        <button type="button" class="btn btn-secondary btn-sm" id="modalCloseDetailsBtn">${closeBtnText}</button>
                    </div>
                `;

                // Wire modal action buttons
                const modalActivateBtn = document.getElementById('modalActivateAccountBtn');
                if (modalActivateBtn) {
                    modalActivateBtn.addEventListener('click', () => {
                        modal.classList.remove('open', 'active');
                        this.handleStatusChange(user.id, user.full_name || user.username, 'active');
                    });
                }
                const modalDeactivateBtn = document.getElementById('modalDeactivateAccountBtn');
                if (modalDeactivateBtn) {
                    modalDeactivateBtn.addEventListener('click', () => {
                        modal.classList.remove('open', 'active');
                        this.handleStatusChange(user.id, user.full_name || user.username, 'deactivated');
                    });
                }
                const modalDeleteBtn = document.getElementById('modalDeleteAccountBtn');
                if (modalDeleteBtn) {
                    modalDeleteBtn.addEventListener('click', () => {
                        modal.classList.remove('open', 'active');
                        this.handleDeleteUserAccount(
                            user.id,
                            user.full_name || user.username,
                            user.email || '',
                            user.frank_id || ''
                        );
                    });
                }
                const modalCloseBtn = document.getElementById('modalCloseDetailsBtn');
                if (modalCloseBtn) {
                    modalCloseBtn.addEventListener('click', () => {
                        modal.classList.remove('open', 'active');
                    });
                }
            } catch (err) {
                body.innerHTML = `<p style="color:var(--danger); text-align:center;">Error: ${this.escapeHtml(err.message || '')}</p>`;
            }
        }

        updateUserRowStatus(userId, newStatus) {
            const row = document.querySelector(`tr[data-user-id="${userId}"]`);
            if (!row) return;
            const isSelf = this.currentUser && this.currentUser.id === userId;
            const isInactive = newStatus === 'disabled' || newStatus === 'deactivated' || newStatus === false;
            const badgeCell = row.cells[4];
            if (badgeCell) {
                badgeCell.innerHTML = isInactive
                    ? `<span class="badge-status-disabled">● DEACTIVATED</span>`
                    : `<span class="badge-status-active">● ACTIVE</span>`;
            }
            const actionBtn = row.querySelector('.btn-action-activate, .btn-action-deactivate, .btn-action-status-enable, .btn-action-status-disable');
            if (actionBtn) {
                if (isInactive) {
                    actionBtn.className = 'btn-action btn-action-activate btn-action-status-enable';
                    actionBtn.setAttribute('data-action', 'activate');
                    actionBtn.textContent = 'Activate';
                    actionBtn.disabled = false;
                } else {
                    actionBtn.className = 'btn-action btn-action-deactivate btn-action-status-disable';
                    actionBtn.setAttribute('data-action', 'deactivate');
                    actionBtn.textContent = 'Deactivate';
                    if (isSelf) actionBtn.disabled = true;
                }
            }
        }

        handleStatusChange(userId, userName, newStatus) {
            const isSelf = this.currentUser && this.currentUser.id === userId;
            if (isSelf) {
                toast.error('Cannot change the status of your own administrator account.');
                return;
            }
            const isDeactivating = newStatus === 'disabled' || newStatus === 'deactivated';
            this.showConfirmDialog({
                title: isDeactivating ? `Deactivate ${userName}?` : `Activate ${userName}?`,
                message: isDeactivating
                    ? `Are you sure you want to deactivate the account for ${userName}? The user will be immediately logged out and unable to sign in, but their conversations and data will be safely preserved.`
                    : `Are you sure you want to activate the account for ${userName}? The user will be permitted to log in again with their existing credentials.`,
                confirmText: isDeactivating ? 'Deactivate' : 'Activate',
                confirmClass: isDeactivating ? 'btn-danger' : 'btn-primary',
                onConfirm: async () => {
                    try {
                        if (isDeactivating) {
                            if (typeof api.deactivateAdminUser === 'function') {
                                await api.deactivateAdminUser(userId);
                            } else {
                                await api.updateAdminUserStatus(userId, 'deactivated');
                            }
                        } else {
                            if (typeof api.activateAdminUser === 'function') {
                                await api.activateAdminUser(userId);
                            } else {
                                await api.updateAdminUserStatus(userId, 'active');
                            }
                        }
                        toast.success(`Account for ${userName} is now ${isDeactivating ? 'deactivated' : 'active'}.`);

                        // Live DOM update without full page reload
                        const userObj = this.users.find(u => u.id === userId);
                        if (userObj) {
                            userObj.account_status = isDeactivating ? 'deactivated' : 'active';
                            userObj.is_active = !isDeactivating;
                        }
                        this.updateUserRowStatus(userId, isDeactivating ? 'deactivated' : 'active');

                        await Promise.all([this.loadMetrics(), this.loadAuditLogs()]);
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

        handleDeleteUserAccount(userId, userName, userEmail, userFrankId) {
            const isSelf = this.currentUser && this.currentUser.id === userId;
            if (isSelf) {
                toast.error('Cannot delete your own administrator account.');
                return;
            }
            const fidText = userFrankId ? ` (FRANK ID: ${userFrankId})` : '';
            const emailText = userEmail ? ` [${userEmail}]` : '';
            this.showConfirmDialog({
                title: 'Delete Account',
                message: `Are you sure you want to permanently delete the account for ${userName}${emailText}${fidText}?`,
                warning: 'This action cannot be undone. The account and authentication access for this user will be permanently removed.',
                confirmText: 'Delete Account',
                confirmClass: 'btn-danger',
                onConfirm: async () => {
                    try {
                        const res = await api.deleteAdminUserAccount(userId);
                        toast.success(res?.message || `Account for ${userName} permanently deleted.`);
                        
                        // Close details modal if open
                        const detailsModal = document.getElementById('adminUserDetailsModal');
                        if (detailsModal) detailsModal.classList.remove('open', 'active');

                        // Immediately update UI
                        await Promise.all([
                            this.loadUsers(),
                            this.loadMetrics(),
                            this.loadAuditLogs()
                        ]);
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
                this.renderGroupsTable();
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

        renderGroupsTable() {
            const tbody = document.getElementById('groupsTableBody');
            if (!tbody) return;

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

            const privateText = window.i18n ? window.i18n.t('common.private', 'Private') : 'Private';
            const publicText = window.i18n ? window.i18n.t('common.public', 'Public') : 'Public';
            const membersText = window.i18n ? window.i18n.t('admin.members', 'members') : 'members';

            tbody.innerHTML = this.groups.map(g => `
                <tr>
                    <td style="font-weight: 700; color: var(--text);">${this.escapeHtml(g.name)}</td>
                    <td><span style="font-family: monospace; font-size: 11px; color: var(--text-muted);">#${g.id}</span></td>
                    <td>
                        <span class="badge ${g.is_private ? 'badge-secondary' : 'badge-primary'}">
                            ${g.is_private ? privateText : publicText}
                        </span>
                    </td>
                    <td style="color: var(--text-secondary);">${this.escapeHtml(g.creator_name || `User #${g.created_by}`)}</td>
                    <td>
                        <span style="font-weight: 700;">${g.member_count || 0}</span>
                        <span style="color: var(--text-muted); font-size: 12px;"> ${membersText}</span>
                    </td>
                    <td style="color: var(--text-muted); font-size: 12px;">${this.formatDate(g.created_at)}</td>
                </tr>
            `).join('');
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

                this.renderAuditTable();
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

        renderAuditTable() {
            const tbody = document.getElementById('auditTableBody');
            if (!tbody) return;

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
        }

        renderAuditPagination() {
            const info = document.getElementById('auditPaginationInfo');
            const pageNum = document.getElementById('auditPageNum');
            const prevBtn = document.getElementById('auditPrevBtn');
            const nextBtn = document.getElementById('auditNextBtn');

            const { page, limit, total, totalPages } = this.auditPagination;
            const start = total === 0 ? 0 : (page - 1) * limit + 1;
            const end = Math.min(page * limit, total);

            const showingLabel = window.i18n ? window.i18n.t('admin.showing', 'Showing') : 'Showing';
            const ofLabel = window.i18n ? window.i18n.t('common.of', 'of') : 'of';
            const logsLabel = window.i18n ? window.i18n.t('admin.auditLogs', 'logs') : 'logs';
            const pageLabel = window.i18n ? window.i18n.t('common.page', 'Page') : 'Page';

            if (info) info.textContent = `${showingLabel} ${start}–${end} ${ofLabel} ${total} ${logsLabel}`;
            if (pageNum) pageNum.textContent = `${pageLabel} ${page} ${ofLabel} ${totalPages || 1}`;

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
                if (document.hidden) return;
                if (window.wsClient && window.wsClient.isConnected) return;
                try {
                    await this.loadMetrics();
                    if (this.activeSection === 'overview') {
                        await this.loadActivity();
                    }
                } catch {}
            }, 12000);

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

            // Access request event listener
            window.wsClient.on('admin_access_request_created', (data) => {
                this.loadAccessRequestsMetrics();
                if (this.activeSection === 'access-requests') {
                    this.loadAccessRequests();
                }
                const ref = data.request ? data.request.request_reference : '';
                toast.info(`New account access request received: ${ref}`);
            });
        }

        /* -----------------------------------------------------------------
           ACCOUNT ACCESS REQUESTS METHODS
           ----------------------------------------------------------------- */
        bindAccessRequestsEvents() {
            // Search input
            const searchInput = document.getElementById('accessRequestsSearch');
            if (searchInput) {
                searchInput.addEventListener('input', () => {
                    const val = searchInput.value.trim();
                    if (this.accessRequestsDebounce) clearTimeout(this.accessRequestsDebounce);
                    this.accessRequestsDebounce = setTimeout(() => {
                        this.accessRequestsFilters.q = val;
                        this.accessRequestsPagination.page = 1;
                        this.loadAccessRequests();
                    }, 300);
                });
            }

            // Status filter
            const statusFilter = document.getElementById('accessRequestsStatusFilter');
            if (statusFilter) {
                statusFilter.addEventListener('change', () => {
                    this.accessRequestsFilters.status = statusFilter.value;
                    this.accessRequestsPagination.page = 1;
                    this.loadAccessRequests();
                });
            }

            // Source filter
            const sourceFilter = document.getElementById('accessRequestsSourceFilter');
            if (sourceFilter) {
                sourceFilter.addEventListener('change', () => {
                    this.accessRequestsFilters.source = sourceFilter.value;
                    this.accessRequestsPagination.page = 1;
                    this.loadAccessRequests();
                });
            }

            // Refresh button
            const refreshBtn = document.getElementById('accessRequestsRefreshBtn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', () => {
                    this.loadAccessRequests();
                    this.loadAccessRequestsMetrics();
                });
            }

            // Pagination
            const prevBtn = document.getElementById('accessRequestsPrevBtn');
            const nextBtn = document.getElementById('accessRequestsNextBtn');
            if (prevBtn) {
                prevBtn.addEventListener('click', () => {
                    if (this.accessRequestsPagination.page > 1) {
                        this.accessRequestsPagination.page--;
                        this.loadAccessRequests();
                    }
                });
            }
            if (nextBtn) {
                nextBtn.addEventListener('click', () => {
                    if (this.accessRequestsPagination.page < this.accessRequestsPagination.totalPages) {
                        this.accessRequestsPagination.page++;
                        this.loadAccessRequests();
                    }
                });
            }

            // Modal close & save
            const closeBtn = document.getElementById('closeAccessRequestModalBtn');
            const cancelBtn = document.getElementById('cancelAccessRequestModalBtn');
            const saveBtn = document.getElementById('saveAccessRequestModalBtn');

            closeBtn?.addEventListener('click', () => this.closeAccessRequestModal());
            cancelBtn?.addEventListener('click', () => this.closeAccessRequestModal());
            saveBtn?.addEventListener('click', () => this.saveAccessRequest());

            // Delegated table view details click
            const tbody = document.getElementById('accessRequestsTableBody');
            if (tbody) {
                tbody.addEventListener('click', (e) => {
                    const btn = e.target.closest('.btn-view-request');
                    if (btn) {
                        const reqId = parseInt(btn.getAttribute('data-id'), 10);
                        if (reqId) this.openAccessRequestModal(reqId);
                    }
                });
            }
        }

        async loadAccessRequestsMetrics() {
            try {
                const res = await api.getAdminAccessRequests({ limit: 1 });
                if (!res) return;

                const pendingBadge = document.getElementById('navPendingAccessBadge');
                if (pendingBadge) {
                    if (res.pending_count > 0) {
                        pendingBadge.textContent = String(res.pending_count);
                        pendingBadge.style.display = 'inline-block';
                    } else {
                        pendingBadge.style.display = 'none';
                    }
                }

                const statTotal = document.getElementById('metricTotalAccessRequests');
                const statPending = document.getElementById('metricPendingAccessRequests');
                if (statTotal) statTotal.textContent = String(res.total);
                if (statPending) statPending.textContent = String(res.pending_count);
            } catch (err) {
                console.error('Failed to load access request metrics:', err);
            }
        }

        async loadAccessRequests() {
            const tbody = document.getElementById('accessRequestsTableBody');
            if (!tbody) return;

            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 32px; color: var(--text-muted);">
                        <div class="spinner" style="margin: 0 auto 12px;"></div>
                        <div>Loading access requests...</div>
                    </td>
                </tr>
            `;

            try {
                const params = {
                    page: this.accessRequestsPagination.page,
                    limit: this.accessRequestsPagination.limit
                };
                if (this.accessRequestsFilters.q) params.q = this.accessRequestsFilters.q;
                if (this.accessRequestsFilters.status && this.accessRequestsFilters.status !== 'all') params.status = this.accessRequestsFilters.status;
                if (this.accessRequestsFilters.source && this.accessRequestsFilters.source !== 'all') params.source = this.accessRequestsFilters.source;

                const res = await api.getAdminAccessRequests(params);
                if (!res) return;

                this.accessRequests = res.items || [];
                this.accessRequestsPagination.total = res.total || 0;
                this.accessRequestsPagination.totalPages = res.total_pages || 1;
                this.accessRequestsPagination.page = res.page || 1;

                // Update metric counters
                const statTotal = document.getElementById('metricTotalAccessRequests');
                const statPending = document.getElementById('metricPendingAccessRequests');
                const statInReview = document.getElementById('metricInReviewAccessRequests');
                const statResolved = document.getElementById('metricResolvedAccessRequests');

                if (statTotal) statTotal.textContent = String(res.total || 0);
                if (statPending) statPending.textContent = String(res.pending_count || 0);

                // Compute counts from current set or rough indicators
                const inReviewCount = this.accessRequests.filter(r => r.status === 'In Review').length;
                const resolvedCount = this.accessRequests.filter(r => r.status === 'Resolved' || r.status === 'Rejected').length;
                if (statInReview) statInReview.textContent = String(inReviewCount);
                if (statResolved) statResolved.textContent = String(resolvedCount);

                const pendingBadge = document.getElementById('navPendingAccessBadge');
                if (pendingBadge) {
                    if (res.pending_count > 0) {
                        pendingBadge.textContent = String(res.pending_count);
                        pendingBadge.style.display = 'inline-block';
                    } else {
                        pendingBadge.style.display = 'none';
                    }
                }

                this.renderAccessRequestsTable();
                this.renderAccessRequestsPagination();
            } catch (err) {
                console.error('Failed to load access requests:', err);
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align: center; color: var(--danger); padding: 24px;">
                            Failed to load access requests. ${this.escapeHtml(err.message || '')}
                        </td>
                    </tr>
                `;
            }
        }

        renderAccessRequestsTable() {
            const tbody = document.getElementById('accessRequestsTableBody');
            if (!tbody) return;

            if (this.accessRequests.length === 0) {
                const noReqMsg = window.i18n ? window.i18n.t('admin.noRequestsFound', 'No access requests match the current filters.') : 'No access requests match the current filters.';
                tbody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
                            <div style="font-size: 14px; font-weight: 500;">${this.escapeHtml(noReqMsg)}</div>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = this.accessRequests.map(req => {
                const badge = this.getAccessRequestStatusBadge(req.status);
                const sourceBadge = req.source === 'landing_page' 
                    ? `<span style="font-size: 11px; padding: 3px 8px; border-radius: 6px; background: rgba(59, 130, 246, 0.12); color: #3b82f6; font-weight: 600;">Landing Page</span>`
                    : `<span style="font-size: 11px; padding: 3px 8px; border-radius: 6px; background: rgba(239, 68, 68, 0.12); color: #ef4444; font-weight: 600;">Disabled Account</span>`;
                
                const viewDetailsLabel = window.i18n ? window.i18n.t('admin.viewDetails', 'View Details') : 'View Details';

                return `
                    <tr>
                        <td>
                            <span style="font-family: monospace; font-weight: 700; color: var(--accent-cyan); font-size: 12.5px;">${this.escapeHtml(req.request_reference)}</span>
                        </td>
                        <td>
                            <span style="font-weight: 600; color: var(--text); font-size: 13px;">${this.escapeHtml(req.email)}</span>
                        </td>
                        <td>
                            <span style="color: var(--text-muted); font-size: 13px;">${this.escapeHtml(req.account_email || '—')}</span>
                        </td>
                        <td style="max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                            <span title="${this.escapeHtml(req.subject)}">${this.escapeHtml(req.subject)}</span>
                        </td>
                        <td>${sourceBadge}</td>
                        <td style="font-size: 12px; color: var(--text-muted);">${this.formatDate(req.created_at)}</td>
                        <td>${badge}</td>
                        <td>
                            <button type="button" class="btn btn-secondary btn-sm btn-view-request" data-id="${req.id}" style="font-size: 12px; padding: 5px 10px;">
                                ${this.escapeHtml(viewDetailsLabel)}
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        getAccessRequestStatusBadge(status) {
            const s = (status || 'Pending').toLowerCase();
            if (s === 'resolved') {
                return `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700; padding: 3px 8px; border-radius: 6px;">Resolved</span>`;
            }
            if (s === 'rejected') {
                return `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; font-weight: 700; padding: 3px 8px; border-radius: 6px;">Rejected</span>`;
            }
            if (s === 'in review') {
                return `<span class="badge" style="background: rgba(14, 165, 233, 0.15); color: #0ea5e9; font-weight: 700; padding: 3px 8px; border-radius: 6px;">In Review</span>`;
            }
            return `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-weight: 700; padding: 3px 8px; border-radius: 6px;">Pending</span>`;
        }

        renderAccessRequestsPagination() {
            const info = document.getElementById('accessRequestsPaginationInfo');
            const pageNum = document.getElementById('accessRequestsPageNum');
            const prevBtn = document.getElementById('accessRequestsPrevBtn');
            const nextBtn = document.getElementById('accessRequestsNextBtn');

            const { page, limit, total, totalPages } = this.accessRequestsPagination;
            const start = total === 0 ? 0 : (page - 1) * limit + 1;
            const end = Math.min(page * limit, total);

            const showingLabel = window.i18n ? window.i18n.t('admin.showing', 'Showing') : 'Showing';
            const ofLabel = window.i18n ? window.i18n.t('common.of', 'of') : 'of';
            const pageLabel = window.i18n ? window.i18n.t('common.page', 'Page') : 'Page';

            if (info) info.textContent = `${showingLabel} ${start}–${end} ${ofLabel} ${total} requests`;
            if (pageNum) pageNum.textContent = `${pageLabel} ${page} ${ofLabel} ${totalPages || 1}`;

            if (prevBtn) prevBtn.disabled = page <= 1;
            if (nextBtn) nextBtn.disabled = page >= totalPages;
        }

        async openAccessRequestModal(reqId) {
            const modal = document.getElementById('adminAccessRequestModal');
            if (!modal) return;

            let req = this.accessRequests.find(r => r.id === reqId);
            if (!req) {
                try {
                    req = await api.getAdminAccessRequestDetails(reqId);
                } catch (e) {
                    toast.error('Failed to load request details');
                    return;
                }
            }

            document.getElementById('currentAccessRequestId').value = req.id;
            document.getElementById('modalReqReference').textContent = req.request_reference || '--';
            document.getElementById('modalReqEmail').textContent = req.email || '--';
            document.getElementById('modalReqAccountEmail').textContent = req.account_email || '—';
            document.getElementById('modalReqSource').textContent = req.source === 'landing_page' ? 'Landing Page' : 'Disabled Account';
            document.getElementById('modalReqDate').textContent = this.formatDate(req.created_at);
            document.getElementById('modalReqSubject').textContent = req.subject || '--';
            document.getElementById('modalReqDescription').textContent = req.description || '--';
            
            const statusSelect = document.getElementById('modalReqStatusSelect');
            if (statusSelect) statusSelect.value = req.status || 'Pending';

            const notesText = document.getElementById('modalReqAdminNotes');
            if (notesText) notesText.value = req.admin_notes || '';

            const statusBadge = document.getElementById('modalAccessRequestStatusBadge');
            if (statusBadge) {
                statusBadge.innerHTML = this.getAccessRequestStatusBadge(req.status);
            }

            modal.classList.add('open');
            modal.classList.add('active');
            modal.style.display = 'flex';
        }

        closeAccessRequestModal() {
            const modal = document.getElementById('adminAccessRequestModal');
            if (modal) {
                modal.classList.remove('open');
                modal.classList.remove('active');
                modal.style.display = 'none';
            }
        }

        async saveAccessRequest() {
            const idInput = document.getElementById('currentAccessRequestId');
            const statusSelect = document.getElementById('modalReqStatusSelect');
            const notesText = document.getElementById('modalReqAdminNotes');
            const saveBtn = document.getElementById('saveAccessRequestModalBtn');

            const reqId = parseInt(idInput?.value, 10);
            if (!reqId) return;

            const status = statusSelect?.value || 'Pending';
            const adminNotes = notesText?.value || '';

            saveBtn.disabled = true;
            try {
                const updated = await api.updateAdminAccessRequest(reqId, {
                    status: status,
                    admin_notes: adminNotes
                });

                toast.success('Request updated successfully');
                this.closeAccessRequestModal();

                // Update in memory and refresh
                const idx = this.accessRequests.findIndex(r => r.id === reqId);
                if (idx !== -1) {
                    this.accessRequests[idx] = updated;
                }
                this.renderAccessRequestsTable();
                this.loadAccessRequestsMetrics();
            } catch (err) {
                toast.error(err.message || 'Failed to update request');
            } finally {
                saveBtn.disabled = false;
            }
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
