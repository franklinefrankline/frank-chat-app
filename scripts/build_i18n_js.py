import json
import os

root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
i18n_dir = os.path.join(root_dir, 'i18n')
if not os.path.exists(i18n_dir):
    i18n_dir = os.path.join(root_dir, 'frontend', 'i18n')

en_path = os.path.join(i18n_dir, 'en.json')
ta_path = os.path.join(i18n_dir, 'ta.json')
hi_path = os.path.join(i18n_dir, 'hi.json')

with open(en_path, 'r', encoding='utf-8') as f:
    en_data = json.load(f)

with open(ta_path, 'r', encoding='utf-8') as f:
    ta_data = json.load(f)

with open(hi_path, 'r', encoding='utf-8') as f:
    hi_data = json.load(f)

template = """/* -------------------------------------------------------------------------
   FRANK MULTI-LANGUAGE (i18n) SYSTEM
   Professional internationalization engine for FRANK.
   Supports English (en), Tamil (ta), and Hindi (hi).
   - Instant in-memory translations (0 network latency, zero flash)
   - Fallback hierarchy: Active Lang -> English -> Safe Humanized Label
   - No page reload, zero state loss, theme-compatible
   - Accessible keyboard-controlled dropdown
   - Guest localStorage persistence & Authenticated user database persistence
   - Intl.DateTimeFormat & Intl.NumberFormat localization
   ------------------------------------------------------------------------- */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.i18n = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const STORAGE_KEY = 'frank_lang';
    const LEGACY_KEY = 'chatapp_lang';

    const LANGUAGES = {
        en: {
            code: 'en',
            label: 'English',
            dir: 'ltr',
            locale: 'en-US'
        },
        ta: {
            code: 'ta',
            label: 'தமிழ்',
            dir: 'ltr',
            locale: 'ta-IN'
        },
        hi: {
            code: 'hi',
            label: 'हिन्दी',
            dir: 'ltr',
            locale: 'hi-IN'
        }
    };

    const TRANSLATIONS = {
        en: __EN_JSON__,
        ta: __TA_JSON__,
        hi: __HI_JSON__
    };

    class FrankI18n {
        constructor() {
            this.currentLang = 'en';
            this.languages = LANGUAGES;
            this.translations = TRANSLATIONS;
            this.initialized = false;
            this._listenersBound = false;
        }

        normalizeLang(code) {
            if (!code || typeof code !== 'string') return 'en';
            const normalized = code.toLowerCase().trim().slice(0, 2);
            return this.languages[normalized] ? normalized : 'en';
        }

        init() {
            let saved = null;
            try {
                saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_KEY);
            } catch (e) {
                console.warn('[i18n] localStorage inaccessible:', e);
            }

            // If user is authenticated, check saved user profile preference
            try {
                const rawUser = localStorage.getItem('chatapp_user');
                if (rawUser) {
                    const user = JSON.parse(rawUser);
                    if (user && user.language) {
                        saved = user.language;
                    }
                }
            } catch (e) {}

            const targetLang = this.normalizeLang(saved);
            this.setLanguage(targetLang, { saveToDb: false, silent: true });
            this.bindDropdownEvents();
            this.initialized = true;

            // Listen for user login/update events
            window.addEventListener('storage', (event) => {
                if (event.key === STORAGE_KEY && event.newValue) {
                    this.setLanguage(event.newValue, { saveToDb: false });
                }
            });

            return this;
        }

        getLanguage() {
            return this.currentLang;
        }

        getLanguageInfo() {
            return this.languages[this.currentLang] || this.languages.en;
        }

        t(key, params = {}, fallback = null) {
            if (!key || typeof key !== 'string') return fallback || '';

            let value = this._resolve(this.translations[this.currentLang], key);

            // Fallback 1: English
            if (value === undefined || value === null) {
                value = this._resolve(this.translations.en, key);
            }

            // Fallback 2: Custom fallback if specified
            if ((value === undefined || value === null) && fallback !== null && fallback !== undefined) {
                value = fallback;
            }

            // Fallback 3: Safe humanized key name
            if (value === undefined || value === null) {
                const parts = key.split('.');
                const last = parts[parts.length - 1];
                // Convert camelCase or snake_case to readable words
                value = last
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/_/g, ' ')
                    .replace(/^./, str => str.toUpperCase())
                    .trim();
            }

            if (typeof value !== 'string') {
                return String(value ?? '');
            }

            // Interpolate {paramName}
            return value.replace(/\{(\w+)\}/g, (match, paramName) => {
                if (params && params[paramName] !== undefined && params[paramName] !== null) {
                    return this._escapeHtml(String(params[paramName]));
                }
                return match;
            });
        }

        _resolve(obj, path) {
            if (!obj || typeof obj !== 'object') return undefined;
            const segments = path.split('.');
            let curr = obj;
            for (let i = 0; i < segments.length; i++) {
                if (curr === null || curr === undefined || typeof curr !== 'object') {
                    return undefined;
                }
                curr = curr[segments[i]];
            }
            return curr;
        }

        _escapeHtml(str) {
            return str
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        setLanguage(langCode, options = {}) {
            const nextLang = this.normalizeLang(langCode);
            this.currentLang = nextLang;
            const langInfo = this.languages[nextLang];

            // Apply HTML attributes
            document.documentElement.lang = nextLang;
            document.documentElement.dir = langInfo.dir || 'ltr';

            // Save to localStorage
            try {
                localStorage.setItem(STORAGE_KEY, nextLang);
                localStorage.setItem(LEGACY_KEY, nextLang);
            } catch (e) {}

            // Save to database if user is authenticated and saveToDb is not false
            if (options.saveToDb !== false) {
                this.syncLanguageToBackend(nextLang);
            }

            // Apply to all DOM elements
            this.applyTranslations();

            // Update UI selectors
            this.updateSelectors();

            // Dispatch global event for application listeners
            if (!options.silent) {
                window.dispatchEvent(new CustomEvent('frank:languageChanged', {
                    detail: {
                        lang: nextLang,
                        info: langInfo
                    }
                }));
            }

            return nextLang;
        }

        async syncLanguageToBackend(langCode) {
            try {
                const token = localStorage.getItem('chatapp_token');
                if (!token) return;

                // Update local cached user object first
                const rawUser = localStorage.getItem('chatapp_user');
                if (rawUser) {
                    const user = JSON.parse(rawUser);
                    user.language = langCode;
                    localStorage.setItem('chatapp_user', JSON.stringify(user));
                }

                // Call backend API
                if (typeof api !== 'undefined' && typeof api.updateProfile === 'function') {
                    await api.updateProfile({ language: langCode });
                } else {
                    await fetch('/api/users/profile', {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ language: langCode })
                    });
                }
            } catch (err) {
                console.warn('[i18n] Failed to sync language preference to backend:', err);
            }
        }

        applyTranslations(root = document) {
            if (!root) return;

            // 1. Text elements
            const textElements = root.querySelectorAll('[data-i18n]');
            textElements.forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (!key) return;
                const translated = this.t(key);
                if (translated) {
                    // If element has no element children, safely replace textContent
                    if (el.children.length === 0) {
                        el.textContent = translated;
                    } else {
                        // Element contains icons or children, update first text node or container text
                        let hasTextNode = false;
                        for (let child of el.childNodes) {
                            if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                                child.textContent = ' ' + translated.trim() + ' ';
                                hasTextNode = true;
                                break;
                            }
                        }
                        if (!hasTextNode) {
                            // Find child span or append
                            const span = el.querySelector('span:not([aria-hidden])');
                            if (span) {
                                span.textContent = translated;
                            } else {
                                el.appendChild(document.createTextNode(' ' + translated));
                            }
                        }
                    }
                }
            });

            // 2. Placeholder attributes
            const placeholderElements = root.querySelectorAll('[data-i18n-placeholder]');
            placeholderElements.forEach(el => {
                const key = el.getAttribute('data-i18n-placeholder');
                if (!key) return;
                const translated = this.t(key);
                if (translated) {
                    el.setAttribute('placeholder', translated);
                }
            });

            // 3. Title attributes
            const titleElements = root.querySelectorAll('[data-i18n-title]');
            titleElements.forEach(el => {
                const key = el.getAttribute('data-i18n-title');
                if (!key) return;
                const translated = this.t(key);
                if (translated) {
                    el.setAttribute('title', translated);
                }
            });

            // 4. Aria-label attributes
            const ariaElements = root.querySelectorAll('[data-i18n-aria-label]');
            ariaElements.forEach(el => {
                const key = el.getAttribute('data-i18n-aria-label');
                if (!key) return;
                const translated = this.t(key);
                if (translated) {
                    el.setAttribute('aria-label', translated);
                }
            });
        }

        updateSelectors() {
            const langInfo = this.getLanguageInfo();

            // Update all currentLangLabel elements
            document.querySelectorAll('.current-lang-label, #currentLangLabel, #mobileCurrentLangLabel').forEach(label => {
                label.textContent = langInfo.label;
            });

            // Update all dropdown menu options
            document.querySelectorAll('.lang-option').forEach(option => {
                const optionLang = option.getAttribute('data-lang');
                if (optionLang === this.currentLang) {
                    option.classList.add('active');
                    option.setAttribute('aria-selected', 'true');
                } else {
                    option.classList.remove('active');
                    option.setAttribute('aria-selected', 'false');
                }
            });
        }

        bindDropdownEvents() {
            if (this._listenersBound) return;
            this._listenersBound = true;

            // Handle toggle button clicks & accessibility
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('.lang-btn');
                if (btn) {
                    e.preventDefault();
                    e.stopPropagation();
                    const container = btn.closest('.lang-selector-container');
                    const menu = container ? container.querySelector('.lang-dropdown-menu') : null;
                    if (menu) {
                        const isOpen = menu.classList.contains('show');
                        this.closeAllDropdowns();
                        if (!isOpen) {
                            menu.classList.add('show');
                            btn.setAttribute('aria-expanded', 'true');
                            // Focus first option or active option
                            const activeOption = menu.querySelector('.lang-option.active') || menu.querySelector('.lang-option');
                            if (activeOption) activeOption.focus();
                        }
                    }
                    return;
                }

                // Handle language option selection
                const option = e.target.closest('.lang-option');
                if (option) {
                    e.preventDefault();
                    e.stopPropagation();
                    const chosenLang = option.getAttribute('data-lang');
                    if (chosenLang) {
                        this.setLanguage(chosenLang, { saveToDb: true });
                    }
                    this.closeAllDropdowns();
                    // Return focus to trigger button
                    const container = option.closest('.lang-selector-container');
                    if (container) {
                        const trigger = container.querySelector('.lang-btn');
                        if (trigger) trigger.focus();
                    }
                    return;
                }

                // Clicked outside: close all dropdowns
                this.closeAllDropdowns();
            });

            // Handle Keyboard navigation
            document.addEventListener('keydown', (e) => {
                const activeEl = document.activeElement;
                const isDropdownOpen = document.querySelector('.lang-dropdown-menu.show');

                // Escape key closes open dropdown
                if (e.key === 'Escape' && isDropdownOpen) {
                    e.preventDefault();
                    const container = isDropdownOpen.closest('.lang-selector-container');
                    this.closeAllDropdowns();
                    if (container) {
                        const trigger = container.querySelector('.lang-btn');
                        if (trigger) trigger.focus();
                    }
                    return;
                }

                // Arrow navigation within open menu
                if (isDropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
                    e.preventDefault();
                    const options = Array.from(isDropdownOpen.querySelectorAll('.lang-option'));
                    const currentIndex = options.indexOf(activeEl);

                    let nextIndex = 0;
                    if (e.key === 'ArrowDown') {
                        nextIndex = currentIndex < options.length - 1 ? currentIndex + 1 : 0;
                    } else if (e.key === 'ArrowUp') {
                        nextIndex = currentIndex > 0 ? currentIndex - 1 : options.length - 1;
                    }

                    if (options[nextIndex]) {
                        options[nextIndex].focus();
                    }
                    return;
                }

                // Enter or Space on trigger button opens dropdown
                if ((e.key === 'Enter' || e.key === ' ') && activeEl && activeEl.classList.contains('lang-btn')) {
                    e.preventDefault();
                    activeEl.click();
                }
            });
        }

        closeAllDropdowns() {
            document.querySelectorAll('.lang-dropdown-menu.show').forEach(menu => {
                menu.classList.remove('show');
            });
            document.querySelectorAll('.lang-btn[aria-expanded="true"]').forEach(btn => {
                btn.setAttribute('aria-expanded', 'false');
            });
        }

        formatDate(date, options = {}) {
            const langInfo = this.getLanguageInfo();
            const d = date instanceof Date ? date : new Date(date);
            if (isNaN(d.getTime())) return '';
            try {
                return new Intl.DateTimeFormat(langInfo.locale, options).format(d);
            } catch (e) {
                return d.toLocaleDateString();
            }
        }

        formatNumber(number, options = {}) {
            const langInfo = this.getLanguageInfo();
            const n = Number(number);
            if (isNaN(n)) return String(number);
            try {
                return new Intl.NumberFormat(langInfo.locale, options).format(n);
            } catch (e) {
                return String(number);
            }
        }
    }

    const instance = new FrankI18n();

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => instance.init());
    } else {
        instance.init();
    }

    return instance;
}));
"""

code = template.replace('__EN_JSON__', json.dumps(en_data, ensure_ascii=False, indent=4))
code = code.replace('__TA_JSON__', json.dumps(ta_data, ensure_ascii=False, indent=4))
code = code.replace('__HI_JSON__', json.dumps(hi_data, ensure_ascii=False, indent=4))

out_path = os.path.join(root_dir, 'js', 'i18n.js')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write(code)

print(f"Generated {out_path} successfully. File size: {len(code)} bytes.")
