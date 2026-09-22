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
        if (typeof closeModal === 'function') {
            closeModal('attachmentViewerModal');
        }
        if (this.dom.viewerModal) {
            this.dom.viewerModal.classList.remove('open');
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
        if (!validFileId && !directUrl) {
            console.warn('>>> [DOCUMENTS] openDocument called without valid fileId or directUrl');
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
                const safeName = typeof messagesModule !== 'undefined' ? messagesModule.escapeHTML(filenameClean) : filenameClean;
                const extUpper = ext ? ext.toUpperCase() : 'FILE';
                bodyEl.innerHTML = `
                    <div style="text-align: center; padding: 48px 24px;">
                        <div style="font-size: 56px; margin-bottom: 16px;">📁</div>
                        <div style="font-size: 18px; font-weight: 800; color: var(--text); margin-bottom: 8px;">Preview unavailable</div>
                        <div style="font-size: 14px; color: var(--text-muted); max-width: 440px; margin: 0 auto 24px auto; line-height: 1.5;">
                            This ${extUpper} document cannot be previewed in the browser. You can download it to view on your device.
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
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDocumentsController);
} else {
    initDocumentsController();
}
