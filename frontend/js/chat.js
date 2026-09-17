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
            voiceBar: document.getElementById('composerVoiceBar'),
            voiceTimer: document.getElementById('voiceRecordingTimer'),
            voiceCancelBtn: document.getElementById('voiceCancelBtn'),
            voiceSendBtn: document.getElementById('voiceSendBtn'),
            composerBar: document.querySelector('.chat-composer'),
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
            closeDrawerBtn: document.getElementById('closeDrawerBtn')
        };

        this.init();
    }

    init() {
        this.setupComposer();
        this.setupVoiceRecording();
        this.setupEmojiPicker();
        this.setupAttachments();
        this.setupMobileBack();
        this.setupDrawer();
        this.setupChatSearch();
        this.setupHeaderMoreMenu();
        this.setupWebSocketListeners();
    }

    // ---------------- DIRECT CHAT SELECTION ----------------
    async openDirectChat(partner) {
        this.activeType = 'direct';
        this.activeId = partner.id;
        this.activePartner = partner;
        this.clearReplying();
        this.closeMoreMenu();

        // Update Header UI
        if (this.dom.partnerName) {
            this.dom.partnerName.textContent = partner.name || partner.full_name || partner.username;
        }
        if (this.dom.partnerInitials) {
            const name = partner.name || partner.full_name || partner.username || '??';
            this.dom.partnerInitials.textContent = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        }

        const isOnline = !!partner.is_online;
        if (this.dom.partnerPresence) {
            this.dom.partnerPresence.textContent = isOnline ? 'Online' : (partner.last_seen ? `Last seen ${messagesModule.formatRelativeTime(partner.last_seen)}` : 'Offline');
            this.dom.partnerPresence.className = `chat-partner-presence ${isOnline ? 'online' : ''}`;
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
            document.getElementById('chatWindow')?.classList.add('mobile-open');
            const panel = document.getElementById('conversationPanel');
            if (panel) panel.style.display = 'none';
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
        this.closeMoreMenu();

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
            document.getElementById('chatWindow')?.classList.add('mobile-open');
            const panel = document.getElementById('conversationPanel');
            if (panel) panel.style.display = 'none';
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
            const parsed = messagesModule.parseDate(msg.created_at);
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
        this.updateComposerButtons();

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

    appendMessage(msg, currentUserId) {
        if (!this.dom.messagesContainer) return;

        // Prevent duplicates
        if (msg.id && this.dom.messagesContainer.querySelector(`[data-message-id="${msg.id}"]`)) {
            return;
        }

        const empty = this.dom.messagesContainer.querySelector('.empty-state');
        if (empty) empty.remove();

        // Check if date divider is needed
        const lastMsg = this.activeMessages[this.activeMessages.length - 1];
        const newD = messagesModule.parseDate(msg.created_at);
        const lastD = lastMsg ? messagesModule.parseDate(lastMsg.created_at) : null;
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
                this.sendMessage();
            }
        });

        this.dom.textarea.addEventListener('input', () => {
            this.autoResizeTextarea();
            this.emitTyping();
            this.updateComposerButtons();
        });

        this.dom.sendBtn?.addEventListener('click', () => this.sendMessage());
        this.dom.cancelReplyBtn?.addEventListener('click', () => this.clearReplying());

        this.updateComposerButtons();
    }

    updateComposerButtons() {
        const hasText = (this.dom.textarea?.value || '').trim().length > 0;
        if (this.dom.sendBtn) this.dom.sendBtn.style.display = hasText ? 'flex' : 'none';
        if (this.dom.micBtn) this.dom.micBtn.style.display = hasText ? 'none' : 'flex';
    }

    // ---------------- VOICE RECORDING ----------------
    setupVoiceRecording() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.mediaStream = null;
        this.recordingTimer = null;
        this.recordingDuration = 0;

        this.dom.micBtn?.addEventListener('click', () => this.startVoiceRecording());
        this.dom.voiceCancelBtn?.addEventListener('click', () => this.cancelVoiceRecording());
        this.dom.voiceSendBtn?.addEventListener('click', () => this.stopAndSendVoiceRecording());
    }

    async startVoiceRecording() {
        if (!this.activeId) {
            showToast('Please select a conversation first', 'info');
            return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showToast('Voice recording is not supported in this browser', 'warning');
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaStream = stream;

            const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? { mimeType: 'audio/webm;codecs=opus' }
                : (MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {});

            this.mediaRecorder = new MediaRecorder(stream, options);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    this.audioChunks.push(e.data);
                }
            };

            this.mediaRecorder.start(100);

            // Toggle recording UI
            if (this.dom.composerBar) this.dom.composerBar.style.display = 'none';
            if (this.dom.voiceBar) this.dom.voiceBar.style.display = 'flex';

            this.recordingDuration = 0;
            if (this.dom.voiceTimer) this.dom.voiceTimer.textContent = '00:00';

            this.recordingTimer = setInterval(() => {
                this.recordingDuration++;
                const mins = Math.floor(this.recordingDuration / 60).toString().padStart(2, '0');
                const secs = (this.recordingDuration % 60).toString().padStart(2, '0');
                if (this.dom.voiceTimer) this.dom.voiceTimer.textContent = `${mins}:${secs}`;
            }, 1000);

        } catch (err) {
            console.error('Microphone access error:', err);
            showToast('Microphone access is required to record voice messages', 'warning');
        }
    }

    cleanupRecordingUI() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.dom.voiceBar) this.dom.voiceBar.style.display = 'none';
        if (this.dom.composerBar) this.dom.composerBar.style.display = 'flex';
        if (this.dom.voiceTimer) this.dom.voiceTimer.textContent = '00:00';
    }

    cancelVoiceRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        this.audioChunks = [];
        this.cleanupRecordingUI();
        showToast('Voice recording cancelled', 'info', 1500);
    }

    async stopAndSendVoiceRecording() {
        if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;

        this.mediaRecorder.onstop = async () => {
            const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });
            this.cleanupRecordingUI();

            if (audioBlob.size < 500) {
                showToast('Voice message too short', 'info');
                return;
            }

            try {
                showToast('Sending voice message...', 'info', 1000);
                const filename = `voice_${Date.now()}.webm`;
                const file = new File([audioBlob], filename, { type: mimeType });

                const partnerId = this.activeType === 'direct' ? this.activeId : null;
                const groupId = this.activeType === 'group' ? this.activeId : null;

                const doc = await api.uploadFile(file, partnerId, groupId);
                await api.sendMessage({
                    recipient_id: partnerId,
                    group_id: groupId,
                    content: 'Voice message',
                    message_type: 'audio',
                    file_id: doc.id
                });
            } catch (err) {
                console.error('Voice send error:', err);
                showToast(err.message || 'Failed to send voice message', 'error');
            }
        };

        this.mediaRecorder.stop();
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
        this.replyTo = { id, sender, content };
        if (this.dom.replySender) this.dom.replySender.textContent = `Replying to ${sender}`;
        if (this.dom.replyText) this.dom.replyText.textContent = content;
        if (this.dom.replyStrip) this.dom.replyStrip.classList.add('show');
        this.dom.textarea?.focus();
    }

    clearReplying() {
        this.replyTo = null;
        if (this.dom.replyStrip) this.dom.replyStrip.classList.remove('show');
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

                if (window.documentsController) {
                    if (action === 'doc') {
                        window.documentsController.selectDocument('doc');
                    } else if (action === 'photo') {
                        window.documentsController.selectDocument('photo');
                    } else {
                        window.documentsController.selectDocument('all');
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
    }

    closeMoreMenu() {
        this.dom.chatMoreMenu?.classList.remove('show');
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
            document.getElementById('chatWindow')?.classList.remove('mobile-open');
            const panel = document.getElementById('conversationPanel');
            if (panel) panel.style.display = 'flex';
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

        const name = target.name || target.full_name || target.username || 'Conversation';
        if (nameEl) nameEl.textContent = name;
        if (initialsEl) {
            initialsEl.textContent = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        }

        if (isGroup) {
            if (subtitleEl) subtitleEl.textContent = `${target.members_count || 1} members`;
            if (bioEl) bioEl.textContent = target.description || 'No group description provided.';
            if (tabsBar) tabsBar.style.display = 'flex';
            if (membersSec) membersSec.style.display = 'block';
            if (leaveBtn) leaveBtn.style.display = 'block';

            this.loadGroupMembersList(target.id);
        } else {
            if (subtitleEl) subtitleEl.textContent = target.frank_id ? `@${target.username || 'user'} • ID: ${target.frank_id}` : `@${target.username || 'user'}`;
            let bio = target.bio || 'Productive conversations powered by FRANK.';
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
        if (!listContainer) return;

        listContainer.innerHTML = '<div class="spinner" style="margin: 15px auto;"></div>';

        try {
            const members = await api.getGroupMembers(groupId);
            listContainer.innerHTML = '';

            if (!members || members.length === 0) {
                listContainer.innerHTML = '<div style="font-size:12px; color:var(--text-muted); text-align:center;">No members found</div>';
                return;
            }

            const currentUser = auth.getUser() || {};
            const myMembership = members.find(m => m.user_id === currentUser.id);
            const myRole = myMembership ? myMembership.role : 'member';

            const deleteGroupBtn = document.getElementById('drawerDeleteGroupBtn');
            const leaveGroupBtn = document.getElementById('drawerLeaveGroupBtn');

            if (myRole === 'owner') {
                if (deleteGroupBtn) deleteGroupBtn.style.display = 'block';
                if (leaveGroupBtn) leaveGroupBtn.style.display = 'none';
            } else {
                if (deleteGroupBtn) deleteGroupBtn.style.display = 'none';
                if (leaveGroupBtn) leaveGroupBtn.style.display = 'block';
            }

            members.forEach(m => {
                const u = m.user || {};
                const initials = (u.full_name || u.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const isSelf = u.id === currentUser.id;

                let roleBadge = '<span class="badge-member">Member</span>';
                if (m.role === 'owner') {
                    roleBadge = '<span class="badge-owner">Owner</span>';
                } else if (m.role === 'admin') {
                    roleBadge = '<span class="badge-admin">Admin</span>';
                }

                let controlsHtml = '';
                if (!isSelf) {
                    if (myRole === 'owner') {
                        controlsHtml = `
                            <select class="member-role-select" onchange="window.groupsModule.changeMemberRole(${groupId}, ${u.id}, this.value, '${messagesModule.escapeHTML(u.full_name)}')">
                                <option value="member" ${m.role === 'member' ? 'selected' : ''}>Member</option>
                                <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
                            </select>
                            <button type="button" class="btn btn-ghost btn-sm" style="color:var(--danger); padding:2px 6px; font-size:11px;" title="Remove from group" onclick="window.groupsModule.removeMember(${groupId}, ${u.id}, '${messagesModule.escapeHTML(u.full_name)}')">✕</button>
                        `;
                    } else if (myRole === 'admin' && m.role === 'member') {
                        controlsHtml = `
                            <button type="button" class="btn btn-ghost btn-sm" style="color:var(--danger); padding:2px 6px; font-size:11px;" title="Remove from group" onclick="window.groupsModule.removeMember(${groupId}, ${u.id}, '${messagesModule.escapeHTML(u.full_name)}')">✕</button>
                        `;
                    }
                }

                const row = document.createElement('div');
                row.className = 'drawer-member-row';
                row.style.display = 'flex';
                row.style.alignItems = 'center';
                row.style.justifyContent = 'space-between';
                row.style.gap = '8px';
                row.style.padding = '6px 0';
                row.style.borderBottom = '1px solid var(--border-light, rgba(255,255,255,0.05))';

                row.innerHTML = `
                    <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
                        <div class="avatar avatar-sm">
                            <span>${initials}</span>
                            <span class="avatar-status ${u.is_online ? 'online' : 'offline'}"></span>
                        </div>
                        <div style="min-width:0; flex:1;">
                            <div style="font-size:13px; font-weight:700; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${messagesModule.escapeHTML(u.full_name)} ${isSelf ? '<span style="font-size:10px; color:var(--text-muted); font-weight:normal;">(You)</span>' : ''}
                            </div>
                            <div style="font-size:11px; color:var(--text-muted); display:flex; align-items:center; gap:4px;">
                                <span>@${messagesModule.escapeHTML(u.username)}</span>
                                ${u.frank_id ? `<span style="font-family:monospace; font-size:9px; color:var(--primary);">${u.frank_id}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                        ${roleBadge}
                        ${controlsHtml}
                    </div>
                `;
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
                        <button type="button" class="btn btn-ghost btn-icon btn-sm msg-doc-open-btn" data-file-id="${doc.id}" data-file-type="${category}" data-filename="${messagesModule.escapeHTML(doc.original_filename)}" title="Open Document">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        </button>
                        <button type="button" class="btn btn-ghost btn-icon btn-sm msg-doc-download-btn" data-file-id="${doc.id}" data-filename="${messagesModule.escapeHTML(doc.original_filename)}" title="Download">
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

    handleMessageEdited(msg) {
        if (!msg) return;
        const msgId = msg.id || msg.message_id;
        const found = this.activeMessages.find(m => m.id === msgId);
        if (found) {
            found.content = msg.content;
            found.updated_at = msg.updated_at;
        }

        const row = document.getElementById(`msgRow-${msgId}`);
        if (row) {
            const textEl = row.querySelector('.message-text-content');
            if (textEl) {
                textEl.innerHTML = messagesModule.escapeHTML(msg.content);
            }
            const timeEl = row.querySelector('.message-time');
            if (timeEl) {
                const createdAt = msg.created_at || (found ? found.created_at : null);
                const timeFormatted = messagesModule.formatMessageTimestamp(createdAt);
                timeEl.textContent = `${timeFormatted} · Edited`;
                timeEl.title = `Sent: ${messagesModule.formatMessageTimestamp(createdAt)} · Edited: ${messagesModule.formatMessageTimestamp(msg.updated_at)}`;
            }
        }
    }

    // ---------------- WEBSOCKET LISTENERS ----------------
    setupWebSocketListeners() {
        if (!window.wsClient) return;

        // 1. Incoming Messages
        window.wsClient.on('message', (data) => {
            const msg = data.message || (data.id ? data : null);
            if (!msg) return;

            const currentUser = auth.getUser();
            const currentUserId = currentUser ? Number(currentUser.id) : null;
            const senderId = Number(msg.sender_id);
            const recipientId = msg.recipient_id ? Number(msg.recipient_id) : null;
            const activeId = this.activeId ? Number(this.activeId) : null;
            const groupId = msg.group_id ? Number(msg.group_id) : null;

            const isDirectForActiveChat = this.activeType === 'direct' &&
                ((senderId === activeId && recipientId === currentUserId) ||
                 (senderId === currentUserId && recipientId === activeId));

            const isGroupForActiveChat = this.activeType === 'group' && groupId === activeId;

            if (isDirectForActiveChat || isGroupForActiveChat) {
                this.appendMessage(msg, currentUserId);

                if (senderId === activeId) {
                    window.wsClient.sendRead([msg.id]);
                }
            }

            // Notification for background incoming messages
            if (senderId !== currentUserId) {
                if (typeof window.notificationsModule !== 'undefined') {
                    window.notificationsModule.notifyIncoming(msg);
                }
            }

            // Refresh conversation preview in sidebar
            if (typeof window.appController !== 'undefined') {
                window.appController.loadConversations(false);
            }
        });

        // 2. Message Edit Events
        window.wsClient.on('message_edit', (data) => {
            const msg = data.message || (data.message_id ? data : null);
            if (msg) {
                this.handleMessageEdited(msg);
                if (typeof window.appController !== 'undefined') {
                    window.appController.loadConversations(false);
                }
            }
        });

        // Message Deleted Events
        window.wsClient.on('message_deleted', (data) => {
            const msgId = data.message_id;
            if (msgId) {
                const row = document.getElementById(`msgRow-${msgId}`);
                if (row) row.remove();
                this.activeMessages = this.activeMessages.filter(m => m.id !== msgId);
                if (typeof window.appController !== 'undefined') {
                    window.appController.loadConversations(false);
                }
            }
        });

        // 3. Typing Events
        window.wsClient.on('typing', (data) => {
            const isDirect = this.activeType === 'direct' && data.sender_id === this.activeId;
            const isGroup = this.activeType === 'group' && data.group_id === this.activeId && data.sender_id !== (auth.getUser()?.id);

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

        // 3. Presence Updates
        window.wsClient.on('presence', (data) => {
            if (this.activeType === 'direct' && data.user_id === this.activeId) {
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
}

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('chatApp')) {
        window.chatController = new ChatController();
    }
});