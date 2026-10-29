/**
 * FRANK Think — Android Share Menu & Web Share Target Integration
 * 
 * Handles incoming content from:
 * 1. Native Android Sharesheet (ACTION_SEND & ACTION_SEND_MULTIPLE via FrankShareTarget Capacitor plugin)
 * 2. Window events (frank:filesShared) and globals (window.frankPendingSharedFiles)
 * 3. Web Share Target API / PWA manifest POST/GET parameters
 * 4. Auth persistence across cold/warm starts and login transitions
 */

(function() {
    'use strict';

    class FrankShareTarget {
        constructor() {
            this.currentShare = null;
            this.selectedRecipient = null;
            this.conversations = [];
            this.isUploading = false;
            this.currentXhr = null;
            this.initialized = false;
        }

        init() {
            if (this.initialized) return;
            this.initialized = true;

            // 1. Listen for custom window events dispatched by native code or tests
            window.addEventListener('frank:filesShared', (e) => {
                if (e.detail) {
                    this.handleIncomingPayload(e.detail);
                }
            });

            // 2. Check for global payload injected by native WebView hook
            if (window.frankPendingSharedFiles) {
                const payload = window.frankPendingSharedFiles;
                window.frankPendingSharedFiles = null;
                this.handleIncomingPayload(payload);
            }

            // 3. Check for stored pending share across page navigation / login redirect
            try {
                const saved = sessionStorage.getItem('frank_pending_share');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed && (parsed.hasFiles || (parsed.files && parsed.files.length > 0) || parsed.caption)) {
                        this.handleIncomingPayload(parsed, true);
                    }
                }
            } catch (err) {
                console.warn('[ShareTarget] Error reading pending share from sessionStorage:', err);
            }

            // 4. Query Capacitor Plugin if available
            this.checkCapacitorPlugin();

            // 5. Handle Web Share Target query parameters if applicable
            this.checkWebShareParams();

            // 6. If on login page, display notice if pending share exists
            this.checkLoginNotice();
        }

        async checkCapacitorPlugin() {
            if (!window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.FrankShareTarget) {
                return;
            }

            try {
                const plugin = window.Capacitor.Plugins.FrankShareTarget;

                // Listen for future share events while app is running (warm start)
                if (typeof plugin.addListener === 'function') {
                    plugin.addListener('filesShared', (data) => {
                        if (data) {
                            this.handleIncomingPayload(data);
                        }
                    });
                }

                // Check initial cold-start share
                if (typeof plugin.getSharedFiles === 'function') {
                    const res = await plugin.getSharedFiles();
                    if (res && res.hasFiles) {
                        this.handleIncomingPayload(res);
                    }
                }
            } catch (err) {
                console.warn('[ShareTarget] Capacitor plugin check error:', err);
            }
        }

        checkWebShareParams() {
            try {
                const params = new URLSearchParams(window.location.search);
                const title = params.get('share_title') || params.get('title');
                const text = params.get('share_text') || params.get('text');
                const url = params.get('share_url') || params.get('url');

                if (title || text || url) {
                    const caption = [title, text, url].filter(Boolean).join('\n');
                    this.handleIncomingPayload({
                        hasFiles: false,
                        files: [],
                        caption: caption,
                        action: 'web_share'
                    });
                }
            } catch (ignored) {}
        }

        checkLoginNotice() {
            const isLoginPage = window.location.pathname.includes('login') || document.getElementById('loginForm');
            if (!isLoginPage) return;

            try {
                const saved = sessionStorage.getItem('frank_pending_share');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    const fileCount = (parsed.files && parsed.files.length) || 0;
                    const noticeEl = document.getElementById('shareLoginNotice');
                    if (!noticeEl) {
                        const banner = document.createElement('div');
                        banner.id = 'shareLoginNotice';
                        banner.style.cssText = 'margin-bottom: 16px; padding: 12px 16px; background: rgba(37, 99, 235, 0.1); border: 1px solid rgba(37, 99, 235, 0.3); border-radius: 12px; color: var(--text, #f8fafc); font-size: 13px; line-height: 1.5; display: flex; align-items: center; gap: 10px;';
                        banner.innerHTML = `
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                            <div><strong>${fileCount > 0 ? `${fileCount} shared item(s) waiting` : 'Shared message waiting'}</strong><br>Sign in to select a recipient and complete sharing.</div>
                        `;
                        const form = document.getElementById('loginForm') || document.querySelector('form');
                        if (form && form.parentNode) {
                            form.parentNode.insertBefore(banner, form);
                        }
                    }
                }
            } catch (ignored) {}
        }

        handleIncomingPayload(payload, fromStorage = false) {
            if (!payload) return;
            const files = payload.files || [];
            const caption = payload.caption || '';

            if (files.length === 0 && !caption.trim()) {
                return;
            }

            const isAuth = typeof auth !== 'undefined' && auth.isAuthenticated && auth.isAuthenticated();

            // If not authenticated, store payload in sessionStorage and redirect to login
            if (!isAuth) {
                try {
                    sessionStorage.setItem('frank_pending_share', JSON.stringify(payload));
                } catch (e) {
                    console.error('[ShareTarget] Failed saving to sessionStorage:', e);
                }

                const isLoginPage = window.location.pathname.includes('login') || document.getElementById('loginForm');
                if (!isLoginPage) {
                    window.location.href = 'login.html';
                } else {
                    this.checkLoginNotice();
                }
                return;
            }

            // User is authenticated!
            // If on login or index page, redirect to dashboard.html while preserving share payload
            const isDashboard = window.location.pathname.includes('dashboard') || !!document.getElementById('chatApp');
            if (!isDashboard) {
                try {
                    sessionStorage.setItem('frank_pending_share', JSON.stringify(payload));
                } catch (e) {}
                window.location.href = 'dashboard.html';
                return;
            }

            // On dashboard! Open share modal
            this.currentShare = {
                files: files,
                caption: caption,
                action: payload.action || 'android_share'
            };

            // Remove from sessionStorage once picked up
            sessionStorage.removeItem('frank_pending_share');

            // Also clear native plugin pending state so it doesn't re-trigger on subsequent cold reloads
            if (!fromStorage && window.Capacitor?.Plugins?.FrankShareTarget?.clearSharedFiles) {
                window.Capacitor.Plugins.FrankShareTarget.clearSharedFiles().catch(() => {});
            }

            this.openModal();
        }

        formatSize(bytes) {
            if (!bytes || bytes <= 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

        getFileIcon(mimeType, filename) {
            const ext = (filename || '').split('.').pop().toLowerCase();
            if (mimeType && mimeType.startsWith('image/')) {
                return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
            }
            if ((mimeType && mimeType.startsWith('video/')) || ['mp4', 'mov', 'webm', 'mkv'].includes(ext)) {
                return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
            }
            if ((mimeType && mimeType.startsWith('audio/')) || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) {
                return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>`;
            }
            if ((mimeType && mimeType.includes('pdf')) || ext === 'pdf') {
                return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
            }
            return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
        }

        ensureModalInDom() {
            let modal = document.getElementById('frankShareTargetModal');
            if (modal) return modal;

            modal = document.createElement('div');
            modal.id = 'frankShareTargetModal';
            modal.className = 'modal-backdrop';
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.setAttribute('aria-labelledby', 'frankShareTargetTitle');

            modal.innerHTML = `
                <div class="modal-card share-modal-card">
                    <div class="modal-header">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <div style="width: 32px; height: 32px; border-radius: 10px; background: rgba(37, 99, 235, 0.12); color: var(--primary); display: flex; align-items: center; justify-content: center;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                            </div>
                            <div>
                                <h2 class="modal-title" id="frankShareTargetTitle" style="font-size: 16px; font-weight: 800;">Share to FRANK Think</h2>
                                <div style="font-size: 11px; color: var(--text-muted);">Choose a conversation to share your files</div>
                            </div>
                        </div>
                        <button type="button" class="modal-close" id="frankShareCloseBtn" aria-label="Close share dialog">&times;</button>
                    </div>

                    <div class="share-modal-body">
                        <!-- Attachment Previews -->
                        <div class="share-preview-section" id="sharePreviewSection">
                            <div class="share-preview-header">
                                <span id="shareItemsCountLabel">Attachments</span>
                                <span id="shareTotalSizeLabel" style="font-weight: 500;">0 B</span>
                            </div>
                            <div id="sharePreviewContainer"></div>
                        </div>

                        <!-- Caption / Message -->
                        <div class="share-caption-box">
                            <label class="share-caption-label" for="shareCaptionInput">Message Caption (Optional)</label>
                            <textarea id="shareCaptionInput" class="share-caption-input" placeholder="Add a caption or comment..."></textarea>
                        </div>

                        <!-- Recipient Selection -->
                        <div class="share-recipient-section">
                            <div class="share-recipient-label">
                                <span>Send To</span>
                                <span id="shareSelectedRecipientBadge" style="color: var(--primary); font-weight: 700; text-transform: none;"></span>
                            </div>
                            <input type="text" id="shareRecipientSearchInput" class="share-search-input" placeholder="Search conversations or groups...">
                            <div class="share-conversations-list" id="shareConversationsList">
                                <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
                                    Loading conversations...
                                </div>
                            </div>
                        </div>

                        <!-- Upload Progress Display -->
                        <div class="share-progress-container" id="shareProgressContainer">
                            <div class="share-progress-label">
                                <span id="shareProgressText">Uploading...</span>
                                <span id="shareProgressPercent">0%</span>
                            </div>
                            <div class="share-progress-track">
                                <div class="share-progress-fill" id="shareProgressFill"></div>
                            </div>
                        </div>
                    </div>

                    <div class="share-modal-footer">
                        <button type="button" class="btn btn-secondary" id="frankShareCancelBtn">Cancel</button>
                        <button type="button" class="btn btn-primary" id="frankShareSendBtn" disabled style="min-width: 160px; font-weight: 700;">
                            Select Recipient
                        </button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            // Bind Events
            const closeBtn = modal.querySelector('#frankShareCloseBtn');
            const cancelBtn = modal.querySelector('#frankShareCancelBtn');
            const sendBtn = modal.querySelector('#frankShareSendBtn');
            const searchInput = modal.querySelector('#shareRecipientSearchInput');

            if (closeBtn) closeBtn.addEventListener('click', () => this.cancel());
            if (cancelBtn) cancelBtn.addEventListener('click', () => this.cancel());
            if (sendBtn) sendBtn.addEventListener('click', () => this.send());
            if (searchInput) {
                searchInput.addEventListener('input', (e) => this.filterConversations(e.target.value));
            }

            return modal;
        }

        async openModal() {
            if (!this.currentShare) return;

            const modal = this.ensureModalInDom();
            this.selectedRecipient = null;
            this.isUploading = false;

            const cancelBtn = document.getElementById('frankShareCancelBtn');
            if (cancelBtn) cancelBtn.disabled = false;

            // Reset progress container
            const progressContainer = document.getElementById('shareProgressContainer');
            if (progressContainer) {
                progressContainer.classList.remove('active');
            }
            const progressFill = document.getElementById('shareProgressFill');
            if (progressFill) progressFill.style.width = '0%';

            // Populate Caption
            const captionInput = document.getElementById('shareCaptionInput');
            if (captionInput) {
                captionInput.value = this.currentShare.caption || '';
                captionInput.disabled = false;
            }

            // Populate Previews
            this.renderPreviews();

            // Populate Send Button Initial State
            this.updateSendButtonState();

            // Load and Render Conversations
            await this.loadConversations();

            // Open Modal using accessible modal system
            if (typeof openModal === 'function') {
                openModal('frankShareTargetModal');
            } else {
                modal.classList.add('open');
                document.body.style.overflow = 'hidden';
            }
        }

        renderPreviews() {
            const container = document.getElementById('sharePreviewContainer');
            const countLabel = document.getElementById('shareItemsCountLabel');
            const sizeLabel = document.getElementById('shareTotalSizeLabel');
            if (!container) return;

            const files = this.currentShare.files || [];
            let totalBytes = 0;
            files.forEach(f => { totalBytes += (f.size || 0); });

            if (countLabel) {
                countLabel.textContent = files.length === 1 ? '1 Attachment' : `${files.length} Attachments`;
            }
            if (sizeLabel) {
                sizeLabel.textContent = this.formatSize(totalBytes);
            }

            if (files.length === 0) {
                // Text-only share
                container.innerHTML = `
                    <div style="padding: 12px; font-size: 13px; color: var(--text-muted); font-style: italic;">
                        Shared message / text
                    </div>
                `;
                return;
            }

            if (files.length === 1) {
                // Single Item layout
                const file = files[0];
                const isImg = file.mimeType && file.mimeType.startsWith('image/');
                container.innerHTML = `
                    <div class="share-single-preview">
                        ${isImg && file.dataUrl ? `
                            <img src="${file.dataUrl}" alt="${file.name}" class="share-single-thumb">
                        ` : `
                            <div class="share-preview-file-icon" style="width: 52px; height: 52px; border-radius: 12px;">
                                ${this.getFileIcon(file.mimeType, file.name)}
                            </div>
                        `}
                        <div class="share-single-info">
                            <div class="share-single-name" title="${file.name}">${file.name}</div>
                            <div class="share-single-meta">${this.formatSize(file.size)} &bull; ${file.mimeType || 'file'}</div>
                        </div>
                    </div>
                `;
                return;
            }

            // Multiple items horizontal scroll strip
            let cardsHtml = '';
            files.forEach(file => {
                const isImg = file.mimeType && file.mimeType.startsWith('image/');
                cardsHtml += `
                    <div class="share-preview-card">
                        <div class="share-preview-thumb-box">
                            ${isImg && file.dataUrl ? `
                                <img src="${file.dataUrl}" alt="${file.name}" class="share-preview-thumb-img">
                            ` : `
                                <div class="share-preview-file-icon">
                                    ${this.getFileIcon(file.mimeType, file.name)}
                                </div>
                            `}
                        </div>
                        <div class="share-preview-info">
                            <div class="share-preview-name" title="${file.name}">${file.name}</div>
                            <div class="share-preview-meta">${this.formatSize(file.size)}</div>
                        </div>
                    </div>
                `;
            });

            container.innerHTML = `<div class="share-preview-grid">${cardsHtml}</div>`;
        }

        async loadConversations() {
            const listEl = document.getElementById('shareConversationsList');
            if (!listEl) return;

            listEl.innerHTML = `
                <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
                    <div class="spinner" style="margin: 0 auto 8px;"></div>
                    Loading conversations...
                </div>
            `;

            try {
                let convs = [];
                if (window.appController && window.appController.conversations && window.appController.conversations.length > 0) {
                    convs = window.appController.conversations;
                } else if (typeof api !== 'undefined' && typeof api.getConversations === 'function') {
                    convs = await api.getConversations();
                }

                this.conversations = convs || [];
                this.renderConversations(this.conversations);
            } catch (err) {
                console.error('[ShareTarget] Error loading conversations:', err);
                listEl.innerHTML = `
                    <div style="padding: 16px; text-align: center; color: var(--danger, #ef4444); font-size: 13px;">
                        Failed to load conversations.
                        <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 8px;" onclick="window.frankShareTarget.loadConversations()">Retry</button>
                    </div>
                `;
            }
        }

        renderConversations(convList) {
            const listEl = document.getElementById('shareConversationsList');
            if (!listEl) return;

            if (!convList || convList.length === 0) {
                listEl.innerHTML = `
                    <div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px;">
                        No conversations found.
                    </div>
                `;
                return;
            }

            let html = '';
            convList.forEach(conv => {
                const isGroup = conv.type === 'group';
                const isSelf = conv.is_self || conv.id === 'self' || conv.name === 'Message Yourself' || conv.title === 'Message Yourself';
                const name = conv.display_name || conv.title || conv.name || (isGroup ? 'Group Chat' : 'Conversation');
                const avatar = conv.avatar || conv.photo_url || '';
                const subtitle = isSelf ? 'Personal notes & drafts' : (isGroup ? `Group &bull; ${conv.member_count || conv.members_count || 2} members` : (conv.username ? `@${conv.username}` : 'Direct chat'));
                const isSelected = this.selectedRecipient && String(this.selectedRecipient.id) === String(conv.id) && this.selectedRecipient.type === conv.type;

                html += `
                    <div class="share-conversation-item ${isSelected ? 'selected' : ''}" 
                         data-id="${conv.id}" 
                         data-type="${conv.type || 'direct'}" 
                         data-name="${this.escapeHtml(name)}">
                        <div class="share-item-avatar">
                            ${avatar ? `<img src="${avatar}" alt="${this.escapeHtml(name)}">` : name.charAt(0).toUpperCase()}
                        </div>
                        <div class="share-item-content">
                            <div class="share-item-title">${this.escapeHtml(name)}</div>
                            <div class="share-item-subtitle">${subtitle}</div>
                        </div>
                        <div class="share-item-radio"></div>
                    </div>
                `;
            });

            listEl.innerHTML = html;

            // Bind item click handlers
            listEl.querySelectorAll('.share-conversation-item').forEach(item => {
                item.addEventListener('click', () => {
                    const id = item.dataset.id;
                    const type = item.dataset.type;
                    const name = item.dataset.name;
                    this.selectRecipient({ id, type, name });
                });
            });
        }

        filterConversations(query) {
            const q = (query || '').toLowerCase().trim();
            if (!q) {
                this.renderConversations(this.conversations);
                return;
            }

            const filtered = this.conversations.filter(c => {
                const name = (c.display_name || c.title || c.name || '').toLowerCase();
                const user = (c.username || '').toLowerCase();
                return name.includes(q) || user.includes(q);
            });

            this.renderConversations(filtered);
        }

        selectRecipient(recipient) {
            this.selectedRecipient = recipient;

            // Update UI selected classes
            const listEl = document.getElementById('shareConversationsList');
            if (listEl) {
                listEl.querySelectorAll('.share-conversation-item').forEach(el => {
                    const isMatch = el.dataset.id === String(recipient.id) && el.dataset.type === recipient.type;
                    el.classList.toggle('selected', isMatch);
                });
            }

            const badge = document.getElementById('shareSelectedRecipientBadge');
            if (badge) {
                badge.textContent = `&rarr; ${recipient.name}`;
            }

            this.updateSendButtonState();
        }

        updateSendButtonState() {
            const sendBtn = document.getElementById('frankShareSendBtn');
            if (!sendBtn) return;

            if (this.isUploading) {
                sendBtn.disabled = true;
                sendBtn.textContent = 'Uploading...';
                return;
            }

            if (!this.selectedRecipient) {
                sendBtn.disabled = true;
                sendBtn.textContent = 'Select a conversation';
                return;
            }

            sendBtn.disabled = false;
            const files = (this.currentShare && this.currentShare.files) || [];
            if (files.length > 1) {
                sendBtn.textContent = `Send ${files.length} items to ${this.selectedRecipient.name}`;
            } else {
                sendBtn.textContent = `Send to ${this.selectedRecipient.name}`;
            }
        }

        dataUrlToFile(dataUrl, fileName, mimeType) {
            try {
                if (!dataUrl || !dataUrl.includes(',')) return null;
                const arr = dataUrl.split(',');
                const mimeMatch = arr[0].match(/:(.*?);/);
                const mime = mimeType || (mimeMatch ? mimeMatch[1] : 'application/octet-stream');
                const bstr = atob(arr[1]);
                let n = bstr.length;
                const u8arr = new Uint8Array(n);
                while (n--) {
                    u8arr[n] = bstr.charCodeAt(n);
                }
                return new File([u8arr], fileName, { type: mime });
            } catch (err) {
                console.error('[ShareTarget] dataUrlToFile conversion error:', err);
                return null;
            }
        }

        getFileCategory(filename, mimeType) {
            const ext = '.' + (filename || '').split('.').pop().toLowerCase();
            if (mimeType && mimeType.startsWith('image/')) return 'image';
            if (mimeType && mimeType.startsWith('video/')) return 'video';
            if (mimeType && mimeType.startsWith('audio/')) return 'audio';
            if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) return 'image';
            if (['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) return 'video';
            if (['.mp3', '.wav', '.ogg', '.m4a', '.aac'].includes(ext)) return 'audio';
            return 'document';
        }

        async send() {
            if (!this.selectedRecipient || !this.currentShare || this.isUploading) {
                return;
            }

            this.isUploading = true;
            this.updateSendButtonState();

            const cancelBtn = document.getElementById('frankShareCancelBtn');
            if (cancelBtn) cancelBtn.disabled = true;

            const progressContainer = document.getElementById('shareProgressContainer');
            const progressFill = document.getElementById('shareProgressFill');
            const progressText = document.getElementById('shareProgressText');
            const progressPercent = document.getElementById('shareProgressPercent');

            if (progressContainer) progressContainer.classList.add('active');

            const captionInput = document.getElementById('shareCaptionInput');
            const finalCaption = captionInput ? captionInput.value.trim() : '';

            const files = this.currentShare.files || [];
            const recipient = this.selectedRecipient;

            try {
                if (files.length === 0) {
                    // Send text-only message
                    if (progressText) progressText.textContent = 'Sending message...';
                    if (progressFill) progressFill.style.width = '100%';

                    if (window.wsClient && window.wsClient.isConnected) {
                        window.wsClient.send({
                            type: 'message',
                            recipient_id: recipient.type === 'direct' ? recipient.id : null,
                            group_id: recipient.type === 'group' ? recipient.id : null,
                            content: finalCaption || 'Shared text',
                            message_type: 'text'
                        });
                    } else if (typeof api !== 'undefined' && typeof api.sendMessage === 'function') {
                        const newMsg = await api.sendMessage({
                            recipient_id: recipient.type === 'direct' ? recipient.id : null,
                            group_id: recipient.type === 'group' ? recipient.id : null,
                            content: finalCaption || 'Shared text',
                            message_type: 'text'
                        });
                        if (window.chatController && typeof window.chatController.appendMessage === 'function') {
                            const currentUser = typeof auth !== 'undefined' ? auth.getUser() : null;
                            window.chatController.appendMessage(newMsg, currentUser ? currentUser.id : null);
                        }
                    }
                } else {
                    // Upload each file and dispatch chat message
                    for (let i = 0; i < files.length; i++) {
                        const fileData = files[i];
                        const fileObj = this.dataUrlToFile(fileData.dataUrl, fileData.name, fileData.mimeType);

                        if (!fileObj) {
                            throw new Error(`Could not prepare file: ${fileData.name}`);
                        }

                        if (progressText) progressText.textContent = `Uploading ${i + 1} of ${files.length}: ${fileData.name}...`;

                        const formData = new FormData();
                        formData.append('file', fileObj);
                        if (recipient.type === 'direct') {
                            formData.append('partner_id', recipient.id);
                        } else if (recipient.type === 'group') {
                            formData.append('group_id', recipient.id);
                        }

                        const uploadedDoc = await api.uploadFile(formData, (percent) => {
                            const overall = Math.round(((i / files.length) * 100) + (percent / files.length));
                            if (progressFill) progressFill.style.width = `${overall}%`;
                            if (progressPercent) progressPercent.textContent = `${overall}%`;
                        }, (xhr) => {
                            this.currentXhr = xhr;
                        });

                        const category = this.getFileCategory(fileData.name, fileData.mimeType);
                        let messageType = 'document';
                        if (category === 'image') messageType = 'image';
                        else if (category === 'video') messageType = 'video';
                        else if (category === 'audio') messageType = 'audio';

                        // Caption applies to first file or if single file; otherwise standard file share text
                        let contentText = `Shared a file: ${uploadedDoc.original_filename}`;
                        if (i === 0 && finalCaption) {
                            contentText = finalCaption;
                        }

                        if (window.wsClient && window.wsClient.isConnected) {
                            window.wsClient.send({
                                type: 'message',
                                recipient_id: recipient.type === 'direct' ? recipient.id : null,
                                group_id: recipient.type === 'group' ? recipient.id : null,
                                content: contentText,
                                message_type: messageType,
                                file_id: uploadedDoc.id,
                                filename: uploadedDoc.original_filename
                            });
                        } else if (typeof api !== 'undefined' && typeof api.sendMessage === 'function') {
                            const newMsg = await api.sendMessage({
                                recipient_id: recipient.type === 'direct' ? recipient.id : null,
                                group_id: recipient.type === 'group' ? recipient.id : null,
                                content: contentText,
                                message_type: messageType,
                                file_id: uploadedDoc.id
                            });
                            if (window.chatController && typeof window.chatController.appendMessage === 'function') {
                                const currentUser = typeof auth !== 'undefined' ? auth.getUser() : null;
                                window.chatController.appendMessage(newMsg, currentUser ? currentUser.id : null);
                            }
                        }
                    }
                }

                // Share Successful!
                if (progressFill) progressFill.style.width = '100%';
                if (progressPercent) progressPercent.textContent = '100%';
                if (progressText) progressText.textContent = 'Sent!';

                if (typeof showToast === 'function') {
                    showToast(files.length > 1 ? `${files.length} items shared successfully!` : 'Shared successfully!', 'success');
                }

                // Switch to recipient conversation
                if (window.chatController) {
                    if (recipient.type === 'group') {
                        window.chatController.openGroupChat({ id: recipient.id, title: recipient.name, name: recipient.name });
                    } else {
                        window.chatController.openDirectChat({ id: recipient.id, display_name: recipient.name, name: recipient.name });
                    }
                }

                // Refresh conversation list to show latest message preview
                if (window.appController && typeof window.appController.loadConversations === 'function') {
                    window.appController.loadConversations(false);
                }

                // Cleanup and Close Modal
                this.cleanup();
                this.closeModal();

            } catch (err) {
                console.error('[ShareTarget] Upload / Send error:', err);
                this.isUploading = false;
                this.updateSendButtonState();
                if (cancelBtn) cancelBtn.disabled = false;
                if (progressText) {
                    progressText.textContent = `Failed: ${err.message || 'Error occurred'}`;
                    progressText.style.color = 'var(--danger, #ef4444)';
                }
                if (typeof showToast === 'function') {
                    showToast(`Share failed: ${err.message || 'Please try again'}`, 'error');
                }
            }
        }

        cancel() {
            if (this.isUploading && this.currentXhr) {
                try {
                    this.currentXhr.abort();
                } catch (ignored) {}
            }
            this.cleanup();
            this.closeModal();
        }

        cleanup() {
            this.currentShare = null;
            this.selectedRecipient = null;
            this.isUploading = false;
            this.currentXhr = null;
            sessionStorage.removeItem('frank_pending_share');

            const cancelBtn = document.getElementById('frankShareCancelBtn');
            if (cancelBtn) cancelBtn.disabled = false;

            if (window.Capacitor?.Plugins?.FrankShareTarget?.clearSharedFiles) {
                window.Capacitor.Plugins.FrankShareTarget.clearSharedFiles().catch(() => {});
            }
        }

        closeModal() {
            const modal = document.getElementById('frankShareTargetModal');
            if (modal) {
                modal.classList.remove('open', 'active', 'show');
            }
            if (typeof window.closeModal === 'function') {
                try {
                    window.closeModal('frankShareTargetModal');
                } catch (e) {}
            }
            document.body.style.overflow = '';
        }

        escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }
    }

    // Export singleton
    window.frankShareTarget = new FrankShareTarget();

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => window.frankShareTarget.init());
    } else {
        window.frankShareTarget.init();
    }

})();

