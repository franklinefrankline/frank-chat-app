/* -------------------------------------------------------------------------
   MAIN DASHBOARD APPLICATION BOOTSTRAP
   Loads user data, conversation list, WebSocket connection, filters, and mobile drawer
   ------------------------------------------------------------------------- */

class AppController {
    constructor() {
        this.currentUser = null;
        this.conversations = [];
        this.contactsList = [];
        this.currentView = 'conversations'; // 'conversations' | 'contacts'
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.pinnedIds = new Set();
        this.mutedIds = new Set();
        this.archivedIds = new Set();

        this.init();
    }

    async init() {
        if (!document.getElementById('chatApp')) return;

        this.setupMobileTabs();
        this.setupMobileDrawer();
        this.setupFiltersAndSearch();
        this.setupNavigation();

        document.getElementById('sidebarLogoutBtn')?.addEventListener('click', () => {
            auth.logout();
        });
        document.getElementById('sidebarDirectSignOutBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            auth.logout();
        });

        const dismissLoader = () => {
            const loader = document.getElementById('appLoadingScreen');
            if (loader && !loader.classList.contains('fade-out')) {
                loader.classList.add('fade-out');
                setTimeout(() => { if (loader && loader.parentNode) loader.remove(); }, 350);
            }
        };
        // Safety timeout: loader never blocks UI beyond 800ms
        setTimeout(dismissLoader, 800);

        try {
            this.currentUser = await api.getCurrentUser();
            auth.setUser(this.currentUser);
            this.updateSidebarUser(this.currentUser);

            // Connect real-time WebSocket
            if (window.wsClient) {
                window.wsClient.connect();
            }

            // Initial load of conversations
            await this.loadConversations(true);

            // First-Time User Onboarding check
            this.checkFirstTimeOnboarding();

        } catch (err) {
            console.error('Bootstrap error:', err);
            if (!auth.isAuthenticated()) {
                window.location.href = 'login.html';
            }
        } finally {
            dismissLoader();
        }
    }

    checkFirstTimeOnboarding() {
        const hasOnboarded = localStorage.getItem('frank_onboarded') || localStorage.getItem('qenvo_onboarded');
        if (!hasOnboarded) {
            const welcomeModal = document.getElementById('welcomeOnboardingModal');
            if (welcomeModal) {
                welcomeModal.classList.add('active');

                document.getElementById('onboardingFindPeopleBtn')?.addEventListener('click', () => {
                    welcomeModal.classList.remove('active');
                    localStorage.setItem('frank_onboarded', 'true');
                    const newChatModal = document.getElementById('newChatModal');
                    if (newChatModal) newChatModal.classList.add('active');
                    document.getElementById('userSearchQuery')?.focus();
                });

                document.getElementById('onboardingSkipBtn')?.addEventListener('click', () => {
                    welcomeModal.classList.remove('active');
                    localStorage.setItem('frank_onboarded', 'true');
                });
            }
        }
    }

    updateSidebarUser(user) {
        const nameEl = document.getElementById('sidebarUserName');
        const initialsEl = document.getElementById('sidebarUserInitials');
        const frankIdEl = document.getElementById('sidebarUserFrankId');
        const menuFrankIdEl = document.getElementById('menuUserFrankId');
        const copySidebarBtn = document.getElementById('copySidebarFrankIdBtn');
        const copyMenuBtn = document.getElementById('copyMenuFrankIdBtn');

        if (nameEl) nameEl.textContent = user.full_name || user.username;
        if (initialsEl) {
            const name = user.full_name || user.username || '??';
            initialsEl.textContent = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        }
        if (user.frank_id) {
            if (frankIdEl) {
                frankIdEl.textContent = user.frank_id;
                frankIdEl.title = `Your permanent FRANK ID: ${user.frank_id}`;
            }
            if (menuFrankIdEl) {
                menuFrankIdEl.textContent = user.frank_id;
            }
            if (copySidebarBtn) {
                copySidebarBtn.dataset.frankId = user.frank_id;
            }
            if (copyMenuBtn) {
                copyMenuBtn.dataset.frankId = user.frank_id;
            }
        }
        if (typeof updateSidebarPresence === 'function') {
            const isWsConnected = window.wsClient && window.wsClient.isConnected;
            updateSidebarPresence(isWsConnected || navigator.onLine);
        }
    }

    async loadConversations(autoSelectFirst = false) {
        const listContainer = document.getElementById('conversationList');
        if (!listContainer) return;

        try {
            const conversations = await api.getConversations();
            this.conversations = conversations || [];

            // Guarantee Notes to Self (Message Yourself) is present in the list
            const currentUser = auth.getUser();
            if (currentUser) {
                const selfId = Number(currentUser.id);
                const hasSelf = this.conversations.some(c => c.type !== 'group' && Number(c.id) === selfId);
                if (!hasSelf) {
                    const selfConv = {
                        id: selfId,
                        type: 'direct',
                        name: `${currentUser.full_name || currentUser.username} (You)`,
                        username: currentUser.username,
                        frank_id: currentUser.frank_id,
                        avatar_url: currentUser.avatar_url,
                        bio: 'Message yourself • Notes & bookmarks',
                        is_online: true,
                        last_message: null,
                        unread_count: 0
                    };
                    this.conversations.unshift(selfConv);
                }
            }

            this.renderConversationList();

            // Auto-select first conversation if on desktop and none selected
            if (autoSelectFirst && window.innerWidth > 768 && this.conversations.length > 0 && window.chatController && !window.chatController.activeId) {
                const first = this.conversations[0];
                if (first.type === 'group') {
                    window.chatController.openGroupChat(first);
                } else {
                    window.chatController.openDirectChat(first);
                }
            }

            this.updateTotalUnread();
        } catch (err) {
            console.error('Failed to load conversations:', err);
            listContainer.innerHTML = `
                <div class="empty-state">
                    <div style="color:var(--danger); font-size:13px; font-weight:600;">Failed to sync messages</div>
                    <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="window.appController.loadConversations(true)">Retry</button>
                </div>
            `;
        }
    }

    renderConversationList() {
        const listContainer = document.getElementById('conversationList');
        if (!listContainer) return;

        // Apply filters & search query
        let filtered = this.conversations.filter(c => {
            if (this.currentFilter === 'unread' && (!c.unread_count || c.unread_count === 0)) return false;
            if (this.currentFilter === 'groups' && c.type !== 'group') return false;
            if (this.currentFilter === 'archived' && !this.archivedIds.has(c.id)) return false;
            if (this.currentFilter !== 'archived' && this.archivedIds.has(c.id)) return false;

            if (this.searchQuery) {
                const q = this.searchQuery.toLowerCase();
                const name = (c.name || '').toLowerCase();
                const username = (c.username || '').toLowerCase();
                const lastMsg = (c.last_message ? c.last_message.content : '').toLowerCase();
                return name.includes(q) || username.includes(q) || lastMsg.includes(q);
            }
            return true;
        });

        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon" style="width:48px; height:48px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                    <div style="font-size:14px; font-weight:700; color:var(--text); margin-bottom:4px;">No conversations found</div>
                    <p class="empty-state-desc" style="font-size:12px;">Start a new chat using the button above.</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';
        filtered.forEach(conv => {
            const isGroup = conv.type === 'group';
            const initials = (conv.name || conv.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const isOnline = !!conv.is_online;
            const timeStr = conv.last_message ? messagesModule.formatRelativeTime(conv.last_message.created_at) : '';
            const currentUser = auth.getUser();
            const isSelf = !isGroup && currentUser && Number(conv.id) === Number(currentUser.id);
            
            let previewText = 'No messages yet';
            if (isSelf && !conv.last_message) {
                previewText = 'Message yourself • Notes & bookmarks';
            } else if (conv.last_message) {
                if (conv.last_message.message_type === 'document') {
                    previewText = '📎 Document shared';
                } else if (conv.last_message.sender_name && isGroup) {
                    previewText = `${conv.last_message.sender_name}: ${conv.last_message.content}`;
                } else {
                    previewText = conv.last_message.content;
                }
            }
            previewText = messagesModule.escapeHTML(previewText);
            const isActive = window.chatController && window.chatController.activeId === conv.id && window.chatController.activeType === conv.type;

            const card = document.createElement('div');
            card.className = `conversation-card ${isActive ? 'active' : ''} ${isGroup ? 'is-group' : ''} ${isSelf ? 'is-self-chat' : ''}`;
            card.dataset.id = conv.id;
            card.dataset.type = conv.type || 'direct';

            card.innerHTML = `
                <div class="avatar avatar-md ${isGroup ? 'group-avatar' : ''}">
                    <span>${isSelf ? '📝' : initials}</span>
                    ${isGroup ? '<span class="group-indicator-dot">👥</span>' : `<span class="avatar-status ${isOnline ? 'online' : 'offline'}"></span>`}
                </div>
                <div class="conversation-details">
                    <div class="conversation-row">
                        <span class="conversation-name">
                            ${isGroup ? '<span class="group-prefix-badge">Group</span> ' : ''}${messagesModule.escapeHTML(conv.name)}
                            ${isSelf ? '<span class="self-prefix-badge" style="background: rgba(37, 99, 235, 0.15); color: var(--primary); font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 4px; margin-left: 6px;">Notes</span>' : ''}
                        </span>
                        <span class="conversation-time">${timeStr}</span>
                    </div>
                    <div class="conversation-row">
                        <p class="conversation-snippet">${previewText}</p>
                        ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
                    </div>
                </div>
            `;

            card.addEventListener('click', () => {
                if (window.chatController) {
                    if (isGroup) {
                        window.chatController.openGroupChat(conv);
                    } else {
                        window.chatController.openDirectChat(conv);
                    }
                    // Mark as active
                    document.querySelectorAll('.conversation-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    // Reset unread badge locally
                    conv.unread_count = 0;
                    const badge = card.querySelector('.unread-badge');
                    if (badge) badge.remove();
                    this.updateTotalUnread();
                }
            });

            listContainer.appendChild(card);
        });
    }

    updateTotalUnread() {
        let total = 0;
        this.conversations.forEach(c => {
            if (c.unread_count) total += c.unread_count;
        });

        const badge = document.getElementById('totalUnreadBadge');
        if (badge) {
            if (total > 0) {
                badge.textContent = total;
                badge.style.display = 'inline-flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    // ---------------- MOBILE TABS & BOTTOM NAVIGATION ----------------
    setupMobileTabs() {
        // Category Tabs (Screen 1)
        document.getElementById('tabBtnChats')?.addEventListener('click', () => this.switchMobileTab('chats'));
        document.getElementById('tabBtnGroups')?.addEventListener('click', () => this.switchMobileTab('groups'));
        document.getElementById('tabBtnContacts')?.addEventListener('click', () => this.switchMobileTab('contacts'));

        // Bottom Navigation Bar (Screen 1)
        document.getElementById('bottomNavChats')?.addEventListener('click', () => this.switchMobileTab('chats'));
        document.getElementById('bottomNavGroups')?.addEventListener('click', () => this.switchMobileTab('groups'));
        document.getElementById('bottomNavContacts')?.addEventListener('click', () => this.switchMobileTab('contacts'));
        document.getElementById('bottomNavFavorites')?.addEventListener('click', () => this.switchMobileTab('favorites'));
        document.getElementById('bottomNavSettings')?.addEventListener('click', () => this.switchMobileTab('settings'));
    }

    switchMobileTab(tab) {
        // 1. Update Category Tabs active state
        const tabBtns = {
            chats: document.getElementById('tabBtnChats'),
            groups: document.getElementById('tabBtnGroups'),
            contacts: document.getElementById('tabBtnContacts')
        };
        Object.entries(tabBtns).forEach(([key, el]) => {
            if (el) el.classList.toggle('active', key === tab);
        });

        // 2. Update Bottom Nav active state
        const bottomNavBtns = {
            chats: document.getElementById('bottomNavChats'),
            groups: document.getElementById('bottomNavGroups'),
            contacts: document.getElementById('bottomNavContacts'),
            favorites: document.getElementById('bottomNavFavorites'),
            settings: document.getElementById('bottomNavSettings')
        };
        Object.entries(bottomNavBtns).forEach(([key, el]) => {
            if (el) el.classList.toggle('active', key === tab);
        });

        // 3. Synchronize Sidebar Nav active state
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
            if (btn.dataset.section) {
                btn.classList.toggle('active', btn.dataset.section === tab);
            }
        });

        const searchInput = document.getElementById('conversationSearchInput');

        if (tab === 'settings') {
            window.location.href = 'settings.html';
            return;
        }

        if (tab === 'contacts') {
            this.currentView = 'contacts';
            if (searchInput) {
                searchInput.placeholder = 'Search contacts...';
                searchInput.setAttribute('aria-label', 'Search contacts');
            }
            this.loadContactsView();
            return;
        }

        // For chats, groups, favorites
        this.currentView = 'conversations';
        if (tab === 'chats') {
            this.currentFilter = 'all';
            if (searchInput) {
                searchInput.placeholder = 'Search conversations...';
                searchInput.setAttribute('aria-label', 'Search conversations');
            }
        } else if (tab === 'groups') {
            this.currentFilter = 'groups';
            if (searchInput) {
                searchInput.placeholder = 'Search groups...';
                searchInput.setAttribute('aria-label', 'Search groups');
            }
        } else if (tab === 'favorites') {
            this.currentFilter = 'favorites';
            if (searchInput) {
                searchInput.placeholder = 'Search favorites...';
                searchInput.setAttribute('aria-label', 'Search favorites');
            }
        }

        this.renderConversationList();
    }

    async loadContactsView() {
        const listContainer = document.getElementById('conversationList');
        if (!listContainer) return;

        listContainer.innerHTML = '<div class="empty-state"><div class="spinner"></div><div style="margin-top:8px; font-size:12px; color:var(--text-muted);">Loading contacts...</div></div>';

        try {
            const users = await api.getUsers();
            const currentUser = auth.getUser();
            const currentId = currentUser ? Number(currentUser.id) : null;
            this.contactsList = (users || []).filter(u => Number(u.id) !== currentId);
            this.renderContactsList();
        } catch (err) {
            console.error('Failed to load contacts:', err);
            listContainer.innerHTML = `
                <div class="empty-state">
                    <div style="color:var(--danger); font-size:13px; font-weight:600;">Failed to load contacts</div>
                    <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="window.appController.loadContactsView()">Retry</button>
                </div>
            `;
        }
    }

    renderContactsList() {
        const listContainer = document.getElementById('conversationList');
        if (!listContainer) return;

        let filtered = this.contactsList;
        if (this.searchQuery) {
            const q = this.searchQuery.toLowerCase();
            filtered = filtered.filter(u => {
                const name = (u.full_name || '').toLowerCase();
                const username = (u.username || '').toLowerCase();
                const bio = (u.bio || '').toLowerCase();
                const frankId = (u.frank_id || '').toLowerCase();
                return name.includes(q) || username.includes(q) || bio.includes(q) || frankId.includes(q);
            });
        }

        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon" style="width:48px; height:48px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                    <div style="font-size:14px; font-weight:700; color:var(--text); margin-bottom:4px;">No contacts found</div>
                    <p class="empty-state-desc" style="font-size:12px;">No matching registered users found.</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';
        filtered.forEach(user => {
            const initials = (user.full_name || user.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const isOnline = !!user.is_online;
            const card = document.createElement('div');
            card.className = 'conversation-card';
            card.dataset.id = user.id;
            card.dataset.type = 'direct';

            card.innerHTML = `
                <div class="avatar avatar-md">
                    <span>${initials}</span>
                    <span class="avatar-status ${isOnline ? 'online' : 'offline'}"></span>
                </div>
                <div class="conversation-details">
                    <div class="conversation-row">
                        <span class="conversation-name">${messagesModule.escapeHTML(user.full_name || user.username)}</span>
                        ${user.frank_id ? `<span class="frank-id-badge" style="font-size:10px; padding:1px 5px;">${messagesModule.escapeHTML(user.frank_id)}</span>` : ''}
                    </div>
                    <div class="conversation-row">
                        <p class="conversation-snippet">@${messagesModule.escapeHTML(user.username)}${user.bio ? ` • ${messagesModule.escapeHTML(user.bio.replace(/ChatApp|QENVO/gi, 'FRANK'))}` : ''}</p>
                    </div>
                </div>
            `;

            card.addEventListener('click', () => {
                if (window.chatController) {
                    window.chatController.openDirectChat(user);
                }
            });

            listContainer.appendChild(card);
        });
    }

    setupFiltersAndSearch() {
        // Desktop Filter Chips
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.currentFilter = chip.dataset.filter;
                this.currentView = 'conversations';
                this.renderConversationList();
            });
        });

        // Search Input with Live Filtering
        const searchInput = document.getElementById('conversationSearchInput');
        const clearBtn = document.getElementById('clearSearchBtn');

        searchInput?.addEventListener('input', () => {
            this.searchQuery = searchInput.value.trim();
            if (clearBtn) clearBtn.style.display = this.searchQuery ? 'block' : 'none';
            if (this.currentView === 'contacts') {
                this.renderContactsList();
            } else {
                this.renderConversationList();
            }
        });

        clearBtn?.addEventListener('click', () => {
            searchInput.value = '';
            this.searchQuery = '';
            clearBtn.style.display = 'none';
            if (this.currentView === 'contacts') {
                this.renderContactsList();
            } else {
                this.renderConversationList();
            }
            searchInput.focus();
        });
    }

    setupMobileDrawer() {
        const sidebar = document.getElementById('sidebar');
        const openBtn = document.getElementById('openSidebarBtn');
        const overlay = document.getElementById('mobileOverlay');

        const closeSidebar = () => {
            sidebar?.classList.remove('open');
            overlay?.classList.remove('show');
        };

        openBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar?.classList.add('open');
            overlay?.classList.add('show');
        });

        overlay?.addEventListener('click', closeSidebar);

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeSidebar();
            }
        });

        // Swipe left to close drawer
        let touchStartX = 0;
        let touchStartY = 0;
        sidebar?.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length === 1) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
        }, { passive: true });

        sidebar?.addEventListener('touchend', (e) => {
            if (e.changedTouches && e.changedTouches.length === 1) {
                const diffX = touchStartX - e.changedTouches[0].clientX;
                const diffY = Math.abs(touchStartY - e.changedTouches[0].clientY);
                if (diffX > 45 && diffY < 60) {
                    closeSidebar();
                }
            }
        }, { passive: true });

        // Auto-close mobile drawer when tapping any link or button inside it (except copy button and user card)
        sidebar?.querySelectorAll('button, a').forEach(el => {
            el.addEventListener('click', () => {
                if (window.innerWidth <= 768 && !el.classList.contains('sidebar-user') && !el.closest('.btn-copy-frank-id') && !el.closest('.dropdown-user-header')) {
                    closeSidebar();
                }
            });
        });
    }

    setupNavigation() {
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const section = btn.dataset.section;
                if (!section) return;

                if (['chats', 'groups', 'contacts', 'favorites'].includes(section)) {
                    this.switchMobileTab(section);
                } else if (section === 'archive') {
                    document.querySelectorAll('.sidebar-nav .nav-item').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const titleEl = document.querySelector('.conversation-header-title');
                    if (titleEl) titleEl.textContent = 'Archive';
                    this.currentView = 'conversations';
                    this.currentFilter = 'archived';
                    this.renderConversationList();
                }

                // Close mobile drawer if open
                document.getElementById('sidebar')?.classList.remove('open');
                document.getElementById('mobileOverlay')?.classList.remove('show');
            });
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('chatApp')) {
        window.appController = new AppController();
    }
});