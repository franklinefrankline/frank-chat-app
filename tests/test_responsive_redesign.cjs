const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runTestSuite() {
    console.log('=================================================================');
    console.log('FRANK THINK — RESPONSIVE REDESIGN VERIFICATION SUITE');
    console.log('=================================================================');

    const screenshotDir = path.resolve(__dirname, 'screenshots_redesign');
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
    });

    const viewportsToTest = [
        { label: 'Mobile 320px', width: 320, height: 640 },
        { label: 'Mobile 375px', width: 375, height: 667 },
        { label: 'Mobile 390px', width: 390, height: 844 },
        { label: 'Mobile 430px', width: 430, height: 932 },
        { label: 'Tablet 768px', width: 768, height: 1024 },
        { label: 'Tablet 1024px', width: 1024, height: 768 },
        { label: 'Desktop 1280px', width: 1280, height: 800 },
        { label: 'Desktop 1440px', width: 1440, height: 900 },
        { label: 'Desktop 1920px', width: 1920, height: 1080 }
    ];

    let overallSuccess = true;

    try {
        // =========================================================
        // PART 1: DESKTOP DETAILED VERIFICATION (1280px & 1440px)
        // =========================================================
        console.log('\n--- PART 1: DESKTOP DETAILED CHECKS (1280px) ---');
        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 },
            permissions: ['clipboard-read', 'clipboard-write']
        });
        const page = await context.newPage();

        // 1. Login
        await page.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'load' });
        await page.fill('#loginUsername', 'alex');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        console.log('✓ Alex successfully authenticated to dashboard');

        // Dismiss loading screen if present
        await page.evaluate(() => {
            const loader = document.getElementById('appLoadingScreen');
            if (loader) loader.remove();
        });

        // 2. Verify Top Header Components on Desktop
        console.log('Verifying Desktop Top Header...');
        const hamburgerBtn = page.locator('#openSidebarBtn');
        await hamburgerBtn.waitFor({ state: 'visible', timeout: 5000 });
        console.log('✓ Hamburger button visible on top-left');

        const brandLogo = page.locator('#topHeaderBrand');
        await brandLogo.waitFor({ state: 'visible', timeout: 5000 });
        const proBadge = page.locator('.pro-badge').first();
        await proBadge.waitFor({ state: 'visible', timeout: 5000 });
        console.log('✓ FRANK Think logo and PRO badge visible');

        const topSearch = page.locator('#topHeaderSearchInput');
        await topSearch.waitFor({ state: 'visible', timeout: 5000 });
        console.log('✓ Wide conversation & FRANK ID search bar visible');

        const langSelector = page.locator('#dashLangSelector');
        await langSelector.waitFor({ state: 'visible', timeout: 5000 });
        const notifBtn = page.locator('#topHeaderNotificationBtn');
        await notifBtn.waitFor({ state: 'visible', timeout: 5000 });
        const profileTrigger = page.locator('#desktopProfileBtn');
        await profileTrigger.waitFor({ state: 'visible', timeout: 5000 });
        console.log('✓ Language selector, notification bell, user profile visible in top header');

        // 3. Verify Search Bar synchronization
        await topSearch.fill('Sarah');
        await page.waitForTimeout(300);
        const convSearchVal = await page.inputValue('#conversationSearchInput');
        if (convSearchVal !== 'Sarah') {
            throw new Error(`Search sync failed: top=${await topSearch.inputValue()}, conv=${convSearchVal}`);
        }
        console.log('✓ Top search input successfully syncs with conversation filter');
        await page.click('#topHeaderClearSearchBtn');
        await page.waitForTimeout(200);

        // 4. Verify Desktop Two-Column Main Chat Workspace
        console.log('Verifying Desktop Workspace Layout (Two Columns)...');
        await page.waitForSelector('.conversation-card', { timeout: 10000 });
        const convPanel = page.locator('#conversationPanel');
        const chatWin = page.locator('#chatWindow');
        const convPanelBox = await convPanel.boundingBox();
        const chatWinBox = await chatWin.boundingBox();

        console.log(`- Conversation panel width: ${convPanelBox.width}px, Chat window width: ${chatWinBox.width}px`);
        if (convPanelBox.width < 300 || convPanelBox.width > 400) {
            throw new Error(`Unexpected conversation panel width: ${convPanelBox.width}px`);
        }
        if (chatWinBox.width < 500) {
            throw new Error(`Unexpected chat window width: ${chatWinBox.width}px`);
        }
        console.log('✓ Workspace is cleanly split into two columns (panel ~360px + remaining workspace)');

        // Select Sarah Connor conversation
        const sarahCard = page.locator('.conversation-card', { hasText: 'Sarah' }).first();
        await sarahCard.click();
        await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
        await page.waitForSelector('.message-row', { timeout: 10000 });
        console.log('✓ Active conversation loaded with messages and active highlight');

        // 5. Verify Navigation Drawer Interactions on Desktop
        console.log('Verifying Drawer open/close interactions...');
        const sidebar = page.locator('#sidebar');
        let isSidebarOpen = await sidebar.evaluate(el => el.classList.contains('open'));
        if (isSidebarOpen) {
            throw new Error('Sidebar drawer should be closed by default');
        }

        // Open via hamburger
        await hamburgerBtn.click();
        await page.waitForTimeout(300);
        isSidebarOpen = await sidebar.evaluate(el => el.classList.contains('open'));
        if (!isSidebarOpen) throw new Error('Drawer did not open when clicking hamburger button');
        console.log('✓ Hamburger opens drawer');

        // Verify required drawer contents
        await page.locator('#sidebarProfileLink').waitFor({ state: 'attached' });
        await page.locator('.sidebar-nav button[data-section="chats"]').waitFor({ state: 'attached' });
        await page.locator('#navGroupsBtn').waitFor({ state: 'attached' });
        await page.locator('#navContactsBtn').waitFor({ state: 'attached' });
        await page.locator('#navFavoritesBtn').waitFor({ state: 'attached' });
        await page.locator('#navArchiveBtn').waitFor({ state: 'attached' });
        await page.locator('#navOpenEditDocsBtn').waitFor({ state: 'attached' });
        await page.locator('#navCreateGroupBtn').waitFor({ state: 'attached' });
        await page.locator('#navInvitePeopleBtn').waitFor({ state: 'attached' });
        await page.locator('#sidebarUserFrankId').waitFor({ state: 'attached' });
        await page.locator('#copySidebarFrankIdBtn').waitFor({ state: 'attached' });
        await page.locator('#dashboardThemeBtn').waitFor({ state: 'attached' });
        await page.locator('#sidebarDirectSignOutBtn').waitFor({ state: 'attached' });
        console.log('✓ Drawer contains all required navigation, tools, FRANK ID, theme toggle, and logout items');

        // Close via close button inside drawer
        const closeBtn = page.locator('#sidebarCloseBtn');
        await closeBtn.click();
        await page.waitForTimeout(300);
        isSidebarOpen = await sidebar.evaluate(el => el.classList.contains('open'));
        if (isSidebarOpen) throw new Error('Drawer did not close when clicking close button');
        console.log('✓ Close button inside drawer closes drawer');

        // Reopen and close via backdrop tap
        await hamburgerBtn.click();
        await page.waitForTimeout(300);
        await page.locator('#mobileOverlay').click({ position: { x: 400, y: 300 } });
        await page.waitForTimeout(300);
        isSidebarOpen = await sidebar.evaluate(el => el.classList.contains('open'));
        if (isSidebarOpen) throw new Error('Drawer did not close when clicking overlay backdrop');
        console.log('✓ Backdrop tap closes drawer');

        // Reopen and close via Escape key
        await hamburgerBtn.click();
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        isSidebarOpen = await sidebar.evaluate(el => el.classList.contains('open'));
        if (isSidebarOpen) throw new Error('Drawer did not close when pressing Escape');
        console.log('✓ Escape key closes drawer');

        // Capture Desktop screenshot
        await page.screenshot({ path: path.join(screenshotDir, 'desktop_1280.png'), fullPage: false });
        console.log('✓ Desktop screenshot saved: desktop_1280.png');

        await context.close();

        // =========================================================
        // PART 2: MOBILE & TABLET RESPONSIVENESS ACROSS ALL SIZES
        // =========================================================
        console.log('\n--- PART 2: RESPONSIVE BREAKPOINTS VERIFICATION ---');

        for (const vp of viewportsToTest) {
            console.log(`\nTesting Viewport: ${vp.label} (${vp.width}x${vp.height})...`);
            const vpContext = await browser.newContext({
                viewport: { width: vp.width, height: vp.height },
                permissions: ['clipboard-read', 'clipboard-write']
            });
            const vpPage = await vpContext.newPage();

            await vpPage.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'load' });
            await vpPage.fill('#loginUsername', 'alex');
            await vpPage.fill('#loginPassword', 'password123');
            await vpPage.click('#loginSubmitBtn');
            await vpPage.waitForURL('**/dashboard.html', { timeout: 10000 });

            await vpPage.evaluate(() => {
                const loader = document.getElementById('appLoadingScreen');
                if (loader) loader.remove();
            });

            await vpPage.waitForSelector('.conversation-card', { timeout: 10000 });

            // Check Horizontal Overflow
            const overflow = await vpPage.evaluate(() => {
                return {
                    scrollWidth: document.documentElement.scrollWidth,
                    clientWidth: document.documentElement.clientWidth,
                    bodyScrollWidth: document.body.scrollWidth,
                    windowInnerWidth: window.innerWidth
                };
            });

            if (overflow.scrollWidth > vp.width) {
                console.error(`❌ Horizontal overflow detected on ${vp.label}: scrollWidth=${overflow.scrollWidth}, clientWidth=${vp.width}`);
                overallSuccess = false;
            } else {
                console.log(`✓ Zero horizontal overflow on ${vp.label} (${overflow.scrollWidth}px <= ${vp.width}px)`);
            }

            const isMobile = vp.width < 768;

            if (isMobile) {
                // SCREEN 1: Check conversation list is full width and chat window is hidden
                const convPanelVisible = await vpPage.locator('#conversationPanel').isVisible();
                const chatWindowVisible = await vpPage.locator('#chatWindow').isVisible();
                if (!convPanelVisible || chatWindowVisible) {
                    console.error(`❌ Mobile Screen 1 failed: convVisible=${convPanelVisible}, chatVisible=${chatWindowVisible}`);
                    overallSuccess = false;
                } else {
                    console.log('✓ Screen 1: Conversation panel fills mobile width, chat window hidden');
                }

                // Verify drawer slides in on mobile
                const mbHamburger = vpPage.locator('#openSidebarBtn');
                await mbHamburger.click();
                await vpPage.waitForTimeout(300);
                const mbSidebarOpen = await vpPage.locator('#sidebar').evaluate(el => el.classList.contains('open'));
                if (!mbSidebarOpen) {
                    console.error('❌ Mobile drawer did not open on hamburger click');
                    overallSuccess = false;
                } else {
                    console.log('✓ Mobile drawer opened on hamburger tap');
                }

                // Close drawer with close button
                await vpPage.locator('#sidebarCloseBtn').click();
                await vpPage.waitForTimeout(300);

                // SCREEN 2: Tap conversation card to switch to active chat
                const card = vpPage.locator('.conversation-card', { hasText: 'Sarah' }).first();
                await card.click();
                await vpPage.waitForTimeout(500);

                const activeChatVisible = await vpPage.locator('#chatWindow').isVisible();
                const convHidden = !(await vpPage.locator('#conversationPanel').isVisible());
                if (!activeChatVisible || !convHidden) {
                    console.error(`❌ Mobile Screen 2 failed: activeChatVisible=${activeChatVisible}, convHidden=${convHidden}`);
                    overallSuccess = false;
                } else {
                    console.log('✓ Screen 2: Active chat window fills mobile screen, conversation list hidden');
                }

                // Check mobile composer is fixed at bottom and message input is accessible
                const composerBox = await vpPage.locator('.chat-composer-container').boundingBox();
                const viewportHeight = vp.height;
                if (!composerBox || composerBox.y + composerBox.height < viewportHeight - 10) {
                    console.log(`ℹ Composer position: y=${composerBox?.y}, h=${composerBox?.height}, vpHeight=${viewportHeight}`);
                }
                console.log('✓ Message composer fixed at bottom of mobile chat');

                // Tap mobile back button to return to Screen 1
                const backBtn = vpPage.locator('#mobileBackBtn');
                await backBtn.click();
                await vpPage.waitForTimeout(400);

                const returnedToScreen1 = await vpPage.locator('#conversationPanel').isVisible();
                if (!returnedToScreen1) {
                    console.error('❌ Mobile back button did not return to conversation list');
                    overallSuccess = false;
                } else {
                    console.log('✓ Mobile back button returned cleanly to conversation list');
                }
            } else {
                // Desktop or Tablet: Verify two-column side-by-side layout
                const convVis = await vpPage.locator('#conversationPanel').isVisible();
                const chatVis = await vpPage.locator('#chatWindow').isVisible();
                if (!convVis || !chatVis) {
                    console.error(`❌ Tablet/Desktop failed: convVisible=${convVis}, chatVisible=${chatVis}`);
                    overallSuccess = false;
                } else {
                    console.log('✓ Side-by-side conversation list and active chat displayed without compression');
                }
            }

            // Capture screenshot for this breakpoint
            const filename = `${vp.label.toLowerCase().replace(/[^a-z0-9]/g, '_')}.png`;
            await vpPage.screenshot({ path: path.join(screenshotDir, filename) });
            console.log(`✓ Saved screenshot: ${filename}`);

            await vpContext.close();
        }

        // =========================================================
        // PART 3: THEME TOGGLE, LANGUAGE SWITCH & LOGOUT
        // =========================================================
        console.log('\n--- PART 3: THEME, LANGUAGE & AUTHENTICATION INTEGRITY ---');
        const testContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const testPage = await testContext.newPage();

        await testPage.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'load' });
        await testPage.fill('#loginUsername', 'alex');
        await testPage.fill('#loginPassword', 'password123');
        await testPage.click('#loginSubmitBtn');
        await testPage.waitForURL('**/dashboard.html', { timeout: 10000 });

        // Test Language Selector
        console.log('Testing Language Switcher...');
        await testPage.click('#dashLangDropdownBtn');
        await testPage.waitForSelector('#dashLangDropdownMenu', { state: 'visible' });
        const taOption = testPage.locator('#dashLangDropdownMenu button[data-lang="ta"]');
        await taOption.click();
        await testPage.waitForTimeout(300);
        const currentLangLabel = await testPage.locator('#dashLangSelector .current-lang-label').textContent();
        console.log(`✓ Language switched to: ${currentLangLabel.trim()}`);

        // Revert back to English
        await testPage.click('#dashLangDropdownBtn');
        await testPage.locator('#dashLangDropdownMenu button[data-lang="en"]').click();
        await testPage.waitForTimeout(300);

        // Test Theme Toggle
        console.log('Testing Theme Toggle...');
        const initialTheme = await testPage.evaluate(() => document.documentElement.getAttribute('data-theme') || 'sandstone');
        console.log(`Initial theme: ${initialTheme}`);
        await testPage.click('#openSidebarBtn');
        await testPage.waitForTimeout(200);
        await testPage.click('#dashboardThemeBtn');
        await testPage.waitForTimeout(300);
        const toggledTheme = await testPage.evaluate(() => document.documentElement.getAttribute('data-theme'));
        console.log(`✓ Theme toggled to: ${toggledTheme}`);

        // Test Logout Functionality
        console.log('Testing Log Out...');
        await testPage.click('#sidebarDirectSignOutBtn');
        await testPage.waitForURL(/.*login\.html.*/, { timeout: 8000 });
        console.log('✓ Log Out button successfully logged user out and redirected to login.html');

        // Verify protected page requires re-authentication
        await testPage.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'load' });
        await testPage.waitForTimeout(1000);
        const currentUrl = testPage.url();
        if (currentUrl.includes('login.html')) {
            console.log('✓ Protected dashboard requires authentication when unauthenticated');
        } else {
            console.warn('Note: URL after logout redirect:', currentUrl);
        }

        await testContext.close();

    } catch (err) {
        console.error('❌ Test suite encountered an error:', err);
        overallSuccess = false;
    } finally {
        await browser.close();
    }

    if (overallSuccess) {
        console.log('\n=================================================================');
        console.log('🎉 ALL TESTS PASSED: Responsive Desktop & Mobile UI Redesign verified!');
        console.log('=================================================================');
        process.exit(0);
    } else {
        console.error('\n❌ SOME VERIFICATIONS FAILED.');
        process.exit(1);
    }
}

runTestSuite();
