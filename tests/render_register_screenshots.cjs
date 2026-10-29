const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');

(async () => {
    console.log('=== Starting Animated Registration UI Browser & Screenshot Verification ===');
    const browser = await chromium.launch({ headless: true });

    // 1. Desktop Test (1440 x 900)
    const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    desktopPage.on('console', msg => console.log('  [Console]', msg.text()));

    const localUrl = 'file://' + path.resolve(__dirname, '..', 'register.html').replace(/\\/g, '/');
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
    const promoPanel = desktopPage.locator('.register-promo-panel');
    const formCard = desktopPage.locator('.register-glass-card');
    assert(await promoPanel.isVisible(), 'FAIL: Promo panel is not visible on desktop');
    assert(await formCard.isVisible(), 'FAIL: Form card is not visible on desktop');

    const promoBox = await promoPanel.boundingBox();
    const formBox = await formCard.boundingBox();
    console.log(`   Desktop Promo Panel width: ${promoBox.width}px, Form Card width: ${formBox.width}px`);

    // Verify Central Floating 3D Tile & 4 Orbiting Cards
    const centralTile = desktopPage.locator('.promo-artwork-stage .frank-central-tile');
    assert(await centralTile.isVisible(), 'FAIL: 3D central tile is not visible');
    console.log('   [PASS] 3D floating tile is visible and rendered');

    const orbitingCards = await desktopPage.locator('.promo-artwork-stage .orbit-feature-card').count();
    console.log(`   [PASS] ${orbitingCards} orbiting feature cards rendered`);
    assert.strictEqual(orbitingCards, 4, 'FAIL: Expected 4 orbiting cards');

    // Verify 3 Stats Cards
    const statCards = await desktopPage.locator('.promo-stat-card').count();
    console.log(`   [PASS] ${statCards} stats cards rendered`);
    assert.strictEqual(statCards, 3, 'FAIL: Expected 3 stats cards');

    // Save Pristine Desktop Screenshot
    const desktopScreenshotPath = path.resolve(__dirname, '..', 'desktop_register_redesign.png');
    await desktopPage.screenshot({ path: desktopScreenshotPath });
    console.log('   [PASS] Desktop screenshot saved:', desktopScreenshotPath);

    // Test Both Password Visibility Toggles
    const passInput = desktopPage.locator('#regPassword');
    const passToggle = desktopPage.locator('.password-toggle-btn[data-target="regPassword"]');
    assert.strictEqual(await passInput.getAttribute('type'), 'password', 'Initial type should be password');
    await passToggle.click();
    assert.strictEqual(await passInput.getAttribute('type'), 'text', 'After click, type should be text');
    await passToggle.click();
    assert.strictEqual(await passInput.getAttribute('type'), 'password', 'After 2nd click, type should be password');

    const confirmInput = desktopPage.locator('#regConfirmPassword');
    const confirmToggle = desktopPage.locator('.password-toggle-btn[data-target="regConfirmPassword"]');
    assert.strictEqual(await confirmInput.getAttribute('type'), 'password', 'Initial type should be password');
    await confirmToggle.click();
    assert.strictEqual(await confirmInput.getAttribute('type'), 'text', 'After click, type should be text');
    await confirmToggle.click();
    assert.strictEqual(await confirmInput.getAttribute('type'), 'password', 'After 2nd click, type should be password');
    console.log('   [PASS] Both password visibility toggles work cleanly');

    // Test Dynamic Password Strength Meter
    await passInput.fill('abc');
    await desktopPage.waitForTimeout(100);
    let strengthText = await desktopPage.locator('#strengthLabel').innerText();
    console.log(`   Password 'abc' -> ${strengthText}`);
    assert(strengthText.includes('Weak'), 'Expected weak strength for abc');

    await passInput.fill('SecurePass2026!');
    await desktopPage.waitForTimeout(100);
    strengthText = await desktopPage.locator('#strengthLabel').innerText();
    console.log(`   Password 'SecurePass2026!' -> ${strengthText}`);
    assert(strengthText.includes('Strong'), 'Expected strong strength for complex password');
    console.log('   [PASS] Dynamic password strength meter updates reactively');

    // Test Validation on Empty Submit
    await passInput.fill('');
    await desktopPage.click('#registerSubmitBtn');
    await desktopPage.waitForTimeout(200);
    const hasNameError = await desktopPage.locator('#groupFullName').evaluate(el => el.classList.contains('has-error'));
    const hasEmailError = await desktopPage.locator('#groupEmail').evaluate(el => el.classList.contains('has-error'));
    const hasTermsError = await desktopPage.locator('#groupTerms').evaluate(el => el.classList.contains('has-error'));
    assert(hasNameError, 'FAIL: Expected full name validation error on empty submission');
    assert(hasEmailError, 'FAIL: Expected email validation error on empty submission');
    assert(hasTermsError, 'FAIL: Expected terms checkbox validation error on empty submission');
    console.log('   [PASS] Form validations and inline error states triggered correctly');

    // Test Password Mismatch Validation
    await desktopPage.fill('#regFullName', 'Frank Miller');
    await desktopPage.fill('#regEmail', 'frank@example.com');
    await desktopPage.fill('#regPassword', 'Password123');
    await desktopPage.fill('#regConfirmPassword', 'Different123');
    await desktopPage.check('#regTerms');
    await desktopPage.click('#registerSubmitBtn');
    await desktopPage.waitForTimeout(200);
    const hasMismatchError = await desktopPage.locator('#groupConfirmPassword').evaluate(el => el.classList.contains('has-error'));
    assert(hasMismatchError, 'FAIL: Expected password mismatch validation error');
    console.log('   [PASS] Password mismatch validation works correctly');

    // Reset inputs for clean screenshot
    await desktopPage.fill('#regFullName', '');
    await desktopPage.fill('#regEmail', '');
    await desktopPage.fill('#regPassword', '');
    await desktopPage.fill('#regConfirmPassword', '');
    await desktopPage.uncheck('#regTerms');
    await desktopPage.evaluate(() => {
        document.querySelectorAll('.has-error').forEach(el => el.classList.remove('has-error'));
        ['groupFullName', 'groupEmail', 'groupPassword', 'groupConfirmPassword', 'groupTerms'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('has-error');
        });
    });
    await desktopPage.waitForTimeout(100);


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
    const desktopPanelOnMobile = mobilePage.locator('.register-promo-panel');
    assert(!(await desktopPanelOnMobile.isVisible()), 'FAIL: Desktop promo panel should be hidden on mobile');
    console.log('   [PASS] Desktop promo panel is cleanly hidden on mobile');

    // Registration form card is visible
    const mobileFormCard = mobilePage.locator('.register-glass-card');
    assert(await mobileFormCard.isVisible(), 'FAIL: Registration card should be visible on mobile');

    // Check touch target heights >= 44px
    const submitBtnHeight = await mobilePage.locator('#registerSubmitBtn').evaluate(el => el.getBoundingClientRect().height);
    const inputHeight = await mobilePage.locator('#regFullName').evaluate(el => el.getBoundingClientRect().height);
    console.log(`   Submit button height: ${submitBtnHeight}px, Input height: ${inputHeight}px`);
    assert(submitBtnHeight >= 44, 'FAIL: Submit button height < 44px');
    assert(inputHeight >= 44, 'FAIL: Input height < 44px');
    console.log('   [PASS] Mobile touch targets satisfy accessible sizing (>= 44px)');

    // Save Mobile Screenshots
    const mobileScreenshotPath = path.resolve(__dirname, '..', 'mobile_register_redesign.png');
    await mobilePage.screenshot({ path: mobileScreenshotPath });
    const mobileFullPagePath = path.resolve(__dirname, '..', 'mobile_fullpage_register_redesign.png');
    await mobilePage.screenshot({ path: mobileFullPagePath, fullPage: true });
    console.log('   [PASS] Mobile screenshots saved:', mobileScreenshotPath, mobileFullPagePath);

    await browser.close();
    console.log('\n======================================================');
    console.log('  ALL REGISTRATION BROWSER TESTS PASSED 100%! ');
    console.log('======================================================');
})().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
