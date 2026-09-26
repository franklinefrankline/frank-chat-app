/* -------------------------------------------------------------------------
   FRANK - ACTIVE CHAT CONTROLLER
   Conversation lifecycle, real-time message stream, group chat support,
   document attachments, independent scrolling, drawer details & search
   ------------------------------------------------------------------------- */

class ChatController {
    constructor() {
        this.activeType = null; // 'direct' or 'group'
        this.activeId = null;   // partnerId or groupId
        this.activePartner = null;
        this.replyTo = null;    // { id, sender, content }
        this.typingTimeout = null;
        this.activeMessages = [];

        this.dom = {
            emptyPlaceholder: document.getElementById('emptyChatPlaceholder'),
            activeChatView: document.getElementById('activeChatView'),
            messagesContainer: document.getElementById('messagesContainer'),
            partnerName: document.getElementById('chatPartnerName'),
            partnerPresence: document.getElementById('chatPartnerPresenceText'),
            partnerInitials: document.getElementById('chatPartnerInitials'),
            partnerStatusDot: document.getElementById('chatPartnerStatusDot'),
            typingBox: document.getElementById('typingIndicatorBox'),
            typingUserText: document.getElementById('typingUserText'),
            textarea: document.getElementById('messageComposerTextarea'),
            sendBtn: document.getElementById('composerSendBtn'),
            micBtn: document.getElementById('composerMicBtn'),
            emojiBtn: document.getElementById('emojiBtn'),
            emojiPopover: document.getElementById('emojiPickerPopover'),
            emojiGrid: document.getElementById('emojiPickerGrid'),
            attachmentBtn: document.getElementById('attachmentBtn'),
            attachmentPopover: document.getElementById('attachmentPopover'),
            replyStrip: document.getElementById('composerReplyStrip'),
            replySender: document.getElementById('replySenderName'),
            replyText: document.getElementById('replyPreviewText'),
            cancelReplyBtn: document.getElementById('cancelReplyBtn'),
            mobileBackBtn: document.getElementById('mobileBackBtn'),
            chatSearchBtn: document.getElementById('chatSearchBtn'),
            chatSearchBar: document.getElementById('chatSearchBar'),
            chatSearchInput: document.getElementById('chatSearchInput'),
            closeChatSearchBtn: document.getElementById('closeChatSearchBtn'),
            toggleDrawerBtn: document.getElementById('toggleDrawerBtn'),
            chatMoreBtn: document.getElementById('chatMoreBtn'),
            chatMoreMenu: document.getElementById('chatMoreMenu'),
            detailsDrawer: document.getElementById('detailsDrawer'),
            closeDrawerBtn: document.getElementById('closeDrawerBtn'),
            editStrip: document.getElementById('composerEditStrip'),
            composerEditText: document.getElementById('composerEditText'),
            cancelEditBtn: document.getElementById('cancelEditBtn'),
            saveEditBtn: document.getElementById('saveEditBtn'),
            moreFavoriteBtn: document.getElementById('moreFavoriteBtn'),
            moreFavoriteText: document.getElementById('moreFavoriteText'),
            moreDeleteChatBtn: document.getElementById('moreDeleteChatBtn')
        };

        this.editingMessageId = null;
        this.init();
    }

    init() {
        this.setupComposer();
        this.setupEmojiPicker();
        this.setupAttachments();
        this.setupMobileBack();
        this.setupDrawer();
        this.setupChatSearch();
        this.setupHeaderMoreMenu();
        this.setupContextMenuDismissal();
        this.setupWebSocketListeners();
        this.setupPollingFallback();
    }

    setupContextMenuDismissal() {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#activeMessageContextMenu') && !e.target.closest('.msg-action-more-btn, .bubble-more-trigger')) {
                this.closeMessageContextMenu();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeMessageContextMenu();
            }
        });
    }

    // ---------------- DIRECT CHAT SELECTION ----------------
    async openDirectChat(partner) {
        this.activeType = 'direct';
        this.activeId = partner.id;
        this.activePartner = partner;
        this.clearReplying();
        this.cancelEditing();
        this.closeMoreMenu();
        this.updateMoreMenu('direct');
        if (window.documentsController) window.documentsController.clearStagedFile();
        if (window.voiceRecorder) window.voiceRecorder.cancelRecording();
        this.updateComposerActionButton();

        const currentUser = auth.getUser();
        const isSelf = currentUser && Number(partner.id) === Number(currentUser.id);

        // Update Header UI
        if (this.dom.partnerName) {
            this.dom.partnerName.textContent = isSelf
                ? `${currentUser.full_name || currentUser.username} (You)`
                : (partner.name || partner.full_name || partner.username);
        }
        if (this.dom.partnerInitials) {
            const name = isSelf ? (currentUser.full_name || currentUser.username || 'ME') : (partner.name || partner.full_name || partner.username || '??');
            this.dom.partnerInitials.textContent = isSelf ? '📝' : name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        }

        const isOnline = isSelf ? true : !!partner.is_online;
        if (this.dom.partnerPresence) {
            if (isSelf) {
                this.dom.partnerPresence.textContent = 'Message yourself • Notes & bookmarks';
                this.dom.partnerPresence.className = 'chat-partner-presence online';
            } else {
                this.dom.partnerPresence.textContent = isOnline ? 'Online' : (partner.last_seen ? `Last seen ${messagesModule.formatRelativeTime(partner.last_seen)}` : 'Offline');
                this.dom.partnerPresence.className = `chat-partner-presence ${isOnline ? 'online' : ''}`;
            }
        }
        if (this.dom.partnerStatusDot) {
            this.dom.partnerStatusDot.style.display = 'block';
            this.dom.partnerStatusDot.className = `avatar-status ${isOnline ? 'online' : 'offline'}`;
        }

        // Show Active Chat, Hide Placeholder
        if (this.dom.emptyPlaceholder) this.dom.emptyPlaceholder.style.display = 'none';
        if (this.dom.activeChatView) this.dom.activeChatView.style.display = 'flex';

        // Update details drawer
        this.updateDetailsDrawer(partner);

        // Mobile responsive switch
        if (window.innerWidth <= 768) {
            document.getElementById('chatApp')?.classList.add('has-active-chat');
            document.getElementById('chatWindow')?.classList.add('mobile-open');
            const panel = document.getElementById('conversationPanel');
            if (panel) {
                panel.style.display = '';
            }
        }

        // Highlight active conversation card in list
        document.querySelectorAll('.conversation-card').forEach(card => {
            card.classList.toggle('active', card.dataset.id == partner.id && card.dataset.type !== 'group');
        });

        // Load Messages
        await this.loadDirectMessages(partner.id);
        this.dom.textarea?.focus();
    }

    // ---------------- GROUP CHAT SELECTION ----------------
    async openGroupChat(group) {
        this.activeType = 'group';
        this.activeId = group.id;
        this.activePartner = group;
        this.clearReplying();
        this.cancelEditing();
        this.closeMoreMenu();
        this.updateMoreMenu('group');
        if (window.documentsController) window.documentsController.clearStagedFile();
        if (window.voiceRecorder) window.voiceRecorder.cancelRecording();
        this.updateComposerActionButton();

        const currentUser = auth.getUser();
        const isCreator = group.created_by === (currentUser ? currentUser.id : null);

        // Update Header UI
        if (this.dom.partnerName) {
            this.dom.partnerName.textContent = group.name;
        }
        if (this.dom.partnerInitials) {
            this.dom.partnerInitials.textContent = group.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        }

        if (this.dom.partnerPresence) {
            const count = group.members_count || 1;
            this.dom.partnerPresence.textContent = `${count} member${count > 1 ? 's' : ''} • ${isCreator ? 'Created by you' : 'Group Discussion'}`;
            this.dom.partnerPresence.className = 'chat-partner-presence';
        }
        if (this.dom.partnerStatusDot) {
            this.dom.partnerStatusDot.style.display = 'none';
        }

        // Show Active Chat, Hide Placeholder
        if (this.dom.emptyPlaceholder) this.dom.emptyPlaceholder.style.display = 'none';
        if (this.dom.activeChatView) this.dom.activeChatView.style.display = 'flex';

        // Update details drawer
        this.updateDetailsDrawer(group);

        // Mobile responsive switch
        if (window.innerWidth <= 768) {
            document.getElementById('chatApp')?.classList.add('has-active-chat');
            document.getElementById('chatWindow')?.classList.add('mobile-open');
            const panel = document.getElementById('conversationPanel');
            if (panel) {
                panel.style.display = '';
            }
        }

        // Highlight active group card
        document.querySelectorAll('.conversation-card').forEach(card => {
            card.classList.toggle('active', card.dataset.id == group.id && card.dataset.type === 'group');
        });

        // Load Messages
        await this.loadGroupMessages(group.id);
        this.dom.textarea?.focus();
    }

    closeActiveChat() {
        this.activeType = null;
        this.activeId = null;
        this.activePartner = null;
        if (this.dom.activeChatView) this.dom.activeChatView.style.display = 'none';
        if (this.dom.emptyPlaceholder) this.dom.emptyPlaceholder.style.display = 'flex';
        if (this.dom.detailsDrawer) this.dom.detailsDrawer.style.display = 'none';
    }

    // ---------------- LOAD MESSAGES ----------------
    async loadDirectMessages(partnerId) {
        if (!this.dom.messagesContainer) return;
        this.dom.messagesContainer.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

        try {
            const messages = await api.getDirectMessages(partnerId);
            this.activeMessages = (messages || []).sort((a, b) => {
                const da = messagesModule.parseDate(a.created_at);
                const db = messagesModule.parseDate(b.created_at);
                return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
            });
            this.renderMessagesList(this.activeMessages);
        } catch (err) {
            this.dom.messagesContainer.innerHTML = `
                <div class="empty-state" style="margin: auto;">
                    <div style="color: var(--danger); font-size: 14px; font-weight: 600;">Failed to load messages</div>
                    <button class="btn btn-secondary btn-sm" style="margin-top: 8px;" onclick="window.chatController.loadDirectMessages(${partnerId})">Retry</button>
                </div>
            `;
        }
    }

    async loadGroupMessages(groupId) {
        if (!this.dom.messagesContainer) return;
        this.dom.messagesContainer.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';

        try {
            const messages = await api.getGroupMessages(groupId);
            this.activeMessages = (messages || []).sort((a, b) => {
                const da = messagesModule.parseDate(a.created_at);
                const db = messagesModule.parseDate(b.created_at);
                return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
            });
            this.renderMessagesList(this.activeMessages);
        } catch (err) {
            this.dom.messagesContainer.innerHTML = `
                <div class="empty-state" style="margin: auto;">
                    <div style="color: var(--danger); font-size: 14px; font-weight: 600;">Failed to load group messages</div>
                    <button class="btn btn-secondary btn-sm" style="margin-top: 8px;" onclick="window.chatController.loadGroupMessages(${groupId})">Retry</button>
                </div>
            `;
        }
    }

    renderMessagesList(messages) {
        const currentUser = auth.getUser();
        const currentUserId = currentUser ? currentUser.id : null;

        this.dom.messagesContainer.innerHTML = '';

        if (!messages || messages.length === 0) {
            this.dom.messagesContainer.innerHTML = `
                <div class="empty-state" style="margin: auto;">
                    <div style="font-size: 36px; margin-bottom: 8px;">💬</div>
                    <h3 class="empty-state-title">Start the conversation</h3>
                    <p class="empty-state-desc">Send a message or share a document below to connect.</p>
                </div>
            `;
            return;
        }

        let lastDate = null;
        messages.forEach(msg => {
            if (!msg.created_at) msg.created_at = new Date().toISOString();
            const parsed = messagesModule.parseDate(msg.created_at) || new Date();
            const msgDate = parsed ? parsed.toDateString() : '';
            if (msgDate && msgDate !== lastDate) {
                lastDate = msgDate;
                const datePill = document.createElement('div');
                datePill.className = 'date-separator';
                datePill.innerHTML = `<span>${this.formatDividerDate(msg.created_at)}</span>`;
                this.dom.messagesContainer.appendChild(datePill);
            }

            const msgRowHtml = messagesModule.renderMessageRow(msg, currentUserId);
            this.dom.messagesContainer.insertAdjacentHTML('beforeend', msgRowHtml);
        });

        this.scrollToBottom();
    }

    formatDividerDate(dateStr) {
        return messagesModule.formatDividerDate(dateStr);
    }

    scrollToBottom() {
        if (!this.dom.messagesContainer) return;
        this.dom.messagesContainer.scrollTop = this.dom.messagesContainer.scrollHeight;
    }

    // ---------------- SEND MESSAGE ----------------
    async sendMessage() {
        const text = (this.dom.textarea?.value || '').trim();
        if (!text || !this.activeId) return;

        const replyId = this.replyTo ? this.replyTo.id : null;

        this.dom.textarea.value = '';
        this.autoResizeTextarea();
        this.clearReplying();
        this.dom.emojiPopover?.classList.remove('show');
        this.dom.attachmentPopover?.classList.remove('show');
        this.updateComposerActionButton();

        if (window.wsClient && window.wsClient.isConnected) {
            window.wsClient.sendChatMessage(
                this.activeType === 'direct' ? this.activeId : null,
                this.activeType === 'group' ? this.activeId : null,
                text,
                replyId
            );
        } else {
            // REST Fallback
            try {
                const newMsg = await api.sendMessage({
                    recipient_id: this.activeType === 'direct' ? this.activeId : null,
                    group_id: this.activeType === 'group' ? this.activeId : null,
                    content: text,
                    message_type: 'text',
                    reply_to_id: replyId
                });

                const currentUser = auth.getUser();
                this.appendMessage(newMsg, currentUser ? currentUser.id : null);
            } catch (err) {
                showToast(err.message || 'Failed to send message', 'error');
            }
        }
    }

    // Dynamic Action Button (Microphone vs Send)
    updateComposerActionButton() {
        if (!this.dom.sendBtn) return;
        const text = (this.dom.textarea?.value || '').trim();
        const hasAttachment = !!(window.documentsController && window.documentsController.selectedFile);
        const hasVoicePreview = !!(window.voiceRecorder && window.voiceRecorder.audioBlob);

        if (text.length > 0 || hasAttachment || hasVoicePreview) {
            this.dom.sendBtn.classList.remove('mode-mic');
            this.dom.sendBtn.classList.add('mode-send');
            this.dom.sendBtn.setAttribute('title', 'Send Message');
            this.dom.sendBtn.setAttribute('aria-label', 'Send');
        } else {
            this.dom.sendBtn.classList.remove('mode-send');
            this.dom.sendBtn.classList.add('mode-mic');
            this.dom.sendBtn.setAttribute('title', 'Hold or click to record voice');
            this.dom.sendBtn.setAttribute('aria-label', 'Record Voice');
        }
    }

    async handleComposerActionButtonClick() {
        const text = (this.dom.textarea?.value || '').trim();
        const hasAttachment = !!(window.documentsController && window.documentsController.selectedFile);
        const hasVoicePreview = !!(window.voiceRecorder && window.voiceRecorder.audioBlob);

        // If any text, attachment, or voice preview exists, ALWAYS execute submit / send
        if (text.length > 0 || hasAttachment || hasVoicePreview) {
            this.updateComposerActionButton();
            await this.handleComposerSubmit();
            return;
        }

        if (this.dom.sendBtn?.classList.contains('mode-mic')) {
            if (window.voiceRecorder) {
                window.voiceRecorder.startRecording();
            }
            return;
        }
        await this.handleComposerSubmit();
    }

    async handleComposerSubmit() {
        if (!this.activeId) {
            showToast('Please select a conversation first.', 'info');
            return;
        }

        // 0. If in editing mode
        if (this.editingMessageId) {
            await this.saveEditing();
            return;
        }

        // 1. If an attachment is staged in tray
        if (window.documentsController && window.documentsController.selectedFile) {
            const caption = (this.dom.textarea?.value || '').trim();
            this.dom.textarea.value = '';
            this.autoResizeTextarea();
            await window.documentsController.uploadAndSendStagedFile(caption);
            this.updateComposerActionButton();
            return;
        }

        // 2. If a voice recording is staged in voice preview bar
        if (window.voiceRecorder && window.voiceRecorder.audioBlob) {
            await window.voiceRecorder.uploadAndSendVoiceNote();
            this.updateComposerActionButton();
            return;
        }

        // 3. Regular text message
        await this.sendMessage();
    }

    setupDragAndDrop() {
        const chatWindow = document.getElementById('chatWindow');
        if (!chatWindow) return;

        ['dragenter', 'dragover'].forEach(eventName => {
            chatWindow.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                chatWindow.classList.add('drag-active');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            chatWindow.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                chatWindow.classList.remove('drag-active');
            }, false);
        });

        chatWindow.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt ? dt.files : null;
            if (files && files.length > 0 && window.documentsController) {
                window.documentsController.stageSelectedFile(files[0]);
            }
        });
    }

    appendMessage(msg, currentUserId) {
        if (!this.dom.messagesContainer) return;

        if (!msg.created_at) {
            msg.created_at = new Date().toISOString();
        }

        const msgId = Number(msg.id || msg.message_id);
        if (msgId) {
            // Deduplicate if already present in active array or rendered in DOM
            if (this.activeMessages.some(m => Number(m.id || m.message_id) === msgId) || document.getElementById(`msgRow-${msgId}`)) {
                return;
            }
        }

        const empty = this.dom.messagesContainer.querySelector('.empty-state');
        if (empty) empty.remove();

        // Check if date divider is needed
        const lastMsg = this.activeMessages[this.activeMessages.length - 1];
        const newD = messagesModule.parseDate(msg.created_at) || new Date();
        const lastD = lastMsg ? (messagesModule.parseDate(lastMsg.created_at) || new Date()) : null;
        const newDate = newD ? newD.toDateString() : '';
        const lastDate = lastD ? lastD.toDateString() : '';

        if (newDate && newDate !== lastDate) {
            const datePill = document.createElement('div');
            datePill.className = 'date-separator';
            datePill.innerHTML = `<span>${this.formatDividerDate(msg.created_at)}</span>`;
            this.dom.messagesContainer.appendChild(datePill);
        }

        this.activeMessages.push(msg);
        const html = messagesModule.renderMessageRow(msg, currentUserId);
        this.dom.messagesContainer.insertAdjacentHTML('beforeend', html);
        this.scrollToBottom();
    }

    // ---------------- COMPOSER & KEYBOARD ----------------
    setupComposer() {
        if (!this.dom.textarea) return;

        this.dom.textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleComposerSubmit();
            }
        });

        ['input', 'keyup', 'change', 'paste'].forEach(evt => {
            this.dom.textarea.addEventListener(evt, () => {
                this.autoResizeTextarea();
                if (evt === 'input') this.emitTyping();
                this.updateComposerActionButton();
            });
        });

        this.dom.sendBtn?.addEventListener('click', () => this.handleComposerActionButtonClick());
        this.dom.micBtn?.addEventListener('click', () => {
            if (window.voiceRecorder) {
                window.voiceRecorder.startRecording();
            }
        });
        this.dom.cancelReplyBtn?.addEventListener('click', () => this.clearReplying());
        this.dom.cancelEditBtn?.addEventListener('click', () => this.cancelEditing());
        this.dom.saveEditBtn?.addEventListener('click', () => this.saveEditing());

        // Mobile virtual keyboard handling: auto-scroll to latest message on focus
        this.dom.textarea.addEventListener('focus', () => {
            setTimeout(() => {
                this.scrollToBottom();
            }, 300);
        });

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                if (document.activeElement === this.dom.textarea) {
                    this.scrollToBottom();
                }
            });
        }

        this.setupDragAndDrop();
        this.updateComposerActionButton();
    }

    autoResizeTextarea() {
        if (!this.dom.textarea) return;
        this.dom.textarea.style.height = 'auto';
        this.dom.textarea.style.height = Math.min(this.dom.textarea.scrollHeight, 120) + 'px';
    }

    emitTyping() {
        if (!this.activeId || !window.wsClient || !window.wsClient.isConnected) return;

        window.wsClient.sendTyping(
            this.activeType === 'direct' ? this.activeId : null,
            this.activeType === 'group' ? this.activeId : null,
            true
        );

        if (this.typingTimeout) clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            window.wsClient.sendTyping(
                this.activeType === 'direct' ? this.activeId : null,
                this.activeType === 'group' ? this.activeId : null,
                false
            );
        }, 1500);
    }

    setReplying(id, sender, content) {
        this.cancelEditing();
        this.replyTo = { id, sender, content };
        if (this.dom.replySender) this.dom.replySender.textContent = `Replying to ${sender}`;
        if (this.dom.replyText) this.dom.replyText.textContent = content;
        if (this.dom.replyStrip) {
            this.dom.replyStrip.classList.add('show');
            this.dom.replyStrip.style.display = 'flex';
        }
        this.updateComposerActionButton();
        this.dom.textarea?.focus();
    }

    clearReplying() {
        this.replyTo = null;
        if (this.dom.replyStrip) {
            this.dom.replyStrip.classList.remove('show');
            this.dom.replyStrip.style.display = 'none';
        }
        if (this.dom.replyText) this.dom.replyText.textContent = '';
        this.updateComposerActionButton();
    }

    // ---------------- EMOJI PICKER ----------------
    setupEmojiPicker() {
        const emojis = [
            '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
            '😊', '😇', '🙂', '😉', '😌', '😍', '🥰', '😘',
            '😋', '😛', '😜', '😎', '🤩', '🥳', '😏', '🤔',
            '👍', '👎', '👏', '🙌', '🤝', '👊', '✌️', '🤟',
            '❤️', '🧡', '💛', '💚', '💙', '💜', '🔥', '✨',
            '🎉', '🚀', '💯', '⚡', '🌟', '💡', '💬', '📎'
        ];

        if (this.dom.emojiGrid) {
            this.dom.emojiGrid.innerHTML = emojis.map(em => `
                <button type="button" class="emoji-item-btn" data-emoji="${em}">${em}</button>
            `).join('');
        }

        this.dom.emojiBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dom.emojiPopover?.classList.toggle('show');
            this.dom.attachmentPopover?.classList.remove('show');
        });

        this.dom.emojiGrid?.addEventListener('click', (e) => {
            const btn = e.target.closest('.emoji-item-btn');
            if (btn && this.dom.textarea) {
                const emoji = btn.dataset.emoji;
                this.dom.textarea.value += emoji;
                this.dom.textarea.focus();
                this.autoResizeTextarea();
                this.updateComposerActionButton();
                this.dom.textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.emoji-popover') && !e.target.closest('#emojiBtn')) {
                this.dom.emojiPopover?.classList.remove('show');
            }
        });
    }

    // ---------------- ATTACHMENT MENU ----------------
    setupAttachments() {
        this.dom.attachmentBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dom.attachmentPopover?.classList.toggle('show');
            this.dom.emojiPopover?.classList.remove('show');
        });

        document.querySelectorAll('.attachment-menu-item').forEach(item => {
            item.addEventListener('click', () => {
                this.dom.attachmentPopover?.classList.remove('show');
                const action = item.dataset.action;

                if (action === 'voice') {
                    if (window.voiceRecorder) {
                        window.voiceRecorder.startRecording();
                    }
                } else if (window.documentsController) {
                    if (action === 'photo') {
                        window.documentsController.triggerPhotoPicker();
                    } else if (action === 'video') {
                        window.documentsController.triggerVideoPicker();
                    } else {
                        window.documentsController.triggerDocPicker();
                    }
                }
            });
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.attachment-popover') && !e.target.closest('#attachmentBtn')) {
                this.dom.attachmentPopover?.classList.remove('show');
            }
        });
    }

    // ---------------- CHAT MESSAGE SEARCH ----------------
    setupChatSearch() {
        this.dom.chatSearchBtn?.addEventListener('click', () => {
            const isVisible = this.dom.chatSearchBar?.style.display !== 'none';
            if (this.dom.chatSearchBar) {
                this.dom.chatSearchBar.style.display = isVisible ? 'none' : 'flex';
                if (!isVisible) this.dom.chatSearchInput?.focus();
            }
        });

        this.dom.closeChatSearchBtn?.addEventListener('click', () => {
            if (this.dom.chatSearchBar) this.dom.chatSearchBar.style.display = 'none';
            if (this.dom.chatSearchInput) this.dom.chatSearchInput.value = '';
            this.filterActiveMessages('');
        });

        this.dom.chatSearchInput?.addEventListener('input', (e) => {
            this.filterActiveMessages(e.target.value.trim().toLowerCase());
        });
    }

    filterActiveMessages(query) {
        const rows = document.querySelectorAll('.message-row');
        rows.forEach(row => {
            if (!query) {
                row.style.display = 'flex';
                return;
            }
            const text = row.textContent.toLowerCase();
            const filename = (row.querySelector('.message-document-card')?.dataset.filename || '').toLowerCase();
            const match = text.includes(query) || filename.includes(query);
            row.style.display = match ? 'flex' : 'none';
        });
    }

    // ---------------- MORE MENU ----------------
    setupHeaderMoreMenu() {
        this.dom.chatMoreBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.dom.chatMoreMenu?.classList.toggle('show');
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.chat-more-menu') && !e.target.closest('#chatMoreBtn')) {
                this.closeMoreMenu();
            }
        });

        // Mobile cancel button
        document.getElementById('moreCancelBtn')?.addEventListener('click', () => {
            this.closeMoreMenu();
        });

        // Group Action Buttons in More Menu
        document.getElementById('moreGroupInfoBtn')?.addEventListener('click', () => {
            this.closeMoreMenu();
            this.openDrawer();
        });

        document.getElementById('moreAddMembersBtn')?.addEventListener('click', () => {
            this.closeMoreMenu();
            if (this.activeType === 'group' && window.groupsModule) {
                window.groupsModule.openAddMembersModal(this.activeId);
            } else {
                showToast('Add members is only available for groups', 'info');
            }
        });

        document.getElementById('moreMuteBtn')?.addEventListener('click', () => {
            this.closeMoreMenu();
            showToast('Notifications muted for this chat', 'info');
        });

        document.getElementById('moreExportChatBtn')?.addEventListener('click', () => {
            this.closeMoreMenu();
            this.exportChatHistory();
        });

        document.getElementById('moreClearChatBtn')?.addEventListener('click', () => {
            this.closeMoreMenu();
            createConfirmModal('Clear Chat History', 'Are you sure you want to clear this chat view?', () => {
                this.activeMessages = [];
                if (this.dom.messagesContainer) {
                    this.dom.messagesContainer.innerHTML = `
                        <div class="empty-state" style="margin: auto;">
                            <div style="font-size: 32px; margin-bottom: 8px;">🗑️</div>
                            <h3 class="empty-state-title">Chat history cleared</h3>
                        </div>
                    `;
                }
                showToast('Chat history cleared', 'info');
            });
        });

        document.getElementById('moreInviteLinkBtn')?.addEventListener('click', () => {
            this.closeMoreMenu();
            const inviteUrl = window.location.origin + `/join?code=frank-${this.activeType === 'group' ? 'grp' : 'usr'}-${this.activeId}`;
            navigator.clipboard.writeText(inviteUrl).then(() => {
                showToast('Invitation link copied to clipboard!', 'success');
            }).catch(() => {
                showToast(`Invitation Link: ${inviteUrl}`, 'info');
            });
        });

        document.getElementById('morePinChatBtn')?.addEventListener('click', () => {
            this.closeMoreMenu();
            showToast('Conversation pinned to top of list', 'success');
        });

        document.getElementById('moreMarkUnreadBtn')?.addEventListener('click', () => {
            this.closeMoreMenu();
            showToast('Marked conversation as unread', 'info');
        });

        document.getElementById('moreLeaveGroupBtn')?.addEventListener('click', () => {
            this.closeMoreMenu();
            if (this.activeType === 'group' && window.groupsModule) {
                window.groupsModule.leaveGroup(this.activeId, this.activePartner?.name);
            } else {
                showToast('Leave group is only available for group chats', 'info');
            }
        });

        // Favorite Toggle
        document.getElementById('moreFavoriteBtn')?.addEventListener('click', async () => {
            this.closeMoreMenu();
            if (!this.activeId || !this.activeType) return;
            try {
                const prefs = await api.getConversationPreferences();
                const existing = (prefs || []).find(p => p.conversation_type === this.activeType && p.conversation_id === this.activeId);
                const nextVal = !(existing && existing.is_favorite);
                await api.updateConversationPreference(this.activeType, this.activeId, { is_favorite: nextVal });
                showToast(nextVal ? 'Added to favorites' : 'Removed from favorites', 'success');
                if (window.appController) window.appController.loadConversations(false);
            } catch (err) {
                showToast(err.message || 'Failed to update favorite', 'error');
            }
        });

        // Delete Direct Conversation
        document.getElementById('moreDeleteChatBtn')?.addEventListener('click', () => {
            this.closeMoreMenu();
            if (this.activeType !== 'direct' || !this.activeId) return;
            createConfirmModal('Delete Conversation', 'Delete this conversation and all its messages? This action cannot be undone.', async () => {
                try {
                    await api.deleteDirectConversation(this.activeId);
                    showToast('Conversation deleted', 'info');
                    this.closeActiveChat();
                    if (window.appController) window.appController.loadConversations(false);
                } catch (err) {
                    showToast(err.message || 'Failed to delete conversation', 'error');
                }
            });
        });
    }

    updateMoreMenu(type) {
        // Group-only actions: Add Members, Invite Link, Leave Group, divider
        document.querySelectorAll('#chatMoreMenu .group-only-action').forEach(el => {
            el.style.display = (type === 'group') ? '' : 'none';
        });

        const groupInfoText = document.getElementById('moreGroupInfoText');
        const deleteChatBtn = document.getElementById('moreDeleteChatBtn');

        const currentUser = auth.getUser();
        const isSelf = type === 'direct' && currentUser && Number(this.activeId) === Number(currentUser.id);

        if (type === 'direct') {
            if (groupInfoText) groupInfoText.textContent = isSelf ? 'Notes Info' : 'Contact Info';
            if (deleteChatBtn) {
                deleteChatBtn.style.display = '';
                deleteChatBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    ${isSelf ? 'Delete Notes' : 'Delete Chat'}
                `;
            }
        } else {
            if (groupInfoText) groupInfoText.textContent = 'Group Info';
            if (deleteChatBtn) deleteChatBtn.style.display = 'none';
        }
    }

    closeMoreMenu() {
        this.dom.chatMoreMenu?.classList.remove('show');
    }

    // ---------------- IN-MESSAGE FUNCTIONS & CONTEXT MENU ----------------
    openMessageContextMenu(e, msgId) {
        this.closeMessageContextMenu();
        const numId = Number(msgId);
        const msg = this.activeMessages.find(m => Number(m.id || m.message_id) === numId);
        const row = document.getElementById(`msgRow-${numId}`);
        if (!row) return;

        const currentUser = auth.getUser();
        const currentUserId = currentUser ? currentUser.id : null;
        const isSent = msg ? (Number(msg.sender_id) === Number(currentUserId)) : row.classList.contains('sent');
        const isDoc = !!row.querySelector('.message-document-card');
        const isPhoto = !!row.querySelector('.message-photo-card');
        const isVideo = !!row.querySelector('.message-video-card');
        const hasMedia = isDoc || isPhoto || isVideo;
        const liveEl = row.querySelector('.message-text-content');
        const textContent = (msg ? msg.content : (liveEl ? liveEl.textContent : '')) || '';
        const hasRealText = textContent && !textContent.startsWith('Shared a file:') && textContent !== 'Voice message';
        const senderName = isSent ? 'You' : (msg && msg.sender ? (msg.sender.full_name || msg.sender.username) : 'User');

        const menu = document.createElement('div');
        menu.className = 'message-context-menu';
        menu.id = 'activeMessageContextMenu';

        const replySvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>`;
        const copySvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const editSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
        const pinSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
        const starSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`;
        const infoSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
        const openSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
        const downloadSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
        const deleteSvg = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

        let itemsHtml = `
            <div class="message-context-header">Message Options</div>
            <button type="button" class="message-context-item ctx-reply">
                ${replySvg} <span>Reply</span>
            </button>
            ${hasRealText ? `
                <button type="button" class="message-context-item ctx-copy">
                    ${copySvg} <span>Copy Text</span>
                </button>
            ` : ''}
            ${(isSent && hasRealText) ? `
                <button type="button" class="message-context-item ctx-edit">
                    ${editSvg} <span>Edit Message</span>
                </button>
            ` : ''}
            <button type="button" class="message-context-item ctx-pin">
                ${pinSvg} <span>${msg?.is_pinned ? 'Unpin Message' : 'Pin Message'}</span>
            </button>
            <button type="button" class="message-context-item ctx-star">
                ${starSvg} <span>${msg?.is_starred ? 'Remove Star' : 'Star Message'}</span>
            </button>
            <button type="button" class="message-context-item ctx-info">
                ${infoSvg} <span>Message Info</span>
            </button>
        `;

        if (hasMedia) {
            itemsHtml += `
                <div class="message-context-divider"></div>
                <button type="button" class="message-context-item ctx-open">
                    ${openSvg} <span>Open</span>
                </button>
                <button type="button" class="message-context-item ctx-download">
                    ${downloadSvg} <span>Download</span>
                </button>
            `;
        }

        if (isSent) {
            itemsHtml += `
                <div class="message-context-divider"></div>
                <button type="button" class="message-context-item danger ctx-delete">
                    ${deleteSvg} <span>Delete Message</span>
                </button>
            `;
        }

        menu.innerHTML = itemsHtml;
        document.body.appendChild(menu);

        // Position menu
        const menuRect = menu.getBoundingClientRect();
        let posX = e.clientX || 0;
        let posY = e.clientY || 0;

        if (e.target && e.target.closest('.action-tool-btn, .bubble-more-trigger')) {
            const btn = e.target.closest('.action-tool-btn, .bubble-more-trigger');
            const btnRect = btn.getBoundingClientRect();
            posX = isSent ? (btnRect.right - menuRect.width) : btnRect.left;
            posY = btnRect.bottom + 4;
        }

        if (posX + menuRect.width > window.innerWidth - 12) posX = window.innerWidth - menuRect.width - 12;
        if (posX < 12) posX = 12;
        if (posY + menuRect.height > window.innerHeight - 12) posY = (e.clientY ? e.clientY - menuRect.height : posY - menuRect.height - 20);
        if (posY < 12) posY = 12;

        menu.style.left = `${posX}px`;
        menu.style.top = `${posY}px`;

        // Wire actions
        menu.querySelector('.ctx-reply')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            this.setReplying(numId, senderName, textContent);
        });

        menu.querySelector('.ctx-copy')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            if (textContent) {
                navigator.clipboard.writeText(textContent).then(() => {
                    showToast('✓ Copied to clipboard', 'success', 1500);
                }).catch(() => {
                    showToast('Unable to copy', 'error');
                });
            }
        });

        menu.querySelector('.ctx-edit')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            this.setEditing(numId, textContent);
        });

        menu.querySelector('.ctx-pin')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            this.togglePinMessage(numId);
        });

        menu.querySelector('.ctx-star')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            this.toggleStarMessage(numId);
        });

        menu.querySelector('.ctx-info')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            this.showMessageInfo(numId);
        });

        menu.querySelector('.ctx-open')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            const openBtn = row.querySelector('.msg-doc-open-btn, .msg-action-open-doc, .msg-photo-img');
            if (openBtn) openBtn.click();
        });

        menu.querySelector('.ctx-download')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            const downBtn = row.querySelector('.msg-doc-download-btn, .msg-action-download-doc');
            if (downBtn) downBtn.click();
        });

        menu.querySelector('.ctx-delete')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            const delBtn = row.querySelector('.msg-action-delete');
            if (delBtn) delBtn.click();
        });
    }

    closeMessageContextMenu() {
        const existing = document.getElementById('activeMessageContextMenu');
        if (existing) existing.remove();
    }

    togglePinMessage(msgId) {
        const numId = Number(msgId);
        let msg = this.activeMessages.find(m => Number(m.id || m.message_id) === numId);
        if (!msg) {
            msg = { id: numId };
            this.activeMessages.push(msg);
        }
        msg.is_pinned = !msg.is_pinned;
        const row = document.getElementById(`msgRow-${numId}`);
        if (row) {
            let pinEl = row.querySelector('.message-pin-indicator');
            if (msg.is_pinned) {
                if (!pinEl) {
                    const timeEl = row.querySelector('.message-time');
                    if (timeEl) {
                        const span = document.createElement('span');
                        span.className = 'message-pin-indicator';
                        span.title = 'Pinned message';
                        span.textContent = '📌';
                        timeEl.prepend(span);
                    }
                }
                showToast('Message pinned to conversation', 'success');
            } else {
                if (pinEl) pinEl.remove();
                showToast('Message unpinned', 'info');
            }
        }
    }

    toggleStarMessage(msgId) {
        const numId = Number(msgId);
        let msg = this.activeMessages.find(m => Number(m.id || m.message_id) === numId);
        if (!msg) {
            msg = { id: numId };
            this.activeMessages.push(msg);
        }
        msg.is_starred = !msg.is_starred;
        const row = document.getElementById(`msgRow-${numId}`);
        if (row) {
            let starEl = row.querySelector('.message-star-indicator');
            if (msg.is_starred) {
                if (!starEl) {
                    const timeEl = row.querySelector('.message-time');
                    if (timeEl) {
                        const span = document.createElement('span');
                        span.className = 'message-star-indicator';
                        span.title = 'Starred message';
                        span.textContent = '⭐';
                        timeEl.prepend(span);
                    }
                }
                showToast('Message starred', 'success');
            } else {
                if (starEl) starEl.remove();
                showToast('Message removed from starred', 'info');
            }
        }
    }

    showMessageInfo(msgId) {
        const numId = Number(msgId);
        const msg = this.activeMessages.find(m => Number(m.id || m.message_id) === numId);
        const row = document.getElementById(`msgRow-${numId}`);
        const currentUser = auth.getUser();
        const currentUserId = currentUser ? currentUser.id : null;
        const isSent = msg ? (Number(msg.sender_id) === Number(currentUserId)) : (row ? row.classList.contains('sent') : false);
        const sender = isSent ? 'You' : (msg && msg.sender ? (msg.sender.full_name || msg.sender.username) : 'User');
        const createdDate = msg && msg.created_at ? (messagesModule.parseDate(msg.created_at) || new Date()) : new Date();
        const sentTime = createdDate.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
        const editedDate = msg && msg.updated_at && msg.updated_at !== msg.created_at ? messagesModule.parseDate(msg.updated_at) : null;
        const editedTime = editedDate ? editedDate.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : null;
        const content = msg ? msg.content : (row ? (row.querySelector('.message-text-content')?.textContent || '') : '');
        const charCount = content ? `${content.length} characters` : 'N/A';
        const statusText = isSent ? (msg?.status ? msg.status.charAt(0).toUpperCase() + msg.status.slice(1) : 'Delivered') : 'Received';
        const typeText = msg?.message_type ? msg.message_type.charAt(0).toUpperCase() + msg.message_type.slice(1) : 'Text';

        const modalHtml = `
            <div class="modal-backdrop open" id="messageInfoBackdrop" style="position:fixed; inset:0; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); z-index:1150; display:flex; align-items:center; justify-content:center;">
                <div class="modal-card" style="background:#0f172a; border:1px solid rgba(255,255,255,0.12); border-radius:16px; padding:22px; max-width:380px; width:90%; box-shadow:0 20px 40px rgba(0,0,0,0.6); color:#f8fafc;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;">
                        <h3 style="font-size:16px; font-weight:700; margin:0; display:flex; align-items:center; gap:8px;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                            Message Info
                        </h3>
                        <button type="button" id="closeMsgInfoBtn" style="background:none; border:none; color:var(--text-muted); font-size:18px; cursor:pointer; padding:4px;">✕</button>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:10px; font-size:13px;">
                        <div style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06);">
                            <span style="color:var(--text-muted);">From</span>
                            <span style="font-weight:600;">${messagesModule.escapeHTML(sender)}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06);">
                            <span style="color:var(--text-muted);">Status</span>
                            <span style="font-weight:600; color:var(--primary);">${statusText}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06);">
                            <span style="color:var(--text-muted);">Sent</span>
                            <span style="font-weight:500;">${sentTime}</span>
                        </div>
                        ${editedTime ? `
                            <div style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06);">
                                <span style="color:var(--text-muted);">Edited</span>
                                <span style="font-weight:500;">${editedTime}</span>
                            </div>
                        ` : ''}
                        <div style="display:flex; justify-content:space-between; padding-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06);">
                            <span style="color:var(--text-muted);">Type</span>
                            <span style="font-weight:500;">${typeText}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between;">
                            <span style="color:var(--text-muted);">Size</span>
                            <span style="font-weight:500;">${charCount}</span>
                        </div>
                    </div>
                    <button type="button" class="btn btn-secondary btn-full btn-sm" id="dismissMsgInfoBtn" style="margin-top:18px;">Close</button>
                </div>
            </div>
        `;
        const div = document.createElement('div');
        div.innerHTML = modalHtml;
        const modal = div.firstElementChild;
        document.body.appendChild(modal);
        const close = () => modal.remove();
        modal.querySelector('#closeMsgInfoBtn')?.addEventListener('click', close);
        modal.querySelector('#dismissMsgInfoBtn')?.addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    }

    exportChatHistory() {
        if (!this.activeMessages || this.activeMessages.length === 0) {
            showToast('No messages to export.', 'info');
            return;
        }

        const lines = this.activeMessages.map(m => {
            const sender = m.sender ? m.sender.full_name : (m.sender_id === this.activeId ? 'Partner' : 'You');
            const time = messagesModule.formatMessageTimestamp(m.created_at) || 'Unknown';
            return `[${time}] ${sender}: ${m.content}`;
        });

        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `frank-chat-${this.activeType}-${this.activeId}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('Chat history exported!', 'success');
    }

    // ---------------- MOBILE NAVIGATION & BACK ----------------
    setupMobileBack() {
        this.dom.mobileBackBtn?.addEventListener('click', () => {
            document.getElementById('chatApp')?.classList.remove('has-active-chat');
            document.getElementById('chatWindow')?.classList.remove('mobile-open');
            const panel = document.getElementById('conversationPanel');
            if (panel) panel.style.display = '';
            // Reset active selection state locally so returning to screen 1 is clean
            this.activeId = null;
            this.activeType = null;
            document.querySelectorAll('.conversation-card').forEach(card => card.classList.remove('active'));
        });
    }

    // ---------------- DETAILS DRAWER & SHARED MEDIA ----------------
    setupDrawer() {
        this.dom.toggleDrawerBtn?.addEventListener('click', () => {
            this.toggleDrawer();
        });

        this.dom.closeDrawerBtn?.addEventListener('click', () => {
            this.closeDrawer();
        });

        // Drawer Tabs: Members vs Shared Documents
        document.querySelectorAll('.drawer-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.drawer-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const tab = btn.dataset.tab;
                const membersSec = document.getElementById('drawerMembersSection');
                const docsSec = document.getElementById('drawerDocsSection');

                if (tab === 'members') {
                    if (membersSec) membersSec.style.display = 'block';
                    if (docsSec) docsSec.style.display = 'none';
                } else if (tab === 'docs') {
                    if (membersSec) membersSec.style.display = 'none';
                    if (docsSec) docsSec.style.display = 'block';
                    this.loadSharedDocuments();
                }
            });
        });
    }

    toggleDrawer() {
        if (!this.dom.detailsDrawer) return;
        const isHidden = this.dom.detailsDrawer.style.display === 'none';
        if (isHidden) {
            this.openDrawer();
        } else {
            this.closeDrawer();
        }
    }

    openDrawer() {
        if (!this.dom.detailsDrawer) return;
        this.dom.detailsDrawer.style.display = 'flex';
        this.dom.detailsDrawer.classList.add('open');
        this.loadSharedDocuments();
    }

    closeDrawer() {
        if (!this.dom.detailsDrawer) return;
        this.dom.detailsDrawer.style.display = 'none';
        this.dom.detailsDrawer.classList.remove('open');
    }

    async updateDetailsDrawer(target) {
        const isGroup = this.activeType === 'group';

        const nameEl = document.getElementById('drawerName');
        const subtitleEl = document.getElementById('drawerSubtitle');
        const bioEl = document.getElementById('drawerBio');
        const initialsEl = document.getElementById('drawerInitials');
        const tabsBar = document.getElementById('drawerTabsBar');
        const membersSec = document.getElementById('drawerMembersSection');
        const leaveBtn = document.getElementById('drawerLeaveGroupBtn');

        const currentUser = auth.getUser();
        const isSelf = !isGroup && currentUser && Number(target.id) === Number(currentUser.id);

        const name = isSelf
            ? `${currentUser.full_name || currentUser.username} (You)`
            : (target.name || target.full_name || target.username || 'Conversation');
        if (nameEl) nameEl.textContent = name;
        if (initialsEl) {
            initialsEl.textContent = isSelf ? '📝' : name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        }

        if (isGroup) {
            const privacyLabel = (target.privacy === 'public') ? '🌐 Public Group' : '🔒 Private Group';
            if (subtitleEl) subtitleEl.textContent = `${privacyLabel} • ${target.members_count || 1} members`;
            if (bioEl) bioEl.textContent = target.description || 'No group description provided.';
            if (tabsBar) tabsBar.style.display = 'flex';
            if (membersSec) membersSec.style.display = 'block';

            this.loadGroupMembersList(target.id);
        } else if (isSelf) {
            const frankBadge = target.frank_id ? ` • ID: ${target.frank_id}` : '';
            if (subtitleEl) subtitleEl.textContent = `@${target.username || 'user'}${frankBadge}`;
            if (bioEl) bioEl.textContent = 'Message yourself • Keep personal notes, files, drafts, to-dos, and bookmarks.';
            if (tabsBar) tabsBar.style.display = 'flex';
            if (membersSec) membersSec.style.display = 'none';
            if (leaveBtn) leaveBtn.style.display = 'none';
        } else {
            const frankBadge = target.frank_id ? ` • ID: ${target.frank_id}` : '';
            if (subtitleEl) subtitleEl.textContent = `@${target.username || 'user'}${frankBadge}`;
            let bio = target.bio || 'Productive conversations powered by FRANK.';
            if (bio.includes('ChatApp') || bio.includes('QENVO')) bio = bio.replace(/ChatApp|QENVO/gi, 'FRANK');
            if (bioEl) bioEl.textContent = bio;
            if (tabsBar) tabsBar.style.display = 'flex';
            if (membersSec) membersSec.style.display = 'none';
            if (leaveBtn) leaveBtn.style.display = 'none';
        }

        // Shared documents
        this.loadSharedDocuments();
    }

    async loadGroupMembersList(groupId) {
        const listContainer = document.getElementById('drawerMembersList');
        const addMemberActionBtn = document.getElementById('drawerAddMemberActionBtn');
        const leaveSection = document.getElementById('drawerLeaveGroupSection');
        if (!listContainer) return;

        listContainer.innerHTML = '<div class="spinner" style="margin: 15px auto;"></div>';

        const currentUser = auth.getUser();
        const currentUserId = currentUser ? currentUser.id : null;

        try {
            const members = await api.getGroupMembers(groupId);
            listContainer.innerHTML = '';

            if (!members || members.length === 0) {
                listContainer.innerHTML = '<div style="font-size:12px; color:var(--text-muted); text-align:center;">No members found</div>';
                return;
            }

            // Find current user role
            const myMembership = members.find(m => m.user_id === currentUserId);
            const myRole = myMembership ? myMembership.role : 'member';

            // Only owners and admins can add members
            if (addMemberActionBtn) {
                addMemberActionBtn.style.display = (myRole === 'owner' || myRole === 'admin') ? 'inline-block' : 'none';
            }

            // Render delete or leave group buttons
            if (leaveSection) {
                if (myRole === 'owner') {
                    leaveSection.innerHTML = `
                        <button type="button" class="btn btn-danger btn-full btn-sm" id="drawerDeleteGroupBtn" style="font-weight: 700;">
                            🗑️ Delete Group
                        </button>
                    `;
                    document.getElementById('drawerDeleteGroupBtn')?.addEventListener('click', () => {
                        const grpName = document.getElementById('drawerName')?.textContent || 'this group';
                        if (window.groupsModule) window.groupsModule.deleteGroup(groupId, grpName);
                    });
                } else {
                    leaveSection.innerHTML = `
                        <button type="button" class="btn btn-danger btn-full btn-sm" id="drawerLeaveGroupBtn">
                            Leave Group
                        </button>
                    `;
                    document.getElementById('drawerLeaveGroupBtn')?.addEventListener('click', () => {
                        const grpName = document.getElementById('drawerName')?.textContent || 'this group';
                        if (window.groupsModule) window.groupsModule.leaveGroup(groupId, grpName);
                    });
                }
            }

            members.forEach(m => {
                const u = m.user || {};
                const initials = (u.full_name || u.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const role = m.role || 'member';

                let roleBadge = '';
                if (role === 'owner') {
                    roleBadge = '<span class="member-role-badge" style="background: rgba(245, 158, 11, 0.15); color: #F59E0B; border: 1px solid rgba(245, 158, 11, 0.3);">👑 Owner</span>';
                } else if (role === 'admin') {
                    roleBadge = '<span class="member-role-badge" style="background: rgba(99, 102, 241, 0.15); color: #6366F1; border: 1px solid rgba(99, 102, 241, 0.3);">🛡️ Admin</span>';
                } else {
                    roleBadge = '<span style="font-size:11px; color:var(--text-muted);">Member</span>';
                }

                // Role actions
                let actionsHtml = '';
                if (m.user_id !== currentUserId) {
                    if (myRole === 'owner') {
                        if (role === 'admin') {
                            actionsHtml = `
                                <div style="display: flex; gap: 4px;">
                                    <button type="button" class="btn btn-ghost btn-xs demote-action" data-uid="${m.user_id}" data-name="${messagesModule.escapeHTML(u.full_name)}" title="Demote to Member" style="font-size: 11px; padding: 2px 6px;">Demote</button>
                                    <button type="button" class="btn btn-ghost btn-xs danger remove-action" data-uid="${m.user_id}" data-name="${messagesModule.escapeHTML(u.full_name)}" title="Remove member" style="font-size: 11px; padding: 2px 6px; color: var(--danger);">✕</button>
                                </div>
                            `;
                        } else if (role === 'member') {
                            actionsHtml = `
                                <div style="display: flex; gap: 4px;">
                                    <button type="button" class="btn btn-ghost btn-xs promote-action" data-uid="${m.user_id}" data-name="${messagesModule.escapeHTML(u.full_name)}" title="Promote to Admin" style="font-size: 11px; padding: 2px 6px;">Make Admin</button>
                                    <button type="button" class="btn btn-ghost btn-xs danger remove-action" data-uid="${m.user_id}" data-name="${messagesModule.escapeHTML(u.full_name)}" title="Remove member" style="font-size: 11px; padding: 2px 6px; color: var(--danger);">✕</button>
                                </div>
                            `;
                        }
                    } else if (myRole === 'admin' && role === 'member') {
                        actionsHtml = `
                            <button type="button" class="btn btn-ghost btn-xs danger remove-action" data-uid="${m.user_id}" data-name="${messagesModule.escapeHTML(u.full_name)}" title="Remove member" style="font-size: 11px; padding: 2px 6px; color: var(--danger);">✕</button>
                        `;
                    }
                }

                const row = document.createElement('div');
                row.className = 'drawer-member-row';
                row.style.cssText = 'display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border);';
                row.innerHTML = `
                    <div class="avatar avatar-sm">
                        <span>${initials}</span>
                        <span class="avatar-status ${u.is_online ? 'online' : 'offline'}"></span>
                    </div>
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:13px; font-weight:700; color:var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${messagesModule.escapeHTML(u.full_name)}</div>
                        <div style="font-size:11px; color:var(--text-muted);">@${messagesModule.escapeHTML(u.username)}${u.frank_id ? ` • ${u.frank_id}` : ''}</div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
                        ${roleBadge}
                        ${actionsHtml}
                    </div>
                `;

                // Wire action listeners
                row.querySelector('.promote-action')?.addEventListener('click', (e) => {
                    const uid = parseInt(e.currentTarget.dataset.uid, 10);
                    const uname = e.currentTarget.dataset.name;
                    if (window.groupsModule) window.groupsModule.updateMemberRole(groupId, uid, 'admin', uname);
                });

                row.querySelector('.demote-action')?.addEventListener('click', (e) => {
                    const uid = parseInt(e.currentTarget.dataset.uid, 10);
                    const uname = e.currentTarget.dataset.name;
                    if (window.groupsModule) window.groupsModule.updateMemberRole(groupId, uid, 'member', uname);
                });

                row.querySelector('.remove-action')?.addEventListener('click', (e) => {
                    const uid = parseInt(e.currentTarget.dataset.uid, 10);
                    const uname = e.currentTarget.dataset.name;
                    if (window.groupsModule) window.groupsModule.removeMember(groupId, uid, uname);
                });

                listContainer.appendChild(row);
            });
        } catch {
            listContainer.innerHTML = '<div style="font-size:12px; color:var(--danger); text-align:center;">Failed to load members</div>';
        }
    }


    async loadSharedDocuments() {
        const docsContainer = document.getElementById('drawerDocsList');
        if (!docsContainer || !this.activeId) return;

        docsContainer.innerHTML = '<div class="spinner" style="margin: 15px auto;"></div>';

        try {
            let docs = [];
            if (this.activeType === 'direct') {
                docs = await api.getConversationDocuments(this.activeId);
            } else if (this.activeType === 'group') {
                docs = await api.getGroupDocuments(this.activeId);
            }

            docsContainer.innerHTML = '';

            if (!docs || docs.length === 0) {
                docsContainer.innerHTML = `
                    <div class="empty-state" style="padding: 16px 8px;">
                        <div style="font-size: 28px; margin-bottom: 6px;">📂</div>
                        <div style="font-size: 13px; font-weight: 700; color: var(--text);">No documents shared yet</div>
                        <p style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Files shared in this chat will appear here.</p>
                    </div>
                `;
                return;
            }

            docs.forEach(doc => {
                const category = doc.file_type || (window.documentsController ? window.documentsController.getFileCategory(doc.original_filename) : 'document');
                const ext = doc.original_filename.split('.').pop().toUpperCase();
                const sizeStr = window.documentsController ? window.documentsController.formatFileSize(doc.file_size) : `${ext} File`;
                const dateStr = messagesModule.formatRelativeTime(doc.created_at);
                const badgeHtml = window.documentsController ? window.documentsController.getFileBadgeMarkup(category, ext) : '';

                const item = document.createElement('div');
                item.className = 'drawer-doc-item';
                item.innerHTML = `
                    ${badgeHtml}
                    <div class="drawer-doc-info">
                        <div class="drawer-doc-title" title="${messagesModule.escapeHTML(doc.original_filename)}">
                            ${messagesModule.escapeHTML(doc.original_filename)}
                        </div>
                        <div class="drawer-doc-meta">${sizeStr} • ${dateStr}</div>
                    </div>
                    <div class="drawer-doc-actions">
                        <button type="button" class="btn btn-ghost btn-icon btn-sm msg-doc-open-btn" data-file-id="${doc.id}" data-file-type="${category}" data-filename="${messagesModule.escapeHTML(doc.original_filename)}" data-direct-url="${api.getFileViewUrl(doc.id)}" title="Open Document">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </button>
                        <button type="button" class="btn btn-ghost btn-icon btn-sm msg-doc-download-btn" data-file-id="${doc.id}" data-filename="${messagesModule.escapeHTML(doc.original_filename)}" data-direct-url="${api.getFileDownloadUrl(doc.id)}" title="Download">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>
                    </div>
                `;
                docsContainer.appendChild(item);
            });

        } catch (err) {
            docsContainer.innerHTML = '<div style="font-size:12px; color:var(--danger); text-align:center;">Failed to load documents</div>';
        }
    }

    setEditing(messageId, currentContent) {
        this.clearReplying();
        this.editingMessageId = messageId;
        if (this.dom.editStrip) this.dom.editStrip.style.display = 'flex';
        if (this.dom.composerEditText) this.dom.composerEditText.textContent = currentContent;
        if (this.dom.textarea) {
            this.dom.textarea.value = currentContent;
            this.autoResizeTextarea();
            this.dom.textarea.focus();
        }
        this.updateComposerActionButton();
    }

    cancelEditing() {
        this.editingMessageId = null;
        if (this.dom.editStrip) this.dom.editStrip.style.display = 'none';
        if (this.dom.composerEditText) this.dom.composerEditText.textContent = '';
        if (this.dom.textarea) {
            this.dom.textarea.value = '';
            this.autoResizeTextarea();
        }
        this.updateComposerActionButton();
    }

    async saveEditing() {
        const text = (this.dom.textarea?.value || '').trim();
        if (!text || !this.editingMessageId) return;
        const msgId = this.editingMessageId;

        try {
            if (window.wsClient && window.wsClient.isConnected) {
                if (typeof window.wsClient.sendEditMessage === 'function') {
                    window.wsClient.sendEditMessage(msgId, text);
                } else if (typeof window.wsClient.sendMessageEdit === 'function') {
                    window.wsClient.sendMessageEdit(msgId, text);
                }
            }
            await api.editMessage(msgId, text);
            this.handleMessageEdited({ id: msgId, content: text, updated_at: new Date().toISOString() });
            this.cancelEditing();
            showToast('Message edited', 'success');
            if (window.appController) window.appController.loadConversations(false);
        } catch (err) {
            console.error('Failed to edit message:', err);
            showToast(err.message || 'Failed to edit message', 'error');
        }
    }

    handleMessageEdited(msg) {
        if (!msg) return;
        const msgId = msg.id || msg.message_id;
        const found = this.activeMessages.find(m => Number(m.id || m.message_id) === Number(msgId));
        if (found) {
            found.content = msg.content;
            found.updated_at = msg.updated_at;
        }

        const row = document.getElementById(`msgRow-${msgId}`);
        if (row) {
            const textEl = row.querySelector('.message-text-content');
            if (textEl) {
                textEl.innerHTML = messagesModule.linkify(messagesModule.escapeHTML(msg.content));
            }
            const copyBtn = row.querySelector('.msg-action-copy');
            if (copyBtn) {
                copyBtn.dataset.content = msg.content;
            }
            const replyBtn = row.querySelector('.msg-action-reply');
            if (replyBtn) {
                replyBtn.dataset.content = msg.content;
            }
            const timeEl = row.querySelector('.message-time');
            if (timeEl) {
                const createdAt = msg.created_at || (found ? found.created_at : null);
                const timeFormatted = messagesModule.formatMessageTimestamp(createdAt);
                timeEl.innerHTML = `${timeFormatted} <span class="message-edited-badge" style="font-size:10px; opacity:0.75; font-style:italic;" title="Edited">(Edited)</span>`;
                timeEl.title = `Sent: ${messagesModule.formatMessageTimestamp(createdAt)} · Edited: ${messagesModule.formatMessageTimestamp(msg.updated_at)}`;
            }
        }
    }

    handleMessageDeleted(messageId) {
        if (!messageId) return;
        const numId = Number(messageId);
        this.activeMessages = this.activeMessages.filter(m => Number(m.id || m.message_id) !== numId);
        const row = document.getElementById(`msgRow-${numId}`);
        if (row) {
            row.remove();
        }
        if (this.activeMessages.length === 0 && this.dom.messagesContainer) {
            this.dom.messagesContainer.innerHTML = `
                <div class="empty-state" style="margin: auto;">
                    <div style="font-size: 36px; margin-bottom: 8px;">💬</div>
                    <h3 class="empty-state-title">No messages</h3>
                    <p class="empty-state-desc">Start the conversation by sending a message.</p>
                </div>
            `;
        }
    }

    // ---------------- WEBSOCKET LISTENERS ----------------
    setupWebSocketListeners() {
        if (!window.wsClient) return;

        // 1. Incoming Messages
        window.wsClient.on('message', (data) => {
            const msg = data.message;
            if (!msg) return;

            const currentUser = auth.getUser();
            const currentUserId = currentUser ? currentUser.id : null;

            const senderId = Number(msg.sender_id);
            const recipientId = Number(msg.recipient_id);
            const activeId = Number(this.activeId);
            const myId = Number(currentUserId);

            const isDirectForActiveChat = this.activeType === 'direct' &&
                ((senderId === activeId && recipientId === myId) ||
                 (senderId === myId && recipientId === activeId));

            const isGroupForActiveChat = this.activeType === 'group' && Number(msg.group_id) === activeId;

            if (isDirectForActiveChat || isGroupForActiveChat) {
                this.appendMessage(msg, currentUserId);

                if (senderId === activeId) {
                    window.wsClient.sendRead([msg.id]);
                }
            }

            // Notification for background incoming messages
            if (senderId !== myId) {
                if (typeof window.notificationsModule !== 'undefined') {
                    window.notificationsModule.notifyIncoming(msg);
                }
            }

            // Real-time conversation sync: updates last message snippet, timestamp, and unread badge instantly
            if (typeof window.appController !== 'undefined') {
                window.appController.loadConversations(false);
            }
        });

        // 2. Message Edit Events
        window.wsClient.on('message_edit', (data) => {
            const msg = data.message;
            if (msg) {
                this.handleMessageEdited(msg);
                if (typeof window.appController !== 'undefined') {
                    window.appController.loadConversations(false);
                }
            }
        });

        // 3. Message Deleted Events
        window.wsClient.on('message_deleted', (data) => {
            const msgId = data.message_id || data.id;
            if (msgId) {
                this.handleMessageDeleted(msgId);
                if (typeof window.appController !== 'undefined') {
                    window.appController.loadConversations(false);
                }
            }
        });

        // 3. Typing Events
        window.wsClient.on('typing', (data) => {
            const isDirect = this.activeType === 'direct' && Number(data.sender_id) === Number(this.activeId);
            const isGroup = this.activeType === 'group' && Number(data.group_id) === Number(this.activeId) && Number(data.sender_id) !== Number(auth.getUser()?.id);

            if (isDirect || isGroup) {
                if (data.is_typing) {
                    const name = data.sender_name || (this.activePartner ? (this.activePartner.name || this.activePartner.full_name) : 'User');
                    if (this.dom.typingUserText) this.dom.typingUserText.textContent = `${name} is typing`;
                    this.dom.typingBox?.classList.add('active');
                } else {
                    this.dom.typingBox?.classList.remove('active');
                }
            }
        });

        // 4. Presence Updates
        window.wsClient.on('presence', (data) => {
            if (this.activeType === 'direct' && Number(data.user_id) === Number(this.activeId)) {
                const isOnline = !!data.is_online;
                if (this.dom.partnerPresence) {
                    this.dom.partnerPresence.textContent = isOnline ? 'Online' : 'Offline';
                    this.dom.partnerPresence.className = `chat-partner-presence ${isOnline ? 'online' : ''}`;
                }
                if (this.dom.partnerStatusDot) {
                    this.dom.partnerStatusDot.className = `avatar-status ${isOnline ? 'online' : 'offline'}`;
                }
            }
        });

        // 4. Reactions
        window.wsClient.on('reaction', (data) => {
            const msgRow = document.getElementById(`msgRow-${data.message_id}`);
            if (msgRow) {
                let badgeTray = msgRow.querySelector('.reaction-badges');
                if (!badgeTray) {
                    badgeTray = document.createElement('div');
                    badgeTray.className = 'reaction-badges';
                    msgRow.appendChild(badgeTray);
                }
                if (data.action === 'added') {
                    badgeTray.insertAdjacentHTML('beforeend', `
                        <button type="button" class="reaction-pill user-reacted" data-msg-id="${data.message_id}" data-emoji="${data.emoji}">
                            <span>${data.emoji}</span>
                        </button>
                    `);
                } else {
                    const pill = badgeTray.querySelector(`[data-emoji="${data.emoji}"]`);
                    if (pill) pill.remove();
                }
            }
        });

        // 5. Read Receipts
        window.wsClient.on('read', (data) => {
            const msgRow = document.getElementById(`msgRow-${data.message_id}`);
            if (msgRow) {
                const check = msgRow.querySelector('.message-status-check');
                if (check) {
                    check.className = 'message-status-check read';
                    check.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 6 7 17 2 12"></polyline><polyline points="22 10 13 19 11 17"></polyline></svg>`;
                }
            }
        });
    }

    activateRealTimeSync() {
        if (this._syncTimer) clearInterval(this._syncTimer);
        this.runRealTimeSyncCycle();
        const interval = document.visibilityState === 'visible' ? 1800 : 5000;
        this._syncTimer = setInterval(() => this.runRealTimeSyncCycle(), interval);
    }

    async runRealTimeSyncCycle() {
        if (!auth.isAuthenticated()) return;
        if (window.wsClient && window.wsClient.isConnected) return;
        if (this._isSyncing) return;
        this._isSyncing = true;

        try {
            const currentUser = auth.getUser();
            const currentUserId = currentUser ? currentUser.id : null;

            // 1. Sync Active Chat (Messages, Edits, Deletions, Reactions)
            if (this.activeId) {
                let freshMessages = [];
                if (this.activeType === 'direct') {
                    freshMessages = await api.getDirectMessages(this.activeId);
                } else if (this.activeType === 'group') {
                    freshMessages = await api.getGroupMessages(this.activeId);
                }

                if (Array.isArray(freshMessages)) {
                    const freshIds = new Set(freshMessages.map(m => Number(m.id || m.message_id)));
                    const localIds = new Set(this.activeMessages.map(m => Number(m.id || m.message_id)));

                    // A. Detect newly arrived messages
                    const newMessages = freshMessages.filter(m => !localIds.has(Number(m.id || m.message_id)));
                    if (newMessages.length > 0) {
                        newMessages.forEach(msg => {
                            this.appendMessage(msg, currentUserId);
                        });
                        if (typeof window.appController !== 'undefined') {
                            window.appController.loadConversations(false);
                        }
                    }

                    // B. Detect edits and reaction updates on existing messages
                    freshMessages.forEach(freshMsg => {
                        const mid = Number(freshMsg.id || freshMsg.message_id);
                        const localMsg = this.activeMessages.find(m => Number(m.id || m.message_id) === mid);
                        if (localMsg) {
                            // Check if content or updated_at changed (Edit)
                            if (localMsg.content !== freshMsg.content || localMsg.updated_at !== freshMsg.updated_at) {
                                this.handleMessageEdited(freshMsg);
                            }
                            // Check if reactions changed
                            const freshR = JSON.stringify(freshMsg.reactions || []);
                            const localR = JSON.stringify(localMsg.reactions || []);
                            if (freshR !== localR) {
                                localMsg.reactions = freshMsg.reactions;
                                const msgRow = document.getElementById(`msgRow-${mid}`);
                                if (msgRow && typeof window.messagesModule !== 'undefined') {
                                    const badgeTray = msgRow.querySelector('.reaction-badges');
                                    if (badgeTray) badgeTray.remove();
                                    
                                    const reactionCounts = {};
                                    let userReacted = null;
                                    (freshMsg.reactions || []).forEach(r => {
                                        reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
                                        if (r.user_id === currentUserId) userReacted = r.emoji;
                                    });
                                    if (Object.keys(reactionCounts).length > 0) {
                                        let rHtml = '<div class="reaction-badges">';
                                        for (const [em, cnt] of Object.entries(reactionCounts)) {
                                            rHtml += `
                                                <button type="button" class="reaction-pill ${userReacted === em ? 'user-reacted' : ''}" data-msg-id="${mid}" data-emoji="${em}">
                                                    <span>${em}</span>
                                                    ${cnt > 1 ? `<span style="font-size:10px; font-weight:700;">${cnt}</span>` : ''}
                                                </button>
                                            `;
                                        }
                                        rHtml += '</div>';
                                        msgRow.insertAdjacentHTML('beforeend', rHtml);
                                    }
                                }
                            }
                        }
                    });

                    // C. Detect deleted messages
                    const deletedIds = this.activeMessages
                        .map(m => Number(m.id || m.message_id))
                        .filter(id => !freshIds.has(id));
                    deletedIds.forEach(delId => {
                        this.handleMessageDeleted(delId);
                    });

                    this.activeMessages = freshMessages;
                }
            }

            // 2. Sync Sidebar Conversation List (Latest snippets, unread badges, new chats)
            this._syncCycleCount = (this._syncCycleCount || 0) + 1;
            if (this._syncCycleCount % 2 === 0 && typeof window.appController !== 'undefined') {
                window.appController.loadConversations(false);
            }

        } catch (err) {
            // Silent error suppression
        } finally {
            this._isSyncing = false;
        }
    }

    setupPollingFallback() {
        this.activateRealTimeSync();

        // Adjust sync frequency when user switches tabs
        document.addEventListener('visibilitychange', () => {
            if (window.wsClient && window.wsClient.isConnected) return;
            this.activateRealTimeSync();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('chatApp')) {
        window.chatController = new ChatController();
    }
});