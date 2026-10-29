const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

(async () => {
    console.log('=== Comprehensive Test: Home Page Updates, Navbar Scroll & Mobile Login ===\n');
    const browser = await chromium.launch({ headless: true });

    // =========================================================================
    // PART 1: HOME PAGE AUDIT (Desktop, Tablet & Mobile)
    // =========================================================================
    console.log('--- 1. Testing Home Page (Desktop 1440x900) ---');
    const homePage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    
    // Cookie consent preset to prevent banner obstruction
    await homePage.addInitScript(() => {
        localStorage.setItem('frank_cookie_consent_v1', JSON.stringify({
            version: '1.0',
            necessary: true,
            analytics: true,
            preferences: true,
            marketing: false,
            timestamp: new Date().toISOString()
        }));
    });

    const homeUrl = 'file://' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
    await homePage.goto(homeUrl, { waitUntil: 'load' });
    await homePage.waitForTimeout(500);

    // 1A. Confirm embedded APK download block is absent
    const heroApkBtn = await homePage.$('#heroDownloadAndroidBtn');
    const apkNote = await homePage.$('#androidInstallNote');
    const apkWrapper = await homePage.$('.hero-download-wrapper');
    assert.strictEqual(heroApkBtn, null, 'FAIL: #heroDownloadAndroidBtn should be absent on home page');
    assert.strictEqual(apkNote, null, 'FAIL: #androidInstallNote should be absent on home page');
    assert.strictEqual(apkWrapper, null, 'FAIL: .hero-download-wrapper should be absent on home page');
    console.log('   [PASS] Embedded APK download block is absent from home page');

    // 1B. Confirm navbar Download App button is present and points to /download
    const navDownloadBtn = homePage.locator('#navDownloadAppBtn');
    assert(await navDownloadBtn.isVisible(), 'FAIL: Navbar Download App button should be visible');
    const navHref = await navDownloadBtn.getAttribute('href');
    assert(navHref === '/download' || navHref.includes('download'), `FAIL: Navbar Download App button href is "${navHref}"`);
    console.log('   [PASS] Navbar Download App button is present, visible, and points to /download');

    // 1C. Verify navbar scroll behavior
    const header = homePage.locator('header.landing-header');
    assert(await header.isVisible(), 'FAIL: Header should be visible initially');
    
    // Check initial position and computed styles
    const initialHeaderBox = await header.boundingBox();
    const headerPosition = await header.evaluate(el => window.getComputedStyle(el).position);
    console.log(`   Header initial top: ${initialHeaderBox.y}px, CSS position: ${headerPosition}`);
    assert.notStrictEqual(headerPosition, 'fixed', 'FAIL: Header position should NOT be fixed');
    assert.notStrictEqual(headerPosition, 'sticky', 'FAIL: Header position should NOT be sticky');
    assert(['relative', 'static'].includes(headerPosition), `FAIL: Header position should be relative or static, got ${headerPosition}`);

    // Scroll down 600px and verify navbar moves out of view
    await homePage.evaluate(() => window.scrollTo(0, 600));
    await homePage.waitForTimeout(400);

    const scrolledHeaderTop = await header.evaluate(el => el.getBoundingClientRect().top);
    console.log(`   Header getBoundingClientRect().top after scrolling 600px: ${scrolledHeaderTop}px`);
    assert(scrolledHeaderTop < -10, `FAIL: Header did not scroll away! Top is ${scrolledHeaderTop}px`);
    console.log('   [PASS] Navbar scrolls away naturally with page content (moves out of viewport)');

    // Scroll back to top
    await homePage.evaluate(() => window.scrollTo(0, 0));
    await homePage.waitForTimeout(300);

    // 1D. Verify language selector dropdown on desktop
    const langBtn = homePage.locator('#langDropdownBtn');
    assert(await langBtn.isVisible(), 'FAIL: Desktop language button should be visible');
    await langBtn.click();
    await homePage.waitForTimeout(250);
    const langMenu = homePage.locator('#langDropdownMenu');
    assert(await langMenu.isVisible(), 'FAIL: Language dropdown menu did not open');
    const langOptions = await homePage.locator('#langDropdownMenu .lang-option').count();
    assert.strictEqual(langOptions, 3, 'FAIL: Expected 3 language options (English, Tamil, Hindi)');
    console.log('   [PASS] Desktop language selector opens and displays 3 options');
    await langBtn.click(); // Close

    // 1E. Verify primary home page buttons
    const startBtn = homePage.locator('#heroStartChattingBtn');
    const loginBtn = homePage.locator('#heroLoginBtn');
    const exploreBtn = homePage.locator('#heroExploreBtn');
    assert(await startBtn.isVisible(), 'FAIL: Start Chatting button should be visible');
    assert(await loginBtn.isVisible(), 'FAIL: Login button should be visible');
    assert(await exploreBtn.isVisible(), 'FAIL: Explore Features button should be visible');
    console.log('   [PASS] Hero action buttons (Start Chatting, Login, Explore Features) are properly visible and aligned');

    // 1F. Test Home Page on Tablet (768x1024)
    console.log('\n--- 2. Testing Home Page on Tablet (768x1024) ---');
    await homePage.setViewportSize({ width: 768, height: 1024 });
    await homePage.waitForTimeout(300);
    assert.strictEqual(await homePage.$('#heroDownloadAndroidBtn'), null, 'FAIL: APK block should be absent on tablet');
    const tabletHeaderPos = await header.evaluate(el => window.getComputedStyle(el).position);
    assert(['relative', 'static'].includes(tabletHeaderPos), 'FAIL: Tablet header should scroll normally');
    console.log('   [PASS] Home page tablet layout verified (APK block absent, navbar relative)');

    // 1G. Test Home Page on Mobile (375x667)
    console.log('\n--- 3. Testing Home Page on Mobile (375x667) ---');
    await homePage.setViewportSize({ width: 375, height: 667 });
    await homePage.waitForTimeout(300);
    assert.strictEqual(await homePage.$('#heroDownloadAndroidBtn'), null, 'FAIL: APK block should be absent on mobile');
    const mobileToggle = homePage.locator('#landingMobileToggle');
    assert(await mobileToggle.isVisible(), 'FAIL: Mobile nav toggle button should be visible');
    
    // Open mobile drawer
    await mobileToggle.click();
    await homePage.waitForTimeout(300);
    const mobileDrawer = homePage.locator('#landingMobileDrawer');
    assert(await mobileDrawer.isVisible(), 'FAIL: Mobile navigation drawer should open');
    const drawerDownloadLink = homePage.locator('.landing-mobile-apk-link');
    assert(await drawerDownloadLink.isVisible(), 'FAIL: Drawer Download App link should be present');
    console.log('   [PASS] Mobile navigation drawer opens cleanly with Download App link intact');
    
    // Close mobile drawer
    await homePage.click('#landingMobileCloseBtn');
    await homePage.waitForTimeout(300);
    await homePage.close();

    // =========================================================================
    // PART 2: MOBILE LOGIN AUDIT (320px, 375px, 390px, 430px, Tablet & Desktop)
    // =========================================================================
    console.log('\n--- 4. Testing Login Page Across Responsive Breakpoints ---');
    const loginUrl = 'file://' + path.resolve(__dirname, '..', 'login.html').replace(/\\/g, '/');

    const testViewports = [
        { name: 'Small Phone (320px)', width: 320, height: 650, isSingleColumn: true, isTouch: true },
        { name: 'Standard Phone (375px)', width: 375, height: 667, isSingleColumn: true, isTouch: true },
        { name: 'iPhone 14 / Modern Phone (390px)', width: 390, height: 844, isSingleColumn: true, isTouch: true },
        { name: 'Large Phone (430px)', width: 430, height: 932, isSingleColumn: true, isTouch: true },
        { name: 'Tablet (768px)', width: 768, height: 1024, isSingleColumn: true, isTouch: false },
        { name: 'Desktop (1440px)', width: 1440, height: 900, isSingleColumn: false, isTouch: false }
    ];

    for (const vp of testViewports) {
        console.log(`\n  Checking Viewport: ${vp.name}...`);
        const page = await browser.newPage({
            viewport: { width: vp.width, height: vp.height },
            deviceScaleFactor: vp.isTouch ? 2 : 1,
            isMobile: vp.isTouch,
            hasTouch: vp.isTouch
        });

        await page.addInitScript(() => {
            localStorage.setItem('frank_cookie_consent_v1', JSON.stringify({
                version: '1.0',
                necessary: true,
                analytics: true,
                preferences: true,
                marketing: false,
                timestamp: new Date().toISOString()
            }));
        });

        await page.goto(loginUrl, { waitUntil: 'load' });
        await page.waitForTimeout(400);

        // Check horizontal overflow
        const hasOverflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        assert(!hasOverflow, `FAIL: Horizontal overflow detected at ${vp.width}px!`);
        console.log(`     [PASS] No horizontal overflow at ${vp.width}px`);

        if (vp.isSingleColumn) {
            // Check mobile-top-artwork is visible
            const mobileArtwork = page.locator('.mobile-top-artwork');
            assert(await mobileArtwork.isVisible(), `FAIL: Mobile artwork not visible at ${vp.width}px`);
            
            // Check central tile has logo image
            const logoImg = page.locator('.mobile-artwork-stage .frank-central-tile img');
            assert(await logoImg.isVisible(), `FAIL: Logo image missing in mobile artwork at ${vp.width}px`);

            // Check 4 orbiting feature icons
            const iconCount = await page.locator('.mobile-artwork-stage .orbit-feature-card').count();
            assert.strictEqual(iconCount, 4, `FAIL: Expected 4 feature cards at ${vp.width}px`);

            // Check card center duplicate logo tile is hidden
            const cardCenterTile = page.locator('.card-header-center .card-center-logo-tile');
            assert(!(await cardCenterTile.isVisible()), `FAIL: Redundant card logo tile should be hidden at ${vp.width}px`);

            // Check light-blue input background
            const usernameBg = await page.locator('#loginUsername').evaluate(el => window.getComputedStyle(el).backgroundColor);
            console.log(`     Input background color: ${usernameBg}`);
            assert(usernameBg.includes('240, 246, 255') || usernameBg.includes('#f0f6ff') || usernameBg.includes('rgba(40, 123, 255'), 
                `FAIL: Input background is ${usernameBg}, expected light blue`);

            // Check Remember Me and Forgot Password row layout
            const optionsRow = page.locator('.login-options-row');
            const optionsDirection = await optionsRow.evaluate(el => window.getComputedStyle(el).flexDirection);
            assert.strictEqual(optionsDirection, 'row', `FAIL: login-options-row should be row, got ${optionsDirection}`);
            
            const rememberMe = page.locator('.custom-checkbox-label');
            const forgotPass = page.locator('.forgot-password-link');
            const rememberBox = await rememberMe.boundingBox();
            const forgotBox = await forgotPass.boundingBox();
            assert(rememberBox.y <= forgotBox.y + 12 && forgotBox.y <= rememberBox.y + 12, 
                `FAIL: Remember me (${rememberBox.y}) and Forgot password (${forgotBox.y}) should be in the same row!`);
            console.log(`     [PASS] Remember Me and Forgot Password are aligned in one responsive row`);

            // Check touch targets >= 44px
            const btnHeight = await page.locator('#loginSubmitBtn').evaluate(el => el.getBoundingClientRect().height);
            const inputHeight = await page.locator('#loginUsername').evaluate(el => el.getBoundingClientRect().height);
            assert(btnHeight >= 44, `FAIL: Sign In button height ${btnHeight}px < 44px`);
            assert(inputHeight >= 44, `FAIL: Input height ${inputHeight}px < 44px`);
            console.log(`     [PASS] Accessible touch targets verified (button: ${btnHeight}px, input: ${inputHeight}px)`);
        } else {
            // Desktop: promo panel visible
            const promoPanel = page.locator('.login-promo-panel');
            assert(await promoPanel.isVisible(), `FAIL: Desktop promo panel should be visible at ${vp.width}px`);
            console.log(`     [PASS] Desktop two-panel layout preserved cleanly`);
        }

        await page.close();
    }

    // =========================================================================
    // PART 3: AUTH INTERACTIONS & VALIDATION
    // =========================================================================
    console.log('\n--- 5. Testing Interactive Form Functionality ---');
    const formPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await formPage.addInitScript(() => {
        localStorage.setItem('frank_cookie_consent_v1', JSON.stringify({
            version: '1.0', necessary: true, analytics: true, preferences: true, timestamp: new Date().toISOString()
        }));
    });
    await formPage.goto(loginUrl, { waitUntil: 'load' });
    await formPage.waitForTimeout(300);

    // Test password show/hide
    const passInput = formPage.locator('#loginPassword');
    const toggleBtn = formPage.locator('.password-toggle-btn');
    assert.strictEqual(await passInput.getAttribute('type'), 'password');
    await toggleBtn.click();
    assert.strictEqual(await passInput.getAttribute('type'), 'text');
    await toggleBtn.click();
    assert.strictEqual(await passInput.getAttribute('type'), 'password');
    console.log('   [PASS] Password visibility toggle works cleanly');

    // Test validation error appearance on empty submission
    await formPage.click('#loginSubmitBtn');
    await formPage.waitForTimeout(200);
    const userError = formPage.locator('#errorUsername');
    assert(await userError.isVisible(), 'FAIL: Username error should display on invalid submission');
    console.log('   [PASS] Client validation and error feedback display properly');

    // Test registration route navigation
    const registerLink = formPage.locator('.card-register-link');
    const regHref = await registerLink.getAttribute('href');
    assert.strictEqual(regHref, 'register.html', 'FAIL: Register link should point to register.html');
    console.log('   [PASS] Registration navigation link verified');

    await formPage.close();
    await browser.close();

    console.log('\n=================================================================');
    console.log('  ALL HOME PAGE, NAVBAR SCROLL & MOBILE LOGIN AUDITS PASSED!     ');
    console.log('=================================================================');
})().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
