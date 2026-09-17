/* -------------------------------------------------------------------------
   CONTACTS DIRECTORY MODULE
   View contacts, search directory, and start 1-on-1 chats
   ------------------------------------------------------------------------- */

const contactsModule = {
    init() {
        const navContacts = document.getElementById('navContactsBtn');
        navContacts?.addEventListener('click', () => {
            this.loadContactsView();
        });
    },

    async loadContactsView() {
        const titleEl = document.querySelector('.conversation-header-title');
        if (titleEl) titleEl.textContent = 'Contacts';

        const list = document.getElementById('conversationList');
        if (!list) return;

        list.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

        try {
            const users = await api.getUsers();
            list.innerHTML = '';

            if (!users || users.length === 0) {
                list.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-title">No contacts found</div>
                        <p class="empty-state-desc">You are the first member on this server!</p>
                    </div>
                `;
                return;
            }

            users.forEach(user => {
                const initials = (user.full_name || user.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const card = document.createElement('div');
                card.className = 'conversation-card';
                card.innerHTML = `
                    <div class="avatar avatar-md">
                        <span>${initials}</span>
                        <span class="avatar-status ${user.is_online ? 'online' : 'offline'}"></span>
                    </div>
                    <div class="conversation-details">
                        <div class="conversation-name">${messagesModule.escapeHTML(user.full_name)}</div>
                        <div class="conversation-snippet">@${messagesModule.escapeHTML(user.username)} &bull; ${messagesModule.escapeHTML(user.bio || 'FRANK User')}</div>
                    </div>
                `;

                card.addEventListener('click', () => {
                    if (window.chatController) {
                        window.chatController.openDirectChat(user);
                    }
                });

                list.appendChild(card);
            });
        } catch {
            list.innerHTML = '<div class="empty-state" style="color:var(--danger);">Error loading contacts</div>';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    contactsModule.init();
});

window.contactsModule = contactsModule;
