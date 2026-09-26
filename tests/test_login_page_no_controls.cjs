const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const BASE_URL = 'http://localhost:8000';
const VIEWPORTS = [
    { width: 320, height: 600, name: '320px (Tiny Mobile)' },
    { width: 360, height: 640, name: '360px (Small Android)' },
    { width: 375, height: 667, name: '375px (iPhone SE)' },
    { width: 390, height: 844, name: '390px (iPhone 12/13/14)' },
    { width: 414, height: 896, name: '414px (iPhone XR/Plus)' },
    { width: 480, height: 800, name: '480px (Large Mobile)' },
    { width: 768, height: 1024, name: '768px (iPad Mini / Tablet)' },
    { width: 1024, height: 768, name: '1024px (Small Laptop / iPad Pro)' },
    { width: 1280, height: 800, name: '1280px (Standard Desktop)' },
    { width: 1440, height: 900, name: '1440px (Wide Desktop)' },
    { width: 1920, height: 1080, name: '1920px (Full HD Desktop)' }
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(name, passed, detail = '') {
    totalTests++;
    if (passed) {
        passedTests++;
        console.log(`  [PASS] ${name} ${detail ? '(' + detail + ')' : ''}`);
    } else {
        failedTests++;
        console.error(`  [FAIL] ${name} - ${detail}`);
    }
}

async function runLoginVerification() {
    console.log('===========================================================================');
    console.log('STARTING FRANK LOGIN PAGE SPECIFIC PLAYWRIGHT VERIFICATION');
    console.log('===========================================================================');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors = [];

    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    try {
        console.log('\n[SECTION 1] Loading Login Page & Verifying Structure...');
        // Clear tokens first so login page is presented
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => {
            localStorage.removeItem('chatapp_token');
            localStorage.removeItem('chatapp_user');
        });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);

        // 1. Login page loads
        report('Login page loads successfully', page.url().includes('login.html'));

        // 2. FRANK logo is visible
        const logo = page.locator('.auth-card-logo img');
        report('FRANK logo is visible on Login card', await logo.isVisible());

        // 3. Sign In heading is visible
        const heading = page.locator('h1.auth-card-title');
        const headingText = await heading.textContent();
        report('Sign In heading is visible', (await heading.isVisible()) && headingText.trim().length > 0, `Text: "${headingText.trim()}"`);

        // 4. Email field works
        const emailInput = page.locator('#loginUsername');
        report('Email field exists', await emailInput.count() === 1);
        await emailInput.fill('alex@frank.app');
        const emailValue = await emailInput.inputValue();
        report('Email field accepts input', emailValue === 'alex@frank.app');

        // 5. Password field works
        const passwordInput = page.locator('#loginPassword');
        report('Password field exists', await passwordInput.count() === 1);
        await passwordInput.fill('password123');
        const passwordValue = await passwordInput.inputValue();
        report('Password field accepts input', passwordValue === 'password123');

        // 6. Remember Me works
        const rememberMe = page.locator('#rememberMe');
        report('Remember Me checkbox exists', await rememberMe.count() === 1);
        await rememberMe.setChecked(false);
        report('Remember Me can be unchecked', !(await rememberMe.isChecked()));
        await rememberMe.setChecked(true);
        report('Remember Me can be checked', await rememberMe.isChecked());

        // 7. Forgot Password link works if supported
        const forgotLink = page.locator('a[href="forgot-password.html"]');
        report('Forgot Password link exists with correct href', (await forgotLink.count() === 1) && (await forgotLink.getAttribute('href')) === 'forgot-password.html');

        // 8. Register navigation link works
        const registerLink = page.locator('a[href="register.html"]');
        report('Register navigation link exists', (await registerLink.count() > 0) && (await registerLink.first().getAttribute('href')) === 'register.html');

        // =====================================================================
        // SECTION 2: VERIFY REMOVAL OF LANGUAGE & THEME CONTROLS (DOM CHECK)
        // =====================================================================
        console.log('\n[SECTION 2] Verifying Complete Removal of Language & Theme Controls from DOM...');

        // 10. Language selector does NOT exist in DOM
        const langDropdownBtn = await page.locator('#langDropdownBtn').count();
        report('Language selector button #langDropdownBtn DOES NOT exist in DOM', langDropdownBtn === 0, `Count: ${langDropdownBtn}`);

        const langDropdownMenu = await page.locator('#langDropdownMenu').count();
        report('Language dropdown menu #langDropdownMenu DOES NOT exist in DOM', langDropdownMenu === 0, `Count: ${langDropdownMenu}`);

        const langSelectorContainer = await page.locator('#langSelector, .lang-selector-container').count();
        report('Language selector container DOES NOT exist in DOM', langSelectorContainer === 0, `Count: ${langSelectorContainer}`);

        // 11. Theme toggle does NOT exist in DOM
        const themeToggleBtn = await page.locator('#themeToggleBtn').count();
        report('Theme toggle button #themeToggleBtn DOES NOT exist in DOM', themeToggleBtn === 0, `Count: ${themeToggleBtn}`);

        // 12. No empty top-bar placeholder remains
        const authTopBar = await page.locator('.auth-top-bar').count();
        report('No empty auth-top-bar wrapper or placeholder remains in DOM', authTopBar === 0, `Count: ${authTopBar}`);

        // =====================================================================
        // SECTION 3: VERIFY AUTHENTICATION SUBMISSION
        // =====================================================================
        console.log('\n[SECTION 3] Testing Authentication Submission...');
        // Submit the form with alex / password123
        const submitBtn = page.locator('#loginSubmitBtn');
        await submitBtn.click();
        
        // Wait for redirect to dashboard.html
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        report('Sign In works and redirects to dashboard.html', page.url().includes('dashboard.html'));

        // =====================================================================
        // SECTION 4: RESPONSIVE LAYOUT ACROSS ALL 11 VIEWPORTS
        // =====================================================================
        console.log('\n[SECTION 4] Testing Responsive Viewports (320px - 1920px)...');
        await page.evaluate(() => {
            localStorage.removeItem('chatapp_token');
            localStorage.removeItem('chatapp_user');
        });
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });

        for (const vp of VIEWPORTS) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.waitForTimeout(200);

            // Verify no horizontal overflow
            const overflow = await page.evaluate(() => {
                const doc = document.documentElement;
                return {
                    scrollWidth: doc.scrollWidth,
                    clientWidth: doc.clientWidth,
                    hasOverflow: doc.scrollWidth > doc.clientWidth + 1
                };
            });
            report(`Zero horizontal overflow at ${vp.width}px (${vp.name})`, !overflow.hasOverflow, `scroll: ${overflow.scrollWidth}px, client: ${overflow.clientWidth}px`);

            // Verify controls still do not exist at any viewport
            const btnCount = await page.locator('#langDropdownBtn, #themeToggleBtn').count();
            report(`Controls absent at ${vp.width}px`, btnCount === 0);
        }

        // =====================================================================
        // SECTION 5: CONSOLE ERRORS CHECK
        // =====================================================================
        console.log('\n[SECTION 5] Console Error Check...');
        report('Zero console errors during Login page interactions', consoleErrors.length === 0, `Errors: ${consoleErrors.join(', ') || 'None'}`);

        // Capture screenshot of updated Login page
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.screenshot({ path: path.join(__dirname, 'screenshot_login_updated.png'), fullPage: false });
        console.log('Saved updated login screenshot: tests/screenshot_login_updated.png');

    } catch (err) {
        console.error('Test execution error:', err);
    } finally {
        await browser.close();
    }

    console.log('\n===========================================================================');
    console.log(`TOTAL TESTS  : ${totalTests}`);
    console.log(`TOTAL PASSED : ${passedTests}`);
    console.log(`TOTAL FAILED : ${failedTests}`);
    console.log(`SUCCESS RATE : ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log('===========================================================================');

    if (failedTests > 0) process.exit(1);
}

runLoginVerification();
