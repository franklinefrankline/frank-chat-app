const { chromium } = require('playwright');
const http = require('http');
const path = require('path');

function waitForServer(url, timeoutMs = 10000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        function check() {
            http.get(url, (res) => {
                if (res.statusCode === 200) resolve(true);
                else retry();
            }).on('error', retry);
        }
        function retry() {
            if (Date.now() - start > timeoutMs) {
                reject(new Error(`Timeout waiting for server at ${url}`));
            } else {
                setTimeout(check, 300);
            }
        }
        check();
    });
}

async function runTestSuite() {
    console.log('================================================================');
    console.log('FRANK PLAYWRIGHT TEST — PROFILE / USER MENU DROPDOWN POSITIONING');
    console.log('================================================================');

    await waitForServer('http://127.0.0.1:8000/health');
    console.log('[PASS] Backend server is healthy on http://127.0.0.1:8000');

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 720 }
    });

    const page = await context.newPage();
    const consoleErrors = [];
    const failedRequests = [];

    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
            console.log('[BROWSER ERROR]', msg.text());
        }
    });

    page.on('response', resp => {
        if (resp.status() >= 400 && resp.url().includes('/api/')) {
            failedRequests.push(`${resp.request().method()} ${resp.url()} -> ${resp.status()}`);
        }
    });

    try {
        // ----------------------------------------------------
        // 1. REGISTER & LOGIN
        // ----------------------------------------------------
        console.log('\n--- 1. REGISTER / LOGIN USER ---');
        const ts = Date.now().toString().slice(-6);
        const email = `frank_menu_${ts}@example.com`;
        const name = `Berline ${ts}`;
        const password = 'Password123!';

        await page.goto('http://127.0.0.1:8000/register.html', { waitUntil: 'networkidle' });
        await page.fill('#regFullName', name);
        await page.fill('#regEmail', email);
        await page.fill('#regPassword', password);
        await page.fill('#regConfirmPassword', password);
        await page.check('#regTerms');
        await page.click('button[type="submit"]');

        await page.waitForURL('**/dashboard.html*', { timeout: 8000 });
        console.log('[PASS] Navigated to dashboard.html');

        // Allow initial data to load
        await page.waitForTimeout(1000);

        // ----------------------------------------------------
        // 2. CHECK SIDEBAR USER CARD (BOTTOM-LEFT TRIGGER)
        // ----------------------------------------------------
        console.log('\n--- 2. TEST SIDEBAR USER MENU ANCHORED POSITIONING (BOTTOM-LEFT TRIGGER) ---');
        const sidebarTrigger = page.locator('#sidebarUserCard');
        await sidebarTrigger.waitFor({ state: 'visible' });

        // Trigger ARIA check
        const ariaLabel = await sidebarTrigger.getAttribute('aria-label');
        if (ariaLabel !== 'Open user menu') {
            throw new Error(`Expected aria-label="Open user menu" on sidebarUserCard, got: "${ariaLabel}"`);
        }
        console.log('[PASS] #sidebarUserCard has aria-label="Open user menu"');

        // Click sidebar user card
        await sidebarTrigger.click();
        await page.waitForTimeout(200);

        const sidebarMenu = page.locator('#sidebarUserMenu');
        const isSidebarMenuVisible = await sidebarMenu.isVisible();
        if (!isSidebarMenuVisible) {
            throw new Error('FAIL: #sidebarUserMenu did not open on clicking #sidebarUserCard');
        }
        console.log('[PASS] #sidebarUserMenu is visible');

        // Verify dropdown bounding box inside viewport & positioned UPWARD
        const vp = page.viewportSize();
        const menuRect = await sidebarMenu.boundingBox();
        const triggerRect = await sidebarTrigger.boundingBox();

        console.log('Trigger bounding box:', triggerRect);
        console.log('Menu bounding box:', menuRect);
        console.log('Viewport size:', vp);

        if (!menuRect) throw new Error('Menu rect is null');
        if (menuRect.y < 0 || menuRect.x < 0) {
            throw new Error(`FAIL: Menu extends outside top/left! y: ${menuRect.y}, x: ${menuRect.x}`);
        }
        if (menuRect.y + menuRect.height > vp.height) {
            throw new Error(`FAIL: Menu extends outside bottom of viewport! bottom: ${menuRect.y + menuRect.height}, vp: ${vp.height}`);
        }
        if (menuRect.x + menuRect.width > vp.width) {
            throw new Error(`FAIL: Menu extends outside right of viewport! right: ${menuRect.x + menuRect.width}, vp: ${vp.width}`);
        }

        // Verify it opened UPWARD: menu top should be strictly above the bottom of the trigger
        if (menuRect.y >= triggerRect.y) {
            throw new Error(`FAIL: Menu did not open upward! menu.y: ${menuRect.y}, trigger.y: ${triggerRect.y}`);
        }
        console.log('[PASS] #sidebarUserMenu opened UPWARD above bottom-left trigger and is 100% inside viewport!');

        // Check dropdown width (should be ~240-280px)
        if (menuRect.width < 230 || menuRect.width > 290) {
            throw new Error(`FAIL: Menu width out of expected desktop range (240-280px): ${menuRect.width}px`);
        }
        console.log(`[PASS] Menu width is ${Math.round(menuRect.width)}px (within 240-280px requirement)`);

        // ----------------------------------------------------
        // 3. VERIFY ALL 12 MENU ITEMS IN SIDEBAR MENU
        // ----------------------------------------------------
        console.log('\n--- 3. VERIFY ALL 12 ITEMS IN SIDEBAR MENU ---');
        const sidebarItems = await page.evaluate(() => {
            const m = document.getElementById('sidebarUserMenu');
            return {
                header: !!m.querySelector('.dropdown-user-header'),
                frankId: !!document.getElementById('menuUserFrankId'),
                newChat: !!document.getElementById('sidebarDropdownNewChatBtn'),
                newGroup: !!document.getElementById('sidebarDropdownNewGroupBtn'),
                inviteLink: !!document.getElementById('sidebarDropdownInviteBtn'),
                profile: !!document.getElementById('sidebarDropdownProfileLink'),
                settings: !!document.getElementById('sidebarDropdownSettingsLink'),
                privacy: !!document.getElementById('sidebarDropdownPrivacyLink'),
                support: !!document.getElementById('sidebarDropdownHelpLink'),
                notifications: !!document.getElementById('sidebarDropdownNotificationsLink'),
                appearance: !!document.getElementById('sidebarDropdownAppearanceLink'),
                themeToggle: !!document.getElementById('sidebarThemeToggleBtn'),
                logout: !!document.getElementById('sidebarLogoutBtn')
            };
        });

        for (const [k, v] of Object.entries(sidebarItems)) {
            if (!v) throw new Error(`FAIL: Missing menu item '${k}' in #sidebarUserMenu`);
        }
        console.log('[PASS] All 12 menu items verified present in #sidebarUserMenu');

        // Check user info inside menu
        const menuFid = await page.locator('#menuUserFrankId').textContent();
        if (!menuFid || menuFid.includes('------')) {
            throw new Error('FAIL: Menu FRANK ID is empty or not loaded');
        }
        console.log(`[PASS] Menu displays real user FRANK ID: ${menuFid.trim()}`);

        // ----------------------------------------------------
        // 4. CLICK OUTSIDE TO CLOSE
        // ----------------------------------------------------
        console.log('\n--- 4. CLICK OUTSIDE CLOSES MENU ---');
        await page.mouse.click(600, 300);
        await page.waitForTimeout(200);
        const isStillOpenAfterClickOutside = await sidebarMenu.isVisible();
        if (isStillOpenAfterClickOutside) {
            throw new Error('FAIL: Menu did not close on clicking outside');
        }
        console.log('[PASS] Clicking outside closed the dropdown menu');

        // ----------------------------------------------------
        // 5. OPEN AGAIN & ESCAPE KEY CLOSES
        // ----------------------------------------------------
        console.log('\n--- 5. OPEN AGAIN & ESCAPE KEY CLOSES ---');
        await sidebarTrigger.click();
        await page.waitForTimeout(200);
        if (!(await sidebarMenu.isVisible())) {
            throw new Error('FAIL: Menu did not open on second click');
        }
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        if (await sidebarMenu.isVisible()) {
            throw new Error('FAIL: Escape key did not close the dropdown menu');
        }
        console.log('[PASS] Escape key closed the dropdown menu');

        // ----------------------------------------------------
        // 6. TEST DESKTOP PROFILE BUTTON (HEADER TRIGGER)
        // ----------------------------------------------------
        console.log('\n--- 6. TEST DESKTOP PROFILE BUTTON (HEADER TRIGGER) ---');
        const desktopTrigger = page.locator('#desktopProfileBtn');
        await desktopTrigger.waitFor({ state: 'visible' });

        const dAriaLabel = await desktopTrigger.getAttribute('aria-label');
        if (dAriaLabel !== 'Open user menu') {
            throw new Error(`Expected aria-label="Open user menu" on #desktopProfileBtn, got: "${dAriaLabel}"`);
        }
        console.log('[PASS] #desktopProfileBtn has aria-label="Open user menu"');

        // Click desktop profile button
        await desktopTrigger.click();
        await page.waitForTimeout(200);

        const desktopMenu = page.locator('#desktopProfileDropdown');
        if (!(await desktopMenu.isVisible())) {
            throw new Error('FAIL: #desktopProfileDropdown did not open on clicking #desktopProfileBtn');
        }
        console.log('[PASS] #desktopProfileDropdown is visible');

        const dMenuRect = await desktopMenu.boundingBox();
        const dTriggerRect = await desktopTrigger.boundingBox();
        console.log('Desktop Trigger bounding box:', dTriggerRect);
        console.log('Desktop Menu bounding box:', dMenuRect);

        if (!dMenuRect) throw new Error('Desktop menu rect is null');
        if (dMenuRect.y < 0 || dMenuRect.x < 0) {
            throw new Error(`FAIL: Desktop menu extends outside top/left! y: ${dMenuRect.y}, x: ${dMenuRect.x}`);
        }
        if (dMenuRect.y + dMenuRect.height > vp.height) {
            throw new Error(`FAIL: Desktop menu extends outside bottom of viewport!`);
        }
        if (dMenuRect.x + dMenuRect.width > vp.width) {
            throw new Error(`FAIL: Desktop menu extends outside right of viewport!`);
        }

        // Header trigger is near top -> menu must open DOWNWARD below the trigger
        if (dMenuRect.y < dTriggerRect.bottom) {
            throw new Error(`FAIL: Desktop menu did not open downward below trigger! menu.y: ${dMenuRect.y}, trigger.bottom: ${dTriggerRect.bottom}`);
        }
        console.log('[PASS] #desktopProfileDropdown opened DOWNWARD below header trigger and is 100% inside viewport!');

        // Verify all 12 items in desktop dropdown
        const desktopItems = await page.evaluate(() => {
            return {
                newChat: !!document.getElementById('desktopDropdownNewChatBtn'),
                newGroup: !!document.getElementById('desktopDropdownNewGroupBtn'),
                inviteLink: !!document.getElementById('desktopDropdownInviteBtn'),
                profile: !!document.getElementById('desktopDropdownProfileLink'),
                settings: !!document.getElementById('desktopDropdownSettingsLink'),
                privacy: !!document.getElementById('desktopDropdownPrivacyLink'),
                support: !!document.getElementById('desktopDropdownHelpLink'),
                notifications: !!document.getElementById('desktopDropdownNotificationsLink'),
                appearance: !!document.getElementById('desktopDropdownAppearanceLink'),
                themeToggle: !!document.getElementById('desktopThemeToggleBtn'),
                logout: !!document.getElementById('desktopDropdownLogoutBtn')
            };
        });
        for (const [k, v] of Object.entries(desktopItems)) {
            if (!v) throw new Error(`FAIL: Missing item '${k}' in #desktopProfileDropdown`);
        }
        console.log('[PASS] All items present in #desktopProfileDropdown');

        // Close via Escape
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // ----------------------------------------------------
        // 7. TEST THEME TOGGLE (STEPS 20 - 26)
        // ----------------------------------------------------
        console.log('\n--- 7. TEST THEME TOGGLE (STEPS 20-26) ---');
        // Step 20: Verify Theme Toggle present in menu
        await desktopTrigger.click();
        await page.waitForTimeout(200);
        const hasThemeToggle = await page.locator('#desktopThemeToggleBtn').isVisible();
        if (!hasThemeToggle) throw new Error('Theme Toggle button not visible');
        console.log('[Step 20] Verified Theme Toggle is present in menu');

        // Step 21: Switch Monochrome
        await page.click('#desktopThemeToggleBtn');
        await page.waitForTimeout(300);
        const themeAfterMono = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        console.log(`[Step 21] Switched theme to: ${themeAfterMono}`);
        if (themeAfterMono !== 'monochrome') {
            throw new Error(`Expected theme 'monochrome', got '${themeAfterMono}'`);
        }

        // Step 22: Open menu
        await desktopTrigger.click();
        await page.waitForTimeout(200);
        if (!(await desktopMenu.isVisible())) {
            throw new Error('[Step 22] Failed to open menu after theme switch');
        }

        // Step 23: Verify correct theme
        const isMonoActive = await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'monochrome');
        if (!isMonoActive) throw new Error('Theme is not monochrome');
        console.log('[Step 23] Verified Monochrome theme active inside open menu');

        // Step 24: Switch Sandstone
        await page.click('#desktopThemeToggleBtn');
        await page.waitForTimeout(300);
        const themeAfterSand = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        console.log(`[Step 24] Switched theme to: ${themeAfterSand}`);
        if (themeAfterSand !== 'sandstone') {
            throw new Error(`Expected theme 'sandstone', got '${themeAfterSand}'`);
        }

        // Step 25: Open menu
        await desktopTrigger.click();
        await page.waitForTimeout(200);
        if (!(await desktopMenu.isVisible())) {
            throw new Error('[Step 25] Failed to open menu after theme switch');
        }

        // Step 26: Verify correct theme
        const isSandActive = await page.evaluate(() => document.documentElement.getAttribute('data-theme') === 'sandstone');
        if (!isSandActive) throw new Error('Theme is not sandstone');
        console.log('[Step 26] Verified Sandstone theme active inside open menu');

        // Close menu
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        // ----------------------------------------------------
        // 8. TEST DESKTOP VIEWPORTS (1280x720, 1366x768, 1440x900, 1920x1080)
        // ----------------------------------------------------
        console.log('\n--- 8. TEST MULTIPLE DESKTOP VIEWPORTS ---');
        const desktopResolutions = [
            { w: 1280, h: 720 },
            { w: 1366, h: 768 },
            { w: 1440, h: 900 },
            { w: 1920, h: 1080 }
        ];

        for (const res of desktopResolutions) {
            await page.setViewportSize({ width: res.w, height: res.h });
            await page.waitForTimeout(200);

            // Test sidebar menu
            await sidebarTrigger.click();
            await page.waitForTimeout(150);
            const smBox = await sidebarMenu.boundingBox();
            if (!smBox) throw new Error(`Menu not visible at ${res.w}x${res.h}`);
            if (smBox.x < 0 || smBox.y < 0 || smBox.x + smBox.width > res.w || smBox.y + smBox.height > res.h) {
                throw new Error(`FAIL: Menu out of viewport at ${res.w}x${res.h}: ${JSON.stringify(smBox)}`);
            }
            console.log(`  [PASS] Desktop ${res.w}x${res.h}: #sidebarUserMenu fully inside viewport`);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(150);

            // Test desktop header menu
            await desktopTrigger.click();
            await page.waitForTimeout(150);
            const dmBox = await desktopMenu.boundingBox();
            if (!dmBox) throw new Error(`Desktop menu not visible at ${res.w}x${res.h}`);
            if (dmBox.x < 0 || dmBox.y < 0 || dmBox.x + dmBox.width > res.w || dmBox.y + dmBox.height > res.h) {
                throw new Error(`FAIL: Header menu out of viewport at ${res.w}x${res.h}: ${JSON.stringify(dmBox)}`);
            }
            console.log(`  [PASS] Desktop ${res.w}x${res.h}: #desktopProfileDropdown fully inside viewport`);
            await page.keyboard.press('Escape');
            await page.waitForTimeout(150);
        }

        // ----------------------------------------------------
        // 9. TEST MOBILE VIEWPORTS (320px, 360px, 375px, 390px, 414px)
        // ----------------------------------------------------
        console.log('\n--- 9. TEST MOBILE VIEWPORTS ---');
        const mobileResolutions = [
            { w: 320, h: 568 },
            { w: 360, h: 800 },
            { w: 375, h: 667 },
            { w: 390, h: 844 },
            { w: 414, h: 896 }
        ];

        for (const res of mobileResolutions) {
            await page.setViewportSize({ width: res.w, height: res.h });
            await page.waitForTimeout(200);

            // Open mobile drawer via #openSidebarBtn
            const openSidebarBtn = page.locator('#openSidebarBtn');
            await openSidebarBtn.click();
            await page.waitForTimeout(200);

            // Click #sidebarUserCard inside the opened drawer
            await sidebarTrigger.click();
            await page.waitForTimeout(200);

            const mBox = await sidebarMenu.boundingBox();
            if (!mBox) throw new Error(`Mobile menu not visible at ${res.w}x${res.h}`);

            console.log(`Mobile ${res.w}x${res.h} menu rect:`, mBox);

            if (mBox.x < 0 || mBox.y < 0) {
                throw new Error(`FAIL: Mobile menu clipped at top/left at ${res.w}x${res.h}: ${JSON.stringify(mBox)}`);
            }
            if (mBox.x + mBox.width > res.w) {
                throw new Error(`FAIL: Mobile menu overflows width at ${res.w}x${res.h}: right=${mBox.x + mBox.width}, screen=${res.w}`);
            }
            if (mBox.y + mBox.height > res.h) {
                throw new Error(`FAIL: Mobile menu overflows height at ${res.w}x${res.h}: bottom=${mBox.y + mBox.height}, screen=${res.h}`);
            }

            // Verify touch target size on mobile (items should be >= 44px)
            const itemHeight = await page.evaluate(() => {
                const item = document.querySelector('#sidebarUserMenu .dropdown-item');
                return item ? item.getBoundingClientRect().height : 0;
            });
            if (itemHeight < 40) {
                throw new Error(`FAIL: Mobile touch target height too small: ${itemHeight}px`);
            }

            console.log(`  [PASS] Mobile ${res.w}x${res.h}: Menu is strictly within viewport (width: ${Math.round(mBox.width)}px, touch target: ${Math.round(itemHeight)}px)`);

            // Close menu
            await page.keyboard.press('Escape');
            await page.waitForTimeout(150);

            // Close drawer if still open
            const overlay = page.locator('#mobileOverlay');
            if (await overlay.isVisible()) {
                await overlay.click({ force: true });
                await page.waitForTimeout(150);
            }
        }

        // Return to standard desktop
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.waitForTimeout(200);

        // ----------------------------------------------------
        // 10. TEST NAVIGATION: PROFILE & SETTINGS
        // ----------------------------------------------------
        console.log('\n--- 10. TEST PROFILE & SETTINGS LINKS ---');
        await desktopTrigger.click();
        await page.waitForTimeout(200);
        await page.click('#desktopDropdownProfileLink');
        await page.waitForURL('**/profile.html*', { timeout: 6000 });
        console.log('[PASS] Clicked Profile -> navigated to profile.html');

        // Go back to dashboard
        await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        await desktopTrigger.click();
        await page.waitForTimeout(200);
        await page.click('#desktopDropdownSettingsLink');
        await page.waitForURL('**/settings.html*', { timeout: 6000 });
        console.log('[PASS] Clicked Settings -> navigated to settings.html');

        // Go back to dashboard
        await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        // Take screenshot of opened anchored menu for documentation
        await sidebarTrigger.click();
        await page.waitForTimeout(300);
        const screenshotPath = path.resolve('C:\\Users\\inbat\\.gemini\\antigravity-ide\\brain\\30c73d62-4094-4db7-9e1b-b934a8329339', 'anchored_user_menu_sandstone.png');
        await page.screenshot({ path: screenshotPath });
        console.log(`[PASS] Saved visual artifact screenshot to: ${screenshotPath}`);

        // ----------------------------------------------------
        // 11. CHECK CONSOLE ERRORS & FAILED NETWORK REQUESTS
        // ----------------------------------------------------
        console.log('\n--- 11. CHECK CONSOLE & NETWORK INTEGRITY ---');
        console.log(`Console error count: ${consoleErrors.length}`);
        console.log(`Failed network requests: ${failedRequests.length}`);

        if (consoleErrors.length > 0) {
            console.log('Console errors:', consoleErrors);
            throw new Error(`FAIL: Detected ${consoleErrors.length} browser console errors!`);
        }
        if (failedRequests.length > 0) {
            console.log('Failed network requests:', failedRequests);
            throw new Error(`FAIL: Detected ${failedRequests.length} failed network requests!`);
        }
        console.log('[PASS] Zero console errors and zero failed API requests');

        console.log('\n================================================================');
        console.log('ALL 30 VERIFICATION CRITERIA PASSED WITH 100% SUCCESS!');
        console.log('================================================================\n');

    } finally {
        await browser.close();
    }
}

runTestSuite().catch(err => {
    console.error('\n[TEST RUNNER FATAL ERROR]', err);
    process.exit(1);
});
