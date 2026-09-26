const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

function waitForServer(url, timeoutMs = 20000) {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        function check() {
            http.get(url, (res) => {
                if (res.statusCode === 200) {
                    resolve(true);
                } else {
                    retry();
                }
            }).on('error', () => {
                retry();
            });
        }
        function retry() {
            if (Date.now() - start > timeoutMs) {
                reject(new Error(`Timeout waiting for server at ${url}`));
            } else {
                setTimeout(check, 400);
            }
        }
        check();
    });
}

async function runTest() {
    console.log('============================================================');
    console.log('STARTING FINAL LEFT SIDEBAR UI CORRECTION & AUTH TEST SUITE');
    console.log('============================================================');

    const projectRoot = path.resolve(__dirname, '..');
    let serverProcess = null;

    try {
        await waitForServer('http://127.0.0.1:8000/health', 1500);
        console.log('[INFO] Backend server already running on port 8000.');
    } catch {
        console.log('[INFO] Starting backend server via python main.py...');
        serverProcess = spawn('python', ['main.py'], {
            cwd: projectRoot,
            env: { ...process.env, PORT: '8000', HOST: '127.0.0.1' },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        await waitForServer('http://127.0.0.1:8000/health', 25000);
        console.log('[PASS] Backend server successfully started and responding.');
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
            console.log('[BROWSER CONSOLE ERROR]:', msg.text());
        }
    });
    page.on('pageerror', err => {
        pageErrors.push(err.message);
        console.log('[BROWSER UNCAUGHT ERROR]:', err.message);
    });
    page.on('response', resp => {
        if (resp.status() >= 400 && !resp.url().includes('favicon') && !resp.url().includes('404')) {
            failedRequests.push({ url: resp.url(), status: resp.status() });
            console.log(`[NETWORK FAIL ${resp.status()}]:`, resp.url());
        }
    });

    try {
        // Register a clean test user
        const uniqueNum = Math.floor(100000 + Math.random() * 900000);
        const testEmail = `frank_sidebar_${uniqueNum}@example.com`;
        const testPassword = 'Password123!';
        const testName = `FrankUser_${uniqueNum}`;

        console.log(`\nRegistering user ${testEmail}...`);
        await page.goto('http://127.0.0.1:8000/register.html', { waitUntil: 'networkidle' });
        await page.fill('#regFullName', testName);
        await page.fill('#regEmail', testEmail);
        await page.fill('#regPassword', testPassword);
        await page.fill('#regConfirmPassword', testPassword);
        await page.check('#regTerms');

        const [regResponse] = await Promise.all([
            page.waitForResponse(res => res.url().includes('/api/auth/register') && res.request().method() === 'POST'),
            page.click('#registerSubmitBtn')
        ]);

        if (regResponse.status() !== 201) {
            throw new Error(`Registration failed with HTTP ${regResponse.status()}`);
        }
        console.log('[PASS] Registration succeeded with HTTP 201');

        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        await page.waitForSelector('#sidebar', { state: 'attached', timeout: 8000 });
        await page.waitForTimeout(2000); // Allow bootstrap

        const initialUserData = await page.evaluate(() => {
            const raw = localStorage.getItem('chatapp_user');
            return raw ? JSON.parse(raw) : null;
        });
        console.log('[INFO] Loaded user on dashboard:', initialUserData);
        if (!initialUserData || !initialUserData.id || !initialUserData.frank_id) {
            throw new Error('User data missing or invalid in localStorage');
        }

        // ---------------- TEST 1: FRANK Think visible ----------------
        console.log('\n--- TEST 1: FRANK Think Visible ---');
        const frankThinkVisible = await page.evaluate(() => {
            const brandText = document.querySelector('.sidebar-brand');
            return brandText && brandText.textContent.includes('FRANK') && brandText.textContent.includes('Think');
        });
        if (!frankThinkVisible) throw new Error('FRANK Think not found or not visible in sidebar');
        console.log('[PASS] Test 1: FRANK Think is visible in sidebar');

        // ---------------- TEST 2: Sandstone NOT visible in sidebar ----------------
        console.log('\n--- TEST 2: Verify "Sandstone" text is NOT visible in sidebar ---');
        const sidebarText = await page.evaluate(() => {
            const sidebar = document.getElementById('sidebar');
            return sidebar ? sidebar.innerText : '';
        });
        console.log('[INFO] Sidebar text preview:', sidebarText.replace(/\n+/g, ' | ').slice(0, 200));
        if (sidebarText.includes('Sandstone')) {
            throw new Error('FAIL: "Sandstone" text is still visible in sidebar!');
        }
        console.log('[PASS] Test 2: The text "Sandstone" is NOT visible in the sidebar');

        // ---------------- TEST 3: Theme Toggle button exists and is visible ----------------
        console.log('\n--- TEST 3: Verify Theme Toggle button exists and is visible ---');
        const themeBtn = page.locator('#dashboardThemeBtn');
        const isThemeBtnVisible = await themeBtn.isVisible();
        if (!isThemeBtnVisible) throw new Error('FAIL: Theme toggle button (#dashboardThemeBtn) is not visible');
        console.log('[PASS] Test 3: Theme toggle button exists and is visible');

        // ---------------- TEST 4: Click theme toggle. Verify theme changes ----------------
        console.log('\n--- TEST 4: Click Theme Toggle & Verify Theme Changes ---');
        const initialTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        console.log('[INFO] Current theme before click:', initialTheme);
        await themeBtn.click();
        await page.waitForTimeout(400);

        const newTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        console.log('[INFO] Theme after 1st click:', newTheme);
        if (newTheme === initialTheme) {
            throw new Error(`FAIL: Theme did not change upon clicking toggle (stayed ${initialTheme})`);
        }
        console.log(`[PASS] Theme changed successfully from ${initialTheme} to ${newTheme}`);

        // Click again to cycle back
        await themeBtn.click();
        await page.waitForTimeout(400);
        const cycledTheme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        console.log('[INFO] Theme after 2nd click:', cycledTheme);
        if (cycledTheme !== initialTheme) {
            throw new Error(`FAIL: Theme did not cycle back to ${initialTheme}`);
        }
        console.log('[PASS] Test 4: Theme toggle switches between themes without page reload');

        // Verify "Sandstone" text still NOT in sidebar after toggling
        const sidebarTextAfterToggle = await page.evaluate(() => document.getElementById('sidebar')?.innerText || '');
        if (sidebarTextAfterToggle.includes('Sandstone')) {
            throw new Error('FAIL: "Sandstone" text appeared after toggling theme!');
        }
        console.log('[PASS] Verify: "Sandstone" text did not reappear after theme toggling');

        // ---------------- TEST 5: Bottom Language section does NOT exist in sidebar ----------------
        console.log('\n--- TEST 5: Verify Bottom Language section does NOT exist in sidebar ---');
        const bottomLangExists = await page.evaluate(() => {
            const sidebar = document.getElementById('sidebar');
            if (!sidebar) return false;
            const langSelector = sidebar.querySelector('#sidebarLangSelector, .lang-selector-container, select[name="language"], [data-lang]');
            const textMatch = sidebar.querySelector('.sidebar-footer')?.innerText.toLowerCase().includes('language');
            return !!(langSelector || textMatch);
        });
        if (bottomLangExists) {
            throw new Error('FAIL: Bottom Language section still found in sidebar!');
        }
        console.log('[PASS] Test 5: Bottom Language section does NOT exist in sidebar');

        // ---------------- TEST 6: Top Language selector EXISTS ----------------
        console.log('\n--- TEST 6: Verify Top Language selector exists ---');
        const topLangSelector = page.locator('#dashLangSelector');
        const isTopLangVisible = await topLangSelector.isVisible();
        if (!isTopLangVisible) {
            throw new Error('FAIL: Top header language selector (#dashLangSelector) is not visible');
        }
        console.log('[PASS] Test 6: Top Language selector exists and is visible');

        // ---------------- TEST 7: Change language (English -> Tamil -> Hindi -> English) ----------------
        console.log('\n--- TEST 7: Test Language Switching (English -> Tamil -> Hindi -> English) ---');
        await page.click('#dashLangDropdownBtn');
        await page.waitForSelector('#dashLangDropdownMenu.show, #dashLangDropdownMenu.open, .lang-dropdown-menu', { timeout: 3000 });
        await page.click('[data-lang="ta"]');
        await page.waitForTimeout(500);

        let currentLangLabel = await page.textContent('#dashLangDropdownBtn .current-lang-label');
        console.log('[INFO] Switched to:', currentLangLabel.trim());
        if (!currentLangLabel.includes('தமிழ்')) {
            throw new Error(`Expected Tamil label but found "${currentLangLabel}"`);
        }

        // Switch to Hindi
        await page.click('#dashLangDropdownBtn');
        await page.click('[data-lang="hi"]');
        await page.waitForTimeout(500);
        currentLangLabel = await page.textContent('#dashLangDropdownBtn .current-lang-label');
        console.log('[INFO] Switched to:', currentLangLabel.trim());
        if (!currentLangLabel.includes('हिन्दी')) {
            throw new Error(`Expected Hindi label but found "${currentLangLabel}"`);
        }

        // Switch back to English
        await page.click('#dashLangDropdownBtn');
        await page.click('[data-lang="en"]');
        await page.waitForTimeout(500);
        currentLangLabel = await page.textContent('#dashLangDropdownBtn .current-lang-label');
        console.log('[INFO] Switched back to:', currentLangLabel.trim());
        if (!currentLangLabel.includes('English')) {
            throw new Error(`Expected English label but found "${currentLangLabel}"`);
        }
        console.log('[PASS] Test 7: Language switching works seamlessly without page reload');

        // ---------------- TEST 8: Click New Group -> verify group modal opens ----------------
        console.log('\n--- TEST 8: Click New Group & Verify Flow ---');
        await page.click('#navCreateGroupBtn');
        await page.waitForSelector('#createGroupModal.open', { timeout: 4000 });
        console.log('[PASS] Test 8: Create Group modal opened successfully');
        await page.click('[data-close-modal="createGroupModal"]');
        await page.waitForSelector('#createGroupModal:not(.open)', { timeout: 4000 });

        // ---------------- TEST 9: Click Invite Via Link -> verify invite modal opens ----------------
        console.log('\n--- TEST 9: Click Invite Via Link & Verify Flow ---');
        await page.click('#navInvitePeopleBtn');
        await page.waitForSelector('#invitePeopleModal.open', { timeout: 4000 });
        console.log('[PASS] Test 9: Invite People modal opened successfully');
        await page.click('[data-close-modal="invitePeopleModal"]');
        await page.waitForSelector('#invitePeopleModal:not(.open)', { timeout: 4000 });

        // ---------------- TEST 10: Click Settings -> verify navigation ----------------
        console.log('\n--- TEST 10: Click Settings & Verify Navigation ---');
        await Promise.all([
            page.waitForNavigation({ timeout: 6000 }),
            page.click('#sidebarSettingsLink')
        ]);
        if (!page.url().includes('settings.html')) {
            throw new Error(`Expected settings.html but navigated to ${page.url()}`);
        }
        console.log('[PASS] Test 10: Settings page opened successfully');

        // ---------------- TEST 11: Click Appearance -> verify tab opens ----------------
        console.log('\n--- TEST 11: Verify Appearance Tab Navigation ---');
        await page.goto('http://127.0.0.1:8000/settings.html?tab=appearance', { waitUntil: 'networkidle' });
        await page.waitForSelector('#tab-appearance.active, [data-tab-content="appearance"], .theme-choice-card, .theme-card', { timeout: 5000 });
        console.log('[PASS] Test 11: Appearance settings tab opened successfully');

        // ---------------- TEST 12: Click Profile -> verify Profile page opens ----------------
        console.log('\n--- TEST 12: Click Profile & Verify Navigation ---');
        await page.goto('http://127.0.0.1:8000/profile.html', { waitUntil: 'networkidle' });
        await page.waitForSelector('#profileEmail, #userProfileEmail, .profile-card', { timeout: 6000 });
        console.log('[PASS] Test 12: Profile page opened successfully');

        // Return to dashboard for logout test
        await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'networkidle' });
        await page.waitForSelector('#sidebar', { timeout: 6000 });

        // ---------------- TEST 13: Click Logout -> verify logout works ----------------
        console.log('\n--- TEST 13: Click Logout & Verify State ---');
        await Promise.all([
            page.waitForNavigation({ timeout: 8000 }),
            page.click('#sidebarDirectSignOutBtn')
        ]);

        if (!page.url().includes('login.html')) {
            throw new Error(`Expected login.html after logout but navigated to ${page.url()}`);
        }

        const clearedToken = await page.evaluate(() => localStorage.getItem('frank_token') || localStorage.getItem('chatapp_token'));
        if (clearedToken) {
            throw new Error('FAIL: Authentication token was not cleared from localStorage upon logout');
        }
        console.log('[PASS] Test 13: Log out succeeded and authentication token cleared');

        // ---------------- TEST 14: Login again with SAME credentials ----------------
        console.log('\n--- TEST 14: Re-Login with SAME Account Credentials ---');
        await page.fill('#loginUsername', testEmail);
        await page.fill('#loginPassword', testPassword);

        const [loginResponse] = await Promise.all([
            page.waitForResponse(res => res.url().includes('/api/auth/login') && res.request().method() === 'POST'),
            page.click('#loginSubmitBtn')
        ]);

        if (loginResponse.status() !== 200) {
            throw new Error(`Re-login failed with HTTP ${loginResponse.status()}`);
        }
        console.log('[PASS] Login API returned HTTP 200 OK');

        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        await page.waitForSelector('#sidebar', { timeout: 6000 });
        await page.waitForTimeout(1500);

        const reloadedUserData = await page.evaluate(() => {
            const raw = localStorage.getItem('chatapp_user');
            return raw ? JSON.parse(raw) : null;
        });

        console.log('[INFO] User data after re-login:', reloadedUserData);
        if (reloadedUserData.id !== initialUserData.id) {
            throw new Error(`User ID mismatch! Original: ${initialUserData.id}, Reloaded: ${reloadedUserData.id}`);
        }
        if (reloadedUserData.frank_id !== initialUserData.frank_id) {
            throw new Error(`FRANK ID mismatch! Original: ${initialUserData.frank_id}, Reloaded: ${reloadedUserData.frank_id}`);
        }
        if (reloadedUserData.email.toLowerCase() !== testEmail.toLowerCase()) {
            throw new Error(`Email mismatch! Expected: ${testEmail}, Got: ${reloadedUserData.email}`);
        }
        console.log('[PASS] Test 14: Re-login verified identical User ID, permanent FRANK ID, and account profile!');

        // ---------------- RESPONSIVE TESTING ACROSS VIEWPORTS ----------------
        console.log('\n--- RESPONSIVE DESIGN AUDIT ACROSS BREAKPOINTS ---');
        const viewports = [
            { width: 320, height: 640 },
            { width: 360, height: 740 },
            { width: 375, height: 667 },
            { width: 390, height: 844 },
            { width: 414, height: 896 },
            { width: 480, height: 800 },
            { width: 768, height: 1024 },
            { width: 1024, height: 768 },
            { width: 1280, height: 800 },
            { width: 1440, height: 900 },
            { width: 1920, height: 1080 }
        ];

        for (const vp of viewports) {
            await page.setViewportSize(vp);
            await page.waitForTimeout(200);

            const hasHorizontalScroll = await page.evaluate(() => {
                return document.documentElement.scrollWidth > document.documentElement.clientWidth;
            });
            if (hasHorizontalScroll) {
                throw new Error(`Horizontal scroll detected at viewport ${vp.width}x${vp.height}`);
            }

            // Verify Sandstone text is NEVER in sidebar at any resolution
            const sbText = await page.evaluate(() => document.getElementById('sidebar')?.innerText || '');
            if (sbText.includes('Sandstone')) {
                throw new Error(`"Sandstone" text found in sidebar at viewport ${vp.width}x${vp.height}`);
            }

            console.log(`[PASS] Responsive ${vp.width}x${vp.height}: No horizontal scroll, no Sandstone text`);
        }

        console.log('\n============================================================');
        console.log('ALL 14 TESTS AND RESPONSIVE AUDIT PASSED 100% SUCCESSFULLY!');
        console.log('============================================================');

    } finally {
        await browser.close();
        if (serverProcess) {
            serverProcess.kill();
        }
    }
}

runTest().catch(err => {
    console.error('\n[FATAL TEST FAILURE]:', err);
    process.exit(1);
});
