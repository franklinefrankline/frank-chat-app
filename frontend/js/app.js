/* -------------------------------------------------------------------------
   MAIN DASHBOARD APPLICATION BOOTSTRAP
   Loads user data, conversation list, WebSocket connection, filters, and mobile drawer
   ------------------------------------------------------------------------- */

class AppController {
    constructor() {
        this.currentUser = null;
        this.conversations = [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.pinnedIds = new Set();
        this.mutedIds = new Set();
        this.archivedIds = new Set();

        this.init();
    }

    async init() {
        if (!document.getElementById('chatApp')) return;

        this.setupMobileDrawer();
        this.setupFiltersAndSearch();
        this.setupNavigation();

        document.getElementById('sidebarLogoutBtn')?.addEventListener('click', () => {
            auth.logout();
        });

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
            // Dismiss Loading Screen with smooth transition
            setTimeout(() => {
                const loader = document.getElementById('appLoadingScreen');
                if (loader) {
                    loader.classList.add('fade-out');
                    setTimeout(() => loader.remove(), 600);
                }
            }, 600);
        }
    }

    checkFirstTimeOnboarding() {
        const hasOnboarded = localStorage.getItem('qenvo_onboarded');
        if (!hasOnboarded) {
            const welcomeModal = document.getElementById('welcomeOnboardingModal');
            if (welcomeModal) {
                welcomeModal.classList.add('active');

                document.getElementById('onboardingFindPeopleBtn')?.addEventListener('click', () => {
                    welcomeModal.classList.remove('active');
                    localStorage.setItem('qenvo_onboarded', 'true');
                    const newChatModal = document.getElementById('newChatModal');
                    if (newChatModal) newChatModal.classList.add('active');
                    document.getElementById('userSearchQuery')?.focus();
                });

                document.getElementById('onboardingSkipBtn')?.addEventListener('click', () => {
                    welcomeModal.classList.remove('active');
                    localStorage.setItem('qenvo_onboarded', 'true');
                });
            }
        }
    }

    updateSidebarUser(user) {
        const nameEl = document.getElementById('sidebarUserName');
        const initialsEl = document.getElementById('sidebarUserInitials');
        if (nameEl) nameEl.textContent = user.full_name || user.username;
        if (initialsEl) {
            const name = user.full_name || user.username || '??';
            initialsEl.textContent = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        }
    }

    async loadConversations(autoSelectFirst = false) {
        const listContainer = document.getElementById('conversationList');
        if (!listContainer) return;

        try {
            const conversations = await api.getConversations();
            this.conversations = conversations || [];
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
            
            let previewText = 'No messages yet';
            if (conv.last_message) {
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
            card.className = `conversation-card ${isActive ? 'active' : ''} ${isGroup ? 'is-group' : ''}`;
            card.dataset.id = conv.id;
            card.dataset.type = conv.type || 'direct';

            card.innerHTML = `
                <div class="avatar avatar-md ${isGroup ? 'group-avatar' : ''}">
                    <span>${initials}</span>
                    ${isGroup ? '<span class="group-indicator-dot">👥</span>' : `<span class="avatar-status ${isOnline ? 'online' : 'offline'}"></span>`}
                </div>
                <div class="conversation-details">
                    <div class="conversation-row">
                        <span class="conversation-name">
                            ${isGroup ? '<span class="group-prefix-badge">Group</span> ' : ''}${messagesModule.escapeHTML(conv.name)}
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

    setupFiltersAndSearch() {
        // Filter Chips
        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this.currentFilter = chip.dataset.filter;
                this.renderConversationList();
            });
        });

        // Search Input
        const searchInput = document.getElementById('conversationSearchInput');
        const clearBtn = document.getElementById('clearSearchBtn');

        searchInput?.addEventListener('input', () => {
            this.searchQuery = searchInput.value.trim();
            if (clearBtn) clearBtn.style.display = this.searchQuery ? 'block' : 'none';
            this.renderConversationList();
        });

        clearBtn?.addEventListener('click', () => {
            searchInput.value = '';
            this.searchQuery = '';
            clearBtn.style.display = 'none';
            this.renderConversationList();
            searchInput.focus();
        });
    }

    setupMobileDrawer() {
        const sidebar = document.getElementById('sidebar');
        const openBtn = document.getElementById('openSidebarBtn');
        const overlay = document.getElementById('mobileOverlay');

        openBtn?.addEventListener('click', () => {
            sidebar?.classList.add('open');
            overlay?.classList.add('show');
        });

        overlay?.addEventListener('click', () => {
            sidebar?.classList.remove('open');
            overlay?.classList.remove('show');
        });
    }

    setupNavigation() {
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                const section = btn.dataset.section;
                if (!section) return;

                document.querySelectorAll('.sidebar-nav .nav-item').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const titleEl = document.querySelector('.conversation-header-title');

                if (section === 'chats') {
                    if (titleEl) titleEl.textContent = 'Messages';
                    this.currentFilter = 'all';
                    this.renderConversationList();
                } else if (section === 'groups') {
                    if (titleEl) titleEl.textContent = 'Groups';
                    this.currentFilter = 'groups';
                    this.renderConversationList();
                } else if (section === 'favorites') {
                    if (titleEl) titleEl.textContent = 'Favorites';
                    this.renderConversationList();
                } else if (section === 'archive') {
                    if (titleEl) titleEl.textContent = 'Archive';
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