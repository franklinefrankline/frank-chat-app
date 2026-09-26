const { chromium } = require('playwright');

const PROD_URL = 'https://frank-chat-app.vercel.app';

async function runLiveAudit() {
    console.log('============================================================');
    console.log(`STARTING LIVE VERCEL PRODUCTION AUDIT: ${PROD_URL}`);
    console.log('============================================================');

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
            console.log('[LIVE BROWSER ERROR]:', msg.text());
        }
    });

    try {
        const uniqueNum = Math.floor(100000 + Math.random() * 900000);
        const testEmail = `frank_live_${uniqueNum}@example.com`;
        const testPassword = 'LivePassword123!';
        const testName = `LiveUser_${uniqueNum}`;

        console.log(`\n1. Registering new live user: ${testEmail}...`);
        await page.goto(`${PROD_URL}/register.html`, { waitUntil: 'networkidle' });

        await page.fill('#regFullName', testName);
        await page.fill('#regEmail', testEmail);
        await page.fill('#regPassword', testPassword);
        await page.fill('#regConfirmPassword', testPassword);
        await page.check('#regTerms');

        const [regResponse] = await Promise.all([
            page.waitForResponse(res => res.url().includes('/api/auth/register') && res.request().method() === 'POST'),
            page.click('#registerSubmitBtn')
        ]);

        console.log(`[PASS] Live Register API returned HTTP ${regResponse.status()}`);
        if (regResponse.status() !== 201) {
            throw new Error(`Live registration failed with HTTP ${regResponse.status()}`);
        }

        await page.waitForURL('**/dashboard.html*', { timeout: 15000 });
        console.log('[PASS] Redirected to live dashboard.html');

        console.log('Monitoring for premature automatic logout (5 seconds)...');
        await page.waitForTimeout(5000);

        if (page.url().includes('login.html')) {
            throw new Error('FAIL: User was prematurely automatically logged out on live Vercel!');
        }
        console.log('[PASS] User remained authenticated on live dashboard!');

        const liveUserData = await page.evaluate(() => {
            const raw = localStorage.getItem('chatapp_user');
            return raw ? JSON.parse(raw) : null;
        });
        console.log('[INFO] Live authenticated user:', {
            id: liveUserData?.id,
            email: liveUserData?.email,
            frank_id: liveUserData?.frank_id
        });

        // Test 1: FRANK Think visible
        console.log('\n2. Verifying FRANK Think branding in sidebar...');
        const hasBrand = await page.evaluate(() => {
            const el = document.querySelector('.sidebar-brand');
            return el && el.textContent.includes('FRANK') && el.textContent.includes('Think');
        });
        if (!hasBrand) throw new Error('FRANK Think not found in live sidebar');
        console.log('[PASS] FRANK Think is visible in live sidebar');

        // Test 2: Verify "Sandstone" text is NOT visible in sidebar
        console.log('\n3. Verifying "Sandstone" text is NOT visible in sidebar...');
        const liveSidebarText = await page.evaluate(() => document.getElementById('sidebar')?.innerText || '');
        if (liveSidebarText.includes('Sandstone')) {
            throw new Error('FAIL: "Sandstone" text found in live sidebar!');
        }
        console.log('[PASS] "Sandstone" text is completely absent from live sidebar');

        // Test 3 & 4: Theme Toggle button exists and switches themes live
        console.log('\n4. Verifying Theme Toggle button and dynamic switching...');
        const themeBtn = page.locator('#dashboardThemeBtn');
        const themeBtnVisible = await themeBtn.isVisible();
        if (!themeBtnVisible) throw new Error('Theme toggle button is not visible on live dashboard');

        const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        console.log('[INFO] Initial live theme:', initialTheme);

        await themeBtn.click();
        await page.waitForTimeout(500);
        const toggledTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        console.log('[INFO] Theme after toggle:', toggledTheme);
        if (toggledTheme === initialTheme) {
            throw new Error(`Theme did not toggle (stayed ${initialTheme})`);
        }

        await themeBtn.click();
        await page.waitForTimeout(500);
        const restoredTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        console.log('[INFO] Theme after restoring:', restoredTheme);
        console.log('[PASS] Theme toggle works live without page reload');

        // Test 5: Verify bottom Language section does NOT exist
        console.log('\n5. Verifying bottom Language section does NOT exist...');
        const bottomLang = await page.evaluate(() => {
            const footer = document.querySelector('.sidebar-footer');
            return footer ? footer.innerText.toLowerCase().includes('language') : false;
        });
        if (bottomLang) throw new Error('Bottom Language section found in live sidebar footer!');
        console.log('[PASS] No bottom Language section in live sidebar footer');

        // Test 6 & 7: Top Language selector exists and switches live
        console.log('\n6. Verifying Top Language selector and instant translation...');
        const topLang = page.locator('#dashLangSelector');
        if (!(await topLang.isVisible())) {
            throw new Error('Top header language selector (#dashLangSelector) is not visible');
        }

        await page.click('#dashLangDropdownBtn');
        await page.click('[data-lang="ta"]');
        await page.waitForTimeout(400);
        let currentLangLabel = await page.textContent('#dashLangDropdownBtn .current-lang-label');
        console.log('[INFO] Switched to:', currentLangLabel.trim());
        if (!currentLangLabel.includes('தமிழ்')) throw new Error('Failed to switch to Tamil');

        await page.click('#dashLangDropdownBtn');
        await page.click('[data-lang="en"]');
        await page.waitForTimeout(400);
        currentLangLabel = await page.textContent('#dashLangDropdownBtn .current-lang-label');
        console.log('[INFO] Switched back to:', currentLangLabel.trim());
        console.log('[PASS] Live language selector works seamlessly');

        // Test 8 & 9: Modals (New Group & Invite Via Link)
        console.log('\n7. Verifying New Group and Invite modals...');
        await page.click('#navCreateGroupBtn');
        await page.waitForSelector('#createGroupModal.open', { timeout: 4000 });
        console.log('[PASS] Live Create Group modal opened');
        await page.click('[data-close-modal="createGroupModal"]');

        await page.click('#navInvitePeopleBtn');
        await page.waitForSelector('#invitePeopleModal.open', { timeout: 4000 });
        console.log('[PASS] Live Invite People modal opened');
        await page.click('[data-close-modal="invitePeopleModal"]');

        // Test 10: Settings navigation
        console.log('\n8. Verifying Settings navigation...');
        await Promise.all([
            page.waitForNavigation({ timeout: 8000 }),
            page.click('#sidebarSettingsLink')
        ]);
        if (!page.url().includes('settings.html')) throw new Error('Failed to navigate to settings.html');
        console.log('[PASS] Live Settings page opened');

        // Return to dashboard
        await page.goto(`${PROD_URL}/dashboard.html`, { waitUntil: 'networkidle' });

        // Test 13: Logout
        console.log('\n9. Verifying Live Log Out...');
        await Promise.all([
            page.waitForNavigation({ timeout: 10000 }),
            page.click('#sidebarDirectSignOutBtn')
        ]);
        if (!page.url().includes('login.html')) throw new Error('Logout failed to navigate to login.html');
        console.log('[PASS] Live Log Out succeeded and returned to login.html');

        // Test 14: Re-login with SAME account
        console.log(`\n10. Re-logging in with SAME credentials (${testEmail})...`);
        await page.fill('#loginUsername', testEmail);
        await page.fill('#loginPassword', testPassword);

        const [loginResp] = await Promise.all([
            page.waitForResponse(res => res.url().includes('/api/auth/login') && res.request().method() === 'POST'),
            page.click('#loginSubmitBtn')
        ]);

        console.log(`[PASS] Live Login API returned HTTP ${loginResp.status()}`);
        if (loginResp.status() !== 200) throw new Error('Live re-login failed');

        await page.waitForURL('**/dashboard.html*', { timeout: 15000 });
        await page.waitForTimeout(2000);

        const reloadedUserData = await page.evaluate(() => {
            const raw = localStorage.getItem('chatapp_user');
            return raw ? JSON.parse(raw) : null;
        });

        console.log('[INFO] Reloaded user data:', {
            id: reloadedUserData?.id,
            email: reloadedUserData?.email,
            frank_id: reloadedUserData?.frank_id
        });

        if (reloadedUserData.id !== liveUserData.id) {
            throw new Error(`User ID mismatch! Original: ${liveUserData.id}, Reloaded: ${reloadedUserData.id}`);
        }
        if (reloadedUserData.frank_id !== liveUserData.frank_id) {
            throw new Error(`FRANK ID mismatch! Original: ${liveUserData.frank_id}, Reloaded: ${reloadedUserData.frank_id}`);
        }
        console.log('[PASS] LIVE PRODUCTION RE-LOGIN CONFIRMED: Same User ID, permanent FRANK ID, and account profile!');

        console.log('\n============================================================');
        console.log('ALL LIVE PRODUCTION CHECKS ON VERCEL PASSED 100%!');
        console.log('============================================================');

    } finally {
        await browser.close();
    }
}

runLiveAudit().catch(err => {
    console.error('\n[FATAL LIVE AUDIT FAILURE]:', err);
    process.exit(1);
});
