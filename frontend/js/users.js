/* -------------------------------------------------------------------------
<<<<<<< HEAD
   FRANK - USERS DIRECTORY & NEW CHAT SEARCH MODULE
   Tabbed modal: Existing Chats + New Person lookup by permanent 6-character FRANK ID
=======
   USERS DIRECTORY & NEW CHAT SEARCH MODULE
   Dual-Section New Chat:
   1. Direct 1-click open for existing contacts (no FRANK ID required)
   2. Permanent 6-character FRANK ID lookup with profile preview card & conversation start
>>>>>>> 36f90df20e059503643acd212a167333da206ab6
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
<<<<<<< HEAD
=======

        // Section Tabs
        const tabContacts = document.getElementById('newChatTabContacts');
        const tabFrankId = document.getElementById('newChatTabFrankId');
        const sectionContacts = document.getElementById('newChatSectionContacts');
        const sectionFrankId = document.getElementById('newChatSectionFrankId');

        const frankIdInput = document.getElementById('frankIdSearchInput');
        const frankIdBtn = document.getElementById('frankIdSearchBtn');
        const startChatBtn = document.getElementById('previewStartChatBtn');

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

>>>>>>> 36f90df20e059503643acd212a167333da206ab6
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

        // Check if looking up self
        const currentUser = auth.getUser();
        if (currentUser && currentUser.frank_id === frankId) {
            showToast('This is your own FRANK ID!', 'info');
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
<<<<<<< HEAD
                        <div style="font-size:13px; color:var(--text-muted);">No contacts found</div>
=======
                        <div style="font-size:13px; color:var(--text-muted);">No contacts found matching "${messagesModule.escapeHTML(query)}"</div>
>>>>>>> 36f90df20e059503643acd212a167333da206ab6
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
<<<<<<< HEAD
                    <div class="conversation-details">
                        <div class="conversation-name">${messagesModule.escapeHTML(user.full_name)}</div>
                        <div style="font-size:12px; color:var(--text-muted); display:flex; align-items:center; gap:6px;">
                            <span>@${messagesModule.escapeHTML(user.username)}</span>
                            ${user.frank_id ? `<span class="badge-member" style="font-size:9px;">${user.frank_id}</span>` : ''}
                        </div>
=======
                    <div class="conversation-details" style="flex:1; min-width:0;">
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span class="conversation-name">${messagesModule.escapeHTML(user.full_name)}</span>
                            ${frankBadge}
                        </div>
                        <div style="font-size:12px; color:var(--text-muted);">@${messagesModule.escapeHTML(user.username)}</div>
>>>>>>> 36f90df20e059503643acd212a167333da206ab6
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" style="flex-shrink:0;">Chat</button>
                `;

<<<<<<< HEAD
                card.addEventListener('click', () => {
                    this.startConversationWithUser(user);
=======
                // 1-Click direct chat opening
                card.addEventListener('click', async () => {
                    await this.initiateConversation(user);
>>>>>>> 36f90df20e059503643acd212a167333da206ab6
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
            if (error) {
                error.textContent = 'That is your own permanent FRANK ID! Enter a contact\'s ID to connect.';
                error.style.display = 'block';
            }
            if (preview) preview.style.display = 'none';
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

