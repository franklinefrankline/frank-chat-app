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

        const isSameDay = d.getFullYear() === now.getFullYear() &&
                          d.getMonth() === now.getMonth() &&
                          d.getDate() === now.getDate();

        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const isYesterday = d.getFullYear() === yesterday.getFullYear() &&
                            d.getMonth() === yesterday.getMonth() &&
                            d.getDate() === yesterday.getDate();

        if (isSameDay) return this.formatTime(d);
        if (isYesterday) return 'Yesterday';
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

    getPlainTextOnly(msg, docFilename) {
        if (!msg || !msg.content) return '';
        const content = String(msg.content).trim();
        // Ignore automatic placeholder text generated for uploads/voice
        if (content.startsWith('Shared a file:')) return '';
        if (content === 'Voice message') return '';
        if (docFilename) {
            if (content === docFilename || content === `[Document] ${docFilename}`) return '';
        }
        return content;
    },

    copyToClipboard(text) {
        const clean = (text || '').trim();
        if (!clean) {
            if (typeof showToast === 'function') {
                showToast('Nothing to copy', 'info', 1500);
            }
            return;
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(clean)
                .then(() => {
                    if (typeof showToast === 'function') {
                        showToast('✓ Copied', 'success', 1500);
                    }
                })
                .catch(() => {
                    this.fallbackCopy(clean);
                });
        } else {
            this.fallbackCopy(clean);
        }
    },

    fallbackCopy(text) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            ta.style.top = '-9999px';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            const success = document.execCommand('copy');
            document.body.removeChild(ta);
            if (success) {
                if (typeof showToast === 'function') showToast('✓ Copied', 'success', 1500);
            } else {
                if (typeof showToast === 'function') showToast('Failed to copy', 'error', 1500);
            }
        } catch (err) {
            if (typeof showToast === 'function') showToast('Failed to copy', 'error', 1500);
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
            let replyAuthor = 'Message';
            let replySnippet = `message #${msg.reply_to_id}`;
            if (msg.replied_message) {
                replyAuthor = msg.replied_message.sender ? (msg.replied_message.sender.full_name || msg.replied_message.sender.username) : 'User';
                replySnippet = msg.replied_message.content || 'Attachment';
            } else if (window.chatController && window.chatController.activeMessages) {
                const foundOrig = window.chatController.activeMessages.find(m => m.id === msg.reply_to_id);
                if (foundOrig) {
                    const myId = typeof auth !== 'undefined' && auth.getUser() ? auth.getUser().id : null;
                    replyAuthor = (foundOrig.sender && (foundOrig.sender.full_name || foundOrig.sender.username)) || (foundOrig.sender_id === myId ? 'You' : 'User');
                    replySnippet = foundOrig.content || 'Attachment';
                }
            }
            replyHtml = `
                <div class="message-reply-quote" onclick="document.getElementById('msgRow-${msg.reply_to_id}')?.scrollIntoView({behavior:'smooth', block:'center'})" title="Click to view original message">
                    <span class="reply-author">${this.escapeHTML(replyAuthor)}</span>
                    <span class="reply-text">${this.escapeHTML(replySnippet)}</span>
                </div>
            `;
        }

        const safeContent = this.escapeHTML(msg.content);

        // Determine message type
        const doc = msg.document || {};
        let docFileId = doc.id || msg.file_id || '';
        let docFilename = doc.original_filename || (msg.content && msg.content.startsWith('Shared a file: ') ? msg.content.replace(/^Shared a file: /, '') : '') || '';
        let docFileType = doc.file_type || (window.documentsController && docFilename ? window.documentsController.getFileCategory(docFilename) : 'document');

        const isAudio = msg.message_type === 'audio' || docFileType === 'audio' || (docFilename && /\.(webm|mp3|wav|ogg|m4a|aac|flac)$/i.test(docFilename));
        const isDocument = !isAudio && (msg.message_type === 'document' || !!msg.file_id || !!msg.document);
        const isMedia = isAudio || isDocument || !!docFileId;

        const plainUserText = this.getPlainTextOnly(msg, docFilename);

        let bodyHtml = `<div class="message-text-content">${safeContent}</div>`;

        if (isAudio) {
            const viewUrl = docFileId ? api.getFileViewUrl(docFileId) : '';
            bodyHtml = `
                ${plainUserText ? `<div class="message-text-content" style="margin-bottom: 8px;">${this.escapeHTML(plainUserText)}</div>` : ''}
                <div class="message-audio-card" data-file-id="${docFileId}">
                    <button type="button" class="audio-play-btn" aria-label="Play voice message" onclick="messagesModule.toggleAudio(this, '${viewUrl}')">
                        <svg class="icon-play" width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                        <svg class="icon-pause" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                    </button>
                    <div class="audio-waveform-container">
                        <div class="audio-waveform-bars">
                            <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
                        </div>
                        <div class="audio-meta">
                            <span class="audio-timer">Voice message</span>
                            <span class="audio-ext">AUDIO</span>
                        </div>
                    </div>
                    <audio class="msg-audio-el" src="${viewUrl}" preload="metadata" style="display:none;"></audio>
                </div>
            `;
        } else if (isDocument) {
            docFilename = docFilename || (plainUserText ? 'Document' : msg.content) || 'Document';
            const ext = docFilename.split('.').pop().toUpperCase();
            const sizeStr = (doc.file_size && window.documentsController) ? window.documentsController.formatFileSize(doc.file_size) : `${ext} Document`;
            let mediaEmbed = '';
            const viewUrl = api.getFileViewUrl(docFileId);
            const badgeHtml = window.documentsController 
                ? window.documentsController.getDocumentBadgeHtml(docFileType)
                : '<div class="file-icon-badge" style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;background:var(--surface-elevated);border-radius:var(--radius-md);">📄</div>';

            if (docFileType === 'video') {
                mediaEmbed = `
                    <div class="message-video-wrap" style="margin-top: 8px; border-radius: 10px; overflow: hidden; background: #000; max-width: 380px; cursor: pointer;" onclick="if(window.mediaViewer) window.mediaViewer.open({ fileId: ${docFileId}, fileType: 'video', filename: '${this.escapeHTML(docFilename)}', timeStr: '${this.escapeHTML(timeStr)}' })">
                        <video controls playsinline preload="metadata" style="width: 100%; max-height: 260px; display: block;" src="${viewUrl}"></video>
                    </div>
                `;
            } else if (docFileType === 'image') {
                mediaEmbed = `
                    <div class="message-image-wrap" style="margin-top: 8px; border-radius: 10px; overflow: hidden; max-width: 380px;">
                        <img loading="lazy" class="message-media-thumbnail" style="width: 100%; max-height: 260px; object-fit: cover; display: block; border-radius: 10px; cursor: pointer;" src="${viewUrl}" alt="${this.escapeHTML(docFilename)}" data-file-id="${docFileId}" data-file-type="image" data-filename="${this.escapeHTML(docFilename)}" data-time="${this.escapeHTML(timeStr)}" onclick="if(window.mediaViewer) window.mediaViewer.openFromMessage(this)">
                    </div>
                `;
            }

            bodyHtml = `
                ${plainUserText ? `<div class="message-text-content" style="margin-bottom: 8px;">${this.escapeHTML(plainUserText)}</div>` : ''}
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
                        <button type="button" class="btn btn-sm btn-primary msg-doc-open-btn" data-file-id="${docFileId}" data-file-type="${docFileType}" data-filename="${this.escapeHTML(docFilename)}" data-time="${this.escapeHTML(timeStr)}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                            ${docFileType === 'video' ? 'Play Video' : (docFileType === 'image' ? 'View Photo' : 'Open Document')}
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary msg-doc-download-btn" data-file-id="${docFileId}" data-filename="${this.escapeHTML(docFilename)}" title="Download">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Download
                        </button>
                    </div>
                </div>
            `;
        }

        const senderName = isSent ? 'You' : (msg.sender ? (msg.sender.full_name || msg.sender.username) : 'User');
        const replySnippetText = plainUserText || (isMedia ? `[${docFileType.toUpperCase()}] ${docFilename}` : (msg.content || 'Message'));

        return `
            <div class="message-row ${isSent ? 'sent' : 'received'} ${isDocument ? 'has-document' : ''}" id="msgRow-${msg.id}" data-message-id="${msg.id}">
                <!-- Message Actions Toolbar -->
                <div class="message-actions-toolbar" role="toolbar" aria-label="Message actions">
                    <button type="button" class="action-tool-btn msg-action-reply" title="Reply" aria-label="Reply" data-msg-id="${msg.id}" data-sender="${this.escapeHTML(senderName)}" data-content="${this.escapeHTML(replySnippetText)}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>
                    </button>
                    <button type="button" class="action-tool-btn msg-action-react" title="React with heart" aria-label="React with heart" data-msg-id="${msg.id}" data-emoji="❤️">❤️</button>
                    <button type="button" class="action-tool-btn msg-action-react" title="React with like" aria-label="React with like" data-msg-id="${msg.id}" data-emoji="👍">👍</button>
                    <button type="button" class="action-tool-btn msg-action-react" title="React with laugh" aria-label="React with laugh" data-msg-id="${msg.id}" data-emoji="😂">😂</button>
                    <button type="button" class="action-tool-btn msg-action-react" title="React with fire" aria-label="React with fire" data-msg-id="${msg.id}" data-emoji="🔥">🔥</button>
                    <button type="button" class="action-tool-btn msg-action-copy" title="Copy message" aria-label="Copy message" data-text="${this.escapeHTML(plainUserText)}">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                    ${isMedia && docFileId ? `
                        <button type="button" class="action-tool-btn msg-action-download" title="Download" aria-label="Download attachment" data-file-id="${docFileId}" data-filename="${this.escapeHTML(docFilename)}">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        </button>
                    ` : ''}
                    ${isSent && !isMedia ? `
                        <button type="button" class="action-tool-btn msg-action-edit" title="Edit message" aria-label="Edit message" data-msg-id="${msg.id}">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                        </button>
                    ` : ''}
                    ${isSent ? `
                        <button type="button" class="action-tool-btn msg-action-delete" title="Delete message" aria-label="Delete message" data-msg-id="${msg.id}" style="color:var(--danger);">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
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
    },

    toggleAudio(btn, src) {
        const card = btn.closest('.message-audio-card');
        if (!card) return;
        let audio = card.querySelector('audio');
        if (!audio) return;

        const playIcon = btn.querySelector('.icon-play');
        const pauseIcon = btn.querySelector('.icon-pause');
        const waveform = card.querySelector('.audio-waveform-bars');

        if (audio.paused) {
            // Pause any other playing audios
            document.querySelectorAll('audio.msg-audio-el').forEach(a => {
                if (a !== audio && !a.paused) {
                    a.pause();
                    const otherCard = a.closest('.message-audio-card');
                    if (otherCard) {
                        const otherPlay = otherCard.querySelector('.icon-play');
                        const otherPause = otherCard.querySelector('.icon-pause');
                        if (otherPlay) otherPlay.style.display = 'block';
                        if (otherPause) otherPause.style.display = 'none';
                        otherCard.querySelector('.audio-waveform-bars')?.classList.remove('playing');
                    }
                }
            });

            audio.play().then(() => {
                if (playIcon) playIcon.style.display = 'none';
                if (pauseIcon) pauseIcon.style.display = 'block';
                if (waveform) waveform.classList.add('playing');
            }).catch(e => console.log('Audio playback error:', e));

            audio.ontimeupdate = () => {
                const timer = card.querySelector('.audio-timer');
                if (timer && audio.duration) {
                    const curM = Math.floor(audio.currentTime / 60);
                    const curS = Math.floor(audio.currentTime % 60).toString().padStart(2, '0');
                    const durM = Math.floor(audio.duration / 60);
                    const durS = Math.floor(audio.duration % 60).toString().padStart(2, '0');
                    timer.textContent = `${curM}:${curS} / ${durM}:${durS}`;
                }
            };

            audio.onended = () => {
                if (playIcon) playIcon.style.display = 'block';
                if (pauseIcon) pauseIcon.style.display = 'none';
                if (waveform) waveform.classList.remove('playing');
                const timer = card.querySelector('.audio-timer');
                if (timer) timer.textContent = 'Voice message';
            };
        } else {
            audio.pause();
            if (playIcon) playIcon.style.display = 'block';
            if (pauseIcon) pauseIcon.style.display = 'none';
            if (waveform) waveform.classList.remove('playing');
        }
    }
};

window.messagesModule = messagesModule;

// Message Event Delegation (Reply, React, Copy, Download, Edit, Delete, Open Doc)
document.addEventListener('click', async (e) => {
    // 1. React to message
    const reactBtn = e.target.closest('.msg-action-react, .reaction-pill');
    if (reactBtn) {
        e.stopPropagation();
        e.preventDefault();
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

    // 2. Copy message text (TEXT ONLY - never image/url/metadata)
    const copyBtn = e.target.closest('.msg-action-copy');
    if (copyBtn) {
        e.stopPropagation();
        e.preventDefault();
        const text = copyBtn.getAttribute('data-text') || '';
        messagesModule.copyToClipboard(text);
        return;
    }

    // 3. Download attachment
    const downloadBtn = e.target.closest('.msg-action-download, .msg-action-download-doc, .msg-doc-download-btn');
    if (downloadBtn) {
        e.stopPropagation();
        e.preventDefault();
        const fileId = parseInt(downloadBtn.dataset.fileId, 10);
        const filename = downloadBtn.dataset.filename || 'attachment';
        if (fileId) {
            if (window.documentsController) {
                window.documentsController.downloadDocument(fileId, filename);
            } else {
                const downloadUrl = api.getFileDownloadUrl(fileId);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast(`Downloading ${filename}...`, 'info', 1800);
            }
        }
        return;
    }

    // 4. Reply to message
    const replyBtn = e.target.closest('.msg-action-reply');
    if (replyBtn) {
        e.stopPropagation();
        e.preventDefault();
        const messageId = parseInt(replyBtn.dataset.msgId, 10);
        const sender = replyBtn.dataset.sender || 'User';
        const content = replyBtn.dataset.content || '';
        if (window.chatController) {
            window.chatController.setReplying(messageId, sender, content);
        }
        return;
    }

    // 5. Open document / media in same-page viewer
    const openDocBtn = e.target.closest('.msg-doc-open-btn, .msg-action-open-doc');
    if (openDocBtn) {
        e.stopPropagation();
        e.preventDefault();
        const fileId = parseInt(openDocBtn.dataset.fileId, 10);
        const fileType = openDocBtn.dataset.fileType;
        const filename = openDocBtn.dataset.filename;
        const timeStr = openDocBtn.dataset.time || '';
        if (window.mediaViewer) {
            window.mediaViewer.openDocument(fileId, fileType, filename, timeStr);
        } else if (window.documentsController) {
            window.documentsController.openDocument(fileId, fileType, filename);
        }
        return;
    }

    // 6. Edit message
    const editBtn = e.target.closest('.msg-action-edit');
    if (editBtn) {
        e.stopPropagation();
        e.preventDefault();
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

    // 7. Delete message
    const deleteBtn = e.target.closest('.msg-action-delete');
    if (deleteBtn) {
        e.stopPropagation();
        e.preventDefault();
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
});
