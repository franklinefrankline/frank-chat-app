/* -------------------------------------------------------------------------
   NOTIFICATIONS & AUDIO ALERTS MODULE
   Synthesized Web Audio chime (no external audio assets required) and unread title badge
   ------------------------------------------------------------------------- */

const notificationsModule = {
    audioCtx: null,
    unreadCount: 0,
    baseTitle: document.title,

    init() {
        window.addEventListener('focus', () => {
            this.clearUnreadBadge();
        });

        // Request browser desktop notification permission if supported
        if ('Notification' in window && Notification.permission === 'default') {
            document.addEventListener('click', () => {
                if (Notification.permission === 'default') {
                    Notification.requestPermission();
                }
            }, { once: true });
        }
    },

    playChime() {
        const soundEnabled = localStorage.getItem('pref_settingSound') !== 'false';
        if (!soundEnabled) return;

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

            // Note 1: 587.33 Hz (D5)
            const osc1 = this.audioCtx.createOscillator();
            const gain1 = this.audioCtx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(587.33, now);
            gain1.gain.setValueAtTime(0.08, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc1.connect(gain1);
            gain1.connect(this.audioCtx.destination);
            osc1.start(now);
            osc1.stop(now + 0.15);

            // Note 2: 880.00 Hz (A5)
            const osc2 = this.audioCtx.createOscillator();
            const gain2 = this.audioCtx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(880.00, now + 0.08);
            gain2.gain.setValueAtTime(0.08, now + 0.08);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc2.connect(gain2);
            gain2.connect(this.audioCtx.destination);
            osc2.start(now + 0.08);
            osc2.stop(now + 0.3);

        } catch (e) {
            // Audio context not allowed until user gesture or disabled
        }
    },

    notifyIncoming(msg) {
        this.playChime();

        if (document.hidden) {
            this.unreadCount++;
            document.title = `(${this.unreadCount}) ${this.baseTitle}`;

            const desktopEnabled = localStorage.getItem('pref_settingDesktopNotifs') !== 'false';
            if (desktopEnabled && 'Notification' in window && Notification.permission === 'granted') {
                const senderName = msg.sender ? msg.sender.full_name : 'New Message';
                new Notification(`QENVO: ${senderName}`, {
                    body: msg.content,
                    icon: 'assets/brand/qenvo-icon.svg'
                });
            }
        }
    },

    clearUnreadBadge() {
        this.unreadCount = 0;
        document.title = this.baseTitle;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    notificationsModule.init();
});

window.notificationsModule = notificationsModule;
