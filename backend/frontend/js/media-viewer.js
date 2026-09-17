/* -------------------------------------------------------------------------
   FRANK - IN-APP MEDIA VIEWER & FULL-SCREEN PLAYER
   Zero new tabs, zero page reloads, zero WebSocket interruptions.
   Supports: Photos, Videos, Documents (PDF/TXT), and Files with Zoom & Download.
   ------------------------------------------------------------------------- */

class MediaViewerController {
    constructor() {
        this.isOpen = false;
        this.currentMedia = null; // { fileId, fileType, filename, timeStr, url }
        this.zoomLevel = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;

        this.dom = {
            container: null,
            backBtn: null,
            closeBtn: null,
            downloadBtn: null,
            zoomInBtn: null,
            zoomOutBtn: null,
            zoomResetBtn: null,
            filename: null,
            meta: null,
            stage: null,
            content: null,
            loading: null,
            error: null
        };
    }

    init() {
        this.ensureDom();
        this.bindEvents();
    }

    ensureDom() {
        let container = document.getElementById('frankMediaViewer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'frankMediaViewer';
            container.className = 'frank-media-viewer';
            container.setAttribute('role', 'dialog');
            container.setAttribute('aria-modal', 'true');
            container.setAttribute('aria-label', 'Media Viewer');

            container.innerHTML = `
                <!-- Header Controls -->
                <header class="media-viewer-header">
                    <button type="button" class="media-viewer-back-btn" id="mvBackBtn" aria-label="Back to chat">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="19" y1="12" x2="5" y2="12"></line>
                            <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                        <span>Back</span>
                    </button>

                    <div class="media-viewer-title-box">
                        <div class="media-viewer-filename" id="mvFilename">Media File</div>
                        <div class="media-viewer-meta" id="mvMeta"></div>
                    </div>

                    <div class="media-viewer-controls">
                        <button type="button" class="media-viewer-btn zoom-control" id="mvZoomOutBtn" title="Zoom Out" aria-label="Zoom Out">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                <line x1="8" y1="11" x2="14" y2="11"></line>
                            </svg>
                        </button>
                        <button type="button" class="media-viewer-btn zoom-control" id="mvZoomResetBtn" title="Reset Zoom" aria-label="Reset Zoom">
                            <span style="font-size:11px; font-weight:700;">1:1</span>
                        </button>
                        <button type="button" class="media-viewer-btn zoom-control" id="mvZoomInBtn" title="Zoom In" aria-label="Zoom In">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                                <line x1="11" y1="8" x2="11" y2="14"></line>
                                <line x1="8" y1="11" x2="14" y2="11"></line>
                            </svg>
                        </button>
                        <button type="button" class="media-viewer-btn download-control" id="mvDownloadBtn" title="Download media" aria-label="Download media">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                <polyline points="7 10 12 15 17 10"></polyline>
                                <line x1="12" y1="15" x2="12" y2="3"></line>
                            </svg>
                            <span class="btn-text" style="margin-left:4px;">Download</span>
                        </button>
                        <button type="button" class="media-viewer-btn btn-close" id="mvCloseBtn" title="Close media viewer (Esc)" aria-label="Close media viewer">
                            ✕
                        </button>
                    </div>
                </header>

                <!-- Stage Viewing Canvas -->
                <main class="media-viewer-stage" id="mvStage">
                    <div class="media-viewer-loading" id="mvLoading" style="display:none;">
                        <div class="spinner" style="width:32px; height:32px; border-width:3px;"></div>
                        <div style="margin-top:10px; font-size:13px; font-weight:600;">Loading media...</div>
                    </div>

                    <div class="media-viewer-error" id="mvError" style="display:none;">
                        <div style="font-size:36px; margin-bottom:4px;">⚠️</div>
                        <div style="font-size:16px; font-weight:700;">Unable to load media.</div>
                        <div style="font-size:13px; color:rgba(255,255,255,0.7); max-width:320px; text-align:center;">
                            The file could not be loaded or you may not have access.
                        </div>
                        <div style="margin-top:14px; display:flex; gap:10px;">
                            <button type="button" class="media-viewer-btn" id="mvRetryBtn">Try Again</button>
                            <button type="button" class="media-viewer-btn" id="mvErrorBackBtn">← Back</button>
                        </div>
                    </div>

                    <div class="media-viewer-content" id="mvContent"></div>
                </main>
            `;

            document.body.appendChild(container);
        }

        this.dom = {
            container,
            backBtn: document.getElementById('mvBackBtn'),
            closeBtn: document.getElementById('mvCloseBtn'),
            downloadBtn: document.getElementById('mvDownloadBtn'),
            zoomInBtn: document.getElementById('mvZoomInBtn'),
            zoomOutBtn: document.getElementById('mvZoomOutBtn'),
            zoomResetBtn: document.getElementById('mvZoomResetBtn'),
            filename: document.getElementById('mvFilename'),
            meta: document.getElementById('mvMeta'),
            stage: document.getElementById('mvStage'),
            content: document.getElementById('mvContent'),
            loading: document.getElementById('mvLoading'),
            error: document.getElementById('mvError')
        };
    }

    bindEvents() {
        this.dom.backBtn?.addEventListener('click', () => this.close());
        this.dom.closeBtn?.addEventListener('click', () => this.close());
        document.getElementById('mvErrorBackBtn')?.addEventListener('click', () => this.close());
        document.getElementById('mvRetryBtn')?.addEventListener('click', () => {
            if (this.currentMedia) this.renderMediaContent(this.currentMedia);
        });

        this.dom.downloadBtn?.addEventListener('click', () => this.downloadCurrent());

        this.dom.zoomInBtn?.addEventListener('click', () => this.zoom(0.3));
        this.dom.zoomOutBtn?.addEventListener('click', () => this.zoom(-0.3));
        this.dom.zoomResetBtn?.addEventListener('click', () => this.resetZoom());

        // Keyboard navigation (Escape closes, + / - zooms)
        window.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                this.close();
            } else if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                this.zoom(0.25);
            } else if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                this.zoom(-0.25);
            } else if (e.key === '0') {
                e.preventDefault();
                this.resetZoom();
            }
        });

        // Browser history popstate handler for smooth Back button support
        window.addEventListener('popstate', (e) => {
            if (this.isOpen) {
                this.close(false); // don't call history.back again
            }
        });

        // Pan / drag image when zoomed
        this.dom.stage?.addEventListener('mousedown', (e) => {
            const img = this.dom.content?.querySelector('.media-viewer-img');
            if (!img || this.zoomLevel <= 1.0) return;
            this.isDragging = true;
            this.startX = e.clientX - this.panX;
            this.startY = e.clientY - this.panY;
            img.style.cursor = 'grabbing';
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            this.panX = e.clientX - this.startX;
            this.panY = e.clientY - this.startY;
            this.applyTransform();
        });

        window.addEventListener('mouseup', () => {
            if (!this.isDragging) return;
            this.isDragging = false;
            const img = this.dom.content?.querySelector('.media-viewer-img');
            if (img) img.style.cursor = this.zoomLevel > 1.0 ? 'grab' : 'default';
        });
    }

    // ---------------- OPEN MEDIA VIEWER ----------------
    open(media) {
        if (!media) return;
        this.ensureDom();

        this.currentMedia = media;
        this.isOpen = true;
        this.resetZoomState();

        // Update history state for seamless native browser Back support
        try {
            history.pushState({ frankMediaViewer: true }, '', '#media-viewer');
        } catch (e) {}

        // Update Header Titles
        if (this.dom.filename) {
            this.dom.filename.textContent = media.filename || 'Media View';
            this.dom.filename.title = media.filename || 'Media View';
        }

        if (this.dom.meta) {
            const timeInfo = media.timeStr ? `• ${media.timeStr}` : '';
            const typeInfo = (media.fileType || 'file').toUpperCase();
            this.dom.meta.textContent = `${typeInfo} ${timeInfo}`.trim();
        }

        // Toggle zoom controls visibility (only relevant for images)
        const isImage = media.fileType === 'image';
        document.querySelectorAll('.zoom-control').forEach(el => {
            el.style.display = isImage ? 'inline-flex' : 'none';
        });

        // Show Container
        this.dom.container.style.display = 'flex';
        this.dom.container.classList.add('active');
        document.body.classList.add('media-viewer-open');

        // Render Media Inside Stage
        this.renderMediaContent(media);

        // Accessibility focus
        this.dom.backBtn?.focus();
    }

    renderMediaContent(media) {
        if (!this.dom.content) return;
        this.dom.content.innerHTML = '';
        this.dom.error.style.display = 'none';
        this.dom.loading.style.display = 'flex';

        const fileId = media.fileId;
        const fileType = media.fileType || 'document';
        const filename = media.filename || 'file';
        const url = media.url || (fileId ? api.getFileViewUrl(fileId) : '');

        if (!url) {
            this.showError();
            return;
        }

        if (fileType === 'image') {
            const img = document.createElement('img');
            img.className = 'media-viewer-img';
            img.alt = filename;
            img.onload = () => {
                this.dom.loading.style.display = 'none';
            };
            img.onerror = () => {
                this.showError();
            };
            img.src = url;
            this.dom.content.appendChild(img);

        } else if (fileType === 'video') {
            const video = document.createElement('video');
            video.className = 'media-viewer-video';
            video.controls = true;
            video.playsInline = true;
            video.autoplay = true;
            video.preload = 'auto';

            video.onloadeddata = () => {
                this.dom.loading.style.display = 'none';
            };
            video.onerror = () => {
                this.showError();
            };

            const source = document.createElement('source');
            source.src = url;
            video.appendChild(source);
            this.dom.content.appendChild(video);

        } else if (fileType === 'pdf' || (filename.toLowerCase().endsWith('.pdf') || filename.toLowerCase().endsWith('.txt'))) {
            // Embedded document preview for PDF/TXT
            const iframe = document.createElement('iframe');
            iframe.style.width = 'min(90vw, 920px)';
            iframe.style.height = 'min(80vh, 760px)';
            iframe.style.border = 'none';
            iframe.style.borderRadius = '12px';
            iframe.style.background = '#ffffff';
            iframe.style.boxShadow = '0 20px 50px rgba(0,0,0,0.6)';

            iframe.onload = () => {
                this.dom.loading.style.display = 'none';
            };
            iframe.onerror = () => {
                this.showError();
            };
            iframe.src = `${url}#toolbar=0`;
            this.dom.content.appendChild(iframe);

        } else {
            // Clean fallback file card for docx, xlsx, zip, etc.
            this.dom.loading.style.display = 'none';
            const ext = filename.split('.').pop().toUpperCase();

            const card = document.createElement('div');
            card.className = 'media-viewer-fallback-card';
            card.innerHTML = `
                <div style="font-size: 54px; margin-bottom: 14px;">📄</div>
                <div style="font-size: 18px; font-weight: 700; margin-bottom: 8px; word-break: break-all;">${this.escapeHTML(filename)}</div>
                <div style="font-size: 14px; color: rgba(255,255,255,0.8); margin-bottom: 22px; line-height: 1.5;">Preview unavailable<br>for this file type.</div>
                <button type="button" class="btn btn-primary btn-large" style="width: 100%; max-width: 260px; justify-content: center; gap: 8px; margin: 0 auto;" onclick="window.mediaViewer.downloadCurrent()">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    Download
                </button>
            `;
            this.dom.content.appendChild(card);
        }
    }

    showError() {
        if (this.dom.loading) this.dom.loading.style.display = 'none';
        if (this.dom.content) this.dom.content.innerHTML = '';
        if (this.dom.error) this.dom.error.style.display = 'flex';
    }

    // ---------------- ZOOM CONTROLS ----------------
    zoom(delta) {
        if (!this.isOpen || !this.currentMedia || this.currentMedia.fileType !== 'image') return;
        const newZoom = Math.min(3.5, Math.max(1.0, this.zoomLevel + delta));
        if (newZoom === this.zoomLevel) return;
        this.zoomLevel = newZoom;
        if (this.zoomLevel === 1.0) {
            this.panX = 0;
            this.panY = 0;
        }
        this.applyTransform();
    }

    resetZoom() {
        this.resetZoomState();
        this.applyTransform();
    }

    resetZoomState() {
        this.zoomLevel = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.isDragging = false;
    }

    applyTransform() {
        const img = this.dom.content?.querySelector('.media-viewer-img');
        if (!img) return;
        img.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
        img.classList.toggle('zoomed', this.zoomLevel > 1.0);
    }

    // ---------------- DOWNLOAD ----------------
    downloadCurrent() {
        if (!this.currentMedia) return;
        const fileId = this.currentMedia.fileId;
        const filename = this.currentMedia.filename || 'media';

        if (fileId && api.downloadFileBlob) {
            api.downloadFileBlob(fileId, filename);
            return;
        }

        if (window.documentsController && fileId) {
            window.documentsController.downloadDocument(fileId, filename);
        } else {
            const url = this.currentMedia.url || (fileId ? api.getFileDownloadUrl(fileId) : '');
            if (!url) return;
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showToast(`Downloading ${filename}...`, 'info', 1800);
        }
    }

    // ---------------- CLOSE MEDIA VIEWER ----------------
    close(triggerBack = true) {
        if (!this.isOpen) return;

        // Pause any playing videos or audios inside stage
        this.dom.content?.querySelectorAll('video, audio').forEach(el => {
            try { el.pause(); } catch (e) {}
        });

        this.isOpen = false;
        this.resetZoomState();

        if (this.dom.container) {
            this.dom.container.classList.remove('active');
            this.dom.container.style.display = 'none';
        }
        if (this.dom.content) {
            this.dom.content.innerHTML = '';
        }
        document.body.classList.remove('media-viewer-open');

        // Handle history state cleanly
        if (triggerBack && history.state && history.state.frankMediaViewer) {
            try {
                history.back();
            } catch (e) {}
        }

        // Return focus to chat composer or active message list smoothly
        document.getElementById('messageInput')?.focus();
    }

    // Helper invoked from image click in message stream
    openFromMessage(el) {
        if (!el) return;
        const fileId = parseInt(el.dataset.fileId, 10);
        const fileType = el.dataset.fileType || 'image';
        const filename = el.dataset.filename || el.getAttribute('alt') || 'Photo';
        const timeStr = el.dataset.time || '';
        const url = el.getAttribute('src') || (fileId ? api.getFileViewUrl(fileId) : '');

        this.open({
            fileId,
            fileType,
            filename,
            timeStr,
            url
        });
    }

    // Helper invoked from "Open Document" button or shared files drawer
    openDocument(fileId, fileType, originalFilename, timeStr = '') {
        if (!fileId) return;
        const url = api.getFileViewUrl(fileId);
        this.open({
            fileId,
            fileType,
            filename: originalFilename || 'Document',
            timeStr,
            url
        });
    }

    escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global singleton instance
window.mediaViewer = new MediaViewerController();

document.addEventListener('DOMContentLoaded', () => {
    window.mediaViewer.init();
});
