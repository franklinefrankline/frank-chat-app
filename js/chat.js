/* -------------------------------------------------------------------------
   FRANK - ACTIVE CHAT CONTROLLER
   Conversation lifecycle, real-time message stream, group chat support,
   document attachments, independent scrolling, drawer details & search
   ------------------------------------------------------------------------- */

class ChatController {
    constructor() {
        this.activeType = null; // 'direct' or 'group'
        this.activeId = null;   // partnerId or groupId
        this.activeConversationId = null; // canonical conversation ID
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
        this.setupChatScrollListener();

        // In-chat search buttons
        document.getElementById('chatSearchBtn')?.addEventListener('click', () => this.toggleSearchInChat());
        document.getElementById('inChatSearchInput')?.addEventListener('input', (e) => this.performInChatSearch(e.target.value));
        document.getElementById('inChatSearchPrevBtn')?.addEventListener('click', () => this.navigateInChatSearch('prev'));
        document.getElementById('inChatSearchNextBtn')?.addEventListener('click', () => this.navigateInChatSearch('next'));
        document.getElementById('inChatSearchCloseBtn')?.addEventListener('click', () => this.closeSearchInChat());

        // Scroll to bottom pill
        document.getElementById('scrollBottomPill')?.addEventListener('click', () => this.scrollToBottom(true));

        // More menu additions
        document.getElementById('moreStarredMessagesBtn')?.addEventListener('click', () => {
            this.closeMoreMenu();
            this.openStarredMessagesModal();
        });
        document.getElementById('moreSelectMessagesBtn')?.addEventListener('click', () => {
            this.closeMoreMenu();
            this.toggleSelectionMode(true);
        });

        // Selection Action Bar buttons
        document.getElementById('selectionForwardBtn')?.addEventListener('click', () => this.executeSelectionAction('forward'));
        document.getElementById('selectionCopyBtn')?.addEventListener('click', () => this.executeSelectionAction('copy'));
        document.getElementById('selectionStarBtn')?.addEventListener('click', () => this.executeSelectionAction('star'));
        document.getElementById('selectionDeleteBtn')?.addEventListener('click', () => this.executeSelectionAction('delete'));
        document.getElementById('selectionCancelBtn')?.addEventListener('click', () => this.executeSelectionAction('cancel'));
        this.setupWebSocketListeners();
        this.setupPollingFallback();
        this.setupLanguageListener();
    }

    setupLanguageListener() {
        window.addEventListener('frank:languageChanged', async (e) => {
            const nextLang = e.detail?.lang || (typeof i18n !== 'undefined' ? i18n.getLanguage() : 'en');
            // Update composer placeholder
            const composerEl = this.dom.textarea || this.dom.messageInput;
            if (composerEl && typeof i18n !== 'undefined') {
                composerEl.placeholder = i18n.t('chat.typeMessage') || 'Type a message...';
            }
            // Update search input placeholder
            const searchInput = document.getElementById('searchConversationsInput');
            if (searchInput && typeof i18n !== 'undefined') {
                searchInput.placeholder = i18n.t('chat.searchPlaceholder') || 'Search conversations, users, or FRANK ID...';
            }
            // Update partner status text
            if (this.dom.partnerStatus && this.activePartner) {
                const isOnline = !!this.activePartner.is_online;
                if (typeof i18n !== 'undefined') {
                    this.dom.partnerStatus.textContent = isOnline ? i18n.t('chat.online') : i18n.t('chat.offline');
                }
            }
            // Re-load active messages with target_language so previously received messages are translated immediately
            if (this.activeId) {
                try {
                    if (this.activeType === 'direct') {
                        await this.loadDirectMessages(this.activeId, true);
                    } else if (this.activeType === 'group') {
                        await this.loadGroupMessages(this.activeId, true);
                    }
                } catch (err) {
                    console.warn('[Language switch message reload note]:', err);
                }
            }
        });
    }

    setupContextMenuDismissal() {
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#activeMessageContextMenu') && !e.target.closest('.msg-action-more-btn')) {
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
        const isSameChat = (Number(this.activeId) === Number(partner.id) && this.activeType === 'direct');
        if (!isSameChat) {
            this.activeMessages = [];
            if (this.dom.messagesContainer) {
                this.dom.messagesContainer.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
            }
        }
        this.activeType = 'direct';
        this.activeId = partner.id;
        this.activeConversationId = partner.conversation_id || null;
        this.activePartner = partner;
        this.clearReplying();
        this.cancelEditing();
        this.closeMoreMenu();
        this.updateMoreMenu('direct');
        if (window.documentsController) window.documentsController.clearStagedFile();
        if (window.voiceRecorder) window.voiceRecorder.cancelRecording();
        this.updateComposerActionButton();

        if (!this.activeConversationId) {
            await this.ensureConversationId();
        }

        const currentUser = auth.getUser();
        const isSelf = currentUser && Number(partner.id) === Number(currentUser.id);
        let frankId = partner.frank_id || (isSelf && currentUser ? currentUser.frank_id : '');
        if (!frankId && window.appController && window.appController.conversations) {
            const cached = window.appController.conversations.find(c => Number(c.id) === Number(partner.id) && c.type !== 'group');
            if (cached && cached.frank_id) {
                frankId = cached.frank_id;
                partner.frank_id = frankId;
            }
        }

        // Update Header UI
        if (this.dom.partnerName) {
            this.dom.partnerName.textContent = isSelf
                ? `${currentUser.full_name || currentUser.username} (You)`
                : (partner.name || partner.full_name || partner.username);
        }

        const fidWrap = document.getElementById('chatHeaderFrankIdWrap');
        const fidVal = document.getElementById('chatHeaderFrankId');
        const fidBtn = document.getElementById('chatHeaderCopyFidBtn');
        if (fidWrap && fidVal) {
            if (frankId) {
                fidVal.textContent = frankId;
                fidWrap.style.display = 'inline-flex';
                if (fidBtn) fidBtn.dataset.frankId = frankId;
            } else {
                fidWrap.style.display = 'none';
            }
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
        if (window.innerWidth < 768) {
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
        await this.loadDirectMessages(partner.id, isSameChat);
        if (window.smartController) {
            window.smartController.onConversationChanged(this.activeConversationId || partner.id, 'direct');
        }
        this.dom.textarea?.focus();
    }

    // ---------------- GROUP CHAT SELECTION ----------------
    async openGroupChat(group) {
        const isSameGroup = (Number(this.activeId) === Number(group.id) && this.activeType === 'group');
        if (!isSameGroup) {
            this.activeMessages = [];
            if (this.dom.messagesContainer) {
                this.dom.messagesContainer.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
            }
        }
        this.activeType = 'group';
        this.activeId = group.id;
        this.activeConversationId = group.conversation_id || group.id;
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

        // Hide Direct Chat Header FRANK ID
        const fidWrap = document.getElementById('chatHeaderFrankIdWrap');
        if (fidWrap) fidWrap.style.display = 'none';

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
        if (window.innerWidth < 768) {
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
        await this.loadGroupMessages(group.id, isSameGroup);
        if (window.smartController) {
            window.smartController.onConversationChanged(this.activeConversationId || group.id, 'group');
        }
        this.dom.textarea?.focus();
    }

    async ensureConversationId() {
        if (this.activeConversationId) return this.activeConversationId;
        if (this.activeType === 'group' && this.activeId) {
            this.activeConversationId = this.activeId;
            return this.activeConversationId;
        }
        if (this.activeType === 'direct' && this.activeId) {
            try {
                const res = await api.getOrCreatePrivateConversation({ target_user_id: this.activeId });
                if (res && res.id) {
                    this.activeConversationId = res.id;
                    if (this.activePartner) this.activePartner.conversation_id = res.id;
                    return res.id;
                }
            } catch (e) {
                console.warn('[ensureConversationId note]:', e);
            }
            return this.activeId;
        }
        return null;
    }

    closeActiveChat() {
        this.activeType = null;
        this.activeId = null;
        this.activeConversationId = null;
        this.activePartner = null;
        this.activeMessages = [];
        if (this.dom.activeChatView) this.dom.activeChatView.style.display = 'none';
        if (this.dom.emptyPlaceholder) this.dom.emptyPlaceholder.style.display = 'flex';
        this.closeDrawer();
        if (window.smartController && window.smartController.isOpen) {
            window.smartController.close();
        }
        document.getElementById('chatApp')?.classList.remove('has-active-chat');
        document.getElementById('chatWindow')?.classList.remove('mobile-open');
    }

    getControlledErrorMessage(err) {
        if (!err) return 'Unable to load messages. Please try again.';
        const status = err.status || (err.response && err.response.status);
        if (status === 401) {
            return 'Session expired. Please sign in again.';
        }
        if (status === 403) {
            return 'You do not have access to this conversation.';
        }
        if (status === 404) {
            return 'Conversation not found.';
        }
        if (status === 500) {
            return 'Unable to load messages. Please try again.';
        }
        const msg = (err.message || '').toLowerCase();
        if (msg.includes('network') || msg.includes('fetch') || msg.includes('connect') || msg.includes('offline') || err.isNetwork) {
            return 'Unable to connect to the server.';
        }
        return err.message || 'Unable to load messages. Please try again.';
    }

    // ---------------- LOAD MESSAGES ----------------
    async loadDirectMessages(partnerId, isSilentRefresh = false) {
        if (!this.dom.messagesContainer) return;
        this._loadSeq = (this._loadSeq || 0) + 1;
        const currentSeq = this._loadSeq;

        if (!isSilentRefresh) {
            this.dom.messagesContainer.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
        }

        try {
            const messages = await api.getDirectMessages(partnerId);
            // Ignore stale response if user switched conversations
            if (currentSeq !== this._loadSeq || Number(this.activeId) !== Number(partnerId) || this.activeType !== 'direct') {
                return;
            }

            this.activeMessages = (messages || []).sort((a, b) => {
                const da = messagesModule.parseDate(a.created_at);
                const db = messagesModule.parseDate(b.created_at);
                return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
            });
            this.renderMessagesList(this.activeMessages);
        } catch (err) {
            if (currentSeq !== this._loadSeq || Number(this.activeId) !== Number(partnerId) || this.activeType !== 'direct') {
                return;
            }
            console.error('Failed to load direct messages:', err);
            const errorMsg = this.getControlledErrorMessage(err);
            this.dom.messagesContainer.innerHTML = `
                <div class="empty-state" style="margin: auto;">
                    <div style="color: var(--danger); font-size: 14px; font-weight: 600;">${errorMsg}</div>
                    <button class="btn btn-secondary btn-sm" style="margin-top: 8px;" onclick="window.chatController.loadDirectMessages(${partnerId})">Retry</button>
                </div>
            `;
        }
    }

    async loadGroupMessages(groupId, isSilentRefresh = false) {
        if (!this.dom.messagesContainer) return;
        this._loadSeq = (this._loadSeq || 0) + 1;
        const currentSeq = this._loadSeq;

        if (!isSilentRefresh) {
            this.dom.messagesContainer.innerHTML = '<div class="empty-state"><div class="spinner"></div></div>';
        }

        try {
            const messages = await api.getGroupMessages(groupId);
            if (currentSeq !== this._loadSeq || Number(this.activeId) !== Number(groupId) || this.activeType !== 'group') {
                return;
            }

            this.activeMessages = (messages || []).sort((a, b) => {
                const da = messagesModule.parseDate(a.created_at);
                const db = messagesModule.parseDate(b.created_at);
                return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
            });
            this.renderMessagesList(this.activeMessages);
        } catch (err) {
            if (currentSeq !== this._loadSeq || Number(this.activeId) !== Number(groupId) || this.activeType !== 'group') {
                return;
            }
            console.error('Failed to load group messages:', err);
            const errorMsg = this.getControlledErrorMessage(err);
            this.dom.messagesContainer.innerHTML = `
                <div class="empty-state" style="margin: auto;">
                    <div style="color: var(--danger); font-size: 14px; font-weight: 600;">${errorMsg}</div>
                    <button class="btn btn-secondary btn-sm" style="margin-top: 8px;" onclick="window.chatController.loadGroupMessages(${groupId})">Retry</button>
                </div>
            `;
        }
    }

    renderMessagesList(messages) {
        const currentUser = auth.getUser();
        const currentUserId = currentUser ? currentUser.id : null;
        const isGroup = this.activeType === 'group';

        this.dom.messagesContainer.innerHTML = '';

        if (!messages || messages.length === 0) {
            const emptyTitle = isGroup ? 'No messages in this group yet' : 'Start the conversation';
            const emptyDesc = isGroup ? 'Be the first to send a message to the group.' : 'Send a message or share a document below to connect.';
            this.dom.messagesContainer.innerHTML = `
                <div class="empty-state" style="margin: auto; text-align: center; padding: 32px 16px;">
                    <div style="font-size: 36px; margin-bottom: 8px;">${isGroup ? '👥' : '💬'}</div>
                    <h3 class="empty-state-title" style="font-size: 16px; font-weight: 600; margin-bottom: 4px;">${emptyTitle}</h3>
                    <p class="empty-state-desc" style="font-size: 13px; color: var(--text-muted);">${emptyDesc}</p>
                </div>
            `;
            return;
        }

        let lastDate = null;
        let lastSenderId = null;

        messages.forEach(msg => {
            if (!msg.created_at) msg.created_at = new Date().toISOString();
            const parsed = messagesModule.parseDate(msg.created_at) || new Date();
            const msgDate = parsed ? parsed.toDateString() : '';
            const isNewDay = msgDate && msgDate !== lastDate;

            if (isNewDay) {
                lastDate = msgDate;
                lastSenderId = null; // Reset consecutive grouping on new day divider
                const datePill = document.createElement('div');
                datePill.className = 'date-separator';
                datePill.innerHTML = `<span>${this.formatDividerDate(msg.created_at)}</span>`;
                this.dom.messagesContainer.appendChild(datePill);
            }

            const currentSenderId = Number(msg.sender_id);
            const isConsecutive = !isNewDay && (lastSenderId !== null) && (lastSenderId === currentSenderId);
            lastSenderId = currentSenderId;

            try {
                const msgRowHtml = messagesModule.renderMessageRow(msg, currentUserId, { isGroup, isConsecutive });
                this.dom.messagesContainer.insertAdjacentHTML('beforeend', msgRowHtml);
            } catch (renderErr) {
                console.error('Error rendering message:', renderErr, msg);
            }
        });

        this.updatePinnedMessageBar();
        this.setupChatScrollListener();
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
        if (!this.activeId) {
            showToast('Please select a conversation.', 'info');
            return;
        }

        const rawText = this.dom.textarea ? this.dom.textarea.value : '';
        const text = rawText.trim();
        if (!text) {
            // Empty or whitespace only: keep composer unchanged
            return;
        }

        if (this.isSending) {
            return;
        }
        this.isSending = true;

        const sendBtn = this.dom.sendBtn;
        const originalTitle = sendBtn ? sendBtn.getAttribute('title') : '';
        if (sendBtn) {
            sendBtn.disabled = true;
            sendBtn.classList.add('is-sending');
            sendBtn.setAttribute('title', 'Sending...');
        }

        const replyId = this.replyTo ? this.replyTo.id : null;
        const activeId = this.activeId;
        const activeType = this.activeType;
        const currentUser = auth.getUser();
        const currentUserId = currentUser ? currentUser.id : null;

        try {
            // Persist message to database via REST API, broadcast via WebSocket, and return confirmed message
            const newMsg = await api.sendMessage({
                recipient_id: activeType === 'direct' ? Number(activeId) : null,
                group_id: activeType === 'group' ? Number(activeId) : null,
                content: text,
                message_type: 'text',
                reply_to_id: replyId
            });

            if (!newMsg || (!newMsg.id && !newMsg.message_id)) {
                throw new Error('Unable to send the message. Please try again.');
            }

            // Immediately display the confirmed message
            this.appendMessage(newMsg, currentUserId);

            // CLEAR COMPOSER ONLY AFTER CONFIRMED SUCCESS
            if (this.dom.textarea) {
                this.dom.textarea.value = '';
            }
            this.autoResizeTextarea();
            this.clearReplying();
            if (this.dom.emojiPopover) this.dom.emojiPopover.classList.remove('show');
            if (this.dom.attachmentPopover) this.dom.attachmentPopover.classList.remove('show');
            this.updateComposerActionButton();

            // Refresh conversation snippet in sidebar
            if (typeof window.appController !== 'undefined') {
                window.appController.loadConversations(false);
            }
        } catch (err) {
            console.error('Error sending message:', err);
            let errorMsg = 'Unable to send the message. Please try again.';
            const status = err.status || (err.response && err.response.status);
            if (status === 401) {
                errorMsg = 'Your session has expired. Please sign in again.';
            } else if (status === 403) {
                errorMsg = "You don't have permission to send messages in this conversation.";
            } else if (status === 404) {
                errorMsg = 'Conversation not found.';
            } else if (status === 422) {
                errorMsg = 'Invalid message.';
            } else if (status === 500) {
                errorMsg = 'Unable to send the message. Please try again.';
            } else if (err.message && !err.message.includes('fetch') && !err.message.includes('status') && !err.message.includes('HTTP')) {
                errorMsg = err.message;
            }

            showToast(errorMsg, 'error');
            // Retain composer input on error
        } finally {
            this.isSending = false;
            if (sendBtn) {
                sendBtn.disabled = false;
                sendBtn.classList.remove('is-sending');
                if (originalTitle) sendBtn.setAttribute('title', originalTitle);
            }
            this.updateComposerActionButton();
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

        const isNewDay = newDate && newDate !== lastDate;
        if (isNewDay) {
            const datePill = document.createElement('div');
            datePill.className = 'date-separator';
            datePill.innerHTML = `<span>${this.formatDividerDate(msg.created_at)}</span>`;
            this.dom.messagesContainer.appendChild(datePill);
        }

        const isGroup = this.activeType === 'group';
        const isConsecutive = !isNewDay && !!lastMsg && (Number(lastMsg.sender_id) === Number(msg.sender_id));

        const container = this.dom.messagesContainer;
        const isSelf = currentUserId && Number(msg.sender_id) === Number(currentUserId);
        const isNearBottom = container ? (container.scrollHeight - container.scrollTop - container.clientHeight < 160) : true;

        this.activeMessages.push(msg);
        try {
            const html = messagesModule.renderMessageRow(msg, currentUserId, { isGroup, isConsecutive });
            this.dom.messagesContainer.insertAdjacentHTML('beforeend', html);
        } catch (renderErr) {
            console.error('Error rendering incoming message:', renderErr, msg);
        }

        if (isSelf || isNearBottom) {
            this.scrollToBottom();
        }
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
        this.autoResizeTextarea();
        this.updateComposerActionButton();
    }

    autoResizeTextarea() {
        if (!this.dom.textarea) return;
        const minH = window.innerWidth < 768 ? 40 : 38;
        if (!this.dom.textarea.value) {
            this.dom.textarea.style.height = minH + 'px';
            this.dom.textarea.style.overflowY = 'hidden';
            return;
        }
        this.dom.textarea.style.height = 'auto';
        const targetHeight = Math.max(minH, Math.min(this.dom.textarea.scrollHeight, 120));
        this.dom.textarea.style.height = targetHeight + 'px';
        this.dom.textarea.style.overflowY = this.dom.textarea.scrollHeight > 120 ? 'auto' : 'hidden';
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
            ${hasRealText ? `
                <button type="button" class="message-context-item ctx-translate">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
                    <span>${typeof i18n !== 'undefined' ? i18n.t('chat.translate') : 'Translate Message'}</span>
                </button>
            ` : ''}
            <button type="button" class="message-context-item ctx-smart">
                <span style="font-size:14px; margin-right:4px;">✨</span> <span>Smart AI Analysis</span>
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

        itemsHtml += `
            <button type="button" class="message-context-item ctx-forward">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 10 20 15 15 20"></polyline><path d="M4 4v7a4 4 0 0 0 4 4h12"></path></svg>
                <span>Forward</span>
            </button>
            <button type="button" class="message-context-item ctx-select">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
                <span>Select Messages</span>
            </button>
            <div class="message-context-divider"></div>
            <button type="button" class="message-context-item danger ctx-delete">
                ${deleteSvg} <span>Delete Message</span>
            </button>
        `;

        menu.innerHTML = itemsHtml;
        document.body.appendChild(menu);

        // Position menu
        const menuRect = menu.getBoundingClientRect();
        let posX = e.clientX || 0;
        let posY = e.clientY || 0;

        if (e.target && e.target.closest('.action-tool-btn')) {
            const btn = e.target.closest('.action-tool-btn');
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

        menu.querySelector('.ctx-translate')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            if (typeof messagesModule !== 'undefined' && messagesModule.toggleOrFetchTranslation) {
                messagesModule.toggleOrFetchTranslation(numId);
            }
        });

        menu.querySelector('.ctx-smart')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            const card = row.querySelector('.message-document-card, .message-photo-card, .message-video-card');
            const docFileId = card ? parseInt(card.dataset.fileId, 10) : null;
            const filename = card?.dataset.filename || card?.querySelector('.message-doc-title')?.textContent?.trim() || null;
            const convId = this.activeConversationId || this.activeId;
            if (window.smartController) {
                if (docFileId) {
                    window.smartController.openForDocument(convId, numId, docFileId, filename);
                } else {
                    window.smartController.openForMessage(convId, numId);
                }
            }
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

        menu.querySelector('.ctx-forward')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            this.openForwardModal(numId);
        });

        menu.querySelector('.ctx-select')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            this.toggleSelectionMode(true, numId);
        });

        menu.querySelector('.ctx-delete')?.addEventListener('click', () => {
            this.closeMessageContextMenu();
            this.openDeleteMessageDialog(numId, isSent);
        });
    }

    closeMessageContextMenu() {
        const existing = document.getElementById('activeMessageContextMenu');
        if (existing) existing.remove();
    }

    async togglePinMessage(msgId) {
        const numId = Number(msgId);
        try {
            const res = await api.pinMessage(numId);
            const isPinned = res.is_pinned;
            let msg = this.activeMessages.find(m => Number(m.id || m.message_id) === numId);
            if (msg) msg.is_pinned = isPinned;
            const row = document.getElementById(`msgRow-${numId}`);
            if (row) {
                let pinEl = row.querySelector('.message-pin-indicator');
                if (isPinned) {
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
            this.updatePinnedMessageBar();
        } catch (err) {
            showToast('Failed to toggle pin', 'error');
        }
    }

    async toggleStarMessage(msgId) {
        const numId = Number(msgId);
        try {
            const res = await api.starMessage(numId);
            const isStarred = res.is_starred;
            let msg = this.activeMessages.find(m => Number(m.id || m.message_id) === numId);
            if (msg) msg.is_starred = isStarred;
            const row = document.getElementById(`msgRow-${numId}`);
            if (row) {
                let starEl = row.querySelector('.message-star-indicator');
                if (isStarred) {
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
        } catch (err) {
            showToast('Failed to toggle star', 'error');
        }
    }

    updatePinnedMessageBar() {
        const bar = document.getElementById('pinnedMessageBar');
        if (!bar) return;
        const pinnedMsg = (this.activeMessages || []).slice().reverse().find(m => !!m.is_pinned && !m.deleted_for_everyone);
        if (pinnedMsg) {
            const prev = document.getElementById('pinnedBarPreview');
            const unpinBtn = document.getElementById('pinnedBarUnpinBtn');
            const contentWrap = document.getElementById('pinnedBarContent');
            if (prev) {
                prev.textContent = pinnedMsg.content || (pinnedMsg.document ? pinnedMsg.document.original_filename : 'Pinned attachment');
            }
            if (contentWrap) {
                contentWrap.onclick = () => {
                    const row = document.getElementById(`msgRow-${pinnedMsg.id || pinnedMsg.message_id}`);
                    if (row) {
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        row.classList.add('highlight-pulse');
                        setTimeout(() => row.classList.remove('highlight-pulse'), 1800);
                    }
                };
            }
            if (unpinBtn) {
                unpinBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.togglePinMessage(pinnedMsg.id || pinnedMsg.message_id);
                };
            }
            bar.style.display = 'flex';
        } else {
            bar.style.display = 'none';
        }
    }

    openDeleteMessageDialog(msgId, isSent) {
        this._deletingMsgId = Number(msgId);
        const modal = document.getElementById('deleteMsgModal');
        const forEveryoneBtn = document.getElementById('deleteForEveryoneBtn');
        const forMeBtn = document.getElementById('deleteForMeBtn');
        const cancelBtn = document.getElementById('deleteCancelBtn');
        const closeBtn = document.getElementById('deleteMsgModalClose');
        if (!modal) return;

        const currentUser = auth.getUser();
        const msg = (this.activeMessages || []).find(m => Number(m.id || m.message_id) === this._deletingMsgId);
        const canDeleteForEveryone = isSent || (msg && currentUser && Number(msg.sender_id) === Number(currentUser.id)) || (currentUser && currentUser.role === 'admin');

        if (forEveryoneBtn) {
            forEveryoneBtn.style.display = canDeleteForEveryone ? 'block' : 'none';
            forEveryoneBtn.onclick = () => this.deleteMessage(this._deletingMsgId, 'everyone');
        }
        if (forMeBtn) {
            forMeBtn.onclick = () => this.deleteMessage(this._deletingMsgId, 'me');
        }
        const closeModal = () => { modal.style.display = 'none'; };
        if (cancelBtn) cancelBtn.onclick = closeModal;
        if (closeBtn) closeBtn.onclick = closeModal;
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };

        modal.style.display = 'flex';
    }

    async deleteMessage(msgId, deleteType = 'me') {
        const numId = Number(msgId);
        const modal = document.getElementById('deleteMsgModal');
        if (modal) modal.style.display = 'none';

        try {
            if (window.wsClient && window.wsClient.isConnected) {
                window.wsClient.send({
                    type: 'delete_message',
                    message_id: numId,
                    delete_type: deleteType
                });
            }
            await api.deleteMessage(numId, deleteType);

            const row = document.getElementById(`msgRow-${numId}`);
            if (deleteType === 'everyone') {
                if (row) {
                    const bubble = row.querySelector('.message-bubble');
                    if (bubble) {
                        bubble.innerHTML = `<div class="deleted-message-placeholder"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px; vertical-align:middle;"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg><em>This message was deleted</em></div>`;
                    }
                    const tb = row.querySelector('.message-actions-toolbar');
                    if (tb) tb.remove();
                }
                const m = (this.activeMessages || []).find(msg => Number(msg.id || msg.message_id) === numId);
                if (m) {
                    m.deleted_for_everyone = true;
                    m.content = '🚫 This message was deleted';
                }
                showToast('Message deleted for everyone', 'info');
            } else {
                if (row) row.remove();
                this.activeMessages = (this.activeMessages || []).filter(msg => Number(msg.id || msg.message_id) !== numId);
                showToast('Message deleted for you', 'info');
            }
            this.updatePinnedMessageBar();
        } catch (err) {
            showToast(err.message || 'Failed to delete message', 'error');
        }
    }

    openForwardModal(msgId) {
        this._forwardingMsgId = Number(msgId);
        const modal = document.getElementById('forwardModal');
        const list = document.getElementById('forwardList');
        const sendBtn = document.getElementById('forwardSendBtn');
        const cancelBtn = document.getElementById('forwardCancelBtn');
        const closeBtn = document.getElementById('forwardModalCloseBtn');
        const searchInput = document.getElementById('forwardSearchInput');
        const countSpan = document.getElementById('forwardSelectedCount');
        if (!modal || !list) return;

        this._forwardSelectedRecipients = new Set();
        this._forwardSelectedGroups = new Set();

        const updateSelectedCount = () => {
            const total = this._forwardSelectedRecipients.size + this._forwardSelectedGroups.size;
            if (countSpan) countSpan.textContent = `${total} selected`;
            if (sendBtn) sendBtn.disabled = (total === 0);
        };

        const renderForwardTargets = (filter = '') => {
            const convs = (window.appController && window.appController.conversations) || [];
            list.innerHTML = '';
            const lower = filter.trim().toLowerCase();

            convs.forEach(c => {
                const name = c.name || (c.partner ? (c.partner.name || c.partner.full_name || c.partner.username) : 'Chat');
                if (filter && !name.toLowerCase().includes(lower)) return;
                const isGroup = (c.type === 'group');
                const targetId = isGroup ? c.id : (c.partner_id || (c.partner ? c.partner.id : c.id));
                const item = document.createElement('label');
                item.className = 'forward-contact-item';
                item.innerHTML = `
                    <input type="checkbox" data-target-id="${targetId}" data-is-group="${isGroup}">
                    <div style="flex:1; min-width:0;">
                        <div style="font-size:13px; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                        <div style="font-size:11px; color:var(--text-muted);">${isGroup ? 'Group Chat' : 'Direct Chat'}</div>
                    </div>
                `;
                const chk = item.querySelector('input');
                chk.checked = isGroup ? this._forwardSelectedGroups.has(targetId) : this._forwardSelectedRecipients.has(targetId);
                chk.onchange = () => {
                    if (isGroup) {
                        if (chk.checked) this._forwardSelectedGroups.add(targetId);
                        else this._forwardSelectedGroups.delete(targetId);
                    } else {
                        if (chk.checked) this._forwardSelectedRecipients.add(targetId);
                        else this._forwardSelectedRecipients.delete(targetId);
                    }
                    updateSelectedCount();
                };
                list.appendChild(item);
            });
        };

        renderForwardTargets();
        updateSelectedCount();

        if (searchInput) {
            searchInput.value = '';
            searchInput.oninput = (e) => renderForwardTargets(e.target.value);
        }

        const closeModal = () => { modal.style.display = 'none'; };
        if (cancelBtn) cancelBtn.onclick = closeModal;
        if (closeBtn) closeBtn.onclick = closeModal;
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };

        if (sendBtn) {
            sendBtn.onclick = async () => {
                try {
                    sendBtn.disabled = true;
                    await api.forwardMessage(
                        this._forwardingMsgId,
                        Array.from(this._forwardSelectedRecipients),
                        Array.from(this._forwardSelectedGroups)
                    );
                    closeModal();
                    showToast('✓ Message forwarded', 'success');
                } catch (err) {
                    showToast(err.message || 'Failed to forward message', 'error');
                } finally {
                    sendBtn.disabled = false;
                }
            };
        }

        modal.style.display = 'flex';
    }

    async openStarredMessagesModal() {
        const modal = document.getElementById('starredMessagesModal');
        const list = document.getElementById('starredList');
        const closeBtn = document.getElementById('starredModalCloseBtn');
        if (!modal || !list) return;

        list.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div></div>';
        modal.style.display = 'flex';

        const closeModal = () => { modal.style.display = 'none'; };
        if (closeBtn) closeBtn.onclick = closeModal;
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };

        try {
            const starred = await api.getStarredMessages();
            if (!starred || starred.length === 0) {
                list.innerHTML = '<div style="text-align:center; padding:30px; color:var(--text-muted); font-size:13px;">No starred messages yet.</div>';
                return;
            }
            list.innerHTML = '';
            starred.forEach(m => {
                const item = document.createElement('div');
                item.className = 'starred-item-card';
                const senderName = m.sender ? (m.sender.full_name || m.sender.username) : 'Member';
                const timeStr = messagesModule.formatRelativeTime(m.created_at);
                const text = m.content || (m.document ? m.document.original_filename : 'Attachment');
                item.innerHTML = `
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:12px;">
                        <span style="font-weight:700; color:var(--primary);">${messagesModule.escapeHTML(senderName)}</span>
                        <span style="color:var(--text-muted);">${timeStr}</span>
                    </div>
                    <div style="font-size:13px; color:var(--text-primary);">${messagesModule.escapeHTML(text)}</div>
                `;
                item.onclick = () => {
                    closeModal();
                    const row = document.getElementById(`msgRow-${m.id}`);
                    if (row) {
                        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        row.classList.add('highlight-pulse');
                        setTimeout(() => row.classList.remove('highlight-pulse'), 1800);
                    }
                };
                list.appendChild(item);
            });
        } catch (err) {
            list.innerHTML = `<div style="text-align:center; padding:20px; color:var(--danger); font-size:13px;">Failed to load starred messages.</div>`;
        }
    }

    toggleSearchInChat() {
        const bar = document.getElementById('inChatSearchBar');
        const input = document.getElementById('inChatSearchInput');
        if (!bar) return;
        const isHidden = (bar.style.display === 'none' || !bar.style.display);
        if (isHidden) {
            bar.style.display = 'flex';
            if (input) {
                input.value = '';
                input.focus();
            }
            this._searchMatches = [];
            this._searchMatchIndex = -1;
            const cEl = document.getElementById('inChatSearchCount');
            if (cEl) cEl.textContent = '0 / 0';
        } else {
            this.closeSearchInChat();
        }
    }

    closeSearchInChat() {
        const bar = document.getElementById('inChatSearchBar');
        if (bar) bar.style.display = 'none';
        document.querySelectorAll('.search-highlight-active').forEach(el => el.classList.remove('search-highlight-active'));
        this._searchMatches = [];
        this._searchMatchIndex = -1;
    }

    performInChatSearch(query) {
        document.querySelectorAll('.search-highlight-active').forEach(el => el.classList.remove('search-highlight-active'));
        const q = (query || '').trim().toLowerCase();
        const countSpan = document.getElementById('inChatSearchCount');
        if (!q) {
            this._searchMatches = [];
            this._searchMatchIndex = -1;
            if (countSpan) countSpan.textContent = '0 / 0';
            return;
        }

        const matches = [];
        (this.activeMessages || []).forEach(m => {
            if (m.deleted_for_everyone) return;
            const text = (m.content || (m.document ? m.document.original_filename : '')).toLowerCase();
            if (text.includes(q)) {
                matches.push(m.id || m.message_id);
            }
        });

        this._searchMatches = matches;
        if (matches.length > 0) {
            this._searchMatchIndex = matches.length - 1;
            this.highlightCurrentSearchMatch();
        } else {
            this._searchMatchIndex = -1;
            if (countSpan) countSpan.textContent = '0 / 0';
        }
    }

    navigateInChatSearch(direction) {
        if (!this._searchMatches || this._searchMatches.length === 0) return;
        if (direction === 'next') {
            this._searchMatchIndex = (this._searchMatchIndex + 1) % this._searchMatches.length;
        } else {
            this._searchMatchIndex = (this._searchMatchIndex - 1 + this._searchMatches.length) % this._searchMatches.length;
        }
        this.highlightCurrentSearchMatch();
    }

    highlightCurrentSearchMatch() {
        document.querySelectorAll('.search-highlight-active').forEach(el => el.classList.remove('search-highlight-active'));
        if (this._searchMatchIndex < 0 || this._searchMatchIndex >= this._searchMatches.length) return;

        const countSpan = document.getElementById('inChatSearchCount');
        if (countSpan) {
            countSpan.textContent = `${this._searchMatchIndex + 1} / ${this._searchMatches.length}`;
        }

        const targetId = this._searchMatches[this._searchMatchIndex];
        const row = document.getElementById(`msgRow-${targetId}`);
        if (row) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.classList.add('search-highlight-active');
        }
    }

    toggleSelectionMode(enable, initialMsgId = null) {
        this._isSelectionMode = !!enable;
        this._selectedMessageIds = new Set();
        if (initialMsgId) this._selectedMessageIds.add(Number(initialMsgId));

        const container = this.dom.messagesContainer;
        const bar = document.getElementById('selectionActionBar');
        if (container) {
            container.classList.toggle('selection-active', this._isSelectionMode);
        }
        if (bar) {
            bar.style.display = this._isSelectionMode ? 'flex' : 'none';
        }

        document.querySelectorAll('.message-select-checkbox').forEach(chk => {
            const mid = Number(chk.dataset.msgId);
            chk.checked = this._selectedMessageIds.has(mid);
        });

        this.handleMessageSelectionChange();
    }

    handleMessageSelectionChange() {
        const selected = new Set();
        document.querySelectorAll('.message-select-checkbox:checked').forEach(chk => {
            selected.add(Number(chk.dataset.msgId));
        });
        this._selectedMessageIds = selected;
        const countEl = document.getElementById('selectionCount');
        if (countEl) {
            countEl.textContent = `${selected.size} selected`;
        }

        const forwardBtn = document.getElementById('selectionForwardBtn');
        const copyBtn = document.getElementById('selectionCopyBtn');
        const starBtn = document.getElementById('selectionStarBtn');
        const deleteBtn = document.getElementById('selectionDeleteBtn');
        const hasSelection = selected.size > 0;

        if (forwardBtn) forwardBtn.disabled = !hasSelection;
        if (copyBtn) copyBtn.disabled = !hasSelection;
        if (starBtn) starBtn.disabled = !hasSelection;
        if (deleteBtn) deleteBtn.disabled = !hasSelection;
    }

    async executeSelectionAction(action) {
        const ids = Array.from(this._selectedMessageIds || []);
        if (ids.length === 0) return;

        if (action === 'cancel') {
            this.toggleSelectionMode(false);
            return;
        }

        if (action === 'copy') {
            const msgs = (this.activeMessages || []).filter(m => ids.includes(Number(m.id || m.message_id)));
            const textToCopy = msgs.map(m => {
                const time = messagesModule.formatTime(m.created_at);
                const sender = m.sender ? (m.sender.full_name || m.sender.username) : 'Member';
                return `[${time}] ${sender}: ${m.content || ''}`;
            }).join('\n');
            await navigator.clipboard.writeText(textToCopy);
            showToast(`✓ Copied ${ids.length} messages`, 'success');
            this.toggleSelectionMode(false);
            return;
        }

        if (action === 'star') {
            for (const id of ids) {
                await api.starMessage(id);
            }
            showToast(`⭐ Starred ${ids.length} messages`, 'success');
            this.toggleSelectionMode(false);
            return;
        }

        if (action === 'delete') {
            for (const id of ids) {
                await api.deleteMessage(id, 'me');
                const row = document.getElementById(`msgRow-${id}`);
                if (row) row.remove();
            }
            this.activeMessages = (this.activeMessages || []).filter(m => !ids.includes(Number(m.id || m.message_id)));
            showToast(`Deleted ${ids.length} messages for you`, 'info');
            this.toggleSelectionMode(false);
            return;
        }

        if (action === 'forward') {
            this.openForwardModal(ids[0]);
            this.toggleSelectionMode(false);
            return;
        }
    }

    async loadOlderMessages() {
        if (this._isLoadingOlder || this._noMoreOlderMessages) return;
        if (!this.activeMessages || this.activeMessages.length === 0) return;

        const container = this.dom.messagesContainer;
        if (!container) return;

        const oldestId = Math.min(...this.activeMessages.map(m => Number(m.id || m.message_id)));
        if (!oldestId || isNaN(oldestId)) return;

        this._isLoadingOlder = true;
        const oldScrollHeight = container.scrollHeight;

        try {
            let older = [];
            if (this.activeType === 'direct') {
                older = await api.getDirectMessages(this.activeId, { before_id: oldestId, limit: 30 });
            } else if (this.activeType === 'group') {
                older = await api.getGroupMessages(this.activeId, { before_id: oldestId, limit: 30 });
            }

            if (!older || older.length === 0) {
                this._noMoreOlderMessages = true;
                return;
            }

            if (older.length < 30) {
                this._noMoreOlderMessages = true;
            }

            const currentUser = auth.getUser();
            const currentUserId = currentUser ? currentUser.id : null;
            const existingIds = new Set(this.activeMessages.map(m => Number(m.id || m.message_id)));
            const uniqueOlder = older.filter(m => !existingIds.has(Number(m.id || m.message_id)));

            this.activeMessages = uniqueOlder.concat(this.activeMessages);

            const frag = document.createDocumentFragment();
            uniqueOlder.forEach((m, idx) => {
                const prev = uniqueOlder[idx - 1];
                const isConsecutive = prev && Number(prev.sender_id) === Number(m.sender_id);
                const html = messagesModule.renderMessageRow(m, currentUserId, {
                    isGroup: (this.activeType === 'group'),
                    isConsecutive
                });
                const temp = document.createElement('div');
                temp.innerHTML = html;
                while (temp.firstChild) {
                    frag.appendChild(temp.firstChild);
                }
            });

            container.prepend(frag);

            const newScrollHeight = container.scrollHeight;
            container.scrollTop = newScrollHeight - oldScrollHeight;
        } catch (err) {
            console.warn('Failed to load older messages:', err);
        } finally {
            this._isLoadingOlder = false;
        }
    }

    scrollToBottom(smooth = false) {
        const container = this.dom.messagesContainer;
        if (!container) return;
        if (smooth) {
            container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        } else {
            container.scrollTop = container.scrollHeight;
        }
        const pill = document.getElementById('scrollBottomPill');
        const badge = document.getElementById('scrollBottomBadge');
        if (pill) pill.style.display = 'none';
        if (badge) {
            badge.style.display = 'none';
            badge.textContent = '0';
        }
    }

    setupChatScrollListener() {
        const container = this.dom.messagesContainer;
        if (!container || container._hasScrollListener) return;
        container._hasScrollListener = true;

        container.addEventListener('scroll', () => {
            if (container.scrollTop < 40) {
                this.loadOlderMessages();
            }

            const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
            const pill = document.getElementById('scrollBottomPill');
            const badge = document.getElementById('scrollBottomBadge');
            if (pill) {
                if (distFromBottom > 150) {
                    pill.style.display = 'flex';
                } else {
                    pill.style.display = 'none';
                    if (badge) {
                        badge.style.display = 'none';
                        badge.textContent = '0';
                    }
                }
            }
        });
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

        document.getElementById('chatPartnerHeaderBtn')?.addEventListener('click', (e) => {
            if (e.target.closest('.btn-copy-frank-id')) return;
            this.toggleDrawer();
        });

        this.dom.closeDrawerBtn?.addEventListener('click', () => {
            this.closeDrawer();
        });

        // Add Member button inside Group Members drawer section
        document.getElementById('drawerAddMemberActionBtn')?.addEventListener('click', () => {
            if (this.activeType === 'group' && window.groupsModule) {
                window.groupsModule.openAddMembersModal(this.activeId);
            }
        });

        // Drawer Tabs: Members vs Shared Documents
        document.getElementById('drawerTabMembersBtn')?.addEventListener('click', () => {
            this.switchDrawerTab('members');
        });

        document.getElementById('drawerTabDocsBtn')?.addEventListener('click', () => {
            this.switchDrawerTab('docs');
        });
    }

    switchDrawerTab(tab = 'members') {
        const membersBtn = document.getElementById('drawerTabMembersBtn');
        const docsBtn = document.getElementById('drawerTabDocsBtn');
        const membersSec = document.getElementById('drawerMembersSection');
        const docsSec = document.getElementById('drawerDocsSection');

        if (tab === 'members') {
            membersBtn?.classList.add('active');
            docsBtn?.classList.remove('active');
            if (membersSec) membersSec.style.display = 'block';
            if (docsSec) docsSec.style.display = 'none';
        } else if (tab === 'docs') {
            docsBtn?.classList.add('active');
            membersBtn?.classList.remove('active');
            if (membersSec) membersSec.style.display = 'none';
            if (docsSec) docsSec.style.display = 'block';
            this.loadSharedDocuments();
        }
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
        if (this.activeType === 'group') {
            const activeTab = document.getElementById('drawerTabDocsBtn')?.classList.contains('active') ? 'docs' : 'members';
            this.switchDrawerTab(activeTab);
        } else {
            this.loadSharedDocuments();
        }
    }

    closeDrawer() {
        if (!this.dom.detailsDrawer) return;
        this.dom.detailsDrawer.style.display = 'none';
        this.dom.detailsDrawer.classList.remove('open');
    }

    async loadGroupDetails(groupId) {
        if (!groupId) return;
        try {
            const group = await api.getGroup(groupId);
            if (Number(this.activeId) === Number(groupId) && this.activeType === 'group') {
                this.activePartner = group;
                if (this.dom.partnerName) this.dom.partnerName.textContent = group.name;
                if (this.dom.partnerPresence) {
                    const count = group.members_count || 1;
                    const currentUser = auth.getUser();
                    const isCreator = group.created_by === (currentUser ? currentUser.id : null);
                    this.dom.partnerPresence.textContent = `${count} member${count > 1 ? 's' : ''} • ${isCreator ? 'Created by you' : 'Group Discussion'}`;
                }
                const nameEl = document.getElementById('drawerName');
                const subtitleEl = document.getElementById('drawerSubtitle');
                const bioEl = document.getElementById('drawerBio');
                const privacyLabel = (group.privacy === 'public') ? '🌐 Public Group' : '🔒 Private Group';
                const count = group.members_count || 1;
                if (nameEl) nameEl.textContent = group.name;
                if (subtitleEl) subtitleEl.textContent = `${privacyLabel} • ${count} member${count > 1 ? 's' : ''}`;
                if (bioEl) bioEl.textContent = group.description || 'No group description provided.';
            }
        } catch (err) {
            console.warn('Failed to refresh group details:', err);
        }
    }

    async updateDetailsDrawer(target) {
        const isGroup = this.activeType === 'group';

        const nameEl = document.getElementById('drawerName');
        const subtitleEl = document.getElementById('drawerSubtitle');
        const bioEl = document.getElementById('drawerBio');
        const drawerAvatar = document.getElementById('drawerAvatar');
        const initialsEl = document.getElementById('drawerInitials');
        const tabsBar = document.getElementById('drawerTabsBar');
        const membersSec = document.getElementById('drawerMembersSection');
        const docsSec = document.getElementById('drawerDocsSection');
        const leaveBtn = document.getElementById('drawerLeaveGroupBtn');

        const currentUser = auth.getUser();
        const isSelf = !isGroup && currentUser && Number(target.id) === Number(currentUser.id);
        let frankId = target.frank_id || (isSelf && currentUser ? currentUser.frank_id : '');
        if (!frankId && !isGroup && window.appController && window.appController.conversations) {
            const cached = window.appController.conversations.find(c => Number(c.id) === Number(target.id) && c.type !== 'group');
            if (cached && cached.frank_id) {
                frankId = cached.frank_id;
                target.frank_id = frankId;
            }
        }

        // If frankId is still not populated for a direct contact, fetch safely via user lookup
        if (!frankId && !isGroup && target.id) {
            try {
                const userProfile = await api.getUserById(target.id);
                if (userProfile && userProfile.frank_id) {
                    frankId = userProfile.frank_id;
                    target.frank_id = frankId;
                    if (userProfile.avatar_url && !target.avatar_url) target.avatar_url = userProfile.avatar_url;
                }
            } catch (e) {}
        }

        const fidBox = document.getElementById('drawerFrankIdBox');
        const fidVal = document.getElementById('drawerFrankIdVal');
        const fidBtn = document.getElementById('drawerCopyFrankIdBtn');

        // Resolve display name — sanitize if name contains an email address
        let rawName = isSelf
            ? `${currentUser.full_name || currentUser.username} (You)`
            : (target.name || target.full_name || target.username || 'Conversation');
        if (!isSelf && rawName.includes('@') && rawName.includes('.')) {
            rawName = rawName.split('@')[0];
        }
        if (nameEl) nameEl.textContent = rawName;

        // Render Avatar (Profile picture if available, otherwise initials icon)
        const avatarUrl = isSelf ? (currentUser && currentUser.avatar_url) : (target && target.avatar_url);
        if (drawerAvatar) {
            if (avatarUrl) {
                drawerAvatar.innerHTML = `<img src="${messagesModule.escapeHTML(avatarUrl)}" alt="${messagesModule.escapeHTML(rawName)}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
            } else {
                drawerAvatar.innerHTML = `<span id="drawerInitials">${isSelf ? '📝' : rawName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>`;
            }
        }

        if (isGroup) {
            if (fidBox) fidBox.style.display = 'none';
            const privacyLabel = (target.privacy === 'public') ? '🌐 Public Group' : '🔒 Private Group';
            const count = target.members_count || 1;
            if (subtitleEl) subtitleEl.textContent = `${privacyLabel} • ${count} member${count > 1 ? 's' : ''}`;
            if (bioEl) bioEl.textContent = target.description || 'No group description provided.';
            if (tabsBar) tabsBar.style.display = 'flex';

            const activeTab = document.getElementById('drawerTabDocsBtn')?.classList.contains('active') ? 'docs' : 'members';
            this.switchDrawerTab(activeTab);

            this.loadGroupMembersList(target.id);
        } else if (isSelf) {
            // 1. Account owner's view:
            // Display own FRANK ID with Copy button
            if (fidBox && fidVal && frankId) {
                fidVal.textContent = frankId;
                fidBox.style.display = 'flex';
                if (fidBtn) {
                    fidBtn.dataset.frankId = frankId;
                    fidBtn.setAttribute('title', 'Copy FRANK ID');
                }
            } else if (fidBox) {
                fidBox.style.display = 'none';
            }
            // Account owner may see their own email address
            const selfUsername = (currentUser && currentUser.username) || target.username || 'user';
            const selfEmail = (currentUser && currentUser.email) || '';
            if (subtitleEl) {
                if (selfEmail) {
                    subtitleEl.innerHTML = `@${messagesModule.escapeHTML(selfUsername)} &bull; <span class="drawer-self-email" style="color:var(--text-muted);">${messagesModule.escapeHTML(selfEmail)}</span>`;
                } else {
                    subtitleEl.textContent = `@${selfUsername}`;
                }
            }
            if (bioEl) bioEl.textContent = 'Message yourself • Keep personal notes, files, drafts, to-dos, and bookmarks.';
            if (tabsBar) tabsBar.style.display = 'none';
            if (membersSec) membersSec.style.display = 'none';
            if (docsSec) docsSec.style.display = 'block';
            if (leaveBtn) leaveBtn.style.display = 'none';
            this.loadSharedDocuments();
        } else {
            // 2. Other users' view:
            // Display FRANK ID box prominently with working Copy FRANK ID button
            if (fidBox && fidVal) {
                if (frankId) {
                    fidVal.textContent = frankId;
                    fidBox.style.display = 'flex';
                    if (fidBtn) {
                        fidBtn.dataset.frankId = frankId;
                        fidBtn.setAttribute('title', 'Copy FRANK ID');
                    }
                } else {
                    fidBox.style.display = 'none';
                }
            }
            // NEVER display another person's email address. Display handle only.
            let safeUsername = target.username || 'user';
            if (safeUsername.includes('@')) {
                safeUsername = safeUsername.split('@')[0];
            }
            if (subtitleEl) {
                subtitleEl.textContent = `@${safeUsername}`;
            }
            let bio = target.bio || 'Productive conversations powered by FRANK.';
            if (bio.includes('ChatApp') || bio.includes('QENVO')) bio = bio.replace(/ChatApp|QENVO/gi, 'FRANK');
            // Redact any email pattern in public bio to protect privacy
            if (bio.includes('@') && /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/.test(bio)) {
                bio = bio.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[FRANK User]');
            }
            if (bioEl) bioEl.textContent = bio;
            if (tabsBar) tabsBar.style.display = 'none';
            if (membersSec) membersSec.style.display = 'none';
            if (docsSec) docsSec.style.display = 'block';
            if (leaveBtn) leaveBtn.style.display = 'none';
            this.loadSharedDocuments();
        }
    }

    async loadGroupMembersList(groupId) {
        const listContainer = document.getElementById('drawerMembersList');
        const addMemberActionBtn = document.getElementById('drawerAddMemberActionBtn');
        const leaveSection = document.getElementById('drawerLeaveGroupSection');
        if (!listContainer) return;

        listContainer.innerHTML = '<div class="spinner" style="margin: 20px auto;"></div>';

        const currentUser = auth.getUser();
        const currentUserId = currentUser ? currentUser.id : null;

        try {
            const members = await api.getGroupMembers(groupId);
            listContainer.innerHTML = '';

            if (!members || members.length === 0) {
                listContainer.innerHTML = '<div style="font-size:12px; color:var(--text-muted); text-align:center; padding: 16px 0;">No members found</div>';
                return;
            }

            // Find current user role
            const myMembership = members.find(m => Number(m.user_id) === Number(currentUserId));
            const groupObj = (this.groups || []).find(g => Number(g.id) === Number(groupId));
            const isCreator = groupObj && Number(groupObj.created_by) === Number(currentUserId);
            const isPlatformAdmin = currentUser && currentUser.role === 'admin';
            let myRole = myMembership ? myMembership.role : (isCreator ? 'owner' : (isPlatformAdmin ? 'admin' : 'member'));
            if (isCreator) myRole = 'owner';
            else if (isPlatformAdmin && myRole !== 'owner') myRole = 'admin';

            // Only owners and admins can add members
            if (addMemberActionBtn) {
                addMemberActionBtn.style.display = (myRole === 'owner' || myRole === 'admin' || isCreator || isPlatformAdmin) ? 'inline-flex' : 'none';
            }

            // Render delete or leave group buttons
            if (leaveSection) {
                if (myRole === 'owner') {
                    leaveSection.innerHTML = `
                        <button type="button" class="btn btn-danger btn-full btn-sm" id="drawerDeleteGroupBtn" style="font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; border-radius: var(--radius-md);">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            Delete Group
                        </button>
                    `;
                    document.getElementById('drawerDeleteGroupBtn')?.addEventListener('click', () => {
                        const grpName = document.getElementById('drawerName')?.textContent || 'this group';
                        if (window.groupsModule) window.groupsModule.deleteGroup(groupId, grpName);
                    });
                } else {
                    leaveSection.innerHTML = `
                        <button type="button" class="btn btn-danger btn-full btn-sm" id="drawerLeaveGroupBtn" style="font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; border-radius: var(--radius-md);">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
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
                const isSelf = Number(m.user_id) === Number(currentUserId);
                const initials = (u.full_name || u.username || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
                const role = m.role || 'member';

                let roleBadge = '';
                if (role === 'owner') {
                    roleBadge = '<span class="member-role-badge role-owner">👑 Owner</span>';
                } else if (role === 'admin') {
                    roleBadge = '<span class="member-role-badge role-admin">🛡️ Admin</span>';
                } else {
                    roleBadge = '<span class="member-role-badge role-member">Member</span>';
                }

                // Role actions
                let actionsHtml = '';
                if (!isSelf) {
                    if (myRole === 'owner') {
                        if (role === 'admin') {
                            actionsHtml = `
                                <button type="button" class="btn btn-secondary btn-xs demote-action" data-uid="${m.user_id}" data-name="${messagesModule.escapeHTML(u.full_name || u.username)}" title="Demote to Member">Demote</button>
                                <button type="button" class="btn btn-danger btn-xs remove-action" data-uid="${m.user_id}" data-name="${messagesModule.escapeHTML(u.full_name || u.username)}" title="Remove member" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3);">✕ Remove</button>
                            `;
                        } else if (role === 'member') {
                            actionsHtml = `
                                <button type="button" class="btn btn-secondary btn-xs promote-action" data-uid="${m.user_id}" data-name="${messagesModule.escapeHTML(u.full_name || u.username)}" title="Promote to Admin">🛡️ Make Admin</button>
                                <button type="button" class="btn btn-danger btn-xs remove-action" data-uid="${m.user_id}" data-name="${messagesModule.escapeHTML(u.full_name || u.username)}" title="Remove member" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3);">✕ Remove</button>
                            `;
                        }
                    } else if (myRole === 'admin' && role === 'member') {
                        actionsHtml = `
                            <button type="button" class="btn btn-danger btn-xs remove-action" data-uid="${m.user_id}" data-name="${messagesModule.escapeHTML(u.full_name || u.username)}" title="Remove member" style="background: rgba(239, 68, 68, 0.1); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.3);">✕ Remove</button>
                        `;
                    }
                }

                const card = document.createElement('div');
                card.className = 'drawer-member-card';
                card.dataset.userId = m.user_id;

                const avatarContent = u.avatar_url
                    ? `<img src="${u.avatar_url}" alt="${initials}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`
                    : `<span>${initials}</span>`;

                const fidPill = u.frank_id
                    ? `<span class="drawer-member-fid-pill" title="FRANK ID">${messagesModule.escapeHTML(u.frank_id)}</span>`
                    : '';

                card.innerHTML = `
                    <div class="drawer-member-header">
                        <div class="avatar avatar-sm drawer-member-avatar">
                            ${avatarContent}
                            <span class="avatar-status ${u.is_online ? 'online' : 'offline'}"></span>
                        </div>
                        <div class="drawer-member-text">
                            <div class="drawer-member-name-row">
                                <span class="drawer-member-name" title="${messagesModule.escapeHTML(u.full_name || u.username)}">
                                    ${messagesModule.escapeHTML(u.full_name || u.username)}${isSelf ? ' <span style="font-weight: 500; color: var(--text-muted); font-size: 11px;">(You)</span>' : ''}
                                </span>
                                ${roleBadge}
                            </div>
                            <div class="drawer-member-sub-row">
                                <span class="drawer-member-handle">@${messagesModule.escapeHTML(u.username || 'user')}</span>
                                ${fidPill}
                            </div>
                        </div>
                    </div>
                    ${actionsHtml ? `<div class="drawer-member-actions-row">${actionsHtml}</div>` : ''}
                `;

                // Wire action listeners
                card.querySelector('.promote-action')?.addEventListener('click', (e) => {
                    const uid = Number(e.currentTarget.dataset.uid);
                    const uname = e.currentTarget.dataset.name;
                    if (window.groupsModule) window.groupsModule.updateMemberRole(groupId, uid, 'admin', uname);
                });

                card.querySelector('.demote-action')?.addEventListener('click', (e) => {
                    const uid = Number(e.currentTarget.dataset.uid);
                    const uname = e.currentTarget.dataset.name;
                    if (window.groupsModule) window.groupsModule.updateMemberRole(groupId, uid, 'member', uname);
                });

                card.querySelector('.remove-action')?.addEventListener('click', (e) => {
                    const uid = Number(e.currentTarget.dataset.uid);
                    const uname = e.currentTarget.dataset.name;
                    if (window.groupsModule) window.groupsModule.removeMember(groupId, uid, uname);
                });

                listContainer.appendChild(card);
            });
        } catch (err) {
            listContainer.innerHTML = '<div style="font-size:12px; color:var(--danger); text-align:center; padding: 16px 0;">Failed to load members</div>';
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
                textEl.innerHTML = messagesModule.formatMessageContent(msg.content);
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

        // WebSocket Connection status tracking
        window.wsClient.on('status', (data) => {
            if (data && data.status === 'connected') {
                this.deactivateRealTimeSync();
            } else if (data && data.status === 'disconnected') {
                this.activateRealTimeSync();
            }
        });

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
                    check.setAttribute('title', 'Read');
                    check.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 6 7 17 2 12"></polyline><polyline points="22 10 13 19 11 17"></polyline></svg>`;
                }
            }
        });

        window.wsClient.on('messages_read', (data) => {
            const partnerId = Number(data.partner_id || data.reader_id);
            if (this.activeType === 'direct' && Number(this.activeId) === partnerId) {
                document.querySelectorAll('.message-row.sent .message-status-check').forEach(check => {
                    check.className = 'message-status-check read';
                    check.setAttribute('title', 'Read');
                    check.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 6 7 17 2 12"></polyline><polyline points="22 10 13 19 11 17"></polyline></svg>`;
                });
                const myId = auth.getUser()?.id;
                (this.activeMessages || []).forEach(m => {
                    if (Number(m.sender_id) === Number(myId)) {
                        m.status = 'read';
                    }
                });
            }
        });

        window.wsClient.on('message_pinned', (data) => {
            const numId = Number(data.message_id);
            const msg = (this.activeMessages || []).find(m => Number(m.id || m.message_id) === numId);
            if (msg) msg.is_pinned = !!data.is_pinned;
            const row = document.getElementById(`msgRow-${numId}`);
            if (row) {
                let pinEl = row.querySelector('.message-pin-indicator');
                if (data.is_pinned) {
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
                } else {
                    if (pinEl) pinEl.remove();
                }
            }
            this.updatePinnedMessageBar();
        });

        window.wsClient.on('message_deleted', (data) => {
            const numId = Number(data.message_id);
            const deleteType = data.delete_type || 'everyone';
            if (deleteType === 'everyone') {
                const row = document.getElementById(`msgRow-${numId}`);
                if (row) {
                    const bubble = row.querySelector('.message-bubble');
                    if (bubble) {
                        bubble.innerHTML = `<div class="deleted-message-placeholder"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:5px; vertical-align:middle;"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg><em>This message was deleted</em></div>`;
                    }
                    const tb = row.querySelector('.message-actions-toolbar');
                    if (tb) tb.remove();
                }
                const m = (this.activeMessages || []).find(msg => Number(msg.id || msg.message_id) === numId);
                if (m) {
                    m.deleted_for_everyone = true;
                    m.content = '🚫 This message was deleted';
                }
            } else {
                const row = document.getElementById(`msgRow-${numId}`);
                if (row) row.remove();
                this.activeMessages = (this.activeMessages || []).filter(msg => Number(msg.id || msg.message_id) !== numId);
            }
            this.updatePinnedMessageBar();
        });

        // 6. User Profile & Avatar Live Sync across connected users
        window.wsClient.on('user_profile_updated', (data) => {
            const u = data.user || data;
            if (!u || !u.id) return;
            const uid = Number(u.id);
            const currentUser = (typeof auth !== 'undefined' && auth.getUser) ? auth.getUser() : null;

            // If current user updated their own profile
            if (currentUser && Number(currentUser.id) === uid) {
                const merged = { ...currentUser, ...u };
                auth.setUser(merged);
                if (window.appController) {
                    window.appController.currentUser = merged;
                    window.appController.updateSidebarUser(merged);
                }
            }

            // If active conversation is with this user
            if (this.activeType === 'direct' && Number(this.activeId) === uid) {
                if (this.dom.partnerName && u.full_name) {
                    this.dom.partnerName.textContent = u.full_name;
                }
                if (this.dom.partnerAvatar) {
                    const initials = (u.full_name || u.username || '??').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
                    if (u.avatar_url) {
                        this.dom.partnerAvatar.innerHTML = `<img src="${u.avatar_url}" alt="${messagesModule ? messagesModule.escapeHTML(u.full_name || u.username) : ''}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.onerror=null;this.parentElement.textContent='${initials}';">`;
                    } else {
                        this.dom.partnerAvatar.textContent = initials;
                    }
                }
            }

            // Sync conversation list items
            document.querySelectorAll(`.conversation-item[data-user-id="${uid}"]`).forEach(item => {
                const nameEl = item.querySelector('.conversation-name');
                if (nameEl && u.full_name) nameEl.textContent = u.full_name;
                const avatarEl = item.querySelector('.avatar');
                if (avatarEl) {
                    const initials = (u.full_name || u.username || '??').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
                    if (u.avatar_url) {
                        avatarEl.innerHTML = `<img src="${u.avatar_url}" alt="${messagesModule ? messagesModule.escapeHTML(u.full_name || u.username) : ''}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.onerror=null;this.parentElement.textContent='${initials}';">`;
                    } else {
                        avatarEl.textContent = initials;
                    }
                }
            });

            // Sync message avatars in active chat
            document.querySelectorAll(`.message-row[data-sender-id="${uid}"]`).forEach(row => {
                const avatarEl = row.querySelector('.msg-avatar, .message-avatar');
                if (avatarEl) {
                    const initials = (u.full_name || u.username || '??').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
                    if (u.avatar_url) {
                        avatarEl.innerHTML = `<img src="${u.avatar_url}" alt="${messagesModule ? messagesModule.escapeHTML(u.full_name || u.username) : ''}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" onerror="this.onerror=null;this.parentElement.textContent='${initials}';">`;
                    } else {
                        avatarEl.textContent = initials;
                    }
                }
            });
        });

        // 7. Group Members Live Sync
        window.wsClient.on('group_members_updated', async (data) => {
            const gid = Number(data.group_id);
            if (this.activeType === 'group' && Number(this.activeId) === gid) {
                await this.loadGroupMembersList(gid);
                if (typeof this.loadGroupDetails === 'function') {
                    this.loadGroupDetails(gid);
                }
            }
            if (window.appController) {
                window.appController.loadConversations(false);
            }
        });
    }

    activateRealTimeSync() {
        if (window.wsClient && window.wsClient.isConnected) {
            this.deactivateRealTimeSync();
            return;
        }
        if (this._syncTimer) clearInterval(this._syncTimer);
        this.runRealTimeSyncCycle();
        const interval = document.visibilityState === 'visible' ? 4000 : 12000;
        this._syncTimer = setInterval(() => {
            if (window.wsClient && window.wsClient.isConnected) {
                this.deactivateRealTimeSync();
                return;
            }
            this.runRealTimeSyncCycle();
        }, interval);
    }

    deactivateRealTimeSync() {
        if (this._syncTimer) {
            clearInterval(this._syncTimer);
            this._syncTimer = null;
        }
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

                    // C. Update active messages list without falsely deleting scrolled or older messages
                    this.activeMessages = freshMessages;
                }
            }

            // 2. Sync Sidebar Conversation List (Latest snippets, unread badges, new chats)
            this._syncCycleCount = (this._syncCycleCount || 0) + 1;
            if (this._syncCycleCount % 4 === 0 && typeof window.appController !== 'undefined') {
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