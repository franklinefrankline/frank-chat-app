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

    formatMessageContent(content) {
        if (!content && content !== 0) return '';
        const rawText = String(content);
        let html = '';

        if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
            try {
                html = marked.parse(rawText, { breaks: true, gfm: true });
            } catch (err) {
                console.warn('Marked parsing fallback:', err);
                const safe = this.escapeHTML(rawText);
                html = this.linkify(safe).replace(/\n/g, '<br>');
            }
        } else {
            const safe = this.escapeHTML(rawText);
            html = this.linkify(safe).replace(/\n/g, '<br>');
        }

        if (typeof DOMPurify !== 'undefined' && typeof DOMPurify.sanitize === 'function') {
            html = DOMPurify.sanitize(html, {
                ADD_ATTR: ['target', 'rel', 'class', 'style'],
                FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form']
            });
        }

        // Ensure all anchor tags have safe attributes & chat-link class
        html = html.replace(/<a\s+(?:[^>]*?\s+)?href="([^"]*)"([^>]*)>/gi, (match, href, rest) => {
            const cleanRest = rest.replace(/\s*(?:target|rel|class)="[^"]*"/gi, '');
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="chat-link" onclick="event.stopPropagation()"${cleanRest}>`;
        });

        return html;
    },

    renderMessage(msg, currentUserId, options) {
        return this.renderMessageRow(msg, currentUserId, options);
    },

    renderMessageRow(msg, currentUserId, options = {}) {
        const isSent = Number(msg.sender_id) === Number(currentUserId);
        const isGroup = (options && options.isGroup !== undefined)
            ? !!options.isGroup
            : (window.chatController && window.chatController.activeType === 'group');
        const isConsecutive = !!(options && options.isConsecutive);
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
            if (Number(r.user_id) === Number(currentUserId)) {
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
        const safeContent = this.escapeHTML(msg.content || '');
        const formattedContent = this.formatMessageContent(msg.content);
        const linkedContent = formattedContent;

        // Attachment categorization
        const isAudio = msg.message_type === 'audio' || (msg.document && msg.document.file_type === 'audio');
        const isVideo = msg.message_type === 'video' || (msg.document && msg.document.file_type === 'video');
        const isImage = msg.message_type === 'image' || (msg.document && msg.document.file_type === 'image');
        const isDocument = (msg.message_type === 'document' || !!msg.file_id || !!msg.document) && !isAudio && !isVideo && !isImage;
        const isDocAttachment = isDocument;
        const hasAttachment = isAudio || isVideo || isImage || isDocument;

        // Recipient translation handling (Feature B)
        const hasTranslation = !hasAttachment && !!msg.translated_content && (msg.translated_content.trim() !== (msg.content || '').trim());
        const showTranslatedByDefault = localStorage.getItem('pref_settingDefaultViewTranslation') !== 'false';

        let bodyHtml = '';
        if (hasTranslation) {
            const formattedTrans = this.formatMessageContent(msg.translated_content);
            const showTransNow = showTranslatedByDefault;

            const origLabel = (typeof i18n !== 'undefined') ? i18n.t('chat.showOriginal') : 'Show original';
            const transLabel = (typeof i18n !== 'undefined') ? i18n.t('chat.showTranslation') : 'Show translation';
            const currentToggleText = showTransNow ? origLabel : transLabel;
            const targetLangBadge = (msg.target_language || (typeof i18n !== 'undefined' ? i18n.currentLang : 'ta')).toUpperCase();

            bodyHtml = `
                <div class="message-text-content" id="msgTextContent-${msg.id}">
                    <div class="msg-text-variant msg-text-trans" id="msgTransText-${msg.id}" style="${showTransNow ? '' : 'display:none;'}">
                        ${formattedTrans}
                    </div>
                    <div class="msg-text-variant msg-text-orig" id="msgOrigText-${msg.id}" style="${showTransNow ? 'display:none;' : ''}">
                        ${formattedContent}
                    </div>
                    <div class="message-translation-controls" style="margin-top: 4px; display: flex; align-items: center; gap: 6px; font-size: 11px;">
                        <button type="button" class="btn-toggle-msg-translation" data-msg-id="${msg.id}" style="background: none; border: none; padding: 0; color: var(--primary); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600;">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
                            <span class="toggle-trans-label">${currentToggleText}</span>
                        </button>
                        <span class="translation-badge" style="background: rgba(37,99,235,0.12); color: var(--primary); padding: 1px 5px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase;">${targetLangBadge}</span>
                    </div>
                </div>
            `;
        } else {
            bodyHtml = `<div class="message-text-content" id="msgTextContent-${msg.id}">${formattedContent}</div>`;
        }
        let docFilename = '';
        let docFileId = '';
        let docFileType = 'document';
        let viewUrl = '';

        if (hasAttachment) {
            const doc = msg.document || {};
            docFileId = doc.id || msg.file_id || '';
            const docVersion = doc.current_version_number || null;
            docFilename = doc.original_filename || msg.filename || (isAudio ? 'voice-message.webm' : (isVideo ? 'video.mp4' : (isImage ? 'photo.jpg' : 'Document')));
            docFileType = doc.file_type || (window.documentsController ? window.documentsController.getFileCategory(docFilename) : (isAudio ? 'audio' : (isVideo ? 'video' : (isImage ? 'image' : 'document'))));
            viewUrl = (docFileId ? api.getFileViewUrl(docFileId, docVersion) : '') || doc.file_url || msg.file_url || msg.attachment_url || '';
            const downloadUrl = (docFileId ? api.getFileDownloadUrl(docFileId, docVersion) : '') || viewUrl;
            const ext = docFilename.split('.').pop().toUpperCase();
            const sizeStr = (doc.file_size && window.documentsController) ? window.documentsController.formatFileSize(doc.file_size) : '';

            if (isAudio) {
                // 1. VOICE MESSAGE PLAYER
                const rawDuration = msg.duration || doc.duration || 0;
                const durationLabel = rawDuration > 0
                    ? (window.voiceRecorder ? window.voiceRecorder.formatTime(Math.round(rawDuration)) : `${Math.round(rawDuration)}s`)
                    : '00:12';

                bodyHtml = `
                    <div class="message-voice-card" data-file-id="${docFileId}" data-direct-url="${viewUrl}" data-version="${docVersion || ''}">
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
                    <div class="message-photo-card" data-file-id="${docFileId}" data-direct-url="${viewUrl}" data-version="${docVersion || ''}">
                        <div class="msg-photo-wrap">
                            <img loading="lazy" class="msg-photo-img" src="${viewUrl}" alt="${this.escapeHTML(docFilename)}" data-file-id="${docFileId}" data-file-type="image" data-filename="${this.escapeHTML(docFilename)}" data-direct-url="${viewUrl}" data-version="${docVersion || ''}">
                        </div>
                        ${(safeContent && !safeContent.startsWith('Shared a file:')) ? `<div class="message-caption">${linkedContent}</div>` : ''}
                    </div>
                `;
            } else if (isVideo) {
                // 3. VIDEO MESSAGE
                bodyHtml = `
                    <div class="message-video-card" data-file-id="${docFileId}" data-direct-url="${viewUrl}" data-version="${docVersion || ''}">
                        <div class="msg-video-wrap">
                            <video controls playsinline preload="metadata" class="msg-video-player" src="${viewUrl}" data-direct-url="${viewUrl}" data-version="${docVersion || ''}"></video>
                        </div>
                        ${(safeContent && !safeContent.startsWith('Shared a file:')) ? `<div class="message-caption">${linkedContent}</div>` : ''}
                    </div>
                `;
            } else {
                // 4. DOCUMENT MESSAGE
                const badgeHtml = window.documentsController ? window.documentsController.getFileBadgeMarkup(docFileType, ext) : `<div class="doc-badge-icon">📄</div>`;
                bodyHtml = `
                    <div class="message-document-card" data-file-id="${docFileId}" data-file-type="${docFileType}" data-filename="${this.escapeHTML(docFilename)}" data-direct-url="${viewUrl}" data-download-url="${downloadUrl}" data-version="${docVersion || ''}" data-file-size="${doc.file_size || ''}" data-timestamp="${msg.created_at || ''}">
                        <div class="message-doc-header">
                            ${badgeHtml}
                            <div class="message-doc-meta">
                                <div class="message-doc-title" title="${this.escapeHTML(docFilename)}">${this.escapeHTML(docFilename)}</div>
                                <div class="message-doc-sub">${sizeStr || ext} • ${ext}${docVersion ? ` • v${docVersion}` : ''}</div>
                            </div>
                        </div>
                        ${(safeContent && !safeContent.startsWith('Shared a file:')) ? `<div class="message-caption">${linkedContent}</div>` : ''}
                        <div class="message-doc-actions">
                            <button type="button" class="btn btn-sm btn-primary msg-doc-open-btn" data-file-id="${docFileId}" data-file-type="${docFileType}" data-filename="${this.escapeHTML(docFilename)}" data-direct-url="${viewUrl}" data-version="${docVersion || ''}" data-file-size="${doc.file_size || ''}" data-timestamp="${msg.created_at || ''}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                Open
                            </button>
                            <button type="button" class="btn btn-sm btn-secondary msg-doc-download-btn" data-file-id="${docFileId}" data-filename="${this.escapeHTML(docFilename)}" data-direct-url="${downloadUrl}" data-version="${docVersion || ''}" title="Download">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:4px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                Download
                            </button>
                            <button type="button" class="btn btn-sm btn-secondary msg-doc-smart-btn" data-msg-id="${msg.id}" data-file-id="${docFileId}" data-filename="${this.escapeHTML(docFilename)}" title="Smart Conversation AI Analysis">
                                ✨ AI
                            </button>
                        </div>
                    </div>
                `;
            }
        }

        const senderDisplayName = msg.sender
            ? (msg.sender.full_name || msg.sender.username || 'Member')
            : (msg.sender_name || 'Member');
        const senderName = isSent ? 'You' : senderDisplayName;

        const senderInitials = senderDisplayName
            .split(' ')
            .filter(Boolean)
            .map(w => w[0])
            .slice(0, 2)
            .join('')
            .toUpperCase() || 'M';
        const senderAvatarUrl = msg.sender?.avatar_url || msg.sender?.avatar || '';
        const avatarMarkup = senderAvatarUrl
            ? `<img src="${senderAvatarUrl}" class="message-sender-avatar" alt="${this.escapeHTML(senderDisplayName)}" loading="lazy">`
            : `<div class="message-sender-avatar message-avatar-placeholder" title="${this.escapeHTML(senderDisplayName)}">${senderInitials}</div>`;

        // Professional Outline SVG Icons for Actions
        const replySvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"></polyline><path d="M20 18v-2a4 4 0 0 0-4-4H4"></path></svg>`;
        const copySvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
        const editSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
        const deleteSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        const downloadSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
        const openSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
        const moreSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>`;

        const hasRealText = safeContent && !safeContent.startsWith('Shared a file:') && safeContent !== 'Voice message';
        const copyPayload = hasRealText ? safeContent : (docFilename || safeContent || '');

        return `
            <div class="message-row ${isSent ? 'sent' : 'received'} ${isGroup ? 'is-group' : ''} ${isConsecutive ? 'is-consecutive' : ''} ${hasAttachment ? 'has-document' : ''}" id="msgRow-${msg.id}" data-message-id="${msg.id}">
                <div class="message-row-content">
                    ${(isGroup && !isSent) ? `
                    <div class="message-avatar-col" ${isConsecutive ? 'aria-hidden="true" style="visibility:hidden;"' : ''}>
                        ${avatarMarkup}
                    </div>
                    ` : ''}
                    <div class="message-bubble-col">
                        <!-- Message Action Toolbar: Exactly 8 actions in required order -->
                        <div class="message-actions-toolbar" role="toolbar" aria-label="Message actions">
                            <!-- 1. Reply -->
                            <button type="button" class="action-tool-btn msg-action-reply" title="Reply" aria-label="Reply" data-msg-id="${msg.id}" data-sender="${this.escapeHTML(senderName)}" data-content="${isDocument ? `[Document] ${this.escapeHTML(docFilename)}` : safeContent}">
                                ${replySvg}
                            </button>
                            <!-- 2. AI / sparkle -->
                            <button type="button" class="action-tool-btn msg-action-smart" title="Smart AI Analysis" aria-label="Smart AI Analysis" data-msg-id="${msg.id}" ${hasAttachment ? `data-file-id="${docFileId}" data-filename="${this.escapeHTML(docFilename)}"` : ''}>
                                <span class="toolbar-sparkle-icon">✨</span>
                            </button>
                            <!-- 3. Heart reaction -->
                            <button type="button" class="action-tool-btn msg-action-react" title="Love" aria-label="Love reaction" data-msg-id="${msg.id}" data-emoji="❤️">
                                ❤️
                            </button>
                            <!-- 4. Thumbs-up reaction -->
                            <button type="button" class="action-tool-btn msg-action-react" title="Thumbs Up" aria-label="Thumbs Up reaction" data-msg-id="${msg.id}" data-emoji="👍">
                                👍
                            </button>
                            <!-- 5. Laugh reaction -->
                            <button type="button" class="action-tool-btn msg-action-react" title="Laugh" aria-label="Laugh reaction" data-msg-id="${msg.id}" data-emoji="😂">
                                😂
                            </button>
                            <!-- 6. Fire reaction -->
                            <button type="button" class="action-tool-btn msg-action-react" title="Fire" aria-label="Fire reaction" data-msg-id="${msg.id}" data-emoji="🔥">
                                🔥
                            </button>
                            <!-- 7. Copy message -->
                            <button type="button" class="action-tool-btn msg-action-copy" title="Copy Message" aria-label="Copy Message" data-msg-id="${msg.id}" data-content="${this.escapeHTML(copyPayload)}">
                                ${copySvg}
                            </button>
                            <!-- 8. More options (three-dot menu) -->
                            <button type="button" class="action-tool-btn msg-action-more-btn" title="More Options" aria-label="More Options" data-msg-id="${msg.id}">
                                ${moreSvg}
                            </button>
                        </div>

                        <!-- Bubble Content -->
                        <div class="message-bubble ${isDocument ? 'document-bubble' : ''}">
                            ${(isGroup && !isSent && !isConsecutive) ? `<div class="message-group-sender-name">${this.escapeHTML(senderDisplayName)}</div>` : ''}
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
                </div>
            </div>
        `;
    },

    toggleMessageTranslation(msgId) {
        const transEl = document.getElementById(`msgTransText-${msgId}`);
        const origEl = document.getElementById(`msgOrigText-${msgId}`);
        const btn = document.querySelector(`.btn-toggle-msg-translation[data-msg-id="${msgId}"]`);
        if (!transEl || !origEl || !btn) return;

        const labelSpan = btn.querySelector('.toggle-trans-label');
        const isTransVisible = transEl.style.display !== 'none';

        const origLabel = (typeof i18n !== 'undefined') ? i18n.t('chat.showOriginal') : 'Show original';
        const transLabel = (typeof i18n !== 'undefined') ? i18n.t('chat.showTranslation') : 'Show translation';

        if (isTransVisible) {
            transEl.style.display = 'none';
            origEl.style.display = 'block';
            if (labelSpan) labelSpan.textContent = transLabel;
            btn.setAttribute('title', transLabel);
        } else {
            transEl.style.display = 'block';
            origEl.style.display = 'none';
            if (labelSpan) labelSpan.textContent = origLabel;
            btn.setAttribute('title', origLabel);
        }
    },

    async toggleOrFetchTranslation(msgId) {
        const transEl = document.getElementById(`msgTransText-${msgId}`);
        if (transEl) {
            this.toggleMessageTranslation(msgId);
            return;
        }

        const currentLang = (typeof i18n !== 'undefined') ? i18n.currentLang : 'ta';
        const token = localStorage.getItem('frank_token');
        try {
            if (typeof window.showToast === 'function') {
                window.showToast(typeof i18n !== 'undefined' ? i18n.t('chat.translating') : 'Translating message...', 'info', 1500);
            }
            const res = await fetch(`/api/messages/${msgId}/translate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ target_language: currentLang })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.translated_content) {
                    if (window.chatController && window.chatController.activeMessages) {
                        const m = window.chatController.activeMessages.find(x => Number(x.id || x.message_id) === Number(msgId));
                        if (m) {
                            m.translated_content = data.translated_content;
                            m.target_language = data.target_language;
                            m.source_language = data.source_language;
                        }
                    }
                    const textWrap = document.getElementById(`msgTextContent-${msgId}`);
                    if (textWrap) {
                        const origHtml = textWrap.innerHTML;
                        const formattedTrans = this.formatMessageContent(data.translated_content);
                        const origLabel = (typeof i18n !== 'undefined') ? i18n.t('chat.showOriginal') : 'Show original';
                        const targetLangBadge = (data.target_language || currentLang).toUpperCase();
                        textWrap.innerHTML = `
                            <div class="msg-text-variant msg-text-trans" id="msgTransText-${msgId}">
                                ${formattedTrans}
                            </div>
                            <div class="msg-text-variant msg-text-orig" id="msgOrigText-${msgId}" style="display:none;">
                                ${origHtml}
                            </div>
                            <div class="message-translation-controls" style="margin-top: 4px; display: flex; align-items: center; gap: 6px; font-size: 11px;">
                                <button type="button" class="btn-toggle-msg-translation" data-msg-id="${msgId}" style="background: none; border: none; padding: 0; color: var(--primary); cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600;">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>
                                    <span class="toggle-trans-label">${origLabel}</span>
                                </button>
                                <span class="translation-badge" style="background: rgba(37,99,235,0.12); color: var(--primary); padding: 1px 5px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase;">${targetLangBadge}</span>
                            </div>
                        `;
                    }
                }
            }
        } catch (err) {
            console.warn('Failed to translate message:', err);
        }
    },

    positionToolbar(row) {
        if (!row) return;
        const toolbar = row.querySelector('.message-actions-toolbar');
        if (!toolbar) return;
        const messagesContainer = document.getElementById('chatMessages') || document.querySelector('.chat-messages') || document.querySelector('.messages-container');
        const containerTop = messagesContainer ? messagesContainer.getBoundingClientRect().top : 50;
        const rowRect = row.getBoundingClientRect();
        if (rowRect.top - containerTop < 38) {
            row.classList.add('toolbar-below');
        } else {
            row.classList.remove('toolbar-below');
        }
    },

    confirmDeleteMessage(messageId) {
        if (!messageId) return;
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

// Touch Long-Press Detection for Mobile Message Actions Toolbar
let touchTimer = null;
let touchStartX = 0;
let touchStartY = 0;
let touchTargetBubble = null;

document.addEventListener('touchstart', (e) => {
    const bubble = e.target.closest('.message-bubble');
    if (!bubble) return;
    if (e.target.closest('a, button, input, video, audio, .voice-track-scrubber, .msg-photo-img')) return;

    touchTargetBubble = bubble;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;

    if (touchTimer) clearTimeout(touchTimer);
    touchTimer = setTimeout(() => {
        if (touchTargetBubble) {
            const row = touchTargetBubble.closest('.message-row');
            if (row) {
                document.querySelectorAll('.message-row.toolbar-active').forEach(r => {
                    if (r !== row) r.classList.remove('toolbar-active', 'toolbar-below');
                });
                row.classList.add('toolbar-active');
                if (window.messagesModule && window.messagesModule.positionToolbar) {
                    window.messagesModule.positionToolbar(row);
                }
            }
        }
        touchTimer = null;
    }, 450);
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    if (!touchTimer) return;
    const dx = Math.abs(e.touches[0].clientX - touchStartX);
    const dy = Math.abs(e.touches[0].clientY - touchStartY);
    if (dx > 10 || dy > 10) {
        clearTimeout(touchTimer);
        touchTimer = null;
    }
}, { passive: true });

document.addEventListener('touchend', () => {
    if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
    }
}, { passive: true });

// Message Event Delegation (Links, Context Menu, Reply, React, Copy, Edit, Delete, Open, Download)
document.addEventListener('click', async (e) => {
    // 00a. Dismiss active message toolbar when tapping outside
    if (!e.target.closest('.message-actions-toolbar') && !e.target.closest('.message-bubble')) {
        document.querySelectorAll('.message-row.toolbar-active').forEach(r => r.classList.remove('toolbar-active', 'toolbar-below'));
    }

    // 00b. Dismiss toolbar when an action button inside it is clicked
    const actionBtnInsideToolbar = e.target.closest('.message-actions-toolbar .action-tool-btn');
    if (actionBtnInsideToolbar) {
        const parentRow = actionBtnInsideToolbar.closest('.message-row');
        if (parentRow) parentRow.classList.remove('toolbar-active', 'toolbar-below');
    }

    // 00c. Mobile tap on message bubble toggles message action toolbar
    const bubbleClicked = e.target.closest('.message-bubble');
    if (bubbleClicked && !e.target.closest('a, button, input, video, audio, .voice-track-scrubber, .msg-photo-img')) {
        const row = bubbleClicked.closest('.message-row');
        if (row) {
            const wasActive = row.classList.contains('toolbar-active');
            document.querySelectorAll('.message-row.toolbar-active').forEach(r => r.classList.remove('toolbar-active', 'toolbar-below'));
            if (!wasActive) {
                row.classList.add('toolbar-active');
                if (window.messagesModule && window.messagesModule.positionToolbar) {
                    window.messagesModule.positionToolbar(row);
                }
            }
        }
    }

    // 00d. Toggle Message Translation
    const toggleTransBtn = e.target.closest('.btn-toggle-msg-translation');
    if (toggleTransBtn) {
        e.stopPropagation();
        const msgId = parseInt(toggleTransBtn.dataset.msgId, 10);
        messagesModule.toggleMessageTranslation(msgId);
        return;
    }

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

    // 0b. Open in-message context menu (More options three-dot menu)
    const moreBtn = e.target.closest('.msg-action-more-btn');
    if (moreBtn) {
        e.stopPropagation();
        const messageId = parseInt(moreBtn.dataset.msgId, 10);
        if (window.chatController) {
            window.chatController.openMessageContextMenu(e, messageId);
        }
        return;
    }

    // 0c. Smart AI Analysis on Message or Document
    const smartBtn = e.target.closest('.msg-action-smart, .msg-doc-smart-btn');
    if (smartBtn) {
        e.stopPropagation();
        const messageId = parseInt(smartBtn.dataset.msgId, 10);
        const fileId = smartBtn.dataset.fileId ? parseInt(smartBtn.dataset.fileId, 10) : null;
        const filename = smartBtn.dataset.filename || null;
        const convId = (window.chatController && (window.chatController.activeConversationId || window.chatController.activeId)) || (window.smartController && window.smartController.currentConvId);
        if (convId && window.smartController) {
            if (fileId) {
                window.smartController.openForDocument(convId, messageId, fileId, filename);
            } else {
                window.smartController.openForMessage(convId, messageId);
            }
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

    // 6. Download document / media
    const downloadDocBtn = e.target.closest('.msg-doc-download-btn, .msg-action-download-doc');
    if (downloadDocBtn) {
        e.stopPropagation();
        const card = downloadDocBtn.closest('.message-photo-card, .message-document-card, .message-video-card, .message-voice-card, .message-row, .drawer-doc-item');
        let rawFileId = downloadDocBtn.dataset.fileId || (card ? card.dataset.fileId : '');
        let fileId = (rawFileId && !isNaN(rawFileId) && parseInt(rawFileId, 10) > 0) ? parseInt(rawFileId, 10) : null;
        let version = downloadDocBtn.dataset.version || (card ? card.dataset.version : null);

        const row = downloadDocBtn.closest('.message-row');
        const messageId = row ? parseInt(row.dataset.messageId, 10) : null;
        if (!fileId && messageId && window.chatController && window.chatController.activeMessages) {
            const msgObj = window.chatController.activeMessages.find(m => Number(m.id || m.message_id) === messageId);
            if (msgObj) {
                fileId = msgObj.file_id || (msgObj.document ? msgObj.document.id : null);
                if (!version && msgObj.document && msgObj.document.current_version_number) {
                    version = msgObj.document.current_version_number;
                }
            }
        }

        const filename = downloadDocBtn.dataset.filename || card?.dataset.filename || 'document';
        const directUrl = downloadDocBtn.dataset.directUrl || (card ? card.dataset.directUrl : '');

        try {
            if (!window.documentsController && typeof DocumentsController !== 'undefined') {
                window.documentsController = new DocumentsController();
            }

            if (window.documentsController && (fileId || directUrl)) {
                window.documentsController.downloadDocument(fileId, filename, directUrl, version);
            } else if (directUrl) {
                const a = document.createElement('a');
                a.href = directUrl;
                a.download = filename || 'document';
                document.body.appendChild(a);
                a.click();
                a.remove();
            } else {
                showToast('Unable to download document. Please try again.', 'error');
            }
        } catch (err) {
            console.error('Failed to download document:', err);
            showToast('Unable to download document. Please try again.', 'error');
        }
        return;
    }

    // 7. Open document / media (Photos, Videos, PDFs, Audio, Docs)
    const openDocBtn = e.target.closest('.msg-doc-open-btn, .msg-action-open-doc, .message-document-card, .msg-photo-img, .message-photo-card, .msg-video-player, .message-video-card, .msg-video-wrap');
    if (openDocBtn) {
        e.stopPropagation();
        const card = openDocBtn.closest('.message-photo-card, .message-document-card, .message-video-card, .message-voice-card, .message-row, .drawer-doc-item');
        let rawFileId = openDocBtn.dataset.fileId || (card ? card.dataset.fileId : '');
        let fileId = (rawFileId && !isNaN(rawFileId) && parseInt(rawFileId, 10) > 0) ? parseInt(rawFileId, 10) : null;

        // If fileId is missing, check active message object in chatController using messageId (never fall back to message ID as file ID)
        const row = openDocBtn.closest('.message-row');
        const messageId = row ? parseInt(row.dataset.messageId, 10) : null;
        if (!fileId && messageId && window.chatController && window.chatController.activeMessages) {
            const msgObj = window.chatController.activeMessages.find(m => Number(m.id || m.message_id) === messageId);
            if (msgObj) {
                fileId = msgObj.file_id || (msgObj.document ? msgObj.document.id : null);
            }
        }

        let fileType = openDocBtn.dataset.fileType;
        if (!fileType) {
            if (openDocBtn.classList.contains('msg-photo-img') || openDocBtn.classList.contains('message-photo-card')) fileType = 'image';
            else if (openDocBtn.classList.contains('msg-video-player') || openDocBtn.classList.contains('message-video-card') || openDocBtn.classList.contains('msg-video-wrap')) fileType = 'video';
            else fileType = card?.dataset.fileType || 'document';
        }
        const filename = openDocBtn.dataset.filename || card?.dataset.filename || openDocBtn.getAttribute('alt') || 'Document';
        const directUrl = openDocBtn.dataset.directUrl || (card ? card.dataset.directUrl : '') || (openDocBtn.tagName === 'IMG' || openDocBtn.tagName === 'VIDEO' ? openDocBtn.src : '');

        try {
            if (!window.documentsController && typeof DocumentsController !== 'undefined') {
                window.documentsController = new DocumentsController();
            }

            const meta = {
                file_size: openDocBtn.dataset.fileSize || (card ? card.dataset.fileSize : ''),
                created_at: openDocBtn.dataset.timestamp || (card ? card.dataset.timestamp : '')
            };

            if (window.documentsController && (fileId || directUrl)) {
                window.documentsController.openDocument(fileId, fileType, filename, directUrl, meta);
            } else if (directUrl) {
                window.open(directUrl, '_blank');
            } else {
                showToast('Unable to open document. Please try again.', 'error');
            }
        } catch (err) {
            console.error('Failed to open document:', err);
            showToast('Unable to open document. Please try again.', 'error');
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


