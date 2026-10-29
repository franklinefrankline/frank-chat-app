const { chromium } = require('playwright');
const path = require('path');

async function runGoogleOAuthE2ETests() {
    console.log('=== STARTING GOOGLE OAUTH & SOCIAL BUTTONS E2E TEST ===\n');
    const browser = await chromium.launch({ headless: true });

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
        const context = await browser.newContext({
            viewport: { width: 1280, height: 800 }
        });

        // Auto-accept cookie consent
        await context.addInitScript(() => {
            try {
                const consent = {
                    version: '1.0',
                    noticeVersion: '2026.1',
                    timestamp: new Date().toISOString(),
                    categories: { essential: true, preferences: true, analytics: true, marketing: true }
                };
                localStorage.setItem('frank_cookie_consent_v1', JSON.stringify(consent));
            } catch (e) {}
        });

        const page = await context.newPage();

        // ---------------------------------------------------------------------
        // TEST 1: Verify Only Google Sign-In Button Exists on Login Page
        // ---------------------------------------------------------------------
        console.log('--- TEST 1: Checking Social Login Provider Buttons ---');
        await page.goto('http://127.0.0.1:8000/login.html');
        await page.waitForSelector('#loginSubmitBtn', { timeout: 10000 });

        const googleBtn = await page.$('#ssoGoogleBtn');
        const appleBtn = await page.$('#ssoAppleBtn');
        const microsoftBtn = await page.$('#ssoMicrosoftBtn');

        assert(Boolean(googleBtn), 'Google sign-in button (#ssoGoogleBtn) is present');
        assert(appleBtn === null, 'Apple sign-in button (#ssoAppleBtn) has been removed');
        assert(microsoftBtn === null, 'Microsoft sign-in button (#ssoMicrosoftBtn) has been removed');

        const googleBtnText = await page.textContent('#ssoGoogleBtn');
        assert(googleBtnText.includes('Continue with Google'), `Google button text displays: "${googleBtnText.trim()}"`);

        // Check social providers row is full width
        const btnBox = await googleBtn.boundingBox();
        assert(btnBox && btnBox.width > 200, `Google button has responsive full width: ${btnBox ? Math.round(btnBox.width) : 0}px`);

        // ---------------------------------------------------------------------
        // TEST 2: Clicking Google Button When Unconfigured
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 2: Testing Click On Unconfigured Google Sign-In ---');
        await googleBtn.click();
        await page.waitForTimeout(600);

        // Toast should appear with configuration guidance
        const toast = await page.$('.toast, #toast-container, .toast-notification');
        const toastText = toast ? (await toast.textContent()).trim() : '';
        console.log(`Toast message displayed: "${toastText}"`);
        assert(
            toastText.includes('Google Sign-In is not configured yet') ||
            toastText.includes('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET'),
            'Clear configuration error toast shown when server credentials missing'
        );

        // Verify no false successful login or fake redirect occurred
        assert(page.url().includes('login.html'), 'User stays securely on login.html without fake authentication');

        // ---------------------------------------------------------------------
        // TEST 3: Successful Google OAuth Callback Return Simulation
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 3: Testing Successful OAuth Callback Return Flow ---');
        
        // Generate a real JWT token for test user from backend
        const tokenResp = await fetch('http://127.0.0.1:8000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier: 'persistent_user_test@frank.app',
                password: 'SecurePass123!'
            })
        });
        const tokenJson = await tokenResp.json();
        const validJwtToken = tokenJson.access_token;
        assert(Boolean(validJwtToken), 'Acquired test JWT token to simulate Google OAuth return');

        // Navigate to login.html with oauth_token (as done by Google OAuth callback)
        await page.goto(`http://127.0.0.1:8000/login.html?oauth_token=${encodeURIComponent(validJwtToken)}&role=user`);
        
        // Wait for redirect to dashboard.html
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        assert(page.url().includes('dashboard.html'), 'OAuth return successfully redirected to dashboard.html');

        // Verify token saved in localStorage
        const storedToken = await page.evaluate(() => localStorage.getItem('chatapp_token') || localStorage.getItem('frank_token'));
        assert(storedToken === validJwtToken, 'Valid JWT session securely established in localStorage');

        // ---------------------------------------------------------------------
        // TEST 4: Cancelled & Error OAuth Callback Return Handling
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 4: Testing OAuth Cancelled and Error Handling ---');
        const unauthContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const unauthPage = await unauthContext.newPage();
        
        // Test user cancellation
        await unauthPage.goto('http://127.0.0.1:8000/login.html?oauth_error=cancelled&message=Google%20sign-in%20was%20cancelled.');
        await unauthPage.waitForTimeout(600);
        const urlAfterCancel = unauthPage.url();
        assert(!urlAfterCancel.includes('oauth_error'), 'OAuth error parameters cleaned from address bar');

        const cancelToast = await unauthPage.$('.toast, #toast-container, .toast-notification, .toast-message');
        const cancelToastText = cancelToast ? (await cancelToast.textContent()).trim() : '';
        console.log(`Cancelled toast text: "${cancelToastText}"`);
        assert(cancelToastText.includes('cancelled') || cancelToastText.includes('Google'), 'Appropriate message shown for cancelled OAuth');

        // Test OAuth failure on clean context
        const failContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const failPage = await failContext.newPage();
        await failPage.goto('http://127.0.0.1:8000/login.html?oauth_error=failed&message=Google%20sign-in%20failed%20due%20to%20network');
        await failPage.waitForTimeout(600);
        const failToast = await failPage.$('.toast, #toast-container, .toast-notification, .toast-message');
        const failToastText = failToast ? (await failToast.textContent()).trim() : '';
        console.log(`Failed toast text: "${failToastText}"`);
        assert(failToastText.includes('failed') || failToastText.includes('network'), 'Appropriate error shown for failed OAuth');

        // ---------------------------------------------------------------------
        // TEST 5: Verify Email/Password Login Still Works 100%
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 5: Verifying Email/Password Login Preservation ---');
        const emailLoginContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const emailLoginPage = await emailLoginContext.newPage();
        await emailLoginPage.goto('http://127.0.0.1:8000/login.html');
        await emailLoginPage.waitForSelector('#loginUsername', { timeout: 10000 });
        await emailLoginPage.fill('#loginUsername', 'persistent_user_test@frank.app');
        await emailLoginPage.fill('#loginPassword', 'SecurePass123!');
        await emailLoginPage.click('#loginSubmitBtn', { force: true });
        await emailLoginPage.waitForURL('**/dashboard.html', { timeout: 10000 });
        assert(emailLoginPage.url().includes('dashboard.html'), 'Email/password authentication remains 100% functional');

        // ---------------------------------------------------------------------
        // TEST 6: Verify Registration & Password Reset Pages Still Work
        // ---------------------------------------------------------------------
        console.log('\n--- TEST 6: Verifying Registration & Forgot Password Pages ---');
        const unauthRegContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const regPage = await unauthRegContext.newPage();
        await regPage.goto('http://127.0.0.1:8000/register.html');
        await regPage.waitForSelector('#regFullName', { timeout: 5000 });
        assert(await regPage.isVisible('#regFullName'), 'Registration page loads with all form inputs');

        await regPage.goto('http://127.0.0.1:8000/forgot-password.html');
        await regPage.waitForSelector('#forgotEmail', { timeout: 5000 });
        assert(await regPage.isVisible('#forgotEmail'), 'Forgot password page loads with OTP send input');

        // Take a clean screenshot of the Google-only login card
        const screenshotContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const screenshotPage = await screenshotContext.newPage();
        await screenshotPage.goto('http://127.0.0.1:8000/login.html');
        await screenshotPage.waitForSelector('#ssoGoogleBtn', { timeout: 5000 });
        const screenshotPath = path.join(__dirname, 'google_only_login_verified.png');
        await screenshotPage.screenshot({ path: screenshotPath });
        console.log(`Saved screenshot: ${screenshotPath}`);

        await unauthContext.close();
        await failContext.close();
        await emailLoginContext.close();
        await unauthRegContext.close();
        await screenshotContext.close();
        await context.close();

        await context.close();

    } catch (err) {
        console.error('Unhandled error in E2E test:', err);
        failed++;
    } finally {
        await browser.close();
    }

    console.log(`\n=== E2E TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
    if (failed > 0) {
        process.exit(1);
    }
}

runGoogleOAuthE2ETests();
