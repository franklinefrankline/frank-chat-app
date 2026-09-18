/* -------------------------------------------------------------------------
   CENTRALIZED API CLIENT
   Clean async HTTP requests with JWT authentication, error handling,
   and standard REST endpoints.
   No mock data, no fake fallbacks — 100% backend-driven.
   ------------------------------------------------------------------------- */

const API_BASE = (window.FRANK_CONFIG && window.FRANK_CONFIG.API_BASE)
    ? window.FRANK_CONFIG.API_BASE
    : (window.location.origin.includes(':8000') || window.location.origin.includes(':3000')
        ? window.location.origin
        : 'http://localhost:8000');

const api = {
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
        const token = this.getToken();
        const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

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

            if (!res.ok) {
                const errorMsg = (data && (data.detail || data.message)) || `Request failed with status ${res.status}`;
                const err = new Error(errorMsg);
                err.status = res.status;
                err.data = data;
                throw err;
            }

            return data;
        } catch (error) {
            if (error.status !== undefined) throw error;
            let msg = error.message || 'Unable to connect to server';
            if (msg === 'Failed to fetch' || error.name === 'TypeError') {
                const targetServer = API_BASE || 'http://localhost:8000';
                msg = `Cannot reach the FRANK backend at ${targetServer}. Please make sure your server is running.`;
            }
            const err = new Error(msg);
            err.status = 0;
            throw err;
        }
    },

    // ── Auth ──────────────────────────────────────────────────────────────────
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
        const user = await this.request('/api/auth/me');
        if (user && typeof auth !== 'undefined') {
            if (!user.frank_id || user.frank_id === '------' || String(user.frank_id).trim().length !== 6) {
                user.frank_id = auth.getFrankId(user);
            }
            auth.setUser(user);
        }
        return user;
    },

    async ensureFrankId(preferredId) {
        try {
            const res = await this.request('/api/auth/ensure-frank-id', {
                method: 'POST',
                body: JSON.stringify({ preferred_id: preferredId })
            });
            if (res && res.frank_id && typeof auth !== 'undefined') {
                const user = auth.getUser() || {};
                user.frank_id = res.frank_id;
                auth.setUser(user);
                return res.frank_id;
            }
        } catch (e) {
            console.warn('ensureFrankId sync note:', e);
        }
        return preferredId;
    },

    async verifyEmail(token) {
        return this.request(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
    },

    async resendVerification(email) {
        return this.request('/api/auth/resend-verification', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    },

    async forgotPassword(email) {
        return this.request('/api/auth/forgot-password', {
            method: 'POST',
            body: JSON.stringify({ email })
        });
    },

    async verifyResetToken(token) {
        return this.request(`/api/auth/verify-reset-token?token=${encodeURIComponent(token)}`);
    },

    async resetPassword(token, new_password) {
        return this.request('/api/auth/reset-password', {
            method: 'POST',
            body: JSON.stringify({ token, new_password })
        });
    },

    // ── Users & Contacts ──────────────────────────────────────────────────────
    async getUsers(q = '') {
        const queryParam = q ? `?q=${encodeURIComponent(q)}` : '';
        return this.request(`/api/users${queryParam}`);
    },

    async getUserById(id) {
        return this.request(`/api/users/${id}`);
    },

    async getUserByFrankId(frankId) {
        const cleanId = (frankId || '').toString().trim().toUpperCase();
        return this.request(`/api/users/frank/${encodeURIComponent(cleanId)}`);
    },

    async getUnifiedConversations() {
        return this.request('/api/conversations');
    },

    async getConversationById(id) {
        return this.request(`/api/conversations/${id}`);
    },

    async createPrivateConversation(target) {
        let payload = {};
        if (typeof target === 'object' && target !== null) {
            payload = target;
        } else if (typeof target === 'string' && /^[A-Za-z0-9]{6}$/.test(target.trim())) {
            payload = { frank_id: target.trim().toUpperCase() };
        } else {
            payload = { target_user_id: Number(target) };
        }
        return this.request('/api/conversations/private', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    async getConversations() {
        return this.request('/api/conversations');
    },

    async getSelfConversation() {
        return this.request('/api/conversations/self');
    },

    async createSelfConversation() {
        return this.request('/api/conversations/self', {
            method: 'POST'
        });
    },

    async updateProfile(profileData) {
        return this.request('/api/users/profile', {
            method: 'PUT',
            body: JSON.stringify(profileData)
        });
    },

    // ── Messages ──────────────────────────────────────────────────────────────
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

    // ── Groups ────────────────────────────────────────────────────────────────
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

    async deleteGroup(groupId) {
        return this.request(`/api/groups/${groupId}`, {
            method: 'DELETE'
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

    async updateGroupMemberRole(groupId, userId, role) {
        return this.request(`/api/groups/${groupId}/members/${userId}/role`, {
            method: 'PATCH',
            body: JSON.stringify({ role })
        });
    },

    async removeGroupMember(groupId, userId) {
        return this.request(`/api/groups/${groupId}/members/${userId}`, {
            method: 'DELETE'
        });
    },

    async leaveGroup(groupId) {
        const currentUser = JSON.parse(localStorage.getItem('chatapp_user') || '{}');
        return this.removeGroupMember(groupId, currentUser.id);
    },

    // ── Files ─────────────────────────────────────────────────────────────────
    uploadFile(formData, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${API_BASE}/api/files/upload`);

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
                let data;
                try {
                    data = JSON.parse(xhr.responseText);
                } catch {
                    data = { detail: 'Invalid server response' };
                }

                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(data);
                } else {
                    reject(new Error(data.detail || `Upload failed with status ${xhr.status}`));
                }
            };

            xhr.onerror = () => {
                reject(new Error('Network error during file upload. Please check your connection.'));
            };

            xhr.send(formData);
        });
    },

    getFileViewUrl(fileId) {
        const token = this.getToken();
        return `${API_BASE}/api/files/${fileId}/view${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    },

    getFileDownloadUrl(fileId) {
        const token = this.getToken();
        return `${API_BASE}/api/files/${fileId}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    },

    async downloadFileBlob(fileId, filename = 'document') {
        const downloadUrl = this.getFileDownloadUrl(fileId);
        try {
            const token = this.getToken();
            const headers = {};
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const res = await fetch(downloadUrl, { headers });
            if (!res.ok) {
                throw new Error(`Download failed with status ${res.status}`);
            }
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = objectUrl;
            a.download = filename || 'document';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                try {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(objectUrl);
                } catch (e) {}
            }, 1500);
            if (typeof showToast === 'function') {
                showToast(`Downloading ${filename || 'file'}...`, 'info', 1800);
            }
            return true;
        } catch (err) {
            console.warn('downloadFileBlob fetch fallback:', err);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = downloadUrl;
            a.download = filename || 'document';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                try { document.body.removeChild(a); } catch (e) {}
            }, 1500);
            if (typeof showToast === 'function') {
                showToast(`Downloading ${filename || 'file'}...`, 'info', 1800);
            }
            return true;
        }
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

    // ── Auth: Logout ──────────────────────────────────────────────────────────
    logout() {
        this.setToken(null);
        localStorage.removeItem('chatapp_user');
        window.location.href = 'login.html?logout=1';
    }
};

window.api = api;
