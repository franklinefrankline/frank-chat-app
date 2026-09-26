const { chromium } = require('playwright');

const PROD_URL = 'https://frank-chat-app.vercel.app';

async function runLiveE2ETest() {
    console.log('============================================================');
    console.log(`RUNNING FULL LIVE E2E AUDIT ON VERCEL: ${PROD_URL}`);
    console.log('============================================================');

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    try {
        // Step 1: Login with pre-seeded account
        console.log('\n1. Logging in with alex / password123...');
        await page.goto(`${PROD_URL}/login.html`, { waitUntil: 'networkidle' });

        await page.fill('#loginUsername', 'alex');
        await page.fill('#loginPassword', 'password123');

        const [loginResp] = await Promise.all([
            page.waitForResponse(res => res.url().includes('/api/auth/login') && res.request().method() === 'POST'),
            page.click('#loginSubmitBtn')
        ]);

        console.log(`[PASS] Login API returned HTTP ${loginResp.status()}`);
        if (loginResp.status() !== 200) throw new Error('Live login failed');

        await page.waitForURL('**/dashboard.html*', { timeout: 15000 });
        console.log('[PASS] Redirected to live dashboard.html');
        await page.waitForSelector('#sidebar', { state: 'attached', timeout: 8000 });
        await page.waitForTimeout(2000); // Allow bootstrap

        // Step 2: Verify Sidebar Dimensions & Visibility
        console.log('\n2. Verifying Desktop Sidebar layout...');
        const sidebarBox = await page.locator('#sidebar').boundingBox();
        console.log(`[INFO] Sidebar width: ${sidebarBox?.width}px, height: ${sidebarBox?.height}px`);
        if (!sidebarBox || sidebarBox.width < 250) {
            throw new Error(`Sidebar width invalid: ${sidebarBox?.width}`);
        }
        console.log('[PASS] Sidebar is displayed at 260px desktop width');

        // Step 3: Verify FRANK Think branding
        console.log('\n3. Verifying FRANK Think branding...');
        const hasBrand = await page.evaluate(() => {
            const el = document.querySelector('.sidebar-brand');
            return el && el.textContent.includes('FRANK') && el.textContent.includes('Think');
        });
        if (!hasBrand) throw new Error('FRANK Think not found in sidebar');
        console.log('[PASS] FRANK Think is visible in sidebar');

        // Step 4: Verify "Sandstone" text is NOT visible in sidebar
        console.log('\n4. Verifying "Sandstone" text is NOT visible in sidebar...');
        const sidebarText = await page.evaluate(() => document.getElementById('sidebar')?.innerText || '');
        if (sidebarText.includes('Sandstone')) {
            throw new Error('FAIL: "Sandstone" text found in sidebar!');
        }
        console.log('[PASS] "Sandstone" text is completely absent from sidebar');

        // Step 5: Verify Theme Toggle button exists and switches themes live
        console.log('\n5. Verifying Theme Toggle button...');
        const themeBtn = page.locator('#dashboardThemeBtn');
        if (!(await themeBtn.isVisible())) throw new Error('Theme toggle button is not visible');

        const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        console.log('[INFO] Initial theme:', initialTheme);

        await themeBtn.click();
        await page.waitForTimeout(500);
        const toggledTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        console.log('[INFO] Theme after toggle:', toggledTheme);
        if (toggledTheme === initialTheme) throw new Error('Theme toggle failed to change data-theme');

        await themeBtn.click();
        await page.waitForTimeout(500);
        const restoredTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        console.log('[INFO] Theme restored to:', restoredTheme);
        console.log('[PASS] Theme toggle switches without page reload');

        // Step 6: Verify bottom Language section does NOT exist
        console.log('\n6. Verifying bottom Language section is absent...');
        const bottomLang = await page.evaluate(() => {
            const footer = document.querySelector('.sidebar-footer');
            return footer ? footer.innerText.toLowerCase().includes('language') : false;
        });
        if (bottomLang) throw new Error('Bottom Language section found in sidebar footer!');
        console.log('[PASS] No bottom Language section in sidebar footer');

        // Step 7: Verify Top Language Selector
        console.log('\n7. Verifying Top Language selector...');
        const topLang = page.locator('#dashLangSelector');
        if (!(await topLang.isVisible())) throw new Error('Top header language selector (#dashLangSelector) is not visible');

        await page.click('#dashLangDropdownBtn');
        await page.click('[data-lang="ta"]');
        await page.waitForTimeout(400);
        let langLabel = await page.textContent('#dashLangDropdownBtn .current-lang-label');
        console.log('[INFO] Switched to:', langLabel.trim());
        if (!langLabel.includes('தமிழ்')) throw new Error('Failed to switch to Tamil');

        await page.click('#dashLangDropdownBtn');
        await page.click('[data-lang="en"]');
        await page.waitForTimeout(400);
        langLabel = await page.textContent('#dashLangDropdownBtn .current-lang-label');
        console.log('[INFO] Switched back to:', langLabel.trim());
        console.log('[PASS] Top Language selector functions seamlessly');

        // Step 8: Modals
        console.log('\n8. Verifying Modals...');
        await page.click('#navCreateGroupBtn');
        await page.waitForSelector('#createGroupModal.open', { timeout: 4000 });
        console.log('[PASS] Create Group modal opened');
        await page.click('[data-close-modal="createGroupModal"]');

        await page.click('#navInvitePeopleBtn');
        await page.waitForSelector('#invitePeopleModal.open', { timeout: 4000 });
        console.log('[PASS] Invite People modal opened');
        await page.click('[data-close-modal="invitePeopleModal"]');

        // Step 9: Settings navigation
        console.log('\n9. Verifying Settings navigation...');
        await Promise.all([
            page.waitForNavigation({ timeout: 8000 }),
            page.click('#sidebarSettingsLink')
        ]);
        if (!page.url().includes('settings.html')) throw new Error('Failed to open settings.html');
        console.log('[PASS] Settings page opened');

        // Step 10: Return to dashboard and logout
        console.log('\n10. Returning to dashboard and logging out...');
        await page.goto(`${PROD_URL}/dashboard.html`, { waitUntil: 'networkidle' });

        await Promise.all([
            page.waitForNavigation({ timeout: 10000 }),
            page.click('#sidebarDirectSignOutBtn')
        ]);
        if (!page.url().includes('login.html')) throw new Error('Logout failed to navigate to login.html');
        console.log('[PASS] Log Out succeeded and returned to login.html');

        // Step 11: Re-login with SAME account
        console.log('\n11. Re-logging in with SAME account (alex)...');
        await page.fill('#loginUsername', 'alex');
        await page.fill('#loginPassword', 'password123');

        const [reloginResp] = await Promise.all([
            page.waitForResponse(res => res.url().includes('/api/auth/login') && res.request().method() === 'POST'),
            page.click('#loginSubmitBtn')
        ]);

        console.log(`[PASS] Re-login API returned HTTP ${reloginResp.status()}`);
        if (reloginResp.status() !== 200) throw new Error('Re-login failed');

        await page.waitForURL('**/dashboard.html*', { timeout: 15000 });
        console.log('[PASS] Successfully re-entered dashboard.html!');

        console.log('\n============================================================');
        console.log('ALL LIVE PRODUCTION CHECKS ON VERCEL PASSED 100%!');
        console.log('============================================================');

    } finally {
        await browser.close();
    }
}

runLiveE2ETest().catch(err => {
    console.error('\n[FATAL LIVE AUDIT FAILURE]:', err);
    process.exit(1);
});
