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
        // Section 23: Desktop only check (hover: hover and pointer: fine)
        const isFinePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        const isEnabled = localStorage.getItem('pref_settingCustomCursor') !== 'false';
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let cursor = document.getElementById('customCursor');
        const dot = document.getElementById('customCursorDot');
        if (dot) dot.style.display = 'none'; // Replaced by FRANK F miniature emblem

        if (!isFinePointer || isTouch || !isEnabled) {
            if (cursor) cursor.style.display = 'none';
            return;
        }

        // Ensure custom cursor element exists in DOM
        if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = 'customCursor';
            cursor.className = 'custom-cursor';
            cursor.setAttribute('aria-hidden', 'true');
            document.body.appendChild(cursor);
        }

        let mouseX = -100;
        let mouseY = -100;
        let cursorX = -100;
        let cursorY = -100;
        let lastParticleX = -100;
        let lastParticleY = -100;
        let lastParticleTime = 0;
        const activeParticles = [];
        const particleColors = ['#2563EB', '#22D3EE', '#7C3AED', '#D946EF'];

        // High performance mouse tracking using transform3d
        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;

            // Section 21 & 22: Keep native browser text cursor on inputs, textareas, contenteditable, resizers
            const target = e.target;
            const isTextOrNative = target.closest('input, textarea, [contenteditable], [contenteditable="true"], .message-composer-input, select, [draggable="true"], .resize-handle');
            if (isTextOrNative) {
                cursor.classList.add('hidden-for-input');
            } else {
                cursor.classList.remove('hidden-for-input');
                cursor.style.opacity = '1';
            }

            // Section 20: VERY subtle cursor trail (max 2-3 particles, tiny, fade quickly)
            if (!prefersReducedMotion && !isTextOrNative) {
                const now = performance.now();
                const dist = Math.hypot(mouseX - lastParticleX, mouseY - lastParticleY);
                if (dist > 22 && (now - lastParticleTime > 90) && activeParticles.length < 3) {
                    lastParticleX = mouseX;
                    lastParticleY = mouseY;
                    lastParticleTime = now;

                    const p = document.createElement('div');
                    p.className = 'frank-cursor-particle';
                    const color = particleColors[Math.floor(Math.random() * particleColors.length)];
                    p.style.backgroundColor = color;
                    p.style.transform = `translate3d(${mouseX}px, ${mouseY}px, 0)`;
                    document.body.appendChild(p);
                    activeParticles.push(p);

                    setTimeout(() => {
                        p.remove();
                        const idx = activeParticles.indexOf(p);
                        if (idx > -1) activeParticles.splice(idx, 1);
                    }, 320);
                }
            }
        }, { passive: true });

        document.addEventListener('mouseleave', () => {
            cursor.style.opacity = '0';
        });

        document.addEventListener('mouseenter', () => {
            cursor.style.opacity = '1';
        });

        // Smooth GPU translation loop without layout reflows
        const renderCursor = () => {
            cursorX += (mouseX - cursorX) * 0.28;
            cursorY += (mouseY - cursorY) * 0.28;
            // Center 22px cursor: offset by -11px
            cursor.style.transform = `translate3d(${cursorX - 11}px, ${cursorY - 11}px, 0)`;
            requestAnimationFrame(renderCursor);
        };
        requestAnimationFrame(renderCursor);

        // Section 18: Hover scale (1.0 -> 1.15) on interactive elements
        const interactiveSelector = 'a, button, .btn, .nav-item, .conversation-card, .card, .chat-bubble, .message-bubble, .message-item, .chat-item, .group-item, .document-card, .file-card, .contact-card, [role="button"], .tab-btn, .emoji-item-btn';
        document.addEventListener('mouseover', (e) => {
            if (e.target.closest(interactiveSelector)) {
                cursor.classList.add('hover');
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (e.target.closest(interactiveSelector)) {
                cursor.classList.remove('hover');
            }
        });

        // Section 19: Click Ripple Effect (small expanding ring 200-300ms)
        document.addEventListener('mousedown', (e) => {
            if (prefersReducedMotion) return;
            const target = e.target;
            if (target.closest('input, textarea, [contenteditable], select')) return;

            const ripple = document.createElement('div');
            ripple.className = 'frank-cursor-ripple';
            ripple.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) scale(0.6)`;
            document.body.appendChild(ripple);

            setTimeout(() => {
                ripple.remove();
            }, 270);
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
