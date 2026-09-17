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

        // Force uppercase and sanitize alphanumeric only (maxlength 6)
        input?.addEventListener('input', (e) => {
            const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
            e.target.value = clean;
            // Clear previous errors/previews on change
            const previewContainer = document.getElementById('frankIdPreviewContainer');
            const errorContainer = document.getElementById('frankIdErrorContainer');
            if (previewContainer) previewContainer.style.display = 'none';
            if (errorContainer) errorContainer.style.display = 'none';
        });

        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
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
        const queryInput = document.getElementById('userSearchQuery');
        const previewContainer = document.getElementById('frankIdPreviewContainer');
        const errorContainer = document.getElementById('frankIdErrorContainer');

        if (input) input.value = '';
        if (queryInput) queryInput.value = '';
        if (previewContainer) previewContainer.style.display = 'none';
        if (errorContainer) errorContainer.style.display = 'none';
        this.searchedUser = null;

        // Default to Existing Chats tab
        const tabExisting = document.getElementById('tabExistingChatsBtn');
        const tabNewPerson = document.getElementById('tabNewPersonBtn');
        const sectionExisting = document.getElementById('sectionExistingChats');
        const sectionNewPerson = document.getElementById('sectionNewPerson');

        tabExisting?.classList.add('active');
        tabNewPerson?.classList.remove('active');
        if (sectionExisting) sectionExisting.style.display = 'block';
        if (sectionNewPerson) sectionNewPerson.style.display = 'none';
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

        // Check if looking up self
        const currentUser = auth.getUser();
        if (currentUser && currentUser.frank_id === frankId) {
            showToast('This is your own FRANK ID!', 'info');
            return;
        }

        if (searchBtn) {
            searchBtn.disabled = true;
            searchBtn.textContent = 'Searching...';
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
                searchBtn.disabled = false;
                searchBtn.textContent = 'Lookup ID';
            }
        }
    },

    async startConversationWithUser(user) {
        try {
            // Deduplicate at database level via dedicated endpoint
            await api.createPrivateConversation(user.id);

            closeModal('newChatModal');
            showToast(`Conversation started with ${user.full_name}`, 'success');

            // Refresh conversations list in sidebar
            if (window.appController) {
                await window.appController.loadConversations(false);
            }

            // Open chat window
            if (window.chatController) {
                window.chatController.openDirectChat(user);
            }
        } catch (err) {
            showToast(err.message || 'Failed to start conversation', 'error');
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
