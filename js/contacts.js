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
                const safeHandle = user.username && user.username.includes('@') ? user.username.split('@')[0] : (user.username || 'user');
                let safeName = user.full_name || safeHandle;
                if (safeName.includes('@') && safeName.includes('.')) safeName = safeName.split('@')[0];
                const frankPill = user.frank_id
                    ? `<span style="font-family: monospace; font-size: 10px; font-weight: 700; padding: 2px 5px; background: rgba(6, 182, 212, 0.12); color: var(--accent-cyan); border-radius: 4px; border: 1px solid rgba(6, 182, 212, 0.25); margin-left: 6px;">${messagesModule.escapeHTML(user.frank_id)}</span>`
                    : '';
                const avatarContent = user.avatar_url
                    ? `<img src="${messagesModule.escapeHTML(user.avatar_url)}" alt="${messagesModule.escapeHTML(safeName)}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`
                    : `<span>${initials}</span>`;
                const card = document.createElement('div');
                card.className = 'conversation-card';
                card.innerHTML = `
                    <div class="avatar avatar-md">
                        ${avatarContent}
                        <span class="avatar-status ${user.is_online ? 'online' : 'offline'}"></span>
                    </div>
                    <div class="conversation-details">
                        <div class="conversation-name" style="display: flex; align-items: center;">${messagesModule.escapeHTML(safeName)}${frankPill}</div>
                        <div class="conversation-snippet">@${messagesModule.escapeHTML(safeHandle)} &bull; ${messagesModule.escapeHTML((user.bio || 'FRANK User').replace(/ChatApp|QENVO/gi, 'FRANK'))}</div>
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
