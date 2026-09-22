/* -------------------------------------------------------------------------
   USERS DIRECTORY & NEW CHAT SEARCH MODULE
   Dual-Section New Chat:
   1. Direct 1-click open for existing contacts (no FRANK ID required)
   2. Permanent 6-character FRANK ID lookup with profile preview card & conversation start
   ------------------------------------------------------------------------- */

const usersModule = {
    debounceTimer: null,
    searchedUser: null,

    init() {
        const modalBtn = document.getElementById('newChatModalBtn');
        const emptyStateBtn = document.getElementById('emptyStateNewChatBtn');
        const searchInput = document.getElementById('userSearchQuery');

        // Section Tabs
        const tabContacts = document.getElementById('newChatTabContacts');
        const tabFrankId = document.getElementById('newChatTabFrankId');
        const sectionContacts = document.getElementById('newChatSectionContacts');
        const sectionFrankId = document.getElementById('newChatSectionFrankId');

        const frankIdInput = document.getElementById('frankIdSearchInput');
        const frankIdBtn = document.getElementById('frankIdSearchBtn');
        const startChatBtn = document.getElementById('previewStartChatBtn');
        const selfCard = document.getElementById('newChatSelfCard');

        selfCard?.addEventListener('click', () => {
            this.openSelfChat();
        });

        tabContacts?.addEventListener('click', () => {
            tabContacts.classList.add('active');
            tabContacts.style.borderBottom = '2px solid var(--primary)';
            tabContacts.style.color = 'var(--text)';
            tabFrankId.classList.remove('active');
            tabFrankId.style.borderBottom = '2px solid transparent';
            tabFrankId.style.color = 'var(--text-muted)';
            if (sectionContacts) sectionContacts.style.display = 'block';
            if (sectionFrankId) sectionFrankId.style.display = 'none';
        });

        tabFrankId?.addEventListener('click', () => {
            tabFrankId.classList.add('active');
            tabFrankId.style.borderBottom = '2px solid var(--primary)';
            tabFrankId.style.color = 'var(--text)';
            tabContacts.classList.remove('active');
            tabContacts.style.borderBottom = '2px solid transparent';
            tabContacts.style.color = 'var(--text-muted)';
            if (sectionFrankId) sectionFrankId.style.display = 'block';
            if (sectionContacts) sectionContacts.style.display = 'none';
            frankIdInput?.focus();
        });

        modalBtn?.addEventListener('click', () => {
            openModal('newChatModal');
            this.resetModal();
            this.searchUsers('');
        });

        emptyStateBtn?.addEventListener('click', () => {
            openModal('newChatModal');
            this.resetModal();
            this.searchUsers('');
        });

        searchInput?.addEventListener('input', () => {
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.searchUsers(searchInput.value.trim());
            }, 200);
        });

        // FRANK ID Auto-uppercase and formatting
        frankIdInput?.addEventListener('input', (e) => {
            const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
            e.target.value = raw;
            if (raw.length === 6) {
                this.searchByFrankId(raw);
            } else {
                this.clearPreview();
            }
        });

        frankIdInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.searchByFrankId(frankIdInput.value.trim());
            }
        });

        frankIdBtn?.addEventListener('click', () => {
            this.searchByFrankId(frankIdInput?.value.trim());
        });

        startChatBtn?.addEventListener('click', async () => {
            if (!this.searchedUser) return;
            await this.initiateConversation(this.searchedUser);
        });
    },

    resetModal() {
        // Default to FRANK ID connect section as requested in spec
        const tabFrankId = document.getElementById('newChatTabFrankId');
        tabFrankId?.click();

        const searchInput = document.getElementById('userSearchQuery');
        if (searchInput) searchInput.value = '';

        const frankIdInput = document.getElementById('frankIdSearchInput');
        if (frankIdInput) {
            frankIdInput.value = '';
            setTimeout(() => frankIdInput.focus(), 150);
        }

        this.clearPreview();
    },

    clearPreview() {
        this.searchedUser = null;
        const loading = document.getElementById('frankIdSearchLoading');
        const error = document.getElementById('frankIdSearchError');
        const preview = document.getElementById('frankIdProfilePreview');

        if (loading) loading.style.display = 'none';
        if (error) {
            error.style.display = 'none';
            error.textContent = '';
        }
        if (preview) preview.style.display = 'none';
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
                        <div style="font-size:13px; color:var(--text-muted);">No contacts found matching "${messagesModule.escapeHTML(query)}"</div>
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
                card.style.cursor = 'pointer';

                const frankBadge = user.frank_id
                    ? `<span style="font-family: monospace; font-size: 10px; font-weight: 700; padding: 2px 5px; background: rgba(6, 182, 212, 0.12); color: var(--accent-cyan); border-radius: 4px; border: 1px solid rgba(6, 182, 212, 0.25);">${messagesModule.escapeHTML(user.frank_id)}</span>`
                    : '';

                card.innerHTML = `
                    <div class="avatar avatar-md">
                        <span>${initials}</span>
                        <span class="avatar-status ${user.is_online ? 'online' : 'offline'}"></span>
                    </div>
                    <div class="conversation-details" style="flex:1; min-width:0;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span class="conversation-name">${messagesModule.escapeHTML(user.full_name)}</span>
                            ${frankBadge}
                        </div>
                        <div style="font-size:12px; color:var(--text-muted);">@${messagesModule.escapeHTML(user.username)}</div>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" style="flex-shrink:0;">Chat</button>
                `;

                // 1-Click direct chat opening
                card.addEventListener('click', async () => {
                    await this.initiateConversation(user);
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
    },

    async searchByFrankId(idInput) {
        const cleanId = (idInput || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        const loading = document.getElementById('frankIdSearchLoading');
        const error = document.getElementById('frankIdSearchError');
        const preview = document.getElementById('frankIdProfilePreview');

        if (!cleanId) return;

        if (cleanId.length !== 6) {
            if (error) {
                error.textContent = 'FRANK ID must be exactly 6 characters (Letters A-Z, Numbers 0-9).';
                error.style.display = 'block';
            }
            if (preview) preview.style.display = 'none';
            return;
        }

        const currentUser = auth.getUser();
        if (currentUser && (currentUser.frank_id || '').toUpperCase() === cleanId) {
            if (loading) loading.style.display = 'none';
            if (error) error.style.display = 'none';
            this.searchedUser = {
                ...currentUser,
                full_name: `${currentUser.full_name || currentUser.username} (You)`,
                bio: 'Message yourself • Notes & bookmarks'
            };
            const fullNameEl = document.getElementById('previewFullName');
            const usernameEl = document.getElementById('previewUsername');
            const badgeEl = document.getElementById('previewFrankIdBadge');
            const bioEl = document.getElementById('previewBio');
            const avatarEl = document.getElementById('previewAvatar');
            if (fullNameEl) fullNameEl.textContent = this.searchedUser.full_name;
            if (usernameEl) usernameEl.textContent = `@${currentUser.username}`;
            if (badgeEl) badgeEl.textContent = `ID: ${currentUser.frank_id}`;
            if (bioEl) bioEl.textContent = this.searchedUser.bio;
            if (avatarEl) {
                const initials = (currentUser.full_name || currentUser.username || 'ME').slice(0, 2).toUpperCase();
                avatarEl.innerHTML = `<span>${initials}</span><span class="avatar-status online" id="previewStatusDot"></span>`;
            }
            if (preview) preview.style.display = 'block';
            return;
        }

        if (loading) loading.style.display = 'block';
        if (error) error.style.display = 'none';
        if (preview) preview.style.display = 'none';

        try {
            const user = await api.getUserByFrankId(cleanId);
            if (loading) loading.style.display = 'none';

            this.searchedUser = user;

            // Render Preview Card
            const fullNameEl = document.getElementById('previewFullName');
            const usernameEl = document.getElementById('previewUsername');
            const badgeEl = document.getElementById('previewFrankIdBadge');
            const bioEl = document.getElementById('previewBio');
            const avatarEl = document.getElementById('previewAvatar');
            const statusDot = document.getElementById('previewStatusDot');

            if (fullNameEl) fullNameEl.textContent = user.full_name;
            if (usernameEl) usernameEl.textContent = `@${user.username}`;
            if (badgeEl) badgeEl.textContent = `ID: ${user.frank_id}`;
            if (bioEl) bioEl.textContent = user.bio || 'Hey there! I am using FRANK.';

            if (avatarEl) {
                if (user.avatar_url) {
                    avatarEl.innerHTML = `<img src="${user.avatar_url}" alt="${user.full_name}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;"><span class="avatar-status ${user.is_online ? 'online' : 'offline'}" id="previewStatusDot"></span>`;
                } else {
                    const initials = (user.full_name || user.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                    avatarEl.innerHTML = `<span>${initials}</span><span class="avatar-status ${user.is_online ? 'online' : 'offline'}" id="previewStatusDot"></span>`;
                }
            }

            if (preview) preview.style.display = 'block';
        } catch (err) {
            if (loading) loading.style.display = 'none';
            if (error) {
                error.textContent = 'FRANK ID not found';
                error.style.display = 'block';
            }
            if (preview) preview.style.display = 'none';
        }
    },

    async openSelfChat() {
        closeModal('newChatModal');
        const currentUser = auth.getUser();
        if (!currentUser) return;
        try {
            await api.createPrivateConversation(currentUser.id, currentUser.frank_id);
        } catch (_) {}

        const selfPartner = {
            id: currentUser.id,
            username: currentUser.username,
            full_name: `${currentUser.full_name || currentUser.username} (You)`,
            bio: 'Message yourself • Notes & bookmarks',
            frank_id: currentUser.frank_id,
            is_online: true
        };

        if (window.chatController) {
            window.chatController.openDirectChat(selfPartner);
        }
        if (window.appController) {
            window.appController.loadConversations(false);
        }
    },

    async initiateConversation(user) {
        closeModal('newChatModal');

        try {
            // Guarantee zero duplicate 1-to-1 conversations at backend/client level
            await api.createPrivateConversation(user.id, user.frank_id);
        } catch (_) {}

        if (window.chatController) {
            window.chatController.openDirectChat(user);
        }

        if (window.appController) {
            window.appController.loadConversations(false);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    usersModule.init();
});

window.usersModule = usersModule;

