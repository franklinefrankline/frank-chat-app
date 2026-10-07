/* -------------------------------------------------------------------------
   FRANK - DEDICATED DOCUMENT, PHOTO & VIDEO SHARING MODULE
   Direct Native OS File Picker triggers, client-side validation,
   composer attachment staging tray with previews, real XHR upload progress,
   cancellation, and authenticated viewer / downloader.
   ------------------------------------------------------------------------- */

class DocumentsController {
    constructor() {
        this.selectedFile = null;
        this.stagedPreviewUrl = null;
        this.currentUploadXhr = null;
        this.isUploading = false;

        this.disallowedExtensions = [
            '.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi', '.dll', '.com',
            '.scr', '.vbs', '.py', '.js', '.php', '.phtml', '.jar', '.app'
        ];

        this.dom = {
            photoInput: document.getElementById('frankPhotoInput'),
            docInput: document.getElementById('frankDocInput'),
            videoInput: document.getElementById('frankVideoInput'),
            audioInput: document.getElementById('frankAudioInput'),
            attachmentPopover: document.getElementById('attachmentPopover'),
            attachmentBtn: document.getElementById('attachmentBtn'),
            desktopQuickPhotoBtn: document.getElementById('desktopQuickPhotoBtn'),
            cancelMenuBtn: document.getElementById('cancelAttachmentMenuBtn'),
            tray: document.getElementById('composerAttachmentTray'),
            trayPreviewWrap: document.getElementById('trayPreviewWrap'),
            trayFilename: document.getElementById('trayFilename'),
            trayMeta: document.getElementById('trayMeta'),
            trayProgressWrap: document.getElementById('trayProgressWrap'),
            trayProgressBar: document.getElementById('trayProgressBar'),
            trayProgressText: document.getElementById('trayProgressText'),
            trayCancelBtn: document.getElementById('trayCancelBtn'),
            traySendBtn: document.getElementById('traySendBtn'),
            trayCancelUploadBtn: document.getElementById('trayCancelUploadBtn'),
            trayRemoveBtn: document.getElementById('trayRemoveBtn'),
            viewerModal: document.getElementById('attachmentViewerModal'),
            viewerTitle: document.getElementById('attachmentViewerTitle'),
            viewerIcon: document.getElementById('attachmentViewerIcon'),
            viewerBody: document.getElementById('attachmentViewerBody'),
            viewerDownloadBtn: document.getElementById('attachmentViewerDownloadBtn'),
            closeViewerBtn: document.getElementById('closeAttachmentViewerBtn')
        };

        this.init();
    }

    init() {
        this.bindNativeInputs();
        this.bindMenuTriggers();
        this.bindTrayControls();
        this.bindViewerModal();
    }

    bindViewerModal() {
        this.dom.closeViewerBtn?.addEventListener('click', () => this.closeViewerModal());
        this.dom.viewerModal?.addEventListener('click', (e) => {
            if (e.target === this.dom.viewerModal) {
                this.closeViewerModal();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.dom.viewerModal && this.dom.viewerModal.style.display !== 'none') {
                this.closeViewerModal();
            }
        });
    }

    closeViewerModal() {
        if (window.frankOfficeWorkspace) {
            window.frankOfficeWorkspace.closeWorkspace();
        }
        if (typeof closeModal === 'function') {
            closeModal('attachmentViewerModal');
        }
        if (this.dom.viewerModal) {
            this.dom.viewerModal.classList.remove('open', 'active');
            this.dom.viewerModal.style.display = 'none';
            this.dom.viewerModal.style.visibility = 'hidden';
            this.dom.viewerModal.style.opacity = '0';
            if (this.dom.viewerBody) {
                const vid = this.dom.viewerBody.querySelector('video');
                if (vid) {
                    vid.pause();
                    vid.src = '';
                }
                this.dom.viewerBody.innerHTML = '';
            }
        }
    }

    openDocument(fileId, fileType, filename, directUrl) {
        const validFileId = (fileId && !isNaN(fileId) && parseInt(fileId, 10) > 0) ? parseInt(fileId, 10) : null;
        if (!validFileId && !directUrl && !filename) {
            console.warn('>>> [DOCUMENTS] openDocument called without valid fileId or directUrl');
            return;
        }

        if (!window.frankOfficeWorkspace && typeof FrankOfficeWorkspace !== 'undefined') {
            window.frankOfficeWorkspace = new FrankOfficeWorkspace();
        }

        if (window.frankOfficeWorkspace) {
            window.frankOfficeWorkspace.openDocument(validFileId, fileType, filename, directUrl);
            return;
        }

        const modal = this.dom.viewerModal || document.getElementById('attachmentViewerModal');
        if (!modal) {
            if (directUrl) window.open(directUrl, '_blank');
            return;
        }

        const closeBtn = this.dom.closeViewerBtn || modal.querySelector('#closeAttachmentViewerBtn') || document.getElementById('closeAttachmentViewerBtn');
        if (closeBtn) {
            closeBtn.onclick = () => this.closeViewerModal();
        }

        const token = api.getToken();
        const viewUrl = validFileId ? api.getFileViewUrl(validFileId) : directUrl;
        const filenameClean = filename || 'Document';
        const ext = (filenameClean.split('.').pop() || '').toLowerCase();

        // Accurately determine effective category from extension
        let effectiveType = fileType;
        if (ext === 'pdf') {
            effectiveType = 'pdf';
        } else if (ext === 'csv') {
            effectiveType = 'csv';
        } else if (['txt', 'text', 'md', 'markdown', 'json', 'log', 'xml', 'yaml', 'yml'].includes(ext)) {
            effectiveType = 'text';
        } else if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
            effectiveType = 'image';
        } else if (['mp4', 'mov', 'webm', 'mkv'].includes(ext)) {
            effectiveType = 'video';
        } else if (['mp3', 'wav', 'ogg', 'm4a', 'aac', 'opus', 'weba'].includes(ext)) {
            effectiveType = 'audio';
        } else if (['doc', 'docx'].includes(ext)) {
            effectiveType = 'word';
        } else if (['xls', 'xlsx'].includes(ext)) {
            effectiveType = 'excel';
        } else if (['ppt', 'pptx'].includes(ext)) {
            effectiveType = 'presentation';
        } else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
            effectiveType = 'archive';
        }

        const titleEl = this.dom.viewerTitle || modal.querySelector('#attachmentViewerTitle');
        if (titleEl) titleEl.textContent = filenameClean;

        const downloadBtn = this.dom.viewerDownloadBtn || modal.querySelector('#attachmentViewerDownloadBtn');
        if (downloadBtn) {
            downloadBtn.style.display = 'inline-flex';
            downloadBtn.onclick = () => this.downloadDocument(validFileId, filenameClean, directUrl);
        }

        const iconEl = this.dom.viewerIcon || modal.querySelector('#attachmentViewerIcon');
        if (iconEl) {
            if (effectiveType === 'image') iconEl.textContent = '🖼️';
            else if (effectiveType === 'video') iconEl.textContent = '🎥';
            else if (effectiveType === 'audio') iconEl.textContent = '🎵';
            else if (effectiveType === 'pdf') iconEl.textContent = '📕';
            else if (effectiveType === 'csv' || effectiveType === 'excel') iconEl.textContent = '📊';
            else if (effectiveType === 'word') iconEl.textContent = '📘';
            else if (effectiveType === 'presentation') iconEl.textContent = '📽️';
            else if (effectiveType === 'text') iconEl.textContent = '📝';
            else if (effectiveType === 'archive') iconEl.textContent = '📦';
            else iconEl.textContent = '📄';
        }

        const bodyEl = this.dom.viewerBody || modal.querySelector('#attachmentViewerBody');
        if (bodyEl) {
            bodyEl.innerHTML = '';

            if (effectiveType === 'image') {
                const img = document.createElement('img');
                img.src = viewUrl;
                img.alt = filenameClean;
                img.style.maxWidth = '100%';
                img.style.maxHeight = 'calc(90vh - 100px)';
                img.style.objectFit = 'contain';
                img.style.borderRadius = 'var(--radius-md)';
                bodyEl.appendChild(img);
            } else if (effectiveType === 'video') {
                const video = document.createElement('video');
                video.src = viewUrl;
                video.controls = true;
                video.autoplay = true;
                video.style.maxWidth = '100%';
                video.style.maxHeight = 'calc(90vh - 100px)';
                video.style.borderRadius = 'var(--radius-md)';
                bodyEl.appendChild(video);
            } else if (effectiveType === 'audio') {
                const audioWrap = document.createElement('div');
                audioWrap.style.textAlign = 'center';
                audioWrap.style.padding = '30px 20px';
                audioWrap.style.width = '100%';
                const safeName = typeof messagesModule !== 'undefined' ? messagesModule.escapeHTML(filenameClean) : filenameClean;
                audioWrap.innerHTML = `
                    <div style="font-size: 56px; margin-bottom: 16px;">🎵</div>
                    <div style="font-size: 16px; font-weight: 700; color: var(--text); margin-bottom: 6px;">${safeName}</div>
                    <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 24px;">Audio message / recording playback</div>
                    <audio controls autoplay style="width: 100%; max-width: 480px; margin: 0 auto; display: block;" src="${viewUrl}"></audio>
                `;
                bodyEl.appendChild(audioWrap);
            } else if (effectiveType === 'pdf') {
                const iframe = document.createElement('iframe');
                iframe.src = viewUrl;
                iframe.style.width = '100%';
                iframe.style.height = 'calc(90vh - 100px)';
                iframe.style.border = 'none';
                iframe.style.borderRadius = 'var(--radius-md)';
                iframe.title = filenameClean;
                bodyEl.appendChild(iframe);
            } else if (effectiveType === 'csv') {
                const container = document.createElement('div');
                container.style.cssText = 'display:flex; flex-direction:column; height:calc(90vh - 100px); width:100%; overflow:hidden;';
                container.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding: 0 4px;">
                        <span id="csvStatusInfo" style="font-size:12px; color:var(--text-muted); font-weight:600;">Loading CSV table...</span>
                        <button type="button" class="btn btn-sm btn-secondary" id="toggleCsvModeBtn" style="font-size:11px; padding:4px 10px;">Show Raw Text</button>
                    </div>
                    <div id="csvTableWrapper" style="flex:1; overflow:auto; border:1px solid var(--border); border-radius:var(--radius-md); background:var(--surface);">
                        <table id="csvDataTable" style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;"></table>
                    </div>
                    <pre id="csvRawText" style="display:none; flex:1; overflow:auto; margin:0; padding:14px; background:var(--surface-elevated); border:1px solid var(--border); border-radius:var(--radius-md); font-family:monospace; font-size:12px; line-height:1.5; color:var(--text); white-space:pre;"></pre>
                `;
                bodyEl.appendChild(container);

                fetch(viewUrl)
                    .then(r => {
                        if (!r.ok) throw new Error(`HTTP ${r.status}`);
                        return r.text();
                    })
                    .then(csvText => {
                        const statusEl = container.querySelector('#csvStatusInfo');
                        const tableEl = container.querySelector('#csvDataTable');
                        const rawPre = container.querySelector('#csvRawText');
                        const toggleBtn = container.querySelector('#toggleCsvModeBtn');

                        if (rawPre) rawPre.textContent = csvText;

                        // Simple robust CSV parser
                        const parseRows = (text) => {
                            const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
                            return lines.map(line => {
                                const row = [];
                                let inside = false;
                                let cur = '';
                                for (let i = 0; i < line.length; i++) {
                                    const c = line[i];
                                    if (c === '"') inside = !inside;
                                    else if (c === ',' && !inside) { row.push(cur.trim()); cur = ''; }
                                    else cur += c;
                                }
                                row.push(cur.trim());
                                return row;
                            });
                        };

                        const rows = parseRows(csvText);
                        if (statusEl) statusEl.textContent = `${rows.length} rows loaded`;

                        if (tableEl && rows.length > 0) {
                            const headerCols = rows[0];
                            let theadHtml = '<thead style="background:var(--surface-elevated); position:sticky; top:0; z-index:1; border-bottom:2px solid var(--border);"><tr>';
                            theadHtml += '<th style="padding:8px 10px; font-weight:700; color:var(--text-muted); border-bottom:1px solid var(--border); width:36px; text-align:center;">#</th>';
                            headerCols.forEach(col => {
                                const safe = typeof messagesModule !== 'undefined' ? messagesModule.escapeHTML(col) : col;
                                theadHtml += `<th style="padding:8px 10px; font-weight:700; color:var(--text); border-bottom:1px solid var(--border); border-right:1px solid var(--border-light, rgba(255,255,255,0.06));">${safe}</th>`;
                            });
                            theadHtml += '</tr></thead>';

                            let tbodyHtml = '<tbody>';
                            for (let r = 1; r < rows.length; r++) {
                                const bg = r % 2 === 0 ? 'background:rgba(255,255,255,0.02);' : '';
                                tbodyHtml += `<tr style="${bg}">`;
                                tbodyHtml += `<td style="padding:6px 10px; color:var(--text-muted); border-bottom:1px solid var(--border); font-size:11px; text-align:center;">${r}</td>`;
                                for (let c = 0; c < headerCols.length; c++) {
                                    const cellVal = rows[r][c] || '';
                                    const safe = typeof messagesModule !== 'undefined' ? messagesModule.escapeHTML(cellVal) : cellVal;
                                    tbodyHtml += `<td style="padding:6px 10px; border-bottom:1px solid var(--border); border-right:1px solid var(--border-light, rgba(255,255,255,0.04)); color:var(--text);">${safe}</td>`;
                                }
                                tbodyHtml += '</tr>';
                            }
                            tbodyHtml += '</tbody>';
                            tableEl.innerHTML = theadHtml + tbodyHtml;
                        }

                        if (toggleBtn) {
                            toggleBtn.onclick = () => {
                                const tableWrap = container.querySelector('#csvTableWrapper');
                                if (rawPre.style.display === 'none') {
                                    rawPre.style.display = 'block';
                                    tableWrap.style.display = 'none';
                                    toggleBtn.textContent = 'Show Table View';
                                } else {
                                    rawPre.style.display = 'none';
                                    tableWrap.style.display = 'block';
                                    toggleBtn.textContent = 'Show Raw Text';
                                }
                            };
                        }
                    })
                    .catch(err => {
                        const statusEl = container.querySelector('#csvStatusInfo');
                        if (statusEl) {
                            statusEl.textContent = 'Unable to parse CSV into table format. Showing raw view.';
                            statusEl.style.color = 'var(--danger)';
                        }
                        const tableWrap = container.querySelector('#csvTableWrapper');
                        const rawPre = container.querySelector('#csvRawText');
                        if (tableWrap) tableWrap.style.display = 'none';
                        if (rawPre) {
                            rawPre.style.display = 'block';
                            rawPre.textContent = `Error loading CSV: ${err.message}`;
                        }
                    });
            } else if (effectiveType === 'text') {
                const pre = document.createElement('pre');
                pre.style.width = '100%';
                pre.style.height = 'calc(90vh - 100px)';
                pre.style.overflow = 'auto';
                pre.style.padding = '18px';
                pre.style.background = 'var(--surface-elevated)';
                pre.style.borderRadius = 'var(--radius-md)';
                pre.style.fontFamily = 'monospace';
                pre.style.fontSize = '13px';
                pre.style.lineHeight = '1.6';
                pre.style.color = 'var(--text)';
                pre.style.whiteSpace = 'pre-wrap';
                pre.textContent = 'Loading text...';
                bodyEl.appendChild(pre);

                fetch(viewUrl).then(r => {
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    return r.text();
                }).then(t => {
                    pre.textContent = t;
                }).catch(() => {
                    pre.textContent = 'Unable to load text preview.';
                });
            } else {
                if (typeof FrankOfficeWorkspace !== 'undefined') {
                    if (!window.frankOfficeWorkspace) window.frankOfficeWorkspace = new FrankOfficeWorkspace();
                    window.frankOfficeWorkspace.openDocument(validFileId, fileType, filenameClean, directUrl);
                    return;
                }
                const safeName = typeof messagesModule !== 'undefined' ? messagesModule.escapeHTML(filenameClean) : filenameClean;
                const extUpper = ext ? ext.toUpperCase() : 'FILE';
                bodyEl.innerHTML = `
                    <div style="text-align: center; padding: 48px 24px;">
                        <div style="font-size: 56px; margin-bottom: 16px;">📁</div>
                        <div style="font-size: 18px; font-weight: 800; color: var(--text); margin-bottom: 8px;">Document Preview</div>
                        <div style="font-size: 14px; color: var(--text-muted); max-width: 440px; margin: 0 auto 24px auto; line-height: 1.5;">
                            ${safeName} (${extUpper})
                        </div>
                        <button type="button" class="btn btn-primary" id="fallbackDownloadBtn" style="padding: 10px 24px; font-size: 14px; font-weight: 700;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Download ${safeName}
                        </button>
                    </div>
                `;
                const fbBtn = bodyEl.querySelector('#fallbackDownloadBtn');
                if (fbBtn) {
                    fbBtn.onclick = () => this.downloadDocument(validFileId, filenameClean, directUrl);
                }
            }
        }

        if (typeof openModal === 'function') {
            openModal('attachmentViewerModal');
        }
        modal.classList.add('open');
        modal.classList.add('active');
        modal.style.display = 'flex';
        modal.style.visibility = 'visible';
        modal.style.opacity = '1';
    }

    async downloadDocument(fileId, filename, directUrl) {
        const validFileId = (fileId && !isNaN(fileId) && parseInt(fileId, 10) > 0) ? parseInt(fileId, 10) : null;
        const url = validFileId ? api.getFileDownloadUrl(validFileId) : directUrl;
        if (!url) return;
        try {
            const res = await fetch(url);
            if (res.ok) {
                const blob = await res.blob();
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = blobUrl;
                a.download = filename || 'download';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
                showToast('Download started', 'success');
                return;
            }
        } catch (fetchErr) {
            console.warn('Fetch blob download encountered error, using direct anchor fallback:', fetchErr);
        }

        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename || 'download';
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            showToast('Download started', 'success');
        } catch (err) {
            console.error('Download fallback error:', err);
            showToast('Unable to download file. Please check connection.', 'error');
        }
    }

    // ---------------- NATIVE OS FILE PICKER TRIGGERS ----------------
    // Rule: Clicking immediately opens device's native file chooser. Zero website viewer before selection.
    triggerPhotoPicker() {
        this.closeAttachmentMenu();
        if (this.dom.photoInput) {
            this.dom.photoInput.value = '';
            this.dom.photoInput.click();
        }
    }

    triggerDocPicker() {
        this.closeAttachmentMenu();
        if (this.dom.docInput) {
            this.dom.docInput.value = '';
            this.dom.docInput.click();
        }
    }

    triggerVideoPicker() {
        this.closeAttachmentMenu();
        if (this.dom.videoInput) {
            this.dom.videoInput.value = '';
            this.dom.videoInput.click();
        }
    }

    triggerAudioPicker() {
        this.closeAttachmentMenu();
        if (this.dom.audioInput) {
            this.dom.audioInput.value = '';
            this.dom.audioInput.click();
        }
    }

    closeAttachmentMenu() {
        if (this.dom.attachmentPopover) {
            this.dom.attachmentPopover.classList.remove('show');
        }
    }

    bindNativeInputs() {
        const handleNativeSelection = (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                this.stageSelectedFile(files[0]);
            }
        };

        this.dom.photoInput?.addEventListener('change', handleNativeSelection);
        this.dom.docInput?.addEventListener('change', handleNativeSelection);
        this.dom.videoInput?.addEventListener('change', handleNativeSelection);
        this.dom.audioInput?.addEventListener('change', handleNativeSelection);
    }

    bindMenuTriggers() {
        // Desktop quick photo button
        this.dom.desktopQuickPhotoBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.triggerPhotoPicker();
        });

        // Attachment popover items
        document.getElementById('attachPhotoBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.triggerPhotoPicker();
        });

        document.getElementById('attachDocBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.triggerDocPicker();
        });

        document.getElementById('attachVideoBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.triggerVideoPicker();
        });

        document.getElementById('attachVoiceBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeAttachmentMenu();
            if (window.voiceRecorder) {
                window.voiceRecorder.startRecording();
            }
        });

        this.dom.cancelMenuBtn?.addEventListener('click', () => {
            this.closeAttachmentMenu();
        });
    }

    bindTrayControls() {
        // Cancel button in staging tray
        this.dom.trayCancelBtn?.addEventListener('click', () => {
            this.clearStagedFile();
        });

        // Send button in staging tray
        this.dom.traySendBtn?.addEventListener('click', () => {
            const caption = window.chatController ? (window.chatController.dom.textarea?.value || '') : '';
            if (window.chatController && window.chatController.dom.textarea) {
                window.chatController.dom.textarea.value = '';
                window.chatController.autoResizeTextarea();
            }
            this.uploadAndSendStagedFile(caption);
        });

        // Remove button in staging tray
        this.dom.trayRemoveBtn?.addEventListener('click', () => {
            this.clearStagedFile();
        });

        // Cancel upload button in staging tray
        this.dom.trayCancelUploadBtn?.addEventListener('click', () => {
            this.cancelUpload();
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    getFileCategory(filename) {
        const ext = '.' + filename.split('.').pop().toLowerCase();
        if (['.mp4', '.mov', '.webm', '.mkv'].includes(ext)) return 'video';
        if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) return 'image';
        if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.weba'].includes(ext)) return 'audio';
        if (['.pdf'].includes(ext)) return 'pdf';
        if (['.csv'].includes(ext)) return 'csv';
        if (['.doc', '.docx'].includes(ext)) return 'word';
        if (['.xls', '.xlsx'].includes(ext)) return 'excel';
        if (['.ppt', '.pptx'].includes(ext)) return 'presentation';
        if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'archive';
        if (['.txt', '.json', '.md'].includes(ext)) return 'text';
        return 'document';
    }

    getFileBadgeMarkup(category, extUpper) {
        let badgeColor = '#6366F1';
        let iconSvg = '';

        if (category === 'video') {
            badgeColor = '#F59E0B';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
        } else if (category === 'image') {
            badgeColor = '#06B6D4';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
        } else if (category === 'audio') {
            badgeColor = '#EC4899';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path></svg>`;
        } else if (category === 'pdf') {
            badgeColor = '#EF4444';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
        } else if (category === 'csv' || category === 'excel') {
            badgeColor = '#10B981';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line></svg>`;
        } else if (category === 'word') {
            badgeColor = '#2563EB';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>`;
        } else if (category === 'presentation') {
            badgeColor = '#F59E0B';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`;
        } else if (category === 'archive') {
            badgeColor = '#F59E0B';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>`;
        } else {
            badgeColor = '#8B5CF6';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
        }

        return `
            <div class="doc-badge-icon" style="background: ${badgeColor}18; color: ${badgeColor}; border: 1px solid ${badgeColor}33;">
                ${iconSvg}
                <span class="doc-badge-label" style="background: ${badgeColor};">${extUpper || 'DOC'}</span>
            </div>
        `;
    }

    // ---------------- VALIDATION & STAGING (AFTER SELECTION) ----------------
    stageSelectedFile(file) {
        if (!file) return;

        const filename = file.name;
        const ext = '.' + filename.split('.').pop().toLowerCase();

        // 1. Disallowed executables & scripts
        if (this.disallowedExtensions.includes(ext)) {
            showToast('File type is not supported.', 'error');
            return;
        }

        // 2. Empty check
        if (file.size === 0) {
            showToast('The selected file is empty.', 'error');
            return;
        }

        // 3. Category limits (100MB across all types)
        const category = this.getFileCategory(filename);
        const maxLimitMB = 100;
        const maxLimitBytes = maxLimitMB * 1024 * 1024;
        if (file.size > maxLimitBytes) {
            showToast(`File is too large. Maximum size is ${maxLimitMB} MB.`, 'error');
            return;
        }

        // Clean up previous staging URL
        if (this.stagedPreviewUrl) {
            URL.revokeObjectURL(this.stagedPreviewUrl);
            this.stagedPreviewUrl = null;
        }

        this.selectedFile = file;
        this.stagedPreviewUrl = URL.createObjectURL(file);

        // Render preview inside composer tray
        if (this.dom.trayFilename) {
            this.dom.trayFilename.textContent = file.name;
        }
        if (this.dom.trayMeta) {
            const extUpper = ext.replace('.', '').toUpperCase();
            this.dom.trayMeta.textContent = `${this.formatFileSize(file.size)} • ${extUpper}`;
        }

        if (this.dom.trayPreviewWrap) {
            if (category === 'image') {
                this.dom.trayPreviewWrap.innerHTML = `
                    <img src="${this.stagedPreviewUrl}" alt="Preview" class="tray-preview-thumb">
                `;
            } else if (category === 'video') {
                this.dom.trayPreviewWrap.innerHTML = `
                    <div class="tray-video-thumb">
                        <video src="${this.stagedPreviewUrl}" preload="metadata" muted playsinline></video>
                        <span class="tray-play-overlay">▶</span>
                    </div>
                `;
            } else {
                const extUpper = ext.replace('.', '').toUpperCase();
                this.dom.trayPreviewWrap.innerHTML = this.getFileBadgeMarkup(category, extUpper);
            }
        }

        // Reset progress bar & show action buttons
        if (this.dom.trayProgressWrap) this.dom.trayProgressWrap.style.display = 'none';
        if (this.dom.trayProgressBar) {
            this.dom.trayProgressBar.style.width = '0%';
            this.dom.trayProgressBar.style.background = 'var(--primary)';
        }
        if (this.dom.trayCancelUploadBtn) this.dom.trayCancelUploadBtn.style.display = 'none';
        if (this.dom.trayCancelBtn) this.dom.trayCancelBtn.style.display = 'inline-block';
        if (this.dom.traySendBtn) {
            this.dom.traySendBtn.style.display = 'inline-flex';
            this.dom.traySendBtn.disabled = false;
        }
        if (this.dom.trayRemoveBtn) this.dom.trayRemoveBtn.style.display = 'flex';

        // Show staging tray
        if (this.dom.tray) {
            this.dom.tray.style.display = 'flex';
        }

        // Focus textarea and update action button (switches mic to send)
        if (window.chatController) {
            window.chatController.updateComposerActionButton();
            window.chatController.dom.textarea?.focus();
        }
    }

    clearStagedFile() {
        if (this.isUploading) {
            this.cancelUpload();
            return;
        }

        if (this.stagedPreviewUrl) {
            URL.revokeObjectURL(this.stagedPreviewUrl);
            this.stagedPreviewUrl = null;
        }

        this.selectedFile = null;
        if (this.dom.tray) {
            this.dom.tray.style.display = 'none';
        }

        // Reset inputs
        if (this.dom.photoInput) this.dom.photoInput.value = '';
        if (this.dom.docInput) this.dom.docInput.value = '';
        if (this.dom.videoInput) this.dom.videoInput.value = '';
        if (this.dom.audioInput) this.dom.audioInput.value = '';

        if (window.chatController) {
            window.chatController.updateComposerActionButton();
        }
    }

    cancelUpload() {
        if (this.currentUploadXhr) {
            this.currentUploadXhr.abort();
            this.currentUploadXhr = null;
        }
        this.isUploading = false;
        showToast('Upload cancelled.', 'info');
        this.clearStagedFile();
    }

    // ---------------- UPLOAD & SEND STAGED FILE ----------------
    async uploadAndSendStagedFile(optionalCaption = '') {
        if (!this.selectedFile || this.isUploading) return false;

        const chat = window.chatController;
        if (!chat || !chat.activeId) {
            showToast('Please select a conversation first.', 'error');
            return false;
        }

        this.isUploading = true;

        // Show progress UI in tray
        if (this.dom.trayProgressWrap) this.dom.trayProgressWrap.style.display = 'block';
        if (this.dom.trayProgressBar) {
            this.dom.trayProgressBar.style.width = '0%';
            this.dom.trayProgressBar.style.background = 'var(--primary)';
        }
        if (this.dom.trayProgressText) this.dom.trayProgressText.textContent = 'Uploading... 0%';
        if (this.dom.trayCancelUploadBtn) this.dom.trayCancelUploadBtn.style.display = 'inline-block';
        if (this.dom.trayCancelBtn) this.dom.trayCancelBtn.style.display = 'none';
        if (this.dom.traySendBtn) {
            this.dom.traySendBtn.disabled = true;
            this.dom.traySendBtn.innerHTML = '<span class="spinner-sm"></span> Sending...';
        }
        if (this.dom.trayRemoveBtn) this.dom.trayRemoveBtn.style.display = 'none';

        const formData = new FormData();
        formData.append('file', this.selectedFile);

        if (chat.activeType === 'direct') {
            formData.append('partner_id', chat.activeId);
        } else if (chat.activeType === 'group') {
            formData.append('group_id', chat.activeId);
        }

        const category = this.getFileCategory(this.selectedFile.name);
        let messageType = 'document';
        if (category === 'image') messageType = 'image';
        else if (category === 'video') messageType = 'video';
        else if (category === 'audio') messageType = 'audio';

        try {
            const uploadedDoc = await api.uploadFile(formData, (percent) => {
                if (this.dom.trayProgressBar) this.dom.trayProgressBar.style.width = `${percent}%`;
                if (this.dom.trayProgressText) this.dom.trayProgressText.textContent = `Uploading... ${percent}%`;
            }, (xhr) => {
                this.currentUploadXhr = xhr;
            });

            if (this.dom.trayProgressBar) this.dom.trayProgressBar.style.width = '100%';
            if (this.dom.trayProgressText) this.dom.trayProgressText.textContent = 'Completed!';

            const replyId = chat.replyTo ? chat.replyTo.id : null;
            chat.clearReplying();

            const contentText = optionalCaption.trim() || `Shared a file: ${uploadedDoc.original_filename}`;

            if (window.wsClient && window.wsClient.isConnected) {
                window.wsClient.send({
                    type: 'message',
                    recipient_id: chat.activeType === 'direct' ? chat.activeId : null,
                    group_id: chat.activeType === 'group' ? chat.activeId : null,
                    content: contentText,
                    message_type: messageType,
                    file_id: uploadedDoc.id,
                    filename: uploadedDoc.original_filename,
                    reply_to_id: replyId
                });
            } else {
                // REST Fallback
                const newMsg = await api.sendMessage({
                    recipient_id: chat.activeType === 'direct' ? chat.activeId : null,
                    group_id: chat.activeType === 'group' ? chat.activeId : null,
                    content: contentText,
                    message_type: messageType,
                    file_id: uploadedDoc.id,
                    reply_to_id: replyId
                });

                const currentUser = auth.getUser();
                chat.appendMessage(newMsg, currentUser ? currentUser.id : null);
            }

            showToast(`${category.charAt(0).toUpperCase() + category.slice(1)} sent!`, 'success');
            this.isUploading = false;
            this.clearStagedFile();
            return true;

        } catch (err) {
            console.error('File upload error:', err);
            this.isUploading = false;
            if (this.dom.trayProgressText) this.dom.trayProgressText.textContent = 'Upload failed';
            if (this.dom.trayProgressBar) this.dom.trayProgressBar.style.background = 'var(--danger)';
            if (this.dom.trayCancelUploadBtn) this.dom.trayCancelUploadBtn.style.display = 'none';
            if (this.dom.trayCancelBtn) this.dom.trayCancelBtn.style.display = 'inline-block';
            if (this.dom.traySendBtn) {
                this.dom.traySendBtn.disabled = false;
                this.dom.traySendBtn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                    <span>Send</span>
                `;
            }
            if (this.dom.trayRemoveBtn) this.dom.trayRemoveBtn.style.display = 'flex';

            if (err.message && err.message.toLowerCase().includes('abort')) {
                return false;
            }

            let friendlyError = err.message || (category === 'image' ? 'Photo upload failed. Please try again.' : 'Document upload failed. Please try again.');
            if (err.status === 401) {
                friendlyError = 'Your session expired. Please log in again.';
            } else if (err.status === 403) {
                friendlyError = 'You do not have permission to upload this file.';
            } else if (err.status === 413) {
                friendlyError = 'File is too large. Maximum size is 100 MB.';
            } else if (err.status === 415) {
                friendlyError = 'Unsupported file type.';
            }
            showToast(friendlyError, 'error');
            return false;
        }

    }
}

// Global initialization
function initDocumentsController() {
    if (!window.documentsController) {
        window.documentsController = new DocumentsController();
    }
    if (!window.documentBrowserController) {
        window.documentBrowserController = new DocumentBrowserController();
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDocumentsController);
} else {
    initDocumentsController();
}

/* -------------------------------------------------------------------------
   FRANK - PART 3: OPEN & EDIT DOCUMENTS BROWSER CONTROLLER
   Full-featured document browser, real multi-format uploads,
   filtering, searching, version-aware rendering, send-to-chat modal.
   ------------------------------------------------------------------------- */
class DocumentBrowserController {
    constructor() {
        this.documents = [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.stagedSendDocId = null;
        this.stagedSendDocName = '';
        this.selectedRecipient = null;
        this.debounceTimer = null;
        this.dom = {};
        this.init();
    }

    init() {
        this.cacheDom();
        this.bindEvents();
    }

    cacheDom() {
        this.dom = {
            navBtn: document.getElementById('navOpenEditDocsBtn'),
            workspace: document.getElementById('docBrowserWorkspace'),
            closeBtn: document.getElementById('docBrowserCloseBtn'),
            uploadBtn: document.getElementById('docBrowserUploadBtn'),
            uploadInput: document.getElementById('docBrowserUploadInput'),
            searchInput: document.getElementById('docBrowserSearchInput'),
            filterPills: document.getElementById('docBrowserFilterPills'),
            grid: document.getElementById('docBrowserGrid'),
            sendModal: document.getElementById('docSendToChatModal'),
            closeSendModalBtn: document.getElementById('closeDocSendModalBtn'),
            cancelSendBtn: document.getElementById('cancelDocSendBtn'),
            confirmSendBtn: document.getElementById('confirmDocSendBtn'),
            recipientSearch: document.getElementById('docSendRecipientSearch'),
            recipientList: document.getElementById('docSendRecipientList'),
            commentInput: document.getElementById('docSendCommentInput')
        };
    }

    bindEvents() {
        // Nav Open
        this.dom.navBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.openBrowser();
        });

        // Close / Back
        this.dom.closeBtn?.addEventListener('click', () => {
            this.closeBrowser();
        });

        // Upload Button -> trigger file picker
        this.dom.uploadBtn?.addEventListener('click', () => {
            if (this.dom.uploadInput) {
                this.dom.uploadInput.value = '';
                this.dom.uploadInput.click();
            }
        });

        // Upload Input change -> upload file
        this.dom.uploadInput?.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) {
                this.handleUpload(file);
            }
        });

        // Search Input
        this.dom.searchInput?.addEventListener('input', (e) => {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
                this.searchQuery = e.target.value.trim();
                this.loadDocuments();
            }, 250);
        });

        // Filter Pills
        this.dom.filterPills?.addEventListener('click', (e) => {
            const pill = e.target.closest('.doc-filter-pill');
            if (!pill) return;
            const filter = pill.dataset.filter || 'all';
            this.currentFilter = filter;
            this.dom.filterPills.querySelectorAll('.doc-filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            this.loadDocuments();
        });

        // Send to Chat Modal controls
        this.dom.closeSendModalBtn?.addEventListener('click', () => this.closeSendToChatModal());
        this.dom.cancelSendBtn?.addEventListener('click', () => this.closeSendToChatModal());
        this.dom.sendModal?.addEventListener('click', (e) => {
            if (e.target === this.dom.sendModal) this.closeSendToChatModal();
        });
        this.dom.confirmSendBtn?.addEventListener('click', () => this.executeSendToChat());
        this.dom.recipientSearch?.addEventListener('input', (e) => this.filterRecipients(e.target.value));

        // Escape hotkey
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.dom.sendModal && this.dom.sendModal.style.display !== 'none') {
                    this.closeSendToChatModal();
                } else if (this.dom.workspace && this.dom.workspace.style.display !== 'none') {
                    const officeWs = document.getElementById('frankDocumentWorkspace');
                    if (!officeWs || !officeWs.classList.contains('active')) {
                        this.closeBrowser();
                    }
                }
            }
        });
    }

    async openBrowser() {
        if (!this.dom.workspace) this.cacheDom();
        if (!this.dom.workspace) return;

        this.dom.workspace.style.display = 'flex';
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(b => b.classList.remove('active'));
        this.dom.navBtn?.classList.add('active');

        await this.loadDocuments();
    }

    closeBrowser() {
        if (this.dom.workspace) {
            this.dom.workspace.style.display = 'none';
        }
        const chatsBtn = document.querySelector('.sidebar-nav .nav-item[data-section="chats"]');
        if (chatsBtn) chatsBtn.classList.add('active');
    }

    async loadDocuments() {
        if (!this.dom.grid) this.cacheDom();
        if (!this.dom.grid) return;

        this.dom.grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);"><div class="spinner"></div><div style="margin-top:10px;">Loading documents...</div></div>';

        try {
            let url = `/api/files?filter_type=${encodeURIComponent(this.currentFilter)}`;
            if (this.searchQuery) {
                url += `&q=${encodeURIComponent(this.searchQuery)}`;
            }

            const res = await api.request(url);
            this.documents = Array.isArray(res) ? res : (res && res.files ? res.files : []);
            this.renderDocumentGrid();
        } catch (err) {
            console.error('Failed to load documents:', err);
            this.dom.grid.innerHTML = `
                <div class="doc-browser-empty">
                    <div class="doc-browser-empty-icon">⚠️</div>
                    <div class="doc-browser-empty-title">Unable to load documents</div>
                    <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Please check your connection and try again.</p>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.documentBrowserController.loadDocuments()">Retry</button>
                </div>
            `;
        }
    }

    renderDocumentGrid() {
        if (!this.dom.grid) return;

        if (!this.documents || this.documents.length === 0) {
            this.dom.grid.innerHTML = `
                <div class="doc-browser-empty">
                    <div class="doc-browser-empty-icon">📄</div>
                    <div class="doc-browser-empty-title">No documents found</div>
                    <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">
                        ${this.searchQuery ? `No files matching "${messagesModule.escapeHTML(this.searchQuery)}"` : 'Upload a PDF, Word, Excel, PowerPoint, Text, or CSV file to get started.'}
                    </p>
                    <button type="button" class="btn btn-primary btn-sm" onclick="document.getElementById('docBrowserUploadBtn').click()">
                        Upload Document
                    </button>
                </div>
            `;
            return;
        }

        let html = '';
        this.documents.forEach(doc => {
            const ext = (doc.original_filename.split('.').pop() || '').toLowerCase();
            const cat = this.getCategoryClass(ext, doc.file_type);
            const icon = this.getCategoryEmoji(cat);
            const sizeFormatted = this.formatFileSize(doc.file_size || 0);
            const dateFormatted = doc.created_at ? messagesModule.formatRelativeTime(doc.created_at) : 'Recent';
            const ver = doc.current_version_number || 1;

            html += `
                <div class="doc-browser-card" data-doc-id="${doc.id}">
                    <div class="doc-card-top">
                        <div class="doc-card-icon ${cat}">${icon}</div>
                        <div class="doc-card-info">
                            <div class="doc-card-title" title="${messagesModule.escapeHTML(doc.original_filename)}">
                                ${messagesModule.escapeHTML(doc.original_filename)}
                            </div>
                            <div class="doc-card-meta">
                                <span class="doc-card-badge">${(doc.file_type || ext || 'FILE').toUpperCase()}</span>
                                <span>${sizeFormatted}</span>
                                <span>•</span>
                                <span>v${ver}</span>
                                <span>•</span>
                                <span>${dateFormatted}</span>
                            </div>
                        </div>
                    </div>
                    <div class="doc-card-actions">
                        <button type="button" class="btn btn-secondary btn-sm" title="Download Document" onclick="event.stopPropagation(); window.documentBrowserController.downloadDoc(${doc.id}, '${messagesModule.escapeHTML(doc.original_filename)}')">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Download
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm" title="Send to Chat" onclick="event.stopPropagation(); window.documentBrowserController.openSendToChatModal(${doc.id}, '${messagesModule.escapeHTML(doc.original_filename)}')">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                            Send
                        </button>
                        <button type="button" class="btn btn-primary btn-sm" title="Open & Edit" onclick="event.stopPropagation(); window.documentBrowserController.openDoc(${doc.id}, '${doc.file_type}', '${messagesModule.escapeHTML(doc.original_filename)}')">
                            Open &amp; Edit
                        </button>
                    </div>
                </div>
            `;
        });

        this.dom.grid.innerHTML = html;

        // Card clicks
        this.dom.grid.querySelectorAll('.doc-browser-card').forEach(card => {
            card.addEventListener('click', () => {
                const docId = parseInt(card.dataset.docId, 10);
                const doc = this.documents.find(d => d.id === docId);
                if (doc) {
                    this.openDoc(doc.id, doc.file_type, doc.original_filename);
                }
            });
        });
    }

    getCategoryClass(ext, fileType) {
        if (ext === 'pdf' || fileType === 'pdf') return 'pdf';
        if (['doc', 'docx'].includes(ext) || fileType === 'word') return 'word';
        if (['xls', 'xlsx'].includes(ext) || fileType === 'excel') return 'excel';
        if (['ppt', 'pptx'].includes(ext) || fileType === 'pptx' || fileType === 'presentation') return 'presentation';
        if (['txt', 'text', 'md'].includes(ext) || fileType === 'text') return 'text';
        if (ext === 'csv' || fileType === 'csv') return 'csv';
        return 'archive';
    }

    getCategoryEmoji(cat) {
        switch (cat) {
            case 'word': return '📘';
            case 'excel': return '📊';
            case 'presentation': return '📽️';
            case 'pdf': return '📕';
            case 'text': return '📝';
            case 'csv': return '📈';
            default: return '📄';
        }
    }

    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    async handleUpload(file) {
        if (!file) return;

        // Validate size (100MB max)
        const maxSize = 100 * 1024 * 1024;
        if (file.size > maxSize) {
            showToast('File is too large. Maximum size is 100 MB.', 'error');
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        showToast('Uploading document...', 'info');

        try {
            const token = (typeof auth !== 'undefined' && typeof auth.getToken === 'function') 
                ? auth.getToken() 
                : (localStorage.getItem('chatapp_token') || localStorage.getItem('frank_token'));
            const baseUrl = (window.FRANK_CONFIG && window.FRANK_CONFIG.API_BASE) || '';
            const res = await fetch(`${baseUrl}/api/files/upload`, {
                method: 'POST',
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                },
                body: formData
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.detail || 'Upload failed');
            }

            const uploadedDoc = await res.json();
            showToast('Document uploaded successfully!', 'success');

            // Refresh browser list
            await this.loadDocuments();

            // Automatically open in workspace
            this.openDoc(uploadedDoc.id, uploadedDoc.file_type, uploadedDoc.original_filename);
        } catch (err) {
            console.error('Document upload error:', err);
            showToast(err.message || 'Upload failed. Please try again.', 'error');
        }
    }

    openDoc(fileId, fileType, filename) {
        if (!window.frankOfficeWorkspace && typeof FrankOfficeWorkspace !== 'undefined') {
            window.frankOfficeWorkspace = new FrankOfficeWorkspace();
        }

        if (window.frankOfficeWorkspace) {
            const baseUrl = (window.FRANK_CONFIG && window.FRANK_CONFIG.API_BASE) || '';
            const viewUrl = `${baseUrl}/api/files/${fileId}/view`;
            if (this.dom.workspace) {
                this.dom.workspace.style.display = 'none';
            }
            window.frankOfficeWorkspace.openDocument(fileId, fileType, filename, viewUrl);
        }
    }

    downloadDoc(fileId, filename) {
        const downloadUrl = `/api/files/${fileId}/download`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename || 'document';
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast('Download started', 'success');
    }

    // ---------------- SEND TO CHAT WORKFLOW ----------------
    async openSendToChatModal(docId, filename) {
        this.stagedSendDocId = docId;
        this.stagedSendDocName = filename || 'Document';
        this.selectedRecipient = null;

        if (!this.dom.sendModal) this.cacheDom();
        if (!this.dom.sendModal) return;

        this.dom.sendModal.style.display = 'flex';
        if (this.dom.recipientSearch) this.dom.recipientSearch.value = '';
        if (this.dom.commentInput) this.dom.commentInput.value = `Here is the latest: ${this.stagedSendDocName}`;
        if (this.dom.confirmSendBtn) this.dom.confirmSendBtn.disabled = true;

        await this.populateRecipientList();
    }

    closeSendToChatModal() {
        if (this.dom.sendModal) {
            this.dom.sendModal.style.display = 'none';
        }
        this.stagedSendDocId = null;
        this.selectedRecipient = null;
    }

    async populateRecipientList() {
        if (!this.dom.recipientList) return;
        this.dom.recipientList.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);"><div class="spinner"></div></div>';

        try {
            const [conversations, allUsers] = await Promise.all([
                api.getConversations().catch(() => []),
                api.getUsers().catch(() => [])
            ]);
            const currentUser = auth.getUser();
            const selfId = currentUser ? Number(currentUser.id) : null;

            let recipients = [];
            const seenUserIds = new Set();
            if (selfId) seenUserIds.add(selfId);

            // 1. Add self chat
            if (currentUser) {
                recipients.push({
                    id: selfId,
                    type: 'self',
                    name: `${currentUser.full_name || currentUser.username} (You)`,
                    subtitle: 'Notes to self',
                    icon: '👤'
                });
            }

            // 2. Add existing conversations (Recent Chats & Groups)
            (conversations || []).forEach(c => {
                const isGroup = c.type === 'group';
                if (!isGroup) {
                    const uid = Number(c.id);
                    if (uid === selfId || seenUserIds.has(uid)) return;
                    seenUserIds.add(uid);
                }
                recipients.push({
                    id: c.id,
                    type: isGroup ? 'group' : 'direct',
                    conversation_id: c.conversation_id || null,
                    name: c.name || c.username || 'Chat',
                    subtitle: isGroup ? 'Group Conversation' : `@${c.username || 'user'}`,
                    icon: isGroup ? '👥' : '💬'
                });
            });

            // 3. Add registered contacts (from allUsers)
            (allUsers || []).forEach(u => {
                const uid = Number(u.id);
                if (uid === selfId || seenUserIds.has(uid)) return;
                seenUserIds.add(uid);
                recipients.push({
                    id: uid,
                    type: 'direct',
                    conversation_id: null,
                    name: u.full_name || u.username || 'User',
                    subtitle: `@${u.username || 'user'}${u.bio ? ' • ' + u.bio : ''}`,
                    icon: '💬'
                });
            });

            this.renderedRecipients = recipients;
            this.renderRecipientRows(recipients);
        } catch (err) {
            console.error('Failed to load recipients:', err);
            this.dom.recipientList.innerHTML = '<div style="padding:14px;text-align:center;color:var(--danger);">Failed to load contacts</div>';
        }
    }

    renderRecipientRows(recipients) {
        if (!this.dom.recipientList) return;
        if (!recipients || recipients.length === 0) {
            this.dom.recipientList.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px;">No recipients found</div>';
            return;
        }

        let html = '';
        recipients.forEach(r => {
            const isSelected = this.selectedRecipient && this.selectedRecipient.id === r.id && this.selectedRecipient.type === r.type;
            html += `
                <div class="doc-send-recipient-row ${isSelected ? 'selected' : ''}" data-id="${r.id}" data-type="${r.type}">
                    <span style="font-size:18px;">${r.icon}</span>
                    <div style="flex:1;min-width:0;">
                        <div style="font-size:13px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${messagesModule.escapeHTML(r.name)}
                        </div>
                        <div style="font-size:11px;color:var(--text-muted);">
                            ${messagesModule.escapeHTML(r.subtitle)}
                        </div>
                    </div>
                    ${isSelected ? '<span style="color:var(--primary);font-weight:700;">✓</span>' : ''}
                </div>
            `;
        });

        this.dom.recipientList.innerHTML = html;

        this.dom.recipientList.querySelectorAll('.doc-send-recipient-row').forEach(row => {
            row.addEventListener('click', () => {
                const id = parseInt(row.dataset.id, 10);
                const type = row.dataset.type;
                const rec = (this.renderedRecipients || []).find(r => r.id === id && r.type === type);
                if (rec) {
                    this.selectedRecipient = rec;
                    this.renderRecipientRows(this.renderedRecipients);
                    if (this.dom.confirmSendBtn) {
                        this.dom.confirmSendBtn.disabled = false;
                    }
                }
            });
        });
    }

    filterRecipients(query) {
        const q = (query || '').toLowerCase().trim();
        if (!this.renderedRecipients) return;
        if (!q) {
            this.renderRecipientRows(this.renderedRecipients);
            return;
        }
        const filtered = this.renderedRecipients.filter(r => 
            r.name.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q)
        );
        this.renderRecipientRows(filtered);
    }

    async executeSendToChat() {
        if (!this.stagedSendDocId || !this.selectedRecipient) return;

        const recipient = this.selectedRecipient;
        const docId = this.stagedSendDocId;
        const docName = this.stagedSendDocName;

        if (this.dom.confirmSendBtn) {
            this.dom.confirmSendBtn.disabled = true;
            this.dom.confirmSendBtn.textContent = 'Sending...';
        }

        const comment = (this.dom.commentInput?.value || '').trim() || `Shared: ${docName}`;

        const payload = {
            comment: comment,
            recipient_id: recipient.type !== 'group' ? recipient.id : null,
            group_id: recipient.type === 'group' ? recipient.id : null
        };

        try {
            const res = await api.sendDocumentToConversation(docId, payload);
            if (res && res.status === 'sent') {
                showToast('Document sent to chat successfully!', 'success');
                this.closeSendToChatModal();

                const officeWs = document.getElementById('frankDocumentWorkspace');
                if (officeWs && officeWs.classList.contains('active')) {
                    if (window.frankOfficeWorkspace) {
                        window.frankOfficeWorkspace.closeWorkspace();
                    }
                }

                this.closeBrowser();
                if (window.chatController) {
                    if (recipient.type === 'group') {
                        window.chatController.openGroupChat({ id: recipient.id, name: recipient.name });
                    } else {
                        window.chatController.openDirectChat({ id: recipient.id, name: recipient.name, username: recipient.name });
                    }
                }
            } else {
                throw new Error('Server returned unexpected status');
            }
        } catch (err) {
            console.error('Failed to send document to chat:', err);
            showToast(err.message || 'Unable to send document to chat', 'error');
            if (this.dom.confirmSendBtn) {
                this.dom.confirmSendBtn.disabled = false;
                this.dom.confirmSendBtn.textContent = 'Send Document';
            }
        }
    }
}

// Global initialization for document browser
function initDocumentBrowserController() {
    if (!window.documentBrowserController) {
        window.documentBrowserController = new DocumentBrowserController();
    }
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDocumentBrowserController);
} else {
    initDocumentBrowserController();
}

