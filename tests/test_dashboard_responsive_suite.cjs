const { chromium } = require('playwright');
const path = require('path');

const VIEWPORTS = [
    { name: '1440_desktop', width: 1440, height: 900 },
    { name: '1024_laptop', width: 1024, height: 768 },
    { name: '768_tablet', width: 768, height: 1024 },
    { name: '390_mobile', width: 390, height: 844 },
    { name: '360_small_mobile', width: 360, height: 740 }
];

(async () => {
    console.log('=== STARTING RESPONSIVE VIEWPORT TEST SUITE ===\n');
    let allPassed = true;

    // 1. Authenticate via backend API
    const authRes = await fetch('http://127.0.0.1:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'frankline30999112@gmail.com', password: '#Frankline2006' })
    });
    const authData = await authRes.json();
    const token = authData.access_token;
    const userObj = authData.user;
    console.log('Authenticated user:', userObj.email, 'Token received.');

    const browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext();
        await context.addInitScript(({ token, userObj }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('frank_token', token);
            localStorage.setItem('frank_auth_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(userObj));
            localStorage.setItem('frank_user', JSON.stringify(userObj));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token, userObj });

        for (const vp of VIEWPORTS) {
            console.log(`\n======================================================`);
            console.log(`Testing Viewport: ${vp.name} (${vp.width}x${vp.height})`);
            console.log(`======================================================`);

            const page = await context.newPage();
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
            await page.waitForTimeout(1500);

            // Test A: Check Horizontal Overflow
            const overflow = await page.evaluate(() => {
                return {
                    docScrollWidth: document.documentElement.scrollWidth,
                    bodyScrollWidth: document.body.scrollWidth,
                    windowInnerWidth: window.innerWidth,
                    hasOverflow: document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth
                };
            });

            const overflowPass = !overflow.hasOverflow;
            console.log(`  [Overflow Check] doc=${overflow.docScrollWidth}px, body=${overflow.bodyScrollWidth}px, win=${overflow.windowInnerWidth}px -> ${overflowPass ? 'PASS' : 'FAIL (Overflow)'}`);
            if (!overflowPass) allPassed = false;

            // Test B: Top Navigation
            const navCheck = await page.evaluate(() => {
                const header = document.querySelector('.top-header');
                const logo = document.querySelector('.logo-area, .top-header-left');
                const search = document.getElementById('globalSearchInput');
                const langBtn = document.getElementById('dashLangDropdownBtn');
                const notifBtn = document.getElementById('topHeaderNotificationBtn');
                const profileBtn = document.getElementById('desktopProfileBtn');

                return {
                    navExists: !!header,
                    navHeight: header ? header.offsetHeight : 0,
                    logoVisible: !!logo && logo.offsetWidth > 0,
                    searchExists: !!search,
                    searchVisible: !!search && window.getComputedStyle(search).display !== 'none',
                    profileVisible: !!profileBtn && window.getComputedStyle(profileBtn).display !== 'none',
                    notifVisible: !!notifBtn && window.getComputedStyle(notifBtn).display !== 'none',
                    langVisible: !!langBtn && window.getComputedStyle(langBtn).display !== 'none',
                };
            });
            console.log(`  [Top Nav] height=${navCheck.navHeight}px, logo=${navCheck.logoVisible}, searchVisible=${navCheck.searchVisible}, profile=${navCheck.profileVisible}, notif=${navCheck.notifVisible}`);

            // Test C: Chat Sidebar & Active Tab
            const sidebarCheck = await page.evaluate(() => {
                const sidebar = document.querySelector('.conversation-panel');
                const tabs = document.querySelectorAll('.filter-chip');
                const list = document.getElementById('conversationList');
                return {
                    sidebarExists: !!sidebar,
                    sidebarVisible: !!sidebar && sidebar.offsetWidth > 0,
                    sidebarWidth: sidebar ? sidebar.offsetWidth : 0,
                    filterTabsCount: tabs.length,
                    listChildren: list ? list.children.length : 0
                };
            });
            console.log(`  [Sidebar] width=${sidebarCheck.sidebarWidth}px, visible=${sidebarCheck.sidebarVisible}, filterTabs=${sidebarCheck.filterTabsCount}`);

            // Test D: Chat Window & Composer
            const chatCheck = await page.evaluate(() => {
                const chatWin = document.querySelector('.chat-window');
                const header = document.querySelector('.chat-header');
                const textarea = document.getElementById('messageComposerTextarea');
                const composerBtn = document.getElementById('composerSendBtn');
                const attachBtn = document.getElementById('attachFileBtn');
                const emojiBtn = document.getElementById('emojiPickerBtn');

                return {
                    chatWinVisible: !!chatWin && chatWin.offsetWidth > 0,
                    chatWinWidth: chatWin ? chatWin.offsetWidth : 0,
                    headerHeight: header ? header.offsetHeight : 0,
                    textareaVisible: !!textarea && textarea.offsetWidth > 0,
                    composerBtnVisible: !!composerBtn && window.getComputedStyle(composerBtn).display !== 'none',
                    attachVisible: !!attachBtn && window.getComputedStyle(attachBtn).display !== 'none',
                    emojiVisible: !!emojiBtn && window.getComputedStyle(emojiBtn).display !== 'none'
                };
            });
            console.log(`  [Chat & Composer] chatWinWidth=${chatCheck.chatWinWidth}px, headerHeight=${chatCheck.headerHeight}px, textarea=${chatCheck.textareaVisible}, btn=${chatCheck.composerBtnVisible}, attach=${chatCheck.attachVisible}, emoji=${chatCheck.emojiVisible}`);

            // Test E: Mobile back button or drawer (if <= 768px)
            if (vp.width <= 768) {
                const mobileCheck = await page.evaluate(() => {
                    const mobileBackBtn = document.getElementById('chatMobileBackBtn');
                    const drawerToggle = document.getElementById('navDrawerToggleBtn');
                    return {
                        mobileBackVisible: !!mobileBackBtn && window.getComputedStyle(mobileBackBtn).display !== 'none',
                        drawerToggleVisible: !!drawerToggle && window.getComputedStyle(drawerToggle).display !== 'none'
                    };
                });
                console.log(`  [Mobile Controls] backBtnVisible=${mobileCheck.mobileBackVisible}, drawerToggleVisible=${mobileCheck.drawerToggleVisible}`);
            }

            // Save Screenshot
            const screenshotPath = path.resolve(__dirname, `dashboard_${vp.name}.png`);
            await page.screenshot({ path: screenshotPath });
            console.log(`  [Screenshot] Saved tests/dashboard_${vp.name}.png`);

            await page.close();
        }

        console.log(`\n======================================================`);
        console.log(`ALL RESPONSIVE VIEWPORTS TESTED: ${allPassed ? 'ALL PASS!' : 'SOME FAILED'}`);
        console.log(`======================================================`);
    } catch (err) {
        console.error('Test Suite Error:', err);
        allPassed = false;
    } finally {
        await browser.close();
    }
})();
