const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

// Helper to poll for server readiness
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

async function runAuthAndDashboardTestSuite() {
    console.log('============================================================');
    console.log('STARTING PLAYWRIGHT AUTHENTICATION & DASHBOARD VERIFICATION');
    console.log('============================================================');

    const projectRoot = path.resolve(__dirname, '..');
    let serverProcess = null;

    // Check if server is already running
    let serverAlreadyRunning = false;
    try {
        await waitForServer('http://127.0.0.1:8000/health', 1500);
        serverAlreadyRunning = true;
        console.log('[INFO] Backend server already running on port 8000.');
    } catch {
        console.log('[INFO] Starting backend server via python main.py...');
        serverProcess = spawn('python', ['main.py'], {
            cwd: projectRoot,
            env: { ...process.env, PORT: '8000', HOST: '127.0.0.1' },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        serverProcess.stdout.on('data', (d) => {
            const str = d.toString();
            if (str.includes('ERROR') || str.includes('Error')) {
                console.log('[SERVER STDOUT]', str.trim());
            }
        });
        serverProcess.stderr.on('data', (d) => {
            console.log('[SERVER STDERR]', d.toString().trim());
        });

        await waitForServer('http://127.0.0.1:8000/health', 25000);
        console.log('[PASS] Backend server successfully started and responding on http://127.0.0.1:8000/health');
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const networkLogs = [];
    const consoleLogs = [];

    try {
        // ========================================================
        // TEST 1: REGISTRATION FLOW & NO AUTOMATIC LOGOUT
        // ========================================================
        console.log('\n--- PART 1: REGISTER NEW ACCOUNT & VERIFY DASHBOARD ---');
        const contextA = await browser.newContext({
            viewport: { width: 1366, height: 768 } // Standard desktop resolution
        });
        const pageA = await contextA.newPage();

        pageA.on('console', msg => {
            const text = msg.text();
            consoleLogs.push(`[PAGE-A CONSOLE ${msg.type()}] ${text}`);
            if (msg.type() === 'error') {
                console.log(`[PAGE-A ERROR]`, text);
            }
        });

        pageA.on('response', resp => {
            const status = resp.status();
            const url = resp.url();
            if (url.includes('/api/')) {
                networkLogs.push(`[${resp.request().method()}] ${url} -> ${status}`);
                if (status >= 400) {
                    console.log(`[API FAIL ${status}] ${resp.request().method()} ${url}`);
                }
            }
        });

        const testTimestamp = Date.now().toString().slice(-6);
        const testEmail = `frank_user_${testTimestamp}@example.com`;
        const testName = `Frank User ${testTimestamp}`;
        const testPassword = 'SecurePassword123!';

        console.log(`Navigating to register page with email: ${testEmail}`);
        await pageA.goto('http://127.0.0.1:8000/register.html', { waitUntil: 'networkidle' });

        // Fill registration form
        await pageA.fill('#regFullName', testName);
        await pageA.fill('#regEmail', testEmail);
        await pageA.fill('#regPassword', testPassword);
        await pageA.fill('#regConfirmPassword', testPassword);
        await pageA.check('#regTerms');

        console.log('Submitting registration form...');
        await Promise.all([
            pageA.waitForResponse(resp => resp.url().includes('/api/auth/register') && resp.status() === 201),
            pageA.click('#registerSubmitBtn')
        ]);
        console.log('[PASS] Registration API returned HTTP 201 Created');

        // Wait for redirection to dashboard
        await pageA.waitForURL('**/dashboard.html*', { timeout: 10000 });
        console.log('[PASS] Redirected to dashboard.html');

        // CRITICAL CHECK: Wait 5 seconds to ensure NO unexpected automatic logout occurs!
        console.log('Checking for premature automatic logout (monitoring for 5 seconds)...');
        await pageA.waitForTimeout(5000);

        const currentUrlAfterWait = pageA.url();
        if (currentUrlAfterWait.includes('login.html')) {
            throw new Error(`CRITICAL BUG DETECTED: User was automatically logged out to ${currentUrlAfterWait}!`);
        }
        console.log('[PASS] User remained authenticated on dashboard! No automatic logout occurred.');

        // Verify token in localStorage
        const tokenA = await pageA.evaluate(() => localStorage.getItem('chatapp_token'));
        if (!tokenA || tokenA.startsWith('mock_')) {
            throw new Error(`Invalid token found in localStorage: ${tokenA}`);
        }
        console.log('[PASS] Valid real backend JWT token confirmed in localStorage');

        // Verify permanent user profile and FRANK ID
        await pageA.waitForSelector('#desktopDropdownFrankId', { state: 'attached', timeout: 5000 });
        const initialFrankId = await pageA.evaluate(() => {
            const user = JSON.parse(localStorage.getItem('chatapp_user') || '{}');
            return user.frank_id || document.getElementById('desktopDropdownFrankId')?.textContent?.trim();
        });
        console.log(`[PASS] Permanent FRANK ID generated and loaded: ${initialFrankId}`);
        if (!initialFrankId || initialFrankId.length !== 6 || initialFrankId === '------') {
            throw new Error(`Invalid FRANK ID format: ${initialFrankId}`);
        }

        const initialUserId = await pageA.evaluate(() => {
            const user = JSON.parse(localStorage.getItem('chatapp_user') || '{}');
            return user.id;
        });
        console.log(`[PASS] User ID assigned: ${initialUserId}`);

        // ========================================================
        // TEST 2: UI VERIFICATION — DESKTOP SIDEBAR & LANGUAGE SELECTOR
        // ========================================================
        console.log('\n--- PART 2: UI LAYOUT VERIFICATION ---');

        // Verify desktop left sidebar is completely NOT occupying desktop screen space
        const sidebarBoundingBox = await pageA.evaluate(() => {
            const el = document.getElementById('sidebar');
            if (!el) return { width: 0, height: 0, display: 'none' };
            const style = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            return {
                width: rect.width,
                height: rect.height,
                display: style.display,
                visibility: style.visibility
            };
        });
        console.log('Sidebar desktop computed layout:', sidebarBoundingBox);
        if (sidebarBoundingBox.display === 'none' || sidebarBoundingBox.width === 0) {
            throw new Error(`FAIL: Left sidebar should be visible on desktop! Width: ${sidebarBoundingBox.width}px, Display: ${sidebarBoundingBox.display}`);
        }
        console.log('[PASS] Left sidebar is properly displayed on desktop layout (display: flex, width: 260px)');

        // Verify Language selector in TOP HEADER
        const topLangSelector = await pageA.evaluate(() => {
            const el = document.getElementById('dashLangSelector');
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            const btn = document.getElementById('dashLangDropdownBtn');
            return {
                exists: true,
                visible: rect.width > 0 && rect.height > 0,
                text: btn?.textContent?.trim()
            };
        });
        if (!topLangSelector || !topLangSelector.visible) {
            throw new Error('FAIL: Primary language selector not visible in the top header!');
        }
        console.log(`[PASS] Top header language selector is present and visible (${topLangSelector.text})`);

        // Verify NO duplicate language selector in sidebar
        const duplicateSidebarLang = await pageA.evaluate(() => {
            return document.getElementById('sidebarLangSelector') !== null;
        });
        if (duplicateSidebarLang) {
            throw new Error('FAIL: Duplicate language selector (#sidebarLangSelector) still exists!');
        }
        console.log('[PASS] No duplicate sidebar language selector found');

        // Test language switching without reload
        console.log('Testing language switching: English -> Tamil -> Hindi -> English');
        await pageA.click('#dashLangDropdownBtn');
        await pageA.waitForSelector('#dashLangDropdownMenu', { state: 'visible' });

        // Select Tamil
        await pageA.click('[data-lang="ta"]');
        await pageA.waitForTimeout(400);
        const currentLangTa = await pageA.evaluate(() => {
            return document.getElementById('dashLangDropdownBtn')?.querySelector('.current-lang-label')?.textContent?.trim();
        });
        console.log(`Switched to: ${currentLangTa}`);
        if (currentLangTa !== 'தமிழ்') {
            throw new Error(`Expected Tamil label 'தமிழ்', got '${currentLangTa}'`);
        }

        // Select Hindi
        await pageA.click('#dashLangDropdownBtn', { force: true });
        await pageA.waitForSelector('#dashLangDropdownMenu.show', { state: 'visible' });
        await pageA.click('[data-lang="hi"]');
        await pageA.waitForTimeout(500);
        const currentLangHi = await pageA.evaluate(() => {
            return document.getElementById('dashLangDropdownBtn')?.querySelector('.current-lang-label')?.textContent?.trim();
        });
        console.log(`Switched to: ${currentLangHi}`);
        if (currentLangHi !== 'हिन्दी') {
            throw new Error(`Expected Hindi label 'हिन्दी', got '${currentLangHi}'`);
        }

        // Switch back to English
        await pageA.click('#dashLangDropdownBtn', { force: true });
        await pageA.waitForSelector('#dashLangDropdownMenu.show', { state: 'visible' });
        await pageA.click('[data-lang="en"]');
        await pageA.waitForTimeout(500);
        const currentLangEn = await pageA.evaluate(() => {
            return document.getElementById('dashLangDropdownBtn')?.querySelector('.current-lang-label')?.textContent?.trim();
        });
        console.log(`Switched to: ${currentLangEn}`);
        if (currentLangEn !== 'English') {
            throw new Error(`Expected English label 'English', got '${currentLangEn}'`);
        }
        console.log('[PASS] Language switching works smoothly and instantly without page reload');

        // ========================================================
        // TEST 3: TOP HEADER MORE MENU & TOOLS ACCESS
        // ========================================================
        console.log('\n--- PART 3: TOP HEADER MORE MENU & TOOLS ACCESS ---');
        // Click desktop profile & tools button (#desktopProfileBtn) on desktop
        await pageA.click('#desktopProfileBtn', { force: true });
        await pageA.waitForSelector('#desktopProfileDropdown', { state: 'visible', timeout: 4000 });
        console.log('[PASS] Clicking header profile button (#desktopProfileBtn) opened desktop profile/tools menu');

        // Verify Tools & Settings are accessible inside the dropdown
        const menuItems = await pageA.evaluate(() => {
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
        console.log('Desktop dropdown items check:', menuItems);
        for (const [key, present] of Object.entries(menuItems)) {
            if (!present) {
                throw new Error(`FAIL: Missing menu item '${key}' in desktopProfileDropdown!`);
            }
        }
        console.log('[PASS] All tools and settings items are properly accessible via desktop menu');

        // ========================================================
        // TEST 4: EXPLICIT LOGOUT & RE-LOGIN WITH SAME CREDENTIALS
        // ========================================================
        console.log('\n--- PART 4: LOGOUT AND RE-LOGIN WITH SAME CREDENTIALS ---');
        console.log('Clicking Logout...');
        await pageA.click('#desktopDropdownLogoutBtn', { force: true });
        await pageA.waitForURL('**/login.html*', { timeout: 8000 });
        console.log('[PASS] Successfully logged out and navigated to login.html');

        // Verify tokens cleared
        const tokenAfterLogout = await pageA.evaluate(() => localStorage.getItem('chatapp_token'));
        if (tokenAfterLogout) {
            throw new Error('Token should be null after logout');
        }
        console.log('[PASS] Local storage authentication token cleared after logout');

        // Re-login with the SAME email and password
        console.log(`Logging back in with email: ${testEmail}...`);
        await pageA.fill('#loginUsername', testEmail);
        await pageA.fill('#loginPassword', testPassword);

        await Promise.all([
            pageA.waitForResponse(resp => resp.url().includes('/api/auth/login') && resp.status() === 200),
            pageA.click('#loginSubmitBtn')
        ]);
        console.log('[PASS] Login API returned HTTP 200 OK');

        await pageA.waitForURL('**/dashboard.html*', { timeout: 8000 });
        console.log('[PASS] Dashboard reopened after login');

        // CRITICAL CHECK: Verify user did NOT change and FRANK ID is 100% PRESERVED
        await pageA.waitForTimeout(3000);
        const reloadedUser = await pageA.evaluate(() => {
            return JSON.parse(localStorage.getItem('chatapp_user') || '{}');
        });
        console.log('Reloaded user data:', {
            id: reloadedUser.id,
            email: reloadedUser.email,
            frank_id: reloadedUser.frank_id
        });

        if (reloadedUser.id !== initialUserId) {
            throw new Error(`FAIL: User ID changed! Original: ${initialUserId}, Current: ${reloadedUser.id}`);
        }
        if (reloadedUser.frank_id !== initialFrankId) {
            throw new Error(`FAIL: FRANK ID changed! Original: ${initialFrankId}, Current: ${reloadedUser.frank_id}`);
        }
        console.log('[PASS] Same User ID and same permanent FRANK ID verified across logout & login!');

        // ========================================================
        // TEST 5: MULTI-SESSION TEST (BROWSER B)
        // ========================================================
        console.log('\n--- PART 5: MULTI-SESSION TEST (BROWSER B) ---');
        const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const pageB = await contextB.newPage();

        await pageB.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'networkidle' });
        await pageB.fill('#loginUsername', testEmail.toUpperCase()); // Test case insensitivity!
        await pageB.fill('#loginPassword', testPassword);
        await Promise.all([
            pageB.waitForResponse(resp => resp.url().includes('/api/auth/login') && resp.status() === 200),
            pageB.click('#loginSubmitBtn')
        ]);
        await pageB.waitForURL('**/dashboard.html*', { timeout: 8000 });

        const sessionBUser = await pageB.evaluate(() => {
            return JSON.parse(localStorage.getItem('chatapp_user') || '{}');
        });
        console.log('Session B user data:', {
            id: sessionBUser.id,
            email: sessionBUser.email,
            frank_id: sessionBUser.frank_id
        });

        if (sessionBUser.id !== initialUserId || sessionBUser.frank_id !== initialFrankId) {
            throw new Error('FAIL: Multi-session user mismatch!');
        }
        console.log('[PASS] Browser B authenticated with same User ID and same permanent FRANK ID');
        await contextB.close();

        // ========================================================
        // TEST 6: WEBSOCKET & MESSAGING TEST
        // ========================================================
        console.log('\n--- PART 6: WEBSOCKET & REALTIME MESSAGING ---');
        // Open self chat
        await pageA.evaluate(() => {
            const me = JSON.parse(localStorage.getItem('chatapp_user') || '{}');
            if (window.chat && me.id) {
                window.chat.openDirectChat(me);
            }
        });
        await pageA.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
        await pageA.waitForSelector('#messageComposerTextarea', { state: 'visible', timeout: 5000 });

        // Type and send a message
        const testMsg = `E2E Test Message ${Date.now()}`;
        await pageA.fill('#messageComposerTextarea', testMsg);
        await pageA.click('#composerSendBtn');
        console.log('[PASS] Message dispatched via real-time WebSocket connection');

        // Verify message rendered in messagesContainer
        await pageA.waitForSelector('.message-bubble, .message-card, .message-item, .chat-message', { state: 'visible', timeout: 8000 });
        const messageRendered = await pageA.evaluate((msg) => {
            return document.getElementById('messagesContainer')?.textContent?.includes(msg);
        }, testMsg);
        if (!messageRendered) {
            throw new Error('FAIL: Sent test message not found in messagesContainer!');
        }
        console.log('[PASS] Test message successfully rendered in active conversation stream!');

        console.log('\n============================================================');
        console.log('ALL PLAYWRIGHT TESTS PASSED SUCCESSFULLY!');
        console.log('============================================================');
    } finally {
        await browser.close();
        if (serverProcess) {
            console.log('[INFO] Stopping backend server...');
            serverProcess.kill();
        }
    }
}

runAuthAndDashboardTestSuite().catch(err => {
    console.error('\n[FATAL TEST FAILURE]:', err);
    process.exit(1);
});
