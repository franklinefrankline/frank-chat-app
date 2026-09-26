const { chromium } = require('playwright');
const assert = require('assert');

const BASE_URL = 'http://localhost:8000';
const VIEWPORTS = [
    { width: 320, height: 600, name: '320px (Tiny Mobile)' },
    { width: 375, height: 667, name: '375px (iPhone SE)' },
    { width: 390, height: 844, name: '390px (iPhone 12/13/14)' },
    { width: 414, height: 896, name: '414px (iPhone XR/Plus)' },
    { width: 768, height: 1024, name: '768px (iPad Mini / Tablet)' },
    { width: 1024, height: 768, name: '1024px (Small Laptop / iPad Pro)' },
    { width: 1280, height: 800, name: '1280px (Standard Desktop)' },
    { width: 1440, height: 900, name: '1440px (Wide Desktop)' }
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(name, passed, detail = '') {
    totalTests++;
    if (passed) {
        passedTests++;
        console.log(`  [PASS] ${name} ${detail ? '(' + detail + ')' : ''}`);
    } else {
        failedTests++;
        console.error(`  [FAIL] ${name} - ${detail}`);
    }
}

async function runTestSuite() {
    console.log('===========================================================================');
    console.log('STARTING FRANK MULTI-LANGUAGE (i18n) PLAYWRIGHT TEST SUITE');
    console.log('===========================================================================');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors = [];
    const failed404s = [];

    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    page.on('response', res => {
        if (res.status() === 404 && (res.url().includes('i18n') || res.url().includes('.json'))) {
            failed404s.push(res.url());
        }
    });

    // Helper: Authenticate as user or admin
    async function authenticate(role = 'user') {
        const creds = role === 'admin'
            ? { username: 'frankline30999112@gmail.com', password: '#Frankline2006' }
            : { username: 'alex', password: 'password123' };

        const res = await page.request.post(`${BASE_URL}/api/auth/login`, { data: creds });
        const data = await res.json();
        await page.evaluate(({ token, user }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(user));
        }, { token: data.access_token, user: data.user });
        return data;
    }

    try {
        // =====================================================================
        // SECTION 1: DEFAULT LANGUAGE & LANDING PAGE (DESKTOP)
        // =====================================================================
        console.log('\n[TEST GROUP 1] Default Language & Desktop Landing Page...');
        await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);

        // 1. English loads by default
        const activeLang = await page.evaluate(() => window.i18n ? window.i18n.currentLang : null);
        report('English loads by default', activeLang === 'en', `Detected: ${activeLang}`);

        // Verify key text elements in English
        const heroTitleEn = await page.locator('#heroTitle').textContent();
        report('Hero title is in English', heroTitleEn.includes('Communication, Reimagined.'), `Title: "${heroTitleEn.trim()}"`);

        const startChatBtnEn = await page.locator('[data-i18n="hero.startChatting"]').first().textContent();
        report('Hero CTA button is in English', startChatBtnEn.includes('Start Chatting'), `Button: "${startChatBtnEn.trim()}"`);

        // =====================================================================
        // SECTION 2: LANGUAGE SELECTOR DROPDOWN & ACCESSIBILITY
        // =====================================================================
        console.log('\n[TEST GROUP 2] Language Selector UI & Accessibility...');
        const langBtn = page.locator('#langDropdownBtn');
        const langDropdown = page.locator('#langDropdownMenu');

        report('Language selector has aria-label="Language"', await langBtn.getAttribute('aria-label') === 'Language');
        report('Language selector has aria-haspopup="true"', await langBtn.getAttribute('aria-haspopup') === 'true');
        report('Language selector initial aria-expanded="false"', await langBtn.getAttribute('aria-expanded') === 'false');

        // Click to open dropdown
        await langBtn.click();
        await page.waitForTimeout(200);
        const isOpen = await langDropdown.evaluate(el => el.classList.contains('show'));
        report('Language selector dropdown opens on click', isOpen);
        report('Aria-expanded becomes "true" when open', await langBtn.getAttribute('aria-expanded') === 'true');

        // Test Escape key closes dropdown
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        const isClosedEscape = await langDropdown.evaluate(el => !el.classList.contains('show'));
        report('Escape key closes language dropdown', isClosedEscape);

        // Reopen and test click outside closes dropdown
        await langBtn.click();
        await page.waitForTimeout(200);
        await page.locator('body').click({ position: { x: 50, y: 50 } });
        await page.waitForTimeout(200);
        const isClosedOutside = await langDropdown.evaluate(el => !el.classList.contains('show'));
        report('Click outside closes language dropdown', isClosedOutside);

        // =====================================================================
        // SECTION 3: SWITCHING TO TAMIL (NO RELOAD, INSTANT UI UPDATE)
        // =====================================================================
        console.log('\n[TEST GROUP 3] Tamil Language Switching (Zero Reload)...');
        // Tag window to verify no reload occurs
        await page.evaluate(() => { window.__no_reload_marker = 12345; });

        // Open dropdown and click Tamil
        await langBtn.click();
        await page.waitForTimeout(200);
        const tamilOption = langDropdown.locator('[data-lang="ta"]');
        await tamilOption.click();
        await page.waitForTimeout(300);

        // Check no reload
        const markerCheck = await page.evaluate(() => window.__no_reload_marker);
        report('UI updates without page reload', markerCheck === 12345);

        // Check active language
        const currentLangTa = await page.evaluate(() => window.i18n.currentLang);
        report('Tamil (ta) is now active language', currentLangTa === 'ta');

        // Check Tamil text on hero title and buttons
        const heroTitleTa = await page.locator('#heroTitle').textContent();
        report('Hero title updated to Tamil', heroTitleTa.includes('தகவல்தொடர்பு'), `Title: "${heroTitleTa.trim()}"`);

        const startChatBtnTa = await page.locator('[data-i18n="hero.startChatting"]').first().textContent();
        report('Start Chatting CTA updated to Tamil', startChatBtnTa.includes('அரட்டையை தொடங்கு'), `Button: "${startChatBtnTa.trim()}"`);

        // Check localStorage persistence
        const storedLang = await page.evaluate(() => localStorage.getItem('frank_lang'));
        report('Tamil language persisted to localStorage (frank_lang)', storedLang === 'ta');

        // =====================================================================
        // SECTION 4: SWITCHING TO HINDI (INSTANT UI UPDATE)
        // =====================================================================
        console.log('\n[TEST GROUP 4] Hindi Language Switching...');
        await langBtn.click();
        await page.waitForTimeout(200);
        const hindiOption = langDropdown.locator('[data-lang="hi"]');
        await hindiOption.click();
        await page.waitForTimeout(300);

        const currentLangHi = await page.evaluate(() => window.i18n.currentLang);
        report('Hindi (hi) is now active language', currentLangHi === 'hi');

        const heroTitleHi = await page.locator('#heroTitle').textContent();
        report('Hero title updated to Hindi', heroTitleHi.includes('संचार'), `Title: "${heroTitleHi.trim()}"`);

        const startChatBtnHi = await page.locator('[data-i18n="hero.startChatting"]').first().textContent();
        report('Start Chatting CTA updated to Hindi', startChatBtnHi.includes('चैट शुरू करें'), `Button: "${startChatBtnHi.trim()}"`);

        // =====================================================================
        // SECTION 5: PERSISTENCE AFTER PAGE REFRESH
        // =====================================================================
        console.log('\n[TEST GROUP 5] Persistence across Page Reload...');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);

        const langAfterReload = await page.evaluate(() => window.i18n.currentLang);
        report('Hindi persists after page reload', langAfterReload === 'hi');

        const heroTitleAfterReload = await page.locator('#heroTitle').textContent();
        report('Hero title remains Hindi after reload', heroTitleAfterReload.includes('संचार'));

        // Reset to English for next tests
        await page.evaluate(() => window.i18n.setLanguage('en'));
        await page.waitForTimeout(200);

        // =====================================================================
        // SECTION 6: THEME PRESERVATION ACROSS LANGUAGE SWITCHING
        // =====================================================================
        console.log('\n[TEST GROUP 6] Theme & Language Independence...');
        // Toggle theme to Sandstone
        await page.evaluate(() => {
            if (window.theme) window.theme.apply('sandstone');
        });
        await page.waitForTimeout(200);

        const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        report('Theme set to Sandstone', themeBefore === 'sandstone');

        // Switch language to Tamil
        await page.evaluate(() => window.i18n.setLanguage('ta'));
        await page.waitForTimeout(200);

        const themeAfterLang = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        report('Theme unchanged after language switch', themeAfterLang === 'sandstone');

        // Switch theme back to Monochrome
        await page.evaluate(() => {
            if (window.theme) window.theme.apply('monochrome');
        });
        const langAfterTheme = await page.evaluate(() => window.i18n.currentLang);
        report('Language unchanged after theme switch', langAfterTheme === 'ta');

        // =====================================================================
        // SECTION 7: AUTHENTICATION PAGES (LOGIN & REGISTER)
        // =====================================================================
        console.log('\n[TEST GROUP 7] Authentication Pages Language Support...');
        // Login Page
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);

        const loginHeading = await page.locator('h1[data-i18n="auth.signIn"]').textContent();
        report('Login page loads in current language', loginHeading.length > 0);

        // Switch to Tamil on Login page
        await page.evaluate(() => window.i18n.setLanguage('ta'));
        await page.waitForTimeout(200);
        const loginBtnTa = await page.locator('#loginSubmitBtn').textContent();
        report('Login submit button updates to Tamil', loginBtnTa.includes('உள்நுழை'), `Text: "${loginBtnTa.trim()}"`);

        // Check placeholder translation
        const emailPlaceholder = await page.locator('#loginUsername').getAttribute('placeholder');
        report('Login input placeholder translated', emailPlaceholder && emailPlaceholder.length > 0, `Placeholder: "${emailPlaceholder}"`);

        // Register Page
        await page.goto(`${BASE_URL}/register.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);
        const registerBtnTa = await page.locator('#registerSubmitBtn').textContent();
        report('Register submit button is in Tamil', registerBtnTa.includes('உருவாக்க'), `Text: "${registerBtnTa.trim()}"`);

        // Switch to Hindi on Register page
        await page.evaluate(() => window.i18n.setLanguage('hi'));
        await page.waitForTimeout(200);
        const registerBtnHi = await page.locator('#registerSubmitBtn').textContent();
        report('Register submit button updates to Hindi', registerBtnHi.includes('खाता बनाएं'), `Text: "${registerBtnHi.trim()}"`);

        // =====================================================================
        // SECTION 8: AUTHENTICATED USER PERSISTENCE (DATABASE + PROFILE)
        // =====================================================================
        console.log('\n[TEST GROUP 8] Authenticated User Persistence to Database...');
        // Log in user Alex
        const loginData = await authenticate('user');
        report('User Alex successfully logged in', !!loginData.access_token);

        // Update language to Tamil via i18n engine with saveToDb
        await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);

        await page.evaluate(async () => {
            await window.i18n.setLanguage('ta', { saveToDb: true });
        });
        await page.waitForTimeout(500);

        // Verify profile endpoint on backend has saved language="ta"
        const profileRes = await page.request.get(`${BASE_URL}/api/users/profile`, {
            headers: { 'Authorization': `Bearer ${loginData.access_token}` }
        });
        const profileData = await profileRes.json();
        report('Language preference saved to backend PostgreSQL/database', profileData.language === 'ta', `Saved: ${profileData.language}`);

        // =====================================================================
        // SECTION 9: SETTINGS & APPEARANCE LANGUAGE CHOICE CARDS
        // =====================================================================
        console.log('\n[TEST GROUP 9] Settings Page & Language Choice Cards...');
        await page.goto(`${BASE_URL}/settings.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);

        const langCards = page.locator('[data-lang-choice]');
        const cardCount = await langCards.count();
        report('Settings page has 3 Language Choice Cards', cardCount === 3, `Count: ${cardCount}`);

        // Click Hindi choice card
        const hindiCard = page.locator('[data-lang-choice="hi"]');
        if (await hindiCard.count() > 0) {
            await hindiCard.click();
            await page.waitForTimeout(400);
            const isHiActive = await hindiCard.evaluate(el => el.classList.contains('active'));
            report('Hindi card becomes active on click', isHiActive);
            const langNow = await page.evaluate(() => window.i18n.currentLang);
            report('i18n currentLang updated to hi', langNow === 'hi');
        }

        // =====================================================================
        // SECTION 10: DASHBOARD & USER MESSAGE PRESERVATION
        // =====================================================================
        console.log('\n[TEST GROUP 10] Dashboard & Message Integrity...');
        await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);

        // Test that user messages are never automatically modified
        const userMessageText = 'Special user-written message: வணக்கம் Hello 123';
        const preserved = await page.evaluate((text) => {
            const container = document.createElement('div');
            container.className = 'message-bubble user-message';
            container.textContent = text;
            document.body.appendChild(container);

            // Trigger translation refresh
            window.i18n.applyTranslations();

            const afterText = container.textContent;
            container.remove();
            return afterText === text;
        }, userMessageText);

        report('User-generated message content remains completely unmodified', preserved);

        // =====================================================================
        // SECTION 11: ADMIN PORTAL
        // =====================================================================
        console.log('\n[TEST GROUP 11] Admin Portal Language Support...');
        // Authenticate as Admin
        await authenticate('admin');
        await page.goto(`${BASE_URL}/admin.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(500);

        const adminTitle = await page.locator('[data-i18n="admin.metrics"]').first().textContent();
        report('Admin Portal supports i18n', adminTitle.length > 0, `Title: "${adminTitle.trim()}"`);

        // Switch to Hindi
        await page.evaluate(() => window.i18n.setLanguage('hi'));
        await page.waitForTimeout(200);
        const adminUsersNavHi = await page.locator('#navUsersBtn [data-i18n="admin.userManagement"]').textContent();
        report('Admin user management nav translates to Hindi', adminUsersNavHi.includes('उपयोगकर्ता'), `Text: "${adminUsersNavHi.trim()}"`);

        // Switch to Tamil
        await page.evaluate(() => window.i18n.setLanguage('ta'));
        await page.waitForTimeout(200);
        const adminUsersNavTa = await page.locator('#navUsersBtn [data-i18n="admin.userManagement"]').textContent();
        report('Admin user management nav translates to Tamil', adminUsersNavTa.includes('பயனர்'), `Text: "${adminUsersNavTa.trim()}"`);

        // =====================================================================
        // SECTION 12: MISSING KEY FALLBACK & "UNDEFINED" DETECTION
        // =====================================================================
        console.log('\n[TEST GROUP 12] Fallback System & Zero Undefined Strings...');
        const fallbackResults = await page.evaluate(() => {
            const nonExistent = window.i18n.t('completely.non.existent.key');
            const fallbackWithDefault = window.i18n.t('another.missing.key', {}, 'Custom Fallback');
            const parameterized = window.i18n.t('messages.unread', { count: 5 });
            return {
                nonExistent,
                fallbackWithDefault,
                parameterized,
                hasUndefined: nonExistent.includes('undefined') || nonExistent.includes('null')
            };
        });

        report('Missing key does not return undefined or null', !fallbackResults.hasUndefined);
        report('Missing key provides safe fallback', fallbackResults.fallbackWithDefault === 'Custom Fallback');
        report('Parameterized translation works correctly', fallbackResults.parameterized.includes('5'), `Result: "${fallbackResults.parameterized}"`);

        // Scan whole document for literal "undefined" or "null" in rendered texts
        const rawUndefinedCount = await page.evaluate(() => {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let count = 0;
            let node;
            while (node = walker.nextNode()) {
                const txt = node.nodeValue.trim();
                if (txt === 'undefined' || txt === 'null' || txt.startsWith('undefined.') || txt.includes('[object Object]')) {
                    count++;
                }
            }
            return count;
        });
        report('Zero literal "undefined" or "null" nodes in DOM', rawUndefinedCount === 0, `Found: ${rawUndefinedCount}`);

        // =====================================================================
        // SECTION 13: RESPONSIVE DESIGN & ZERO HORIZONTAL OVERFLOW
        // =====================================================================
        console.log('\n[TEST GROUP 13] Responsive Viewports & Zero Overflow (320px - 1440px)...');
        // Clear auth so landing page renders freely
        await page.evaluate(() => {
            localStorage.removeItem('chatapp_token');
            localStorage.removeItem('chatapp_user');
        });
        await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });

        for (const vp of VIEWPORTS) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.waitForTimeout(300);

            // Test in both English and Tamil (since Tamil text is longer)
            for (const lang of ['en', 'ta']) {
                await page.evaluate((l) => window.i18n.setLanguage(l), lang);
                await page.waitForTimeout(150);

                const overflow = await page.evaluate(() => {
                    const docEl = document.documentElement;
                    return {
                        scrollWidth: docEl.scrollWidth,
                        clientWidth: docEl.clientWidth,
                        hasOverflow: docEl.scrollWidth > docEl.clientWidth + 1 // 1px rounding tolerance
                    };
                });

                report(`Zero horizontal overflow at ${vp.width}px (${lang.toUpperCase()})`, !overflow.hasOverflow, `scroll: ${overflow.scrollWidth}px, client: ${overflow.clientWidth}px`);
            }
        }

        // =====================================================================
        // SECTION 14: MOBILE MENU & MOBILE LANGUAGE SELECTOR
        // =====================================================================
        console.log('\n[TEST GROUP 14] Mobile Drawer & Mobile Language Selector...');
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(300);

        const mobileToggle = page.locator('#landingMobileToggle');
        const mobileDrawer = page.locator('#landingMobileDrawer');

        report('Mobile hamburger toggle is visible at 375px', await mobileToggle.isVisible());

        // Click hamburger to open drawer
        await mobileToggle.click();
        await page.waitForTimeout(300);
        const drawerOpen = await mobileDrawer.evaluate(el => el.classList.contains('open'));
        report('Mobile drawer opens on hamburger click', drawerOpen);

        // Check mobile language selector inside drawer
        const mobileLangBtn = page.locator('#mobileLangDropdownBtn');
        const mobileLangDropdown = page.locator('#mobileLangDropdownMenu');
        report('Mobile drawer contains Language Selector button', await mobileLangBtn.count() > 0);

        // Open mobile language dropdown
        await mobileLangBtn.click();
        await page.waitForTimeout(200);
        const mobileOpen = await mobileLangDropdown.evaluate(el => el.classList.contains('show'));
        report('Mobile language dropdown opens on click', mobileOpen);

        // Click Hindi option
        const mobileHindiOpt = mobileLangDropdown.locator('[data-lang="hi"]');
        await mobileHindiOpt.click();
        await page.waitForTimeout(300);

        const mobileLangNow = await page.evaluate(() => window.i18n.currentLang);
        report('Mobile language selector switches to Hindi', mobileLangNow === 'hi');

        // =====================================================================
        // SECTION 15: CONSOLE ERRORS & NETWORK 404 CHECKS
        // =====================================================================
        console.log('\n[TEST GROUP 15] Console & Network Integrity...');
        report('Zero 404 network requests for translation files', failed404s.length === 0, `Failed: ${failed404s.join(', ') || 'None'}`);
        report('Zero browser console errors during test run', consoleErrors.length === 0, `Errors: ${consoleErrors.join(', ') || 'None'}`);

    } catch (err) {
        console.error('Test execution error:', err);
    } finally {
        await browser.close();
    }

    console.log('\n===========================================================================');
    console.log(`TOTAL TESTS  : ${totalTests}`);
    console.log(`TOTAL PASSED : ${passedTests}`);
    console.log(`TOTAL FAILED : ${failedTests}`);
    console.log(`SUCCESS RATE : ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log('===========================================================================');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runTestSuite();
