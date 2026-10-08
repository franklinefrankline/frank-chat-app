/* -------------------------------------------------------------------------
   FRANK SMART CONVERSATIONS CONTROLLER
   Integrated from Reference Standalone Smart Conversations Engine.
   - Targeted Analysis on Message / Document Context
   - Executive Summary, Key Points, Important Information, Source References
   - 8 Tabs: Summary, Missed, Important, Actions (CRUD), Decisions, Dates, Files, Insights
   - Full Conversation mode with "Return to Targeted Analysis" option
   - Horizontal scrollable tab bar with chevron indicators
   - Fully responsive for 320, 360, 375, 390, 393, 412, 430, 768px breakpoints
   ------------------------------------------------------------------------- */

class SmartConversationController {
    constructor() {
        this.isOpen = false;
        this.activeTab = 'summary';
        this.currentConvId = null;
        this.currentConvType = 'direct';
        this.selectedMessageId = null;
        this.selectedAttachmentId = null;
        this.selectedAttachmentName = null;
        this.selectedMessageData = null;
        this.previousTarget = null; // Stores target when user temporarily switches to Full Conversation
        this.analysis = null;
        this.isLoading = false;
        this.isStale = false;
        this.error = null;
        this.isAddingAction = false;
        this.editingActionId = null;

        this.init();
    }

    init() {
        this.bindTriggers();
        this.bindEvents();
        this.setupWebSocketListener();
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    getDom() {
        return {
            modal: document.getElementById('smartConversationModal'),
            chatSmartBtn: document.getElementById('chatSmartBtn'),
            moreSmartBtn: document.getElementById('moreSmartBtn'),
            closeBtn: document.getElementById('closeSmartModalBtn'),
            backBtn: document.getElementById('smartMobileBackBtn') || document.getElementById('mobileBackSmartBtn'),
            refreshBtn: document.getElementById('smartHeaderRefreshBtn') || document.getElementById('refreshSmartBtn'),
            realtimeBanner: document.getElementById('smartRealtimeBanner'),
            refreshBannerBtn: document.getElementById('smartRefreshBannerBtn'),
            tabsWrapper: document.getElementById('smartTabsWrapper'),
            tabsBar: document.getElementById('smartTabsBar'),
            tabButtons: document.querySelectorAll('.smart-tab-btn'),
            scrollLeftBtn: document.getElementById('smartTabScrollLeft') || document.getElementById('smartTabsScrollLeftBtn'),
            scrollRightBtn: document.getElementById('smartTabScrollRight') || document.getElementById('smartTabsScrollRightBtn'),
            bodyContainer: document.getElementById('smartModalBody'),
            loadingState: document.getElementById('smartLoadingState'),
            loadingText: document.getElementById('smartLoadingText'),
            errorState: document.getElementById('smartErrorState'),
            errorDesc: document.getElementById('smartErrorDesc'),
            tryAgainBtn: document.getElementById('smartTryAgainBtn'),
            emptyState: document.getElementById('smartEmptyState'),
            emptyTitle: document.getElementById('smartEmptyTitle'),
            emptyDesc: document.getElementById('smartEmptyDesc'),
            contextBar: document.getElementById('smartContextBar'),
            contextBadge: document.getElementById('smartContextBadge'),
            contextText: document.getElementById('smartContextText'),
            clearContextBtn: document.getElementById('smartClearContextBtn'),
            selectedMessageCard: document.getElementById('smartSelectedMessageCard'),
            selectedMsgTitle: document.getElementById('smartSelectedMsgTitle'),
            selectedMsgTime: document.getElementById('smartSelectedMsgTime'),
            selectedMsgContent: document.getElementById('smartSelectedMsgContent'),
            selectedDocCard: document.getElementById('smartSelectedDocCard'),
            selectedDocName: document.getElementById('smartSelectedDocName'),
            fullConvBar: document.getElementById('smartFullConvBar'),
            returnTargetBtn: document.getElementById('smartReturnTargetBtn'),
            tabPanels: {
                summary: document.getElementById('smartSummaryPanel'),
                missed: document.getElementById('smartMissedPanel'),
                important: document.getElementById('smartImportantPanel'),
                actions: document.getElementById('smartActionsPanel'),
                decisions: document.getElementById('smartDecisionsPanel'),
                dates: document.getElementById('smartDatesPanel'),
                files: document.getElementById('smartFilesPanel'),
                insights: document.getElementById('smartInsightsPanel')
            }
        };
    }

    bindTriggers() {
        const headerBtn = document.getElementById('chatSmartBtn');
        if (headerBtn) {
            headerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.open();
            });
        }

        const moreBtn = document.getElementById('moreSmartBtn');
        if (moreBtn) {
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.chatController && window.chatController.closeMoreMenu) {
                    window.chatController.closeMoreMenu();
                }
                this.open();
            });
        }
    }

    bindEvents() {
        const dom = this.getDom();

        if (dom.closeBtn) {
            dom.closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.close();
            });
        }

        if (dom.backBtn) {
            dom.backBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.close();
            });
        }

        if (dom.refreshBtn) {
            dom.refreshBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.loadAnalysis(true);
            });
        }

        if (dom.refreshBannerBtn) {
            dom.refreshBannerBtn.addEventListener('click', () => {
                if (dom.realtimeBanner) dom.realtimeBanner.classList.remove('visible');
                this.loadAnalysis(true);
            });
        }

        if (dom.tryAgainBtn) {
            dom.tryAgainBtn.addEventListener('click', () => {
                this.loadAnalysis(true);
            });
        }

        // Switch to Full Conversation mode
        if (dom.clearContextBtn) {
            dom.clearContextBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.clearContext();
            });
        }

        // Return to Targeted Analysis mode
        if (dom.returnTargetBtn) {
            dom.returnTargetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.returnToTargeted();
            });
        }

        // Tab switches
        dom.tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.smartTab;
                if (tab) this.switchTab(tab);
            });
        });

        // Tab scroll affordance buttons
        if (dom.scrollLeftBtn && dom.tabsBar) {
            dom.scrollLeftBtn.addEventListener('click', () => {
                dom.tabsBar.scrollBy({ left: -140, behavior: 'smooth' });
            });
        }
        if (dom.scrollRightBtn && dom.tabsBar) {
            dom.scrollRightBtn.addEventListener('click', () => {
                dom.tabsBar.scrollBy({ left: 140, behavior: 'smooth' });
            });
        }
        if (dom.tabsBar) {
            dom.tabsBar.addEventListener('scroll', () => this.checkTabScroll());
        }

        // Escape to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    setupWebSocketListener() {
        const handleIncoming = (msg) => {
            if (!this.isOpen || !msg) return;
            const isGroup = this.currentConvType === 'group' && Number(msg.group_id) === Number(this.currentConvId);
            const isDirect = this.currentConvType === 'direct' && (
                Number(msg.sender_id) === Number(this.currentConvId) ||
                Number(msg.recipient_id) === Number(this.currentConvId)
            );

            if (isGroup || isDirect) {
                const dom = this.getDom();
                if (dom.realtimeBanner) {
                    dom.realtimeBanner.classList.add('visible');
                }
                this.isStale = true;
            }
        };

        if (window.wsClient) {
            window.wsClient.on('message', (data) => handleIncoming(data.message || data));
        }

        window.addEventListener('frank_websocket_message', (e) => {
            const data = e.detail;
            if (data && (data.type === 'message' || data.message)) {
                handleIncoming(data.message || data);
            }
        });
    }

    checkTabScroll() {
        const dom = this.getDom();
        if (!dom.tabsBar) return;
        const { scrollLeft, scrollWidth, clientWidth } = dom.tabsBar;
        if (dom.scrollLeftBtn) {
            dom.scrollLeftBtn.style.display = scrollLeft > 4 ? 'flex' : 'none';
        }
        if (dom.scrollRightBtn) {
            dom.scrollRightBtn.style.display = (scrollLeft + clientWidth < scrollWidth - 4) ? 'flex' : 'none';
        }
    }

    scrollActiveTabIntoView() {
        const dom = this.getDom();
        if (!dom.tabsBar) return;
        const activeBtn = dom.tabsBar.querySelector(`.smart-tab-btn[data-smart-tab="${this.activeTab}"]`);
        if (activeBtn) {
            activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
        setTimeout(() => this.checkTabScroll(), 220);
    }

    formatTime(iso) {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return '';
        }
    }

    renderContextBar() {
        const dom = this.getDom();
        const isTargeted = !!(this.selectedMessageId || this.selectedAttachmentId || (this.analysis?.mode && this.analysis.mode !== 'CONVERSATION'));

        if (isTargeted) {
            if (dom.contextBar) dom.contextBar.style.display = 'flex';
            if (dom.fullConvBar) dom.fullConvBar.style.display = 'none';
            if (dom.contextBadge) dom.contextBadge.textContent = 'TARGETED ANALYSIS';
            if (dom.clearContextBtn) dom.clearContextBtn.style.display = 'inline-flex';

            // Selected Message Card
            if (this.selectedMessageId || this.analysis?.selected_message) {
                let msg = this.selectedMessageData || this.analysis?.selected_message;
                let msgIndex = -1;
                if (window.chatController && Array.isArray(window.chatController.activeMessages)) {
                    msgIndex = window.chatController.activeMessages.findIndex(m => Number(m.id) === Number(this.selectedMessageId));
                    if (msgIndex !== -1 && !msg) {
                        msg = window.chatController.activeMessages[msgIndex];
                    }
                }
                const msgNum = msgIndex !== -1 ? (msgIndex + 1) : (this.selectedMessageId || (msg?.id ? `#${String(msg.id).slice(0, 5)}` : ''));
                const previewText = msg?.content || msg?.preview || (this.analysis?.selected_message?.preview) || '';
                const timeText = this.formatTime(msg?.created_at || msg?.timestamp || this.analysis?.selected_message?.created_at);

                if (dom.selectedMessageCard) dom.selectedMessageCard.style.display = 'flex';
                if (dom.selectedMsgTitle) dom.selectedMsgTitle.textContent = `Selected Message: Message #${msgNum}`;
                if (dom.selectedMsgTime) dom.selectedMsgTime.textContent = timeText;
                if (dom.selectedMsgContent) dom.selectedMsgContent.textContent = previewText ? `"${previewText}"` : `Message #${msgNum}`;
                if (dom.contextText) dom.contextText.textContent = `Selected Message: Message #${msgNum}`;
            } else {
                if (dom.selectedMessageCard) dom.selectedMessageCard.style.display = 'none';
            }

            // Selected Document Card
            if (this.selectedAttachmentId || this.analysis?.selected_document) {
                const docName = this.selectedAttachmentName || this.analysis?.selected_document?.filename || `Document #${this.selectedAttachmentId}`;
                if (dom.selectedDocCard) dom.selectedDocCard.style.display = 'flex';
                if (dom.selectedDocName) dom.selectedDocName.textContent = docName;
            } else {
                if (dom.selectedDocCard) dom.selectedDocCard.style.display = 'none';
            }
        } else {
            // Full Conversation Mode
            if (dom.contextBar) dom.contextBar.style.display = 'none';
            if (dom.fullConvBar) dom.fullConvBar.style.display = 'flex';
            if (dom.selectedMessageCard) dom.selectedMessageCard.style.display = 'none';
            if (dom.selectedDocCard) dom.selectedDocCard.style.display = 'none';

            // Show "Return to Targeted Analysis" button if user previously targeted a message/doc
            if (dom.returnTargetBtn) {
                dom.returnTargetBtn.style.display = this.previousTarget ? 'inline-flex' : 'none';
            }
        }
    }

    updateTabCounts() {
        const dom = this.getDom();
        if (!this.analysis) return;

        const counts = {
            missed: this.analysis.what_did_i_miss?.length || 0,
            important: this.analysis.important_messages?.length || 0,
            actions: this.analysis.action_items?.length || 0,
            decisions: this.analysis.decisions?.length || 0,
            dates: this.analysis.dates?.length || 0,
            files: this.analysis.important_files?.length || 0
        };

        Object.entries(counts).forEach(([key, count]) => {
            const badge = document.getElementById(`count-${key}`) || document.getElementById(`smartTabCount-${key}`);
            if (badge) {
                if (count > 0) {
                    badge.textContent = count;
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            }
        });
    }

    showState(stateName, errorDetail = null) {
        const dom = this.getDom();
        if (dom.loadingState) dom.loadingState.style.display = stateName === 'loading' ? 'flex' : 'none';
        if (dom.errorState) dom.errorState.style.display = stateName === 'error' ? 'flex' : 'none';
        if (dom.emptyState) dom.emptyState.style.display = stateName === 'empty' ? 'flex' : 'none';

        if (stateName === 'error' && dom.errorDesc) {
            dom.errorDesc.textContent = errorDetail || 'Unable to connect to Smart Conversations.';
        }

        Object.keys(dom.tabPanels).forEach(key => {
            const panel = dom.tabPanels[key];
            if (panel) {
                panel.style.display = (stateName === 'content' && key === this.activeTab) ? 'block' : 'none';
            }
        });
    }

    async open(messageId = null, attachmentId = null, filename = null) {
        if (!window.chatController || !window.chatController.activeId) {
            if (window.showToast) window.showToast('Please open a conversation first.', 'info');
            return;
        }

        let newId = window.chatController.activeConversationId;
        if (!newId && window.chatController.ensureConversationId) {
            newId = await window.chatController.ensureConversationId();
        }
        if (!newId) {
            newId = window.chatController.activeId;
        }
        const newType = window.chatController.activeType || 'direct';

        this.currentConvId = newId;
        this.currentConvType = newType;
        this.selectedMessageId = messageId ? parseInt(messageId, 10) : null;
        this.selectedAttachmentId = attachmentId ? parseInt(attachmentId, 10) : null;
        this.selectedAttachmentName = filename || null;
        this.previousTarget = null;

        if (this.selectedMessageId && window.chatController && Array.isArray(window.chatController.activeMessages)) {
            const found = window.chatController.activeMessages.find(m => Number(m.id) === Number(this.selectedMessageId));
            if (found) {
                this.selectedMessageData = found;
            }
        } else {
            this.selectedMessageData = null;
        }

        this.isOpen = true;
        this.renderContextBar();

        const dom = this.getDom();
        if (dom.modal) {
            dom.modal.classList.add('active', 'open');
            dom.modal.style.display = 'flex';
            dom.modal.style.visibility = 'visible';
            dom.modal.style.opacity = '1';
        }
        if (dom.realtimeBanner) {
            dom.realtimeBanner.classList.remove('visible');
        }

        // Close details drawer on mobile
        if (window.innerWidth <= 1200) {
            const drawer = document.getElementById('detailsDrawer');
            if (drawer && drawer.style.display !== 'none') drawer.style.display = 'none';
        }

        await this.loadAnalysis(false);
    }

    async openForMessage(convId, messageId) {
        if (!convId && window.chatController) {
            convId = window.chatController.activeConversationId;
            if (!convId && window.chatController.ensureConversationId) {
                convId = await window.chatController.ensureConversationId();
            }
            if (!convId) {
                convId = window.chatController.activeId;
            }
        }
        this.currentConvId = convId;
        this.selectedMessageId = messageId ? parseInt(messageId, 10) : null;
        this.selectedAttachmentId = null;
        this.selectedAttachmentName = null;
        this.previousTarget = null;

        if (this.selectedMessageId && window.chatController && Array.isArray(window.chatController.activeMessages)) {
            const found = window.chatController.activeMessages.find(m => Number(m.id) === Number(this.selectedMessageId));
            if (found) {
                this.selectedMessageData = found;
            }
        }

        this.isOpen = true;
        this.renderContextBar();

        const dom = this.getDom();
        if (dom.modal) {
            dom.modal.classList.add('active', 'open');
            dom.modal.style.display = 'flex';
            dom.modal.style.visibility = 'visible';
            dom.modal.style.opacity = '1';
        }

        await this.loadAnalysis(false);
    }

    async openForDocument(convId, messageId, attachmentId, filename = null) {
        if (!convId && window.chatController) {
            convId = window.chatController.activeConversationId;
            if (!convId && window.chatController.ensureConversationId) {
                convId = await window.chatController.ensureConversationId();
            }
            if (!convId) {
                convId = window.chatController.activeId;
            }
        }
        this.currentConvId = convId;
        this.selectedMessageId = messageId ? parseInt(messageId, 10) : null;
        this.selectedAttachmentId = attachmentId ? parseInt(attachmentId, 10) : null;
        this.selectedAttachmentName = filename || null;
        this.selectedMessageData = null;
        this.previousTarget = null;

        this.isOpen = true;
        this.renderContextBar();

        const dom = this.getDom();
        if (dom.modal) {
            dom.modal.classList.add('active', 'open');
            dom.modal.style.display = 'flex';
            dom.modal.style.visibility = 'visible';
            dom.modal.style.opacity = '1';
        }

        await this.loadAnalysis(false);
    }

    async clearContext() {
        // Save current target so user can return!
        this.previousTarget = {
            messageId: this.selectedMessageId,
            attachmentId: this.selectedAttachmentId,
            filename: this.selectedAttachmentName,
            data: this.selectedMessageData
        };
        this.selectedMessageId = null;
        this.selectedAttachmentId = null;
        this.selectedAttachmentName = null;
        this.selectedMessageData = null;

        this.renderContextBar();
        await this.loadAnalysis(false);
    }

    async returnToTargeted() {
        if (!this.previousTarget) return;
        this.selectedMessageId = this.previousTarget.messageId;
        this.selectedAttachmentId = this.previousTarget.attachmentId;
        this.selectedAttachmentName = this.previousTarget.filename;
        this.selectedMessageData = this.previousTarget.data;
        this.previousTarget = null;

        this.renderContextBar();
        await this.loadAnalysis(false);
    }

    close() {
        this.isOpen = false;
        const dom = this.getDom();
        if (dom.modal) {
            dom.modal.classList.remove('active', 'open');
            dom.modal.style.display = 'none';
            dom.modal.style.visibility = 'hidden';
            dom.modal.style.opacity = '0';
        }
    }

    async onConversationChanged(newId, newType) {
        this.selectedMessageId = null;
        this.selectedAttachmentId = null;
        this.selectedAttachmentName = null;
        this.selectedMessageData = null;
        this.previousTarget = null;
        this.currentConvId = newId;
        this.currentConvType = newType;
        this.analysis = null;

        this.renderContextBar();

        if (this.isOpen) {
            await this.loadAnalysis(false);
        }
    }

    async switchTab(tabName) {
        this.activeTab = tabName;
        const dom = this.getDom();

        dom.tabButtons.forEach(btn => {
            const isTarget = btn.dataset.smartTab === tabName;
            btn.classList.toggle('active', isTarget);
            btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
        });

        this.scrollActiveTabIntoView();

        if (this.analysis) {
            this.renderTabContent(tabName);
            this.showState('content');
        } else if (!this.isLoading) {
            await this.loadAnalysis(false);
        }
    }

    async loadAnalysis(forceRefresh = false) {
        if (!this.currentConvId && window.chatController) {
            this.currentConvId = window.chatController.activeConversationId;
            if (!this.currentConvId && window.chatController.ensureConversationId) {
                this.currentConvId = await window.chatController.ensureConversationId();
            }
            if (!this.currentConvId) {
                this.currentConvId = window.chatController.activeId;
            }
        }
        if (!this.currentConvId) return;

        this.isLoading = true;
        this.showState('loading');
        const dom = this.getDom();
        if (dom.refreshBtn) dom.refreshBtn.classList.add('loading');

        // Dynamic loading text
        if (dom.loadingText) {
            if (this.selectedMessageId && this.selectedAttachmentId) {
                dom.loadingText.textContent = 'Analyzing message and document...';
            } else if (this.selectedAttachmentId) {
                dom.loadingText.textContent = 'Analyzing document...';
            } else if (this.selectedMessageId) {
                dom.loadingText.textContent = 'Analyzing selected message...';
            } else {
                dom.loadingText.textContent = 'Analyzing conversation with Gemini...';
            }
        }

        try {
            const params = {
                conversation_type: this.currentConvType,
                message_id: this.selectedMessageId || undefined,
                attachment_id: this.selectedAttachmentId || undefined,
                include_message: this.selectedMessageId ? true : undefined,
                include_document: this.selectedAttachmentId ? true : undefined,
                force_refresh: forceRefresh
            };

            let data;
            if (forceRefresh) {
                data = await api.runSmartAnalysis(this.currentConvId, params);
            } else {
                data = await api.getSmartAnalysis(this.currentConvId, params);
            }

            if (!data || (!data.success && data.status !== 'ready')) {
                throw new Error(data?.message || 'Smart analysis failed.');
            }

            if (data.conversation_id) {
                this.currentConvId = data.conversation_id;
                if (window.chatController && !window.chatController.activeConversationId) {
                    window.chatController.activeConversationId = data.conversation_id;
                }
            }

            this.analysis = data;
            this.isStale = data.is_stale || false;

            this.renderContextBar();
            this.updateTabCounts();
            this.renderTabContent(this.activeTab);
            this.showState('content');
            this.scrollActiveTabIntoView();
        } catch (err) {
            console.error('[Smart Conversation Error]:', err);
            const status = err.status || (err.data && err.data.status) || (err.response && err.response.status);
            const detail = (err.data && err.data.detail) || err.message;
            let msg = 'Smart Conversation analysis is temporarily unavailable.';
            if (status === 401) {
                msg = detail || 'Gemini authentication failed. Please check the configured API key.';
            } else if (status === 403) {
                msg = detail || "You don't have permission to analyze this conversation.";
            } else if (status === 404) {
                msg = detail || 'Content not found in this conversation.';
            } else if (status === 502 || status === 503) {
                msg = 'Unable to analyze this content right now. Please try again.';
            } else if (detail && typeof detail === 'string') {
                msg = detail;
            }
            this.showState('error', msg);
        } finally {
            this.isLoading = false;
            if (dom.refreshBtn) dom.refreshBtn.classList.remove('loading');
        }
    }

    renderTabContent(tabName) {
        if (!this.analysis) return;

        switch (tabName) {
            case 'summary':
                this.renderSummaryTab();
                break;
            case 'missed':
                this.renderMissedTab();
                break;
            case 'important':
                this.renderImportantTab();
                break;
            case 'actions':
                this.renderActionsTab();
                break;
            case 'decisions':
                this.renderDecisionsTab();
                break;
            case 'dates':
                this.renderDatesTab();
                break;
            case 'files':
                this.renderFilesTab();
                break;
            case 'insights':
                this.renderInsightsTab();
                break;
        }
    }

    // ---------------- 1. SUMMARY TAB ----------------
    renderSummaryTab() {
        const dom = this.getDom();
        const panel = dom.tabPanels.summary;
        if (!panel || !this.analysis) return;

        const summaryObj = this.analysis.summary || {};
        const summaryText = summaryObj.text || '';
        const keyPoints = this.analysis.key_points || [];
        const importantInfo = this.analysis.important_information || [];
        const sources = summaryObj.sources || [];
        const selectedDoc = this.analysis.selected_document;

        panel.innerHTML = `
            <div class="smart-tab-content-flow">
                <!-- Selected Document Card (if document targeted) -->
                ${selectedDoc ? `
                    <div class="smart-card smart-doc-highlight-card" style="border: 1px solid var(--color-accent, #B86B3D); background: var(--color-card, #F8EFE2);">
                        <div style="display: flex; align-items: center; gap: 10px; padding: 12px 14px;">
                            <span style="font-size: 18px; color: var(--color-accent, #B86B3D);">📄</span>
                            <div style="min-width: 0; flex: 1;">
                                <div style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--color-text-muted, #8E7C6C);">Selected Document</div>
                                <div style="font-size: 14px; font-weight: 600; color: var(--color-text-primary, #2D241D); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${this.escapeHtml(selectedDoc.filename)}
                                </div>
                            </div>
                        </div>
                    </div>
                ` : ''}

                <!-- Card 1: Executive Summary -->
                <div class="smart-card">
                    <div class="smart-card-header smart-summary-accent">
                        <span class="smart-card-icon">✨</span>
                        <h3 class="smart-card-title">Summary</h3>
                    </div>
                    <div class="smart-card-body">
                        <p class="smart-card-paragraph" style="line-height: 1.65; white-space: pre-line;">${this.escapeHtml(summaryText || 'No summary available.')}</p>
                    </div>
                </div>

                <!-- Card 2: Key Points -->
                ${keyPoints.length > 0 ? `
                    <div class="smart-card">
                        <div class="smart-card-header smart-keypoints-accent">
                            <span class="smart-card-icon">◎</span>
                            <h3 class="smart-card-title">Key Points</h3>
                        </div>
                        <div class="smart-card-body">
                            <ul class="smart-card-bullet-list smart-summary-bullets">
                                ${keyPoints.map(p => `<li class="smart-summary-bullet">${this.escapeHtml(p)}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                ` : ''}

                <!-- Card 3: Important Information -->
                ${importantInfo.length > 0 ? `
                    <div class="smart-card">
                        <div class="smart-card-header smart-important-accent">
                            <span class="smart-card-icon">⚠</span>
                            <h3 class="smart-card-title">Important Information</h3>
                        </div>
                        <div class="smart-card-body">
                            <ul class="smart-card-bullet-list">
                                ${importantInfo.map(b => `<li>${this.escapeHtml(b)}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                ` : ''}

                <!-- SOURCE REFERENCES -->
                ${this.renderSourceReferences(sources)}
            </div>
        `;

        this.bindSourceNavigation(panel);
    }

    // ---------------- SOURCE REFERENCES HELPER ----------------
    renderSourceReferences(sources) {
        if (!sources || !sources.length) return '';

        const normalized = [];
        const seen = new Set();

        for (const s of sources) {
            if (!s) continue;
            const strS = String(s).trim();
            if (seen.has(strS)) continue;
            seen.add(strS);

            if (strS.toLowerCase().startsWith('page')) {
                normalized.push({ type: 'page', label: strS, raw: strS });
            } else {
                let displayNum = strS;
                if (window.chatController && Array.isArray(window.chatController.activeMessages)) {
                    const idx = window.chatController.activeMessages.findIndex(m => String(m.id) === strS);
                    if (idx !== -1) {
                        displayNum = idx + 1;
                    }
                }
                normalized.push({ type: 'message', id: strS, label: `Message #${displayNum}` });
            }
        }

        if (!normalized.length) return '';

        return `
            <div class="smart-source-references-box">
                <div class="smart-source-references-header">
                    SOURCE REFERENCES (${normalized.length})
                </div>
                <div class="smart-source-chips-row">
                    ${normalized.map(src => {
                        if (src.type === 'page') {
                            return `
                                <button type="button" class="smart-source-chip-btn smart-doc-page-btn" data-page="${this.escapeHtml(src.label)}" title="Citation: ${this.escapeHtml(src.label)}">
                                    <span>📄 ${this.escapeHtml(src.label)}</span>
                                    <span class="smart-source-arrow">↗</span>
                                </button>
                            `;
                        } else {
                            return `
                                <button type="button" class="smart-source-chip-btn" data-source-id="${this.escapeHtml(src.id)}" title="Jump to ${this.escapeHtml(src.label)}" aria-label="Jump to ${this.escapeHtml(src.label)}">
                                    <span>${this.escapeHtml(src.label)}</span>
                                    <span class="smart-source-arrow">↗</span>
                                </button>
                            `;
                        }
                    }).join('')}
                </div>
            </div>
        `;
    }

    // ---------------- 2. WHAT DID I MISS TAB ----------------
    renderMissedTab() {
        const dom = this.getDom();
        const panel = dom.tabPanels.missed;
        if (!panel || !this.analysis) return;

        const items = this.analysis.what_did_i_miss || [];
        if (items.length === 0) {
            panel.innerHTML = `
                <div class="smart-tab-content-flow">
                    <div class="smart-stat-card" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--color-surface, #F3E8D8); border: 1px solid var(--color-border, #D8C5AA); border-radius: 8px;">
                        <div>
                            <div class="smart-stat-num" style="font-size: 22px; font-weight: 700; color: var(--color-accent, #B86B3D);">0</div>
                            <div class="smart-stat-label" style="font-size: 12px; color: var(--color-text-secondary, #67584A);">Critical Missed Messages</div>
                        </div>
                        <div style="font-size: 22px;">📬</div>
                    </div>
                    <div class="smart-state-view" style="padding: 36px 16px;">
                        <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
                        <div class="smart-state-title">You're all caught up!</div>
                        <div class="smart-state-desc">No missed updates or pending messages found.</div>
                    </div>
                </div>
            `;
            return;
        }

        panel.innerHTML = `
            <div class="smart-tab-content-flow">
                <div class="smart-stat-card" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: var(--color-surface, #F3E8D8); border: 1px solid var(--color-border, #D8C5AA); border-radius: 8px;">
                    <div>
                        <div class="smart-stat-num" style="font-size: 22px; font-weight: 700; color: var(--color-accent, #B86B3D);">${items.length}</div>
                        <div class="smart-stat-label" style="font-size: 12px; color: var(--color-text-secondary, #67584A);">Critical Missed Messages</div>
                    </div>
                    <div style="font-size: 22px;">📬</div>
                </div>

                <div style="font-size: 13px; font-weight: 600; color: var(--color-text-secondary, #67584A); margin-bottom: 4px;">
                    Showing ${items.length} critical messages you may have missed:
                </div>
                ${items.map((item, idx) => `
                    <div class="smart-card smart-missed-item smart-item-card" style="padding: 14px; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 13px; color: var(--color-text-primary, #2D241D);">
                                👤 ${this.escapeHtml(item.sender || 'User')}
                            </span>
                            <span style="font-size: 12px; color: var(--color-text-muted, #8E7C6C);">
                                🕒 ${this.formatTime(item.timestamp)}
                            </span>
                        </div>
                        <p style="font-size: 14px; color: var(--color-text-primary, #2D241D); font-style: italic; border-left: 3px solid var(--color-accent, #B86B3D); padding-left: 10px; margin: 4px 0;">
                            "${this.escapeHtml(item.preview)}"
                        </p>
                        <div style="font-size: 12px; color: var(--color-text-secondary, #67584A); background: var(--color-card, #F8EFE2); padding: 8px 10px; border-radius: 6px;">
                            <strong>Why it matters:</strong> ${this.escapeHtml(item.reason || 'Important conversation detail')}
                        </div>
                        <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
                            <button type="button" class="btn btn-secondary btn-sm smart-view-msg-btn" data-source-id="${this.escapeHtml(item.message_id || '')}">
                                <span>View Message</span>
                                <span>↗</span>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        this.bindSourceNavigation(panel);
    }

    // ---------------- 3. IMPORTANT TAB ----------------
    renderImportantTab() {
        const dom = this.getDom();
        const panel = dom.tabPanels.important;
        if (!panel || !this.analysis) return;

        const items = this.analysis.important_messages || [];
        if (items.length === 0) {
            panel.innerHTML = `
                <div class="smart-state-view" style="padding: 36px 16px;">
                    <div style="font-size: 32px; margin-bottom: 8px;">⭐</div>
                    <div class="smart-state-title">No priority flags</div>
                    <div class="smart-state-desc">No high priority or flagged messages found.</div>
                </div>
            `;
            return;
        }

        panel.innerHTML = `
            <div class="smart-tab-content-flow">
                <div style="font-size: 13px; font-weight: 600; color: var(--color-text-secondary, #67584A); margin-bottom: 4px;">
                    Showing ${items.length} high-priority messages:
                </div>
                ${items.map(item => `
                    <div class="smart-card smart-item-card" style="padding: 14px; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 13px; color: var(--color-text-primary, #2D241D);">
                                ⭐ ${this.escapeHtml(item.sender || 'User')}
                            </span>
                            <span style="font-size: 12px; color: var(--color-text-muted, #8E7C6C);">
                                🕒 ${this.formatTime(item.timestamp)}
                            </span>
                        </div>
                        <p style="font-size: 14px; color: var(--color-text-primary, #2D241D); font-style: italic; border-left: 3px solid #f59e0b; padding-left: 10px; margin: 4px 0;">
                            "${this.escapeHtml(item.preview)}"
                        </p>
                        <div style="font-size: 12px; color: var(--color-text-secondary, #67584A); background: var(--color-card, #F8EFE2); padding: 8px 10px; border-radius: 6px;">
                            <strong>Reason:</strong> ${this.escapeHtml(item.reason || 'Flagged for attention')}
                        </div>
                        <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
                            <button type="button" class="btn btn-secondary btn-sm smart-view-msg-btn" data-source-id="${this.escapeHtml(item.message_id || '')}">
                                <span>View Message</span>
                                <span>↗</span>
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        this.bindSourceNavigation(panel);
    }

    // ---------------- 4. ACTION ITEMS TAB (INTERACTIVE CRUD) ----------------
    renderActionsTab() {
        const dom = this.getDom();
        const panel = dom.tabPanels.actions;
        if (!panel || !this.analysis) return;

        const items = this.analysis.action_items || [];
        const completedCount = items.filter(i => (i.status || '').toUpperCase() === 'COMPLETED').length;

        panel.innerHTML = `
            <div class="smart-tab-content-flow">
                <!-- Header Controls -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 13px; font-weight: 600; color: var(--color-text-secondary, #67584A);">
                        ${completedCount}/${items.length} Completed
                    </span>
                    <button type="button" class="btn btn-primary btn-sm" id="smartToggleAddActionBtn" style="display: inline-flex; align-items: center; gap: 5px;">
                        <span>+ Add Action</span>
                    </button>
                </div>

                <!-- Inline Add Form -->
                <div id="smartAddActionFormBox" style="display: flex; flex-direction: column; gap: 8px; background: var(--color-card, #F8EFE2); border: 1px solid var(--color-border, #D8C5AA); border-radius: 8px; padding: 12px;">
                    <input type="text" id="smartNewActionInput" class="form-input" placeholder="Action item title..." style="font-size: 13px; padding: 8px 10px; border-radius: 6px;" />
                    <textarea id="smartNewActionDescInput" class="form-input" rows="2" placeholder="Description (optional)..." style="font-size: 13px; padding: 8px 10px; border-radius: 6px; resize: vertical;"></textarea>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <input type="date" id="smartNewActionDateInput" class="form-input" style="font-size: 12px; padding: 4px 8px; border-radius: 6px; width: 140px;" />
                        <div style="display: flex; gap: 6px;">
                            <button type="button" class="btn btn-primary btn-sm" id="smartCreateActionBtn">Create</button>
                        </div>
                    </div>
                </div>

                <!-- Action Items List -->
                <div id="smartActionsList" style="display: flex; flex-direction: column; gap: 8px;">
                    ${items.length === 0 ? `
                        <div class="smart-state-view" style="padding: 32px 16px;">
                            <div style="font-size: 32px; margin-bottom: 8px;">☑</div>
                            <div class="smart-state-title">No action items</div>
                            <div class="smart-state-desc">Click '+ Add Action' above to create one.</div>
                        </div>
                    ` : items.map((item, idx) => {
                        const isCompleted = item.completed === true || (item.status || '').toUpperCase() === 'COMPLETED';
                        const isEditing = this.editingActionId === String(item.id);

                        if (isEditing) {
                            return `
                                <div class="smart-card" style="padding: 12px; gap: 8px; border: 1px solid var(--color-accent, #B86B3D);">
                                    <input type="text" id="smartEditTitleInput" class="form-input" value="${this.escapeHtml(item.title || item.action_text || '')}" style="font-size: 13px; padding: 6px 8px;" />
                                    <textarea id="smartEditDescInput" class="form-input" rows="2" style="font-size: 13px; padding: 6px 8px; resize: vertical;">${this.escapeHtml(item.description || '')}</textarea>
                                    <div style="display: flex; justify-content: flex-end; gap: 6px;">
                                        <button type="button" class="btn btn-ghost btn-sm smart-cancel-edit-btn">Cancel</button>
                                        <button type="button" class="btn btn-primary btn-sm smart-save-edit-btn" data-item-id="${this.escapeHtml(String(item.id))}">Save</button>
                                    </div>
                                </div>
                            `;
                        }

                        return `
                            <div class="smart-card smart-action-item ${isCompleted ? 'completed' : ''}" data-action-id="${this.escapeHtml(String(item.id))}" style="padding: 12px; gap: 8px;">
                                <div style="display: flex; align-items: flex-start; gap: 10px;">
                                    <button type="button" class="smart-checkbox ${isCompleted ? 'checked' : ''}" data-item-id="${this.escapeHtml(String(item.id))}" style="background: none; border: none; cursor: pointer; padding: 0; font-size: 18px; line-height: 1; color: var(--color-accent, #B86B3D);">
                                        ${isCompleted ? '☑' : '☐'}
                                    </button>
                                    <div style="flex: 1; min-width: 0;">
                                        <div class="smart-action-text" style="font-size: 14px; font-weight: 600; color: var(--color-text-primary, #2D241D); ${isCompleted ? 'text-decoration: line-through; opacity: 0.65;' : ''}">
                                            ${this.escapeHtml(item.title || item.action_text || '')}
                                        </div>
                                        ${item.description && item.description !== item.title ? `
                                            <div style="font-size: 12px; color: var(--color-text-secondary, #67584A); margin-top: 2px;">
                                                ${this.escapeHtml(item.description)}
                                            </div>
                                        ` : ''}
                                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 6px; font-size: 11px;">
                                            ${item.assigned_to_name ? `
                                                <span class="smart-assignee-pill">👤 ${this.escapeHtml(item.assigned_to_name)}</span>
                                            ` : ''}
                                            ${item.due_date ? `
                                                <span class="smart-date-pill">📅 ${this.escapeHtml(item.due_date.slice(0, 10))}</span>
                                            ` : ''}
                                        </div>
                                    </div>
                                    <div style="display: flex; align-items: center; gap: 4px;">
                                        <button type="button" class="btn btn-ghost btn-sm smart-edit-action-btn" data-item-id="${this.escapeHtml(String(item.id))}" title="Edit" style="padding: 4px 6px;">✏</button>
                                        <button type="button" class="btn btn-ghost btn-sm smart-delete-action-btn" data-item-id="${this.escapeHtml(String(item.id))}" title="Delete" style="padding: 4px 6px; color: var(--color-danger, #B84C45);">🗑</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        // Bind Add Form triggers
        const toggleAddBtn = panel.querySelector('#smartToggleAddActionBtn');
        const formBox = panel.querySelector('#smartAddActionFormBox');
        const cancelAddBtn = panel.querySelector('#smartCancelAddActionBtn');
        const createBtn = panel.querySelector('#smartCreateActionBtn');
        const titleInput = panel.querySelector('#smartNewActionInput');
        const descInput = panel.querySelector('#smartNewActionDescInput');
        const dateInput = panel.querySelector('#smartNewActionDateInput');

        if (toggleAddBtn) {
            toggleAddBtn.addEventListener('click', () => {
                this.isAddingAction = !this.isAddingAction;
                if (formBox) formBox.style.display = this.isAddingAction ? 'flex' : 'none';
                if (this.isAddingAction && titleInput) titleInput.focus();
            });
        }

        if (cancelAddBtn) {
            cancelAddBtn.addEventListener('click', () => {
                this.isAddingAction = false;
                if (formBox) formBox.style.display = 'none';
            });
        }

        if (createBtn) {
            createBtn.addEventListener('click', async () => {
                const title = titleInput?.value?.trim();
                const desc = descInput?.value?.trim();
                const due = dateInput?.value || null;
                if (!title) return;

                try {
                    const newItem = await api.createActionItem(this.currentConvId, {
                        conversation_type: this.currentConvType,
                        title,
                        description: desc,
                        due_date: due ? new Date(due).toISOString() : undefined,
                        status: 'OPEN'
                    });
                    if (this.analysis && this.analysis.action_items) {
                        this.analysis.action_items.unshift(newItem);
                    }
                    this.isAddingAction = false;
                    this.renderActionsTab();
                    this.updateTabCounts();
                } catch (e) {
                    console.error('Failed to create action item:', e);
                }
            });
        }

        // Bind Checkbox Toggle
        panel.querySelectorAll('.smart-checkbox').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.itemId;
                const item = (this.analysis.action_items || []).find(it => String(it.id) === String(id));
                if (!item) return;

                const nextStatus = (item.status || '').toUpperCase() === 'COMPLETED' ? 'OPEN' : 'COMPLETED';
                item.status = nextStatus;
                item.completed = (nextStatus === 'COMPLETED');

                try {
                    await api.updateActionItemStatus(this.currentConvId, id, nextStatus);
                } catch (err) {
                    console.error('Failed to update status:', err);
                }
                this.renderActionsTab();
                this.updateTabCounts();
            });
        });

        // Bind Delete
        panel.querySelectorAll('.smart-delete-action-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.itemId;
                try {
                    await api.deleteActionItem(this.currentConvId, id);
                } catch (err) {
                    console.error('Failed to delete action:', err);
                }
                if (this.analysis && this.analysis.action_items) {
                    this.analysis.action_items = this.analysis.action_items.filter(it => String(it.id) !== String(id));
                }
                this.renderActionsTab();
                this.updateTabCounts();
            });
        });

        // Bind Inline Edit
        panel.querySelectorAll('.smart-edit-action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editingActionId = btn.dataset.itemId;
                this.renderActionsTab();
            });
        });

        panel.querySelectorAll('.smart-cancel-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.editingActionId = null;
                this.renderActionsTab();
            });
        });

        panel.querySelectorAll('.smart-save-edit-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const id = btn.dataset.itemId;
                const editTitle = panel.querySelector('#smartEditTitleInput')?.value?.trim();
                const editDesc = panel.querySelector('#smartEditDescInput')?.value?.trim();
                if (!editTitle) return;

                const item = (this.analysis.action_items || []).find(it => String(it.id) === String(id));
                if (item) {
                    item.title = editTitle;
                    item.description = editDesc;
                }
                this.editingActionId = null;
                this.renderActionsTab();

                try {
                    await api.updateActionItem(this.currentConvId, id, { title: editTitle, description: editDesc });
                } catch (err) {
                    console.error('Failed to save edit:', err);
                }
            });
        });
    }

    // ---------------- 5. DECISIONS TAB ----------------
    renderDecisionsTab() {
        const dom = this.getDom();
        const panel = dom.tabPanels.decisions;
        if (!panel || !this.analysis) return;

        const items = this.analysis.decisions || [];
        if (items.length === 0) {
            panel.innerHTML = `
                <div class="smart-state-view" style="padding: 36px 16px;">
                    <div style="font-size: 32px; margin-bottom: 8px;">🎖</div>
                    <div class="smart-state-title">No decisions logged</div>
                    <div class="smart-state-desc">Key choices and resolutions will appear here.</div>
                </div>
            `;
            return;
        }

        panel.innerHTML = `
            <div class="smart-tab-content-flow">
                <div style="font-size: 13px; font-weight: 600; color: var(--color-text-secondary, #67584A); margin-bottom: 4px;">
                    Showing ${items.length} confirmed decisions:
                </div>
                ${items.map(d => `
                    <div class="smart-card smart-item-card" style="padding: 14px; gap: 8px;">
                        <div style="display: flex; align-items: flex-start; gap: 8px;">
                            <span style="font-size: 16px; color: var(--color-accent, #B86B3D);">🎖</span>
                            <div style="flex: 1; min-width: 0;">
                                <div style="font-size: 14px; font-weight: 600; color: var(--color-text-primary, #2D241D); line-height: 1.45;">
                                    ${this.escapeHtml(d.decision_text || '')}
                                </div>
                                ${d.created_at ? `
                                    <div style="font-size: 11px; color: var(--color-text-muted, #8E7C6C); margin-top: 4px;">
                                        Logged on ${this.escapeHtml(d.created_at.slice(0, 10))}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                        ${d.source_message_id ? `
                            <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
                                <button type="button" class="btn btn-secondary btn-sm smart-view-msg-btn" data-source-id="${this.escapeHtml(String(d.source_message_id))}">
                                    <span>View Context</span>
                                    <span>↗</span>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;

        this.bindSourceNavigation(panel);
    }

    // ---------------- 6. DATES TAB ----------------
    renderDatesTab() {
        const dom = this.getDom();
        const panel = dom.tabPanels.dates;
        if (!panel || !this.analysis) return;

        const items = this.analysis.dates || [];
        if (items.length === 0) {
            panel.innerHTML = `
                <div class="smart-state-view" style="padding: 36px 16px;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📅</div>
                    <div class="smart-state-title">No upcoming deadlines</div>
                    <div class="smart-state-desc">Dates, events, and milestones will appear here.</div>
                </div>
            `;
            return;
        }

        panel.innerHTML = `
            <div class="smart-tab-content-flow">
                <div style="font-size: 13px; font-weight: 600; color: var(--color-text-secondary, #67584A); margin-bottom: 4px;">
                    Showing ${items.length} upcoming events & deadlines:
                </div>
                ${items.map(dt => `
                    <div class="smart-card smart-item-card" style="padding: 14px; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                            <span style="font-size: 14px; font-weight: 600; color: var(--color-text-primary, #2D241D);">
                                📅 ${this.escapeHtml(dt.event_name || 'Event')}
                            </span>
                            ${dt.event_date ? `
                                <span class="smart-date-pill" style="font-size: 12px; font-weight: 600;">
                                    ${this.escapeHtml(dt.event_date)}
                                </span>
                            ` : ''}
                        </div>
                        ${dt.description ? `
                            <p style="font-size: 13px; color: var(--color-text-secondary, #67584A); margin: 2px 0;">
                                ${this.escapeHtml(dt.description)}
                            </p>
                        ` : ''}
                        ${dt.source_message_id ? `
                            <div style="display: flex; justify-content: flex-end; margin-top: 4px;">
                                <button type="button" class="btn btn-secondary btn-sm smart-view-msg-btn" data-source-id="${this.escapeHtml(String(dt.source_message_id))}">
                                    <span>View Message</span>
                                    <span>↗</span>
                                </button>
                            </div>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        `;

        this.bindSourceNavigation(panel);
    }

    // ---------------- 7. FILES TAB ----------------
    renderFilesTab() {
        const dom = this.getDom();
        const panel = dom.tabPanels.files;
        if (!panel || !this.analysis) return;

        const files = this.analysis.important_files || [];
        const formatSize = (bytes) => {
            if (!bytes) return '';
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / 1048576).toFixed(1)} MB`;
        };

        panel.innerHTML = `
            <div class="smart-tab-content-flow">
                <div style="font-size: 13px; font-weight: 600; color: var(--color-text-secondary, #67584A); margin-bottom: 4px;">
                    Showing ${files.length} conversation documents:
                </div>
                ${files.length === 0 ? `
                    <div class="smart-state-view" style="padding: 32px 16px;">
                        <div style="font-size: 32px; margin-bottom: 8px;">📁</div>
                        <div class="smart-state-title">No files found</div>
                        <div class="smart-state-desc">Documents shared in this chat will appear here.</div>
                    </div>
                ` : `
                    <div class="smart-files-grid">
                        ${files.map(f => `
                            <div class="smart-file-card-box smart-file-item" id="smartFileRow-${f.id}">
                                <div class="smart-file-card-top">
                                    <span class="smart-file-emoji">📄</span>
                                    <div class="smart-file-details">
                                        <div class="smart-file-title" title="${this.escapeHtml(f.filename)}">${this.escapeHtml(f.filename)}</div>
                                        <div class="smart-file-size">${formatSize(f.size)} ${f.sender_name ? `• ${this.escapeHtml(f.sender_name)}` : ''}</div>
                                    </div>
                                </div>
                                <div class="smart-file-actions-row">
                                    <button type="button" class="btn btn-secondary btn-sm smart-open-file-btn" data-file-id="${f.id}" data-filename="${this.escapeHtml(f.filename)}" data-url="/api/files/${f.id}/download">Open</button>
                                    <button type="button" class="btn btn-primary btn-sm smart-analyze-file-btn" data-file-id="${f.id}" data-message-id="${f.message_id || ''}" data-filename="${this.escapeHtml(f.filename)}">Analyze ✦</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `}
            </div>
        `;

        panel.querySelectorAll('.smart-open-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const furl = btn.dataset.url;
                window.open(furl, '_blank');
            });
        });

        panel.querySelectorAll('.smart-analyze-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fid = parseInt(btn.dataset.fileId, 10);
                const mid = btn.dataset.messageId ? parseInt(btn.dataset.messageId, 10) : null;
                const fname = btn.dataset.filename;
                this.openForDocument(this.currentConvId, mid, fid, fname);
            });
        });
    }

    // ---------------- 8. INSIGHTS TAB ----------------
    renderInsightsTab() {
        const dom = this.getDom();
        const panel = dom.tabPanels.insights;
        if (!panel || !this.analysis) return;

        const insights = this.analysis.insights || {};
        const cards = [
            { title: 'Total Messages', value: insights.message_count || 0, icon: '💬' },
            { title: 'Participants', value: insights.participant_count || 1, icon: '👥' },
            { title: 'Action Items', value: insights.action_item_count || 0, icon: '☑' },
            { title: 'Decisions Logged', value: insights.decision_count || 0, icon: '🎖' },
            { title: 'Deadlines & Dates', value: insights.date_count || 0, icon: '📅' },
            { title: 'Attachments', value: insights.attachment_count || 0, icon: '📎' },
            { title: 'High Priority Msgs', value: insights.important_message_count || 0, icon: '⭐' },
            { title: 'Top Contributor', value: insights.most_active_participant || 'You', icon: '⚡' }
        ];

        panel.innerHTML = `
            <div class="smart-tab-content-flow">
                <div style="font-size: 13px; font-weight: 600; color: var(--color-text-secondary, #67584A); margin-bottom: 4px;">
                    Conversation Metrics & Activity:
                </div>
                <div class="smart-stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px;">
                    ${cards.map(c => `
                        <div class="smart-stat-card smart-insight-card">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <span class="smart-stat-label">${this.escapeHtml(c.title)}</span>
                                <span style="font-size: 14px;">${c.icon}</span>
                            </div>
                            <div class="smart-stat-num smart-insight-val">${this.escapeHtml(String(c.value))}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // ---------------- SOURCE MESSAGE NAVIGATION ----------------
    bindSourceNavigation(container) {
        if (!container) return;

        container.querySelectorAll('.smart-source-chip-btn, .smart-view-msg-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const srcId = btn.dataset.sourceId;
                if (srcId) {
                    this.navigateToSourceMessage(srcId);
                } else if (btn.dataset.page) {
                    if (window.showToast) window.showToast(`Navigating to citation: ${btn.dataset.page}`, 'info');
                }
            });
        });
    }

    navigateToSourceMessage(messageId) {
        if (!messageId) return;

        // On mobile, close/dock panel so the user can see the highlighted message in chat!
        if (window.innerWidth <= 768) {
            this.close();
        }

        const target = document.getElementById(`msgRow-${messageId}`) ||
                       document.querySelector(`[data-message-id="${messageId}"]`) ||
                       document.getElementById(`msg-${messageId}`);

        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('highlighted-message', 'highlight-pulse');
            setTimeout(() => {
                target.classList.remove('highlighted-message', 'highlight-pulse');
            }, 2800);
        } else {
            if (window.showToast) window.showToast(`Navigated to Message #${messageId}`, 'info');
        }
    }
}

// Instantiate globally
window.smartController = new SmartConversationController();
