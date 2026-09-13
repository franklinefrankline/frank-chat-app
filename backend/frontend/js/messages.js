/* -------------------------------------------------------------------------
   MESSAGE RENDERING & FORMATTING MODULE
   Clean HTML generation, XSS prevention, relative timestamps, and reactions
   ------------------------------------------------------------------------- */

const messagesModule = {
    escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    // Parse UTC ISO timestamp string safely into a Date object
    parseDate(dateInput) {
        if (!dateInput) return null;
        if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
        let s = String(dateInput).trim();
        if (!s) return null;
        // If string lacks timezone indicator (Z or +/-offset), append Z so browser treats as UTC
        if (!s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
            if (s.includes('T')) {
                s = s + 'Z';
            }
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    },

    // Format clean 12-hour time: e.g. "7:42 PM" (no leading zero on hour, no seconds)
    formatTime(dateStr) {
        const d = this.parseDate(dateStr);
        if (!d) return '';
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
    },

    // Contextual message timestamp:
    // Today: "7:42 PM"
    // Yesterday: "Yesterday, 7:42 PM"
    // Older this year: "Sep 12, 7:42 PM"
    // Older other year: "Sep 12, 2025, 7:42 PM"
    formatMessageTimestamp(dateStr) {
        const d = this.parseDate(dateStr);
        if (!d) return '';
        const now = new Date();
        const timeStr = this.formatTime(d);

        const isSameDay = (d1, d2) =>
            d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();

        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);

        if (isSameDay(d, now)) {
            return timeStr;
        } else if (isSameDay(d, yesterday)) {
            return `Yesterday, ${timeStr}`;
        } else if (d.getFullYear() === now.getFullYear()) {
            const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `${monthDay}, ${timeStr}`;
        } else {
            const monthDayYear = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return `${monthDayYear}, ${timeStr}`;
        }
    },

    // Format date divider: "Today", "Yesterday", or "Sep 12, 2026"
    formatDividerDate(dateStr) {
        const d = this.parseDate(dateStr);
        if (!d) return '';
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);

        const isSameDay = (d1, d2) =>
            d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();

        if (isSameDay(d, now)) return 'Today';
        if (isSameDay(d, yesterday)) return 'Yesterday';
        if (d.getFullYear() === now.getFullYear()) {
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },

    formatRelativeTime(dateStr) {
        const d = this.parseDate(dateStr);
        if (!d) return '';
        const now = new Date();
        const diffMs = now - d;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHours = Math.floor(diffMin / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSec < 60) return 'Just now';
        if (diffMin < 60) return `${diffMin}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
        if (d.getFullYear() === now.getFullYear()) {
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    },

    getStatusIcon(status) {
        if (status === 'read') {
            return `<span class="message-status-check read" title="Read"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 6 7 17 2 12"></polyline><polyline points="22 10 13 19 11 17"></polyline></svg></span>`;
        } else if (status === 'delivered') {
            return `<span class="message-status-check delivered" title="Delivered"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 6 7 17 2 12"></polyline><polyline points="22 10 13 19 11 17"></polyline></svg></span>`;
        } else {
            return `<span class="message-status-check sent" title="Sent"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>`;
        }
    },

    renderMessageRow(msg, currentUserId) {
        const isSent = msg.sender_id === currentUserId;
        const timeFormatted = this.formatMessageTimestamp(msg.created_at);
        const isEdited = !!msg.updated_at;
        const timeStr = `${timeFormatted}${isEdited ? ' · Edited' : ''}`;
        const fullTooltip = `Sent: ${this.formatMessageTimestamp(msg.created_at)}${isEdited ? ` · Edited: ${this.formatMessageTimestamp(msg.updated_at)}` : ''}`;
        const statusIcon = isSent ? this.getStatusIcon(msg.status) : '';

        // Reaction badges aggregation
        const reactionCounts = {};
        let userReactedEmoji = null;
        (msg.reactions || []).forEach(r => {
            reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
            if (r.user_id === currentUserId) {
                userReactedEmoji = r.emoji;
            }
        });

        let reactionsHtml = '';
        if (Object.keys(reactionCounts).length > 0) {
            reactionsHtml = '<div class="reaction-badges">';
            for (const [emoji, count] of Object.entries(reactionCounts)) {
                const isUser = userReactedEmoji === emoji;
                reactionsHtml += `
                    <button type="button" class="reaction-pill ${isUser ? 'user-reacted' : ''}" data-msg-id="${msg.id}" data-emoji="${emoji}">
                        <span>${emoji}</span>
                        ${count > 1 ? `<span style="font-size:10px; font-weight:700;">${count}</span>` : ''}
                    </button>
                `;
            }
            reactionsHtml += '</div>';
        }

        // Reply quote block
        let replyHtml = '';
        if (msg.reply_to_id) {
            replyHtml = `
                <div class="message-reply-quote">
                    <strong>Replying to message #${msg.reply_to_id}</strong>
                </div>
            `;
        }

        const safeContent = this.escapeHTML(msg.content);

        // Document or regular text message
        const isDocument = msg.message_type === 'document' || !!msg.file_id || !!msg.document;
        let bodyHtml = `<div class="message-text-content">${safeContent}</div>`;
        let docFilename = '';
        let docFileId = '';
        let docFileType = 'document';

        if (isDocument) {
            const doc = msg.document || {};
            docFileId = doc.id || msg.file_id || '';
            docFilename = doc.original_filename || msg.content.replace(/^Shared a file: /, '') || 'Document';
            docFileType = doc.file_type || (window.documentsController ? window.documentsController.getFileCategory(docFilename) : 'document');
            const ext = docFilename.split('.').pop().toUpperCase();
            const sizeStr = (doc.file_size && window.documentsController) ? window.documentsController.formatFileSize(doc.file_size) : `${ext} Document`;
            let mediaEmbed = '';
            const viewUrl = api.getFileViewUrl(docFileId);
            if (docFileType === 'video') {
                mediaEmbed = `
                    <div class="message-video-wrap" style="margin-top: 10px; border-radius: 10px; overflow: hidden; background: #000; max-width: 380px;">
                        <video controls playsinline preload="metadata" style="width: 100%; max-height: 260px; display: block;" src="${viewUrl}"></video>
                    </div>
                `;
            } else if (docFileType === 'image') {
                mediaEmbed = `
                    <div class="message-image-wrap" style="margin-top: 10px; border-radius: 10px; overflow: hidden; max-width: 380px;">
                        <img loading="lazy" style="width: 100%; max-height: 260px; object-fit: cover; display: block; border-radius: 10px; cursor: pointer;" src="${viewUrl}" alt="${this.escapeHTML(docFilename)}" onclick="window.open('${viewUrl}', '_blank')">
                    </div>
                `;
            }

            bodyHtml = `
                <div class="message-document-card" data-file-id="${docFileId}" data-file-type="${docFileType}" data-filename="${this.escapeHTML(docFilename)}">
                    <div class="message-doc-header">
                        ${badgeHtml}
                        <div class="message-doc-meta">
                            <div class="message-doc-title" title="${this.escapeHTML(docFilename)}">${this.escapeHTML(docFilename)}</div>
                            <div class="message-doc-sub">${sizeStr} • ${ext}</div>
                        </div>
                    </div>
                    ${mediaEmbed}
                    <div class="message-doc-actions">
                        <button type="button" class="btn btn-sm btn-primary msg-doc-open-btn" data-file-id="${docFileId}" data-file-type="${docFileType}" data-filename="${this.escapeHTML(docFilename)}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            ${docFileType === 'video' ? 'Play Video' : 'Open Document'}
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary msg-doc-download-btn" data-file-id="${docFileId}" data-filename="${this.escapeHTML(docFilename)}" title="Download">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Download
                        </button>
                    </div>
                </div>
            `;
        }

        const senderName = isSent ? 'You' : (msg.sender ? msg.sender.full_name : 'User');

        return `
            <div class="message-row ${isSent ? 'sent' : 'received'} ${isDocument ? 'has-document' : ''}" id="msgRow-${msg.id}" data-message-id="${msg.id}">
                <!-- Hover Action Toolbar -->
                <div class="message-actions-toolbar">
                    <button type="button" class="action-tool-btn msg-action-reply" title="Reply" data-msg-id="${msg.id}" data-sender="${senderName}" data-content="${isDocument ? `[Document] ${this.escapeHTML(docFilename)}` : safeContent}">
                        ↩
                    </button>
                    ${isDocument ? `
                        <button type="button" class="action-tool-btn msg-action-open-doc" title="Open Document" data-file-id="${docFileId}" data-file-type="${docFileType}" data-filename="${this.escapeHTML(docFilename)}">
                            👁️
                        </button>
                        <button type="button" class="action-tool-btn msg-action-download-doc" title="Download" data-file-id="${docFileId}" data-filename="${this.escapeHTML(docFilename)}">
                            ⬇️
                        </button>
                        <button type="button" class="action-tool-btn msg-action-copy" title="Copy Filename" data-content="${this.escapeHTML(docFilename)}">
                            📋
                        </button>
                    ` : `
                        <button type="button" class="action-tool-btn msg-action-react" title="Love" data-msg-id="${msg.id}" data-emoji="❤️">❤️</button>
                        <button type="button" class="action-tool-btn msg-action-react" title="Thumbs Up" data-msg-id="${msg.id}" data-emoji="👍">👍</button>
                        <button type="button" class="action-tool-btn msg-action-react" title="Laugh" data-msg-id="${msg.id}" data-emoji="😂">😂</button>
                        <button type="button" class="action-tool-btn msg-action-react" title="Fire" data-msg-id="${msg.id}" data-emoji="🔥">🔥</button>
                        <button type="button" class="action-tool-btn msg-action-copy" title="Copy Text" data-content="${safeContent}">
                            📋
                        </button>
                    `}
                    ${isSent && !isDocument ? `
                        <button type="button" class="action-tool-btn msg-action-edit" title="Edit Message" data-msg-id="${msg.id}">
                            ✏️
                        </button>
                    ` : ''}
                    ${isSent ? `
                        <button type="button" class="action-tool-btn msg-action-delete" title="Delete" data-msg-id="${msg.id}" style="color:var(--danger);">
                            🗑
                        </button>
                    ` : ''}
                </div>

                <!-- Bubble Content -->
                <div class="message-bubble ${isDocument ? 'document-bubble' : ''}">
                    ${replyHtml}
                    ${bodyHtml}
                </div>

                <!-- Metadata (Time & Read Status) -->
                <div class="message-meta">
                    <span class="message-time" title="${this.escapeHTML(fullTooltip)}">${timeStr}</span>
                    ${statusIcon}
                </div>

                <!-- Reactions -->
                ${reactionsHtml}
            </div>
        `;
    }
};

window.messagesModule = messagesModule;

// Message Event Delegation (Reply, React, Copy, Edit, Delete)
document.addEventListener('click', async (e) => {
    // 1. React to message
    const reactBtn = e.target.closest('.msg-action-react, .reaction-pill');
    if (reactBtn) {
        const messageId = parseInt(reactBtn.dataset.msgId, 10);
        const emoji = reactBtn.dataset.emoji;
        if (messageId && emoji) {
            if (window.wsClient && window.wsClient.isConnected) {
                window.wsClient.sendReaction(messageId, emoji);
            } else {
                try {
                    await api.toggleReaction(messageId, emoji);
                } catch (err) {
                    showToast('Failed to toggle reaction', 'error');
                }
            }
        }
        return;
    }

    // 2. Copy message text
    const copyBtn = e.target.closest('.msg-action-copy');
    if (copyBtn) {
        const text = copyBtn.dataset.content;
        if (text) {
            navigator.clipboard.writeText(text).then(() => {
                showToast('Message copied to clipboard', 'info', 1500);
            });
        }
        return;
    }

    // 3. Edit message
    const editBtn = e.target.closest('.msg-action-edit');
    if (editBtn) {
        const messageId = parseInt(editBtn.dataset.msgId, 10);
        const row = document.getElementById(`msgRow-${messageId}`);
        if (messageId && row) {
            const currentMsg = (window.chatController && window.chatController.activeMessages)
                ? window.chatController.activeMessages.find(m => m.id === messageId)
                : null;
            const currentContent = currentMsg ? currentMsg.content : (row.querySelector('.message-text-content')?.textContent || '');

            const newContent = prompt('Edit your message:', currentContent);
            if (newContent !== null && newContent.trim() !== '' && newContent.trim() !== currentContent) {
                const trimmed = newContent.trim();
                try {
                    if (window.wsClient && window.wsClient.isConnected) {
                        window.wsClient.sendEditMessage(messageId, trimmed);
                    } else {
                        const updated = await api.editMessage(messageId, trimmed);
                        if (window.chatController) {
                            window.chatController.handleMessageEdited(updated);
                        }
                    }
                    showToast('Message updated', 'success');
                } catch (err) {
                    showToast(err.message || 'Failed to edit message', 'error');
                }
            }
        }
        return;
    }

    // 4. Delete message
    const deleteBtn = e.target.closest('.msg-action-delete');
    if (deleteBtn) {
        const messageId = parseInt(deleteBtn.dataset.msgId, 10);
        if (messageId) {
            createConfirmModal('Delete Message', 'Are you sure you want to delete this message? This action cannot be undone.', async () => {
                try {
                    await api.deleteMessage(messageId);
                    const row = document.getElementById(`msgRow-${messageId}`);
                    if (row) row.remove();
                    showToast('Message deleted', 'info');
                } catch (err) {
                    showToast(err.message || 'Failed to delete message', 'error');
                }
            });
        }
        return;
    }

    // 5. Reply to message
    const replyBtn = e.target.closest('.msg-action-reply');
    if (replyBtn) {
        const messageId = parseInt(replyBtn.dataset.msgId, 10);
        const sender = replyBtn.dataset.sender;
        const content = replyBtn.dataset.content;
        if (window.chatController) {
            window.chatController.setReplying(messageId, sender, content);
        }
        return;
    }

    // 5. Open document
    const openDocBtn = e.target.closest('.msg-doc-open-btn, .msg-action-open-doc');
    if (openDocBtn) {
        const fileId = parseInt(openDocBtn.dataset.fileId, 10);
        const fileType = openDocBtn.dataset.fileType;
        const filename = openDocBtn.dataset.filename;
        if (window.documentsController) {
            window.documentsController.openDocument(fileId, fileType, filename);
        }
        return;
    }

    // 6. Download document
    const downloadDocBtn = e.target.closest('.msg-doc-download-btn, .msg-action-download-doc');
    if (downloadDocBtn) {
        const fileId = parseInt(downloadDocBtn.dataset.fileId, 10);
        const filename = downloadDocBtn.dataset.filename;
        if (window.documentsController) {
            window.documentsController.downloadDocument(fileId, filename);
        }
        return;
    }
});
