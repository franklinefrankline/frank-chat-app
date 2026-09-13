/* -------------------------------------------------------------------------
   USERS DIRECTORY & NEW CHAT SEARCH MODULE
   Debounced user lookup and conversation creation
   ------------------------------------------------------------------------- */

const usersModule = {
    debounceTimer: null,

    init() {
        const modalBtn = document.getElementById('newChatModalBtn');
        const emptyStateBtn = document.getElementById('emptyStateNewChatBtn');
        const searchInput = document.getElementById('userSearchQuery');

        modalBtn?.addEventListener('click', () => {
            openModal('newChatModal');
            this.searchUsers('');
        });

        emptyStateBtn?.addEventListener('click', () => {
            openModal('newChatModal');
            this.searchUsers('');
        });

        searchInput?.addEventListener('input', () => {
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.searchUsers(searchInput.value.trim());
            }, 250);
        });
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
                        <div style="font-size:13px; color:var(--text-muted);">No users found</div>
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
                        <div style="font-size:12px; color:var(--text-muted);">@${messagesModule.escapeHTML(user.username)}</div>
                    </div>
                    <button type="button" class="btn btn-secondary btn-sm" style="flex-shrink:0;">Chat</button>
                `;

                card.addEventListener('click', () => {
                    closeModal('newChatModal');
                    if (window.chatController) {
                        window.chatController.openDirectChat(user);
                    }
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
