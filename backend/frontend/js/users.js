/* -------------------------------------------------------------------------
   FRANK - USERS DIRECTORY & NEW CHAT SEARCH MODULE
   Tabbed modal: Existing Chats + New Person lookup by permanent 6-character FRANK ID
   ------------------------------------------------------------------------- */

const usersModule = {
    debounceTimer: null,
    searchedUser: null,

    init() {
        this.setupModalTriggers();
        this.setupTabs();
        this.setupFrankIdSearch();
        this.setupExistingSearch();
    },

    setupModalTriggers() {
        const triggers = document.querySelectorAll(
            '#newChatModalBtn, #emptyStateNewChatBtn, #sidebarNewChatActionBtn, #navFindPeopleBtn, [data-open-modal="newChatModal"]'
        );

        triggers.forEach(btn => {
            btn.addEventListener('click', () => {
                this.resetModal();
                openModal('newChatModal');
                this.searchUsers('');
            });
        });
    },

    setupTabs() {
        const tabExisting = document.getElementById('tabExistingChatsBtn');
        const tabNewPerson = document.getElementById('tabNewPersonBtn');
        const sectionExisting = document.getElementById('sectionExistingChats');
        const sectionNewPerson = document.getElementById('sectionNewPerson');

        tabExisting?.addEventListener('click', () => {
            tabExisting.classList.add('active');
            tabNewPerson?.classList.remove('active');
            if (sectionExisting) sectionExisting.style.display = 'block';
            if (sectionNewPerson) sectionNewPerson.style.display = 'none';
        });

        tabNewPerson?.addEventListener('click', () => {
            tabNewPerson.classList.add('active');
            tabExisting?.classList.remove('active');
            if (sectionExisting) sectionExisting.style.display = 'none';
            if (sectionNewPerson) sectionNewPerson.style.display = 'block';
            const input = document.getElementById('newPersonFrankIdInput');
            if (input) input.focus();
        });
    },

    setupFrankIdSearch() {
        const input = document.getElementById('newPersonFrankIdInput');
        const searchBtn = document.getElementById('searchFrankIdBtn');
        const previewChatBtn = document.getElementById('previewUserChatBtn');

        // Force uppercase, strip special chars/spaces, enable Connect on exactly 6 chars
        input?.addEventListener('input', (e) => {
            const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
            e.target.value = clean;

            // Exactly 6 characters required to enable Connect button
            if (searchBtn) {
                searchBtn.disabled = clean.length !== 6;
            }

            // Clear previous errors/previews on change
            const previewContainer = document.getElementById('frankIdPreviewContainer');
            const errorContainer = document.getElementById('frankIdErrorContainer');
            if (previewContainer) previewContainer.style.display = 'none';
            if (errorContainer) errorContainer.style.display = 'none';
        });

        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.value.length === 6) {
                e.preventDefault();
                this.lookupFrankId();
            }
        });

        searchBtn?.addEventListener('click', () => {
            this.lookupFrankId();
        });

        previewChatBtn?.addEventListener('click', async () => {
            if (!this.searchedUser) return;
            await this.startConversationWithUser(this.searchedUser);
        });
    },

    setupExistingSearch() {
        const searchInput = document.getElementById('userSearchQuery');
        searchInput?.addEventListener('input', () => {
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.searchUsers(searchInput.value.trim());
            }, 250);
        });
    },

    resetModal() {
        const input = document.getElementById('newPersonFrankIdInput');
        const searchBtn = document.getElementById('searchFrankIdBtn');
        const queryInput = document.getElementById('userSearchQuery');
        const previewContainer = document.getElementById('frankIdPreviewContainer');
        const errorContainer = document.getElementById('frankIdErrorContainer');

        if (input) {
            input.value = '';
            input.focus();
        }
        if (searchBtn) searchBtn.disabled = true;
        if (queryInput) queryInput.value = '';
        if (previewContainer) previewContainer.style.display = 'none';
        if (errorContainer) errorContainer.style.display = 'none';
        this.searchedUser = null;

        // Default to Enter FRANK ID tab
        const tabExisting = document.getElementById('tabExistingChatsBtn');
        const tabNewPerson = document.getElementById('tabNewPersonBtn');
        const sectionExisting = document.getElementById('sectionExistingChats');
        const sectionNewPerson = document.getElementById('sectionNewPerson');

        tabNewPerson?.classList.add('active');
        tabExisting?.classList.remove('active');
        if (sectionNewPerson) sectionNewPerson.style.display = 'block';
        if (sectionExisting) sectionExisting.style.display = 'none';
    },

    async lookupFrankId() {
        const input = document.getElementById('newPersonFrankIdInput');
        const searchBtn = document.getElementById('searchFrankIdBtn');
        const previewContainer = document.getElementById('frankIdPreviewContainer');
        const errorContainer = document.getElementById('frankIdErrorContainer');
        const errorText = document.getElementById('frankIdErrorText');

        const frankId = (input?.value || '').trim().toUpperCase();

        if (frankId.length !== 6) {
            showToast('Please enter a valid 6-character FRANK ID', 'warning');
            if (input) input.focus();
            return;
        }

        const previewChatBtn = document.getElementById('previewUserChatBtn');

        // Check if looking up self
        const currentUser = auth.getUser();
        if (currentUser && currentUser.frank_id === frankId) {
            this.searchedUser = currentUser;
            if (errorContainer) errorContainer.style.display = 'none';
            if (previewContainer) {
                previewContainer.style.display = 'block';

                const nameEl = document.getElementById('previewUserName');
                const handleEl = document.getElementById('previewUserHandle');
                const idBadgeEl = document.getElementById('previewUserFrankIdBadge');
                const bioEl = document.getElementById('previewUserBio');
                const avatarEl = document.getElementById('previewUserAvatar');
                const initialsEl = document.getElementById('previewUserInitials');

                if (nameEl) nameEl.innerHTML = `${currentUser.full_name || currentUser.username} <span class="self-prefix-badge">You</span>`;
                if (handleEl) handleEl.textContent = `@${currentUser.username}`;
                if (idBadgeEl) idBadgeEl.textContent = `ID: ${currentUser.frank_id}`;
                if (bioEl) bioEl.textContent = 'This is your FRANK ID. Send yourself notes, links, and reminders.';
                showToast('This is your FRANK ID', 'info');

                if (avatarEl && initialsEl) {
                    if (currentUser.avatar_url) {
                        avatarEl.innerHTML = `<img src="${currentUser.avatar_url}" alt="${currentUser.full_name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                    } else {
                        const initials = (currentUser.full_name || currentUser.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                        initialsEl.textContent = initials;
                    }
                }

                if (previewChatBtn) {
                    previewChatBtn.innerHTML = `<span>Message Myself</span> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
                }
            }
            return;
        }

        if (searchBtn) {
            searchBtn.disabled = true;
            searchBtn.textContent = 'Connecting...';
        }

        try {
            const user = await api.getUserByFrankId(frankId);
            this.searchedUser = user;

            if (errorContainer) errorContainer.style.display = 'none';
            if (previewContainer) {
                previewContainer.style.display = 'block';

                const nameEl = document.getElementById('previewUserName');
                const handleEl = document.getElementById('previewUserHandle');
                const idBadgeEl = document.getElementById('previewUserFrankIdBadge');
                const bioEl = document.getElementById('previewUserBio');
                const avatarEl = document.getElementById('previewUserAvatar');
                const initialsEl = document.getElementById('previewUserInitials');

                if (nameEl) nameEl.textContent = user.full_name;
                if (handleEl) handleEl.textContent = `@${user.username}`;
                if (idBadgeEl) idBadgeEl.textContent = `ID: ${user.frank_id}`;
                if (bioEl) bioEl.textContent = user.bio || 'FRANK user';

                if (avatarEl && initialsEl) {
                    if (user.avatar_url) {
                        avatarEl.innerHTML = `<img src="${user.avatar_url}" alt="${user.full_name}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
                    } else {
                        const initials = (user.full_name || user.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                        initialsEl.textContent = initials;
                    }
                }

                if (previewChatBtn) {
                    previewChatBtn.innerHTML = `<span>Message</span> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
                }
            }
        } catch (err) {
            this.searchedUser = null;
            if (previewContainer) previewContainer.style.display = 'none';
            if (errorContainer) {
                errorContainer.style.display = 'block';
                if (errorText) errorText.textContent = `No user found with FRANK ID "${frankId}"`;
            }
        } finally {
            if (searchBtn) {
                searchBtn.disabled = (input?.value || '').length !== 6;
                searchBtn.textContent = 'Connect';
            }
        }
    },

    async startConversationWithUser(user) {
        try {
            const currentUser = auth.getUser();
            const isSelf = currentUser && (Number(user.id) === Number(currentUser.id) || (user.frank_id && user.frank_id === currentUser.frank_id));

            closeModal('newChatModal');

            if (isSelf) {
                let selfConv = null;
                try {
                    selfConv = await api.createSelfConversation();
                } catch (e) {
                    try {
                        selfConv = await api.getSelfConversation();
                    } catch (err) {}
                }

                if (!selfConv) {
                    selfConv = {
                        id: currentUser.id,
                        type: 'self',
                        name: 'My Notes',
                        username: currentUser.username,
                        full_name: currentUser.full_name,
                        avatar_url: currentUser.avatar_url,
                        frank_id: currentUser.frank_id,
                        is_online: true
                    };
                }

                if (window.appController) {
                    const existingIdx = window.appController.conversations.findIndex(c => c.type === 'self');
                    if (existingIdx !== -1) {
                        window.appController.conversations[existingIdx] = { ...window.appController.conversations[existingIdx], ...selfConv };
                    } else {
                        window.appController.conversations.unshift(selfConv);
                    }
                    window.appController.renderConversationList();
                }

                if (window.chatController) {
                    window.chatController.openDirectChat(selfConv);
                }

                if (window.appController) {
                    window.appController.loadConversations(false);
                }
                return;
            }

            // Deduplicate / create at database level via dedicated endpoint
            const res = await api.createPrivateConversation(
                user.frank_id ? { frank_id: user.frank_id } : { target_user_id: user.id }
            );

            const convId = res.id || res.conversation_id;
            const partnerUser = res.partner || res.other_user || user;
            const convObj = {
                id: partnerUser.id,
                conv_id: convId,
                type: 'direct',
                name: partnerUser.full_name || partnerUser.username,
                username: partnerUser.username,
                frank_id: partnerUser.frank_id,
                avatar_url: partnerUser.avatar_url || '',
                is_online: !!partnerUser.is_online,
                last_seen: partnerUser.last_seen || null,
                last_message: res.last_message || null,
                unread_count: 0
            };

            // Immediately ensure partner is in sidebar chat list
            if (window.appController) {
                const existingIdx = window.appController.conversations.findIndex(c => 
                    (Number(c.id) === Number(convObj.id) && c.type === 'direct') || (convId && c.conv_id === convId)
                );
                if (existingIdx !== -1) {
                    window.appController.conversations[existingIdx] = {
                        ...window.appController.conversations[existingIdx],
                        ...convObj
                    };
                } else {
                    window.appController.conversations.unshift(convObj);
                }
                window.appController.renderConversationList();
            }

            // Open chat window immediately
            if (window.chatController) {
                window.chatController.openDirectChat(convObj);
            }

            showToast(`Connected with ${partnerUser.full_name || partnerUser.username}`, 'success');

            // Refresh conversations list in background to ensure database sync
            if (window.appController) {
                window.appController.loadConversations(false);
            }
        } catch (err) {
            showToast(err.message || 'Failed to start conversation', 'error');
        }
    },

    async openSelfChat() {
        try {
            closeModal('newChatModal');
            const currentUser = auth.getUser();
            if (!currentUser) return;

            let selfConv = null;
            try {
                selfConv = await api.createSelfConversation();
            } catch (e) {
                try {
                    selfConv = await api.getSelfConversation();
                } catch (err) {}
            }

            if (!selfConv) {
                selfConv = {
                    id: currentUser.id,
                    type: 'self',
                    name: 'My Notes',
                    username: currentUser.username,
                    full_name: currentUser.full_name,
                    avatar_url: currentUser.avatar_url,
                    frank_id: currentUser.frank_id,
                    is_online: true
                };
            }

            if (window.appController) {
                const existingIdx = window.appController.conversations.findIndex(c => c.type === 'self');
                if (existingIdx !== -1) {
                    window.appController.conversations[existingIdx] = { ...window.appController.conversations[existingIdx], ...selfConv };
                } else {
                    window.appController.conversations.unshift(selfConv);
                }
                window.appController.renderConversationList();
            }

            if (window.chatController) {
                window.chatController.openDirectChat(selfConv);
            }

            if (window.appController) {
                window.appController.loadConversations(false);
            }
        } catch (err) {
            console.error('Error opening self chat:', err);
        }
    },

    async searchUsers(query) {
        const resultsContainer = document.getElementById('userSearchResults');
        if (!resultsContainer) return;

        resultsContainer.innerHTML = '<div class="empty-state" style="padding:16px;"><div class="spinner"></div></div>';

        try {
            const users = await api.getUsers(query);
            resultsContainer.innerHTML = '';

            if (!users || users.length === 0) {
                resultsContainer.innerHTML = `
                    <div class="empty-state" style="padding:20px;">
                        <div style="font-size:13px; color:var(--text-muted);">No contacts found</div>
                    </div>
                `;
                return;
            }

            users.forEach(user => {
                const initials = (user.full_name || user.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const card = document.createElement('div');
                card.className = 'conversation-card';
                card.style.borderRadius = 'var(--radius-md)';
                card.style.marginBottom = '4px';

                card.innerHTML = `
                    <div class="avatar avatar-md">
                        <span>${initials}</span>
                        <span class="avatar-status ${user.is_online ? 'online' : 'offline'}"></span>
                    </div>
                    <div class="conversation-details">
                        <div class="conversation-name">${messagesModule.escapeHTML(user.full_name)}</div>
                        <div style="font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:6px;">
                            <span>@${messagesModule.escapeHTML(user.username)}</span>
                            ${user.frank_id ? `<span class="badge-member" style="font-size:9px;">${user.frank_id}</span>` : ''}
                        </div>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" style="flex-shrink:0;">Chat</button>
                `;

                card.addEventListener('click', () => {
                    this.startConversationWithUser(user);
                });

                resultsContainer.appendChild(card);
            });
        } catch (err) {
            resultsContainer.innerHTML = `
                <div class="empty-state" style="padding:16px; color:var(--danger); font-size:13px;">
                    Error loading contacts
                </div>
            `;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    usersModule.init();
});

window.usersModule = usersModule;
