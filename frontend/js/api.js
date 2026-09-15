/* -------------------------------------------------------------------------
   CENTRALIZED API CLIENT
   Clean async HTTP requests with token injection, error handling, and timeout
   ------------------------------------------------------------------------- */

const API_BASE = (window.FRANK_CONFIG && window.FRANK_CONFIG.API_BASE)
    ? window.FRANK_CONFIG.API_BASE
    : (window.location.origin.includes(':8000') || window.location.origin.includes(':3000')
        ? window.location.origin
        : 'http://localhost:8000');

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

            if (!res.ok) {
                const errorMsg = (data && (data.detail || data.message)) || `Request failed with status ${res.status}`;
                const err = new Error(errorMsg);
                err.status = res.status;
                err.data = data;
                throw err;
            }

            return data;
        } catch (error) {
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

    async removeGroupMember(groupId, userId) {
        return this.request(`/api/groups/${groupId}/members/${userId}`, {
            method: 'DELETE'
        });
    },

    // Document & File Endpoints
    uploadFile(formData, onProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', `${this.baseUrl}/api/files/upload`);

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
                reject(new Error('Network error occurred during file upload'));
            };

            xhr.send(formData);
        });
    },

    getFileViewUrl(fileId) {
        const token = this.getToken();
        return `${this.baseUrl}/api/files/${fileId}/view${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    },

    getFileDownloadUrl(fileId) {
        const token = this.getToken();
        return `${this.baseUrl}/api/files/${fileId}/download${token ? `?token=${encodeURIComponent(token)}` : ''}`;
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

    // Logout
    logout() {
        this.setToken(null);
        localStorage.removeItem('chatapp_user');
        window.location.href = 'login.html?logout=1';
    }
};

window.api = api;
