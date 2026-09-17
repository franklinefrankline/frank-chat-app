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
            trayCancelUploadBtn: document.getElementById('trayCancelUploadBtn'),
            trayRemoveBtn: document.getElementById('trayRemoveBtn')
        };

        this.init();
    }

    init() {
<<<<<<< HEAD
        // Create hidden OS file input
        let fileInput = document.getElementById('frankFileInput');
        if (!fileInput) {
            fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'frankFileInput';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
        }
=======
        this.bindNativeInputs();
        this.bindMenuTriggers();
        this.bindTrayControls();
    }
>>>>>>> 36f90df20e059503643acd212a167333da206ab6

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

<<<<<<< HEAD
    // ---------------- FILE SELECTION ----------------
    selectDocument(type = 'doc') {
        const fileInput = document.getElementById('frankFileInput');
        if (!fileInput) return;

        if (type === 'audio') {
            fileInput.accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.webm,.aac,.flac';
        } else if (type === 'video') {
            fileInput.accept = 'video/*,.mp4,.mov,.webm,.mkv';
        } else if (type === 'photo') {
            fileInput.accept = 'image/*,video/*,.png,.jpg,.jpeg,.webp,.gif,.mp4,.mov,.webm,.mkv';
        } else if (type === 'doc') {
            fileInput.accept = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.json,.zip,.rar,.7z,.tar,.gz';
        } else {
            fileInput.accept = '*/*';
        }

        fileInput.click();
    }

    // ---------------- VALIDATION & PREVIEW ----------------
    handleFileSelected(file) {
        if (!file) return;

        const filename = file.name;
        const ext = '.' + filename.split('.').pop().toLowerCase();

        // 1. Extension check
        if (this.disallowedExtensions.includes(ext)) {
            showToast('Unsupported file type. Executables and scripts cannot be shared.', 'error');
            return;
        }

        // 2. Size check
        if (file.size > this.maxFileSizeBytes) {
            const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
            showToast(`File size (${sizeMb} MB) exceeds the allowed limit of ${this.maxFileSizeMB} MB.`, 'error');
            return;
        }

        if (file.size === 0) {
            showToast('The selected file is empty.', 'error');
            return;
        }

        this.selectedFile = file;
        this.showPreviewDialog(file);
=======
    bindTrayControls() {
        // Remove button in staging tray
        this.dom.trayRemoveBtn?.addEventListener('click', () => {
            this.clearStagedFile();
        });

        // Cancel upload button in staging tray
        this.dom.trayCancelUploadBtn?.addEventListener('click', () => {
            this.cancelUpload();
        });
>>>>>>> 36f90df20e059503643acd212a167333da206ab6
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
        if (['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.opus'].includes(ext)) return 'audio';
        if (['.pdf'].includes(ext)) return 'pdf';
        if (['.doc', '.docx'].includes(ext)) return 'word';
        if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'excel';
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
        } else if (category === 'word') {
            badgeColor = '#2563EB';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>`;
        } else if (category === 'excel') {
            badgeColor = '#10B981';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line></svg>`;
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

        // 3. Category limits
        const category = this.getFileCategory(filename);
        let maxLimitMB = 25; // default for documents
        if (category === 'video') maxLimitMB = 100;
        else if (category === 'image') maxLimitMB = 10;
        else if (category === 'archive') maxLimitMB = 50;
        else if (category === 'audio') maxLimitMB = 25;

        const maxLimitBytes = maxLimitMB * 1024 * 1024;
        if (file.size > maxLimitBytes) {
            showToast('File is too large.', 'error');
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

<<<<<<< HEAD
                        <!-- Optional Caption Input -->
                        <div style="margin-top: 14px;">
                            <input type="text" id="docCaptionInput" class="form-input" placeholder="Add a caption... (optional)" style="width: 100%; border-radius: 8px; font-size: 13px; padding: 9px 12px; background: var(--surface); border: 1px solid var(--border);">
                        </div>

                        <!-- Progress Bar Container (hidden until user clicks Send) -->
                        <div class="upload-progress-wrapper" id="uploadProgressWrapper" style="display: none; margin-top: 16px;">
                            <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px;">
                                <span id="uploadStatusText">Preparing document...</span>
                                <span id="uploadPercentText">0%</span>
                            </div>
                            <div class="progress-bar-track">
                                <div class="progress-bar-fill" id="uploadProgressBar" style="width: 0%;"></div>
                            </div>
                        </div>
=======
        // Reset progress bar
        if (this.dom.trayProgressWrap) this.dom.trayProgressWrap.style.display = 'none';
        if (this.dom.trayProgressBar) this.dom.trayProgressBar.style.width = '0%';
        if (this.dom.trayCancelUploadBtn) this.dom.trayCancelUploadBtn.style.display = 'none';
        if (this.dom.trayRemoveBtn) this.dom.trayRemoveBtn.style.display = 'flex';
>>>>>>> 36f90df20e059503643acd212a167333da206ab6

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
        if (this.dom.trayProgressBar) this.dom.trayProgressBar.style.width = '0%';
        if (this.dom.trayProgressText) this.dom.trayProgressText.textContent = 'Uploading... 0%';
        if (this.dom.trayCancelUploadBtn) this.dom.trayCancelUploadBtn.style.display = 'inline-block';
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
            });

            if (this.dom.trayProgressBar) this.dom.trayProgressBar.style.width = '100%';
            if (this.dom.trayProgressText) this.dom.trayProgressText.textContent = 'Completed!';

            const replyId = chat.replyTo ? chat.replyTo.id : null;
            chat.clearReplying();

<<<<<<< HEAD
            const captionInput = document.getElementById('docCaptionInput');
            const captionText = captionInput ? captionInput.value.trim() : '';
            const messageContent = captionText || `Shared a file: ${uploadedDoc.original_filename}`;
=======
            const contentText = optionalCaption.trim() || `Shared a file: ${uploadedDoc.original_filename}`;
>>>>>>> 36f90df20e059503643acd212a167333da206ab6

            if (window.wsClient && window.wsClient.isConnected) {
                window.wsClient.send({
                    type: 'message',
                    recipient_id: chat.activeType === 'direct' ? chat.activeId : null,
                    group_id: chat.activeType === 'group' ? chat.activeId : null,
<<<<<<< HEAD
                    content: messageContent,
                    message_type: 'document',
=======
                    content: contentText,
                    message_type: messageType,
>>>>>>> 36f90df20e059503643acd212a167333da206ab6
                    file_id: uploadedDoc.id,
                    filename: uploadedDoc.original_filename,
                    reply_to_id: replyId
                });
            } else {
                // REST Fallback
                const newMsg = await api.sendMessage({
                    recipient_id: chat.activeType === 'direct' ? chat.activeId : null,
                    group_id: chat.activeType === 'group' ? chat.activeId : null,
<<<<<<< HEAD
                    content: messageContent,
                    message_type: 'document',
=======
                    content: contentText,
                    message_type: messageType,
>>>>>>> 36f90df20e059503643acd212a167333da206ab6
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
            if (this.dom.trayRemoveBtn) this.dom.trayRemoveBtn.style.display = 'flex';

            if (err.message && err.message.toLowerCase().includes('abort')) {
                // Was cancelled
                return false;
            }

            const friendlyError = err.message && err.message.includes('NetworkError')
                ? 'Connection lost. Upload could not be completed.'
                : (err.message || 'Upload failed. Please try again.');
            showToast(friendlyError, 'error');
            return false;
        }
    }

    // ---------------- AUTHENTICATED VIEWER & DOWNLOADER ----------------
    openDocument(fileId, fileType, originalFilename) {
        if (!fileId) return;

<<<<<<< HEAD
        if (window.mediaViewer) {
            window.mediaViewer.openDocument(fileId, fileType, originalFilename);
            return;
        }

        const viewableTypes = ['pdf', 'image', 'text'];
        if (!viewableTypes.includes(fileType)) {
=======
        const viewableTypes = ['pdf', 'image', 'video', 'text'];
        const viewUrl = api.getFileViewUrl(fileId);

        if (viewableTypes.includes(fileType)) {
            window.open(viewUrl, '_blank', 'noopener,noreferrer');
        } else {
>>>>>>> 36f90df20e059503643acd212a167333da206ab6
            this.downloadDocument(fileId, originalFilename);
        }
    }

    downloadDocument(fileId, originalFilename) {
        if (!fileId) return;

        const downloadUrl = api.getFileDownloadUrl(fileId);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = originalFilename || 'document';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast(`Downloading ${originalFilename || 'file'}...`, 'info', 1800);
    }
}

// Global initialization
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('frankPhotoInput') || document.getElementById('mainComposerBar')) {
        window.documentsController = new DocumentsController();
    }
});
