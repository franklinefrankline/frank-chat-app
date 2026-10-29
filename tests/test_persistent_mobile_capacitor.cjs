const { chromium, devices } = require('playwright');
const path = require('path');

async function testMobilePersistent() {
    console.log('--- STARTING MOBILE & CAPACITOR PERSISTENT AUTH TESTS ---');

    // Emulate mobile device (Google Pixel 7)
    const pixel = devices['Pixel 7'];
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        ...pixel,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/122.0.6261.64 Mobile Safari/537.36 Capacitor/Android'
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

        // Inject Capacitor native platform mock and accepted cookie preferences before document loads
        await page.addInitScript(() => {
            window.Capacitor = {
                isNativePlatform: () => true,
                getPlatform: () => 'android'
            };
            try {
                const consent = {
                    version: '1.0',
                    noticeVersion: '2026.1',
                    timestamp: new Date().toISOString(),
                    categories: { essential: true, preferences: true, analytics: true, marketing: true }
                };
                localStorage.setItem('frank_cookie_consent_v1', JSON.stringify(consent));
                localStorage.setItem('frank_cookie_consent_choice', 'accepted');
            } catch (e) {}
        });

        // 1. First-time mobile launch without login -> Shows landing page / login
        console.log('\nMobile Scenario 1: First-time mobile launch');
        await page.goto('http://127.0.0.1:8000/');
        await page.waitForTimeout(500);
        assert(!page.url().includes('dashboard.html'), 'First mobile launch opens landing page without credentials');

        // 2. Mobile User Logs in
        console.log('\nMobile Scenario 2: Mobile user logs in');
        await page.goto('http://127.0.0.1:8000/login.html');
        await page.fill('#loginUsername', 'persistent_user_test@frank.app');
        await page.fill('#loginPassword', 'SecurePass123!');
        await page.click('#loginSubmitBtn', { force: true });
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        await page.waitForSelector('#chatApp', { timeout: 10000 });
        assert(page.url().includes('dashboard.html'), 'Mobile login successfully opens dashboard.html');

        // Verify mobile header is visible
        const mobileHeader = await page.$('.app-top-header');
        assert(mobileHeader !== null, 'Mobile header is rendered');

        // 3. Mobile app closed and reopened (subsequent launch)
        console.log('\nMobile Scenario 3: Mobile app closed and reopened (subsequent launch)');
        const reopenedPage = await context.newPage();
        await reopenedPage.addInitScript(() => {
            window.Capacitor = {
                isNativePlatform: () => true,
                getPlatform: () => 'android'
            };
        });

        // Opening root in mobile Capacitor environment should bypass landing and go straight to dashboard
        await reopenedPage.goto('http://127.0.0.1:8000/');
        await reopenedPage.waitForURL('**/dashboard.html', { timeout: 10000 });
        await reopenedPage.waitForSelector('#chatApp', { timeout: 10000 });
        assert(reopenedPage.url().includes('dashboard.html'), 'Reopening mobile app directly restores session and opens dashboard');

        // 4. Verify no login screen flash
        const isLoginVisible = await reopenedPage.isVisible('#loginForm');
        assert(!isLoginVisible, 'Login form is never shown or flashed on subsequent mobile app launches');

    } catch (err) {
        console.error('Mobile Test Error:', err);
        failed++;
    } finally {
        await browser.close();
    }

    console.log(`\n========================================`);
    console.log(`MOBILE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) process.exit(1);
}

testMobilePersistent();
