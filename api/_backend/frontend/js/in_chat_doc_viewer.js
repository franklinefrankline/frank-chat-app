/* -------------------------------------------------------------------------
   FRANK THINK — IN-CHAT DOCUMENT VIEWER CONTROLLER
   Accurately renders PDF, Word, Excel, and PowerPoint documents inside chat.
   Follows reference layout (media_1791280951377.png & media_1791280951361.png).
   Preserves conversation header, sidebar, and message composer on desktop.
   ------------------------------------------------------------------------- */

class InChatDocViewer {
    constructor() {
        this.currentDoc = null;
        this.format = 'unsupported';
        this.zoom = 100;
        this.currentPage = 1;
        this.totalPages = 1;
        this.thumbnailsCollapsed = false;
        this.previousMessagesScrollTop = 0;
        this.objectUrls = [];
        this.pdfDoc = null;
        this.pdfPagesRendered = new Set();
        this.xlsxWb = null;
        this.activeSheetIdx = 0;
        this.activeCell = { r: 0, c: 0, coord: 'A1' };
        this.pptxSlides = [];
        this.pptxImages = {};
        this.slideAspectRatio = '16/9';
        this.slideDimensions = { cx: 12192000, cy: 6858000 };
        this.isPresentationActive = false;
        this.currentAnimStep = 0;
        this.autoPlayInterval = null;
        this.autoAdvanceTimeout = null;
        this.hudHideTimeout = null;
        this.searchState = { query: '', matches: [], currentIdx: -1, isOpen: false };
        this.isFullscreenActive = false;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.dom = {
            viewer: document.getElementById('inChatDocViewer'),
            header: document.getElementById('inChatDocHeader'),
            typeIcon: document.getElementById('inChatDocTypeIcon'),
            filename: document.getElementById('inChatDocFilename'),
            meta: document.getElementById('inChatDocMeta'),
            topDownloadBtn: document.getElementById('inChatDocDownloadBtn'),
            topCloseBtn: document.getElementById('inChatDocCloseBtn'),

            toolbar: document.getElementById('inChatDocToolbar'),
            toggleThumbsBtn: document.getElementById('docToggleThumbsBtn'),
            toolbarTitle: document.getElementById('toolbarDocTitle'),
            prevBtn: document.getElementById('docPrevBtn'),
            nextBtn: document.getElementById('docNextBtn'),
            pageInput: document.getElementById('docPageInput'),
            pageTotal: document.getElementById('docPageTotal'),
            pagePrefix: document.getElementById('docPagePrefix'),
            zoomOutBtn: document.getElementById('docZoomOutBtn'),
            zoomLevel: document.getElementById('docZoomLevel'),
            zoomInBtn: document.getElementById('docZoomInBtn'),
            zoomResetBtn: document.getElementById('docZoomResetBtn'),
            searchToggleBtn: document.getElementById('docSearchToggleBtn'),
            downloadToolBtn: document.getElementById('docDownloadToolBtn'),
            printToolBtn: document.getElementById('docPrintToolBtn'),
            presentBtn: document.getElementById('docPresentBtn'),
            exitFsPill: document.getElementById('docExitFullscreenPill'),
            fullscreenToolBtn: document.getElementById('docFullscreenToolBtn'),
            toolbarCloseBtn: document.getElementById('docToolbarCloseBtn'),

            searchBar: document.getElementById('docSearchBar'),
            searchInput: document.getElementById('docSearchInput'),
            searchCount: document.getElementById('docSearchCount'),
            searchPrevBtn: document.getElementById('docSearchPrevBtn'),
            searchNextBtn: document.getElementById('docSearchNextBtn'),
            searchCloseBtn: document.getElementById('docSearchCloseBtn'),

            formulaBar: document.getElementById('docFormulaBar'),
            activeCellCoord: document.getElementById('docActiveCellCoord'),
            formulaInput: document.getElementById('docFormulaInput'),

            thumbsPanel: document.getElementById('docThumbnailsPanel'),
            thumbsTitle: document.getElementById('docThumbnailsTitle'),
            closeThumbsBtn: document.getElementById('docCloseThumbsPanelBtn'),
            thumbsList: document.getElementById('docThumbnailsList'),

            viewport: document.getElementById('docViewport'),
            contentStage: document.getElementById('docContentStage'),
            loadingOverlay: document.getElementById('docLoadingOverlay'),
            loadingText: document.getElementById('docLoadingText'),

            sheetsStrip: document.getElementById('docSheetsStrip'),
            sheetsTabsContainer: document.getElementById('docSheetsTabsContainer'),
            sheetScrollLeftBtn: document.getElementById('docSheetScrollLeftBtn'),
            sheetScrollRightBtn: document.getElementById('docSheetScrollRightBtn'),

            // Slideshow Presentation Mode Elements
            slideshowOverlay: document.getElementById('docSlideshowOverlay'),
            slideshowStageContainer: document.getElementById('docSlideshowStageContainer'),
            slideshowStage: document.getElementById('docSlideshowStage'),
            slideshowHud: document.getElementById('docSlideshowHud'),
            ssStartBtn: document.getElementById('docSlideshowStartBtn'),
            ssPrevBtn: document.getElementById('docSlideshowPrevBtn'),
            ssNextBtn: document.getElementById('docSlideshowNextBtn'),
            ssCounter: document.getElementById('docSlideshowCounter'),
            ssPlayBtn: document.getElementById('docSlideshowPlayBtn'),
            ssPlayIcon: document.getElementById('docSlideshowPlayIcon'),
            ssFsBtn: document.getElementById('docSlideshowFsBtn'),
            ssExitBtn: document.getElementById('docSlideshowExitBtn'),

            // Toolbar Overflow Elements
            overflowWrap: document.getElementById('docToolbarOverflowWrap'),
            moreActionsBtn: document.getElementById('docMoreActionsBtn'),
            moreActionsDropdown: document.getElementById('docMoreActionsDropdown'),
            overflowSearchBtn: document.getElementById('docOverflowSearchBtn'),
            overflowDownloadBtn: document.getElementById('docOverflowDownloadBtn'),
            overflowPrintBtn: document.getElementById('docOverflowPrintBtn'),
            overflowFitZoomBtn: document.getElementById('docOverflowFitZoomBtn')
        };

        if (this.dom.slideshowOverlay && this.dom.slideshowOverlay.parentElement !== document.body) {
            document.body.appendChild(this.dom.slideshowOverlay);
        }

        this.bindEvents();
        this.updateI18nLabels();
        this.initialized = true;
    }

    updateI18nLabels() {
        const t = (k, def) => (window.i18n && typeof window.i18n.t === 'function' ? window.i18n.t(k, def) : def);
        if (this.dom.topCloseBtn) this.dom.topCloseBtn.title = t('common.close', 'Close Document');
        if (this.dom.topDownloadBtn) this.dom.topDownloadBtn.title = t('office.download', 'Download File');
        if (this.dom.prevBtn) this.dom.prevBtn.title = t('office.prevSlide', 'Previous Page');
        if (this.dom.nextBtn) this.dom.nextBtn.title = t('office.nextSlide', 'Next Page');
        if (this.dom.zoomInBtn) this.dom.zoomInBtn.title = t('office.zoomIn', 'Zoom In');
        if (this.dom.zoomOutBtn) this.dom.zoomOutBtn.title = t('office.zoomOut', 'Zoom Out');
        if (this.dom.zoomResetBtn) this.dom.zoomResetBtn.title = t('office.fitWidth', 'Reset Zoom');
        if (this.dom.printToolBtn) this.dom.printToolBtn.title = t('office.print', 'Print');
        if (this.dom.presentBtn) this.dom.presentBtn.title = t('office.slideshow', 'Present Slideshow');
        if (this.dom.exitFsPill) this.dom.exitFsPill.textContent = t('office.exitSlideshow', '✕ Exit Fullscreen (Esc)');
        if (this.dom.loadingText && this.format) {
            this.dom.loadingText.textContent = `${t('common.loading', 'Loading')} ${this.format.toUpperCase()}...`;
        }
    }

    bindEvents() {
        window.addEventListener('frank:languageChanged', () => {
            this.updateI18nLabels();
        });

        // Close Buttons
        this.dom.topCloseBtn?.addEventListener('click', () => this.close());
        this.dom.toolbarCloseBtn?.addEventListener('click', () => this.close());

        // Download Buttons
        this.dom.topDownloadBtn?.addEventListener('click', () => this.downloadOriginal());
        this.dom.downloadToolBtn?.addEventListener('click', () => this.downloadOriginal());

        // Thumbnail Panel Toggle
        this.dom.toggleThumbsBtn?.addEventListener('click', () => this.toggleThumbnails());
        this.dom.closeThumbsBtn?.addEventListener('click', () => this.toggleThumbnails(true));

        // Page Navigation
        this.dom.prevBtn?.addEventListener('click', () => this.navigatePage(-1));
        this.dom.nextBtn?.addEventListener('click', () => this.navigatePage(1));
        this.dom.pageInput?.addEventListener('change', (e) => {
            const page = parseInt(e.target.value, 10);
            if (!isNaN(page)) this.goToPage(page);
        });

        // Zoom Controls
        this.dom.zoomOutBtn?.addEventListener('click', () => this.adjustZoom(-15));
        this.dom.zoomInBtn?.addEventListener('click', () => this.adjustZoom(15));
        this.dom.zoomResetBtn?.addEventListener('click', () => this.setZoom(100));
        this.dom.zoomLevel?.addEventListener('click', () => {
            const levels = [50, 75, 100, 125, 150];
            const next = levels[(levels.indexOf(this.zoom) + 1) % levels.length] || 100;
            this.setZoom(next);
        });

        // Search Controls
        this.dom.searchToggleBtn?.addEventListener('click', () => this.toggleSearch());
        this.dom.searchCloseBtn?.addEventListener('click', () => this.toggleSearch(false));
        this.dom.searchInput?.addEventListener('input', (e) => this.performSearch(e.target.value));
        this.dom.searchInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) this.searchNavigate(-1);
                else this.searchNavigate(1);
            }
        });
        this.dom.searchPrevBtn?.addEventListener('click', () => this.searchNavigate(-1));
        this.dom.searchNextBtn?.addEventListener('click', () => this.searchNavigate(1));

        // Print & Fullscreen
        this.dom.printToolBtn?.addEventListener('click', () => this.printDocument());
        this.dom.fullscreenToolBtn?.addEventListener('click', () => this.toggleFullscreen());
        this.dom.exitFsPill?.addEventListener('click', () => this.toggleFullscreen(false));

        // Toolbar Overflow Menu Controls
        this.dom.moreActionsBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = this.dom.moreActionsDropdown?.style.display === 'flex';
            if (this.dom.moreActionsDropdown) {
                this.dom.moreActionsDropdown.style.display = isOpen ? 'none' : 'flex';
                this.dom.moreActionsBtn?.setAttribute('aria-expanded', !isOpen);
            }
        });

        this.dom.overflowSearchBtn?.addEventListener('click', () => {
            this.closeOverflowDropdown();
            this.toggleSearch(true);
        });
        this.dom.overflowDownloadBtn?.addEventListener('click', () => {
            this.closeOverflowDropdown();
            this.downloadOriginal();
        });
        this.dom.overflowPrintBtn?.addEventListener('click', () => {
            this.closeOverflowDropdown();
            this.printDocument();
        });
        this.dom.overflowFitZoomBtn?.addEventListener('click', () => {
            this.closeOverflowDropdown();
            this.setZoom(100);
        });

        document.addEventListener('click', (e) => {
            if (this.dom.moreActionsDropdown && !this.dom.overflowWrap?.contains(e.target)) {
                this.closeOverflowDropdown();
            }
        });

        // Dedicated Slideshow Presentation Mode Button & Controls
        this.dom.presentBtn?.addEventListener('click', () => this.startPresentation(this.currentPage));
        this.dom.ssStartBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.goToSlideshowSlide(1); });
        this.dom.ssPrevBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.stepSlideshow(-1); });
        this.dom.ssNextBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.stepSlideshow(1); });
        this.dom.ssPlayBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.toggleSlideshowAutoPlay(); });
        this.dom.ssFsBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.toggleFullscreen(); });
        this.dom.ssExitBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.exitPresentation(); });

        this.dom.slideshowStage?.addEventListener('click', (e) => {
            if (!e.target.closest('.doc-slideshow-hud') && !e.target.closest('.doc-slideshow-toolbar')) {
                this.stepSlideshow(1);
            }
        });

        // Touch swipe gestures for slideshow on mobile/tablet
        let touchStartX = 0;
        let touchStartY = 0;
        this.dom.slideshowOverlay?.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length > 0) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
            }
        }, { passive: true });
        this.dom.slideshowOverlay?.addEventListener('touchend', (e) => {
            if (e.changedTouches && e.changedTouches.length > 0) {
                const diffX = e.changedTouches[0].clientX - touchStartX;
                const diffY = e.changedTouches[0].clientY - touchStartY;
                if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
                    if (diffX < 0) this.stepSlideshow(1);
                    else this.stepSlideshow(-1);
                }
            }
        }, { passive: true });

        if (this.dom.slideshowOverlay) {
            this.dom.slideshowOverlay.classList.remove('is-active');
            this.dom.slideshowOverlay.style.display = 'none';
        }

        // Sync state if native browser Fullscreen API triggers change
        document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());

        // Responsive resize listener for full-page slideshow and Word viewer
        window.addEventListener('resize', () => {
            if (this.isPresentationActive) {
                this.recomputeSlideshowDimensions();
            } else if (this.format === 'word') {
                this.applyWordZoom();
            }
        });

        // Excel Sheet scrolling
        this.dom.sheetScrollLeftBtn?.addEventListener('click', () => {
            this.dom.sheetsTabsContainer?.scrollBy({ left: -100, behavior: 'smooth' });
        });
        this.dom.sheetScrollRightBtn?.addEventListener('click', () => {
            this.dom.sheetsTabsContainer?.scrollBy({ left: 100, behavior: 'smooth' });
        });

        // Viewport scroll tracking for PDF and Word pages
        this.dom.viewport?.addEventListener('scroll', () => {
            if (this.format === 'pdf') this.trackPdfScroll();
            else if (this.format === 'word') this.trackWordScroll();
        }, { passive: true });

        // Global Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            // Presentation mode intercepts keyboard navigation first
            if (this.isPresentationActive) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.exitPresentation();
                } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    this.stepSlideshow(1);
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Backspace') {
                    e.preventDefault();
                    this.stepSlideshow(-1);
                } else if (e.key === 'Home') {
                    e.preventDefault();
                    this.goToSlideshowSlide(1);
                } else if (e.key === 'End') {
                    e.preventDefault();
                    this.goToSlideshowSlide(this.totalPages);
                }
                return;
            }

            if (!this.isOpen()) return;

            if (e.key === 'Escape') {
                if (this.dom.moreActionsDropdown && this.dom.moreActionsDropdown.style.display === 'flex') {
                    this.closeOverflowDropdown();
                } else if (this.searchState.isOpen) {
                    this.toggleSearch(false);
                } else if (this.isFullscreen()) {
                    this.toggleFullscreen(false);
                } else {
                    this.close();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                this.toggleSearch(true);
            } else if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
                e.preventDefault();
                this.adjustZoom(15);
            } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
                e.preventDefault();
                this.adjustZoom(-15);
            } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
                e.preventDefault();
                this.setZoom(100);
            } else if (this.format === 'presentation') {
                if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
                    e.preventDefault();
                    this.navigatePage(1);
                } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
                    e.preventDefault();
                    this.navigatePage(-1);
                }
            }
        });

        window.addEventListener('resize', () => {
            if (!this.isOpen()) return;
            if (this.format === 'word') {
                this.applyWordZoom();
            }
        });
    }

    isOpen() {
        return this.dom.viewer && this.dom.viewer.style.display !== 'none';
    }

    // ---------------- OPEN DOCUMENT ENTRY POINT ----------------
    async open(fileId, fileType, filename, directUrl, meta = {}) {
        this.init();

        const validFileId = (fileId && !isNaN(fileId) && parseInt(fileId, 10) > 0) ? parseInt(fileId, 10) : null;
        const filenameClean = filename || 'Document';
        const ext = (filenameClean.split('.').pop() || '').toLowerCase();

        // Determine effective category based on MIME type, file metadata, and file extension
        const mime = (meta.mime_type || meta.mimeType || meta.contentType || '').toLowerCase();
        const fType = (fileType || meta.file_type || '').toLowerCase();
        const isPptx = ['ppt', 'pptx'].includes(ext) || mime.includes('presentation') || mime.includes('powerpoint') || fType === 'presentation' || fType === 'pptx';
        const isWord = ['doc', 'docx'].includes(ext) || mime.includes('word') || mime.includes('officedocument.wordprocessingml') || fType === 'word' || fType === 'docx';
        const isExcel = ['xls', 'xlsx', 'csv'].includes(ext) || mime.includes('excel') || mime.includes('spreadsheet') || mime.includes('text/csv') || fType === 'excel' || fType === 'sheets';
        const isPdf = ext === 'pdf' || mime.includes('pdf') || fType === 'pdf';

        let effectiveFormat = 'unsupported';
        if (isPptx) effectiveFormat = 'presentation';
        else if (isPdf) effectiveFormat = 'pdf';
        else if (isWord) effectiveFormat = 'word';
        else if (isExcel) effectiveFormat = 'excel';
        else if (['txt', 'text', 'md', 'markdown', 'json', 'log'].includes(ext) || mime.startsWith('text/')) effectiveFormat = 'text';

        const token = (typeof api !== 'undefined' && api.getToken) ? api.getToken() : null;
        let viewUrl = validFileId ? (typeof api !== 'undefined' ? api.getFileViewUrl(validFileId) : `/api/files/${validFileId}/view`) : directUrl;
        if (token && viewUrl && !viewUrl.startsWith('blob:') && !viewUrl.startsWith('data:') && !viewUrl.includes('token=')) {
            const separator = viewUrl.includes('?') ? '&' : '?';
            viewUrl = `${viewUrl}${separator}token=${encodeURIComponent(token)}`;
        }

        this.currentDoc = {
            id: validFileId,
            fileType: fileType,
            format: effectiveFormat,
            filename: filenameClean,
            ext: ext,
            viewUrl: viewUrl,
            directUrl: directUrl,
            meta: meta
        };
        this.format = effectiveFormat;
        this.zoom = 100;
        this.currentPage = 1;
        this.totalPages = 1;

        // Save current messages container scroll
        const msgContainer = document.getElementById('messagesContainer');
        if (msgContainer) {
            this.previousMessagesScrollTop = msgContainer.scrollTop;
            msgContainer.style.display = 'none';
        }
        const typingBox = document.getElementById('typingIndicatorBox');
        if (typingBox) typingBox.style.display = 'none';

        // Ensure activeChatView and chatWindow are visible on mobile & desktop
        const activeChatView = document.getElementById('activeChatView');
        if (activeChatView) activeChatView.style.display = 'flex';
        document.getElementById('chatApp')?.classList.add('has-active-chat');
        document.getElementById('chatWindow')?.classList.add('mobile-open');

        // Display In-Chat Viewer in normal mode
        this.setFullscreenState(false);
        this.dom.viewer.style.display = 'flex';

        // Format mode flags & Present button visibility
        if (effectiveFormat === 'excel') {
            this.dom.viewer.classList.add('is-excel-mode');
            this.dom.viewer.classList.remove('is-presentation-mode');
            if (this.dom.presentBtn) this.dom.presentBtn.style.display = 'none';
        } else if (effectiveFormat === 'presentation') {
            this.dom.viewer.classList.remove('is-excel-mode');
            this.dom.viewer.classList.add('is-presentation-mode');
            if (this.dom.presentBtn) this.dom.presentBtn.style.display = 'inline-flex';
        } else {
            this.dom.viewer.classList.remove('is-excel-mode');
            this.dom.viewer.classList.remove('is-presentation-mode');
            if (this.dom.presentBtn) this.dom.presentBtn.style.display = 'none';
        }

        // Setup Header Info
        this.updateHeaderInfo(filenameClean, ext, meta);

        // Reset Toolbar & Body
        this.resetUIState();
        if (effectiveFormat === 'presentation') {
            this.dom.viewer.classList.add('is-presentation-mode');
            if (this.dom.presentBtn) this.dom.presentBtn.style.display = 'inline-flex';
        }
        this.showLoading(true, `Loading ${filenameClean}...`);

        try {
            // Fetch Document Bytes
            const headers = {};
            if (token && !viewUrl.startsWith('blob:') && !viewUrl.startsWith('data:')) headers['Authorization'] = `Bearer ${token}`;

            const response = await fetch(viewUrl, { headers });
            if (!response.ok) {
                throw new Error(`Failed to load file content (HTTP ${response.status})`);
            }

            const arrayBuffer = await response.arrayBuffer();
            this.showLoading(false);

            // Dispatch to specific format renderer
            if (effectiveFormat === 'pdf') {
                await this.renderPDF(arrayBuffer);
            } else if (effectiveFormat === 'word') {
                await this.renderWord(arrayBuffer, ext);
            } else if (effectiveFormat === 'excel') {
                await this.renderExcel(arrayBuffer, ext);
            } else if (effectiveFormat === 'presentation') {
                await this.renderPowerPoint(arrayBuffer, ext);
            } else if (effectiveFormat === 'text') {
                this.renderText(arrayBuffer);
            } else {
                this.renderFallbackUnsupported('Unsupported file format');
            }
        } catch (err) {
            console.error('[InChatDocViewer] Failed to load document:', err);
            this.showLoading(false);
            this.renderFallbackUnsupported(err.message || 'Unable to display document preview');
        }
    }

    updateHeaderInfo(filename, ext, meta = {}) {
        this.dom.filename.textContent = filename;
        this.dom.toolbarTitle.textContent = filename;
        this.dom.toolbarTitle.title = filename;

        // Badge Icon
        const iconEl = this.dom.typeIcon;
        iconEl.className = 'in-chat-doc-type-icon ' + this.format;
        if (this.format === 'pdf') iconEl.textContent = '📕';
        else if (this.format === 'word') iconEl.textContent = '📘';
        else if (this.format === 'excel') iconEl.textContent = '📊';
        else if (this.format === 'presentation') iconEl.textContent = '📽️';
        else if (this.format === 'text') iconEl.textContent = '📝';
        else iconEl.textContent = '📄';

        // Meta text
        let sizeStr = '';
        if (meta.file_size) {
            if (typeof documentsController !== 'undefined' && documentsController.formatFileSize) {
                sizeStr = documentsController.formatFileSize(meta.file_size);
            } else {
                sizeStr = meta.file_size > 1048576 ? `${(meta.file_size / 1048576).toFixed(1)} MB` : `${Math.round(meta.file_size / 1024)} KB`;
            }
        }
        let timeStr = '';
        if (meta.created_at) {
            try {
                const d = new Date(meta.created_at);
                if (!isNaN(d.getTime())) {
                    timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                }
            } catch {}
        }
        const parts = [ext.toUpperCase()];
        if (sizeStr) parts.push(sizeStr);
        if (timeStr) parts.push(timeStr);
        this.dom.meta.textContent = parts.join(' • ');
    }

    resetUIState() {
        if (this.isPresentationActive) {
            this.exitPresentation();
        }
        this.cleanupResources();
        this.dom.contentStage.innerHTML = '';
        this.dom.thumbsList.innerHTML = '';
        this.dom.viewer?.classList.remove('is-presentation-mode');
        if (this.dom.presentBtn) this.dom.presentBtn.style.display = 'none';
        this.dom.formulaBar.style.display = 'none';
        this.dom.sheetsStrip.style.display = 'none';
        this.dom.searchBar.style.display = 'none';
        this.searchState.isOpen = false;
        this.dom.searchToggleBtn?.classList.remove('active');
        this.dom.pageInput.value = '1';
        this.dom.pageTotal.textContent = '1';
        this.dom.pagePrefix.style.display = 'none';
        this.setZoom(100);

        // Ensure left thumbnail panel is open by default on desktop, collapsed on mobile
        if (window.innerWidth <= 768) {
            this.toggleThumbnails(true);
        } else {
            this.toggleThumbnails(false);
        }
    }

    showLoading(show, message = 'Loading document...') {
        if (!this.dom.loadingOverlay) return;
        this.dom.loadingOverlay.style.display = show ? 'flex' : 'none';
        if (this.dom.loadingText) this.dom.loadingText.textContent = message;
    }

    async close() {
        this.closeOverflowDropdown();
        if (this.isPresentationActive) {
            this.exitPresentation();
        }
        if (this.isFullscreen()) {
            await this.toggleFullscreen(false);
        }
        this.cleanupResources();

        // Hide viewer
        if (this.dom.viewer) {
            this.dom.viewer.style.display = 'none';
            this.dom.viewer.classList.remove('is-fullscreen');
            this.dom.viewer.classList.remove('is-excel-mode');
        }
        document.body.classList.remove('doc-viewer-fullscreen-active');
        if (this.dom.presentBtn) this.dom.presentBtn.style.display = 'none';

        if (!window.chatController?.activeId) {
            document.getElementById('chatApp')?.classList.remove('has-active-chat');
            document.getElementById('chatWindow')?.classList.remove('mobile-open');
        }

        // Restore messages container
        const msgContainer = document.getElementById('messagesContainer');
        if (msgContainer) {
            msgContainer.style.display = 'flex';
            msgContainer.scrollTop = this.previousMessagesScrollTop;
        }
        const typingBox = document.getElementById('typingIndicatorBox');
        if (typingBox) typingBox.style.display = '';

        this.currentDoc = null;
    }

    cleanupResources() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
        if (this.autoAdvanceTimeout) {
            clearTimeout(this.autoAdvanceTimeout);
            this.autoAdvanceTimeout = null;
        }
        if (this.hudHideTimeout) {
            clearTimeout(this.hudHideTimeout);
            this.hudHideTimeout = null;
        }

        // Revoke temporary object URLs
        for (const url of this.objectUrls) {
            try { URL.revokeObjectURL(url); } catch {}
        }
        this.objectUrls = [];
        this.pdfDoc = null;
        this.pdfPagesRendered.clear();
        this.xlsxWb = null;
        this.pptxSlides = [];
        this.pptxImages = {};
    }

    // =========================================================================
    // 1. PDF RENDERER (PDF.js Canvas + Thumbnails + Text Search)
    // =========================================================================
    async renderPDF(arrayBuffer) {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js library is not available');
        }

        pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        this.pdfDoc = await loadingTask.promise;
        this.totalPages = this.pdfDoc.numPages;

        this.dom.pageTotal.textContent = this.totalPages;
        this.dom.pageInput.max = this.totalPages;
        this.dom.thumbsTitle.textContent = `Pages (${this.totalPages})`;

        // Build thumbnail cards
        this.dom.thumbsList.innerHTML = '';
        for (let p = 1; p <= this.totalPages; p++) {
            const card = document.createElement('div');
            card.className = `thumb-card ${p === 1 ? 'active' : ''}`;
            card.dataset.page = p;
            card.innerHTML = `
                <canvas class="thumb-canvas" id="pdfThumbCanvas-${p}" width="100" height="140"></canvas>
                <span class="thumb-card-num">${p}</span>
            `;
            card.onclick = () => this.goToPage(p);
            this.dom.thumbsList.appendChild(card);
        }

        // Render main page containers
        this.dom.contentStage.innerHTML = '';
        for (let p = 1; p <= this.totalPages; p++) {
            const pageWrap = document.createElement('div');
            pageWrap.className = 'pdf-page-container';
            pageWrap.id = `pdfPageContainer-${p}`;
            pageWrap.dataset.page = p;
            pageWrap.innerHTML = `
                <canvas id="pdfPageCanvas-${p}"></canvas>
            `;
            this.dom.contentStage.appendChild(pageWrap);
        }

        // Render visible pages and thumbnails asynchronously
        this.renderPdfPage(1);
        if (this.totalPages > 1) this.renderPdfPage(2);
        this.renderPdfThumbnails();
    }

    async renderPdfPage(pageNum) {
        if (!this.pdfDoc || this.pdfPagesRendered.has(pageNum)) return;
        this.pdfPagesRendered.add(pageNum);

        try {
            const page = await this.pdfDoc.getPage(pageNum);
            const scale = (this.zoom / 100) * (window.devicePixelRatio || 1.5);
            const viewport = page.getViewport({ scale });

            const canvas = document.getElementById(`pdfPageCanvas-${pageNum}`);
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.width = `${viewport.width / (window.devicePixelRatio || 1.5)}px`;
            canvas.style.height = `${viewport.height / (window.devicePixelRatio || 1.5)}px`;

            await page.render({ canvasContext: ctx, viewport }).promise;
        } catch (err) {
            console.warn(`[InChatDocViewer] Failed rendering PDF page ${pageNum}:`, err);
        }
    }

    async renderPdfThumbnails() {
        for (let p = 1; p <= Math.min(this.totalPages, 30); p++) {
            try {
                const page = await this.pdfDoc.getPage(p);
                const thumbViewport = page.getViewport({ scale: 0.18 });
                const thumbCanvas = document.getElementById(`pdfThumbCanvas-${p}`);
                if (!thumbCanvas) continue;
                thumbCanvas.width = thumbViewport.width;
                thumbCanvas.height = thumbViewport.height;
                const ctx = thumbCanvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport: thumbViewport }).promise;
            } catch {}
        }
    }

    trackPdfScroll() {
        const containers = this.dom.contentStage.querySelectorAll('.pdf-page-container');
        const viewportTop = this.dom.viewport.scrollTop;
        const viewportHeight = this.dom.viewport.clientHeight;
        const viewportMid = viewportTop + viewportHeight / 3;

        let activePage = 1;
        for (const el of containers) {
            const p = parseInt(el.dataset.page, 10);
            if (el.offsetTop <= viewportMid) {
                activePage = p;
            }
            // Lazy load pages in view
            if (Math.abs(el.offsetTop - viewportTop) < viewportHeight * 2) {
                this.renderPdfPage(p);
            }
        }

        if (activePage !== this.currentPage) {
            this.currentPage = activePage;
            this.dom.pageInput.value = activePage;
            this.updateActiveThumbnail(activePage);
        }
    }

    // =========================================================================
    // 2. WORD RENDERER (docx-preview with realistic sheets and page sections)
    // =========================================================================
    async renderWord(arrayBuffer, ext) {
        if (ext === 'doc') {
            this.renderLegacyUnsupported(
                'Microsoft Word 97-2003 Document (.doc)',
                'Legacy binary Word files (.doc) cannot be rendered directly in the browser. Please download the file to open it in Microsoft Word.'
            );
            return;
        }

        if (typeof docx === 'undefined' || !docx.renderAsync) {
            throw new Error('docx-preview library is not available');
        }

        const container = document.createElement('div');
        container.className = 'docx-container';
        this.dom.contentStage.appendChild(container);

        await docx.renderAsync(arrayBuffer, container, null, {
            className: 'docx-view-sheet',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            useBase64URL: true
        });

        // Clean any raw entity artifacts like '&amp;' or '&nbsp;' in rendered text nodes
        try {
            const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
            let textNode;
            while ((textNode = walker.nextNode())) {
                if (textNode.nodeValue && (textNode.nodeValue.includes('&amp;') || textNode.nodeValue.includes('&nbsp;'))) {
                    textNode.nodeValue = textNode.nodeValue
                        .replace(/&amp;/g, '&')
                        .replace(/&nbsp;/g, ' ');
                }
            }
        } catch (e) {}

        // Wrap tables in responsive horizontal scroller
        container.querySelectorAll('section table').forEach(tbl => {
            if (!tbl.parentElement.classList.contains('docx-table-responsive-wrapper')) {
                const wrap = document.createElement('div');
                wrap.className = 'docx-table-responsive-wrapper';
                tbl.parentNode.insertBefore(wrap, tbl);
                wrap.appendChild(tbl);
            }
        });

        // Query rendered page sections (supports .docx-view-sheet-wrapper, .docx-wrapper, or raw sections)
        const sections = container.querySelectorAll('.docx-view-sheet-wrapper > section, .docx-wrapper > section, section.docx-view-sheet');
        this.totalPages = Math.max(sections.length, 1);
        this.dom.pageTotal.textContent = this.totalPages;
        this.dom.thumbsTitle.textContent = 'PAGES';

        // Build left thumbnails
        this.dom.thumbsList.innerHTML = '';
        if (sections.length > 0) {
            sections.forEach((sec, idx) => {
                const p = idx + 1;
                sec.id = `docxSection-${p}`;
                sec.dataset.page = p;
                const card = document.createElement('div');
                card.className = `thumb-card ${p === 1 ? 'active' : ''}`;
                card.dataset.page = p;

                // Miniature page card representation
                const headingEl = sec.querySelector('h1, h2, h3, h4, h5, h6, strong, b');
                const headingText = headingEl ? (headingEl.textContent || '').trim() : '';
                const hasTable = Boolean(sec.querySelector('table'));
                const hasImg = Boolean(sec.querySelector('img'));
                const bodyText = (sec.textContent || '').replace(headingText, '').trim();

                let thumbContent = '';
                if (headingText) {
                    thumbContent += `<div class="docx-thumb-heading">${this.escapeHtml(headingText.substring(0, 32))}</div>`;
                }
                if (hasTable) {
                    thumbContent += `<div class="docx-thumb-table-badge">📊 Table</div>`;
                }
                if (hasImg) {
                    thumbContent += `<div class="docx-thumb-img-badge">🖼 Image</div>`;
                }
                thumbContent += `<div class="docx-thumb-body">${this.escapeHtml(bodyText.substring(0, 95))}</div>`;

                card.innerHTML = `
                    <div class="docx-page-thumb-preview">
                        ${thumbContent}
                    </div>
                    <span class="thumb-card-num">Page ${p}</span>
                `;
                card.onclick = () => {
                    this.goToPage(p);
                    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                };
                this.dom.thumbsList.appendChild(card);
            });
        }

        // Apply responsive layout & zoom to Word container
        this.applyWordZoom();
    }

    trackWordScroll() {
        const sections = this.dom.contentStage.querySelectorAll('.docx-view-sheet-wrapper > section, .docx-wrapper > section, section.docx-view-sheet, section[id^="docxSection-"]');
        if (!sections || sections.length === 0) return;
        const viewportTop = this.dom.viewport.scrollTop;
        const viewportHeight = this.dom.viewport.clientHeight;
        const viewportMid = viewportTop + viewportHeight / 3;

        let activePage = 1;
        for (const sec of sections) {
            const p = parseInt(sec.dataset.page, 10) || 1;
            if (sec.offsetTop <= viewportMid) {
                activePage = p;
            }
        }

        if (activePage !== this.currentPage) {
            this.currentPage = activePage;
            this.dom.pageInput.value = activePage;
            this.updateActiveThumbnail(activePage);
        }
    }

    // =========================================================================
    // 3. EXCEL RENDERER (SheetJS Grid + Synchronized Horizontal Scrollbar + Formula Bar + Tabs)
    // =========================================================================
    async renderExcel(arrayBuffer, ext) {
        if (typeof XLSX === 'undefined') {
            throw new Error('SheetJS XLSX library is not available');
        }

        this.dom.viewer.classList.add('is-excel-mode');
        this.xlsxWb = XLSX.read(arrayBuffer, { type: 'array', cellFormula: true, cellStyles: true });
        if (!this.xlsxWb || !this.xlsxWb.SheetNames || this.xlsxWb.SheetNames.length === 0) {
            throw new Error('The workbook contains no readable sheets.');
        }

        this.dom.formulaBar.style.display = 'flex';
        this.dom.sheetsStrip.style.display = 'flex';
        this.dom.thumbsTitle.textContent = `Sheets (${this.xlsxWb.SheetNames.length})`;

        // Populate Left Thumbnail Panel Sheet List
        this.dom.thumbsList.innerHTML = '';
        this.xlsxWb.SheetNames.forEach((name, idx) => {
            const item = document.createElement('div');
            item.className = `sheet-thumb-item ${idx === 0 ? 'active' : ''}`;
            item.dataset.sheetIdx = idx;
            item.innerHTML = `
                <span>📊</span>
                <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escapeHtml(name)}</span>
            `;
            item.onclick = () => this.switchExcelSheet(idx);
            this.dom.thumbsList.appendChild(item);
        });

        // Populate Bottom Sheet Tabs Strip (Directly Below Grid Scrollbar & Fixed Above Composer)
        this.dom.sheetsTabsContainer.innerHTML = '';
        this.xlsxWb.SheetNames.forEach((name, idx) => {
            const tab = document.createElement('button');
            tab.type = 'button';
            tab.className = `sheet-tab ${idx === 0 ? 'active' : ''}`;
            tab.dataset.sheetIdx = idx;
            tab.textContent = name;
            tab.onclick = () => this.switchExcelSheet(idx);
            this.dom.sheetsTabsContainer.appendChild(tab);
        });

        this.switchExcelSheet(0);
    }

    switchExcelSheet(sheetIdx) {
        if (!this.xlsxWb || !this.xlsxWb.SheetNames[sheetIdx]) return;
        this.activeSheetIdx = sheetIdx;
        const sheetName = this.xlsxWb.SheetNames[sheetIdx];
        const ws = this.xlsxWb.Sheets[sheetName];

        // Update active classes on tabs and thumbnail items
        this.dom.thumbsList.querySelectorAll('.sheet-thumb-item').forEach((el, idx) => {
            el.classList.toggle('active', idx === sheetIdx);
        });
        this.dom.sheetsTabsContainer.querySelectorAll('.sheet-tab').forEach((el, idx) => {
            el.classList.toggle('active', idx === sheetIdx);
        });

        this.dom.contentStage.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.className = 'excel-spreadsheet-wrapper';

        // Single bounded grid container with visible horizontal scrollbar directly above sheet tabs
        const gridContainer = document.createElement('div');
        gridContainer.className = 'excel-grid-container';
        gridContainer.id = 'excelGridContainer';

        const table = document.createElement('table');
        table.className = 'excel-table';

        const ref = ws['!ref'] || 'A1:Z50';
        const range = XLSX.utils.decode_range(ref);

        // Ensure columns A through Z at minimum (25+ cols) and up to file's maximum columns (100+)
        const maxCols = Math.max(Math.min(range.e.c, 120), 25);
        const maxRows = Math.max(Math.min(range.e.r, 500), 50);

        // Header Row: Sticky Column Letters (A, B, C, D, E...)
        const thead = document.createElement('thead');
        const headerTr = document.createElement('tr');
        const cornerTh = document.createElement('th');
        cornerTh.className = 'excel-th corner-header';
        cornerTh.textContent = '';
        headerTr.appendChild(cornerTh);

        for (let c = range.s.c; c <= maxCols; c++) {
            const colLetter = XLSX.utils.encode_col(c);
            const th = document.createElement('th');
            th.className = 'excel-th';
            th.id = `excelColHeader-${c}`;
            th.textContent = colLetter;
            headerTr.appendChild(th);
        }
        thead.appendChild(headerTr);
        table.appendChild(thead);

        // Body Rows: Sticky Row Numbers (1, 2, 3...) & Synchronized Cells
        const tbody = document.createElement('tbody');
        for (let r = range.s.r; r <= maxRows; r++) {
            const tr = document.createElement('tr');

            // Sticky Row header
            const rowTh = document.createElement('th');
            rowTh.className = 'excel-row-header';
            rowTh.id = `excelRowHeader-${r}`;
            rowTh.textContent = (r + 1).toString();
            tr.appendChild(rowTh);

            for (let c = range.s.c; c <= maxCols; c++) {
                const cellCoord = XLSX.utils.encode_cell({ r, c });
                const cell = ws[cellCoord];
                const td = document.createElement('td');
                td.className = 'excel-td';
                td.dataset.coord = cellCoord;
                td.dataset.r = r;
                td.dataset.c = c;

                let val = '';
                let formula = '';
                if (cell) {
                    val = cell.w !== undefined ? cell.w : (cell.v !== undefined ? cell.v : '');
                    if (cell.f) formula = '=' + cell.f;
                }
                td.textContent = val;
                td.dataset.formula = formula;
                td.dataset.value = val;

                td.onclick = () => this.selectExcelCell(td, cellCoord, formula || val, r, c);

                // Double click for inline cell editing
                td.ondblclick = () => {
                    const currentVal = td.dataset.formula || td.dataset.value || '';
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = currentVal;
                    input.className = 'excel-inline-cell-editor';
                    input.style.cssText = 'width:100%; height:100%; border:none; outline:none; font:inherit; padding:0; margin:0; background:#FFF;';
                    td.textContent = '';
                    td.appendChild(input);
                    input.focus();
                    input.select();
                    const finish = () => {
                        const newVal = input.value;
                        this.commitExcelCellEdit(newVal);
                    };
                    input.onblur = finish;
                    input.onkeydown = (e) => {
                        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                        else if (e.key === 'Escape') { td.textContent = td.dataset.value || ''; }
                    };
                };

                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        gridContainer.appendChild(table);

        // Shift + Mousewheel & tilt-wheel horizontal scroll synchronization
        gridContainer.addEventListener('wheel', (e) => {
            if (e.shiftKey && !e.deltaX) {
                gridContainer.scrollLeft += e.deltaY;
                e.preventDefault();
            }
        }, { passive: false });

        wrapper.appendChild(gridContainer);
        this.dom.contentStage.appendChild(wrapper);

        // Formula Bar editing synchronization
        if (this.dom.formulaInput) {
            this.dom.formulaInput.readOnly = false;
            this.dom.formulaInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.commitExcelCellEdit(this.dom.formulaInput.value);
                }
            };
            this.dom.formulaInput.onblur = () => {
                this.commitExcelCellEdit(this.dom.formulaInput.value);
            };
        }

        // Default select A1
        const firstCell = table.querySelector('.excel-td');
        if (firstCell) {
            firstCell.click();
        }
    }

    selectExcelCell(td, coord, formulaOrVal, r, c) {
        // Clear previous selection
        this.dom.contentStage.querySelectorAll('.excel-td.selected').forEach(el => el.classList.remove('selected'));
        this.dom.contentStage.querySelectorAll('.header-highlight').forEach(el => el.classList.remove('header-highlight'));

        td.classList.add('selected');
        this.activeCell = { r, c, coord };

        // Highlight corresponding sticky column and row headers
        const colHeader = document.getElementById(`excelColHeader-${c}`);
        if (colHeader) colHeader.classList.add('header-highlight');
        const rowHeader = document.getElementById(`excelRowHeader-${r}`);
        if (rowHeader) rowHeader.classList.add('header-highlight');

        // Update Formula Bar
        if (this.dom.activeCellCoord) this.dom.activeCellCoord.textContent = coord;
        if (this.dom.formulaInput) this.dom.formulaInput.value = formulaOrVal || '';
    }

    commitExcelCellEdit(newVal) {
        if (!this.activeCell || !this.xlsxWb) return;
        const sheetName = this.xlsxWb.SheetNames[this.activeSheetIdx];
        if (!sheetName) return;
        const ws = this.xlsxWb.Sheets[sheetName];
        if (!ws) return;

        const coord = this.activeCell.coord;
        const td = this.dom.contentStage.querySelector(`.excel-td[data-coord="${coord}"]`);
        if (!td) return;

        const trimmed = (newVal || '').trim();
        if (trimmed.startsWith('=')) {
            td.dataset.formula = trimmed;
            td.dataset.value = trimmed;
            td.textContent = trimmed;
            ws[coord] = { t: 's', v: trimmed, f: trimmed.substring(1) };
        } else {
            td.dataset.formula = '';
            td.dataset.value = trimmed;
            td.textContent = trimmed;
            ws[coord] = { t: 's', v: trimmed };
        }
    }

    // =========================================================================
    // 4. POWERPOINT RENDERER (JSZip PPTX Extraction + Transitions + Animations + Present Mode)
    // =========================================================================
    async renderPowerPoint(arrayBuffer, ext) {
        if (ext === 'ppt') {
            this.renderLegacyUnsupported(
                'Microsoft PowerPoint 97-2003 Presentation (.ppt)',
                'Legacy binary PowerPoint files (.ppt) cannot be rendered directly in the browser. Please download the file to open it in Microsoft PowerPoint.'
            );
            return;
        }

        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip library is not available');
        }

        const zip = await JSZip.loadAsync(arrayBuffer);
        this.pptxSlides = [];
        this.pptxImages = {};

        // 1. Extract embedded media / images into Object URLs
        for (const filename of Object.keys(zip.files)) {
            if (filename.startsWith('ppt/media/')) {
                try {
                    const blob = await zip.files[filename].async('blob');
                    const url = URL.createObjectURL(blob);
                    this.objectUrls.push(url);
                    const baseName = filename.split('/').pop();
                    this.pptxImages[baseName] = url;
                    this.pptxImages[filename] = url;
                } catch {}
            }
        }

        // 2. Discover slide dimensions from ppt/presentation.xml (EMU units)
        const parser = new DOMParser();
        let slideW = 12192000; // default 16:9 width
        let slideH = 6858000;  // default 16:9 height
        if (zip.files['ppt/presentation.xml']) {
            try {
                const presXmlStr = await zip.files['ppt/presentation.xml'].async('string');
                const presDoc = parser.parseFromString(presXmlStr, 'text/xml');
                const sldSz = presDoc.getElementsByTagName('p:sldSz')[0] || presDoc.getElementsByTagName('sldSz')[0];
                if (sldSz) {
                    const cx = parseInt(sldSz.getAttribute('cx'), 10);
                    const cy = parseInt(sldSz.getAttribute('cy'), 10);
                    if (cx > 0 && cy > 0) {
                        slideW = cx;
                        slideH = cy;
                    }
                }
            } catch (e) {
                console.warn('[InChatDocViewer] Failed parsing ppt/presentation.xml dimensions:', e);
            }
        }
        this.slideDimensions = { cx: slideW, cy: slideH };
        this.slideAspectRatio = (slideW / slideH) > 1.5 ? '16/9' : '4/3';

        // 3. Discover and sort slide XML files
        const slideFiles = Object.keys(zip.files)
            .filter(f => f.match(/^ppt\/slides\/slide\d+\.xml$/))
            .sort((a, b) => {
                const numA = parseInt(a.match(/\d+/)[0], 10);
                const numB = parseInt(b.match(/\d+/)[0], 10);
                return numA - numB;
            });

        if (slideFiles.length === 0) {
            throw new Error('No slides found in the presentation file.');
        }

        // 4. Parse each slide XML with full geometry, transitions, and timing
        for (let i = 0; i < slideFiles.length; i++) {
            const slideFile = slideFiles[i];
            const slideBase = slideFile.split('/').pop();
            const xmlStr = await zip.files[slideFile].async('string');
            const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');

            // Parse relationships for image mapping
            const relsFile = `ppt/slides/_rels/${slideBase}.rels`;
            const relsMap = {};
            if (zip.files[relsFile]) {
                try {
                    const relsXmlStr = await zip.files[relsFile].async('string');
                    const relsDoc = parser.parseFromString(relsXmlStr, 'text/xml');
                    const relNodes = Array.from(relsDoc.getElementsByTagName('Relationship'));
                    for (const r of relNodes) {
                        const id = r.getAttribute('Id');
                        const target = r.getAttribute('Target') || '';
                        if (target.includes('media/')) {
                            const mediaName = target.split('/').pop();
                            if (this.pptxImages[mediaName]) {
                                relsMap[id] = this.pptxImages[mediaName];
                            }
                        }
                    }
                } catch {}
            }

            // Extract slide background color
            let bgColor = '#FFFFFF';
            const bgSrgb = xmlDoc.querySelector('p\\:bg a\\:srgbClr, bg a\\:srgbClr, p\\:bgPr a\\:srgbClr');
            if (bgSrgb && bgSrgb.getAttribute('val')) {
                bgColor = '#' + bgSrgb.getAttribute('val');
            }

            // Extract slide transition & auto-advance timing
            let transitionType = 'fade';
            let transitionDir = 'left';
            let transitionDur = 500;
            let autoAdvanceDelay = 0;

            const transEl = xmlDoc.getElementsByTagName('p:transition')[0] || xmlDoc.getElementsByTagName('transition')[0];
            if (transEl) {
                if (transEl.getElementsByTagName('p:push')[0] || transEl.getElementsByTagName('push')[0]) {
                    transitionType = 'push';
                    const pushEl = transEl.getElementsByTagName('p:push')[0] || transEl.getElementsByTagName('push')[0];
                    const dir = pushEl.getAttribute('dir') || 'l';
                    transitionDir = dir === 'r' ? 'right' : (dir === 'u' ? 'up' : (dir === 'd' ? 'down' : 'left'));
                } else if (transEl.getElementsByTagName('p:wipe')[0] || transEl.getElementsByTagName('wipe')[0]) {
                    transitionType = 'wipe';
                } else if (transEl.getElementsByTagName('p:zoom')[0] || transEl.getElementsByTagName('zoom')[0]) {
                    transitionType = 'zoom';
                } else if (transEl.getElementsByTagName('p:cut')[0] || transEl.getElementsByTagName('cut')[0]) {
                    transitionType = 'cut';
                } else {
                    transitionType = 'fade';
                }

                // Check auto-advance delay (advTm in milliseconds)
                const advTm = transEl.getAttribute('advTm');
                if (advTm) {
                    autoAdvanceDelay = parseInt(advTm, 10);
                }
            }

            // Extract animation timing nodes from p:timing
            const animTargets = new Map();
            let animStepCount = 0;
            const timingEl = xmlDoc.getElementsByTagName('p:timing')[0] || xmlDoc.getElementsByTagName('timing')[0];
            if (timingEl) {
                const allCTn = Array.from(timingEl.getElementsByTagName('p:cTn'));
                const cTnNodes = allCTn.filter(c => c.getElementsByTagName('p:childTnLst').length === 0);
                cTnNodes.forEach(cTn => {
                    const spTgt = cTn.getElementsByTagName('p:spTgt')[0];
                    if (spTgt) {
                        const spid = spTgt.getAttribute('spid');
                        if (spid) {
                            const animEffect = cTn.getElementsByTagName('p:animEffect')[0];
                            const setEl = cTn.getElementsByTagName('p:set')[0];
                            let effect = 'fade';
                            let filter = 'bottom';
                            if (animEffect) {
                                effect = animEffect.getAttribute('type') || 'fade';
                                filter = animEffect.getAttribute('filter') || 'bottom';
                            } else if (setEl) {
                                effect = 'appear';
                            }

                            animStepCount++;
                            animTargets.set(spid, {
                                step: animStepCount,
                                effect: effect,
                                filter: filter,
                                dur: parseInt(cTn.getAttribute('dur') || '500', 10),
                                delay: parseInt(cTn.getAttribute('delay') || '0', 10)
                            });
                        }
                    }
                });
            }

            // Extract visual shapes and pictures from spTree
            const elements = [];
            const spTree = xmlDoc.getElementsByTagName('p:spTree')[0] || xmlDoc.getElementsByTagName('spTree')[0];
            if (spTree) {
                const childNodes = Array.from(spTree.childNodes).filter(n => n.nodeType === 1);
                for (const node of childNodes) {
                    const nodeName = node.nodeName.toLowerCase();
                    if (!nodeName.includes('sp') && !nodeName.includes('pic') && !nodeName.includes('graphicframe')) continue;

                    const cNvPr = node.getElementsByTagName('p:cNvPr')[0] || node.getElementsByTagName('cNvPr')[0];
                    const id = cNvPr ? cNvPr.getAttribute('id') : '';
                    const name = cNvPr ? (cNvPr.getAttribute('name') || '') : '';

                    // Transform (x, y, cx, cy) in EMUs -> Percentage Coordinates
                    const xfrm = node.getElementsByTagName('p:xfrm')[0] || node.getElementsByTagName('a:xfrm')[0] || node.getElementsByTagName('xfrm')[0] || node.querySelector('p\\:xfrm, a\\:xfrm, xfrm');
                    if (!xfrm) continue;
                    const off = xfrm.getElementsByTagName('a:off')[0] || xfrm.getElementsByTagName('off')[0] || xfrm.querySelector('a\\:off, off');
                    const ext = xfrm.getElementsByTagName('a:ext')[0] || xfrm.getElementsByTagName('ext')[0] || xfrm.querySelector('a\\:ext, ext');
                    if (!off || !ext) continue;

                    const x = parseInt(off.getAttribute('x') || '0', 10);
                    const y = parseInt(off.getAttribute('y') || '0', 10);
                    const cx = parseInt(ext.getAttribute('cx') || '0', 10);
                    const cy = parseInt(ext.getAttribute('cy') || '0', 10);

                    const leftPct = (x / slideW) * 100;
                    const topPct = (y / slideH) * 100;
                    const widthPct = (cx / slideW) * 100;
                    const heightPct = (cy / slideH) * 100;

                    // Picture shape
                    const blip = node.getElementsByTagName('a:blip')[0] || node.getElementsByTagName('blip')[0];
                    if (blip) {
                        const embedId = blip.getAttribute('r:embed');
                        const imgSrc = relsMap[embedId] || null;
                        if (imgSrc) {
                            elements.push({
                                type: 'picture',
                                id: id,
                                name: name,
                                left: leftPct,
                                top: topPct,
                                width: widthPct,
                                height: heightPct,
                                imgSrc: imgSrc,
                                anim: animTargets.get(id) || null
                            });
                            continue;
                        }
                    }

                    // Table shape (a:tbl inside p:graphicFrame)
                    const tblNode = node.getElementsByTagName('a:tbl')[0] || node.getElementsByTagName('tbl')[0];
                    if (tblNode) {
                        const tableRows = [];
                        const trNodes = Array.from(tblNode.getElementsByTagName('a:tr'));
                        for (const trNode of trNodes) {
                            const rowCells = [];
                            const tcNodes = Array.from(trNode.getElementsByTagName('a:tc'));
                            for (const tcNode of tcNodes) {
                                let cellText = '';
                                const tNodes = tcNode.getElementsByTagName('a:t');
                                for (const t of tNodes) {
                                    cellText += (t.textContent || '') + ' ';
                                }
                                cellText = cellText.trim();
                                let cellBg = 'transparent';
                                const tcSrgb = tcNode.querySelector('a\\:tcPr a\\:solidFill a\\:srgbClr, tcPr solidFill srgbClr');
                                if (tcSrgb && tcSrgb.getAttribute('val')) cellBg = '#' + tcSrgb.getAttribute('val');

                                let isBold = false;
                                let cellColor = null;
                                const rPr = tcNode.querySelector('a\\:rPr, rPr');
                                if (rPr) {
                                    if (rPr.getAttribute('b') === '1') isBold = true;
                                    const cSrgb = rPr.querySelector('a\\:srgbClr, srgbClr');
                                    if (cSrgb && cSrgb.getAttribute('val')) cellColor = '#' + cSrgb.getAttribute('val');
                                }

                                rowCells.push({ text: cellText, bg: cellBg, bold: isBold, color: cellColor });
                            }
                            if (rowCells.length > 0) {
                                tableRows.push(rowCells);
                            }
                        }
                        if (tableRows.length > 0) {
                            elements.push({
                                type: 'table',
                                id: id,
                                name: name,
                                left: leftPct,
                                top: topPct,
                                width: widthPct,
                                height: heightPct,
                                rows: tableRows,
                                anim: animTargets.get(id) || null
                            });
                            continue;
                        }
                    }

                    // Text shape
                    const txBody = node.getElementsByTagName('p:txBody')[0] || node.getElementsByTagName('txBody')[0];
                    const paragraphs = [];
                    if (txBody) {
                        const pNodes = Array.from(txBody.getElementsByTagName('a:p'));
                        for (const pNode of pNodes) {
                            const pPr = pNode.getElementsByTagName('a:pPr')[0];
                            const align = pPr ? (pPr.getAttribute('algn') || 'left') : 'left';
                            const hasBullet = Boolean(pNode.getElementsByTagName('a:buChar')[0] || pNode.getElementsByTagName('a:buAutoNum')[0] || (pPr && pPr.getAttribute('lvl')));

                            const rNodes = Array.from(pNode.getElementsByTagName('a:r'));
                            const runs = [];
                            for (const rNode of rNodes) {
                                const tNode = rNode.getElementsByTagName('a:t')[0];
                                if (!tNode) continue;
                                const text = tNode.textContent;
                                const rPr = rNode.getElementsByTagName('a:rPr')[0];
                                const sz = rPr ? parseInt(rPr.getAttribute('sz') || '1800', 10) / 100 : 18;
                                const bold = rPr ? rPr.getAttribute('b') === '1' : false;
                                const italic = rPr ? rPr.getAttribute('i') === '1' : false;
                                let color = '#1E293B';
                                const srgb = rPr ? rPr.querySelector('a\\:srgbClr, srgbClr') : null;
                                if (srgb && srgb.getAttribute('val')) color = '#' + srgb.getAttribute('val');

                                runs.push({ text, sz, bold, italic, color });
                            }

                            if (runs.length > 0) {
                                paragraphs.push({ align, hasBullet, runs });
                            }
                        }
                    }

                    // Shape background fill & border
                    let shapeBg = 'transparent';
                    const shapeSrgb = node.querySelector('p\\:spPr a\\:solidFill a\\:srgbClr, spPr solidFill srgbClr');
                    if (shapeSrgb && shapeSrgb.getAttribute('val')) shapeBg = '#' + shapeSrgb.getAttribute('val');

                    let border = null;
                    const lnNode = node.querySelector('p\\:spPr a\\:ln, spPr ln');
                    if (lnNode) {
                        const lnSrgb = lnNode.querySelector('a\\:solidFill a\\:srgbClr, solidFill srgbClr');
                        const lnW = parseInt(lnNode.getAttribute('w') || '12700', 10);
                        const borderW = Math.max(1, Math.min(6, Math.round(lnW / 12700)));
                        if (lnSrgb && lnSrgb.getAttribute('val')) {
                            border = `${borderW}px solid #${lnSrgb.getAttribute('val')}`;
                        }
                    }

                    if (paragraphs.length > 0 || shapeBg !== 'transparent' || border) {
                        elements.push({
                            type: 'text',
                            id: id,
                            name: name,
                            left: leftPct,
                            top: topPct,
                            width: widthPct,
                            height: heightPct,
                            shapeBg: shapeBg,
                            border: border,
                            paragraphs: paragraphs,
                            anim: animTargets.get(id) || null
                        });
                    }
                }
            }

            // Derive title
            let slideTitle = `Slide ${i + 1}`;
            for (const el of elements) {
                if (el.type === 'text' && el.paragraphs.length > 0) {
                    const text = el.paragraphs[0].runs.map(r => r.text).join('').trim();
                    if (text) {
                        slideTitle = text;
                        break;
                    }
                }
            }

            this.pptxSlides.push({
                index: i + 1,
                title: slideTitle,
                bgColor: bgColor,
                transition: transitionType,
                transitionDir: transitionDir,
                autoAdvanceDelay: autoAdvanceDelay,
                animStepCount: animStepCount,
                elements: elements
            });
        }

        this.totalPages = this.pptxSlides.length;
        this.dom.pageTotal.textContent = this.totalPages;
        this.dom.pagePrefix.style.display = 'inline';
        this.dom.pagePrefix.textContent = 'Slide';
        this.dom.thumbsTitle.textContent = `Slides (${this.totalPages})`;

        // Show Present button in toolbar
        if (this.dom.presentBtn) {
            this.dom.presentBtn.style.display = 'inline-flex';
        }

        // Build left thumbnails with ACTUAL miniature scaled-down slide rendering
        this.dom.thumbsList.innerHTML = '';
        this.pptxSlides.forEach((s) => {
            const card = document.createElement('div');
            card.className = `thumb-card ${s.index === 1 ? 'active' : ''}`;
            card.dataset.page = s.index;

            const preview = document.createElement('div');
            preview.className = `slide-thumb-preview ${this.slideAspectRatio === '4/3' ? 'aspect-4-3' : ''}`;

            const miniStage = document.createElement('div');
            miniStage.className = 'slide-thumb-mini-stage';
            // Render actual slide elements into mini stage
            this.renderSlideDOM(s, miniStage, false, true);
            preview.appendChild(miniStage);

            const numSpan = document.createElement('span');
            numSpan.className = 'thumb-card-num';
            numSpan.textContent = `Slide ${s.index}`;

            card.appendChild(preview);
            card.appendChild(numSpan);

            card.onclick = () => this.showPptxSlide(s.index);
            this.dom.thumbsList.appendChild(card);
        });

        // Show first slide in normal viewer mode
        this.showPptxSlide(1);
    }

    showPptxSlide(slideNum) {
        if (!this.pptxSlides || slideNum < 1 || slideNum > this.pptxSlides.length) return;
        this.currentPage = slideNum;
        this.dom.pageInput.value = slideNum;
        this.updateActiveThumbnail(slideNum);

        const slide = this.pptxSlides[slideNum - 1];
        this.dom.contentStage.innerHTML = '';

        const container = document.createElement('div');
        container.className = 'pptx-stage-container';

        const stage = document.createElement('div');
        stage.className = `pptx-stage ${this.slideAspectRatio === '4/3' ? 'aspect-4-3' : ''}`;
        stage.style.backgroundColor = slide.bgColor || '#FFFFFF';

        // Render slide visual elements
        this.renderSlideDOM(slide, stage, false, false);

        container.appendChild(stage);
        this.dom.contentStage.appendChild(container);
    }

    renderSlideDOM(slide, stageEl, isSlideshow = false, isThumbnail = false) {
        stageEl.innerHTML = '';
        stageEl.style.backgroundColor = slide.bgColor || '#FFFFFF';

        if (!slide.elements || slide.elements.length === 0) {
            if (!isThumbnail) {
                const emptyEl = document.createElement('div');
                emptyEl.style.cssText = 'position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:18px; font-weight:600; color:#94A3B8; font-style:italic;';
                emptyEl.textContent = 'Empty slide';
                stageEl.appendChild(emptyEl);
            }
            // In thumbnail mode: genuine clean blank-slide preview matching slide.bgColor!
            return;
        }

        slide.elements.forEach(el => {
            const wrap = document.createElement('div');
            wrap.className = 'pptx-slide-element';
            wrap.dataset.spid = el.id;
            wrap.style.left = `${el.left}%`;
            wrap.style.top = `${el.top}%`;
            wrap.style.width = `${el.width}%`;
            wrap.style.height = `${el.height}%`;

            // Entrance animation handling in slideshow mode
            if (isSlideshow && el.anim) {
                wrap.classList.add('anim-initial-hidden');
                wrap.dataset.animStep = el.anim.step;
                wrap.dataset.animEffect = el.anim.effect;
                wrap.dataset.animFilter = el.anim.filter;
            }

            if (el.type === 'picture') {
                wrap.classList.add('pptx-slide-pic-shape');
                const img = document.createElement('img');
                img.src = el.imgSrc;
                img.alt = el.name || 'Slide graphic';
                wrap.appendChild(img);
            } else if (el.type === 'table') {
                wrap.classList.add('pptx-slide-table-shape');
                const tbl = document.createElement('table');
                tbl.className = 'pptx-table';
                tbl.style.cssText = 'width:100%; height:100%; border-collapse:collapse; font-size:12px; table-layout:fixed;';
                el.rows.forEach(r => {
                    const tr = document.createElement('tr');
                    r.forEach(c => {
                        const td = document.createElement('td');
                        td.textContent = c.text;
                        let cellStyle = 'border:1px solid #CBD5E1; padding:4px 6px; overflow:hidden; text-overflow:ellipsis;';
                        if (c.bg && c.bg !== 'transparent') cellStyle += ` background-color:${c.bg};`;
                        if (c.bold) cellStyle += ' font-weight:700;';
                        if (c.color) cellStyle += ` color:${c.color};`;
                        td.style.cssText = cellStyle;
                        tr.appendChild(td);
                    });
                    tbl.appendChild(tr);
                });
                wrap.appendChild(tbl);
            } else if (el.type === 'text') {
                wrap.classList.add('pptx-slide-text-shape');
                if (el.shapeBg && el.shapeBg !== 'transparent') {
                    wrap.style.backgroundColor = el.shapeBg;
                    wrap.style.padding = '8px';
                    wrap.style.borderRadius = '4px';
                }
                if (el.border) {
                    wrap.style.border = el.border;
                }

                el.paragraphs.forEach(p => {
                    const pEl = document.createElement('div');
                    pEl.className = `pptx-slide-text-p ${p.hasBullet ? 'bullet-item' : ''}`;
                    pEl.style.textAlign = p.align === 'ctr' ? 'center' : (p.align === 'r' ? 'right' : 'left');

                    p.runs.forEach(r => {
                        const span = document.createElement('span');
                        span.textContent = r.text;
                        span.style.fontSize = `${r.sz}pt`;
                        if (r.bold) span.style.fontWeight = '700';
                        if (r.italic) span.style.fontStyle = 'italic';
                        if (r.color) span.style.color = r.color;
                        pEl.appendChild(span);
                    });

                    wrap.appendChild(pEl);
                });
            }

            stageEl.appendChild(wrap);
        });
    }

    // =========================================================================
    // DEDICATED SLIDESHOW PRESENTATION ENGINE (Full fidelity animations & transitions)
    // =========================================================================
    startPresentation(fromSlide = null) {
        if (!this.pptxSlides || this.pptxSlides.length === 0) return;
        this.isPresentationActive = true;
        this.currentPage = fromSlide || this.currentPage || 1;

        if (this.dom.slideshowOverlay) {
            this.dom.slideshowOverlay.classList.add('is-active');
            this.dom.slideshowOverlay.style.display = 'flex';
        }

        if (this.dom.slideshowHud) {
            this.dom.slideshowHud.classList.remove('hud-hidden');
        }

        this.mountSlideshowSlide(this.currentPage, false);
        this.recomputeSlideshowDimensions();
    }

    recomputeSlideshowDimensions() {
        if (!this.isPresentationActive) return;
        const container = this.dom.slideshowStageContainer;
        const stage = this.dom.slideshowStage;
        if (!container || !stage) return;

        const rect = container.getBoundingClientRect();
        // Reserve comfortable padding so the slide never touches container bounds
        const padX = window.innerWidth <= 640 ? 16 : 36;
        const padY = window.innerWidth <= 640 ? 14 : 28;
        let availW = Math.max(120, (rect.width || window.innerWidth) - padX);
        let availH = Math.max(100, (rect.height || (window.innerHeight - 54)) - padY);

        const aspect = (this.slideAspectRatio === '4/3') ? (4 / 3) : (16 / 9);

        let targetW = availW;
        let targetH = targetW / aspect;

        if (targetH > availH) {
            targetH = availH;
            targetW = targetH * aspect;
        }

        stage.style.width = `${Math.floor(targetW)}px`;
        stage.style.height = `${Math.floor(targetH)}px`;
    }

    mountSlideshowSlide(slideNum, animateTransition = true) {
        if (!this.pptxSlides || slideNum < 1 || slideNum > this.pptxSlides.length) return;
        this.currentPage = slideNum;
        this.currentAnimStep = 0;

        if (this.autoAdvanceTimeout) {
            clearTimeout(this.autoAdvanceTimeout);
            this.autoAdvanceTimeout = null;
        }

        const slide = this.pptxSlides[slideNum - 1];
        const stage = this.dom.slideshowStage;
        if (!stage) return;

        // Reset stage classes & set aspect ratio
        stage.className = `doc-slideshow-stage ${this.slideAspectRatio === '4/3' ? 'aspect-4-3' : ''}`;
        stage.style.backgroundColor = slide.bgColor || '#FFFFFF';

        // Apply slide transition animation if requested
        if (animateTransition && slide.transition) {
            let transClass = `slide-transition-${slide.transition}`;
            if (slide.transition === 'push' && slide.transitionDir) {
                transClass = `slide-transition-push-${slide.transitionDir}`;
            }
            stage.classList.add(transClass);
            setTimeout(() => {
                stage.classList.remove(transClass);
            }, 600);
        }

        // Render slide DOM with animation hooks
        this.renderSlideDOM(slide, stage, true);

        // Fit slide into stage container cleanly
        this.recomputeSlideshowDimensions();

        // Update solid bottom toolbar Counter
        if (this.dom.ssCounter) {
            this.dom.ssCounter.textContent = `${slideNum} / ${this.totalPages}`;
        }

        // Update background thumbnails & page input to maintain sync
        this.dom.pageInput.value = slideNum;
        this.updateActiveThumbnail(slideNum);

        // Auto-advance timing if configured in the presentation
        if (slide.autoAdvanceDelay > 0) {
            this.autoAdvanceTimeout = setTimeout(() => {
                if (this.isPresentationActive) {
                    this.stepSlideshow(1);
                }
            }, slide.autoAdvanceDelay);
        }
    }

    stepSlideshow(direction) {
        if (!this.isPresentationActive || !this.pptxSlides) return;
        const currentSlide = this.pptxSlides[this.currentPage - 1];

        if (direction === 1) {
            // Check if there are unplayed animation steps on the current slide
            const remainingHidden = Array.from(this.dom.slideshowStage?.querySelectorAll('.anim-initial-hidden[data-anim-step]') || []);
            if (remainingHidden.length > 0) {
                const nextStepNum = Math.min(...remainingHidden.map(el => parseInt(el.dataset.animStep, 10) || 1));
                const hiddenStepEls = this.dom.slideshowStage?.querySelectorAll(`.anim-initial-hidden[data-anim-step="${nextStepNum}"]`);
                if (hiddenStepEls && hiddenStepEls.length > 0) {
                    hiddenStepEls.forEach(el => {
                        el.classList.remove('anim-initial-hidden');
                        const effect = el.dataset.animEffect || 'fade';
                        const filter = el.dataset.animFilter || 'bottom';

                        if (effect === 'fly') {
                            el.classList.add(`anim-fly-in-${filter}`);
                        } else if (effect === 'wipe') {
                            el.classList.add('anim-wipe-in');
                        } else if (effect === 'zoom') {
                            el.classList.add('anim-zoom-in');
                        } else if (effect === 'appear') {
                            el.classList.add('anim-appear');
                        } else {
                            el.classList.add('anim-fade-in');
                        }
                    });
                    this.currentAnimStep = nextStepNum;
                    return;
                }
            }

            // All animation steps played on this slide -> advance to next slide
            if (this.currentPage < this.totalPages) {
                this.goToSlideshowSlide(this.currentPage + 1);
            }
        } else if (direction === -1) {
            // Navigate to previous slide
            if (this.currentPage > 1) {
                this.goToSlideshowSlide(this.currentPage - 1);
            }
        }
    }

    goToSlideshowSlide(slideNum) {
        if (slideNum >= 1 && slideNum <= this.totalPages) {
            this.mountSlideshowSlide(slideNum, true);
        }
    }

    toggleSlideshowAutoPlay() {
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
            if (this.dom.ssPlayIcon) {
                this.dom.ssPlayIcon.innerHTML = `<polygon points="5 3 19 12 5 21 5 3"></polygon>`;
            }
            if (this.dom.ssPlayBtn) this.dom.ssPlayBtn.title = 'Start Auto-Play';
        } else {
            this.autoPlayInterval = setInterval(() => {
                if (this.currentPage >= this.totalPages && !this.dom.slideshowStage?.querySelector('.anim-initial-hidden')) {
                    this.toggleSlideshowAutoPlay();
                } else {
                    this.stepSlideshow(1);
                }
            }, 3500);

            if (this.dom.ssPlayIcon) {
                this.dom.ssPlayIcon.innerHTML = `<rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect>`;
            }
            if (this.dom.ssPlayBtn) this.dom.ssPlayBtn.title = 'Pause Auto-Play';
        }
    }

    showHudTemporarily() {
        // Dedicated bottom toolbar is fixed and solid, kept permanently visible
        if (!this.dom.slideshowHud) return;
        this.dom.slideshowHud.classList.remove('hud-hidden');
    }

    exitPresentation() {
        this.isPresentationActive = false;
        if (this.autoPlayInterval) {
            clearInterval(this.autoPlayInterval);
            this.autoPlayInterval = null;
        }
        if (this.autoAdvanceTimeout) {
            clearTimeout(this.autoAdvanceTimeout);
            this.autoAdvanceTimeout = null;
        }
        if (this.hudHideTimeout) {
            clearTimeout(this.hudHideTimeout);
            this.hudHideTimeout = null;
        }

        // Exit native browser fullscreen if presentation had entered fullscreen
        if (document.fullscreenElement === this.dom.slideshowOverlay || document.webkitFullscreenElement === this.dom.slideshowOverlay) {
            if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }

        if (this.dom.slideshowOverlay) {
            this.dom.slideshowOverlay.classList.remove('is-active');
            this.dom.slideshowOverlay.style.display = 'none';
        }

        // Restore normal PowerPoint viewer with current slide intact
        if (this.format === 'presentation') {
            this.showPptxSlide(this.currentPage);
        }
    }

    // =========================================================================
    // 5. TEXT RENDERER (Plain Text / Markdown / JSON)
    // =========================================================================
    renderText(arrayBuffer) {
        const textDecoder = new TextDecoder('utf-8');
        const text = textDecoder.decode(arrayBuffer);

        const pre = document.createElement('pre');
        pre.style.cssText = 'width:100%; max-width:850px; background:#FFF; border:1px solid var(--theme-border); border-radius:6px; padding:24px; font-family:var(--font-mono); font-size:13px; line-height:1.6; color:var(--theme-text); white-space:pre-wrap; box-shadow:0 4px 16px rgba(0,0,0,0.08);';
        pre.textContent = text;
        this.dom.contentStage.appendChild(pre);

        this.dom.thumbsTitle.textContent = 'Document';
        this.dom.thumbsList.innerHTML = `
            <div class="thumb-card active">
                <span style="font-size:32px;">📝</span>
                <span class="thumb-card-num">Text View</span>
            </div>
        `;
    }

    // =========================================================================
    // 6. FALLBACK & LEGACY UNSUPPORTED CARDS
    // =========================================================================
    renderLegacyUnsupported(title, desc) {
        this.dom.contentStage.innerHTML = `
            <div class="doc-unsupported-card">
                <div class="doc-unsupported-icon">📁</div>
                <div class="doc-unsupported-title">${this.escapeHtml(title)}</div>
                <div class="doc-unsupported-desc">${this.escapeHtml(desc)}</div>
                <button type="button" class="btn btn-primary" id="unsupportedDownloadBtn" style="padding:10px 22px; font-weight:700;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Download Original File
                </button>
            </div>
        `;
        document.getElementById('unsupportedDownloadBtn')?.addEventListener('click', () => this.downloadOriginal());
    }

    renderFallbackUnsupported(errorMessage) {
        const name = this.currentDoc?.filename || 'Document';
        this.dom.contentStage.innerHTML = `
            <div class="doc-unsupported-card">
                <div class="doc-unsupported-icon">⚠️</div>
                <div class="doc-unsupported-title">Preview Unavailable</div>
                <div class="doc-unsupported-desc">${this.escapeHtml(errorMessage)}. You can download the original file to view it on your device.</div>
                <button type="button" class="btn btn-primary" id="fallbackDownloadBtn" style="padding:10px 22px; font-weight:700;">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Download ${this.escapeHtml(name)}
                </button>
            </div>
        `;
        document.getElementById('fallbackDownloadBtn')?.addEventListener('click', () => this.downloadOriginal());
    }

    // =========================================================================
    // 7. TOOLBAR ACTIONS & NAVIGATION
    // =========================================================================
    navigatePage(delta) {
        const target = this.currentPage + delta;
        if (target >= 1 && target <= this.totalPages) {
            this.goToPage(target);
        }
    }

    goToPage(pageNum) {
        if (pageNum < 1 || pageNum > this.totalPages) return;
        this.currentPage = pageNum;
        this.dom.pageInput.value = pageNum;
        this.updateActiveThumbnail(pageNum);

        if (this.format === 'pdf') {
            const pageEl = document.getElementById(`pdfPageContainer-${pageNum}`);
            if (pageEl) {
                pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } else if (this.format === 'presentation') {
            this.showPptxSlide(pageNum);
        } else if (this.format === 'word') {
            const secEl = document.getElementById(`docxSection-${pageNum}`);
            if (secEl) {
                secEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    updateActiveThumbnail(pageNum) {
        this.dom.thumbsList.querySelectorAll('.thumb-card').forEach(el => {
            const isActive = parseInt(el.dataset.page, 10) === pageNum;
            el.classList.toggle('active', isActive);
            if (isActive) {
                try {
                    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } catch {}
            }
        });
    }

    toggleThumbnails(forceCollapse = null) {
        if (forceCollapse !== null) {
            this.thumbnailsCollapsed = forceCollapse;
        } else {
            this.thumbnailsCollapsed = !this.thumbnailsCollapsed;
        }
        this.dom.thumbsPanel.classList.toggle('collapsed', this.thumbnailsCollapsed);
        this.dom.toggleThumbsBtn.classList.toggle('active', !this.thumbnailsCollapsed);
    }

    adjustZoom(delta) {
        this.setZoom(this.zoom + delta);
    }

    setZoom(level) {
        this.zoom = Math.max(30, Math.min(300, level));
        this.dom.zoomLevel.textContent = `${this.zoom}%`;

        // Apply scale
        if (this.format === 'pdf') {
            const scaleFactor = this.zoom / 100;
            this.dom.contentStage.querySelectorAll('.pdf-page-container').forEach(container => {
                container.style.transform = `scale(${scaleFactor})`;
                container.style.transformOrigin = 'top center';
            });
        } else if (this.format === 'word') {
            this.applyWordZoom();
        } else if (this.format === 'presentation') {
            const stage = this.dom.contentStage.querySelector('.pptx-stage');
            if (stage) {
                stage.style.transform = `scale(${this.zoom / 100})`;
                stage.style.transformOrigin = 'center center';
            }
        } else if (this.format === 'excel') {
            const table = this.dom.contentStage.querySelector('.excel-table');
            if (table) {
                table.style.transform = `scale(${this.zoom / 100})`;
                table.style.transformOrigin = 'top left';
            }
        }
    }

    applyWordZoom() {
        const wrapper = this.dom.contentStage.querySelector('.docx-view-sheet-wrapper, .docx-wrapper, .docx-container');
        if (!wrapper) return;
        const scale = this.zoom / 100;
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            if (scale === 1) {
                wrapper.style.transform = '';
                wrapper.style.transformOrigin = '';
                wrapper.style.width = '100%';
            } else if (scale < 1) {
                // Zoom out (e.g. 75%)
                wrapper.style.transform = `scale(${scale})`;
                wrapper.style.transformOrigin = 'top center';
                wrapper.style.width = '100%';
            } else {
                // Zoom in (e.g. > 100%)
                wrapper.style.transform = `scale(${scale})`;
                wrapper.style.transformOrigin = 'top left';
                wrapper.style.width = `${100 / scale}%`;
            }
        } else {
            // Desktop
            if (scale === 1) {
                wrapper.style.transform = '';
                wrapper.style.transformOrigin = '';
                wrapper.style.width = '';
            } else {
                wrapper.style.transform = `scale(${scale})`;
                wrapper.style.transformOrigin = 'top center';
                wrapper.style.width = '';
            }
        }
    }

    toggleSearch(open = null) {
        this.searchState.isOpen = open !== null ? open : !this.searchState.isOpen;
        this.dom.searchBar.style.display = this.searchState.isOpen ? 'flex' : 'none';
        this.dom.searchToggleBtn?.classList.toggle('active', this.searchState.isOpen);
        if (this.searchState.isOpen) {
            this.dom.searchInput.focus();
            this.dom.searchInput.select();
        } else {
            this.clearSearchHighlights();
        }
    }

    performSearch(query) {
        this.searchState.query = query.trim().toLowerCase();
        this.clearSearchHighlights();
        if (!this.searchState.query) {
            this.dom.searchCount.textContent = '0 / 0';
            return;
        }

        this.searchState.matches = [];
        this.searchState.currentIdx = -1;

        if (this.format === 'excel') {
            const cells = this.dom.contentStage.querySelectorAll('.excel-td');
            cells.forEach(td => {
                const text = (td.textContent || '').toLowerCase();
                if (text.includes(this.searchState.query)) {
                    td.classList.add('search-match');
                    this.searchState.matches.push(td);
                }
            });
        } else {
            // General text search
            const walkTextNodes = (node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                    const text = node.textContent;
                    const idx = text.toLowerCase().indexOf(this.searchState.query);
                    if (idx !== -1 && node.parentElement) {
                        this.searchState.matches.push(node.parentElement);
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE && node.childNodes) {
                    node.childNodes.forEach(walkTextNodes);
                }
            };
            walkTextNodes(this.dom.contentStage);
        }

        const total = this.searchState.matches.length;
        this.dom.searchCount.textContent = total > 0 ? `1 / ${total}` : '0 / 0';
        if (total > 0) {
            this.searchNavigate(1);
        }
    }

    searchNavigate(direction) {
        const total = this.searchState.matches.length;
        if (total === 0) return;

        this.searchState.currentIdx = (this.searchState.currentIdx + direction + total) % total;
        this.dom.searchCount.textContent = `${this.searchState.currentIdx + 1} / ${total}`;

        const activeEl = this.searchState.matches[this.searchState.currentIdx];
        if (activeEl) {
            activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (activeEl.classList.contains('excel-td')) {
                activeEl.click();
            }
        }
    }

    clearSearchHighlights() {
        this.dom.contentStage.querySelectorAll('.search-match').forEach(el => el.classList.remove('search-match'));
    }

    downloadOriginal() {
        if (!this.currentDoc) return;
        const url = this.currentDoc.viewUrl;
        const name = this.currentDoc.filename || 'document';

        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    printDocument() {
        window.print();
    }

    isFullscreen() {
        return Boolean(
            this.isFullscreenActive ||
            (this.dom.viewer && this.dom.viewer.classList.contains('is-fullscreen')) ||
            document.fullscreenElement === this.dom.viewer ||
            document.webkitFullscreenElement === this.dom.viewer
        );
    }

    setFullscreenState(isFs) {
        this.isFullscreenActive = isFs;
        if (!this.dom.viewer) return;

        // Preserve scroll position across mode transitions
        const prevScrollTop = this.dom.viewport ? this.dom.viewport.scrollTop : 0;
        const prevScrollLeft = this.dom.viewport ? this.dom.viewport.scrollLeft : 0;

        this.dom.viewer.classList.toggle('is-fullscreen', isFs);
        document.body.classList.toggle('doc-viewer-fullscreen-active', isFs);

        // Update Fullscreen button icon and title
        if (this.dom.fullscreenToolBtn) {
            this.dom.fullscreenToolBtn.classList.toggle('active', isFs);
            if (isFs) {
                this.dom.fullscreenToolBtn.title = 'Exit Full Screen (Esc)';
                this.dom.fullscreenToolBtn.setAttribute('aria-label', 'Exit Full Screen');
                this.dom.fullscreenToolBtn.innerHTML = `
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>
                    </svg>
                `;
            } else {
                this.dom.fullscreenToolBtn.title = 'Full Screen';
                this.dom.fullscreenToolBtn.setAttribute('aria-label', 'Full Screen');
                this.dom.fullscreenToolBtn.innerHTML = `
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                    </svg>
                `;
            }
        }

        // Restore viewport scroll position
        if (this.dom.viewport) {
            requestAnimationFrame(() => {
                this.dom.viewport.scrollTop = prevScrollTop;
                this.dom.viewport.scrollLeft = prevScrollLeft;
            });
        }
    }

    async toggleFullscreen(force = null) {
        if (this.isPresentationActive) {
            const isOverlayFs = Boolean(
                document.fullscreenElement === this.dom.slideshowOverlay ||
                document.webkitFullscreenElement === this.dom.slideshowOverlay
            );
            const shouldBeFullscreen = force !== null ? force : !isOverlayFs;
            try {
                if (shouldBeFullscreen) {
                    const elem = this.dom.slideshowOverlay;
                    if (elem && elem.requestFullscreen) {
                        await elem.requestFullscreen().catch(() => {});
                    } else if (elem && elem.webkitRequestFullscreen) {
                        elem.webkitRequestFullscreen();
                    }
                } else {
                    if (document.fullscreenElement || document.webkitFullscreenElement) {
                        if (document.exitFullscreen) {
                            await document.exitFullscreen().catch(() => {});
                        } else if (document.webkitExitFullscreen) {
                            document.webkitExitFullscreen();
                        }
                    }
                }
            } catch (err) {
                console.warn('[InChatDocViewer] Slideshow Fullscreen API note:', err);
            }
            setTimeout(() => this.recomputeSlideshowDimensions(), 80);
            return;
        }

        const shouldBeFullscreen = force !== null ? force : !this.isFullscreen();
        this.setFullscreenState(shouldBeFullscreen);

        // Native Browser Fullscreen API with graceful fallback
        try {
            if (shouldBeFullscreen) {
                const elem = this.dom.viewer;
                const hasNativeFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
                if (!hasNativeFs && elem) {
                    if (elem.requestFullscreen) {
                        await elem.requestFullscreen().catch(() => {});
                    } else if (elem.webkitRequestFullscreen) {
                        elem.webkitRequestFullscreen();
                    }
                }
            } else {
                const hasNativeFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
                if (hasNativeFs) {
                    if (document.exitFullscreen) {
                        await document.exitFullscreen().catch(() => {});
                    } else if (document.webkitExitFullscreen) {
                        document.webkitExitFullscreen();
                    }
                }
            }
        } catch (err) {
            console.warn('[InChatDocViewer] Native Fullscreen API handled via CSS fallback:', err);
        }
    }

    handleFullscreenChange() {
        if (this.isPresentationActive) {
            this.recomputeSlideshowDimensions();
            const isOverlayFs = Boolean(
                document.fullscreenElement === this.dom.slideshowOverlay ||
                document.webkitFullscreenElement === this.dom.slideshowOverlay
            );
            if (this.dom.ssFsBtn) {
                this.dom.ssFsBtn.title = isOverlayFs ? 'Exit Fullscreen' : 'Toggle Fullscreen';
            }
            return;
        }

        const isNativeFs = Boolean(
            document.fullscreenElement === this.dom.viewer ||
            document.webkitFullscreenElement === this.dom.viewer
        );
        const anyFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
        if (!anyFs && this.isFullscreenActive) {
            // User exited via native browser Esc key
            this.setFullscreenState(false);
        } else if (isNativeFs && !this.isFullscreenActive) {
            this.setFullscreenState(true);
        }
    }

    closeOverflowDropdown() {
        if (this.dom.moreActionsDropdown) {
            this.dom.moreActionsDropdown.style.display = 'none';
            this.dom.moreActionsBtn?.setAttribute('aria-expanded', 'false');
        }
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
}

// Global Singleton Instance
window.inChatDocViewer = new InChatDocViewer();
