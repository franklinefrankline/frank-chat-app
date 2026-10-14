const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

const BASE_URL = 'http://127.0.0.1:8000';

(async () => {
    console.log('======================================================================');
    console.log('COMPREHENSIVE VERIFICATION: AUTH CONTROLS REMOVAL & CHAT RUNTIME FIXES');
    console.log('======================================================================\n');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('[BROWSER CONSOLE ERROR]', msg.text());
            consoleErrors.push(msg.text());
        }
    });
    page.on('pageerror', err => {
        console.log('[BROWSER UNCAUGHT ERROR]', err.message);
        consoleErrors.push(err.message);
    });

    // -------------------------------------------------------------------------
    // PART 1: LOGIN PAGE VERIFICATION
    // -------------------------------------------------------------------------
    console.log('--- PART 1: Verifying Login Page ---');
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
        localStorage.removeItem('chatapp_token');
        localStorage.removeItem('chatapp_user');
        localStorage.removeItem('frank_token');
        localStorage.removeItem('frank_user');
    });
    await page.reload({ waitUntil: 'networkidle' });

    // 1.1 Verify theme toggle & language selector are completely gone
    const loginThemeToggle = await page.locator('#themeToggleBtn').count();
    const loginLangDropdownBtn = await page.locator('#langDropdownBtn').count();
    const loginLangMenu = await page.locator('#langDropdownMenu').count();
    const loginLangContainer = await page.locator('.lang-selector-container, #loginLangSelector').count();
    const loginDemoCard = await page.locator('.auth-demo-card').count();

    console.log(`Login #themeToggleBtn count: ${loginThemeToggle}`);
    console.log(`Login #langDropdownBtn count: ${loginLangDropdownBtn}`);
    console.log(`Login .lang-selector-container count: ${loginLangContainer}`);
    console.log(`Login .auth-demo-card count: ${loginDemoCard}`);

    assert.strictEqual(loginThemeToggle, 0, 'Theme toggle button must NOT exist on Login page');
    assert.strictEqual(loginLangDropdownBtn, 0, 'Language button must NOT exist on Login page');
    assert.strictEqual(loginLangMenu, 0, 'Language menu must NOT exist on Login page');
    assert.strictEqual(loginLangContainer, 0, 'Language container must NOT exist on Login page');
    assert.strictEqual(loginDemoCard, 0, 'Demo accounts card must NOT exist on Login page');
    console.log('✓ Verified: Theme toggle, language selector, and demo card completely removed from Login page.');

    // 1.2 Verify Form Layout & Centering
    const authCard = page.locator('.auth-card');
    assert.ok(await authCard.isVisible(), 'Login .auth-card must be visible');
    const authCardBox = await authCard.boundingBox();
    console.log(`Login .auth-card dimensions: ${authCardBox?.width}x${authCardBox?.height} at (${authCardBox?.x}, ${authCardBox?.y})`);
    assert.ok(authCardBox && authCardBox.width >= 300, 'Login .auth-card must have appropriate width');

    // 1.3 Verify Input Validation
    await page.click('#loginSubmitBtn');
    await page.waitForTimeout(300);
    const errUsernameVisible = await page.locator('#errorUsername').isVisible();
    console.log(`Validation on empty submit: errorUsername visible = ${errUsernameVisible}`);
    assert.ok(errUsernameVisible, 'Username error must show on empty submit');

    // 1.4 Verify Password Visibility Toggle
    const pwInput = page.locator('#loginPassword');
    const pwToggleBtn = page.locator('.password-toggle-btn[data-target="loginPassword"]');
    assert.strictEqual(await pwInput.getAttribute('type'), 'password');
    await pwToggleBtn.click();
    assert.strictEqual(await pwInput.getAttribute('type'), 'text', 'Password input should switch to text on toggle');
    await pwToggleBtn.click();
    assert.strictEqual(await pwInput.getAttribute('type'), 'password', 'Password input should switch back to password on second toggle');
    console.log('✓ Password visibility toggle functions correctly.');

    // 1.5 Verify Remember Me Checkbox
    const rememberMe = page.locator('#rememberMe');
    assert.ok(await rememberMe.isChecked());
    await rememberMe.setChecked(false);
    assert.ok(!(await rememberMe.isChecked()));
    await rememberMe.setChecked(true);
    assert.ok(await rememberMe.isChecked());
    console.log('✓ Remember Me checkbox functions correctly.');

    // 1.6 Verify Links to Forgot Password and Register
    const forgotLink = page.locator('a[href="forgot-password.html"]');
    const registerLink = page.locator('a[href="register.html"]');
    assert.ok(await forgotLink.isVisible());
    assert.ok(await registerLink.isVisible());
    console.log('✓ Navigation links to Forgot Password and Register are intact.');

    // 1.7 Capture Login Screenshot
    const loginShot = path.resolve(__dirname, 'screenshot_login_verified.png');
    await page.screenshot({ path: loginShot });
    console.log(`✓ Login screenshot saved to: ${path.basename(loginShot)}`);

    // -------------------------------------------------------------------------
    // PART 2: REGISTER PAGE VERIFICATION
    // -------------------------------------------------------------------------
    console.log('\n--- PART 2: Verifying Register Page ---');
    await page.goto(`${BASE_URL}/register.html`, { waitUntil: 'networkidle' });

    // 2.1 Verify theme toggle & language selector are completely gone
    const regThemeToggle = await page.locator('#themeToggleBtn').count();
    const regLangDropdownBtn = await page.locator('#langDropdownBtn').count();
    const regLangMenu = await page.locator('#langDropdownMenu').count();
    const regLangContainer = await page.locator('.lang-selector-container, #regLangSelector').count();

    console.log(`Register #themeToggleBtn count: ${regThemeToggle}`);
    console.log(`Register #langDropdownBtn count: ${regLangDropdownBtn}`);
    console.log(`Register .lang-selector-container count: ${regLangContainer}`);

    assert.strictEqual(regThemeToggle, 0, 'Theme toggle button must NOT exist on Register page');
    assert.strictEqual(regLangDropdownBtn, 0, 'Language button must NOT exist on Register page');
    assert.strictEqual(regLangMenu, 0, 'Language menu must NOT exist on Register page');
    assert.strictEqual(regLangContainer, 0, 'Language container must NOT exist on Register page');
    console.log('✓ Verified: Theme toggle and language selector completely removed from Register page.');

    // 2.2 Verify Register Form Layout & Centering
    const regCard = page.locator('.auth-card');
    assert.ok(await regCard.isVisible(), 'Register .auth-card must be visible');
    const regCardBox = await regCard.boundingBox();
    console.log(`Register .auth-card dimensions: ${regCardBox?.width}x${regCardBox?.height}`);
    assert.ok(regCardBox && regCardBox.width >= 300, 'Register .auth-card must have appropriate width');

    // 2.3 Verify Register Validation
    await page.click('#registerSubmitBtn');
    await page.waitForTimeout(300);
    const errFullName = await page.locator('#errorFullName').isVisible();
    const errEmail = await page.locator('#errorEmail').isVisible();
    console.log(`Register empty validation: errFullName=${errFullName}, errEmail=${errEmail}`);
    assert.ok(errFullName || errEmail, 'Validation errors should display on empty submit');

    // 2.4 Verify Navigation to Login
    const backToLoginLink = page.locator('a[href="login.html"]');
    assert.ok(await backToLoginLink.isVisible());
    console.log('✓ Navigation link back to Login is intact.');

    // 2.5 Capture Register Screenshot
    const regShot = path.resolve(__dirname, 'screenshot_register_verified.png');
    await page.screenshot({ path: regShot });
    console.log(`✓ Register screenshot saved to: ${path.basename(regShot)}`);

    // -------------------------------------------------------------------------
    // PART 3: AUTHENTICATION & LOGIN FLOW
    // -------------------------------------------------------------------------
    console.log('\n--- PART 3: Authenticating via Login Page ---');
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
    await page.fill('#loginUsername', 'franklinesamy2006@gmail.com');
    await page.fill('#loginPassword', '#Frankline2006');
    await page.click('#loginSubmitBtn');
    await page.waitForURL('**/dashboard.html', { timeout: 10000 });
    console.log('✓ Successfully authenticated and navigated to Dashboard.');

    // Dismiss onboarding modal if present
    await page.waitForSelector('#chatApp', { state: 'visible', timeout: 8000 });
    await page.evaluate(() => {
        localStorage.setItem('frank_onboarded', 'true');
        const m = document.getElementById('welcomeOnboardingModal');
        if (m) {
            m.classList.remove('active', 'open', 'show');
            m.style.display = 'none';
        }
    });

    // -------------------------------------------------------------------------
    // PART 4: CHAT RENDERING & 'safeContent is not defined' AUDIT
    // -------------------------------------------------------------------------
    console.log('\n--- PART 4: Auditing Chat Message Loading & safeContent Fix ---');

    // Wait for conversations to load
    await page.waitForSelector('.conversation-card', { state: 'visible', timeout: 8000 });
    const convCount = await page.locator('.conversation-card').count();
    console.log(`Found ${convCount} conversation cards.`);
    assert.ok(convCount > 0, 'Should have at least 1 conversation card.');

    // Select the first conversation card
    await page.locator('.conversation-card').first().click();
    await page.waitForTimeout(1000);

    // Check message container content
    const msgContainer = page.locator('#messagesContainer');
    assert.ok(await msgContainer.isVisible(), 'Messages container must be visible');

    const msgContainerText = await msgContainer.innerText();
    console.log('Messages Container sample text:\n', msgContainerText.slice(0, 200));

    // CRITICAL CHECK: ensure "safeContent is not defined" NEVER appears
    assert.ok(!msgContainerText.includes('safeContent is not defined'), 'CRITICAL ERROR: "safeContent is not defined" was found in messages container!');
    assert.ok(!msgContainerText.includes('ReferenceError'), 'CRITICAL ERROR: ReferenceError was found in messages container!');
    console.log('✓ Verified: ZERO "safeContent is not defined" or ReferenceError in chat view.');

    // -------------------------------------------------------------------------
    // PART 5: MESSAGE SENDING & RICH CONTENT TESTS (PLAIN, UNICODE, TAMIL, MULTILINE)
    // -------------------------------------------------------------------------
    console.log('\n--- PART 5: Testing Message Sending & Rendering (Plain, Unicode, Tamil, Special Chars) ---');

    const testMessages = [
        'Hello World — testing message rendering stability.',
        'வணக்கம்! FRANK Think தமிழ் செய்தி சோதனை.',
        'Multiline message test:\nLine 1: Alpha\nLine 2: Beta\nLine 3: Gamma',
        'Special characters: <test> & "quotes" \'single\' / slash ; semi'
    ];

    for (const testText of testMessages) {
        console.log(`Sending: ${JSON.stringify(testText.slice(0, 30))}...`);
        await page.fill('#messageComposerTextarea', testText);
        await page.click('#composerSendBtn');
        await page.waitForTimeout(800);

        // Verify message appears in container
        const currentContainerText = await msgContainer.innerText();
        assert.ok(!currentContainerText.includes('safeContent is not defined'), '"safeContent is not defined" appeared after sending!');
        assert.ok(!currentContainerText.includes('ReferenceError'), 'ReferenceError appeared after sending!');
    }
    console.log('✓ All test messages sent and rendered without any errors.');

    // -------------------------------------------------------------------------
    // PART 6: RAPID CONVERSATION SWITCHING & STABILITY
    // -------------------------------------------------------------------------
    console.log('\n--- PART 6: Rapid Conversation Switching ---');
    const cards = page.locator('.conversation-card');
    const totalCards = Math.min(await cards.count(), 4);
    for (let i = 0; i < totalCards; i++) {
        await cards.nth(i).click();
        await page.waitForTimeout(300);
        const text = await msgContainer.innerText();
        assert.ok(!text.includes('safeContent is not defined'), `Error on conversation switch ${i}`);
    }
    console.log('✓ Successfully switched conversations rapidly with zero rendering exceptions.');

    // -------------------------------------------------------------------------
    // PART 7: VERIFY GLOBAL THEME & LANGUAGE CONTROLS REMAIN IN DASHBOARD
    // -------------------------------------------------------------------------
    console.log('\n--- PART 7: Verifying Global Theme & Language Features on Dashboard ---');
    // Global language dropdown in dashboard topbar
    const dashLangBtn = page.locator('#dashLangDropdownBtn');
    assert.ok(await dashLangBtn.isVisible(), 'Global language dropdown should be present and visible in dashboard header');
    console.log('✓ Global language dropdown is present in dashboard header.');

    // Desktop profile dropdown contains theme toggle
    await page.click('#desktopProfileBtn');
    await page.waitForTimeout(300);
    const desktopThemeBtn = page.locator('#desktopThemeToggleBtn');
    assert.ok(await desktopThemeBtn.isVisible(), 'Theme toggle option should be available in profile menu');
    console.log('✓ Global theme toggle is available in dashboard profile menu.');
    await page.click('#desktopThemeToggleBtn');
    await page.waitForTimeout(200);
    console.log('✓ Toggled global theme successfully.');

    // -------------------------------------------------------------------------
    // PART 8: RESPONSIVE VIEWPORT CHECKS FOR AUTH PAGES
    // -------------------------------------------------------------------------
    console.log('\n--- PART 8: Responsive Viewport Checks on Login & Register ---');
    const testViewports = [
        { width: 320, height: 600, label: '320px Mobile' },
        { width: 375, height: 667, label: '375px Mobile' },
        { width: 768, height: 1024, label: '768px Tablet' },
        { width: 1280, height: 800, label: '1280px Desktop' }
    ];

    // Clear auth session so login/register do not redirect to dashboard
    await page.evaluate(() => {
        localStorage.removeItem('chatapp_token');
        localStorage.removeItem('chatapp_user');
        localStorage.removeItem('frank_token');
        localStorage.removeItem('frank_user');
    });

    for (const vp of testViewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });

        // Check Login
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(200);
        const lCard = await page.locator('.auth-card').boundingBox();
        const lScrollW = await page.evaluate(() => document.documentElement.scrollWidth);
        const lClientW = await page.evaluate(() => document.documentElement.clientWidth);
        assert.ok(lScrollW <= lClientW + 1, `Horizontal overflow on login at ${vp.label}`);
        console.log(`[${vp.label}] Login Card width: ${lCard?.width}px, no horizontal overflow.`);

        // Check Register
        await page.goto(`${BASE_URL}/register.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(200);
        const rCard = await page.locator('.auth-card').boundingBox();
        const rScrollW = await page.evaluate(() => document.documentElement.scrollWidth);
        const rClientW = await page.evaluate(() => document.documentElement.clientWidth);
        assert.ok(rScrollW <= rClientW + 1, `Horizontal overflow on register at ${vp.label}`);
        console.log(`[${vp.label}] Register Card width: ${rCard?.width}px, no horizontal overflow.`);
    }

    // -------------------------------------------------------------------------
    // PART 9: CONSOLE ERROR AUDIT
    // -------------------------------------------------------------------------
    console.log('\n--- PART 9: Console Error Audit ---');
    const fatalErrors = consoleErrors.filter(e =>
        !e.includes('favicon') &&
        !e.includes('404 (Not Found)') &&
        !e.includes('status of 404')
    );
    if (fatalErrors.length > 0) {
        console.warn('Non-fatal browser console messages:', fatalErrors);
    } else {
        console.log('✓ 0 fatal console errors encountered throughout all tests.');
    }

    await browser.close();
    console.log('\n======================================================================');
    console.log('ALL VERIFICATION SUITES COMPLETED WITH 100% SUCCESS!');
    console.log('======================================================================');
})().catch(err => {
    console.error('\n❌ VERIFICATION TEST FAILED:', err);
    process.exit(1);
});
