/* -------------------------------------------------------------------------
   CENTRALIZED API CLIENT
   Clean async HTTP requests with resilient demo fallback, token injection,
   error handling, and timeout
   ------------------------------------------------------------------------- */

const API_BASE = (window.FRANK_CONFIG && window.FRANK_CONFIG.API_BASE)
    ? window.FRANK_CONFIG.API_BASE
    : (window.location.origin.includes(':8000') || window.location.origin.includes(':3000')
        ? window.location.origin
        : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || !window.location.hostname
            ? 'http://localhost:8000'
            : window.location.origin));

// Resilient Offline/Demo Database
const MOCK_STORAGE_KEY = 'frank_offline_db';

function getMockDb() {
    let db = null;
    try {
        const raw = localStorage.getItem(MOCK_STORAGE_KEY);
        if (raw) db = JSON.parse(raw);
    } catch {}
    if (!db || !db.users || !Array.isArray(db.users)) {
        db = {
            users: [
                {
                    id: 1,
                    username: 'alex',
                    email: 'alex@frank.app',
                    frank_id: 'F4M8Q1',
                    full_name: 'Alex Morgan',
                    bio: 'Product Designer & Tech Enthusiast 🚀',
                    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
                    is_online: true,
                    created_at: '2026-01-01T00:00:00Z'
                },
                {
                    id: 2,
                    username: 'sarah',
                    email: 'sarah@frank.app',
                    frank_id: 'K7P2X9',
                    full_name: 'Sarah Connor',
                    bio: 'Building the future of real-time communication.',
                    avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
                    is_online: true,
                    created_at: '2026-01-01T00:00:00Z'
                },
                {
                    id: 3,
                    username: 'david',
                    email: 'david@frank.app',
                    frank_id: 'B3N8R5',
                    full_name: 'David Chen',
                    bio: 'Software Architect & Open Source Contributor.',
                    avatar_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
                    is_online: false,
                    created_at: '2026-01-01T00:00:00Z'
                }
            ],
            conversations: [
                { id: 1, user_a_id: 1, user_b_id: 2, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
            ],
            messages: [
                {
                    id: 1,
                    sender_id: 2,
                    recipient_id: 1,
                    group_id: null,
                    content: 'Welcome to FRANK! Real-time messaging, emoji reactions, and reply threads are fully functional.',
                    status: 'read',
                    message_type: 'text',
                    file_id: null,
                    created_at: new Date(Date.now() - 3600000).toISOString(),
                    reactions: []
                },
                {
                    id: 2,
                    sender_id: 1,
                    recipient_id: 2,
                    group_id: null,
                    content: 'Thanks Sarah! Loving the clean and responsive experience.',
                    status: 'read',
                    message_type: 'text',
                    file_id: null,
                    created_at: new Date(Date.now() - 1800000).toISOString(),
                    reactions: []
                }
            ],
            groups: [
                {
                    id: 1,
                    name: 'FRANK Core Team',
                    description: 'Product design, architecture & engineering',
                    avatar_url: null,
                    privacy: 'private',
                    created_by: 1,
                    members_count: 3,
                    created_at: '2026-01-01T00:00:00Z'
                }
            ],
            group_members: [
                { id: 1, group_id: 1, user_id: 1, role: 'owner', joined_at: '2026-01-01T00:00:00Z' },
                { id: 2, group_id: 1, user_id: 2, role: 'admin', joined_at: '2026-01-01T00:00:00Z' },
                { id: 3, group_id: 1, user_id: 3, role: 'member', joined_at: '2026-01-01T00:00:00Z' }
            ]
        };
        try {
            localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db));
        } catch {}
    } else {
        // Ensure frank_id exists on all users
        let changed = false;
        const defaults = ['F4M8Q1', 'K7P2X9', 'B3N8R5'];
        db.users.forEach((u, i) => {
            if (!u.frank_id) {
                u.frank_id = defaults[i] || ('F' + Math.random().toString(36).substring(2, 7).toUpperCase());
                changed = true;
            }
        });
        if (!db.conversations) {
            db.conversations = [];
            changed = true;
        }
        if (!db.group_members) {
            db.group_members = [
                { id: 1, group_id: 1, user_id: 1, role: 'owner', joined_at: '2026-01-01T00:00:00Z' },
                { id: 2, group_id: 1, user_id: 2, role: 'admin', joined_at: '2026-01-01T00:00:00Z' },
                { id: 3, group_id: 1, user_id: 3, role: 'member', joined_at: '2026-01-01T00:00:00Z' }
            ];
            changed = true;
        }
        if (changed) {
            try { localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db)); } catch {}
        }
    }
    return db;
}

function saveMockDb(db) {
    try {
        localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db));
    } catch {}
}

function handleMockRequest(endpoint, options = {}) {
    const db = getMockDb();
    const method = (options.method || 'GET').toUpperCase();
    let body = {};
    if (options.body) {
        try { body = JSON.parse(options.body); } catch {}
    }

    let currentUser = null;
    try {
        const raw = localStorage.getItem('chatapp_user');
        if (raw) currentUser = JSON.parse(raw);
    } catch {}
    if (!currentUser) currentUser = db.users[0];
    if (!currentUser.frank_id) currentUser.frank_id = 'F4M8Q1';

    // 1. Auth: Login
    if (endpoint === '/api/auth/login' && method === 'POST') {
        const username = (body.username || '').trim().toLowerCase();
        let user = db.users.find(u => u.username.toLowerCase() === username || u.email.toLowerCase() === username);
        if (!user) {
            user = {
                id: db.users.length + 1,
                username: body.username || 'user',
                email: `${body.username || 'user'}@frank.app`,
                frank_id: 'F' + Math.random().toString(36).substring(2, 7).toUpperCase(),
                full_name: (body.username ? body.username.charAt(0).toUpperCase() + body.username.slice(1) : 'FRANK User'),
                bio: 'Hey there! I am using FRANK.',
                avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
                is_online: true,
                created_at: new Date().toISOString()
            };
            db.users.push(user);
            saveMockDb(db);
        }
        return {
            access_token: `mock_jwt_token_${user.id}_${Date.now()}`,
            token_type: 'bearer',
            user: user
        };
    }

    // 2. Auth: Register
    if (endpoint === '/api/auth/register' && method === 'POST') {
        const username = (body.username || '').trim().toLowerCase();
        let user = db.users.find(u => u.username.toLowerCase() === username);
        if (user) {
            const err = new Error('Username already taken');
            err.status = 400;
            throw err;
        }
        user = {
            id: db.users.length + 1,
            username: body.username,
            email: body.email || `${body.username}@frank.app`,
            full_name: body.full_name || body.username,
            bio: 'Hey there! I am using FRANK.',
            avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
            is_online: true,
            created_at: new Date().toISOString()
        };
        db.users.push(user);
        saveMockDb(db);
        return {
            access_token: `mock_jwt_token_${user.id}_${Date.now()}`,
            token_type: 'bearer',
            user: user
        };
    }

    // 3. Auth: Current User
    if (endpoint === '/api/auth/me') {
        return currentUser;
    }

    // 4. Users: Lookup by FRANK ID
    if (endpoint.startsWith('/api/users/frank/') && method === 'GET') {
        const frankId = endpoint.replace('/api/users/frank/', '').trim().toUpperCase();
        const found = db.users.find(u => (u.frank_id || '').toUpperCase() === frankId);
        if (!found) {
            const err = new Error(`User with FRANK ID '${frankId}' not found.`);
            err.status = 404;
            throw err;
        }
        return {
            id: found.id,
            username: found.username,
            full_name: found.full_name,
            frank_id: found.frank_id,
            bio: found.bio,
            avatar_url: found.avatar_url,
            is_online: found.is_online
        };
    }

    // 4b. Users: Create / Get Single Private Conversation
    if (endpoint === '/api/users/conversations/private' && method === 'POST') {
        let target = null;
        if (body.target_user_id) {
            target = db.users.find(u => u.id === body.target_user_id);
        } else if (body.frank_id) {
            const fid = body.frank_id.trim().toUpperCase();
            target = db.users.find(u => (u.frank_id || '').toUpperCase() === fid);
        }

        if (!target) {
            const err = new Error('Target user not found.');
            err.status = 404;
            throw err;
        }

        const ua = Math.min(currentUser.id, target.id);
        const ub = Math.max(currentUser.id, target.id);
        if (!db.conversations) db.conversations = [];
        let conv = db.conversations.find(c => c.user_a_id === ua && c.user_b_id === ub);
        if (!conv) {
            conv = {
                id: db.conversations.length ? Math.max(...db.conversations.map(c => c.id)) + 1 : 1,
                user_a_id: ua,
                user_b_id: ub,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            db.conversations.push(conv);
            saveMockDb(db);
        }

        return {
            ...conv,
            other_user: target
        };
    }

    // 4c. Users: List & Search
    if (endpoint.startsWith('/api/users') && method === 'GET') {
        if (endpoint.includes('/conversations')) {
            // Handled below in #5
        } else {
            const clean = endpoint.split('?')[0];
            const parts = clean.split('/');
            if (parts.length >= 4 && parts[3] && !isNaN(Number(parts[3]))) {
                const targetId = Number(parts[3]);
                const u = db.users.find(x => x.id === targetId);
                return u || currentUser;
            }
            let list = db.users.filter(u => u.id !== currentUser.id);
            const queryIdx = endpoint.indexOf('?');
            if (queryIdx !== -1) {
                const searchParams = new URLSearchParams(endpoint.slice(queryIdx));
                const q = searchParams.get('q');
                if (q) {
                    const pat = q.toLowerCase();
                    list = list.filter(u => u.username.toLowerCase().includes(pat) || u.full_name.toLowerCase().includes(pat) || (u.frank_id && u.frank_id.toLowerCase().includes(pat)));
                }
            }
            return list;
        }
    }

    // 5. Conversations
    if (endpoint === '/api/users/conversations') {
        const selfMsgs = db.messages.filter(m => m.sender_id === currentUser.id && m.recipient_id === currentUser.id && !m.group_id);
        const lastSelfMsg = selfMsgs.length > 0 ? selfMsgs[selfMsgs.length - 1] : null;
        const selfConv = {
            id: currentUser.id,
            type: 'direct',
            name: `${currentUser.full_name || currentUser.username} (You)`,
            username: currentUser.username,
            frank_id: currentUser.frank_id,
            avatar_url: currentUser.avatar_url,
            is_online: true,
            user: currentUser,
            bio: 'Message yourself • Notes & bookmarks',
            last_message: lastSelfMsg ? {
                id: lastSelfMsg.id,
                content: lastSelfMsg.content,
                message_type: lastSelfMsg.message_type || 'text',
                sender_id: lastSelfMsg.sender_id,
                created_at: lastSelfMsg.created_at,
                status: lastSelfMsg.status
            } : null,
            unread_count: 0
        };

        const partners = db.users.filter(u => u.id !== currentUser.id);
        const partnerConvs = partners.map(p => {
            const chatMsgs = db.messages.filter(m =>
                (m.sender_id === currentUser.id && m.recipient_id === p.id) ||
                (m.sender_id === p.id && m.recipient_id === currentUser.id)
            );
            const lastMsg = chatMsgs.length > 0 ? chatMsgs[chatMsgs.length - 1] : null;
            return {
                id: p.id,
                type: 'direct',
                name: p.full_name,
                username: p.username,
                frank_id: p.frank_id,
                avatar_url: p.avatar_url,
                is_online: p.is_online,
                user: p,
                last_message: lastMsg ? {
                    id: lastMsg.id,
                    content: lastMsg.content,
                    message_type: lastMsg.message_type || 'text',
                    sender_id: lastMsg.sender_id,
                    created_at: lastMsg.created_at,
                    status: lastMsg.status
                } : null,
                unread_count: 0
            };
        });

        return [selfConv, ...partnerConvs];
    }


    // 6. Direct Messages
    if (endpoint.startsWith('/api/messages/direct/') && method === 'GET') {
        const partnerId = Number(endpoint.replace('/api/messages/direct/', ''));
        if (partnerId === currentUser.id) {
            return db.messages.filter(m => m.sender_id === currentUser.id && m.recipient_id === currentUser.id && !m.group_id);
        }
        return db.messages.filter(m =>
            (m.sender_id === currentUser.id && m.recipient_id === partnerId) ||
            (m.sender_id === partnerId && m.recipient_id === currentUser.id)
        );
    }

    // 7. Send Message
    if (endpoint === '/api/messages' && method === 'POST') {
        const newMsg = {
            id: db.messages.length + 1,
            sender_id: currentUser.id,
            recipient_id: body.recipient_id || null,
            group_id: body.group_id || null,
            content: body.content || '',
            status: 'sent',
            message_type: body.message_type || 'text',
            file_id: body.file_id || null,
            created_at: new Date().toISOString(),
            reactions: []
        };
        db.messages.push(newMsg);
        saveMockDb(db);

        // Friendly auto-reply after 1.2s for direct messages (skip for self-messages)
        if (newMsg.recipient_id && !newMsg.group_id && Number(newMsg.recipient_id) !== Number(currentUser.id)) {
            const partnerId = newMsg.recipient_id;
            setTimeout(() => {
                const refreshed = getMockDb();
                const partner = refreshed.users.find(u => u.id === partnerId);
                const replyMsg = {
                    id: refreshed.messages.length + 1,
                    sender_id: partnerId,
                    recipient_id: currentUser.id,
                    group_id: null,
                    content: `Got your message: "${newMsg.content}". Real-time communication on FRANK is working great! 🚀`,
                    status: 'sent',
                    message_type: 'text',
                    file_id: null,
                    created_at: new Date().toISOString(),
                    reactions: []
                };
                refreshed.messages.push(replyMsg);
                saveMockDb(refreshed);
                if (window.chatController && window.chatController.activeId === partnerId) {
                    window.chatController.activeMessages.push(replyMsg);
                    if (window.messagesController) {
                        window.messagesController.appendMessage(replyMsg);
                    }
                }
            }, 1200);
        }

        return newMsg;
    }

    // 8. Reactions
    if (endpoint.includes('/reactions') && method === 'POST') {
        return { status: 'success', emoji: body.emoji || '👍' };
    }

    // 9. Groups List & Creation
    if (endpoint === '/api/groups' && method === 'GET') {
        return db.groups;
    }

    if (endpoint === '/api/groups' && method === 'POST') {
        const newGroup = {
            id: db.groups.length ? Math.max(...db.groups.map(g => g.id)) + 1 : 1,
            name: body.name || 'New Group',
            description: body.description || '',
            avatar_url: body.avatar_url || '',
            privacy: body.privacy || 'private',
            created_by: currentUser.id,
            members_count: 1 + (body.member_ids ? body.member_ids.length : 0),
            created_at: new Date().toISOString()
        };
        db.groups.push(newGroup);
        if (!db.group_members) db.group_members = [];
        db.group_members.push({
            id: db.group_members.length + 1,
            group_id: newGroup.id,
            user_id: currentUser.id,
            role: 'owner',
            joined_at: new Date().toISOString()
        });
        (body.member_ids || []).forEach(uid => {
            if (uid !== currentUser.id) {
                db.group_members.push({
                    id: db.group_members.length + 1,
                    group_id: newGroup.id,
                    user_id: uid,
                    role: 'member',
                    joined_at: new Date().toISOString()
                });
            }
        });
        saveMockDb(db);
        return newGroup;
    }

    // 10. Group Details & Members
    if (endpoint.includes('/members/') && endpoint.endsWith('/role') && method === 'PATCH') {
        const parts = endpoint.split('/');
        const gid = Number(parts[3]);
        const uid = Number(parts[5]);
        const role = body.role || 'member';
        if (!db.group_members) db.group_members = [];
        let mem = db.group_members.find(m => m.group_id === gid && m.user_id === uid);
        if (!mem) {
            mem = { id: db.group_members.length + 1, group_id: gid, user_id: uid, role, joined_at: new Date().toISOString() };
            db.group_members.push(mem);
        } else {
            mem.role = role;
        }
        saveMockDb(db);
        const u = db.users.find(x => x.id === uid) || { id: uid, full_name: 'User', username: 'user' };
        return { ...mem, user: u };
    }

    if (endpoint.startsWith('/api/groups/') && method === 'DELETE' && !endpoint.includes('/members/')) {
        const parts = endpoint.split('/');
        const gid = Number(parts[3]);
        db.groups = db.groups.filter(g => g.id !== gid);
        if (db.group_members) db.group_members = db.group_members.filter(m => m.group_id !== gid);
        saveMockDb(db);
        return { success: true, message: 'Group deleted' };
    }

    if (endpoint.startsWith('/api/groups/') && method === 'GET') {
        if (endpoint.endsWith('/messages')) {
            const parts = endpoint.split('/');
            const gid = Number(parts[3]);
            return db.messages.filter(m => m.group_id === gid);
        }
        if (endpoint.endsWith('/members')) {
            const parts = endpoint.split('/');
            const gid = Number(parts[3]);
            if (!db.group_members) db.group_members = [];
            const group = db.groups.find(g => g.id === gid);
            const mems = db.group_members.filter(m => m.group_id === gid);
            if (mems.length === 0) {
                return db.users.map(u => ({
                    id: u.id,
                    group_id: gid,
                    user_id: u.id,
                    role: (group && u.id === group.created_by) ? 'owner' : (u.id === 2 ? 'admin' : 'member'),
                    joined_at: new Date().toISOString(),
                    user: u
                }));
            }
            return mems.map(m => ({
                ...m,
                user: db.users.find(u => u.id === m.user_id) || { id: m.user_id, full_name: 'Member', username: 'member' }
            }));
        }
        const parts = endpoint.split('/');
        const gid = Number(parts[3]);
        return db.groups.find(g => g.id === gid) || db.groups[0];
    }


    // 11. Profile Update
    if (endpoint === '/api/users/profile' && method === 'PUT') {
        Object.assign(currentUser, body);
        const idx = db.users.findIndex(u => u.id === currentUser.id);
        if (idx !== -1) db.users[idx] = currentUser;
        saveMockDb(db);
        localStorage.setItem('chatapp_user', JSON.stringify(currentUser));
        return currentUser;
    }

    // Default fallback
    return { status: 'success', message: 'Handled in local demo mode' };
}

const api = {
    baseUrl: API_BASE,
    getToken() {
        return localStorage.getItem('chatapp_token');
    },

    setToken(token) {
        if (token) {
            localStorage.setItem('chatapp_token', token);
        } else {
            localStorage.removeItem('chatapp_token');
        }
    },

    async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        const token = this.getToken();
        if (token && !headers['Authorization']) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        try {
            const res = await fetch(url, config);

            // Handle 401 Unauthorized
            if (res.status === 401) {
                if (!url.includes('/api/auth/login') && !url.includes('/api/auth/register')) {
                    this.setToken(null);
                    localStorage.removeItem('chatapp_user');
                    if (!window.location.pathname.endsWith('login.html') && !window.location.pathname.endsWith('index.html')) {
                        window.location.href = 'login.html?expired=1';
                    }
                }
            }

            let data = null;
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await res.json();
            }

            // If backend returned non-OK response
            if (!res.ok) {
                if (window.isDemoMode) {
                    console.warn(`[FRANK API] Demo mode active. Falling back for ${endpoint}.`);
                    return handleMockRequest(endpoint, options);
                }
                const errorMsg = (data && (data.detail || data.message)) || `Request failed with status ${res.status}`;
                const err = new Error(errorMsg);
                err.status = res.status;
                err.data = data;
                throw err;
            }

            return data;
        } catch (error) {
            if (window.isDemoMode && error && (error.name === 'TypeError' || String(error).includes('fetch') || String(error).includes('NetworkError'))) {
                console.warn(`[FRANK API] Demo mode fallback for ${endpoint}.`);
                return handleMockRequest(endpoint, options);
            }
            console.error(`API Error [${endpoint}]:`, error);
            throw error;
        }
    },

    // Auth endpoints
    async login(username, password) {
        return this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
    },

    async register(data) {
        return this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async getCurrentUser() {
        return this.request('/api/auth/me');
    },

    async forgotPassword(email) {
        return this.request('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    },

    async resetPassword(token, new_password) {
        return this.request('/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, new_password })
        });
    },

    // Users & Contacts endpoints
    async getUsers(q = '') {
        const queryParam = q ? `?q=${encodeURIComponent(q)}` : '';
        return this.request(`/api/users${queryParam}`);
    },

    async getUserById(id) {
        return this.request(`/api/users/${id}`);
    },

    async getConversations() {
        return this.request('/api/users/conversations');
    },

    async updateProfile(profileData) {
        return this.request('/api/users/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
    },

    // Messages endpoints
    async getDirectMessages(partnerId) {
        return this.request(`/api/messages/direct/${partnerId}`);
    },

    async sendMessage(payload) {
        return this.request('/api/messages', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    async toggleReaction(messageId, emoji) {
        return this.request(`/api/messages/${messageId}/reactions`, {
            method: 'POST',
            body: JSON.stringify({ emoji })
        });
    },

    async deleteMessage(messageId) {
        return this.request(`/api/messages/${messageId}`, {
            method: 'DELETE'
        });
    },

    async editMessage(messageId, content) {
        return this.request(`/api/messages/${messageId}`, {
            method: 'PUT',
            body: JSON.stringify({ content })
        });
    },

    // Groups endpoints
    async getGroups() {
        return this.request('/api/groups');
    },

    async getGroup(groupId) {
        return this.request(`/api/groups/${groupId}`);
    },

    async createGroup(groupData) {
        return this.request('/api/groups', {
            method: 'POST',
            body: JSON.stringify(groupData)
        });
    },

    async updateGroup(groupId, groupData) {
        return this.request(`/api/groups/${groupId}`, {
            method: 'PUT',
            body: JSON.stringify(groupData)
        });
    },

    async getGroupMessages(groupId) {
        return this.request(`/api/groups/${groupId}/messages`);
    },

    async getGroupMembers(groupId) {
        return this.request(`/api/groups/${groupId}/members`);
    },

    async addGroupMembers(groupId, userIds) {
        return this.request(`/api/groups/${groupId}/members`, {
            method: 'POST',
            body: JSON.stringify({ user_ids: userIds })
        });
    },

    async getUserByFrankId(frankId) {
        return this.request(`/api/users/frank/${encodeURIComponent((frankId || '').trim().toUpperCase())}`);
    },

    async createPrivateConversation(targetUserId, frankId) {
        return this.request('/api/users/conversations/private', {
            method: 'POST',
            body: JSON.stringify({
                target_user_id: targetUserId || null,
                frank_id: frankId || null
            })
        });
    },

    async updateMemberRole(groupId, userId, role) {
        return this.request(`/api/groups/${groupId}/members/${userId}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role })
        });
    },

    async deleteGroup(groupId) {
        return this.request(`/api/groups/${groupId}`, {
            method: 'DELETE'
        });
    },

    async removeGroupMember(groupId, userId) {
        return this.request(`/api/groups/${groupId}/members/${userId}`, {
            method: 'DELETE'
        });
    },


    // Document & File Endpoints (supports chunked upload for files > 3MB to bypass serverless/Vercel payload limits)
    async uploadFile(formData, onProgress, onXhrCreated) {
        const file = formData.get('file');
        const CHUNK_SIZE = 3 * 1024 * 1024; // 3 MB chunks (safely below Vercel's 4.5 MB function payload limit)

        if (!file || !(file instanceof Blob) || file.size <= CHUNK_SIZE) {
            return this.uploadDirect(formData, onProgress, onXhrCreated);
        }

        return this.uploadChunked(formData, onProgress, onXhrCreated);
    },

    uploadDirect(formData, onProgress, onXhrCreated) {
        return new Promise((resolve, reject) => {
            const baseUrl = this.baseUrl || API_BASE;
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${baseUrl}/api/files/upload`);

            if (typeof onXhrCreated === 'function') {
                onXhrCreated(xhr);
            }

            const token = this.getToken();
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }

            if (xhr.upload && onProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        onProgress(percent, e.loaded, e.total);
                    }
                });
            }

            xhr.onload = () => {
                let data = null;
                try {
                    data = JSON.parse(xhr.responseText);
                } catch {
                    data = { detail: xhr.responseText || 'Invalid server response' };
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(data);
                } else {
                    let errMsg = `Upload failed with status ${xhr.status}`;
                    if (data && data.detail) {
                        if (typeof data.detail === 'string') {
                            errMsg = data.detail;
                        } else if (Array.isArray(data.detail)) {
                            errMsg = data.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
                        }
                    } else if (xhr.status === 413) {
                        errMsg = 'File is too large. Maximum size is 100 MB.';
                    } else if (xhr.status === 415) {
                        errMsg = 'Unsupported file type.';
                    } else if (xhr.status === 401) {
                        errMsg = 'Your session expired. Please log in again.';
                    } else if (xhr.status === 403) {
                        errMsg = 'You do not have permission to upload this file.';
                    }
                    const err = new Error(errMsg);
                    err.status = xhr.status;
                    err.data = data;
                    reject(err);
                }
            };

            xhr.onerror = () => {
                const err = new Error('Unable to connect to the server. Please check your connection and try again.');
                err.status = 0;
                reject(err);
            };

            xhr.onabort = () => {
                reject(new Error('Upload cancelled.'));
            };

            xhr.send(formData);
        });
    },

    async uploadChunked(formData, onProgress, onXhrCreated) {
        const file = formData.get('file');
        const partnerId = formData.get('partner_id');
        const groupId = formData.get('group_id');
        const duration = formData.get('duration');

        const CHUNK_SIZE = 3 * 1024 * 1024; // 3 MB chunks
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        const uploadId = 'up_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);

        let finalResponse = null;

        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunkBlob = file.slice(start, end);

            const chunkFormData = new FormData();
            chunkFormData.append('chunk', chunkBlob, file.name);
            chunkFormData.append('upload_id', uploadId);
            chunkFormData.append('chunk_index', chunkIndex.toString());
            chunkFormData.append('total_chunks', totalChunks.toString());
            chunkFormData.append('filename', file.name);
            if (partnerId) chunkFormData.append('partner_id', partnerId);
            if (groupId) chunkFormData.append('group_id', groupId);
            if (duration) chunkFormData.append('duration', duration);

            finalResponse = await this.uploadSingleChunk(chunkFormData, (chunkPercent, chunkLoaded, chunkTotal) => {
                if (onProgress) {
                    const totalLoadedSoFar = start + chunkLoaded;
                    const overallPercent = Math.min(99, Math.round((totalLoadedSoFar / file.size) * 100));
                    onProgress(overallPercent, totalLoadedSoFar, file.size);
                }
            }, onXhrCreated);
        }

        if (onProgress) {
            onProgress(100, file.size, file.size);
        }
        return finalResponse;
    },

    uploadSingleChunk(chunkFormData, onChunkProgress, onXhrCreated) {
        return new Promise((resolve, reject) => {
            const baseUrl = this.baseUrl || API_BASE;
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${baseUrl}/api/files/upload-chunk`);

            if (typeof onXhrCreated === 'function') {
                onXhrCreated(xhr);
            }

            const token = this.getToken();
            if (token) {
                xhr.setRequestHeader('Authorization', `Bearer ${token}`);
            }

            if (xhr.upload && onChunkProgress) {
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        const percent = Math.round((e.loaded / e.total) * 100);
                        onChunkProgress(percent, e.loaded, e.total);
                    }
                });
            }

            xhr.onload = () => {
                let data = null;
                try {
                    data = JSON.parse(xhr.responseText);
                } catch {
                    data = { detail: xhr.responseText || 'Invalid server response' };
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(data);
                } else {
                    let errMsg = `Upload failed with status ${xhr.status}`;
                    if (data && data.detail) {
                        if (typeof data.detail === 'string') {
                            errMsg = data.detail;
                        } else if (Array.isArray(data.detail)) {
                            errMsg = data.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
                        }
                    } else if (xhr.status === 413) {
                        errMsg = 'File chunk exceeded server limit. Maximum file size is 100 MB.';
                    } else if (xhr.status === 415) {
                        errMsg = 'Unsupported file type.';
                    } else if (xhr.status === 401) {
                        errMsg = 'Your session expired. Please log in again.';
                    } else if (xhr.status === 403) {
                        errMsg = 'You do not have permission to upload this file.';
                    }
                    const err = new Error(errMsg);
                    err.status = xhr.status;
                    err.data = data;
                    reject(err);
                }
            };

            xhr.onerror = () => {
                const err = new Error('Unable to connect to the server. Please check your connection and try again.');
                err.status = 0;
                reject(err);
            };

            xhr.onabort = () => {
                reject(new Error('Upload cancelled.'));
            };

            xhr.send(chunkFormData);
        });
    },

    getFileViewUrl(fileId) {
        if (!fileId) return '';
        const baseUrl = this.baseUrl || API_BASE;
        const token = this.getToken();
        return `${baseUrl}/api/files/${fileId}/view${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    },

    getFileDownloadUrl(fileId) {
        if (!fileId) return '';
        const baseUrl = this.baseUrl || API_BASE;
        const token = this.getToken();
        return `${baseUrl}/api/files/${fileId}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    },

    async getConversationPreferences() {
        return this.request('/api/users/conversations/preferences');
    },

    async updateConversationPreference(convType, convId, keyOrObj, maybeValue) {
        const payload = {
            conversation_type: convType,
            conversation_id: convId
        };
        if (typeof keyOrObj === 'object') {
            Object.assign(payload, keyOrObj);
        } else {
            payload.key = keyOrObj;
            payload.value = maybeValue;
        }
        return this.request('/api/users/conversations/preferences', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    async deleteDirectConversation(partnerId) {
        return this.request(`/api/users/conversations/direct/${partnerId}`, {
            method: 'DELETE'
        });
    },


    async getFileMetadata(fileId) {
        return this.request(`/api/files/${fileId}`);
    },

    async getConversationDocuments(partnerId) {
        return this.request(`/api/files/conversation/${partnerId}`);
    },

    async getGroupDocuments(groupId) {
        return this.request(`/api/files/group/${groupId}`);
    },

    // ---------------- ADMIN API METHODS ----------------
    async getAdminMetrics() {
        return this.request('/api/admin/metrics');
    },

    async getAdminUsers(params = {}) {
        const query = new URLSearchParams();
        if (params.q) query.set('q', params.q);
        if (params.status) query.set('status', params.status);
        if (params.role) query.set('role', params.role);
        if (params.page) query.set('page', params.page);
        if (params.limit) query.set('limit', params.limit);
        const qs = query.toString();
        return this.request(`/api/admin/users${qs ? `?${qs}` : ''}`);
    },

    async getAdminUserDetails(userId) {
        return this.request(`/api/admin/users/${userId}`);
    },

    async updateAdminUserStatus(userId, status) {
        return this.request(`/api/admin/users/${userId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
    },

    async disableAdminUser(userId) {
        return this.request(`/api/admin/users/${userId}/disable`, {
            method: 'POST'
        });
    },

    async enableAdminUser(userId) {
        return this.request(`/api/admin/users/${userId}/enable`, {
            method: 'POST'
        });
    },

    async deleteAdminUserData(userId) {
        return this.request(`/api/admin/users/${userId}/data`, {
            method: 'DELETE'
        });
    },

    async deleteAdminUserAccount(userId) {
        return this.request(`/api/admin/users/${userId}`, {
            method: 'DELETE'
        });
    },

    async getAdminGroups() {
        return this.request('/api/admin/groups');
    },

    async getAdminAuditLogs(params = {}) {
        const query = new URLSearchParams();
        if (params.page) query.set('page', params.page);
        if (params.limit) query.set('limit', params.limit);
        const qs = query.toString();
        return this.request(`/api/admin/audit-logs${qs ? `?${qs}` : ''}`);
    },

    async getAdminActivity() {
        return this.request('/api/admin/activity');
    },

    // Logout
    logout() {
        this.setToken(null);
        localStorage.removeItem('chatapp_user');
        window.location.href = 'login.html?logout=1';
    }
};

window.api = api;
