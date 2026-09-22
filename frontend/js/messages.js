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
        // Normalize space separator to 'T' for ISO compliance
        if (s.includes(' ') && !s.includes('T')) {
            s = s.replace(' ', 'T');
        }
        // If string lacks timezone indicator (Z or +/-offset), append Z so browser treats as UTC
        if (!s.endsWith('Z') && !/[+-]\d{2}:?\d{2}$/.test(s)) {
            s = s + 'Z';
        }
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    },

    // Format clean 12-hour time: e.g. "7:42 PM" (no leading zero on hour, no seconds)
    formatTime(dateStr) {
        const d = (dateStr instanceof Date) ? dateStr : this.parseDate(dateStr);
        if (!d) return '';
        return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    },

    // Contextual message timestamp displaying BOTH date and time:
    // Today: "Today, Sep 15 • 7:42 PM"
    // Yesterday: "Yesterday, Sep 14 • 7:42 PM"
    // Older this year: "Sep 12 • 7:42 PM"
    // Older other year: "Sep 12, 2025 • 7:42 PM"
    formatMessageTimestamp(dateStr) {
        const d = this.parseDate(dateStr) || new Date();
        const now = new Date();
        const timeStr = this.formatTime(d);

        const isSameDay = (d1, d2) =>
            d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();

        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);

        const monthDay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        if (isSameDay(d, now)) {
            return `Today, ${monthDay} • ${timeStr}`;
        } else if (isSameDay(d, yesterday)) {
            return `Yesterday, ${monthDay} • ${timeStr}`;
        } else if (d.getFullYear() === now.getFullYear()) {
            return `${monthDay} • ${timeStr}`;
        } else {
            const monthDayYear = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            return `${monthDayYear} • ${timeStr}`;
        }
    },

    // Format date divider: "Today — September 15, 2026", "Yesterday — September 14, 2026", or "September 12, 2026"
    formatDividerDate(dateStr) {
        const d = this.parseDate(dateStr) || new Date();
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);

        const isSameDay = (d1, d2) =>
            d1.getFullYear() === d2.getFullYear() &&
            d1.getMonth() === d2.getMonth() &&
            d1.getDate() === d2.getDate();

        const monthDayYear = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

        if (isSameDay(d, now)) return `Today — ${monthDayYear}`;
        if (isSameDay(d, yesterday)) return `Yesterday — ${monthDayYear}`;
        return monthDayYear;
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

    linkify(escapedText) {
        if (!escapedText) return '';
        // Match http, https, or www.
        const urlRegex = /(https?:\/\/[^\s<"']+)|(\bwww\.[^\s<"']+)/gi;
        return escapedText.replace(urlRegex, (match) => {
            let url = match;
            let trailing = '';
            const punctMatch = url.match(/[.,;:!?)]+$/);
            if (punctMatch) {
                trailing = punctMatch[0];
                url = url.slice(0, -trailing.length);
            }
            let href = url;
            if (!href.startsWith('http://') && !href.startsWith('https://')) {
                href = 'https://' + href;
            }
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="chat-link" onclick="event.stopPropagation()">${url}</a>${trailing}`;
        });
    },

    renderMessageRow(msg, currentUserId) {
        const isSent = msg.sender_id === currentUserId;
        const msgDateObj = this.parseDate(msg.created_at) || new Date();
        const timeFormatted = this.formatMessageTimestamp(msg.created_at || msgDateObj);
        const isEdited = !!msg.updated_at && msg.updated_at !== msg.created_at;
        const isPinned = !!msg.is_pinned;
        const isStarred = !!msg.is_starred;
        const pinBadge = isPinned ? `<span class="message-pin-indicator" title="Pinned message">📌</span>` : '';
        const starBadge = isStarred ? `<span class="message-star-indicator" title="Starred message">⭐</span>` : '';
        const timeStr = `${pinBadge}${starBadge}${timeFormatted}${isEdited ? ' <span class="message-edited-badge" style="font-size:10px; opacity:0.75; font-style:italic;" title="Edited">(Edited)</span>' : ''}`;
        const fullDateStr = msgDateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        const fullTooltip = `Sent: ${fullDateStr} at ${this.formatTime(msgDateObj)}${isEdited ? ` · Edited: ${this.formatMessageTimestamp(msg.updated_at)}` : ''}`;
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
            const repliedMsg = (window.chatController && window.chatController.activeMessages)
                ? window.chatController.activeMessages.find(m => Number(m.id || m.message_id) === Number(msg.reply_to_id))
                : null;
            const repliedSender = repliedMsg?.sender ? (repliedMsg.sender.full_name || repliedMsg.sender.username) : 'Message';
            const repliedContent = repliedMsg ? this.escapeHTML(repliedMsg.content || (repliedMsg.document ? repliedMsg.document.original_filename : 'Attachment')) : `#${msg.reply_to_id}`;
            replyHtml = `
                <div class="message-reply-quote" onclick="const target=document.getElementById('msgRow-${msg.reply_to_id}'); if(target){ target.scrollIntoView({behavior:'smooth'}); target.classList.add('highlight-pulse'); setTimeout(()=>target.classList.remove('highlight-pulse'), 1500); }" title="Click to view replied message">
                    <span style="font-weight: 700; font-size: 11px; color: var(--primary); display: block;">${repliedSender}</span>
                    <div style="font-size: 11px; color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px;">${repliedContent}</div>
                </div>
            `;
        }

        const safeContent = this.escapeHTML(msg.content);
        const linkedContent = this.linkify(safeContent);

        // Attachment categorization
        const isAudio = msg.message_type === 'audio' || (msg.document && msg.document.file_type === 'audio');
        const isVideo = msg.message_type === 'video' || (msg.document && msg.document.file_type === 'video');
        const isImage = msg.message_type === 'image' || (msg.document && msg.document.file_type === 'image');
        const isDocument = (msg.message_type === 'document' || !!msg.file_id || !!msg.document) && !isAudio && !isVideo && !isImage;
        const isDocAttachment = isDocument;
        const hasAttachment = isAudio || isVideo || isImage || isDocument;

        let bodyHtml = `<div class="message-text-content">${linkedContent}</div>`;
        let docFilename = '';
        let docFileId = '';
        let docFileType = 'document';

        if (hasAttachment) {
            const doc = msg.document || {};
            docFileId = doc.id || msg.file_id || '';
            docFilename = doc.original_filename || msg.filename || (isAudio ? 'voice-message.webm' : (isVideo ? 'video.mp4' : (isImage ? 'photo.jpg' : 'Document')));
            docFileType = doc.file_type || (window.documentsController ? window.documentsController.getFileCategory(docFilename) : (isAudio ? 'audio' : (isVideo ? 'video' : (isImage ? 'image' : 'document'))));
            const viewUrl = api.getFileViewUrl(docFileId);
            const ext = docFilename.split('.').pop().toUpperCase();
            const sizeStr = (doc.file_size && window.documentsController) ? window.documentsController.formatFileSize(doc.file_size) : '';

            if (isAudio) {
                // 1. VOICE MESSAGE PLAYER
                const rawDuration = msg.duration || doc.duration || 0;
                const durationLabel = rawDuration > 0
                    ? (window.voiceRecorder ? window.voiceRecorder.formatTime(Math.round(rawDuration)) : `${Math.round(rawDuration)}s`)
                    : '00:12';

                bodyHtml = `
                    <div class="message-voice-card" data-file-id="${docFileId}">
                        <div class="voice-card-header">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
                            <span style="font-weight: 700; font-size: 13px;">Voice message</span>
                        </div>
                        <div class="voice-card-player">
                            <button type="button" class="voice-play-toggle-btn" data-audio-url="${viewUrl}" aria-label="Play voice message">
                                <svg class="play-svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                <svg class="pause-svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                            </button>
                            <div class="voice-track-scrubber" data-audio-url="${viewUrl}">
                                <div class="voice-track-fill" style="width: 0%;"></div>
                            </div>
                            <span class="voice-time-label">${durationLabel}</span>
                        </div>
                        ${(safeContent && safeContent !== 'Voice message' && !safeContent.startsWith('Shared a file:')) ? `<div class="message-caption">${linkedContent}</div>` : ''}
                    </div>
                `;
            } else if (isImage) {
                // 2. PHOTO MESSAGE
                bodyHtml = `
                    <div class="message-photo-card" data-file-id="${docFileId}">
                        <div class="msg-photo-wrap">
                            <img loading="lazy" class="msg-photo-img" src="${viewUrl}" alt="${this.escapeHTML(docFilename)}" data-file-id="${docFileId}" data-file-type="image" data-filename="${this.escapeHTML(docFilename)}">
                        </div>
                        ${(safeContent && !safeContent.startsWith('Shared a file:')) ? `<div class="message-caption">${linkedContent}</div>` : ''}
                    </div>
                `;
            } else if (isVideo) {
                // 3. VIDEO MESSAGE
                bodyHtml = `
                    <div class="message-video-card" data-file-id="${docFileId}">
                        <div class="msg-video-wrap">
                            <video controls playsinline preload="metadata" class="msg-video-player" src="${viewUrl}"></video>
                        </div>
                        ${(safeContent && !safeContent.startsWith('Shared a file:')) ? `<div class="message-caption">${linkedContent}</div>` : ''}
                    </div>
                `;
            } else {
                // 4. DOCUMENT MESSAGE
                const badgeHtml = window.documentsController ? window.documentsController.getFileBadgeMarkup(docFileType, ext) : `<div class="doc-badge-icon">📄</div>`;
                bodyHtml = `
                    <div class="message-document-card" data-file-id="${docFileId}" data-file-type="${docFileType}" data-filename="${this.escapeHTML(docFilename)}">
                        <div class="message-doc-header">
                            ${badgeHtml}
                            <div class="message-doc-meta">
                                <div class="message-doc-title" title="${this.escapeHTML(docFilename)}">${this.escapeHTML(docFilename)}</div>
                                <div class="message-doc-sub">${sizeStr || ext} • ${ext}</div>
                            </div>
                        </div>
                        ${(safeContent && !safeContent.startsWith('Shared a file:')) ? `<div class="message-caption">${linkedContent}</div>` : ''}
                        <div class="message-doc-actions">
                            <button type="button" class="btn btn-sm btn-primary msg-doc-open-btn" data-file-id="${docFileId}" data-file-type="${docFileType}" data-filename="${this.escapeHTML(docFilename)}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                Open
                            </button>
                            <button type="button" class="btn btn-sm btn-secondary msg-doc-download-btn" data-file-id="${docFileId}" data-filename="${this.escapeHTML(docFilename)}" title="Download">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                Download
                            </button>
                        </div>
                    </div>
                `;
            }
        }

        const senderName = isSent ? 'You' : (msg.sender ? msg.sender.full_name : 'User');

        // Professional Outline SVG Icons for Actions
        const replySvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>`;
        const copySvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const editSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
        const deleteSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        const downloadSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
        const openSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
        const moreSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>`;

        const hasRealText = safeContent && !safeContent.startsWith('Shared a file:') && safeContent !== 'Voice message';
        const copyContent = hasRealText ? safeContent : '';

        return `
            <div class="message-row ${isSent ? 'sent' : 'received'} ${hasAttachment ? 'has-document' : ''}" id="msgRow-${msg.id}" data-message-id="${msg.id}">
                <!-- Hover Action Toolbar -->
                <div class="message-actions-toolbar">
                    <button type="button" class="action-tool-btn msg-action-reply" title="Reply" data-msg-id="${msg.id}" data-sender="${senderName}" data-content="${isDocument ? `[Document] ${this.escapeHTML(docFilename)}` : safeContent}">
                        ${replySvg}
                    </button>
                    <!-- Emoji reactions -->
                    <button type="button" class="action-tool-btn msg-action-react" title="Love" data-msg-id="${msg.id}" data-emoji="❤️">❤️</button>
                    <button type="button" class="action-tool-btn msg-action-react" title="Thumbs Up" data-msg-id="${msg.id}" data-emoji="👍">👍</button>
                    <button type="button" class="action-tool-btn msg-action-react" title="Laugh" data-msg-id="${msg.id}" data-emoji="😂">😂</button>
                    <button type="button" class="action-tool-btn msg-action-react" title="Fire" data-msg-id="${msg.id}" data-emoji="🔥">🔥</button>

                    ${hasAttachment ? `
                        ${(isDocument || isImage || isVideo) ? `
                            <button type="button" class="action-tool-btn msg-action-open-doc" title="Open" data-file-id="${docFileId}" data-file-type="${docFileType}" data-filename="${this.escapeHTML(docFilename)}">
                                ${openSvg}
                            </button>
                        ` : ''}
                        <button type="button" class="action-tool-btn msg-action-download-doc" title="Download" data-file-id="${docFileId}" data-filename="${this.escapeHTML(docFilename)}">
                            ${downloadSvg}
                        </button>
                        ${hasRealText ? `
                            <button type="button" class="action-tool-btn msg-action-copy" title="Copy Text" data-msg-id="${msg.id}" data-content="${copyContent}">
                                ${copySvg}
                            </button>
                            ${isSent ? `
                                <button type="button" class="action-tool-btn msg-action-edit" title="Edit Message" data-msg-id="${msg.id}">
                                    ${editSvg}
                                </button>
                            ` : ''}
                        ` : ''}
                    ` : `
                        <button type="button" class="action-tool-btn msg-action-copy" title="Copy Text" data-msg-id="${msg.id}" data-content="${safeContent}">
                            ${copySvg}
                        </button>
                        ${isSent ? `
                            <button type="button" class="action-tool-btn msg-action-edit" title="Edit Message" data-msg-id="${msg.id}">
                                ${editSvg}
                            </button>
                        ` : ''}
                    `}

                    ${isSent ? `
                        <button type="button" class="action-tool-btn msg-action-delete" title="Delete" data-msg-id="${msg.id}">
                            ${deleteSvg}
                        </button>
                    ` : ''}

                    <!-- 3-Dots More Options Menu -->
                    <button type="button" class="action-tool-btn msg-action-more-btn" title="Message Options" data-msg-id="${msg.id}">
                        ${moreSvg}
                    </button>
                </div>

                <!-- Bubble Content -->
                <div class="message-bubble ${isDocument ? 'document-bubble' : ''}">
                    <button type="button" class="bubble-more-trigger" title="Message Options" data-msg-id="${msg.id}" aria-label="Message options">
                        ${moreSvg}
                    </button>
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

// Throttled Audio Error Toast Helper
let lastAudioToastTime = 0;
function showAudioErrorToast(message) {
    const now = Date.now();
    if (now - lastAudioToastTime > 2500) {
        lastAudioToastTime = now;
        if (window.showToast) {
            window.showToast(message, 'error');
        }
    }
}

// Message Event Delegation (Links, Context Menu, Reply, React, Copy, Edit, Delete, Open, Download)
document.addEventListener('click', async (e) => {
    // 0a. Open chat link in new tab safely
    const chatLink = e.target.closest('a.chat-link');
    if (chatLink) {
        e.stopPropagation();
        if (window.open && chatLink.href) {
            window.open(chatLink.href, '_blank', 'noopener,noreferrer');
            e.preventDefault();
        }
        return;
    }

    // 0b. Open in-message context menu
    const moreBtn = e.target.closest('.msg-action-more-btn, .bubble-more-trigger');
    if (moreBtn) {
        e.stopPropagation();
        const messageId = parseInt(moreBtn.dataset.msgId, 10);
        if (window.chatController) {
            window.chatController.openMessageContextMenu(e, messageId);
        }
        return;
    }
    // 1. React to message
    const reactBtn = e.target.closest('.msg-action-react, .reaction-pill');
    if (reactBtn) {
        e.stopPropagation();
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

    // 2. Copy message text (plain text only, latest edited content guaranteed)
    const copyBtn = e.target.closest('.msg-action-copy');
    if (copyBtn) {
        e.stopPropagation();
        const row = copyBtn.closest('.message-row');
        const messageId = parseInt(copyBtn.dataset.msgId || (row ? row.dataset.messageId : ''), 10);
        const currentMsg = (window.chatController && window.chatController.activeMessages)
            ? window.chatController.activeMessages.find(m => Number(m.id || m.message_id) === messageId)
            : null;
        const liveEl = row ? row.querySelector('.message-text-content') : null;
        const text = (currentMsg ? currentMsg.content : (liveEl ? liveEl.textContent : copyBtn.dataset.content || '')).trim();
        if (!text) {
            showToast('Nothing to copy', 'info');
            return;
        }
        navigator.clipboard.writeText(text).then(() => {
            showToast('✓ Copied', 'success', 1500);
        }).catch(() => {
            showToast('Unable to copy message', 'error');
        });
        return;
    }

    // 3. Edit message (in-composer editing strip, no window.prompt)
    const editBtn = e.target.closest('.msg-action-edit');
    if (editBtn) {
        e.stopPropagation();
        const messageId = parseInt(editBtn.dataset.msgId, 10);
        const row = document.getElementById(`msgRow-${messageId}`);
        if (messageId && row) {
            const currentMsg = (window.chatController && window.chatController.activeMessages)
                ? window.chatController.activeMessages.find(m => Number(m.id || m.message_id) === messageId)
                : null;
            const liveEl = row.querySelector('.message-text-content');
            const currentContent = currentMsg ? currentMsg.content : (liveEl ? liveEl.textContent : (editBtn.dataset.content || ''));

            if (window.chatController) {
                window.chatController.setEditing(messageId, currentContent);
            }
        }
        return;
    }

    // 4. Delete message (confirmation modal, backend authorized, synchronized UI removal)
    const deleteBtn = e.target.closest('.msg-action-delete');
    if (deleteBtn) {
        e.stopPropagation();
        const messageId = parseInt(deleteBtn.dataset.msgId, 10);
        if (messageId) {
            createConfirmModal('Delete Message', 'Delete this message? This action cannot be undone.', async () => {
                try {
                    if (window.wsClient && window.wsClient.isConnected) {
                        window.wsClient.sendDeleteMessage(messageId);
                    }
                    await api.deleteMessage(messageId);
                    if (window.chatController) {
                        window.chatController.handleMessageDeleted(messageId);
                    }
                    showToast('Message deleted', 'info');
                } catch (err) {
                    console.error('Delete error, removing from local view:', err);
                    if (window.chatController) {
                        window.chatController.handleMessageDeleted(messageId);
                    }
                    showToast('Message deleted', 'info');
                }
            });
        }
        return;
    }

    // 5. Reply to message
    const replyBtn = e.target.closest('.msg-action-reply');
    if (replyBtn) {
        e.stopPropagation();
        const messageId = parseInt(replyBtn.dataset.msgId, 10);
        const row = document.getElementById(`msgRow-${messageId}`) || replyBtn.closest('.message-row');
        const currentMsg = (window.chatController && window.chatController.activeMessages)
            ? window.chatController.activeMessages.find(m => Number(m.id || m.message_id) === messageId)
            : null;
        const sender = replyBtn.dataset.sender || (currentMsg && currentMsg.sender ? (currentMsg.sender.full_name || currentMsg.sender.username) : 'User');
        const liveEl = row ? row.querySelector('.message-text-content') : null;
        const content = (currentMsg ? currentMsg.content : (liveEl ? liveEl.textContent : replyBtn.dataset.content)) || 'Message';
        if (window.chatController) {
            window.chatController.setReplying(messageId, sender, content);
        }
        return;
    }

    // 6. Open document / media (Photos, Videos, PDFs, Audio, Docs)
    const openDocBtn = e.target.closest('.msg-doc-open-btn, .msg-action-open-doc, .msg-photo-img, .message-photo-card, .msg-video-player, .message-video-card, .msg-video-wrap');
    if (openDocBtn) {
        e.stopPropagation();
        const card = openDocBtn.closest('.message-photo-card, .message-document-card, .message-video-card, .message-voice-card, .message-row');
        const rawFileId = openDocBtn.dataset.fileId || (card ? card.dataset.fileId : '') || (card ? card.dataset.messageId : '');
        const fileId = rawFileId ? parseInt(rawFileId, 10) : null;
        let fileType = openDocBtn.dataset.fileType;
        if (!fileType) {
            if (openDocBtn.classList.contains('msg-photo-img') || openDocBtn.classList.contains('message-photo-card')) fileType = 'image';
            else if (openDocBtn.classList.contains('msg-video-player') || openDocBtn.classList.contains('message-video-card') || openDocBtn.classList.contains('msg-video-wrap')) fileType = 'video';
            else fileType = card?.dataset.fileType || 'document';
        }
        const filename = openDocBtn.dataset.filename || card?.dataset.filename || openDocBtn.getAttribute('alt') || 'Document';
        const directUrl = openDocBtn.dataset.viewUrl || card?.dataset.viewUrl || openDocBtn.src || openDocBtn.querySelector('img, video, audio')?.src || '';
        if (window.documentsController) {
            window.documentsController.openDocument(fileId, fileType, filename, directUrl);
        }
        return;
    }

    // 7. Download document / media
    const downloadDocBtn = e.target.closest('.msg-doc-download-btn, .msg-action-download-doc');
    if (downloadDocBtn) {
        e.stopPropagation();
        const card = downloadDocBtn.closest('.message-photo-card, .message-document-card, .message-video-card, .message-voice-card, .message-row');
        const rawFileId = downloadDocBtn.dataset.fileId || (card ? card.dataset.fileId : '');
        const fileId = rawFileId ? parseInt(rawFileId, 10) : null;
        const filename = downloadDocBtn.dataset.filename || card?.dataset.filename || 'document';
        const directUrl = downloadDocBtn.dataset.viewUrl || card?.dataset.viewUrl || '';
        if (window.documentsController) {
            window.documentsController.downloadDocument(fileId, filename, directUrl);
        }
        return;
    }

    // 8. Voice message play/pause toggle
    const voiceBtn = e.target.closest('.voice-play-toggle-btn');
    if (voiceBtn) {
        e.stopPropagation();
        const audioUrl = voiceBtn.dataset.audioUrl;
        if (!audioUrl) return;

        const card = voiceBtn.closest('.message-voice-card');
        const scrubber = card ? card.querySelector('.voice-track-scrubber') : null;
        const fill = scrubber ? scrubber.querySelector('.voice-track-fill') : null;
        const timeLabel = card ? card.querySelector('.voice-time-label') : null;
        const playSvg = voiceBtn.querySelector('.play-svg');
        const pauseSvg = voiceBtn.querySelector('.pause-svg');

        // If clicking the currently playing audio button
        if (currentChatAudio && currentChatAudioBtn === voiceBtn) {
            if (!currentChatAudio.paused) {
                currentChatAudio.pause();
                if (playSvg) playSvg.style.display = 'block';
                if (pauseSvg) pauseSvg.style.display = 'none';
            } else {
                currentChatAudio.play().then(() => {
                    if (playSvg) playSvg.style.display = 'none';
                    if (pauseSvg) pauseSvg.style.display = 'block';
                }).catch(err => {
                    if (err.name !== 'AbortError') {
                        console.error('Audio play error:', err);
                        showAudioErrorToast('Unable to play audio message');
                    }
                });
            }
            return;
        }

        // Stop previous audio if any
        stopCurrentChatAudio();

        // Create new Audio instance
        const audio = new Audio(audioUrl);
        currentChatAudio = audio;
        currentChatAudioBtn = voiceBtn;
        currentChatAudioScrubber = scrubber;
        currentChatAudioTimeLabel = timeLabel;
        if (timeLabel) currentChatAudioOriginalText = timeLabel.textContent;

        if (playSvg) playSvg.style.display = 'none';
        if (pauseSvg) pauseSvg.style.display = 'block';

        audio.addEventListener('timeupdate', () => {
            if (audio.duration && !isNaN(audio.duration)) {
                const pct = Math.min(100, Math.max(0, (audio.currentTime / audio.duration) * 100));
                if (fill) fill.style.width = `${pct}%`;
                if (timeLabel) {
                    const curM = Math.floor(audio.currentTime / 60);
                    const curS = Math.floor(audio.currentTime % 60);
                    timeLabel.textContent = `${curM}:${curS < 10 ? '0' : ''}${curS}`;
                }
            }
        });

        audio.addEventListener('ended', () => {
            stopCurrentChatAudio();
        });

        audio.addEventListener('error', (err) => {
            console.error('Audio load/playback error:', err);
            stopCurrentChatAudio();
            showAudioErrorToast('Unable to play audio message');
        });

        audio.play().catch(err => {
            if (err.name !== 'AbortError') {
                console.error('Audio play error:', err);
                stopCurrentChatAudio();
                showAudioErrorToast('Unable to play audio message');
            }
        });
        return;
    }

    // 9. Voice scrubber seek
    const voiceScrubber = e.target.closest('.voice-track-scrubber');
    if (voiceScrubber) {
        e.stopPropagation();
        const card = voiceScrubber.closest('.message-voice-card');
        const btn = card ? card.querySelector('.voice-play-toggle-btn') : null;
        if (currentChatAudio && currentChatAudioBtn === btn && currentChatAudio.duration) {
            const rect = voiceScrubber.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const pct = Math.max(0, Math.min(1, clickX / rect.width));
            currentChatAudio.currentTime = pct * currentChatAudio.duration;
            const fill = voiceScrubber.querySelector('.voice-track-fill');
            if (fill) fill.style.width = `${pct * 100}%`;
        }
        return;
    }
});

// Context menu right-click on message bubble/row
document.addEventListener('contextmenu', (e) => {
    const row = e.target.closest('.message-row');
    if (row && window.chatController) {
        e.preventDefault();
        const msgId = parseInt(row.dataset.messageId, 10);
        window.chatController.openMessageContextMenu(e, msgId);
    }
});

// Global Audio Playback State for Voice Messages
let currentChatAudio = null;
let currentChatAudioBtn = null;
let currentChatAudioScrubber = null;
let currentChatAudioTimeLabel = null;
let currentChatAudioOriginalText = '';

function stopCurrentChatAudio() {
    if (currentChatAudio) {
        currentChatAudio.pause();
        currentChatAudio = null;
    }
    if (currentChatAudioBtn) {
        const playSvg = currentChatAudioBtn.querySelector('.play-svg');
        const pauseSvg = currentChatAudioBtn.querySelector('.pause-svg');
        if (playSvg) playSvg.style.display = 'block';
        if (pauseSvg) pauseSvg.style.display = 'none';
        currentChatAudioBtn = null;
    }
    if (currentChatAudioScrubber) {
        const fill = currentChatAudioScrubber.querySelector('.voice-track-fill');
        if (fill) fill.style.width = '0%';
        currentChatAudioScrubber = null;
    }
    if (currentChatAudioTimeLabel && currentChatAudioOriginalText) {
        currentChatAudioTimeLabel.textContent = currentChatAudioOriginalText;
        currentChatAudioTimeLabel = null;
        currentChatAudioOriginalText = '';
    }
}


