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
        this.setupSidebarUserMenu();

        document.getElementById('sidebarLogoutBtn')?.addEventListener('click', () => {
            auth.logout();
        });

        const dismissLoader = () => {
            const loader = document.getElementById('appLoadingScreen');
            if (loader && !loader.classList.contains('fade-out')) {
                loader.classList.add('fade-out');
                setTimeout(() => loader.remove(), 500);
            }
        };

        // Fail-safe: ensure splash loading screen is always dismissed within 2.2s
        setTimeout(dismissLoader, 2200);

        // 1. Immediately render cached user data with zero latency
        const cachedUser = auth.getUser();
        if (cachedUser) {
            this.currentUser = cachedUser;
            this.updateSidebarUser(cachedUser);
        }

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
                return;
            }
        } finally {
            // Splash animation finishes and dismisses smoothly
            setTimeout(dismissLoader, 1600);
        }
    }

    setupSidebarUserMenu() {
        const userCard = document.getElementById('sidebarUserCard');
        const userMenu = document.getElementById('sidebarUserMenu');
        if (userCard && userMenu) {
            userCard.addEventListener('click', (e) => {
                if (e.target.closest('.dropdown-item')) return;
                e.stopPropagation();
                userMenu.classList.toggle('show');
            });

            document.addEventListener('click', (e) => {
                if (!userCard.contains(e.target)) {
                    userMenu.classList.remove('show');
                }
            });
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
        if (!user) return;
        const nameEl = document.getElementById('sidebarUserName');
        const initialsEl = document.getElementById('sidebarUserInitials');
        if (nameEl) nameEl.textContent = user.full_name || user.username;
        if (initialsEl) {
            const name = user.full_name || user.username || '??';
            initialsEl.textContent = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        }
        const statusEl = document.querySelector('.sidebar-user-status');
        if (statusEl && user.frank_id) {
            statusEl.innerHTML = `<span style="font-family:monospace; font-weight:700; color:var(--primary); letter-spacing:0.8px;">ID: ${user.frank_id}</span>`;
            statusEl.title = `Your unique FRANK ID: ${user.frank_id}`;
        }

        const frankId = auth.getFrankId(user);
        const sidebarFrankIdCode = document.getElementById('sidebarFrankIdCode');
        if (sidebarFrankIdCode) {
            sidebarFrankIdCode.textContent = frankId;
        }

        const modalMyFrankIdCode = document.getElementById('modalMyFrankIdCode');
        if (modalMyFrankIdCode) {
            modalMyFrankIdCode.textContent = frankId;
        }

        this.setupFrankIdButtons(frankId);
    }

    setupFrankIdButtons(frankId) {
        if (!frankId) return;

        const copyAction = (e) => {
            if (e) e.stopPropagation();
            navigator.clipboard.writeText(frankId).then(() => {
                showToast(`FRANK ID ${frankId} copied to clipboard!`, 'success');
            }).catch(() => {
                showToast(`Your FRANK ID is: ${frankId}`, 'info');
            });
        };

        const shareAction = (e) => {
            if (e) e.stopPropagation();
            const shareData = {
                title: 'Chat with me on FRANK',
                text: `Add me on FRANK with my unique FRANK ID: ${frankId}`,
                url: window.location.origin
            };
            if (navigator.share) {
                navigator.share(shareData).catch(() => {});
            } else {
                navigator.clipboard.writeText(`Add me on FRANK! My unique FRANK ID is: ${frankId}`).then(() => {
                    showToast('Share message copied to clipboard!', 'success');
                });
            }
        };

        const sidebarCopyBtn = document.getElementById('sidebarCopyFrankIdBtn');
        const sidebarShareBtn = document.getElementById('sidebarShareFrankIdBtn');
        const modalCopyBtn = document.getElementById('modalCopyMyFrankIdBtn');
        const modalShareBtn = document.getElementById('modalShareMyFrankIdBtn');

        if (sidebarCopyBtn) sidebarCopyBtn.onclick = copyAction;
        if (sidebarShareBtn) sidebarShareBtn.onclick = shareAction;
        if (modalCopyBtn) modalCopyBtn.onclick = copyAction;
        if (modalShareBtn) modalShareBtn.onclick = shareAction;
    }

    async loadConversations(autoSelectFirst = false) {
        const listContainer = document.getElementById('conversationList');
        if (!listContainer) return;

        try {
            let conversations = await api.getConversations();
            conversations = conversations || [];

            // Ensure self-conversation exists in the list
            const hasSelf = conversations.some(c => c.type === 'self' || (this.currentUser && Number(c.id) === Number(this.currentUser.id) && c.type !== 'group'));
            if (!hasSelf && this.currentUser) {
                try {
                    const selfConv = await api.getSelfConversation();
                    if (selfConv) {
                        conversations.unshift(selfConv);
                    }
                } catch (e) {
                    console.warn('Self-conversation fallback:', e);
                }
            }

            // Always ensure self-conversation is at the very top
            const selfIndex = conversations.findIndex(c => c.type === 'self' || (this.currentUser && Number(c.id) === Number(this.currentUser.id) && c.type !== 'group'));
            if (selfIndex > 0) {
                const [selfItem] = conversations.splice(selfIndex, 1);
                conversations.unshift(selfItem);
            }

            this.conversations = conversations;
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

        if (this.conversations.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state" style="padding: var(--space-6) var(--space-4); text-align: center;">
                    <div class="empty-state-icon" style="width:48px; height:48px; margin: 0 auto var(--space-3);">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </div>
                    <h3 style="font-size:16px; font-weight:800; color:var(--text); margin-bottom:4px;">Welcome to FRANK</h3>
                    <p style="font-size:13px; color:var(--text-secondary); margin-bottom:16px;">No conversations yet.</p>
                    <div style="display:flex; flex-direction:column; gap:8px; width:100%; max-width:200px; margin:0 auto;">
                        <button type="button" class="btn btn-primary btn-sm" id="emptyStateNewChatBtn" onclick="if(window.usersModule){usersModule.resetModal();openModal('newChatModal');}">+ New Conversation</button>
                        <button type="button" class="btn btn-secondary btn-sm" id="emptyStateSelfChatBtn" onclick="if(window.usersModule){usersModule.openSelfChat();}">Message Myself</button>
                    </div>
                </div>
            `;
            return;
        }

        if (filtered.length === 0) {
            listContainer.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon" style="width:48px; height:48px;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                    <div style="font-size:14px; font-weight:700; color:var(--text); margin-bottom:4px;">No conversations found</div>
                    <p class="empty-state-desc" style="font-size:12px;">Try adjusting your filter or search query.</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = '';
        filtered.forEach(conv => {
            const isGroup = conv.type === 'group';
            const isSelf = conv.type === 'self' || (this.currentUser && Number(conv.id) === Number(this.currentUser.id) && conv.type !== 'group');
            const initials = isSelf
                ? '📌'
                : (conv.name || conv.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const isOnline = isSelf ? true : !!conv.is_online;
            const timeStr = conv.last_message ? messagesModule.formatRelativeTime(conv.last_message.created_at) : '';
            
            let previewText = isSelf ? 'Message yourself, notes & reminders' : 'No messages yet';
            if (conv.last_message) {
                if (conv.last_message.message_type === 'audio') {
                    previewText = '🎤 Voice message';
                } else if (conv.last_message.message_type === 'document') {
                    previewText = '📎 Document shared';
                } else if (conv.last_message.sender_name && isGroup) {
                    previewText = `${conv.last_message.sender_name}: ${conv.last_message.content}`;
                } else {
                    previewText = conv.last_message.content;
                }
            }
            previewText = messagesModule.escapeHTML(previewText);

            const isActive = window.chatController && Number(window.chatController.activeId) === Number(conv.id) && (isSelf ? (window.chatController.activePartner?.type === 'self' || window.chatController.activeType === 'direct') : window.chatController.activeType === conv.type);
            if (isActive) {
                conv.unread_count = 0;
            }

            const card = document.createElement('div');
            card.className = `conversation-card ${isActive ? 'active' : ''} ${isGroup ? 'is-group' : ''} ${isSelf ? 'is-self' : ''}`;
            card.dataset.id = conv.id;
            card.dataset.type = isSelf ? 'self' : (conv.type || 'direct');

            // Avatar markup
            let avatarHtml = '';
            if (isSelf) {
                if (conv.avatar_url) {
                    avatarHtml = `
                        <div class="avatar avatar-md self-avatar">
                            <img src="${messagesModule.escapeHTML(conv.avatar_url)}" alt="Me" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">
                            <span class="avatar-status self-badge-icon" title="You">📌</span>
                        </div>
                    `;
                } else {
                    avatarHtml = `
                        <div class="avatar avatar-md self-avatar" style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #fff; font-size: 16px;">
                            <span>📌</span>
                            <span class="avatar-status online" title="You"></span>
                        </div>
                    `;
                }
            } else if (isGroup) {
                avatarHtml = `
                    <div class="avatar avatar-md group-avatar">
                        <span>${initials}</span>
                        <span class="group-indicator-dot">👥</span>
                    </div>
                `;
            } else {
                avatarHtml = `
                    <div class="avatar avatar-md">
                        <span>${initials}</span>
                        <span class="avatar-status ${isOnline ? 'online' : 'offline'}"></span>
                    </div>
                `;
            }

            // Name markup
            let nameHtml = '';
            if (isSelf) {
                nameHtml = `<span class="conversation-name">Message Myself <span class="self-prefix-badge">You</span></span>`;
            } else if (isGroup) {
                nameHtml = `<span class="conversation-name"><span class="group-prefix-badge">Group</span> ${messagesModule.escapeHTML(conv.name)} ${conv.unread_count > 0 ? '<span class="unread-dot" title="Unread messages">🔵</span>' : ''}</span>`;
            } else {
                nameHtml = `<span class="conversation-name">${messagesModule.escapeHTML(conv.name || conv.full_name || conv.username)} ${conv.unread_count > 0 ? '<span class="unread-dot" title="Unread messages">🔵</span>' : ''}</span>`;
            }

            card.innerHTML = `
                ${avatarHtml}
                <div class="conversation-details">
                    <div class="conversation-row">
                        ${nameHtml}
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
                    // Reset unread badge & dot locally
                    conv.unread_count = 0;
                    const badge = card.querySelector('.unread-badge');
                    if (badge) badge.remove();
                    const dot = card.querySelector('.unread-dot');
                    if (dot) dot.remove();
                    this.updateTotalUnread();
                }
            });

            listContainer.appendChild(card);
        });
    }

    updateTotalUnread() {
        let total = 0;
        this.conversations.forEach(c => {
            if (c.unread_count) total += Number(c.unread_count);
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

        // WhatsApp-style dynamic browser tab favicon badge + title + app badge
        if (typeof window.notificationsModule !== 'undefined' && window.notificationsModule.updateUnreadBadge) {
            window.notificationsModule.updateUnreadBadge(total);
        }
    }

    // Handle real-time incoming message update to sidebar preview & unread count
    handleIncomingMessageSidebar(msg, isActivelyViewing = false) {
        if (!msg) return;
        const senderId = Number(msg.sender_id);
        const recipientId = msg.recipient_id ? Number(msg.recipient_id) : null;
        const groupId = msg.group_id ? Number(msg.group_id) : null;
        const currentUser = auth.getUser();
        const currentUserId = currentUser ? Number(currentUser.id) : null;

        const isGroup = !!groupId;
        const isSelf = (senderId === currentUserId && recipientId === currentUserId);
        const partnerId = isSelf ? currentUserId : (senderId === currentUserId ? recipientId : senderId);
        const targetId = isGroup ? groupId : partnerId;

        const index = this.conversations.findIndex(c => {
            if (isGroup) return c.type === 'group' && Number(c.id) === Number(targetId);
            if (isSelf) return c.type === 'self' || (Number(c.id) === Number(currentUserId) && c.type !== 'group');
            return c.type !== 'group' && c.type !== 'self' && Number(c.id) === Number(targetId);
        });

        if (index !== -1) {
            const conv = this.conversations[index];
            conv.last_message = {
                id: msg.id,
                content: msg.content,
                message_type: msg.message_type || 'text',
                sender_id: msg.sender_id,
                sender_name: msg.sender_name || (msg.sender ? msg.sender.full_name : null),
                created_at: msg.created_at,
                status: msg.status || 'sent'
            };

            // Increment unread count only if user is not actively viewing this conversation (never for self)
            if (!isActivelyViewing && senderId !== currentUserId) {
                conv.unread_count = (conv.unread_count || 0) + 1;
            }

            // Keep self-chat pinned at index 0, or if self-chat is at 0, place updated chat at index 1
            this.conversations.splice(index, 1);
            if (conv.type === 'self' || isSelf) {
                this.conversations.unshift(conv);
            } else {
                const selfIdx = this.conversations.findIndex(c => c.type === 'self' || (Number(c.id) === Number(currentUserId) && c.type !== 'group'));
                if (selfIdx === 0) {
                    this.conversations.splice(1, 0, conv);
                } else {
                    this.conversations.unshift(conv);
                }
            }

            this.renderConversationList();
            this.updateTotalUnread();
        } else {
            // New conversation partner not yet in list: create card immediately and sync from server
            const partnerUser = msg.sender || {};
            const newConv = {
                id: targetId,
                conv_id: msg.conversation_id,
                type: isGroup ? 'group' : 'direct',
                name: partnerUser.full_name || partnerUser.username || (isGroup ? 'Group' : 'User'),
                username: partnerUser.username || '',
                frank_id: partnerUser.frank_id || '',
                avatar_url: partnerUser.avatar_url || '',
                is_online: true,
                last_seen: null,
                last_message: {
                    id: msg.id,
                    content: msg.content,
                    message_type: msg.message_type || 'text',
                    sender_id: msg.sender_id,
                    sender_name: msg.sender_name || (msg.sender ? msg.sender.full_name : null),
                    created_at: msg.created_at,
                    status: msg.status || 'sent'
                },
                unread_count: (!isActivelyViewing && senderId !== currentUserId) ? 1 : 0
            };

            const selfIdx = this.conversations.findIndex(c => c.type === 'self' || (Number(c.id) === Number(currentUserId) && c.type !== 'group'));
            if (selfIdx === 0) {
                this.conversations.splice(1, 0, newConv);
            } else {
                this.conversations.unshift(newConv);
            }
            this.renderConversationList();
            this.updateTotalUnread();

            this.loadConversations(false);
        }
    }

    // Open conversation from in-app toast or browser desktop notification click
    openConversationFromNotification(targetId, isGroup = false, msg = null) {
        const conv = this.conversations.find(c => 
            Number(c.id) === Number(targetId) && (c.type === 'group') === isGroup
        );

        if (conv && window.chatController) {
            if (isGroup) {
                window.chatController.openGroupChat(conv);
            } else {
                window.chatController.openDirectChat(conv);
            }
            conv.unread_count = 0;
            this.renderConversationList();
            this.updateTotalUnread();
        } else if (window.chatController) {
            if (isGroup) {
                window.chatController.openGroupChat({ id: targetId, name: (msg && msg.group_name) || 'Group Chat' });
            } else {
                window.chatController.openDirectChat({ id: targetId, full_name: (msg && msg.sender_name) || (msg && msg.sender && msg.sender.full_name) || 'User', username: '' });
            }
            this.loadConversations(false);
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