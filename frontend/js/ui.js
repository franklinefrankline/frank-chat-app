/* -------------------------------------------------------------------------
   GLOBAL UI INTERACTIONS & CUSTOM CURSOR
   Desktop custom cursor, dropdown handlers, and landing page preview animation
   ------------------------------------------------------------------------- */

const uiModule = {
    init() {
        this.setupCustomCursor();
        this.setupDropdowns();
        this.setupLandingPreviewAnimation();
    },

    setupCustomCursor() {
        const cursor = document.getElementById('customCursor');
        const dot = document.getElementById('customCursorDot');
        if (!cursor || !dot) return;

        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const isEnabled = localStorage.getItem('pref_settingCustomCursor') !== 'false';

        if (isTouch || !isEnabled) {
            cursor.style.display = 'none';
            dot.style.display = 'none';
            return;
        }

        let mouseX = -100;
        let mouseY = -100;
        let cursorX = -100;
        let cursorY = -100;

        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            cursor.style.opacity = '1';
            dot.style.opacity = '1';

            dot.style.left = `${mouseX}px`;
            dot.style.top = `${mouseY}px`;
        });

        const animateCursor = () => {
            cursorX += (mouseX - cursorX) * 0.2;
            cursorY += (mouseY - cursorY) * 0.2;
            cursor.style.left = `${cursorX}px`;
            cursor.style.top = `${cursorY}px`;
            requestAnimationFrame(animateCursor);
        };
        requestAnimationFrame(animateCursor);

        // Hover scale on interactive elements
        const interactiveSelector = 'a, button, input, textarea, select, [role="button"], .conversation-card, .theme-card, .emoji-item-btn';
        document.addEventListener('mouseover', (e) => {
            if (e.target.closest(interactiveSelector)) {
                cursor.classList.add('active');
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.closest(interactiveSelector)) {
                cursor.classList.remove('active');
            }
        });
    },

    setupDropdowns() {
        document.addEventListener('click', (e) => {
            // Dropdown trigger buttons
            const trigger = e.target.closest('[aria-haspopup="true"]');
            if (trigger) {
                const menu = trigger.querySelector('.dropdown-menu');
                if (menu) {
                    const isOpen = menu.classList.contains('show');
                    document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
                    if (!isOpen) {
                        menu.classList.add('show');
                        trigger.setAttribute('aria-expanded', 'true');
                    } else {
                        trigger.setAttribute('aria-expanded', 'false');
                    }
                }
                return;
            }

            // Click outside any open dropdown
            if (!e.target.closest('.dropdown-menu')) {
                document.querySelectorAll('.dropdown-menu.show').forEach(m => {
                    m.classList.remove('show');
                    const parentTrigger = m.closest('[aria-haspopup="true"]');
                    if (parentTrigger) parentTrigger.setAttribute('aria-expanded', 'false');
                });
            }
        });
    },

    setupLandingPreviewAnimation() {
        const previewContainer = document.getElementById('previewMessagesContainer');
        if (!previewContainer) return;

        const demoScript = [
            { text: "Could you send over the updated design assets?", type: "received", delay: 2500 },
            { text: "Sending them right now! 📦", type: "sent", delay: 4500 },
            { text: "Received! The new glassmorphic theme looks stunning.", type: "received", delay: 7000 }
        ];

        demoScript.forEach(item => {
            setTimeout(() => {
                const bubble = document.createElement('div');
                bubble.className = `preview-bubble ${item.type}`;
                bubble.textContent = item.text;
                previewContainer.appendChild(bubble);
                previewContainer.scrollTop = previewContainer.scrollHeight;
            }, item.delay);
        });
    }
};

document.addEventListener('DOMContentLoaded', () => {
    uiModule.init();
});

window.uiModule = uiModule;
