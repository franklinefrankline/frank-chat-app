/* -------------------------------------------------------------------------
   FRANK - IN-CHAT OFFICE DOCUMENT WORKSPACE CONTROLLER
   Full-screen same-page document editor & viewer suite for FRANK.
   Preserves chat state, WebSocket synchronization, real version persistence.
   Supports: DOCX, XLSX, PPTX, PDF, TXT/MD, CSV, Images, Videos, Audio, ZIP.
   ------------------------------------------------------------------------- */

class FrankOfficeWorkspace {
    constructor() {
        this.currentDoc = null;
        this.category = 'unsupported';
        this.isDirty = false;
        this.activeCell = { coord: 'A1', r: 0, c: 0 };
        this.excelData = {
            sheets: [{ name: 'Sheet1', data: Array.from({ length: 30 }, () => Array(15).fill('')), formulas: {}, styles: {} }],
            activeSheetIdx: 0
        };
        this.pptxData = {
            slides: [{ id: 1, title: 'Title', content: ['Content'], bg_color: '#ffffff' }],
            activeSlideIdx: 0
        };
        this.textHistory = { undoStack: [], redoStack: [] };
        this.pdfState = { currentPage: 1, totalPages: 1, zoom: 100 };
        this.imageState = { zoom: 100, rotate: 0 };
        this.csvData = { rows: [[]], isRaw: false };
        this.audioState = { speeds: [1, 1.25, 1.5, 2], currentSpeedIdx: 0 };
        this.zipData = { files: [], totalCount: 0, totalSize: 0 };
        this.previousChatScroll = 0;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.injectWorkspaceMarkup();
        this.bindGlobalEvents();
        this.initialized = true;
    }

    injectWorkspaceMarkup() {
        let el = document.getElementById('frankDocumentWorkspace');
        if (!el) {
            el = document.createElement('div');
            el.id = 'frankDocumentWorkspace';
            el.className = 'frank-document-workspace';
            document.body.appendChild(el);
        }

        el.innerHTML = `
            <!-- Top Header -->
            <div class="workspace-top-bar" id="workspaceTopBar">
                <div class="workspace-top-left">
                    <button type="button" class="workspace-back-btn" id="workspaceBackBtn" aria-label="Back to conversation" title="Back to chat" data-i18n-aria-label="office.back" data-i18n-title="office.back">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        <span data-i18n="office.back">Back</span>
                    </button>
                    <div class="workspace-file-identity">
                        <span class="workspace-file-icon" id="workspaceDocIcon">📄</span>
                        <span class="workspace-file-title" id="workspaceDocTitle" title="Document">Document</span>
                        <span class="workspace-type-badge" id="workspaceTypeBadge">DOCX</span>
                    </div>
                    <div class="workspace-save-status saved" id="workspaceSaveStatus">
                        <span id="saveStatusDot">●</span>
                        <span id="saveStatusText" data-i18n="office.saved">Saved</span>
                    </div>
                    <button type="button" class="workspace-version-pill" id="workspaceVersionPill" title="View Version History" data-i18n-title="office.versionHistory">
                        <span id="workspaceVersionLabel">v1</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                </div>
                <div class="workspace-top-actions">
                    <button type="button" class="workspace-btn workspace-btn-primary" id="workspaceSaveBtn" title="Save document (Ctrl+S)" data-i18n-title="office.save">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
                        <span class="btn-label" data-i18n="office.save">Save</span>
                    </button>
                    <button type="button" class="workspace-btn workspace-btn-success" id="workspaceSendBtn" title="Send document to chat" data-i18n-title="office.sendToChat">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                        <span class="btn-label" data-i18n="office.sendToChat">Send to Chat</span>
                    </button>
                    <button type="button" class="workspace-btn" id="workspaceDownloadBtn" title="Download Document" data-i18n-title="office.download">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span class="btn-label" data-i18n="office.download">Download</span>
                    </button>
                    <button type="button" class="workspace-btn workspace-btn-icon" id="workspaceHistoryBtn" title="Version History" data-i18n-title="office.versionHistory" data-i18n-aria-label="office.versionHistory">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>
                    </button>
                    <button type="button" class="workspace-btn workspace-btn-icon" id="workspacePrintBtn" title="Print Document" data-i18n-title="office.print" data-i18n-aria-label="office.print">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                    </button>
                    <button type="button" class="workspace-btn workspace-btn-icon" id="workspaceFullscreenBtn" title="Toggle Fullscreen" data-i18n-title="office.fullScreen" data-i18n-aria-label="office.fullScreen">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                    </button>
                </div>
            </div>

            <!-- Contextual Menu & Toolbar -->
            <div class="workspace-menu-bar" id="workspaceMenuBar">
                <span class="workspace-menu-item active" data-i18n="office.menuFile">File</span>
                <span class="workspace-menu-item" data-i18n="office.menuEdit">Edit</span>
                <span class="workspace-menu-item" data-i18n="office.menuInsert">Insert</span>
                <span class="workspace-menu-item" data-i18n="office.menuFormat">Format</span>
                <span class="workspace-menu-item" data-i18n="office.menuView">View</span>
            </div>
            <div class="workspace-toolbar-container" id="workspaceToolbar">
                <!-- Dynamically populated based on document category -->
            </div>

            <!-- Main Canvas Area -->
            <div class="workspace-canvas-body" id="workspaceCanvasBody">
                <!-- Dynamically populated -->
            </div>

            <!-- Bottom Status Bar -->
            <div class="workspace-status-bar" id="workspaceStatusBar">
                <span id="statusBarLeft" data-i18n="office.ready">Ready</span>
                <span id="statusBarRight">UTF-8 • FRANK Office</span>
            </div>

            <!-- Version History Slide-over Drawer -->
            <div class="version-drawer" id="workspaceVersionDrawer">
                <div class="version-drawer-header">
                    <span data-i18n="office.versionHistory">Version History</span>
                    <button type="button" class="tool-btn" id="closeVersionDrawerBtn" aria-label="Close" data-i18n-aria-label="common.close">✕</button>
                </div>
                <div class="version-drawer-list" id="versionDrawerList">
                    <!-- Populated dynamically -->
                </div>
            </div>

            <!-- Unsaved Changes Prompt Modal -->
            <div class="workspace-modal-overlay" id="workspaceUnsavedModal">
                <div class="workspace-modal-card">
                    <div class="workspace-modal-title" data-i18n="office.unsavedChanges">Unsaved Changes</div>
                    <div class="workspace-modal-desc" data-i18n="office.unsavedDesc">You have unsaved changes. Leave without saving?</div>
                    <div class="workspace-modal-buttons">
                        <button type="button" class="workspace-btn" id="unsavedStayBtn" data-i18n="office.stay">Stay</button>
                        <button type="button" class="workspace-btn" id="unsavedDiscardBtn" style="color:var(--danger, #ef4444);" data-i18n="office.leave">Leave</button>
                        <button type="button" class="workspace-btn workspace-btn-primary" id="unsavedSaveExitBtn" data-i18n="office.saveAndExit">Save &amp; Exit</button>
                    </div>
                </div>
            </div>

            <!-- Version Conflict Modal -->
            <div class="workspace-modal-overlay" id="workspaceConflictModal">
                <div class="workspace-modal-card">
                    <div class="workspace-modal-title" data-i18n="office.versionConflict">Version Conflict</div>
                    <div class="workspace-modal-desc" id="conflictModalDesc" data-i18n="office.conflictDesc">This document was updated by another user while you were editing.</div>
                    <div class="workspace-modal-buttons">
                        <button type="button" class="workspace-btn" id="conflictCancelBtn" data-i18n="common.cancel">Cancel</button>
                        <button type="button" class="workspace-btn" id="conflictLoadLatestBtn" data-i18n="office.loadLatest">Load Latest</button>
                        <button type="button" class="workspace-btn workspace-btn-primary" id="conflictSaveNewBtn" data-i18n="office.saveNewVersion">Save as New Version</button>
                    </div>
                </div>
            </div>
        `;

        if (window.i18n && typeof window.i18n.applyTranslations === 'function') {
            window.i18n.applyTranslations(el);
        }
    }

    bindGlobalEvents() {
        const backBtn = document.getElementById('workspaceBackBtn');
        backBtn?.addEventListener('click', () => this.handleBack());

        const saveBtn = document.getElementById('workspaceSaveBtn');
        saveBtn?.addEventListener('click', () => this.saveDocument());

        const sendBtn = document.getElementById('workspaceSendBtn');
        sendBtn?.addEventListener('click', () => this.sendUpdatedFile());

        const dlBtn = document.getElementById('workspaceDownloadBtn');
        dlBtn?.addEventListener('click', () => this.downloadDocument());

        const histBtn = document.getElementById('workspaceHistoryBtn');
        histBtn?.addEventListener('click', () => this.toggleVersionDrawer());

        const verPill = document.getElementById('workspaceVersionPill');
        verPill?.addEventListener('click', () => this.toggleVersionDrawer());

        const closeDrawerBtn = document.getElementById('closeVersionDrawerBtn');
        closeDrawerBtn?.addEventListener('click', () => this.toggleVersionDrawer(false));

        const printBtn = document.getElementById('workspacePrintBtn');
        printBtn?.addEventListener('click', () => this.printDocument());

        const fsBtn = document.getElementById('workspaceFullscreenBtn');
        fsBtn?.addEventListener('click', () => this.toggleFullscreen());

        // Unsaved modal buttons
        document.getElementById('unsavedStayBtn')?.addEventListener('click', () => {
            document.getElementById('workspaceUnsavedModal')?.classList.remove('open');
        });
        document.getElementById('unsavedDiscardBtn')?.addEventListener('click', () => {
            this.isDirty = false;
            document.getElementById('workspaceUnsavedModal')?.classList.remove('open');
            this.closeWorkspace();
        });
        document.getElementById('unsavedSaveExitBtn')?.addEventListener('click', async () => {
            const saved = await this.saveDocument();
            if (saved) {
                document.getElementById('workspaceUnsavedModal')?.classList.remove('open');
                this.closeWorkspace();
            }
        });

        // Hotkeys
        document.addEventListener('keydown', (e) => {
            const ws = document.getElementById('frankDocumentWorkspace');
            if (!ws || !ws.classList.contains('active')) return;

            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveDocument();
            }
            if (e.key === 'Escape') {
                const docSendModal = document.getElementById('docSendToChatModal');
                if (docSendModal && docSendModal.style.display !== 'none') {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    if (window.documentBrowserController && typeof window.documentBrowserController.closeSendToChatModal === 'function') {
                        window.documentBrowserController.closeSendToChatModal();
                    } else {
                        docSendModal.style.display = 'none';
                    }
                    return;
                }

                const contextMenu = document.getElementById('spreadsheetContextMenu') || document.querySelector('.sheets-context-menu');
                const dropdownMenu = document.querySelector('.sheets-dropdown-menu');
                const modal = document.querySelector('.workspace-modal-overlay.open');
                const sheetsEngine = this.sheetsEngine;

                if (contextMenu) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (sheetsEngine && typeof sheetsEngine.closeContextMenu === 'function') {
                        sheetsEngine.closeContextMenu();
                    } else {
                        contextMenu.remove();
                    }
                    return;
                }
                if (dropdownMenu) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (sheetsEngine && typeof sheetsEngine.closeAllDropdowns === 'function') {
                        sheetsEngine.closeAllDropdowns();
                    } else {
                        dropdownMenu.remove();
                    }
                    return;
                }
                if (sheetsEngine && sheetsEngine.isEditingInline) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof sheetsEngine.cancelInlineEditing === 'function') {
                        sheetsEngine.cancelInlineEditing();
                    }
                    return;
                }
                if (modal) {
                    modal.classList.remove('open');
                } else {
                    this.handleBack();
                }
            }
        });

        // Listen for real-time language switches across the application
        window.addEventListener('frank:languageChanged', () => {
            const ws = document.getElementById('frankDocumentWorkspace');
            if (ws && window.i18n && typeof window.i18n.applyTranslations === 'function') {
                window.i18n.applyTranslations(ws);
            }
        });
    }

    // ---------------- OPEN DOCUMENT ENTRY POINT ----------------
    async openDocument(fileId, fileType, filename, directUrl) {
        const validFileId = (fileId && !isNaN(fileId) && parseInt(fileId, 10) > 0) ? parseInt(fileId, 10) : null;
        if (!validFileId && !directUrl && !filename) {
            console.warn('OfficeWorkspace.openDocument called without valid fileId, directUrl, or filename');
            return;
        }

        this.init();

        // Hide legacy attachment modal so it NEVER interferes or pops up over the workspace
        const legacyModal = document.getElementById('attachmentViewerModal');
        if (legacyModal) {
            legacyModal.classList.remove('open', 'active');
            legacyModal.style.display = 'none';
            legacyModal.style.visibility = 'hidden';
            legacyModal.style.opacity = '0';
        }

        // Save current chat scroll position to restore on exit
        const msgStream = document.getElementById('messagesStream') || document.querySelector('.messages-stream');
        if (msgStream) {
            this.previousChatScroll = msgStream.scrollTop;
        }

        const ws = document.getElementById('frankDocumentWorkspace');
        ws.style.display = 'flex';
        // Force reflow
        void ws.offsetWidth;
        ws.classList.add('active');

        const cleanName = filename || 'Document';
        const ext = (cleanName.split('.').pop() || '').toLowerCase();
        this.category = this.detectCategory(ext, fileType);

        this.currentDoc = {
            id: validFileId,
            filename: cleanName,
            ext: ext,
            category: this.category,
            viewUrl: validFileId ? api.getFileViewUrl(validFileId) : directUrl,
            downloadUrl: validFileId ? api.getFileDownloadUrl(validFileId) : directUrl,
            current_version_number: 1
        };

        this.updateHeaderUI();
        this.setSaveStatus('saved');
        this.isDirty = false;

        // Render editor frame
        this.renderCategoryWorkspace();

        // Fetch server workspace details and versions
        if (validFileId) {
            this.loadServerWorkspace(validFileId);
        }
    }

    detectCategory(ext, fileType) {
        if (ext === 'pdf' || fileType === 'pdf') return 'pdf';
        if (['doc', 'docx'].includes(ext) || fileType === 'word') return 'word';
        if (['xls', 'xlsx'].includes(ext) || fileType === 'excel') return 'excel';
        if (['ppt', 'pptx'].includes(ext) || fileType === 'pptx' || fileType === 'presentation') return 'pptx';
        if (['txt', 'text', 'md', 'json', 'log', 'xml', 'yaml', 'yml'].includes(ext) || fileType === 'text') return 'text';
        if (ext === 'csv' || fileType === 'csv') return 'csv';
        if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || fileType === 'image') return 'image';
        if (['mp4', 'mov', 'webm', 'mkv'].includes(ext) || fileType === 'video') return 'video';
        if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'weba'].includes(ext) || fileType === 'audio') return 'audio';
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext) || fileType === 'archive') return 'zip';
        return 'unsupported';
    }

    getCategoryIcon(cat) {
        switch (cat) {
            case 'word': return '📘';
            case 'excel': return '📊';
            case 'pptx': return '📽️';
            case 'pdf': return '📕';
            case 'text': return '📝';
            case 'csv': return '📈';
            case 'image': return '🖼️';
            case 'video': return '🎥';
            case 'audio': return '🎵';
            case 'zip': return '📦';
            default: return '📄';
        }
    }

    updateHeaderUI() {
        const iconEl = document.getElementById('workspaceDocIcon');
        if (iconEl) iconEl.textContent = this.getCategoryIcon(this.category);

        const titleEl = document.getElementById('workspaceDocTitle');
        if (titleEl) titleEl.textContent = this.currentDoc.filename;

        const badgeEl = document.getElementById('workspaceTypeBadge');
        if (badgeEl) badgeEl.textContent = (this.currentDoc.ext || 'FILE').toUpperCase();

        const verLabel = document.getElementById('workspaceVersionLabel');
        if (verLabel) verLabel.textContent = `v${this.currentDoc.current_version_number || 1}`;
    }

    setSaveStatus(status, text) {
        const pill = document.getElementById('workspaceSaveStatus');
        const textEl = document.getElementById('saveStatusText');
        if (!pill || !textEl) return;

        pill.className = `workspace-save-status ${status}`;
        if (status === 'saved') textEl.textContent = text || 'Saved ✓';
        else if (status === 'saving') textEl.textContent = 'Saving...';
        else if (status === 'dirty') textEl.textContent = 'Unsaved changes';
        else if (status === 'error') textEl.textContent = text || 'Save failed';
    }

    markDirty() {
        if (!this.isDirty) {
            this.isDirty = true;
            this.setSaveStatus('dirty');
        }
    }

    // ---------------- LOAD SERVER DATA ----------------
    async loadServerWorkspace(fileId) {
        try {
            const data = await api.getDocumentWorkspace(fileId);
            if (data && data.document) {
                this.currentDoc.current_version_number = data.document.current_version_number;
                this.updateHeaderUI();
            }

            // Populate parsed data into active workspace
            if (data && data.parsed) {
                if (this.category === 'word' && data.parsed.html) {
                    const page = document.getElementById('wordDocPage');
                    if (page) {
                        let cleanHtml = data.parsed.html;
                        cleanHtml = cleanHtml.replace(/&amp;(amp|lt|gt|quot|#39|nbsp);/g, '&$1;');
                        cleanHtml = cleanHtml.replace(/&amp;/g, '&');
                        page.innerHTML = cleanHtml;
                        this.updateWordCount();
                    }
                } else if (this.category === 'excel' && data.parsed.sheets) {
                    this.excelData = { sheets: data.parsed.sheets, activeSheetIdx: 0 };
                    if (this.sheetsEngine) {
                        this.sheetsEngine.initData();
                    }
                    this.renderExcelGrid();
                } else if (this.category === 'pptx' && data.parsed.slides) {
                    this.pptxData = { slides: data.parsed.slides, activeSlideIdx: 0 };
                    this.renderPptxCanvas();
                } else if (this.category === 'csv' && data.parsed.rows) {
                    this.csvData.rows = data.parsed.rows;
                    this.renderCsvTable(data.parsed.rows);
                } else if (this.category === 'text' && data.parsed.text) {
                    const ta = document.getElementById('textEditorTextarea');
                    if (ta) {
                        ta.value = data.parsed.text;
                        this.updateTextStats();
                    }
                } else if (this.category === 'zip' && data.parsed.files) {
                    this.zipData.files = data.parsed.files;
                    this.zipData.totalCount = data.parsed.total || data.parsed.files.length;
                    this.renderZipTree(data.parsed.files);
                }
            }
        } catch (err) {
            console.warn('Workspace data fetch note:', err);
        }
    }

    // ---------------- RENDER SPECIALIZED WORKSPACE ----------------
    renderCategoryWorkspace() {
        const toolbar = document.getElementById('workspaceToolbar');
        const canvas = document.getElementById('workspaceCanvasBody');
        toolbar.innerHTML = '';
        canvas.innerHTML = '';

        if (this.category === 'word') {
            this.mountWordEditor(toolbar, canvas);
        } else if (this.category === 'excel') {
            this.mountExcelEditor(toolbar, canvas);
        } else if (this.category === 'pptx') {
            this.mountPptxEditor(toolbar, canvas);
        } else if (this.category === 'pdf') {
            this.mountPdfWorkspace(toolbar, canvas);
        } else if (this.category === 'text') {
            this.mountTextEditor(toolbar, canvas);
        } else if (this.category === 'csv') {
            this.mountCsvEditor(toolbar, canvas);
        } else if (this.category === 'image') {
            this.mountImageViewer(toolbar, canvas);
        } else if (this.category === 'video') {
            this.mountVideoViewer(toolbar, canvas);
        } else if (this.category === 'audio') {
            this.mountAudioViewer(toolbar, canvas);
        } else if (this.category === 'zip') {
            this.mountZipViewer(toolbar, canvas);
        } else {
            this.mountUnsupportedViewer(toolbar, canvas);
        }
    }

    // =========================================================================
    // 1. WORD-STYLE PROCESSOR (DOC / DOCX)
    // Operations: Content editing, Heading 1–3, Bold, Italic, Underline,
    // Strikethrough, Text Color, Highlight, Align (Left/Center/Right/Justify),
    // Bullet/Numbered Lists, Indent, Insert Table, Insert Link, Word Count, Print,
    // Save, Version History.
    // =========================================================================
    mountWordEditor(toolbar, canvas) {
        toolbar.innerHTML = `
            <div class="toolbar-group">
                <button type="button" class="tool-btn icon-only" id="wordUndoBtn" title="Undo (Ctrl+Z)">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg>
                </button>
                <button type="button" class="tool-btn icon-only" id="wordRedoBtn" title="Redo (Ctrl+Y)">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"></path><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"></path></svg>
                </button>
            </div>
            <div class="toolbar-group">
                <select class="tool-select" id="wordStyleSelect" title="Text Style">
                    <option value="p">Normal Text</option>
                    <option value="h1">Heading 1</option>
                    <option value="h2">Heading 2</option>
                    <option value="h3">Heading 3</option>
                </select>
                <select class="tool-select" id="wordFontFamily" title="Font Family">
                    <option value="Inter, sans-serif">Inter</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="monospace">Courier</option>
                    <option value="'Times New Roman', serif">Times New Roman</option>
                </select>
                <select class="tool-select" id="wordFontSize" title="Font Size">
                    <option value="3">12pt</option>
                    <option value="4" selected>14pt</option>
                    <option value="5">18pt</option>
                    <option value="6">24pt</option>
                </select>
            </div>
            <div class="toolbar-group">
                <button type="button" class="tool-btn icon-only" id="wordBoldBtn" title="Bold"><strong>B</strong></button>
                <button type="button" class="tool-btn icon-only" id="wordItalicBtn" title="Italic"><em>I</em></button>
                <button type="button" class="tool-btn icon-only" id="wordUnderlineBtn" title="Underline"><u>U</u></button>
                <button type="button" class="tool-btn icon-only" id="wordStrikeBtn" title="Strikethrough"><s>S</s></button>
                <div class="tool-color-wrap" title="Text Color">
                    <button type="button" class="tool-btn icon-only" id="wordColorLabelBtn" style="color:#B86B3D;font-weight:700;">A</button>
                    <input type="color" class="tool-color-input" id="wordColorInput" value="#2D241D">
                </div>
                <div class="tool-color-wrap" title="Highlight Color">
                    <button type="button" class="tool-btn icon-only" id="wordHighlightLabelBtn" style="background:#fef08a;border-radius:4px;font-weight:700;font-size:12px;">🖍️</button>
                    <input type="color" class="tool-color-input" id="wordHighlightInput" value="#fef08a">
                </div>
            </div>
            <div class="toolbar-group">
                <button type="button" class="tool-btn icon-only" id="wordAlignLeft" title="Align Left">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="17" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="17" y1="18" x2="3" y2="18"></line></svg>
                </button>
                <button type="button" class="tool-btn icon-only" id="wordAlignCenter" title="Center">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="10" x2="6" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="18" y1="18" x2="6" y2="18"></line></svg>
                </button>
                <button type="button" class="tool-btn icon-only" id="wordAlignRight" title="Align Right">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="21" y1="10" x2="7" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="7" y2="18"></line></svg>
                </button>
                <button type="button" class="tool-btn icon-only" id="wordAlignJustify" title="Justify">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="21" y1="10" x2="3" y2="10"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="14" x2="3" y2="14"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>
                </button>
                <button type="button" class="tool-btn icon-only" id="wordBulletList" title="Bullet List">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                </button>
                <button type="button" class="tool-btn icon-only" id="wordNumList" title="Numbered List">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="10" y1="6" x2="21" y2="6"></line><line x1="10" y1="12" x2="21" y2="12"></line><line x1="10" y1="18" x2="21" y2="18"></line><path d="M4 6h1v4"></path><path d="M4 10h2"></path><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"></path></svg>
                </button>
                <button type="button" class="tool-btn icon-only" id="wordOutdentBtn" title="Decrease Indent">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="7 8 3 12 7 16"></polyline><line x1="21" y1="12" x2="11" y2="12"></line><line x1="21" y1="6" x2="11" y2="6"></line><line x1="21" y1="18" x2="11" y2="18"></line></svg>
                </button>
                <button type="button" class="tool-btn icon-only" id="wordIndentBtn" title="Increase Indent">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="13 8 17 12 13 16"></polyline><line x1="3" y1="12" x2="13" y2="12"></line><line x1="21" y1="6" x2="3" y2="6"></line><line x1="21" y1="18" x2="3" y2="18"></line></svg>
                </button>
            </div>
            <div class="toolbar-group">
                <button type="button" class="tool-btn btn-labeled" id="wordInsertTable" title="Insert Table" data-i18n-title="office.table">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line><line x1="12" y1="3" x2="12" y2="21"></line></svg>
                    <span data-i18n="office.table">Table</span>
                </button>
                <button type="button" class="tool-btn btn-labeled" id="wordInsertLink" title="Insert Link" data-i18n-title="office.link">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                    <span data-i18n="office.link">Link</span>
                </button>
                <button type="button" class="tool-btn icon-only" id="wordInsertLine" title="Horizontal Rule">―</button>
            </div>
        `;

        if (window.i18n && typeof window.i18n.applyTranslations === 'function') {
            window.i18n.applyTranslations(toolbar);
        }

        canvas.innerHTML = `
            <div class="word-editor-stage">
                <div class="word-document-page" id="wordDocPage" contenteditable="true" spellcheck="true" role="textbox" aria-multiline="true">
                    <h1>${messagesModule.escapeHTML(this.currentDoc.filename.replace(/\.[^/.]+$/, ''))}</h1>
                    <p>Start editing this document directly inside FRANK. Format text, insert tables, and save new versions.</p>
                </div>
            </div>
        `;

        const page = document.getElementById('wordDocPage');
        page.addEventListener('input', () => {
            this.markDirty();
            this.updateWordCount();
        });

        // Bind formatting operations
        document.getElementById('wordUndoBtn').onclick = () => document.execCommand('undo');
        document.getElementById('wordRedoBtn').onclick = () => document.execCommand('redo');
        document.getElementById('wordBoldBtn').onclick = () => document.execCommand('bold');
        document.getElementById('wordItalicBtn').onclick = () => document.execCommand('italic');
        document.getElementById('wordUnderlineBtn').onclick = () => document.execCommand('underline');
        document.getElementById('wordStrikeBtn').onclick = () => document.execCommand('strikeThrough');
        document.getElementById('wordAlignLeft').onclick = () => document.execCommand('justifyLeft');
        document.getElementById('wordAlignCenter').onclick = () => document.execCommand('justifyCenter');
        document.getElementById('wordAlignRight').onclick = () => document.execCommand('justifyRight');
        document.getElementById('wordAlignJustify').onclick = () => document.execCommand('justifyFull');
        document.getElementById('wordBulletList').onclick = () => document.execCommand('insertUnorderedList');
        document.getElementById('wordNumList').onclick = () => document.execCommand('insertOrderedList');
        document.getElementById('wordOutdentBtn').onclick = () => document.execCommand('outdent');
        document.getElementById('wordIndentBtn').onclick = () => document.execCommand('indent');
        document.getElementById('wordInsertLine').onclick = () => document.execCommand('insertHorizontalRule');

        document.getElementById('wordStyleSelect').onchange = (e) => {
            document.execCommand('formatBlock', false, e.target.value);
        };
        document.getElementById('wordFontFamily').onchange = (e) => {
            document.execCommand('fontName', false, e.target.value);
        };
        document.getElementById('wordFontSize').onchange = (e) => {
            document.execCommand('fontSize', false, e.target.value);
        };
        document.getElementById('wordColorInput').onchange = (e) => {
            document.execCommand('foreColor', false, e.target.value);
        };
        document.getElementById('wordHighlightInput').onchange = (e) => {
            document.execCommand('hiliteColor', false, e.target.value);
        };

        // Insert Table
        document.getElementById('wordInsertTable').onclick = () => {
            const page = document.getElementById('wordDocPage');
            if (page) page.focus();
            const tableHtml = `
                <table class="office-table" style="width:100%;border-collapse:collapse;margin:14px 0;">
                    <thead>
                        <tr style="background:rgba(0,0,0,0.04);">
                            <th style="border:1px solid var(--theme-border, #D8C5AA);padding:8px 12px;text-align:left;">Header 1</th>
                            <th style="border:1px solid var(--theme-border, #D8C5AA);padding:8px 12px;text-align:left;">Header 2</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style="border:1px solid var(--theme-border, #D8C5AA);padding:8px 12px;">Cell 1</td>
                            <td style="border:1px solid var(--theme-border, #D8C5AA);padding:8px 12px;">Cell 2</td>
                        </tr>
                    </tbody>
                </table>
            `;
            const inserted = document.execCommand('insertHTML', false, tableHtml);
            if (!inserted && page) {
                page.insertAdjacentHTML('beforeend', tableHtml);
            }
            this.markDirty();
        };

        // Insert Link
        document.getElementById('wordInsertLink').onclick = () => {
            const url = window.prompt('Enter URL to insert link:', 'https://');
            if (url) {
                document.execCommand('createLink', false, url);
                this.markDirty();
            }
        };

        this.updateWordCount();
    }

    updateWordCount() {
        const page = document.getElementById('wordDocPage');
        if (!page) return;
        const text = page.innerText || '';
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.length;
        const statusLeft = document.getElementById('statusBarLeft');
        if (statusLeft) statusLeft.textContent = `${words} words • ${chars} characters • Word Processor`;
    }

    // =========================================================================
    // 2. SPREADSHEET EDITOR (XLS / XLSX)
    // Operations: Cell selection, Active cell formula bar (=SUM(...), =AVERAGE(...), etc.),
    // Multi-sheet tabs (+ Add Sheet, Switch), Bold, Italic, Alignment, Row/Column
    // editing, Grid navigation, Save, Download.
    // =========================================================================
    mountExcelEditor(toolbar, canvas) {
        if (!this.sheetsEngine) {
            this.sheetsEngine = new FrankSheetsEngine(this);
        }
        this.sheetsEngine.mount(toolbar, canvas);
    }

    renderExcelGrid(keepScroll = false) {
        if (!this.sheetsEngine) this.sheetsEngine = new FrankSheetsEngine(this);
        this.sheetsEngine.renderGrid(keepScroll);
        this.sheetsEngine.renderSheetTabs();
        this.sheetsEngine.syncFormulaBar();
        this.sheetsEngine.updateStatusBar();
    }

    renderSheetTabs() {
        if (!this.sheetsEngine) this.sheetsEngine = new FrankSheetsEngine(this);
        this.sheetsEngine.renderSheetTabs();
    }

    applyCellFormula(val) {
        if (!this.sheetsEngine) this.sheetsEngine = new FrankSheetsEngine(this);
        this.sheetsEngine.applyCellFormula(val);
    }

    evalRealFormula(formula, sheet) {
        if (!this.sheetsEngine) this.sheetsEngine = new FrankSheetsEngine(this);
        return this.sheetsEngine.evalRealFormula(formula, sheet);
    }

    coordToIndices(coord) {
        if (!this.sheetsEngine) this.sheetsEngine = new FrankSheetsEngine(this);
        return this.sheetsEngine.coordToIndices(coord);
    }

    toggleCellFormat(prop) {
        if (!this.sheetsEngine) this.sheetsEngine = new FrankSheetsEngine(this);
        this.sheetsEngine.toggleCellFormat(prop);
    }

    setCellFormat(prop, val) {
        if (!this.sheetsEngine) this.sheetsEngine = new FrankSheetsEngine(this);
        this.sheetsEngine.setCellFormat(prop, val);
    }

    excelInsertRow() {
        if (!this.sheetsEngine) this.sheetsEngine = new FrankSheetsEngine(this);
        this.sheetsEngine.excelInsertRow();
    }

    excelDeleteRow() {
        if (!this.sheetsEngine) this.sheetsEngine = new FrankSheetsEngine(this);
        this.sheetsEngine.excelDeleteRow();
    }

    excelInsertCol() {
        if (!this.sheetsEngine) this.sheetsEngine = new FrankSheetsEngine(this);
        this.sheetsEngine.excelInsertCol();
    }

    excelDeleteCol() {
        if (!this.sheetsEngine) this.sheetsEngine = new FrankSheetsEngine(this);
        this.sheetsEngine.excelDeleteCol();
    }

    excelAddSheet() {
        if (!this.sheetsEngine) this.sheetsEngine = new FrankSheetsEngine(this);
        this.sheetsEngine.excelAddSheet();
    }

    colIdxToLetter(idx) {
        let result = '';
        idx += 1;
        while (idx > 0) {
            idx -= 1;
            result = String.fromCharCode(65 + (idx % 26)) + result;
            idx = Math.floor(idx / 26);
        }
        return result;
    }

    // =========================================================================
    // 3. PRESENTATION CANVAS (PPT / PPTX)
    // Operations: Slide thumbnail browser, Add Slide, Duplicate Slide,
    // Delete Slide, Slide title and body text editing, In-chat presentation mode,
    // Save, Download.
    // =========================================================================
    mountPptxEditor(toolbar, canvas) {
        toolbar.innerHTML = `
            <div class="toolbar-group">
                <button type="button" class="tool-btn btn-labeled" id="pptxAddSlide" title="New Slide" data-i18n-title="office.addSlide">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span data-i18n="office.addSlide">Add Slide</span>
                </button>
                <button type="button" class="tool-btn btn-labeled" id="pptxDupSlide" title="Duplicate Slide" data-i18n-title="office.duplicate">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span data-i18n="office.duplicate">Duplicate</span>
                </button>
                <button type="button" class="tool-btn btn-labeled" id="pptxDelSlide" title="Delete Slide" style="color:var(--danger, #ef4444);" data-i18n-title="office.delete">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    <span data-i18n="office.delete">Delete</span>
                </button>
            </div>
            <div class="toolbar-group">
                <button type="button" class="workspace-btn workspace-btn-primary" id="startPresentationBtn" style="height:32px;padding:0 14px;" data-i18n-title="office.present">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                    <span data-i18n="office.present">Present</span>
                </button>
            </div>
        `;

        if (window.i18n && typeof window.i18n.applyTranslations === 'function') {
            window.i18n.applyTranslations(toolbar);
        }

        canvas.innerHTML = `
            <div class="pptx-editor-stage">
                <div class="pptx-thumbnails-pane" id="pptxThumbnailsPane"></div>
                <div class="pptx-canvas-area" id="pptxCanvasArea">
                    <div class="slide-canvas" id="slideCanvas">
                        <div class="slide-title-box" id="slideTitleBox" contenteditable="true" spellcheck="true">Slide Title</div>
                        <div class="slide-body-box" id="slideBodyBox" contenteditable="true" spellcheck="true">Click to edit presentation text and notes.</div>
                    </div>
                </div>
            </div>
        `;

        this.renderPptxCanvas();

        document.getElementById('pptxAddSlide').onclick = () => {
            const nextId = this.pptxData.slides.length + 1;
            this.pptxData.slides.push({
                id: nextId,
                title: `Slide ${nextId}`,
                content: ['New slide content. Click to edit.'],
                bg_color: '#ffffff'
            });
            this.pptxData.activeSlideIdx = this.pptxData.slides.length - 1;
            this.markDirty();
            this.renderPptxCanvas();
        };

        document.getElementById('pptxDupSlide').onclick = () => {
            const cur = this.pptxData.slides[this.pptxData.activeSlideIdx];
            if (cur) {
                this.pptxData.slides.push(JSON.parse(JSON.stringify(cur)));
                this.pptxData.activeSlideIdx = this.pptxData.slides.length - 1;
                this.markDirty();
                this.renderPptxCanvas();
            }
        };

        document.getElementById('pptxDelSlide').onclick = () => {
            if (this.pptxData.slides.length > 1) {
                this.pptxData.slides.splice(this.pptxData.activeSlideIdx, 1);
                this.pptxData.activeSlideIdx = Math.max(0, this.pptxData.activeSlideIdx - 1);
                this.markDirty();
                this.renderPptxCanvas();
            } else {
                showToast('A presentation must have at least one slide', 'warning');
            }
        };

        document.getElementById('startPresentationBtn').onclick = () => {
            this.togglePresentationMode();
        };
    }

    renderPptxCanvas() {
        const pane = document.getElementById('pptxThumbnailsPane');
        if (!pane) return;
        pane.innerHTML = '';

        this.pptxData.slides.forEach((slide, idx) => {
            const card = document.createElement('div');
            card.className = `slide-thumbnail-card ${idx === this.pptxData.activeSlideIdx ? 'active' : ''}`;
            card.innerHTML = `
                <span class="slide-thumb-number">${idx + 1}</span>
                <span class="slide-thumb-title">${messagesModule.escapeHTML(slide.title || `Slide ${idx + 1}`)}</span>
            `;
            card.onclick = () => {
                this.pptxData.activeSlideIdx = idx;
                this.renderPptxCanvas();
            };
            pane.appendChild(card);
        });

        const activeSlide = this.pptxData.slides[this.pptxData.activeSlideIdx] || this.pptxData.slides[0];
        const titleBox = document.getElementById('slideTitleBox');
        const bodyBox = document.getElementById('slideBodyBox');
        if (titleBox && bodyBox && activeSlide) {
            titleBox.innerText = activeSlide.title || '';
            bodyBox.innerText = Array.isArray(activeSlide.content) ? activeSlide.content.join('\n') : (activeSlide.content || '');

            titleBox.oninput = () => {
                activeSlide.title = titleBox.innerText;
                this.markDirty();
                const currentThumb = pane.children[this.pptxData.activeSlideIdx]?.querySelector('.slide-thumb-title');
                if (currentThumb) currentThumb.textContent = activeSlide.title;
            };
            bodyBox.oninput = () => {
                activeSlide.content = bodyBox.innerText.split('\n');
                this.markDirty();
            };
        }

        const statusLeft = document.getElementById('statusBarLeft');
        if (statusLeft) {
            statusLeft.textContent = `Slide ${this.pptxData.activeSlideIdx + 1} of ${this.pptxData.slides.length} • Presentation Canvas`;
        }
    }

    togglePresentationMode(force) {
        const canvasArea = document.getElementById('slideCanvas');
        if (!canvasArea) return;
        const willPresent = force !== undefined ? force : !canvasArea.classList.contains('in-presentation');

        if (willPresent) {
            canvasArea.classList.add('in-presentation');

            let deckControls = document.getElementById('presentationDeckBar');
            if (!deckControls) {
                deckControls = document.createElement('div');
                deckControls.id = 'presentationDeckBar';
                deckControls.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:10015;display:flex;align-items:center;gap:12px;background:rgba(15,23,42,0.92);padding:10px 20px;border-radius:999px;box-shadow:0 8px 30px rgba(0,0,0,0.5);backdrop-filter:blur(8px);color:#ffffff;';
                deckControls.innerHTML = `
                    <button type="button" id="presPrevSlideBtn" style="background:transparent;border:none;color:#ffffff;cursor:pointer;font-size:16px;padding:4px 10px;">◀ Prev</button>
                    <span id="presSlideCounter" style="font-size:13px;font-weight:700;font-family:monospace;">Slide ${this.pptxData.activeSlideIdx + 1} of ${this.pptxData.slides.length}</span>
                    <button type="button" id="presNextSlideBtn" style="background:transparent;border:none;color:#ffffff;cursor:pointer;font-size:16px;padding:4px 10px;">Next ▶</button>
                    <button type="button" id="presExitBtn" style="margin-left:8px;background:#ef4444;border:none;color:#ffffff;padding:4px 12px;border-radius:999px;cursor:pointer;font-weight:700;font-size:12px;">✕ Exit</button>
                `;
                document.body.appendChild(deckControls);

                deckControls.querySelector('#presPrevSlideBtn').onclick = () => {
                    if (this.pptxData.activeSlideIdx > 0) {
                        this.pptxData.activeSlideIdx--;
                        this.renderPptxCanvas();
                        document.getElementById('presSlideCounter').textContent = `Slide ${this.pptxData.activeSlideIdx + 1} of ${this.pptxData.slides.length}`;
                    }
                };
                deckControls.querySelector('#presNextSlideBtn').onclick = () => {
                    if (this.pptxData.activeSlideIdx < this.pptxData.slides.length - 1) {
                        this.pptxData.activeSlideIdx++;
                        this.renderPptxCanvas();
                        document.getElementById('presSlideCounter').textContent = `Slide ${this.pptxData.activeSlideIdx + 1} of ${this.pptxData.slides.length}`;
                    }
                };
                deckControls.querySelector('#presExitBtn').onclick = () => {
                    this.togglePresentationMode(false);
                };
            }
            deckControls.style.display = 'flex';
        } else {
            canvasArea.classList.remove('in-presentation');
            const deckControls = document.getElementById('presentationDeckBar');
            if (deckControls) deckControls.remove();
        }
    }

    // =========================================================================
    // 4. DEDICATED VIEWER & STAGE (PDF)
    // Operations: Page navigation (Prev/Next/Total), Zoom In/Out, Fit Width,
    // Download, Print, same-page inline rendering.
    // =========================================================================
    mountPdfWorkspace(toolbar, canvas) {
        toolbar.innerHTML = `
            <div class="toolbar-group">
                <button type="button" class="tool-btn icon-only" id="pdfPrevPage" title="Previous Page">◀</button>
                <span class="workspace-page-indicator" id="pdfPageIndicator">Page 1</span>
                <button type="button" class="tool-btn icon-only" id="pdfNextPage" title="Next Page">▶</button>
            </div>
            <div class="toolbar-group">
                <button type="button" class="tool-btn icon-only" id="pdfZoomOut" title="Zoom Out">−</button>
                <span id="pdfZoomLabel" class="pdf-zoom-label">100%</span>
                <button type="button" class="tool-btn icon-only" id="pdfZoomIn" title="Zoom In">+</button>
                <button type="button" class="tool-btn btn-labeled" id="pdfFitWidth" title="Fit to Width">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="4 14 10 14 10 20"></polyline><polyline points="20 10 14 10 14 4"></polyline><line x1="14" y1="10" x2="21" y2="3"></line><line x1="3" y1="21" x2="10" y2="14"></line></svg>
                    <span>Fit Width</span>
                </button>
            </div>
            <div class="toolbar-group">
                <button type="button" class="tool-btn btn-labeled" id="pdfPrintBtn" title="Print Document">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                    <span>Print</span>
                </button>
                <button type="button" class="tool-btn btn-labeled" id="pdfDownloadBtn" title="Download Document">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    <span>Download</span>
                </button>
            </div>
        `;

        canvas.innerHTML = `
            <div class="pdf-editor-stage">
                <div class="pdf-viewport-area">
                    <div class="pdf-zoom-container" id="pdfZoomContainer">
                        <iframe class="pdf-view-frame" id="pdfViewFrame" src="${this.currentDoc.viewUrl}" title="${messagesModule.escapeHTML(this.currentDoc.filename)}"></iframe>
                    </div>
                </div>
            </div>
        `;

        this.pdfState = { currentPage: 1, totalPages: 1, zoom: 100 };

        const updateZoom = () => {
            const container = document.getElementById('pdfZoomContainer');
            const label = document.getElementById('pdfZoomLabel');
            if (container) container.style.transform = `scale(${this.pdfState.zoom / 100})`;
            if (label) label.textContent = `${this.pdfState.zoom}%`;
        };

        const updatePageFragment = () => {
            const frame = document.getElementById('pdfViewFrame');
            const indicator = document.getElementById('pdfPageIndicator');
            if (indicator) indicator.textContent = `Page ${this.pdfState.currentPage}`;
            if (frame && this.currentDoc.viewUrl) {
                const base = this.currentDoc.viewUrl.split('#')[0];
                frame.src = `${base}#page=${this.pdfState.currentPage}`;
            }
        };

        document.getElementById('pdfZoomIn').onclick = () => {
            if (this.pdfState.zoom < 250) {
                this.pdfState.zoom += 25;
                updateZoom();
            }
        };
        document.getElementById('pdfZoomOut').onclick = () => {
            if (this.pdfState.zoom > 50) {
                this.pdfState.zoom -= 25;
                updateZoom();
            }
        };
        document.getElementById('pdfFitWidth').onclick = () => {
            this.pdfState.zoom = 100;
            updateZoom();
        };

        document.getElementById('pdfPrevPage').onclick = () => {
            if (this.pdfState.currentPage > 1) {
                this.pdfState.currentPage--;
                updatePageFragment();
            }
        };
        document.getElementById('pdfNextPage').onclick = () => {
            this.pdfState.currentPage++;
            updatePageFragment();
        };

        document.getElementById('pdfPrintBtn').onclick = () => this.printDocument();
        document.getElementById('pdfDownloadBtn').onclick = () => this.downloadDocument();

        const statusLeft = document.getElementById('statusBarLeft');
        if (statusLeft) {
            statusLeft.textContent = `PDF Document Viewer & Stage • ${this.currentDoc.filename}`;
        }
    }

    // =========================================================================
    // 5. LIGHTWEIGHT TEXT EDITOR (TXT / MD)
    // Operations: Full textarea editing, Undo/Redo, Line wrap, Word count,
    // Save version, Download.
    // =========================================================================
    mountTextEditor(toolbar, canvas) {
        toolbar.innerHTML = `
            <div class="toolbar-group">
                <button type="button" class="tool-btn" id="textUndoBtn" title="Undo"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"></path><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path></svg></button>
                <button type="button" class="tool-btn" id="textRedoBtn" title="Redo"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 7v6h-6"></path><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"></path></svg></button>
            </div>
            <div class="toolbar-group">
                <select class="tool-select" id="textFontSize">
                    <option value="12px">12px</option>
                    <option value="14px" selected>14px</option>
                    <option value="16px">16px</option>
                    <option value="18px">18px</option>
                </select>
                <button type="button" class="tool-btn" id="textWrapBtn" title="Toggle Word Wrap" style="width:auto;padding:0 8px;">Wrap</button>
            </div>
        `;

        canvas.innerHTML = `
            <div class="text-editor-stage">
                <textarea class="text-editor-textarea" id="textEditorTextarea" spellcheck="false" placeholder="Enter text here..."></textarea>
            </div>
        `;

        const ta = document.getElementById('textEditorTextarea');
        this.textHistory = { undoStack: [], redoStack: [] };

        const saveHistory = () => {
            this.textHistory.undoStack.push(ta.value);
            if (this.textHistory.undoStack.length > 50) this.textHistory.undoStack.shift();
            this.textHistory.redoStack = [];
        };

        ta.addEventListener('input', () => {
            this.markDirty();
            this.updateTextStats();
        });

        ta.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) {
                    // Redo
                    if (this.textHistory.redoStack.length > 0) {
                        this.textHistory.undoStack.push(ta.value);
                        ta.value = this.textHistory.redoStack.pop();
                        this.updateTextStats();
                    }
                } else {
                    // Undo
                    if (this.textHistory.undoStack.length > 0) {
                        this.textHistory.redoStack.push(ta.value);
                        ta.value = this.textHistory.undoStack.pop();
                        this.updateTextStats();
                    }
                }
            }
        });

        document.getElementById('textUndoBtn').onclick = () => {
            if (this.textHistory.undoStack.length > 0) {
                this.textHistory.redoStack.push(ta.value);
                ta.value = this.textHistory.undoStack.pop();
                this.updateTextStats();
            }
        };

        document.getElementById('textRedoBtn').onclick = () => {
            if (this.textHistory.redoStack.length > 0) {
                this.textHistory.undoStack.push(ta.value);
                ta.value = this.textHistory.redoStack.pop();
                this.updateTextStats();
            }
        };

        document.getElementById('textWrapBtn').onclick = () => {
            ta.style.whiteSpace = (ta.style.whiteSpace === 'pre-wrap') ? 'pre' : 'pre-wrap';
        };

        document.getElementById('textFontSize').onchange = (e) => {
            ta.style.fontSize = e.target.value;
        };

        // Fetch raw text if viewUrl is available
        if (this.currentDoc.viewUrl) {
            fetch(this.currentDoc.viewUrl)
                .then(r => r.text())
                .then(txt => {
                    ta.value = txt;
                    saveHistory();
                    this.updateTextStats();
                })
                .catch(() => {});
        }
    }

    updateTextStats() {
        const ta = document.getElementById('textEditorTextarea');
        if (!ta) return;
        const text = ta.value || '';
        const words = text.trim() ? text.trim().split(/\s+/).length : 0;
        const chars = text.length;
        const lines = text.split('\n').length;
        const statusLeft = document.getElementById('statusBarLeft');
        if (statusLeft) {
            statusLeft.textContent = `${words} words • ${chars} characters • ${lines} lines • Lightweight Text Editor`;
        }
    }

    // =========================================================================
    // 6. INTERACTIVE DATA GRID (CSV)
    // Operations: Tabular cell editing, Row additions/deletions, Delimiter and
    // quote preservation, Save version, Download.
    // =========================================================================
    mountCsvEditor(toolbar, canvas) {
        toolbar.innerHTML = `
            <div class="toolbar-group">
                <button type="button" class="tool-btn" id="csvAddRowBtn" title="Add Row">+Row</button>
                <button type="button" class="tool-btn" id="csvDelRowBtn" title="Delete Row">-Row</button>
                <button type="button" class="tool-btn" id="csvAddColBtn" title="Add Column">+Col</button>
                <button type="button" class="tool-btn" id="csvDelColBtn" title="Delete Column">-Col</button>
            </div>
            <div class="toolbar-group">
                <button type="button" class="tool-btn" id="csvRawToggleBtn" style="width:auto;padding:0 10px;">Toggle Raw / Grid</button>
            </div>
        `;

        canvas.innerHTML = `
            <div class="excel-editor-stage">
                <div class="spreadsheet-grid-wrapper" id="csvGridWrapper">
                    <table class="spreadsheet-table" id="csvTable"></table>
                </div>
                <textarea class="text-editor-textarea" id="csvRawArea" style="display:none;padding:16px;font-family:monospace;"></textarea>
            </div>
        `;

        document.getElementById('csvAddRowBtn').onclick = () => {
            const numCols = this.csvData.rows[0] ? this.csvData.rows[0].length : 4;
            this.csvData.rows.push(new Array(numCols).fill(''));
            this.markDirty();
            this.renderCsvTable(this.csvData.rows);
        };

        document.getElementById('csvDelRowBtn').onclick = () => {
            if (this.csvData.rows.length > 1) {
                this.csvData.rows.pop();
                this.markDirty();
                this.renderCsvTable(this.csvData.rows);
            }
        };

        document.getElementById('csvAddColBtn').onclick = () => {
            this.csvData.rows.forEach(r => r.push(''));
            this.markDirty();
            this.renderCsvTable(this.csvData.rows);
        };

        document.getElementById('csvDelColBtn').onclick = () => {
            if (this.csvData.rows[0] && this.csvData.rows[0].length > 1) {
                this.csvData.rows.forEach(r => r.pop());
                this.markDirty();
                this.renderCsvTable(this.csvData.rows);
            }
        };

        document.getElementById('csvRawToggleBtn').onclick = () => {
            const grid = document.getElementById('csvGridWrapper');
            const raw = document.getElementById('csvRawArea');
            if (raw.style.display === 'none') {
                raw.value = this.serializeCsv(this.csvData.rows);
                raw.style.display = 'block';
                grid.style.display = 'none';
            } else {
                this.csvData.rows = this.parseCsv(raw.value);
                this.renderCsvTable(this.csvData.rows);
                raw.style.display = 'none';
                grid.style.display = 'block';
            }
        };

        // Fetch CSV text
        if (this.currentDoc.viewUrl) {
            fetch(this.currentDoc.viewUrl)
                .then(r => r.text())
                .then(csvText => {
                    document.getElementById('csvRawArea').value = csvText;
                    this.csvData.rows = this.parseCsv(csvText);
                    this.renderCsvTable(this.csvData.rows);
                })
                .catch(() => {});
        }
    }

    parseCsv(text) {
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        return lines.map(line => {
            const row = [];
            let inside = false;
            let cur = '';
            for (let i = 0; i < line.length; i++) {
                const c = line[i];
                if (c === '"') inside = !inside;
                else if (c === ',' && !inside) {
                    row.push(cur.trim());
                    cur = '';
                } else cur += c;
            }
            row.push(cur.trim());
            return row;
        });
    }

    serializeCsv(rows) {
        return rows.map(row => {
            return row.map(val => {
                const s = String(val || '');
                if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                    return `"${s.replace(/"/g, '""')}"`;
                }
                return s;
            }).join(',');
        }).join('\n');
    }

    renderCsvTable(rows) {
        const table = document.getElementById('csvTable');
        if (!table) return;

        let html = '<tbody>';
        rows.forEach((r, rIdx) => {
            html += `<tr><td class="row-header">${rIdx + 1}</td>`;
            r.forEach((c, cIdx) => {
                html += `<td class="sheet-cell" contenteditable="true" data-r="${rIdx}" data-c="${cIdx}">${messagesModule.escapeHTML(c)}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody>';
        table.innerHTML = html;

        table.querySelectorAll('.sheet-cell').forEach(td => {
            td.addEventListener('input', () => {
                this.markDirty();
                const r = parseInt(td.dataset.r, 10);
                const c = parseInt(td.dataset.c, 10);
                if (this.csvData.rows[r]) {
                    this.csvData.rows[r][c] = td.innerText;
                }
            });
        });

        const statusLeft = document.getElementById('statusBarLeft');
        if (statusLeft) {
            statusLeft.textContent = `${rows.length} rows × ${rows[0] ? rows[0].length : 0} cols • CSV Data Grid`;
        }
    }

    // =========================================================================
    // 7. MEDIA LIGHTBOX / VIEWER (Images: PNG, JPG, WEBP, GIF)
    // Operations: Same-page lightbox preview, Zoom In/Out, Rotate 90°, Download.
    // =========================================================================
    mountImageViewer(toolbar, canvas) {
        toolbar.innerHTML = `
            <div class="toolbar-group">
                <button type="button" class="tool-btn" id="imgZoomOutBtn" title="Zoom Out">-</button>
                <span id="imgZoomLabel" style="font-size:12px;font-weight:700;min-width:44px;text-align:center;">100%</span>
                <button type="button" class="tool-btn" id="imgZoomInBtn" title="Zoom In">+</button>
                <button type="button" class="tool-btn" id="imgZoomResetBtn" title="Reset Zoom">Reset</button>
            </div>
            <div class="toolbar-group">
                <button type="button" class="tool-btn" id="imgRotateBtn" title="Rotate 90°">↻ Rotate</button>
            </div>
            <div class="toolbar-group">
                <button type="button" class="tool-btn" id="imgDownloadBtn" title="Download Image">💾 Download</button>
            </div>
        `;

        canvas.innerHTML = `
            <div class="media-editor-stage">
                <img id="imageViewerImg" src="${this.currentDoc.viewUrl}" alt="${messagesModule.escapeHTML(this.currentDoc.filename)}">
            </div>
        `;

        this.imageState = { zoom: 100, rotate: 0 };
        const img = document.getElementById('imageViewerImg');

        const updateTransform = () => {
            if (img) {
                img.style.transform = `scale(${this.imageState.zoom / 100}) rotate(${this.imageState.rotate}deg)`;
            }
            const label = document.getElementById('imgZoomLabel');
            if (label) label.textContent = `${this.imageState.zoom}%`;
        };

        document.getElementById('imgZoomInBtn').onclick = () => {
            if (this.imageState.zoom < 300) {
                this.imageState.zoom += 25;
                updateTransform();
            }
        };

        document.getElementById('imgZoomOutBtn').onclick = () => {
            if (this.imageState.zoom > 25) {
                this.imageState.zoom -= 25;
                updateTransform();
            }
        };

        document.getElementById('imgZoomResetBtn').onclick = () => {
            this.imageState.zoom = 100;
            updateTransform();
        };

        document.getElementById('imgRotateBtn').onclick = () => {
            this.imageState.rotate = (this.imageState.rotate + 90) % 360;
            updateTransform();
        };

        document.getElementById('imgDownloadBtn').onclick = () => this.downloadDocument();

        const statusLeft = document.getElementById('statusBarLeft');
        if (statusLeft) statusLeft.textContent = `Image Viewer & Lightbox • ${this.currentDoc.filename}`;
    }

    // =========================================================================
    // 8. VIDEO PLAYER (Videos: MP4, WEBM, MOV)
    // Operations: In-chat playback, Play/Pause, Seek bar, Volume/Mute,
    // Fullscreen, Download (no new tab).
    // =========================================================================
    mountVideoViewer(toolbar, canvas) {
        toolbar.innerHTML = `
            <div class="toolbar-group">
                <button type="button" class="tool-btn" id="videoDlToolbarBtn" title="Download Video">💾 Download Video</button>
            </div>
        `;

        canvas.innerHTML = `
            <div class="media-editor-stage">
                <div class="video-player-card">
                    <video id="videoPlayerEl" playsinline src="${this.currentDoc.viewUrl}" preload="metadata"></video>
                    <div class="video-custom-controls">
                        <button type="button" id="videoPlayPauseBtn" title="Play / Pause">▶</button>
                        <span class="video-time-display" id="videoTimeDisplay">00:00 / 00:00</span>
                        <input type="range" class="video-seek-slider" id="videoSeekBar" min="0" max="100" value="0">
                        <button type="button" id="videoMuteBtn" title="Mute / Unmute">🔊</button>
                        <input type="range" class="video-volume-slider" id="videoVolumeSlider" min="0" max="1" step="0.05" value="1">
                        <button type="button" id="videoFullscreenBtn" title="Fullscreen">⛶</button>
                        <button type="button" id="videoDownloadBtn" title="Download">💾</button>
                    </div>
                </div>
            </div>
        `;

        const vid = document.getElementById('videoPlayerEl');
        const playBtn = document.getElementById('videoPlayPauseBtn');
        const seekBar = document.getElementById('videoSeekBar');
        const timeDisplay = document.getElementById('videoTimeDisplay');
        const muteBtn = document.getElementById('videoMuteBtn');
        const volSlider = document.getElementById('videoVolumeSlider');
        const fsBtn = document.getElementById('videoFullscreenBtn');

        const formatTime = (secs) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };

        playBtn.onclick = () => {
            if (vid.paused) {
                vid.play();
                playBtn.textContent = '⏸';
            } else {
                vid.pause();
                playBtn.textContent = '▶';
            }
        };

        vid.addEventListener('timeupdate', () => {
            if (vid.duration) {
                seekBar.value = (vid.currentTime / vid.duration) * 100;
                timeDisplay.textContent = `${formatTime(vid.currentTime)} / ${formatTime(vid.duration)}`;
            }
        });

        vid.addEventListener('loadedmetadata', () => {
            timeDisplay.textContent = `00:00 / ${formatTime(vid.duration || 0)}`;
        });

        seekBar.addEventListener('input', () => {
            if (vid.duration) {
                vid.currentTime = (seekBar.value / 100) * vid.duration;
            }
        });

        muteBtn.onclick = () => {
            vid.muted = !vid.muted;
            muteBtn.textContent = vid.muted ? '🔇' : '🔊';
        };

        volSlider.addEventListener('input', () => {
            vid.volume = parseFloat(volSlider.value);
            vid.muted = (vid.volume === 0);
            muteBtn.textContent = vid.muted ? '🔇' : '🔊';
        });

        fsBtn.onclick = () => {
            if (vid.requestFullscreen) vid.requestFullscreen();
        };

        document.getElementById('videoDownloadBtn').onclick = () => this.downloadDocument();
        document.getElementById('videoDlToolbarBtn').onclick = () => this.downloadDocument();

        const statusLeft = document.getElementById('statusBarLeft');
        if (statusLeft) statusLeft.textContent = `In-Chat Video Player • ${this.currentDoc.filename}`;
    }

    // =========================================================================
    // 9. AUDIO PLAYER (Audio / Voice: MP3, WAV, WEBM)
    // Operations: Inline playback, Waveform scrubbing, Play/Pause, Speed toggle,
    // Download.
    // =========================================================================
    mountAudioViewer(toolbar, canvas) {
        toolbar.innerHTML = `
            <div class="toolbar-group">
                <button type="button" class="tool-btn" id="audioDlToolbarBtn" title="Download Audio">💾 Download Audio</button>
            </div>
        `;

        canvas.innerHTML = `
            <div class="media-editor-stage">
                <div class="audio-player-card">
                    <div style="font-size: 52px; margin-bottom: 12px;">🎵</div>
                    <div style="font-size: 16px; font-weight: 800; color: var(--text); margin-bottom: 4px;">${messagesModule.escapeHTML(this.currentDoc.filename)}</div>
                    <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;" id="audioTimeLabel">00:00 / 00:00</div>
                    <div class="audio-track-scrubber" id="audioTrackScrubber">
                        <div class="audio-track-fill" id="audioTrackFill"></div>
                    </div>
                    <div class="audio-controls-row">
                        <button type="button" class="workspace-btn workspace-btn-primary" id="audioPlayBtn" style="border-radius:999px;width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;font-size:18px;">▶</button>
                        <button type="button" class="audio-speed-btn" id="audioSpeedToggleBtn">1.0x</button>
                        <button type="button" class="workspace-btn" id="audioDownloadBtn" style="font-size:12px;">💾 Download</button>
                    </div>
                    <audio id="audioElement" src="${this.currentDoc.viewUrl}" preload="metadata"></audio>
                </div>
            </div>
        `;

        const audio = document.getElementById('audioElement');
        const playBtn = document.getElementById('audioPlayBtn');
        const fill = document.getElementById('audioTrackFill');
        const scrubber = document.getElementById('audioTrackScrubber');
        const timeLabel = document.getElementById('audioTimeLabel');
        const speedBtn = document.getElementById('audioSpeedToggleBtn');

        const formatTime = (secs) => {
            const m = Math.floor(secs / 60);
            const s = Math.floor(secs % 60);
            return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        };

        playBtn.onclick = () => {
            if (audio.paused) {
                audio.play();
                playBtn.textContent = '⏸';
            } else {
                audio.pause();
                playBtn.textContent = '▶';
            }
        };

        audio.addEventListener('timeupdate', () => {
            if (audio.duration) {
                const pct = (audio.currentTime / audio.duration) * 100;
                fill.style.width = `${pct}%`;
                timeLabel.textContent = `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`;
            }
        });

        audio.addEventListener('loadedmetadata', () => {
            timeLabel.textContent = `00:00 / ${formatTime(audio.duration || 0)}`;
        });

        audio.addEventListener('ended', () => {
            playBtn.textContent = '▶';
            fill.style.width = '0%';
        });

        scrubber.onclick = (e) => {
            const rect = scrubber.getBoundingClientRect();
            const clickPos = (e.clientX - rect.left) / rect.width;
            if (audio.duration) {
                audio.currentTime = clickPos * audio.duration;
            }
        };

        speedBtn.onclick = () => {
            this.audioState.currentSpeedIdx = (this.audioState.currentSpeedIdx + 1) % this.audioState.speeds.length;
            const newSpeed = this.audioState.speeds[this.audioState.currentSpeedIdx];
            audio.playbackRate = newSpeed;
            speedBtn.textContent = `${newSpeed}x`;
        };

        document.getElementById('audioDownloadBtn').onclick = () => this.downloadDocument();
        document.getElementById('audioDlToolbarBtn').onclick = () => this.downloadDocument();

        const statusLeft = document.getElementById('statusBarLeft');
        if (statusLeft) statusLeft.textContent = `Inline Audio & Voice Player • ${this.currentDoc.filename}`;
    }

    // =========================================================================
    // 10. SAFE ARCHIVE EXPLORER (ZIP)
    // Operations: Safe non-executing directory tree browsing, file count,
    // extracted file size preview, Download original ZIP.
    // =========================================================================
    mountZipViewer(toolbar, canvas) {
        toolbar.innerHTML = `
            <div class="toolbar-group">
                <button type="button" class="tool-btn" id="zipDownloadToolbarBtn" title="Download ZIP Archive">💾 Download ZIP</button>
            </div>
        `;

        canvas.innerHTML = `
            <div class="zip-explorer-stage" id="zipExplorerStage">
                <div class="zip-summary-header">
                    <div class="zip-summary-stat">
                        <span class="zip-stat-label">Archive Name</span>
                        <span class="zip-stat-val">${messagesModule.escapeHTML(this.currentDoc.filename)}</span>
                    </div>
                    <div class="zip-summary-stat">
                        <span class="zip-stat-label">File Count</span>
                        <span class="zip-stat-val" id="zipFileCount">Scanning...</span>
                    </div>
                    <div class="zip-summary-stat">
                        <span class="zip-stat-label">Extracted Size</span>
                        <span class="zip-stat-val" id="zipTotalSize">Estimating...</span>
                    </div>
                    <button type="button" class="workspace-btn workspace-btn-primary" id="zipDownloadMainBtn">Download Original ZIP</button>
                </div>
                <div style="font-weight:700;font-size:14px;margin-bottom:12px;color:var(--text);">📦 Archive File Tree</div>
                <div id="zipFilesList" style="border:1px solid var(--border);border-radius:var(--radius-md);overflow:hidden;background:var(--surface);">
                    <div style="padding:20px;text-align:center;color:var(--text-muted);">Loading archive directory tree...</div>
                </div>
            </div>
        `;

        document.getElementById('zipDownloadMainBtn').onclick = () => this.downloadDocument();
        document.getElementById('zipDownloadToolbarBtn').onclick = () => this.downloadDocument();

        const statusLeft = document.getElementById('statusBarLeft');
        if (statusLeft) statusLeft.textContent = `Safe Archive Explorer • Non-executing sandbox`;
    }

    renderZipTree(files) {
        const list = document.getElementById('zipFilesList');
        const countEl = document.getElementById('zipFileCount');
        const sizeEl = document.getElementById('zipTotalSize');
        if (!list) return;

        if (!files || files.length === 0) {
            list.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);">Archive is empty or contains no browsable files</div>';
            if (countEl) countEl.textContent = '0 files';
            if (sizeEl) sizeEl.textContent = '0 KB';
            return;
        }

        let totalBytes = 0;
        files.forEach(f => { totalBytes += (f.file_size || 0); });

        if (countEl) countEl.textContent = `${files.length} items`;
        if (sizeEl) {
            const kb = (totalBytes / 1024).toFixed(1);
            sizeEl.textContent = totalBytes > 1024 * 1024 ? `${(totalBytes / (1024 * 1024)).toFixed(2)} MB` : `${kb} KB`;
        }

        let html = '';
        files.forEach(f => {
            const isDir = f.is_dir || f.name.endsWith('/');
            const icon = isDir ? '📁' : '📄';
            const size = f.file_size ? `${(f.file_size / 1024).toFixed(1)} KB` : (isDir ? 'Folder' : '');
            html += `
                <div class="zip-file-row">
                    <span>${icon} <span style="font-family:monospace;font-size:13px;">${messagesModule.escapeHTML(f.name)}</span></span>
                    <span style="color:var(--text-muted);font-size:12px;">${size} ${f.date_time ? `• ${f.date_time}` : ''}</span>
                </div>
            `;
        });
        list.innerHTML = html;
    }

    // ---------------- UNSUPPORTED VIEWER ----------------
    mountUnsupportedViewer(toolbar, canvas) {
        canvas.innerHTML = `
            <div class="media-editor-stage" style="text-align:center;">
                <div style="font-size:56px;margin-bottom:16px;">📁</div>
                <div style="font-size:18px;font-weight:800;margin-bottom:8px;color:var(--text);">${messagesModule.escapeHTML(this.currentDoc.filename)}</div>
                <div style="font-size:14px;color:var(--text-muted);margin-bottom:24px;">This file type does not support in-browser editing. You can download the original file to view on your device.</div>
                <button type="button" class="workspace-btn workspace-btn-primary" onclick="window.frankOfficeWorkspace.downloadDocument()">Download File</button>
            </div>
        `;
    }

    commitPendingEdits() {
        if (this.category === 'excel' && this.sheetsEngine && typeof this.sheetsEngine.commitPendingEdits === 'function') {
            this.sheetsEngine.commitPendingEdits();
        } else if (this.category === 'word') {
            if (document.activeElement && document.activeElement.isContentEditable) {
                document.activeElement.blur();
            }
        }
    }

    // ---------------- SAVE DOCUMENT ----------------
    async saveDocument() {
        if (!this.currentDoc || !this.currentDoc.id) {
            showToast('Cannot save file without backend ID', 'error');
            return false;
        }

        // Commit all pending edits before serialization
        this.commitPendingEdits();

        this.setSaveStatus('saving');
        let payload = {
            base_version_number: this.currentDoc.current_version_number || 1,
            change_summary: `Edited in FRANK Workspace`
        };

        if (this.category === 'word') {
            const page = document.getElementById('wordDocPage');
            payload.structured_data = { html: page ? page.innerHTML : '' };
        } else if (this.category === 'excel') {
            payload.structured_data = { sheets: this.excelData.sheets };
        } else if (this.category === 'pptx') {
            payload.structured_data = { slides: this.pptxData.slides };
        } else if (this.category === 'text') {
            const ta = document.getElementById('textEditorTextarea');
            payload.content = ta ? ta.value : '';
        } else if (this.category === 'csv') {
            payload.content = this.serializeCsv(this.csvData.rows);
        } else {
            // Read-only preview types
            this.setSaveStatus('saved');
            this.isDirty = false;
            return true;
        }

        try {
            const res = await api.saveDocumentContent(this.currentDoc.id, payload);
            if (res && res.status === 'saved') {
                this.currentDoc.current_version_number = res.version.version_number;
                this.updateHeaderUI();
                this.setSaveStatus('saved', `Saved v${res.version.version_number}`);
                this.isDirty = false;
                showToast(`Saved version ${res.version.version_number}`, 'success');
                return true;
            }
        } catch (err) {
            console.error('Save failed:', err);
            if (err && err.status === 409) {
                // Version Conflict
                document.getElementById('workspaceConflictModal')?.classList.add('open');
            } else {
                this.setSaveStatus('error', 'Save failed');
                showToast('Unable to save changes. Your original document is safe.', 'error');
            }
            return false;
        }
        return false;
    }

    // ---------------- SEND UPDATED FILE TO CHAT ----------------
    async sendUpdatedFile() {
        if (this.isOpeningSendDialog) return;
        this.isOpeningSendDialog = true;

        try {
            // 1. Commit all pending edits immediately
            this.commitPendingEdits();

            // 2. Always ensure the latest workbook state is saved to backend before sharing!
            this.setSaveStatus('saving');
            const saved = await this.saveDocument();
            if (!saved) {
                showToast('Please save your changes before sending to chat.', 'error');
                return;
            }

            // 3. Ensure document metadata and ID are available
            if (!this.currentDoc || !this.currentDoc.id) {
                showToast('Document metadata not loaded. Please wait.', 'error');
                return;
            }

            // 4. Always open the Send Document to Chat dialog to select recipient
            if (window.documentBrowserController && typeof window.documentBrowserController.openSendToChatModal === 'function') {
                await window.documentBrowserController.openSendToChatModal(this.currentDoc.id, this.currentDoc.filename, this.currentDoc);
            } else if (typeof DocumentBrowserController === 'function') {
                window.documentBrowserController = new DocumentBrowserController();
                await window.documentBrowserController.openSendToChatModal(this.currentDoc.id, this.currentDoc.filename, this.currentDoc);
            } else {
                showToast('Unable to open Send to Chat dialog', 'error');
            }
        } finally {
            this.isOpeningSendDialog = false;
        }
    }

    // ---------------- VERSION HISTORY ----------------
    async toggleVersionDrawer(forceState) {
        const drawer = document.getElementById('workspaceVersionDrawer');
        if (!drawer) return;
        const willOpen = forceState !== undefined ? forceState : !drawer.classList.contains('open');

        if (willOpen) {
            drawer.classList.add('open');
            await this.loadVersionHistory();
        } else {
            drawer.classList.remove('open');
        }
    }

    async loadVersionHistory() {
        const list = document.getElementById('versionDrawerList');
        if (!list || !this.currentDoc || !this.currentDoc.id) return;
        list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);">Loading versions...</div>';

        try {
            const data = await api.getDocumentVersions(this.currentDoc.id);
            const versionsList = Array.isArray(data) ? data : (data && data.versions ? data.versions : []);
            if (!versionsList || versionsList.length === 0) {
                list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);">No version history available</div>';
                return;
            }

            let html = '';
            versionsList.forEach(v => {
                const isCurrent = v.version_number === this.currentDoc.current_version_number;
                const author = v.created_by_name || (v.created_by ? (v.created_by.full_name || v.created_by.username) : 'User');
                const date = (messagesModule && typeof messagesModule.formatMessageTimestamp === 'function') 
                    ? messagesModule.formatMessageTimestamp(v.created_at) 
                    : new Date(v.created_at).toLocaleString();
                html += `
                    <div class="version-card ${isCurrent ? 'current' : ''}">
                        <div class="version-card-top">
                            <span class="version-badge">Version ${v.version_number}</span>
                            <span class="version-date">${date}</span>
                        </div>
                        <div class="version-author">By ${messagesModule.escapeHTML(author)}</div>
                        <div class="version-summary">${messagesModule.escapeHTML(v.change_summary || 'Document update')}</div>
                        <div class="version-card-actions">
                            ${!isCurrent ? `<button type="button" class="workspace-btn" style="height:26px;font-size:11px;" onclick="window.frankOfficeWorkspace.restoreVersion(${v.id})">Restore</button>` : '<span style="font-size:11px;color:var(--primary);font-weight:700;">Current Active Version</span>'}
                        </div>
                    </div>
                `;
            });
            list.innerHTML = html;
        } catch (err) {
            console.error('Failed to load version history:', err);
            list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--danger);">Failed to load versions</div>';
        }
    }

    async restoreVersion(versionId) {
        if (!this.currentDoc || !this.currentDoc.id) return;
        try {
            const res = await api.restoreDocumentVersion(this.currentDoc.id, versionId);
            if (res && res.status === 'restored') {
                showToast(`Restored to new Version ${res.new_version.version_number}`, 'success');
                this.toggleVersionDrawer(false);
                // Reload workspace
                await this.loadServerWorkspace(this.currentDoc.id);
            }
        } catch (err) {
            showToast('Unable to restore version', 'error');
        }
    }

    // ---------------- DOWNLOAD DOCUMENT ----------------
    async downloadDocument() {
        if (!this.currentDoc) return;
        if (this.category === 'excel' && this.sheetsEngine) {
            this.sheetsEngine.fileExportXlsx();
            return;
        }
        const url = this.currentDoc.downloadUrl || this.currentDoc.viewUrl;
        if (!url) return;

        try {
            const res = await fetch(url);
            if (res.ok) {
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = this.currentDoc.filename || 'download';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
                showToast('Download started', 'success');
                return;
            }
        } catch (e) {
            console.warn('Fetch blob download fallback:', e);
        }

        const a = document.createElement('a');
        a.href = url;
        a.download = this.currentDoc.filename || 'download';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('Download initiated', 'success');
    }

    printDocument() {
        if (this.category === 'pdf') {
            const frame = document.getElementById('pdfViewFrame');
            if (frame && frame.contentWindow) {
                try {
                    frame.contentWindow.print();
                    return;
                } catch (e) {}
            }
        }
        window.print();
    }

    toggleFullscreen() {
        const ws = document.getElementById('frankDocumentWorkspace');
        if (!document.fullscreenElement) {
            ws.requestFullscreen?.().catch(() => {});
        } else {
            document.exitFullscreen?.().catch(() => {});
        }
    }

    handleBack() {
        if (this.isDirty) {
            document.getElementById('workspaceUnsavedModal')?.classList.add('open');
        } else {
            this.closeWorkspace();
        }
    }

    closeWorkspace() {
        if (this.sheetsEngine) {
            this.sheetsEngine.cleanup();
        }
        const ws = document.getElementById('frankDocumentWorkspace');
        if (ws) {
            ws.classList.remove('active');
            ws.style.display = 'none';
        }

        // If Document Browser was active before opening workspace, restore it
        const docBrowser = document.getElementById('docBrowserWorkspace');
        const navDocs = document.getElementById('navOpenEditDocsBtn');
        if (navDocs && navDocs.classList.contains('active') && docBrowser) {
            docBrowser.style.display = 'flex';
            if (window.documentBrowserController) {
                window.documentBrowserController.loadDocuments();
            }
            return;
        }

        // Restore chat scroll position
        const msgStream = document.getElementById('messagesStream') || document.querySelector('.messages-stream');
        if (msgStream && this.previousChatScroll !== undefined) {
            setTimeout(() => {
                msgStream.scrollTop = this.previousChatScroll;
            }, 50);
        }
    }
}

// Global instance initialization
window.frankOfficeWorkspace = new FrankOfficeWorkspace();
