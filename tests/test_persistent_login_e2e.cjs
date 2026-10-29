const { chromium } = require('playwright');
const path = require('path');

async function runTests() {
    console.log('--- STARTING PERSISTENT LOGIN E2E TESTS ---');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`[PASS] ${message}`);
            passed++;
        } else {
            console.error(`[FAIL] ${message}`);
            failed++;
        }
    }

    try {
        const page = await context.newPage();

        // 1. Unauthenticated root visit: should stay on landing page
        console.log('\nScenario 1: Unauthenticated root visit');
        await page.goto('http://127.0.0.1:8000/');
        await page.waitForTimeout(600);
        const landingHeader = await page.$('.landing-header');
        assert(landingHeader !== null, 'Landing header is visible for unauthenticated user');
        const currentUrl1 = page.url();
        assert(!currentUrl1.includes('dashboard.html'), 'Unauthenticated user is not redirected to dashboard');

        // 2. Perform Login
        console.log('\nScenario 2: First successful login');
        await page.goto('http://127.0.0.1:8000/login.html');
        await page.fill('#loginUsername', 'persistent_user_test@frank.app');
        await page.fill('#loginPassword', 'SecurePass123!');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        await page.waitForSelector('#chatApp', { timeout: 10000 });
        assert(page.url().includes('dashboard.html'), 'Redirected to dashboard.html after successful login');

        // Check storage
        const storedToken = await page.evaluate(() => localStorage.getItem('chatapp_token'));
        const storedUser = await page.evaluate(() => localStorage.getItem('chatapp_user'));
        assert(storedToken && storedToken.length > 20, 'Access token is stored in localStorage');
        assert(storedUser && storedUser.includes('persistent_user_test'), 'User profile is saved in localStorage');

        // Check cookie
        const cookies = await context.cookies('http://127.0.0.1:8000');
        const frankCookie = cookies.find(c => c.name === 'frank_token');
        assert(frankCookie && frankCookie.value === storedToken, 'frank_token persistent cookie is set in browser');

        // 3. Subsequent app launch / reopening
        console.log('\nScenario 3: Subsequent launch (reopening root URL / app with saved session)');
        const newPage = await context.newPage();
        await newPage.goto('http://127.0.0.1:8000/');
        // The startup guard should validate session and redirect automatically to dashboard
        await newPage.waitForURL('**/dashboard.html', { timeout: 10000 });
        await newPage.waitForSelector('#chatApp', { timeout: 10000 });
        assert(newPage.url().includes('dashboard.html'), 'Subsequent launch automatically opens Chats dashboard without re-entering credentials');

        // 4. Visiting login.html while logged in
        console.log('\nScenario 4: Visiting login.html with valid session');
        await Promise.all([
            newPage.waitForURL('**/dashboard.html', { timeout: 10000 }),
            newPage.goto('http://127.0.0.1:8000/login.html').catch(() => {})
        ]);
        await newPage.waitForSelector('#chatApp', { timeout: 10000 });
        assert(newPage.url().includes('dashboard.html'), 'Direct visit to login.html redirects automatically to dashboard');

        // 5. Expired / Invalid session handling
        console.log('\nScenario 5: Expired session invalidation and redirect loop prevention');
        const expiredPage = await context.newPage();
        // Manually set an invalid token
        await expiredPage.goto('http://127.0.0.1:8000/login.html?expired=1');
        await expiredPage.waitForTimeout(800);
        const isExpiredOnLogin = expiredPage.url().includes('login.html');
        assert(isExpiredOnLogin, 'Expired session cleanly shows login page without redirect loops');

        // Navigate to protected dashboard with no valid token
        await expiredPage.evaluate(() => {
            localStorage.setItem('chatapp_token', 'bad_forged_token.12345.xyz');
        });
        await Promise.all([
            expiredPage.waitForURL('**/login.html**', { timeout: 10000 }),
            expiredPage.goto('http://127.0.0.1:8000/dashboard.html').catch(() => {})
        ]);
        await expiredPage.waitForSelector('#loginForm', { timeout: 10000 });
        assert(expiredPage.url().includes('login.html'), 'Protected dashboard with invalid token redirects to login page');
        const clearedToken = await expiredPage.evaluate(() => localStorage.getItem('chatapp_token'));
        assert(!clearedToken, 'Invalid token was securely cleared from localStorage');

        // 6. Logout
        console.log('\nScenario 6: Manual logout revokes session and prevents auto-login');
        // Login again first
        await page.goto('http://127.0.0.1:8000/login.html');
        await page.fill('#loginUsername', 'persistent_user_test@frank.app');
        await page.fill('#loginPassword', 'SecurePass123!');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        await page.waitForSelector('#chatApp', { timeout: 10000 });

        // Trigger auth.logout()
        await Promise.all([
            page.waitForURL('**/login.html**', { timeout: 10000 }),
            page.evaluate(() => auth.logout()).catch(() => {})
        ]);
        assert(page.url().includes('login.html'), 'Logout successfully redirects to login.html');

        const postLogoutToken = await page.evaluate(() => localStorage.getItem('chatapp_token'));
        assert(!postLogoutToken, 'Tokens cleared from localStorage on logout');

        // Open root again after logout
        await page.goto('http://127.0.0.1:8000/');
        await page.waitForTimeout(600);
        assert(!page.url().includes('dashboard.html'), 'After logout, reopening root does not auto-login to dashboard');

    } catch (err) {
        console.error('Test Execution Error:', err);
        failed++;
    } finally {
        await browser.close();
    }

    console.log(`\n========================================`);
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
