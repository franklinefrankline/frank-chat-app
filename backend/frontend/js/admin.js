/* -------------------------------------------------------------------------
   FRANK ADMIN PORTAL CLIENT CONTROLLER
   Pure backend-driven administration, zero mock data, real-time audit logs.
   ------------------------------------------------------------------------- */

(function () {
    'use strict';

    let currentAdmin = null;
    let usersCurrentPage = 1;
    let auditCurrentPage = 1;
    let searchDebounceTimeout = null;

    // Action targets for modals
    let targetUserForStatus = null;
    let targetUserForDataDelete = null;
    let targetUserForAccountDelete = null;

    // Format helpers
    function formatBytes(bytes) {
        if (!bytes || bytes <= 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function formatDate(dateStr) {
        if (!dateStr) return 'Never';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString(undefined, {
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

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Initialize Admin Portal
    document.addEventListener('DOMContentLoaded', async () => {
        setupSidebar();
        setupTabs();
        setupModals();
        setupFilters();

        const token = api.getToken();
        if (!token) {
            window.location.href = 'admin-login.html';
            return;
        }

        try {
            currentAdmin = await api.getAdminMe();
            if (!currentAdmin || currentAdmin.role !== 'admin') {
                api.setToken(null);
                window.location.href = 'admin-login.html';
                return;
            }

            // Populate admin info in sidebar
            const avatarElem = document.getElementById('adminSidebarAvatar');
            const nameElem = document.getElementById('adminSidebarName');
            if (nameElem) nameElem.textContent = currentAdmin.full_name || currentAdmin.username;
            if (avatarElem) avatarElem.textContent = (currentAdmin.username || 'A')[0].toUpperCase();

            // Load initial data
            await Promise.all([
                loadMetrics(),
                loadUsers(1),
                loadConversations(),
                loadAuditLogs(1)
            ]);
        } catch (err) {
            console.error('Admin authentication failure:', err);
            api.setToken(null);
            window.location.href = 'admin-login.html';
        }

        // Global refresh button
        const refreshBtn = document.getElementById('refreshDataBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                refreshBtn.disabled = true;
                if (typeof showToast === 'function') showToast('Refreshing portal data...', 'info', 1200);
                await Promise.all([
                    loadMetrics(),
                    loadUsers(usersCurrentPage),
                    loadConversations(),
                    loadAuditLogs(auditCurrentPage)
                ]);
                refreshBtn.disabled = false;
            });
        }

        // Logout button
        const logoutBtn = document.getElementById('adminLogoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                api.logout();
            });
        }
    });

    // ── Sidebar & Responsive Navigation ──────────────────────────────────────
    function setupSidebar() {
        const toggleBtn = document.getElementById('sidebarToggle');
        const sidebar = document.getElementById('adminSidebar');
        if (toggleBtn && sidebar) {
            toggleBtn.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });

            document.addEventListener('click', (e) => {
                if (window.innerWidth <= 1024) {
                    if (!sidebar.contains(e.target) && !toggleBtn.contains(e.target)) {
                        sidebar.classList.remove('open');
                    }
                }
            });
        }
    }

    // ── Tab Switcher ────────────────────────────────────────────────────────
    function setupTabs() {
        const navItems = document.querySelectorAll('.admin-nav-item[data-tab]');
        const tabContents = {
            overview: document.getElementById('tab-overview'),
            users: document.getElementById('tab-users'),
            conversations: document.getElementById('tab-conversations'),
            audit: document.getElementById('tab-audit')
        };
        const pageTitle = document.getElementById('pageTitle');

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const targetTab = item.dataset.tab;
                if (!tabContents[targetTab]) return;

                navItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');

                Object.values(tabContents).forEach(content => {
                    if (content) content.style.display = 'none';
                });
                tabContents[targetTab].style.display = 'block';

                if (targetTab === 'overview') pageTitle.textContent = 'System Overview & Metrics';
                else if (targetTab === 'users') pageTitle.textContent = 'User Management & Access Control';
                else if (targetTab === 'conversations') pageTitle.textContent = 'Active Groups & Conversations';
                else if (targetTab === 'audit') pageTitle.textContent = 'Administrative Audit Logs';

                // Close mobile sidebar on navigation
                const sidebar = document.getElementById('adminSidebar');
                if (sidebar) sidebar.classList.remove('open');
            });
        });
    }

    // ── Metrics Loader ──────────────────────────────────────────────────────
    async function loadMetrics() {
        try {
            const stats = await api.getAdminStats();
            document.getElementById('statTotalUsers').textContent = stats.total_users || 0;
            document.getElementById('statActiveUsers').textContent = stats.active_users || 0;
            document.getElementById('statDisabledUsers').textContent = stats.disabled_users || 0;
            document.getElementById('statVerifiedUsers').textContent = stats.verified_users || 0;
            document.getElementById('statUnverifiedUsers').textContent = stats.unverified_users || 0;
            document.getElementById('statAdminUsers').textContent = stats.admin_users || 0;
            document.getElementById('statTotalMessages').textContent = stats.total_messages || 0;
            document.getElementById('statTotalGroups').textContent = stats.total_groups || 0;
            document.getElementById('statTotalFiles').textContent = stats.total_files || 0;
            document.getElementById('statStorageUsed').textContent = formatBytes(stats.storage_used_bytes || 0);
        } catch (err) {
            console.error('Failed to load admin stats:', err);
        }
    }

    // ── Users Filters & Pagination ──────────────────────────────────────────
    function setupFilters() {
        const searchInput = document.getElementById('userSearchInput');
        const roleFilter = document.getElementById('roleFilter');
        const statusFilter = document.getElementById('statusFilter');
        const verifiedFilter = document.getElementById('verifiedFilter');
        const sortFilter = document.getElementById('sortFilter');

        const triggerUserSearch = () => {
            usersCurrentPage = 1;
            loadUsers(1);
        };

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchDebounceTimeout);
                searchDebounceTimeout = setTimeout(triggerUserSearch, 300);
            });
        }

        [roleFilter, statusFilter, verifiedFilter, sortFilter].forEach(elem => {
            if (elem) elem.addEventListener('change', triggerUserSearch);
        });

        // Pagination buttons
        const prevBtn = document.getElementById('prevPageBtn');
        const nextBtn = document.getElementById('nextPageBtn');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (usersCurrentPage > 1) {
                    usersCurrentPage--;
                    loadUsers(usersCurrentPage);
                }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                usersCurrentPage++;
                loadUsers(usersCurrentPage);
            });
        }

        // Audit log action filter & pagination
        const auditActionFilter = document.getElementById('auditActionFilter');
        if (auditActionFilter) {
            auditActionFilter.addEventListener('change', () => {
                auditCurrentPage = 1;
                loadAuditLogs(1);
            });
        }

        const auditPrevBtn = document.getElementById('auditPrevBtn');
        const auditNextBtn = document.getElementById('auditNextBtn');

        if (auditPrevBtn) {
            auditPrevBtn.addEventListener('click', () => {
                if (auditCurrentPage > 1) {
                    auditCurrentPage--;
                    loadAuditLogs(auditCurrentPage);
                }
            });
        }

        if (auditNextBtn) {
            auditNextBtn.addEventListener('click', () => {
                auditCurrentPage++;
                loadAuditLogs(auditCurrentPage);
            });
        }
    }

    // ── Load Users List ─────────────────────────────────────────────────────
    async function loadUsers(page = 1) {
        usersCurrentPage = page;
        const searchVal = document.getElementById('userSearchInput')?.value.trim() || '';
        const roleVal = document.getElementById('roleFilter')?.value || 'all';
        const statusVal = document.getElementById('statusFilter')?.value || '';
        const verifiedVal = document.getElementById('verifiedFilter')?.value || '';
        const sortParts = (document.getElementById('sortFilter')?.value || 'created_at:desc').split(':');

        const params = {
            search: searchVal,
            role: roleVal,
            is_active: statusVal,
            is_verified: verifiedVal,
            sort_by: sortParts[0],
            sort_order: sortParts[1],
            page: page,
            limit: 20
        };

        const tableBody = document.getElementById('userTableBody');
        const mobileContainer = document.getElementById('mobileUserCards');

        try {
            const data = await api.getAdminUsers(params);
            renderDesktopUsers(data.users || []);
            renderMobileUsers(data.users || []);

            // Update pagination UI
            const paginationInfo = document.getElementById('paginationInfo');
            const pageIndicator = document.getElementById('pageIndicator');
            const prevBtn = document.getElementById('prevPageBtn');
            const nextBtn = document.getElementById('nextPageBtn');

            if (paginationInfo) {
                const start = data.total > 0 ? (data.page - 1) * data.limit + 1 : 0;
                const end = Math.min(data.page * data.limit, data.total);
                paginationInfo.textContent = `Showing ${start}–${end} of ${data.total} registered users`;
            }

            if (pageIndicator) {
                pageIndicator.textContent = `Page ${data.page} of ${data.pages || 1}`;
            }

            if (prevBtn) prevBtn.disabled = data.page <= 1;
            if (nextBtn) nextBtn.disabled = data.page >= data.pages;
        } catch (err) {
            console.error('Failed to load users:', err);
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 30px;">Error loading users: ${escapeHtml(err.message)}</td></tr>`;
            }
        }
    }

    // Render desktop table
    function renderDesktopUsers(users) {
        const tableBody = document.getElementById('userTableBody');
        if (!tableBody) return;

        if (users.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">No users found matching your filters.</td></tr>`;
            return;
        }

        tableBody.innerHTML = users.map(user => {
            const isSelf = currentAdmin && currentAdmin.id === user.id;
            const statusBadge = user.is_active
                ? `<span class="badge badge-active">&#10003; Active</span>`
                : `<span class="badge badge-disabled">&#9888; Disabled</span>`;
            const roleBadge = user.role === 'admin'
                ? `<span class="badge badge-admin">Admin</span>`
                : `<span class="badge badge-user">User</span>`;
            const verifiedBadge = user.is_verified
                ? `<span class="badge badge-verified">Verified</span>`
                : `<span class="badge badge-unverified">Unverified</span>`;

            const avatarInitial = (user.username || 'U')[0].toUpperCase();
            const avatarHtml = user.avatar_url
                ? `<img src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.username)}">`
                : avatarInitial;

            return `
                <tr data-user-id="${user.id}">
                    <td>
                        <div class="user-cell">
                            <div class="user-avatar-sm">${avatarHtml}</div>
                            <div class="user-names">
                                <span class="user-fullname">${escapeHtml(user.full_name || user.username)}</span>
                                <span class="user-email">${escapeHtml(user.email)}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="frank-id-chip">${escapeHtml(user.frank_id || '------')}</span>
                    </td>
                    <td>${roleBadge}</td>
                    <td>${statusBadge}</td>
                    <td>${verifiedBadge}</td>
                    <td style="color: var(--text-secondary); font-size: 0.82rem;">${formatDate(user.created_at)}</td>
                    <td style="text-align: right;">
                        <div class="action-buttons" style="justify-content: flex-end;">
                            <button class="btn-icon view-user-btn" data-id="${user.id}" title="View Details" aria-label="View user details">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                            ${!isSelf ? `
                                <button class="btn-icon toggle-status-btn" data-id="${user.id}" data-active="${user.is_active}" data-username="${escapeHtml(user.username)}" title="${user.is_active ? 'Disable Account' : 'Enable Account'}" aria-label="Toggle user active status">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <rect x="1" y="5" width="22" height="14" rx="7" ry="7"></rect>
                                        <circle cx="${user.is_active ? '16' : '8'}" cy="12" r="3"></circle>
                                    </svg>
                                </button>
                                <button class="btn-icon delete-data-btn" data-id="${user.id}" data-username="${escapeHtml(user.username)}" title="Clear User Data (Keeps Account)" aria-label="Clear user content">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <polyline points="3 6 5 6 21 6"></polyline>
                                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                    </svg>
                                </button>
                                <button class="btn-icon btn-icon-danger delete-account-btn" data-id="${user.id}" data-username="${escapeHtml(user.username)}" title="Permanently Delete Account" aria-label="Permanently delete user account">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            ` : `<span style="font-size: 0.75rem; color: #06b6d4; font-weight: 600; padding: 0 6px;">You</span>`}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        attachUserActionEvents();
    }

    // Render mobile cards (<= 768px)
    function renderMobileUsers(users) {
        const container = document.getElementById('mobileUserCards');
        if (!container) return;

        if (users.length === 0) {
            container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">No users found.</div>`;
            return;
        }

        container.innerHTML = users.map(user => {
            const isSelf = currentAdmin && currentAdmin.id === user.id;
            const statusBadge = user.is_active
                ? `<span class="badge badge-active">&#10003; Active</span>`
                : `<span class="badge badge-disabled">&#9888; Disabled</span>`;
            const roleBadge = user.role === 'admin'
                ? `<span class="badge badge-admin">Admin</span>`
                : `<span class="badge badge-user">User</span>`;
            const verifiedBadge = user.is_verified
                ? `<span class="badge badge-verified">Verified</span>`
                : `<span class="badge badge-unverified">Unverified</span>`;

            return `
                <div class="user-card" data-user-id="${user.id}">
                    <div class="user-card-header">
                        <div>
                            <div style="font-weight: 700; color: #fff;">${escapeHtml(user.full_name || user.username)}</div>
                            <div style="font-size: 0.78rem; color: var(--text-secondary);">${escapeHtml(user.email)}</div>
                        </div>
                        <span class="frank-id-chip">${escapeHtml(user.frank_id || '------')}</span>
                    </div>

                    <div class="user-card-badges">
                        ${roleBadge}
                        ${statusBadge}
                        ${verifiedBadge}
                    </div>

                    <div class="user-card-details">
                        <div><strong>Joined:</strong> ${formatDate(user.created_at)}</div>
                        <div><strong>Last Active:</strong> ${formatDate(user.last_seen)}</div>
                    </div>

                    <div class="user-card-actions">
                        <button class="btn-admin-action btn-admin-outline view-user-btn" data-id="${user.id}">Details</button>
                        ${!isSelf ? `
                            <button class="btn-admin-action btn-admin-outline toggle-status-btn" data-id="${user.id}" data-active="${user.is_active}" data-username="${escapeHtml(user.username)}">
                                ${user.is_active ? 'Disable' : 'Enable'}
                            </button>
                            <button class="btn-admin-action btn-admin-outline delete-data-btn" data-id="${user.id}" data-username="${escapeHtml(user.username)}">
                                Wipe
                            </button>
                            <button class="btn-admin-action btn-admin-danger delete-account-btn" data-id="${user.id}" data-username="${escapeHtml(user.username)}">
                                Delete
                            </button>
                        ` : `<div style="color: #06b6d4; font-size: 0.8rem; font-weight: 600; text-align: center; width: 100%; padding: 8px;">Your Account</div>`}
                    </div>
                </div>
            `;
        }).join('');

        attachUserActionEvents();
    }

    // Attach listeners for action buttons
    function attachUserActionEvents() {
        // 1. View User Details
        document.querySelectorAll('.view-user-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const userId = btn.dataset.id;
                await openUserDetailModal(userId);
            });
        });

        // 2. Toggle Status Modal
        document.querySelectorAll('.toggle-status-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.id;
                const isActive = btn.dataset.active === 'true';
                const username = btn.dataset.username;
                openStatusModal(userId, isActive, username);
            });
        });

        // 3. Delete Data Modal
        document.querySelectorAll('.delete-data-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.id;
                const username = btn.dataset.username;
                openDeleteDataModal(userId, username);
            });
        });

        // 4. Delete Account Modal
        document.querySelectorAll('.delete-account-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.id;
                const username = btn.dataset.username;
                openDeleteAccountModal(userId, username);
            });
        });
    }

    // ── Modal Handlers & Logic ──────────────────────────────────────────────
    function setupModals() {
        // Modal close buttons
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.dataset.close;
                const modal = document.getElementById(modalId);
                if (modal) modal.classList.remove('open');
            });
        });

        // Close on backdrop click
        document.querySelectorAll('.admin-modal-backdrop').forEach(backdrop => {
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) backdrop.classList.remove('open');
            });
        });

        // Confirm Status Change
        const confirmStatusBtn = document.getElementById('confirmStatusBtn');
        if (confirmStatusBtn) {
            confirmStatusBtn.addEventListener('click', async () => {
                if (!targetUserForStatus) return;
                const reason = document.getElementById('statusReasonInput').value.trim();
                const newStatus = !targetUserForStatus.currentActive;

                confirmStatusBtn.disabled = true;
                try {
                    await api.updateAdminUserStatus(targetUserForStatus.id, newStatus, reason);
                    if (typeof showToast === 'function') {
                        showToast(`Account successfully ${newStatus ? 'enabled' : 'disabled'}.`, 'success');
                    }
                    document.getElementById('statusToggleModal').classList.remove('open');
                    await Promise.all([loadMetrics(), loadUsers(usersCurrentPage), loadAuditLogs(1)]);
                } catch (err) {
                    alert('Failed to update status: ' + err.message);
                } finally {
                    confirmStatusBtn.disabled = false;
                }
            });
        }

        // Confirm Delete User Data
        const confirmDeleteDataBtn = document.getElementById('confirmDeleteDataBtn');
        if (confirmDeleteDataBtn) {
            confirmDeleteDataBtn.addEventListener('click', async () => {
                if (!targetUserForDataDelete) return;
                confirmDeleteDataBtn.disabled = true;
                try {
                    const res = await api.deleteAdminUserData(targetUserForDataDelete.id);
                    if (typeof showToast === 'function') {
                        showToast(res.message || 'User data successfully wiped.', 'success');
                    }
                    document.getElementById('deleteDataModal').classList.remove('open');
                    await Promise.all([loadMetrics(), loadUsers(usersCurrentPage), loadAuditLogs(1)]);
                } catch (err) {
                    alert('Failed to clear user data: ' + err.message);
                } finally {
                    confirmDeleteDataBtn.disabled = false;
                }
            });
        }

        // Confirm Delete Account
        const confirmDeleteAccountBtn = document.getElementById('confirmDeleteAccountBtn');
        const confirmUsernameInput = document.getElementById('confirmUsernameInput');

        if (confirmUsernameInput && confirmDeleteAccountBtn) {
            confirmUsernameInput.addEventListener('input', () => {
                const typed = confirmUsernameInput.value.trim();
                const expected = targetUserForAccountDelete ? targetUserForAccountDelete.username : '';
                confirmDeleteAccountBtn.disabled = (typed !== expected);
            });

            confirmDeleteAccountBtn.addEventListener('click', async () => {
                if (!targetUserForAccountDelete) return;
                confirmDeleteAccountBtn.disabled = true;
                try {
                    const res = await api.deleteAdminUserAccount(targetUserForAccountDelete.id);
                    if (typeof showToast === 'function') {
                        showToast(res.message || 'User account permanently deleted.', 'success');
                    }
                    document.getElementById('deleteAccountModal').classList.remove('open');
                    await Promise.all([loadMetrics(), loadUsers(usersCurrentPage), loadAuditLogs(1)]);
                } catch (err) {
                    alert('Failed to delete account: ' + err.message);
                } finally {
                    confirmDeleteAccountBtn.disabled = false;
                }
            });
        }
    }

    // Open User Details Modal
    async function openUserDetailModal(userId) {
        const modal = document.getElementById('userDetailModal');
        const content = document.getElementById('userDetailContent');
        if (!modal || !content) return;

        content.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Loading user profile...</div>`;
        modal.classList.add('open');

        try {
            const user = await api.getAdminUserDetail(userId);
            content.innerHTML = `
                <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 16px;">
                    <div class="user-avatar-sm" style="width: 52px; height: 52px; font-size: 1.2rem;">
                        ${user.avatar_url ? `<img src="${escapeHtml(user.avatar_url)}" alt="">` : (user.username || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                        <h4 style="font-size: 1.1rem; color: #fff; margin: 0;">${escapeHtml(user.full_name || user.username)}</h4>
                        <div style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(user.email)}</div>
                    </div>
                </div>

                <div class="user-card-details" style="grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.85rem;">
                    <div><strong>Username:</strong> @${escapeHtml(user.username)}</div>
                    <div><strong>FRANK ID:</strong> <span class="frank-id-chip">${escapeHtml(user.frank_id)}</span></div>
                    <div><strong>Account Role:</strong> <span style="text-transform: capitalize;">${escapeHtml(user.role)}</span></div>
                    <div><strong>Active Status:</strong> ${user.is_active ? '<span style="color: #22c55e;">Permitted</span>' : '<span style="color: #ef4444;">Disabled</span>'}</div>
                    <div><strong>Email Verified:</strong> ${user.is_verified ? '<span style="color: #06b6d4;">Yes</span>' : '<span style="color: #f59e0b;">No</span>'}</div>
                    <div><strong>Date Registered:</strong> ${formatDate(user.created_at)}</div>
                    <div><strong>Last Seen:</strong> ${formatDate(user.last_seen)}</div>
                    <div><strong>Online Now:</strong> ${user.is_online ? '<span style="color: #22c55e;">Online</span>' : 'Offline'}</div>
                </div>

                <div style="background: rgba(255,255,255,0.03); padding: 14px; border-radius: 8px; margin-top: 12px;">
                    <div style="font-weight: 600; color: #cbd5e1; margin-bottom: 8px; font-size: 0.85rem;">Activity Footprint:</div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 0.8rem; color: var(--text-secondary);">
                        <div>&bull; Messages Sent: <strong>${user.messages_sent_count || 0}</strong></div>
                        <div>&bull; Documents Uploaded: <strong>${user.files_uploaded_count || 0}</strong></div>
                        <div>&bull; Groups Owned: <strong>${user.groups_owned_count || 0}</strong></div>
                        <div>&bull; Groups Joined: <strong>${user.groups_joined_count || 0}</strong></div>
                    </div>
                </div>

                ${user.bio ? `
                    <div style="margin-top: 12px;">
                        <label style="font-size: 0.8rem; color: var(--text-muted); font-weight: 600;">Bio</label>
                        <p style="font-size: 0.85rem; color: #cbd5e1; margin-top: 4px;">${escapeHtml(user.bio)}</p>
                    </div>
                ` : ''}
            `;
        } catch (err) {
            content.innerHTML = `<div style="color: #ef4444; padding: 20px;">Failed to fetch user details: ${escapeHtml(err.message)}</div>`;
        }
    }

    // Open Status Toggle Modal
    function openStatusModal(userId, currentActive, username) {
        targetUserForStatus = { id: userId, currentActive, username };
        const modal = document.getElementById('statusToggleModal');
        const title = document.getElementById('statusModalTitle');
        const alertBox = document.getElementById('statusModalAlert');
        const reasonInput = document.getElementById('statusReasonInput');

        if (reasonInput) reasonInput.value = '';

        if (currentActive) {
            title.textContent = `Disable Account: @${username}`;
            alertBox.className = 'alert-box alert-warning';
            alertBox.innerHTML = `Disabling <strong>@${escapeHtml(username)}</strong> will immediately terminate all active WebSocket connections and reject any login attempts until re-enabled.`;
        } else {
            title.textContent = `Enable Account: @${username}`;
            alertBox.className = 'alert-box alert-info';
            alertBox.innerHTML = `Re-enabling <strong>@${escapeHtml(username)}</strong> will restore normal access to login, messaging, and group chat.`;
        }

        modal.classList.add('open');
    }

    // Open Delete Data Modal
    function openDeleteDataModal(userId, username) {
        targetUserForDataDelete = { id: userId, username };
        const modal = document.getElementById('deleteDataModal');
        const userSpan = document.getElementById('deleteDataUsername');
        if (userSpan) userSpan.textContent = `@${username}`;
        modal.classList.add('open');
    }

    // Open Delete Account Modal
    function openDeleteAccountModal(userId, username) {
        targetUserForAccountDelete = { id: userId, username };
        const modal = document.getElementById('deleteAccountModal');
        const userSpan = document.getElementById('deleteAccountUsername');
        const requiredPrompt = document.getElementById('requiredUsernameConfirmation');
        const input = document.getElementById('confirmUsernameInput');
        const confirmBtn = document.getElementById('confirmDeleteAccountBtn');

        if (userSpan) userSpan.textContent = `@${username}`;
        if (requiredPrompt) requiredPrompt.textContent = username;
        if (input) input.value = '';
        if (confirmBtn) confirmBtn.disabled = true;

        modal.classList.add('open');
    }

    // ── Conversations Loader ────────────────────────────────────────────────
    async function loadConversations() {
        const tableBody = document.getElementById('conversationsTableBody');
        if (!tableBody) return;

        try {
            const groups = await api.getAdminConversations();
            if (!groups || groups.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 40px;">No groups currently created in the system.</td></tr>`;
                return;
            }

            tableBody.innerHTML = groups.map(g => `
                <tr>
                    <td style="font-weight: 600; color: #fff;">${escapeHtml(g.name)}</td>
                    <td>@${escapeHtml(g.creator_username || 'System')}</td>
                    <td><span class="badge badge-user">${g.member_count} members</span></td>
                    <td>${g.message_count} messages</td>
                    <td style="color: var(--text-secondary); font-size: 0.82rem;">${formatDate(g.created_at)}</td>
                </tr>
            `).join('');
        } catch (err) {
            tableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #ef4444; padding: 30px;">Error loading groups: ${escapeHtml(err.message)}</td></tr>`;
        }
    }

    // ── Audit Logs Loader ───────────────────────────────────────────────────
    async function loadAuditLogs(page = 1) {
        auditCurrentPage = page;
        const action = document.getElementById('auditActionFilter')?.value || '';
        const tableBody = document.getElementById('auditTableBody');
        if (!tableBody) return;

        try {
            const data = await api.getAdminAuditLogs({ action, page, limit: 20 });
            if (!data.logs || data.logs.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 40px;">No administrative audit logs found.</td></tr>`;
                return;
            }

            tableBody.innerHTML = data.logs.map(log => {
                const actionBadgeClass = log.action.includes('delete') ? 'badge-disabled' : 'badge-admin';
                return `
                    <tr>
                        <td style="color: var(--text-secondary); font-size: 0.82rem; white-space: nowrap;">${formatDate(log.created_at)}</td>
                        <td style="font-weight: 600; color: #fff;">${escapeHtml(log.admin_username || 'System')}</td>
                        <td><span class="badge ${actionBadgeClass}">${escapeHtml(log.action)}</span></td>
                        <td>${log.target_identifier ? `@${escapeHtml(log.target_identifier)}` : (log.target_user_id ? `ID #${log.target_user_id}` : '—')}</td>
                        <td style="font-size: 0.82rem; color: #cbd5e1;">${escapeHtml(log.details || '—')}</td>
                        <td style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(log.ip_address || '—')}</td>
                        <td><span class="badge badge-active">${escapeHtml(log.status)}</span></td>
                    </tr>
                `;
            }).join('');

            // Pagination UI for audit logs
            const auditInfo = document.getElementById('auditPaginationInfo');
            const prevBtn = document.getElementById('auditPrevBtn');
            const nextBtn = document.getElementById('auditNextBtn');

            if (auditInfo) {
                auditInfo.textContent = `Showing page ${data.page} of ${data.pages || 1} (${data.total} total logs)`;
            }
            if (prevBtn) prevBtn.disabled = data.page <= 1;
            if (nextBtn) nextBtn.disabled = data.page >= data.pages;
        } catch (err) {
            tableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444; padding: 30px;">Error loading audit logs: ${escapeHtml(err.message)}</td></tr>`;
        }
    }

})();
