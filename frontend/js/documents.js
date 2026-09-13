/* -------------------------------------------------------------------------
   QENVO - DEDICATED DOCUMENT SHARING MODULE
   System file picker, client validation, preview confirmation, progress tracker,
   message sending, authenticated viewer & downloader.
   ------------------------------------------------------------------------- */

class DocumentsController {
    constructor() {
        this.maxFileSizeMB = 25;
        this.maxFileSizeBytes = this.maxFileSizeMB * 1024 * 1024;
        this.selectedFile = null;
        this.currentUploadXhr = null;

        this.disallowedExtensions = [
            '.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi', '.dll', '.com',
            '.scr', '.vbs', '.py', '.js', '.php', '.phtml', '.jar', '.app'
        ];

        this.init();
    }

    init() {
        // Create hidden OS file input
        let fileInput = document.getElementById('qenvoFileInput');
        if (!fileInput) {
            fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.id = 'qenvoFileInput';
            fileInput.style.display = 'none';
            document.body.appendChild(fileInput);
        }

        fileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
                this.handleFileSelected(files[0]);
            }
            // Reset input value so re-selecting same file triggers change
            fileInput.value = '';
        });
    }

    // ---------------- FILE SELECTION ----------------
    selectDocument(type = 'doc') {
        const fileInput = document.getElementById('qenvoFileInput');
        if (!fileInput) return;

        if (type === 'photo') {
            fileInput.accept = 'image/*,video/*';
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
        if (['.pdf'].includes(ext)) return 'pdf';
        if (['.doc', '.docx'].includes(ext)) return 'word';
        if (['.xls', '.xlsx', '.csv'].includes(ext)) return 'excel';
        if (['.ppt', '.pptx'].includes(ext)) return 'presentation';
        if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'archive';
        if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext)) return 'image';
        if (['.txt', '.json', '.md'].includes(ext)) return 'text';
        return 'document';
    }

    getFileBadgeMarkup(category, extUpper) {
        let badgeColor = '#6366F1';
        let iconSvg = '';

        if (category === 'pdf') {
            badgeColor = '#EF4444';
            iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;
        } else if (category === 'word') {
            badgeColor = '#2563EB';
            iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="12" y1="18" x2="12" y2="12"></line><line x1="9" y1="15" x2="15" y2="15"></line></svg>`;
        } else if (category === 'excel') {
            badgeColor = '#10B981';
            iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><line x1="12" y1="9" x2="12" y2="21"></line></svg>`;
        } else if (category === 'archive') {
            badgeColor = '#F59E0B';
            iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>`;
        } else {
            badgeColor = '#8B5CF6';
            iconSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
        }

        return `
            <div class="doc-badge-icon" style="background: ${badgeColor}18; color: ${badgeColor}; border: 1px solid ${badgeColor}33;">
                ${iconSvg}
                <span class="doc-badge-label" style="background: ${badgeColor};">${extUpper || 'DOC'}</span>
            </div>
        `;
    }

    // ---------------- PREVIEW DIALOG ----------------
    showPreviewDialog(file) {
        // Remove existing preview modal if present
        document.getElementById('documentPreviewModal')?.remove();

        const category = this.getFileCategory(file.name);
        const ext = file.name.split('.').pop().toUpperCase();
        const sizeStr = this.formatFileSize(file.size);
        const badgeHtml = this.getFileBadgeMarkup(category, ext);

        const modalHtml = `
            <div class="modal-backdrop show" id="documentPreviewModal" role="dialog" aria-modal="true" aria-labelledby="previewModalTitle">
                <div class="modal-card" style="max-width: 440px;">
                    <div class="modal-header">
                        <h2 class="modal-title" id="previewModalTitle">Send Document</h2>
                        <button type="button" class="modal-close" id="cancelDocPreviewCrossBtn" aria-label="Close">✕</button>
                    </div>
                    <div class="modal-body" style="padding: var(--space-5);">
                        <div class="document-preview-card">
                            ${badgeHtml}
                            <div class="document-preview-info">
                                <div class="document-preview-filename" title="${messagesModule.escapeHTML(file.name)}">
                                    ${messagesModule.escapeHTML(file.name)}
                                </div>
                                <div class="document-preview-meta">
                                    ${sizeStr} • ${ext} Document
                                </div>
                            </div>
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

                        <!-- Upload Error message if any -->
                        <div id="uploadErrorBox" style="display: none; margin-top: 14px; padding: 10px 14px; border-radius: var(--radius-md); background: var(--danger-soft); color: var(--danger); font-size: 13px; font-weight: 500;">
                            <div id="uploadErrorMessage">Document upload failed.</div>
                        </div>
                    </div>
                    <div class="modal-footer" id="previewModalFooter">
                        <button type="button" class="btn btn-secondary" id="cancelDocPreviewBtn">Cancel</button>
                        <button type="button" class="btn btn-primary" id="confirmSendDocBtn">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                            Send Document
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('cancelDocPreviewCrossBtn')?.addEventListener('click', () => this.closePreviewDialog());
        document.getElementById('cancelDocPreviewBtn')?.addEventListener('click', () => this.closePreviewDialog());
        document.getElementById('confirmSendDocBtn')?.addEventListener('click', () => this.startUploadAndSend());
    }

    closePreviewDialog() {
        if (this.currentUploadXhr) {
            this.currentUploadXhr.abort();
            this.currentUploadXhr = null;
        }
        document.getElementById('documentPreviewModal')?.remove();
        this.selectedFile = null;
    }

    // ---------------- UPLOAD & SEND FLOW ----------------
    async startUploadAndSend() {
        if (!this.selectedFile) return;

        const chat = window.chatController;
        if (!chat || !chat.activeId) {
            showToast('Please select a conversation first.', 'error');
            this.closePreviewDialog();
            return;
        }

        const confirmBtn = document.getElementById('confirmSendDocBtn');
        const cancelBtn = document.getElementById('cancelDocPreviewBtn');
        const progressWrapper = document.getElementById('uploadProgressWrapper');
        const progressBar = document.getElementById('uploadProgressBar');
        const statusText = document.getElementById('uploadStatusText');
        const percentText = document.getElementById('uploadPercentText');
        const errorBox = document.getElementById('uploadErrorBox');
        const errorMsg = document.getElementById('uploadErrorMessage');

        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = 'Uploading...';
        }
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (progressWrapper) progressWrapper.style.display = 'block';
        if (errorBox) errorBox.style.display = 'none';

        const formData = new FormData();
        formData.append('file', this.selectedFile);

        if (chat.activeType === 'direct') {
            formData.append('partner_id', chat.activeId);
        } else if (chat.activeType === 'group') {
            formData.append('group_id', chat.activeId);
        }

        try {
            if (statusText) statusText.textContent = 'Uploading document...';

            const uploadedDoc = await api.uploadFile(formData, (percent) => {
                if (progressBar) progressBar.style.width = `${percent}%`;
                if (percentText) percentText.textContent = `${percent}%`;
                if (statusText) {
                    if (percent < 90) statusText.textContent = `Uploading document... ${percent}%`;
                    else statusText.textContent = 'Processing & verifying file...';
                }
            });

            if (statusText) statusText.textContent = 'Sent!';
            if (progressBar) progressBar.style.width = '100%';

            // Send message with document payload
            const replyId = chat.replyTo ? chat.replyTo.id : null;
            chat.clearReplying();

            if (window.wsClient && window.wsClient.isConnected) {
                window.wsClient.ws.send(JSON.stringify({
                    type: 'message',
                    recipient_id: chat.activeType === 'direct' ? chat.activeId : null,
                    group_id: chat.activeType === 'group' ? chat.activeId : null,
                    content: `Shared a file: ${uploadedDoc.original_filename}`,
                    message_type: 'document',
                    file_id: uploadedDoc.id,
                    filename: uploadedDoc.original_filename,
                    reply_to_id: replyId
                }));
            } else {
                // REST Fallback
                const newMsg = await api.sendMessage({
                    recipient_id: chat.activeType === 'direct' ? chat.activeId : null,
                    group_id: chat.activeType === 'group' ? chat.activeId : null,
                    content: `Shared a file: ${uploadedDoc.original_filename}`,
                    message_type: 'document',
                    file_id: uploadedDoc.id,
                    reply_to_id: replyId
                });

                const currentUser = auth.getUser();
                chat.appendMessage(newMsg, currentUser ? currentUser.id : null);
            }

            showToast('Document sent successfully!', 'success');
            setTimeout(() => this.closePreviewDialog(), 400);

        } catch (err) {
            console.error('Upload error:', err);
            if (statusText) statusText.textContent = 'Upload failed';
            if (progressBar) progressBar.style.background = 'var(--danger)';
            if (errorBox) {
                errorBox.style.display = 'block';
                if (errorMsg) errorMsg.textContent = err.message || 'Document upload failed. Please try again.';
            }

            if (confirmBtn) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Retry Upload';
            }
            if (cancelBtn) {
                cancelBtn.style.display = 'inline-flex';
                cancelBtn.textContent = 'Remove';
            }
        }
    }

    // ---------------- OPEN & DOWNLOAD ACTION HANDLERS ----------------
    openDocument(fileId, fileType, originalFilename) {
        if (!fileId) return;

        const viewableTypes = ['pdf', 'image', 'text'];
        const viewUrl = api.getFileViewUrl(fileId);

        if (viewableTypes.includes(fileType)) {
            // Open in new browser tab
            window.open(viewUrl, '_blank', 'noopener,noreferrer');
        } else {
            // Browser cannot render docx/xlsx/zip directly inline; trigger download
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

// Global singleton instance
window.documentsController = new DocumentsController();
