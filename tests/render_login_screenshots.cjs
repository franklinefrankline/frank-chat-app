const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

(async () => {
    console.log('=== Starting Animated Login UI Browser & Screenshot Verification ===');
    const browser = await chromium.launch({ headless: true });

    // 1. Desktop Test (1440 x 900)
    const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    desktopPage.on('console', msg => console.log('  [Console]', msg.text()));

    const localUrl = 'file://' + path.resolve(__dirname, '..', 'login.html').replace(/\\/g, '/');
    console.log('1. Navigating Desktop to:', localUrl);
    await desktopPage.addInitScript(() => {
        localStorage.setItem('frank_cookie_consent_v1', JSON.stringify({
            version: '1.0',
            necessary: true,
            analytics: true,
            preferences: true,
            marketing: false,
            timestamp: new Date().toISOString()
        }));
    });
    await desktopPage.goto(localUrl, { waitUntil: 'load' });
    await desktopPage.waitForTimeout(600); // Allow entrance animations to stabilize

    // Verify Desktop Split Screen Layout
    const promoPanel = desktopPage.locator('.login-promo-panel');
    const formCard = desktopPage.locator('.login-glass-card');
    assert(await promoPanel.isVisible(), 'FAIL: Promo panel is not visible on desktop');
    assert(await formCard.isVisible(), 'FAIL: Form card is not visible on desktop');

    const promoBox = await promoPanel.boundingBox();
    const formBox = await formCard.boundingBox();
    console.log(`   Desktop Promo Panel width: ${promoBox.width}px, Form Card width: ${formBox.width}px`);

    // Verify Central Floating 3D Tile & Orbiting Cards
    const centralTile = desktopPage.locator('.promo-artwork-stage .frank-central-tile');
    assert(await centralTile.isVisible(), 'FAIL: 3D central tile is not visible');
    console.log('   [PASS] 3D floating tile is visible and rendered');

    const orbitingCards = await desktopPage.locator('.promo-artwork-stage .orbit-feature-card').count();
    console.log(`   [PASS] ${orbitingCards} orbiting feature cards rendered`);
    assert.strictEqual(orbitingCards, 4, 'FAIL: Expected 4 orbiting cards');

    // Verify Stats Cards
    const statCards = await desktopPage.locator('.promo-stat-card').count();
    console.log(`   [PASS] ${statCards} stats cards rendered`);
    assert.strictEqual(statCards, 3, 'FAIL: Expected 3 stats cards');

    // Test Password Visibility Toggle
    const passwordInput = desktopPage.locator('#loginPassword');
    const toggleBtn = desktopPage.locator('.password-toggle-btn');
    assert.strictEqual(await passwordInput.getAttribute('type'), 'password', 'Initial type should be password');
    await toggleBtn.click();
    assert.strictEqual(await passwordInput.getAttribute('type'), 'text', 'After click, type should be text');
    await toggleBtn.click();
    assert.strictEqual(await passwordInput.getAttribute('type'), 'password', 'After 2nd click, type should be password');
    console.log('   [PASS] Password visibility toggle works cleanly');

    // Test SSO Provider Button Click (Toast feedback)
    await desktopPage.click('#ssoGoogleBtn');
    await desktopPage.waitForTimeout(400);
    const toast = desktopPage.locator('.toast');
    if (await toast.isVisible()) {
        const text = await toast.innerText();
        console.log(`   [PASS] SSO Toast feedback: "${text.trim()}"`);
    }

    // Save Desktop Screenshot
    const desktopScreenshotPath = path.resolve(__dirname, '..', 'desktop_login_redesign.png');
    await desktopPage.screenshot({ path: desktopScreenshotPath });
    console.log('   [PASS] Desktop screenshot saved:', desktopScreenshotPath);

    // 2. Mobile Device Test (390 x 844)
    console.log('\n2. Testing Mobile Responsive Viewport (390 x 844)...');
    const mobilePage = await browser.newPage({ 
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true
    });

    await mobilePage.addInitScript(() => {
        localStorage.setItem('frank_cookie_consent_v1', JSON.stringify({
            version: '1.0',
            necessary: true,
            analytics: true,
            preferences: true,
            marketing: false,
            timestamp: new Date().toISOString()
        }));
    });
    await mobilePage.goto(localUrl, { waitUntil: 'load' });
    await mobilePage.waitForTimeout(600);

    // Check no horizontal scrollbar on mobile
    const hasHorizontalOverflow = await mobilePage.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    console.log('   Mobile horizontal overflow detected:', hasHorizontalOverflow);
    assert(!hasHorizontalOverflow, 'FAIL: Mobile layout has horizontal overflow!');

    // Check mobile top floating artwork is visible
    const mobileArtwork = mobilePage.locator('.mobile-top-artwork');
    assert(await mobileArtwork.isVisible(), 'FAIL: Mobile artwork should be visible on mobile');
    console.log('   [PASS] Mobile top floating artwork is visible');

    // Desktop promo panel should be hidden on mobile
    const desktopPanelOnMobile = mobilePage.locator('.login-promo-panel');
    assert(!(await desktopPanelOnMobile.isVisible()), 'FAIL: Desktop promo panel should be hidden on mobile');
    console.log('   [PASS] Desktop promo panel is cleanly hidden on mobile');

    // Sign in form card is primary focus
    const mobileFormCard = mobilePage.locator('.login-glass-card');
    assert(await mobileFormCard.isVisible(), 'FAIL: Login card should be visible on mobile');

    // Check touch target heights >= 44px
    const submitBtnHeight = await mobilePage.locator('#loginSubmitBtn').evaluate(el => el.getBoundingClientRect().height);
    const inputHeight = await mobilePage.locator('#loginUsername').evaluate(el => el.getBoundingClientRect().height);
    console.log(`   Submit button height: ${submitBtnHeight}px, Input height: ${inputHeight}px`);
    assert(submitBtnHeight >= 44, 'FAIL: Submit button height < 44px');
    assert(inputHeight >= 44, 'FAIL: Input height < 44px');
    console.log('   [PASS] Mobile touch targets satisfy accessible sizing (>= 44px)');

    // Save Mobile Screenshot (Viewport and FullPage)
    const mobileScreenshotPath = path.resolve(__dirname, '..', 'mobile_login_redesign.png');
    await mobilePage.screenshot({ path: mobileScreenshotPath });
    const mobileFullPagePath = path.resolve(__dirname, '..', 'mobile_fullpage_login_redesign.png');
    await mobilePage.screenshot({ path: mobileFullPagePath, fullPage: true });
    console.log('   [PASS] Mobile screenshots saved:', mobileScreenshotPath, mobileFullPagePath);

    await browser.close();
    console.log('\n======================================================');
    console.log('  ALL BROWSER & RESPONSIVE TESTS PASSED SUCCESSFULLY! ');
    console.log('======================================================');
})().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
