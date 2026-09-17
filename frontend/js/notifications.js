/* -------------------------------------------------------------------------
   FRANK - NOTIFICATION & REAL-TIME ALERT SYSTEM
   1. Dynamic WhatsApp-Style Tab Favicon with Unread Counter Badge
   2. Dynamic Browser Tab Title: "(X) FRANK — Think"
   3. PWA / App Badging API: navigator.setAppBadge
   4. Synthesized Melodic Web Audio Chime (Zero external assets, offline safe)
   5. Browser Desktop Notification API (Background tabs, click-to-focus)
   6. Mobile Vibration API (navigator.vibrate)
   7. In-App Interactive Toast with Sender Name, Safe Preview & Click-to-Open
   8. Strict Event & Message Deduplication (No double counts or audio spam)
   ------------------------------------------------------------------------- */

const notificationsModule = {
    audioCtx: null,
    unreadCount: 0,
    baseTitle: 'FRANK — Think',
    originalFavicon: 'assets/brand/frank-icon.svg',
    faviconEl: null,
    processedMessageIds: new Set(),
    toastContainerEl: null,

    init() {
        // 1. Locate or create standard <link rel="icon">
        this.faviconEl = document.querySelector('link[rel="icon"]') || document.querySelector('link[rel~="icon"]');
        if (!this.faviconEl) {
            this.faviconEl = document.createElement('link');
            this.faviconEl.rel = 'icon';
            this.faviconEl.type = 'image/svg+xml';
            this.faviconEl.href = this.originalFavicon;
            document.head.appendChild(this.faviconEl);
        } else if (this.faviconEl.getAttribute('href')) {
            this.originalFavicon = this.faviconEl.getAttribute('href');
        }

        // Cache base title
        const currentTitle = document.title ? document.title.replace(/^\(\d+\+?\)\s*/, '') : '';
        if (currentTitle && currentTitle.includes('FRANK')) {
            this.baseTitle = currentTitle;
        }

        // 2. Pre-create in-app toast container
        this.getToastContainer();

        // 3. Request browser desktop notification permission on first user interaction if enabled
        if ('Notification' in window && Notification.permission === 'default') {
            const hasAsked = localStorage.getItem('frank_asked_notif_perm');
            if (!hasAsked) {
                const requestOnFirstClick = () => {
                    if (Notification.permission === 'default') {
                        Notification.requestPermission().then(() => {
                            localStorage.setItem('frank_asked_notif_perm', 'true');
                        }).catch(() => {});
                    }
                    document.removeEventListener('click', requestOnFirstClick);
                };
                document.addEventListener('click', requestOnFirstClick, { once: true });
            }
        }
    },

    // ---------------- SETTINGS HELPERS ----------------
    getSetting(key, defaultValue = true) {
        const val = localStorage.getItem(`pref_${key}`);
        if (val === null) return defaultValue;
        return val === 'true';
    },

    // ---------------- 1. DYNAMIC FAVICON & TAB TITLE ----------------
    /**
     * Updates:
     * - Browser tab favicon with WhatsApp-style unread counter badge
     * - Browser tab title: "(X) FRANK — Think"
     * - PWA / App badge: navigator.setAppBadge
     */
    updateUnreadBadge(count) {
        this.unreadCount = Math.max(0, Number(count) || 0);

        // A. Dynamic Browser Tab Title
        if (this.unreadCount <= 0) {
            document.title = this.baseTitle;
        } else if (this.unreadCount > 99) {
            document.title = `(99+) ${this.baseTitle}`;
        } else {
            document.title = `(${this.unreadCount}) ${this.baseTitle}`;
        }

        // B. Dynamic WhatsApp-Style Favicon Badge
        this.renderBadgedFavicon(this.unreadCount);

        // C. PWA / App Badging API (Android Chrome, Edge, Chrome Desktop PWA)
        if ('setAppBadge' in navigator) {
            if (this.unreadCount > 0) {
                navigator.setAppBadge(this.unreadCount).catch(() => {});
            } else if ('clearAppBadge' in navigator) {
                navigator.clearAppBadge().catch(() => {});
            }
        }
    },

    renderBadgedFavicon(count) {
        if (!this.faviconEl) {
            this.faviconEl = document.querySelector('link[rel="icon"]') || document.querySelector('link[rel~="icon"]');
            if (!this.faviconEl) return;
        }

        if (count <= 0) {
            this.faviconEl.type = 'image/svg+xml';
            this.faviconEl.href = this.originalFavicon;
            return;
        }

        const badgeText = count > 99 ? '99+' : (count > 9 ? '9+' : String(count));
        const isMultiDigit = count >= 10;

        // Top-right circular / pill notification badge (WhatsApp-style)
        const badgeMarkup = isMultiDigit
            ? `<g id="unreadBadge">
                 <rect x="22" y="1" width="25" height="17" rx="8.5" fill="#EF4444" stroke="#FFFFFF" stroke-width="1.8" />
                 <text x="34.5" y="13" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="9.5" font-weight="900" text-anchor="middle" dominant-baseline="central">${badgeText}</text>
               </g>`
            : `<g id="unreadBadge">
                 <circle cx="37" cy="9" r="9" fill="#EF4444" stroke="#FFFFFF" stroke-width="1.8" />
                 <text x="37" y="9.5" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="11" font-weight="900" text-anchor="middle" dominant-baseline="central">${badgeText}</text>
               </g>`;

        const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" fill="none">
    <defs>
        <linearGradient id="frankSpineGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#3B82F6" />
            <stop offset="50%" stop-color="#7C3AED" />
            <stop offset="100%" stop-color="#C026D3" />
        </linearGradient>
        <linearGradient id="frankTopBeamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#2563EB" />
            <stop offset="60%" stop-color="#3B82F6" />
            <stop offset="100%" stop-color="#06B6D4" />
        </linearGradient>
        <linearGradient id="frankMidBeamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#7C3AED" />
            <stop offset="70%" stop-color="#A855F7" />
            <stop offset="100%" stop-color="#E879F9" />
        </linearGradient>
        <linearGradient id="frankBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#0B0F28" />
            <stop offset="100%" stop-color="#141B4D" />
        </linearGradient>
    </defs>
    <!-- Background Container Tile -->
    <rect width="48" height="48" rx="12" fill="url(#frankBgGrad)" stroke="rgba(59, 130, 246, 0.3)" stroke-width="1.2" />
    <!-- Top Horizontal Chat Beam -->
    <path d="M 12 14 C 12 11.238 14.238 9 17 9 L 34 9 C 36.762 9 39 11.238 39 14 C 39 16.762 36.762 19 34 19 L 17 19 C 14.238 19 12 16.762 12 14 Z" fill="url(#frankTopBeamGrad)" />
    <!-- Vertical Communication Spine with Chat Tail -->
    <path d="M 12 14 L 12 34 C 12 36.762 14.238 39 17 39 C 19.762 39 22 36.762 22 34 L 22 14 Z" fill="url(#frankSpineGrad)" />
    <path d="M 12 33 L 7.5 38.5 C 6.8 39.3 7.4 40.5 8.5 40.5 L 14.5 40.5 C 15.5 40.5 16 39.8 15.5 39 L 12 33 Z" fill="#C026D3" />
    <!-- Middle Horizontal Chat Beam -->
    <path d="M 17 23 L 28 23 C 30.762 23 33 25.238 33 28 C 33 30.762 30.762 33 28 33 L 17 33 Z" fill="url(#frankMidBeamGrad)" />
    <!-- Communication Spark Pulse Dot -->
    <circle cx="34.5" cy="14" r="2.2" fill="#22D3EE" />
    <!-- Top-Right Red Notification Counter Badge -->
    ${badgeMarkup}
</svg>`;

        const svgDataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(fullSvg)}`;
        this.faviconEl.type = 'image/svg+xml';
        this.faviconEl.href = svgDataUri;

        // Render to canvas PNG for browsers that require PNG favicons
        this.renderCanvasFaviconPng(svgDataUri);
    },

    renderCanvasFaviconPng(svgDataUri) {
        try {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 64;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;
                ctx.clearRect(0, 0, 64, 64);
                ctx.drawImage(img, 0, 0, 64, 64);
                const pngUri = canvas.toDataURL('image/png');
                if (this.faviconEl) {
                    this.faviconEl.href = pngUri;
                }
            };
            img.src = svgDataUri;
        } catch (e) {
            // SVG data URI fallback is already active
        }
    },

    // ---------------- 2. SYNTHESIZED WEB AUDIO CHIME ----------------
    playChime() {
        if (!this.getSetting('settingSound', true)) return;

        try {
            const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtxClass) return;

            if (!this.audioCtx) {
                this.audioCtx = new AudioCtxClass();
            }

            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            const now = this.audioCtx.currentTime;

            // Note 1: 587.33 Hz (D5) - soft melodic sine
            const osc1 = this.audioCtx.createOscillator();
            const gain1 = this.audioCtx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now);
            gain1.gain.setValueAtTime(0.06, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
            osc1.connect(gain1);
            gain1.connect(this.audioCtx.destination);
            osc1.start(now);
            osc1.stop(now + 0.14);

            // Note 2: 880.00 Hz (A5) - bell harmony
            const osc2 = this.audioCtx.createOscillator();
            const gain2 = this.audioCtx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880.00, now + 0.07);
            gain2.gain.setValueAtTime(0.06, now + 0.07);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            osc2.connect(gain2);
            gain2.connect(this.audioCtx.destination);
            osc2.start(now + 0.07);
            osc2.stop(now + 0.28);
        } catch (e) {
            // AudioContext autoplay restricted until user gesture
        }
    },

    // ---------------- 3. MOBILE VIBRATION ----------------
    vibrate() {
        if (!this.getSetting('settingVibration', true)) return;
        if ('vibrate' in navigator) {
            try {
                navigator.vibrate(100);
            } catch (e) {}
        }
    },

    // ---------------- 4. IN-APP TOAST CONTAINER ----------------
    getToastContainer() {
        if (this.toastContainerEl && document.body.contains(this.toastContainerEl)) {
            return this.toastContainerEl;
        }
        let container = document.getElementById('messageToastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'messageToastContainer';
            container.className = 'message-toast-container';
            document.body.appendChild(container);
        }
        this.toastContainerEl = container;
        return container;
    },

    showInAppToast(msg) {
        if (!this.getSetting('settingMessageNotifs', true)) return;

        const container = this.getToastContainer();
        const toast = document.createElement('div');
        toast.className = 'message-toast';
        toast.setAttribute('role', 'alert');

        const senderName = msg.sender_name || (msg.sender ? msg.sender.full_name : 'User');
        const initials = senderName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'FR';

        let previewText = msg.content || '';
        if (msg.message_type === 'audio') {
            previewText = '🎤 Voice message';
        } else if (msg.message_type === 'document') {
            previewText = '📎 Document shared';
        } else if (msg.message_type === 'image' || msg.message_type === 'video') {
            previewText = '📷 Media shared';
        }

        // Truncate to safe length
        if (previewText.length > 55) {
            previewText = previewText.slice(0, 52) + '...';
        }

        toast.innerHTML = `
            <div class="message-toast-avatar">${initials}</div>
            <div class="message-toast-content">
                <div class="message-toast-header">
                    <span class="message-toast-title">New message</span>
                    <button type="button" class="message-toast-close" aria-label="Dismiss">✕</button>
                </div>
                <div class="message-toast-sender">${this.escapeHTML(senderName)}</div>
                <div class="message-toast-body">${this.escapeHTML(previewText)}</div>
            </div>
        `;

        const dismiss = (e) => {
            if (e) e.stopPropagation();
            toast.classList.add('hiding');
            setTimeout(() => toast.remove(), 250);
        };

        toast.querySelector('.message-toast-close')?.addEventListener('click', dismiss);

        // Click on toast body opens the conversation
        toast.addEventListener('click', () => {
            dismiss();
            if (window.appController && window.appController.openConversationFromNotification) {
                const targetId = msg.group_id || msg.sender_id;
                const isGroup = !!msg.group_id;
                window.appController.openConversationFromNotification(targetId, isGroup, msg);
            }
        });

        container.appendChild(toast);

        // Auto dismiss after 4.5 seconds
        setTimeout(() => {
            if (document.body.contains(toast)) {
                dismiss();
            }
        }, 4500);
    },

    // ---------------- 5. DESKTOP BROWSER NOTIFICATION API ----------------
    showBrowserNotification(msg) {
        if (!this.getSetting('settingDesktopNotifs', true)) return;
        if (!('Notification' in window) || Notification.permission !== 'granted') return;

        const senderName = msg.sender_name || (msg.sender ? msg.sender.full_name : 'New Message');
        let preview = msg.content || '';
        if (msg.message_type === 'audio') preview = '🎤 Voice message';
        else if (msg.message_type === 'document') preview = '📎 Document shared';
        else if (preview.length > 60) preview = preview.slice(0, 57) + '...';

        try {
            const notif = new Notification(`FRANK: ${senderName}`, {
                body: preview,
                icon: 'assets/brand/frank-icon.svg',
                tag: `frank-conv-${msg.group_id ? 'group_' + msg.group_id : 'direct_' + msg.sender_id}`,
                renotify: true
            });

            notif.onclick = () => {
                window.focus();
                if (window.appController && window.appController.openConversationFromNotification) {
                    const targetId = msg.group_id || msg.sender_id;
                    const isGroup = !!msg.group_id;
                    window.appController.openConversationFromNotification(targetId, isGroup, msg);
                }
                notif.close();
            };
        } catch (e) {
            // Notification creation blocked or unsupported in current context
        }
    },

    // ---------------- 6. MAIN INCOMING NOTIFICATION DISPATCHER ----------------
    notifyIncoming(msg, options = {}) {
        if (!msg) return;

        // Deduplication: prevent duplicate audio, toast, or counts for identical message ID
        if (msg.id) {
            const idKey = String(msg.id);
            if (this.processedMessageIds.has(idKey)) {
                return;
            }
            this.processedMessageIds.add(idKey);
            // Cap set size
            if (this.processedMessageIds.size > 500) {
                const oldest = this.processedMessageIds.values().next().value;
                this.processedMessageIds.delete(oldest);
            }
        }

        const isActivelyViewing = !!options.isActivelyViewing;

        // If the user is actively viewing this exact conversation right now, skip alert notifications
        if (isActivelyViewing) {
            return;
        }

        // User is viewing another conversation, browsing the list, or tab is hidden:
        this.playChime();
        this.vibrate();
        this.showInAppToast(msg);

        if (document.hidden) {
            this.showBrowserNotification(msg);
        }
    },

    escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    notificationsModule.init();
});

window.notificationsModule = notificationsModule;
