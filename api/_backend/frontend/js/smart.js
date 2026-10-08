/* -------------------------------------------------------------------------
   FRANK SMART CONVERSATIONS CONTROLLER
   Docked intelligence panel for Desktop & Responsive Workspace for Mobile.
   Summary, What Did I Miss, Important Messages, Action Items (CRUD),
   Decisions, Important Dates, Important Files, and Real-time Insights.
   ------------------------------------------------------------------------- */

class SmartConversationController {
    constructor() {
        this.isOpen = false;
        this.activeTab = 'summary';
        this.currentConvId = null;
        this.currentConvType = 'direct';
        this.isLoading = false;
        this.isGenerating = false;
        this.lastLoadedMessageId = null;
        this.missedPeriod = 'last_read';
        this.cachedData = {
            summary: null,
            missed: null,
            important: null,
            actions: null,
            decisions: null,
            dates: null,
            files: null,
            insights: null
        };

        this.init();
    }

    init() {
        this.bindTriggers();
        this.bindEvents();
        this.setupWebSocketListener();
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
            tabButtons: document.querySelectorAll('.smart-tab-btn'),
            tabsBar: document.getElementById('smartTabsBar'),
            bodyContainer: document.getElementById('smartModalBody'),
            loadingState: document.getElementById('smartLoadingState'),
            loadingText: document.getElementById('smartLoadingText'),
            errorState: document.getElementById('smartErrorState'),
            errorDesc: document.getElementById('smartErrorDesc'),
            tryAgainBtn: document.getElementById('smartTryAgainBtn'),
            emptyState: document.getElementById('smartEmptyState'),
            emptyTitle: document.getElementById('smartEmptyTitle'),
            emptyDesc: document.getElementById('smartEmptyDesc'),
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
        // Direct click on Header Smart Button
        const headerBtn = document.getElementById('chatSmartBtn');
        if (headerBtn) {
            headerBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.open();
            });
        }

        // Click from Header More Menu
        const moreBtn = document.getElementById('moreSmartBtn');
        if (moreBtn) {
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (window.chatController) window.chatController.closeMoreMenu();
                this.open();
            });
        }
    }

    bindEvents() {
        const dom = this.getDom();

        // Close button (X)
        if (dom.closeBtn) {
            dom.closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.close();
            });
        }

        // Mobile back button (←)
        if (dom.backBtn) {
            dom.backBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.close();
            });
        }

        // Header Refresh button (↻)
        if (dom.refreshBtn) {
            dom.refreshBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.refreshCurrentTab(true);
            });
        }

        // Realtime banner refresh
        if (dom.refreshBannerBtn) {
            dom.refreshBannerBtn.addEventListener('click', () => {
                if (dom.realtimeBanner) dom.realtimeBanner.classList.remove('visible');
                this.refreshCurrentTab(true);
            });
        }

        // Try Again error retry
        if (dom.tryAgainBtn) {
            dom.tryAgainBtn.addEventListener('click', () => {
                this.refreshCurrentTab(true);
            });
        }

        // Tab switches
        dom.tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.smartTab;
                if (tab) this.switchTab(tab);
            });
        });

        // Keyboard navigation (Escape to close on mobile)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen && window.innerWidth <= 768) {
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

    async open() {
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

        if (this.currentConvId !== newId || this.currentConvType !== newType) {
            this.currentConvId = newId;
            this.currentConvType = newType;
            this.resetCache();
        }
        this.isOpen = true;

        const dom = this.getDom();
        if (dom.modal) {
            dom.modal.classList.add('active');
            dom.modal.classList.add('open');
            dom.modal.style.display = 'flex';
            dom.modal.style.visibility = 'visible';
            dom.modal.style.opacity = '1';
        }
        if (dom.realtimeBanner) {
            dom.realtimeBanner.classList.remove('visible');
        }

        // Close details drawer if open on smaller screens
        if (window.innerWidth <= 1200) {
            const drawer = document.getElementById('detailsDrawer');
            if (drawer && drawer.style.display !== 'none') {
                drawer.style.display = 'none';
            }
        }

        // Switch to initial tab (or keep current active)
        await this.switchTab(this.activeTab || 'summary');
    }

    close() {
        this.isOpen = false;
        const dom = this.getDom();
        if (dom.modal) {
            dom.modal.classList.remove('active');
            dom.modal.classList.remove('open');
            dom.modal.style.display = 'none';
            dom.modal.style.visibility = 'hidden';
            dom.modal.style.opacity = '0';
        }
    }

    resetCache() {
        this.cachedData = {
            summary: null,
            missed: null,
            important: null,
            actions: null,
            decisions: null,
            dates: null,
            files: null,
            insights: null
        };
        const dom = this.getDom();
        if (dom && dom.tabPanels) {
            Object.values(dom.tabPanels).forEach(panel => {
                if (panel) panel.innerHTML = '';
            });
        }
    }

    async onConversationChanged(newId, newType) {
        if (!this.isOpen) {
            this.currentConvId = newId;
            this.currentConvType = newType;
            this.resetCache();
            return;
        }

        this.currentConvId = newId;
        this.currentConvType = newType;
        this.resetCache();

        const dom = this.getDom();
        if (dom.realtimeBanner) {
            dom.realtimeBanner.classList.remove('visible');
        }

        // Reload data for currently active tab
        await this.loadTabData(this.activeTab, false);
    }

    showState(stateName, errorDetail = null) {
        const dom = this.getDom();
        if (dom.loadingState) dom.loadingState.style.display = stateName === 'loading' ? 'flex' : 'none';
        if (dom.errorState) dom.errorState.style.display = stateName === 'error' ? 'flex' : 'none';
        if (dom.emptyState) dom.emptyState.style.display = stateName === 'empty' ? 'flex' : 'none';

        if (stateName === 'error' && dom.errorDesc) {
            dom.errorDesc.textContent = errorDetail || (window.i18n ? window.i18n.t('smart.unavailable') : 'Smart Conversation is temporarily unavailable. Please try again.');
        }

        Object.keys(dom.tabPanels).forEach(key => {
            const panel = dom.tabPanels[key];
            if (panel) {
                panel.style.display = (stateName === 'content' && key === this.activeTab) ? 'block' : 'none';
            }
        });
    }

    async switchTab(tabName) {
        this.activeTab = tabName;
        const dom = this.getDom();

        // Update active class on tab buttons
        dom.tabButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.smartTab === tabName);
        });

        // Hide other tab panels
        Object.keys(dom.tabPanels).forEach(key => {
            const panel = dom.tabPanels[key];
            if (panel) panel.style.display = 'none';
        });

        // Load data for the selected tab
        await this.loadTabData(tabName, false);
    }

    async refreshCurrentTab(forceRefresh = true) {
        if (this.isGenerating) return;
        await this.loadTabData(this.activeTab, forceRefresh);
    }

    async loadTabData(tabName, force = false) {
        if (!this.currentConvId) return;

        // Prevent concurrent double-clicks
        if (this.isGenerating) return;
        this.isGenerating = true;

        this.showState('loading');
        const dom = this.getDom();
        if (dom.refreshBtn) dom.refreshBtn.classList.add('loading');

        try {
            switch (tabName) {
                case 'summary':
                    await this.loadSummary(force);
                    break;
                case 'missed':
                    await this.loadMissed(this.missedPeriod, null, null, force);
                    break;
                case 'important':
                    await this.loadImportant(force);
                    break;
                case 'actions':
                    await this.loadActions(force);
                    break;
                case 'decisions':
                    await this.loadDecisions(force);
                    break;
                case 'dates':
                    await this.loadDates(force);
                    break;
                case 'files':
                    await this.loadFiles(force);
                    break;
                case 'insights':
                    await this.loadInsights(force);
                    break;
            }
        } catch (err) {
            console.error('[Smart Conversation Error]:', err);
            const status = err.status || (err.data && err.data.status) || (err.response && err.response.status);
            let msg = 'Smart Conversation analysis is temporarily unavailable.';
            if (status === 401) {
                msg = 'Your session has expired. Please sign in again.';
            } else if (status === 403) {
                msg = "You don't have permission to analyze this conversation.";
            } else if (status === 404) {
                msg = 'Conversation not found.';
            } else if (status === 501 || (err.message && err.message.includes('not configured'))) {
                msg = 'Smart Conversations AI is not configured.';
            } else if (status === 429) {
                msg = 'Too many requests. Please wait a moment before generating again.';
            } else if (err.name === 'TypeError' || (err.message && (err.message.includes('fetch') || err.message.includes('Failed to fetch') || err.message.includes('Network')))) {
                msg = 'Unable to connect to Smart Conversations.';
            }
            this.showState('error', msg);
        } finally {
            this.isGenerating = false;
            if (dom.refreshBtn) dom.refreshBtn.classList.remove('loading');
        }
    }

    // ---------------- 1. SUMMARY TAB ----------------
    async loadSummary(force = false) {
        const dom = this.getDom();
        let res;
        if (!force && this.cachedData.summary) {
            res = this.cachedData.summary;
        } else {
            res = await api.generateSmartSummary(this.currentConvId, this.currentConvType, force);
            if (res && res.success && res.status !== 'insufficient_content' && res.status !== 'empty') {
                this.cachedData.summary = res;
            }
        }

        if (!res.success || res.status === 'insufficient_content' || res.status === 'empty' || (!res.summary_bullets?.length && !res.summary_text)) {
            if (dom.emptyTitle) dom.emptyTitle.textContent = 'Smart Conversations';
            if (dom.emptyDesc) dom.emptyDesc.textContent = res.message || 'There are no messages to analyze yet.';
            this.showState('empty');
            return;
        }

        const panel = dom.tabPanels.summary;
        if (!panel) return;

        const bullets = res.summary_bullets || [];
        const bulletsHtml = bullets.map(b => `
            <li class="smart-summary-bullet">
                <span class="smart-bullet-dot"></span>
                <span>${this.escapeHtml(b)}</span>
            </li>
        `).join('');

        panel.innerHTML = `
            <div class="smart-summary-box">
                <div class="smart-summary-header">
                    <div class="smart-summary-title">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        <span data-i18n="smart.summary">Conversation Summary</span>
                    </div>
                    <div class="smart-summary-meta">
                        ${res.generated_at ? new Date(res.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Generated just now'}
                    </div>
                </div>
                <ul class="smart-summary-bullets">
                    ${bulletsHtml}
                </ul>
            </div>
            <div style="margin-top: 14px; display: flex; justify-content: flex-end;">
                <button type="button" class="btn btn-secondary btn-sm" id="smartRegenSummaryBtn" style="display: flex; align-items: center; gap: 6px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                    <span data-i18n="smart.regenerate">Regenerate Summary</span>
                </button>
            </div>
        `;

        document.getElementById('smartRegenSummaryBtn')?.addEventListener('click', () => {
            this.refreshCurrentTab(true);
        });

        this.showState('content');
    }

    // ---------------- 2. WHAT DID I MISS TAB ----------------
    async loadMissed(period = 'last_read', startDate = null, endDate = null, force = false) {
        this.missedPeriod = period;
        const dom = this.getDom();
        let res;
        if (!force && this.cachedData.missed && this.cachedData.missedPeriod === period) {
            res = this.cachedData.missed;
        } else {
            res = await api.generateSmartMissed(this.currentConvId, this.currentConvType, period, startDate, endDate);
            if (res && res.success) {
                this.cachedData.missed = res;
                this.cachedData.missedPeriod = period;
            }
        }

        const panel = dom.tabPanels.missed;
        if (!panel) return;

        const periodButtons = [
            { id: 'last_read', labelKey: 'smart.periodLastRead', default: 'Since my last read' },
            { id: 'today', labelKey: 'smart.periodToday', default: 'Today' },
            { id: 'yesterday', labelKey: 'smart.periodYesterday', default: 'Yesterday' },
            { id: 'last_7_days', labelKey: 'smart.period7Days', default: 'Last 7 days' },
            { id: 'custom', labelKey: 'smart.periodCustom', default: 'Custom range' }
        ];

        const pillsHtml = periodButtons.map(p => `
            <button type="button" class="smart-period-pill ${p.id === period ? 'active' : ''}" data-period="${p.id}">
                ${window.i18n ? window.i18n.t(p.labelKey) : p.default}
            </button>
        `).join('');

        const itemsHtml = (res.items || []).map(item => `
            <div class="smart-item-card">
                <div class="smart-item-content">
                    <div class="smart-item-title-row">
                        <span class="smart-item-sender">${this.escapeHtml(item.sender_name)}</span>
                        <span class="smart-item-time">${item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        <span class="smart-category-pill ${item.category}">${item.category}</span>
                    </div>
                    <div class="smart-item-preview">"${this.escapeHtml(item.preview)}"</div>
                </div>
                <div class="smart-item-actions">
                    <button type="button" class="smart-view-msg-btn" data-source-id="${item.source_message_id}" aria-label="View Message">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        <span data-i18n="smart.viewMessage">View Message</span>
                    </button>
                </div>
            </div>
        `).join('');

        panel.innerHTML = `
            <div class="smart-period-selector" id="smartMissedPeriodSelector">
                ${pillsHtml}
            </div>

            <div class="smart-custom-date-inputs" id="smartCustomDateInputs" style="display: ${period === 'custom' ? 'flex' : 'none'};">
                <input type="date" class="form-input" id="smartCustomStartDate" style="max-width: 150px; font-size: 12px;">
                <span style="font-size: 12px; color: var(--text-muted);">to</span>
                <input type="date" class="form-input" id="smartCustomEndDate" style="max-width: 150px; font-size: 12px;">
                <button type="button" class="btn btn-sm btn-primary" id="smartCustomApplyBtn">Apply</button>
            </div>

            <div class="smart-stats-grid">
                <div class="smart-stat-card">
                    <div class="smart-stat-num">${res.message_count || 0}</div>
                    <div class="smart-stat-label" data-i18n="smart.messagesCount">Messages</div>
                </div>
                <div class="smart-stat-card">
                    <div class="smart-stat-num">${res.important_updates_count || 0}</div>
                    <div class="smart-stat-label" data-i18n="smart.updatesCount">Updates</div>
                </div>
                <div class="smart-stat-card">
                    <div class="smart-stat-num">${res.files_count || 0}</div>
                    <div class="smart-stat-label" data-i18n="smart.filesCount">Files</div>
                </div>
                <div class="smart-stat-card">
                    <div class="smart-stat-num">${res.decisions_count || 0}</div>
                    <div class="smart-stat-label" data-i18n="smart.decisionsCount">Decisions</div>
                </div>
            </div>

            <div class="smart-missed-explanation">
                ${this.escapeHtml(res.explanation || 'No missed messages.')}
            </div>

            <div class="smart-item-list">
                ${itemsHtml || '<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 20px;">You are all caught up!</div>'}
            </div>
        `;

        // Bind period switchers
        panel.querySelectorAll('.smart-period-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                const p = pill.dataset.period;
                if (p === 'custom') {
                    const customWrap = document.getElementById('smartCustomDateInputs');
                    if (customWrap) customWrap.style.display = 'flex';
                } else {
                    this.loadMissed(p);
                }
            });
        });

        document.getElementById('smartCustomApplyBtn')?.addEventListener('click', () => {
            const startVal = document.getElementById('smartCustomStartDate')?.value;
            const endVal = document.getElementById('smartCustomEndDate')?.value;
            this.loadMissed('custom', startVal ? new Date(startVal).toISOString() : null, endVal ? new Date(endVal).toISOString() : null);
        });

        this.bindSourceNavigation(panel);
        this.showState('content');
    }

    // ---------------- 3. IMPORTANT MESSAGES TAB ----------------
    async loadImportant(force = false) {
        const dom = this.getDom();
        let res;
        if (!force && this.cachedData.important) {
            res = this.cachedData.important;
        } else {
            res = await api.getSmartImportant(this.currentConvId, this.currentConvType);
            if (res && res.success) {
                this.cachedData.important = res;
            }
        }

        const panel = dom.tabPanels.important;
        if (!panel) return;

        const messages = res.messages || [];
        if (!messages.length) {
            panel.innerHTML = `
                <div class="smart-state-view" style="padding: 24px;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📌</div>
                    <div class="smart-state-title" data-i18n="smart.noImportant">No important messages flagged.</div>
                    <div class="smart-state-desc">As key deadlines, decisions, and tasks are shared in the chat, they will appear here.</div>
                </div>
            `;
            this.showState('content');
            return;
        }

        const cardsHtml = messages.map(m => `
            <div class="smart-item-card">
                <div class="smart-item-content">
                    <div class="smart-item-title-row">
                        <span class="smart-item-sender">${this.escapeHtml(m.sender_name)}</span>
                        <span class="smart-item-time">${m.timestamp ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                        <span class="smart-category-pill ${m.category}">${m.category}</span>
                    </div>
                    <div class="smart-item-preview">"${this.escapeHtml(m.message_preview)}"</div>
                    <div class="smart-item-reason">${this.escapeHtml(m.reason || '')}</div>
                </div>
                <div class="smart-item-actions">
                    <button type="button" class="smart-view-msg-btn" data-source-id="${m.source_message_id}" aria-label="View Message">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                        <span data-i18n="smart.viewMessage">View Message</span>
                    </button>
                </div>
            </div>
        `).join('');

        panel.innerHTML = `
            <div class="smart-item-list">
                ${cardsHtml}
            </div>
        `;

        this.bindSourceNavigation(panel);
        this.showState('content');
    }

    // ---------------- 4. ACTION ITEMS TAB (CRUD) ----------------
    async loadActions(force = false) {
        const dom = this.getDom();
        const actions = await api.getSmartActions(this.currentConvId, this.currentConvType);

        const panel = dom.tabPanels.actions;
        if (!panel) return;

        const listHtml = (actions || []).map(a => `
            <div class="smart-action-item ${a.completed ? 'completed' : ''}" id="smartActionRow-${a.id}">
                <div class="smart-action-left">
                    <button type="button" class="smart-checkbox ${a.completed ? 'checked' : ''}" data-action-id="${a.id}" data-completed="${a.completed}" aria-label="Complete action item">
                        ${a.completed ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>` : ''}
                    </button>
                    <span class="smart-action-text">${this.escapeHtml(a.action_text)}</span>
                </div>
                <div class="smart-item-actions">
                    ${a.source_message_id ? `
                        <button type="button" class="smart-view-msg-btn" data-source-id="${a.source_message_id}" aria-label="View Source">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                            <span data-i18n="smart.viewSource">View Source</span>
                        </button>
                    ` : ''}
                    <button type="button" class="smart-delete-action-btn" data-delete-id="${a.id}" title="Delete Action Item" aria-label="Delete action item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </div>
            </div>
        `).join('');

        panel.innerHTML = `
            <div class="smart-item-list" id="smartActionsList">
                ${listHtml || `<div class="smart-state-view" style="padding: 24px;"><div class="smart-state-title" data-i18n="smart.noActions">No action items found.</div><div class="smart-state-desc">Tasks and assignments extracted from the chat will appear here.</div></div>`}
            </div>

            <div class="smart-add-action-box">
                <input type="text" class="form-input" id="smartNewActionInput" placeholder="Add custom action item..." style="flex: 1; font-size: 13px;" data-i18n-placeholder="smart.newActionPlaceholder">
                <button type="button" class="btn btn-primary btn-sm" id="smartCreateActionBtn" data-i18n="smart.addActionItem">+ Add</button>
            </div>
        `;

        // Bind Checkboxes (Mark complete / incomplete)
        panel.querySelectorAll('.smart-checkbox').forEach(cb => {
            cb.addEventListener('click', async () => {
                const aid = cb.dataset.actionId;
                const wasCompleted = cb.dataset.completed === 'true';
                const nextState = !wasCompleted;
                try {
                    await api.updateSmartAction(this.currentConvId, aid, { completed: nextState });
                    await this.loadActions(false);
                } catch (e) {
                    if (window.showToast) window.showToast('Failed to update action item.', 'error');
                }
            });
        });

        // Bind Delete buttons
        panel.querySelectorAll('.smart-delete-action-btn').forEach(delBtn => {
            delBtn.addEventListener('click', async () => {
                const aid = delBtn.dataset.deleteId;
                try {
                    await api.deleteSmartAction(this.currentConvId, aid);
                    document.getElementById(`smartActionRow-${aid}`)?.remove();
                    if (window.showToast) window.showToast('Action item deleted.', 'info');
                } catch (e) {
                    if (window.showToast) window.showToast('Failed to delete action item.', 'error');
                }
            });
        });

        // Bind Add Action
        const createBtn = document.getElementById('smartCreateActionBtn');
        const inputEl = document.getElementById('smartNewActionInput');
        const handleCreate = async () => {
            const txt = (inputEl?.value || '').trim();
            if (!txt) return;
            try {
                await api.createSmartAction(this.currentConvId, this.currentConvType, txt);
                inputEl.value = '';
                await this.loadActions(false);
            } catch (e) {
                if (window.showToast) window.showToast('Failed to add action item.', 'error');
            }
        };

        createBtn?.addEventListener('click', handleCreate);
        inputEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleCreate();
        });

        this.bindSourceNavigation(panel);
        this.showState('content');
    }

    // ---------------- 5. DECISIONS TAB ----------------
    async loadDecisions(force = false) {
        const dom = this.getDom();
        let res;
        if (!force && this.cachedData.decisions) {
            res = this.cachedData.decisions;
        } else {
            res = await api.getSmartDecisions(this.currentConvId, this.currentConvType);
            if (res && res.success) {
                this.cachedData.decisions = res;
            }
        }

        const panel = dom.tabPanels.decisions;
        if (!panel) return;

        const decisions = res.decisions || [];
        if (!decisions.length) {
            panel.innerHTML = `
                <div class="smart-state-view" style="padding: 24px;">
                    <div style="font-size: 32px; margin-bottom: 8px;">🤝</div>
                    <div class="smart-state-title" data-i18n="smart.noDecisions">No decisions identified.</div>
                    <div class="smart-state-desc">Explicit agreements and decisions made in conversation will appear here.</div>
                </div>
            `;
            this.showState('content');
            return;
        }

        const cardsHtml = decisions.map(d => `
            <div class="smart-item-card">
                <div class="smart-item-content">
                    <div class="smart-item-title-row">
                        <span class="smart-category-pill decision">✓ Decision</span>
                    </div>
                    <div class="smart-item-preview" style="font-weight: 600;">${this.escapeHtml(d.decision_text)}</div>
                </div>
                ${d.source_message_id ? `
                    <div class="smart-item-actions">
                        <button type="button" class="smart-view-msg-btn" data-source-id="${d.source_message_id}" aria-label="View Message">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            <span data-i18n="smart.viewMessage">View Message</span>
                        </button>
                    </div>
                ` : ''}
            </div>
        `).join('');

        panel.innerHTML = `<div class="smart-item-list">${cardsHtml}</div>`;
        this.bindSourceNavigation(panel);
        this.showState('content');
    }

    // ---------------- 6. DATES & DEADLINES TAB ----------------
    async loadDates(force = false) {
        const dom = this.getDom();
        let res;
        if (!force && this.cachedData.dates) {
            res = this.cachedData.dates;
        } else {
            res = await api.getSmartDates(this.currentConvId, this.currentConvType);
            if (res && res.success) {
                this.cachedData.dates = res;
            }
        }

        const panel = dom.tabPanels.dates;
        if (!panel) return;

        const dates = res.dates || [];
        if (!dates.length) {
            panel.innerHTML = `
                <div class="smart-state-view" style="padding: 24px;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📅</div>
                    <div class="smart-state-title" data-i18n="smart.noDates">No important dates found.</div>
                    <div class="smart-state-desc">Upcoming milestones, releases, and deadlines mentioned will be organized here.</div>
                </div>
            `;
            this.showState('content');
            return;
        }

        const cardsHtml = dates.map(dt => `
            <div class="smart-item-card">
                <div class="smart-item-content">
                    <div class="smart-item-title-row">
                        <span class="smart-category-pill deadline">📅 ${this.escapeHtml(dt.date_value)}</span>
                    </div>
                    <div class="smart-item-preview" style="font-weight: 600;">${this.escapeHtml(dt.title)}</div>
                </div>
                ${dt.source_message_id ? `
                    <div class="smart-item-actions">
                        <button type="button" class="smart-view-msg-btn" data-source-id="${dt.source_message_id}" aria-label="View Message">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            <span data-i18n="smart.viewMessage">View Message</span>
                        </button>
                    </div>
                ` : ''}
            </div>
        `).join('');

        panel.innerHTML = `<div class="smart-item-list">${cardsHtml}</div>`;
        this.bindSourceNavigation(panel);
        this.showState('content');
    }

    // ---------------- 7. IMPORTANT FILES TAB ----------------
    async loadFiles(force = false) {
        const dom = this.getDom();
        let res;
        if (!force && this.cachedData.files) {
            res = this.cachedData.files;
        } else {
            res = await api.getSmartFiles(this.currentConvId, this.currentConvType);
            if (res && res.success) {
                this.cachedData.files = res;
            }
        }

        const panel = dom.tabPanels.files;
        if (!panel) return;

        const files = (res && res.files) || [];
        if (!files.length) {
            panel.innerHTML = `
                <div class="smart-state-view" style="padding: 24px;">
                    <div style="font-size: 32px; margin-bottom: 8px;">📁</div>
                    <div class="smart-state-title" data-i18n="smart.noFiles">No files shared in this conversation.</div>
                    <div class="smart-state-desc">Documents, images, and attachments sent in this chat will appear here.</div>
                </div>
            `;
            this.showState('content');
            return;
        }

        const formatSize = (bytes) => {
            if (!bytes || bytes < 1024) return `${bytes || 0} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        };

        const listHtml = files.map(f => `
            <div class="smart-file-item" id="smartFileRow-${f.id}">
                <div class="smart-file-info">
                    <div class="smart-file-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                    </div>
                    <div class="smart-file-meta-col">
                        <div class="smart-file-name" title="${this.escapeHtml(f.original_filename)}">${this.escapeHtml(f.original_filename)}</div>
                        <div class="smart-file-sub">${formatSize(f.file_size)} • ${this.escapeHtml(f.file_type.toUpperCase())} • by ${this.escapeHtml(f.uploader_name)}</div>
                    </div>
                </div>
                <div class="smart-file-actions">
                    <button type="button" class="btn btn-ghost btn-sm smart-open-file-btn" data-file-id="${f.id}" data-file-type="${f.file_type}" data-filename="${this.escapeHtml(f.original_filename)}" data-url="${f.download_url || `/api/files/${f.id}/download`}" style="padding: 4px 8px; font-size: 11px;">
                        Open
                    </button>
                    <a href="${f.download_url || `/api/files/${f.id}/download`}" class="btn btn-secondary btn-sm" download="${this.escapeHtml(f.original_filename)}" style="padding: 4px 8px; font-size: 11px; text-decoration: none;">
                        Download
                    </a>
                </div>
            </div>
        `).join('');

        panel.innerHTML = `
            <div class="smart-item-list" id="smartFilesList">
                ${listHtml}
            </div>
        `;

        panel.querySelectorAll('.smart-open-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fid = btn.dataset.fileId;
                const ftype = btn.dataset.fileType;
                const fname = btn.dataset.filename;
                const furl = btn.dataset.url;
                if (window.documentsController) {
                    window.documentsController.openDocument(fid, ftype, fname, furl);
                } else {
                    window.open(furl, '_blank');
                }
            });
        });

        this.showState('content');
    }

    // ---------------- 8. INSIGHTS TAB ----------------
    async loadInsights(force = false) {
        const dom = this.getDom();
        let res;
        if (!force && this.cachedData.insights) {
            res = this.cachedData.insights;
        } else {
            res = await api.getSmartInsights(this.currentConvId, this.currentConvType);
            if (res && res.success) {
                this.cachedData.insights = res;
            }
        }

        const panel = dom.tabPanels.insights;
        if (!panel) return;

        const participantsHtml = (res.participants || []).map(p => `
            <span class="smart-participant-tag">${this.escapeHtml(p)}</span>
        `).join('');

        panel.innerHTML = `
            <div class="smart-insights-grid" id="smartInsightsGrid">
                <div class="smart-insight-card">
                    <div class="smart-insight-val smart-insight-num">${res.total_messages || 0}</div>
                    <div class="smart-insight-lbl">Total Messages</div>
                </div>
                <div class="smart-insight-card">
                    <div class="smart-insight-val smart-insight-num">${res.files_count || 0}</div>
                    <div class="smart-insight-lbl">Files Shared</div>
                </div>
                <div class="smart-insight-card">
                    <div class="smart-insight-val smart-insight-num">${res.action_items_count || 0}</div>
                    <div class="smart-insight-lbl">Action Items</div>
                </div>
                <div class="smart-insight-card">
                    <div class="smart-insight-val smart-insight-num">${res.decisions_count || 0}</div>
                    <div class="smart-insight-lbl">Decisions Made</div>
                </div>
                <div class="smart-insight-card">
                    <div class="smart-insight-val smart-insight-num">${res.dates_count || 0}</div>
                    <div class="smart-insight-lbl">Important Dates</div>
                </div>
                <div class="smart-insight-card">
                    <div class="smart-insight-val smart-insight-num">${res.unread_messages || 0}</div>
                    <div class="smart-insight-lbl">Unread Messages</div>
                </div>
            </div>

            <div class="smart-insights-section">
                <div class="smart-insights-section-title">Message Breakdown</div>
                <div style="font-size: 13px; color: var(--text); line-height: 1.6;">
                    • <strong>${res.user_messages || 0}</strong> messages sent by you<br>
                    • <strong>${res.other_messages || 0}</strong> messages received from other participants
                </div>
            </div>

            <div class="smart-insights-section">
                <div class="smart-insights-section-title">Active Participants (${res.active_participants_count || 1})</div>
                <div class="smart-participants-list">
                    ${participantsHtml || '<span class="smart-participant-tag">Current chat members</span>'}
                </div>
            </div>

            <div class="smart-insights-section">
                <div class="smart-insights-section-title">Last Activity</div>
                <div style="font-size: 12px; color: var(--text-muted);">
                    ${res.last_activity ? new Date(res.last_activity).toLocaleString() : 'No recent activity recorded.'}
                </div>
            </div>
        `;

        this.showState('content');
    }

    // ---------------- SOURCE MESSAGE NAVIGATION ----------------
    bindSourceNavigation(container) {
        container.querySelectorAll('.smart-view-msg-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const srcId = btn.dataset.sourceId;
                if (srcId) this.navigateToSourceMessage(srcId);
            });
        });
    }

    navigateToSourceMessage(messageId) {
        if (!messageId) return;

        if (window.innerWidth <= 768) {
            this.close();
        }

        const target = document.getElementById(`msgRow-${messageId}`) || 
                       document.querySelector(`[data-message-id="${messageId}"]`) ||
                       document.getElementById(`msg-${messageId}`);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add('highlight-pulse');
            setTimeout(() => {
                target.classList.remove('highlight-pulse');
            }, 2500);
        } else {
            if (window.showToast) window.showToast(`Navigated to source message #${messageId}`, 'info');
        }
    }

    async analyzeMessage(convId, messageId) {
        if (!convId || !messageId) return;
        if (window.showToast) window.showToast('✨ Analyzing message...', 'info', 2000);

        try {
            const res = await api.analyzeSmartMessage(convId, messageId);
            if (!res || !res.success) {
                if (window.showToast) window.showToast('Unable to analyze message. Please try again.', 'error');
                return;
            }
            this.showAnalysisModal({
                title: '✨ Smart Message Analysis',
                subtitle: `Message from ${res.sender_name || 'User'}`,
                category: res.analysis?.category || 'General',
                tone: res.analysis?.tone || 'Neutral',
                keyTakeaway: res.analysis?.key_takeaway || res.analysis?.summary,
                suggestedReply: res.analysis?.suggested_reply,
                provider: res.analysis?.provider,
                hasAction: res.analysis?.has_action_item
            });
        } catch (err) {
            console.error('Smart message analysis error:', err);
            if (window.showToast) window.showToast('Smart AI analysis temporarily unavailable.', 'error');
        }
    }

    async analyzeDocument(convId, messageId, attachmentId) {
        if (!convId || !attachmentId) return;
        if (window.showToast) window.showToast('✨ Analyzing document...', 'info', 2000);

        try {
            const res = await api.analyzeSmartDocument(convId, messageId, attachmentId);
            if (!res || !res.success) {
                if (window.showToast) window.showToast('Unable to analyze document. Please try again.', 'error');
                return;
            }
            this.showAnalysisModal({
                title: '✨ Smart Document Analysis',
                subtitle: `${res.filename || 'Document'} (${res.file_type || 'file'})`,
                category: res.analysis?.classification || 'Document Asset',
                tone: res.analysis?.security_status || 'Verified Safe',
                keyTakeaway: res.analysis?.summary || `Format: ${res.analysis?.format || 'PDF'}, Size: ${res.analysis?.size_formatted || ''}`,
                provider: res.analysis?.provider
            });
        } catch (err) {
            console.error('Smart document analysis error:', err);
            if (window.showToast) window.showToast('Smart AI analysis temporarily unavailable.', 'error');
        }
    }

    showAnalysisModal(data) {
        // Remove existing modal if any
        const existing = document.getElementById('frankSpecificAnalysisModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'frankSpecificAnalysisModal';
        modal.className = 'modal-backdrop open active';
        modal.style.zIndex = '9999';

        modal.innerHTML = `
            <div class="modal-card" style="max-width: 480px; width: 90vw; border-radius: var(--radius-xl); background: var(--surface); border: 1px solid var(--border); box-shadow: var(--shadow-xl); overflow: hidden;">
                <div style="padding: 16px 20px; background: linear-gradient(135deg, rgba(37,99,235,0.12), rgba(168,85,247,0.12)); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-weight: 800; font-size: 16px; color: var(--text);">${this.escapeHtml(data.title)}</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${this.escapeHtml(data.subtitle)}</div>
                    </div>
                    <button type="button" class="btn-icon btn-ghost close-smart-analysis-btn" style="width: 32px; height: 32px; border-radius: 50%;">✕</button>
                </div>
                <div style="padding: 20px; display: flex; flex-direction: column; gap: 14px;">
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <span style="background: rgba(37,99,235,0.12); color: var(--primary); font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-full); border: 1px solid rgba(37,99,235,0.25);">
                            ${this.escapeHtml(data.category)}
                        </span>
                        <span style="background: rgba(16,185,129,0.12); color: #10B981; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-full); border: 1px solid rgba(16,185,129,0.25);">
                            ${this.escapeHtml(data.tone)}
                        </span>
                        ${data.hasAction ? `
                            <span style="background: rgba(245,158,11,0.12); color: #F59E0B; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: var(--radius-full); border: 1px solid rgba(245,158,11,0.25);">
                                Action Required
                            </span>
                        ` : ''}
                    </div>

                    <div style="background: var(--surface-elevated); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 14px;">
                        <div style="font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px;">Key Takeaway</div>
                        <div style="font-size: 14px; color: var(--text); line-height: 1.5;">${this.escapeHtml(data.keyTakeaway)}</div>
                    </div>

                    ${data.suggestedReply ? `
                        <div style="background: rgba(99,102,241,0.06); border: 1px solid rgba(99,102,241,0.2); border-radius: var(--radius-md); padding: 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                <div style="font-size: 11px; font-weight: 700; color: var(--primary); text-transform: uppercase;">Suggested Quick Reply</div>
                                <button type="button" class="btn btn-sm btn-ghost copy-suggested-reply-btn" style="font-size: 11px; padding: 2px 8px; height: auto;">Use Reply</button>
                            </div>
                            <div style="font-size: 13px; color: var(--text);">${this.escapeHtml(data.suggestedReply)}</div>
                        </div>
                    ` : ''}

                    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text-muted);">
                        <span>AI Engine: ${this.escapeHtml(data.provider || 'FRANK Smart AI')}</span>
                        <button type="button" class="btn btn-secondary btn-sm close-smart-analysis-btn">Done</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelectorAll('.close-smart-analysis-btn').forEach(b => {
            b.addEventListener('click', () => modal.remove());
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        const replyBtn = modal.querySelector('.copy-suggested-reply-btn');
        if (replyBtn && data.suggestedReply) {
            replyBtn.addEventListener('click', () => {
                const textarea = document.getElementById('chatComposerInput') || document.querySelector('.composer-textarea');
                if (textarea) {
                    textarea.value = data.suggestedReply;
                    textarea.focus();
                }
                modal.remove();
                if (window.showToast) window.showToast('✓ Reply inserted into composer', 'success', 1500);
            });
        }
    }

// Instantiate globally
window.smartController = new SmartConversationController();
