const { chromium } = require('playwright');
const assert = require('assert');

async function testNewChatModalClose() {
    console.log('================================================================');
    console.log('TEST SUITE: FRANK Think — New Conversation Modal Close Button');
    console.log('================================================================\n');

    const browser = await chromium.launch({ headless: true });
    const errors = [];

    // =========================================================================
    // PART 1: DESKTOP TESTS (1280x800)
    // =========================================================================
    console.log('--- PART 1: DESKTOP TESTS ---');
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(`[CONSOLE ERROR] ${msg.text()}`);
            console.error('[BROWSER ERROR]', msg.text());
        }
    });
    page.on('pageerror', err => {
        errors.push(`[PAGE ERROR] ${err.message}`);
        console.error('[PAGE ERROR]', err);
    });

    // 1. Login
    console.log('1. Logging in as admin user...');
    await page.goto('http://127.0.0.1:8000/login.html');
    await page.fill('#loginUsername', 'frankline30999112@gmail.com');
    await page.fill('#loginPassword', '#Frankline2006');
    await page.click('#loginSubmitBtn');
    await page.waitForTimeout(1000);

    // Navigate to dashboard
    await page.goto('http://127.0.0.1:8000/dashboard.html');
    await page.waitForSelector('#sidebar', { state: 'attached', timeout: 10000 });
    await page.evaluate(() => {
        localStorage.setItem('frank_onboarded', 'true');
        const welcome = document.getElementById('welcomeOnboardingModal');
        if (welcome) welcome.remove();
        const loader = document.getElementById('appLoadingScreen');
        if (loader) loader.remove();
    });
    await page.waitForTimeout(400);

    // 2. Open via #chatsHeaderNewBtn and verify X button closes modal
    console.log('2. Opening New Conversation modal via chats header button...');
    await page.waitForSelector('#chatsHeaderNewBtn', { timeout: 5000 });
    await page.click('#chatsHeaderNewBtn');
    await page.waitForSelector('#newChatModal.open', { state: 'visible', timeout: 5000 });
    console.log('   [PASS] New Conversation modal opened successfully');

    // Verify close button attributes & accessibility
    const closeBtn = page.locator('#closeNewChatModalBtn');
    await closeBtn.waitFor({ state: 'visible', timeout: 3000 });
    const ariaLabel = await closeBtn.getAttribute('aria-label');
    assert.strictEqual(ariaLabel, 'Close modal', 'Close button has correct aria-label');
    console.log('   [PASS] Close button has accessible attributes');

    // Click X and verify immediate close
    console.log('3. Clicking X close button...');
    await closeBtn.click();
    await page.waitForSelector('#newChatModal', { state: 'hidden', timeout: 3000 });
    const isHidden = await page.evaluate(() => {
        const m = document.getElementById('newChatModal');
        const style = window.getComputedStyle(m);
        return !m.classList.contains('open') && !m.classList.contains('active') && (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0');
    });
    assert.strictEqual(isHidden, true, 'Modal is completely hidden after clicking X');
    console.log('   [PASS] Clicking X closed the modal immediately');

    // 4. Verify reopening works cleanly
    console.log('4. Reopening New Conversation modal...');
    await page.click('#chatsHeaderNewBtn');
    await page.waitForSelector('#newChatModal.open', { state: 'visible', timeout: 5000 });
    console.log('   [PASS] Modal reopened cleanly');

    // 5. Test close while on Connect via FRANK ID tab
    console.log('5. Testing X close while Connect via FRANK ID tab is selected...');
    await page.click('#newChatTabFrankId');
    await page.waitForSelector('#newChatSectionFrankId', { state: 'visible', timeout: 3000 });
    await closeBtn.click();
    await page.waitForSelector('#newChatModal', { state: 'hidden', timeout: 3000 });
    console.log('   [PASS] Modal closed from FRANK ID tab');

    // 6. Test close after typing in FRANK ID (without connecting)
    console.log('6. Testing X close after entering a FRANK ID (ensuring no connect/API call triggered)...');
    let apiConnectCalled = false;
    page.on('request', req => {
        if (req.url().includes('/api/conversations') && req.method() === 'POST') {
            apiConnectCalled = true;
        }
    });

    await page.click('#chatsHeaderNewBtn');
    await page.waitForSelector('#newChatModal.open', { state: 'visible', timeout: 5000 });
    await page.fill('#frankIdSearchInput', 'ADM001');
    await page.waitForTimeout(300);

    // Click X
    await closeBtn.click();
    await page.waitForSelector('#newChatModal', { state: 'hidden', timeout: 3000 });
    assert.strictEqual(apiConnectCalled, false, 'No conversation creation or connect API call was triggered by X close');
    console.log('   [PASS] Modal closed without connecting or creating conversation');

    // 7. Test close while on Existing Contacts tab
    console.log('7. Testing X close while Existing Contacts tab is selected...');
    await page.click('#chatsHeaderNewBtn');
    await page.waitForSelector('#newChatModal.open', { state: 'visible', timeout: 5000 });
    await page.click('#newChatTabContacts');
    await page.waitForSelector('#newChatSectionContacts', { state: 'visible', timeout: 3000 });
    await closeBtn.click();
    await page.waitForSelector('#newChatModal', { state: 'hidden', timeout: 3000 });
    console.log('   [PASS] Modal closed from Contacts tab');

    // 8. Test close while Message Yourself card is present
    console.log('8. Testing X close while Message Yourself card is present...');
    await page.click('#chatsHeaderNewBtn');
    await page.waitForSelector('#newChatModal.open', { state: 'visible', timeout: 5000 });
    await page.hover('#newChatSelfCard');
    await closeBtn.click();
    await page.waitForSelector('#newChatModal', { state: 'hidden', timeout: 3000 });
    console.log('   [PASS] Modal closed successfully while Message Yourself section was focused');

    // 9. Verify Message Yourself functional integrity (clicking card still works)
    console.log('9. Verifying Message Yourself card functional integrity...');
    await page.click('#chatsHeaderNewBtn');
    await page.waitForSelector('#newChatModal.open', { state: 'visible', timeout: 5000 });
    await page.click('#newChatSelfCard');
    await page.waitForSelector('#newChatModal', { state: 'hidden', timeout: 3000 });
    await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
    const chatPartner = await page.locator('#chatPartnerName').textContent();
    const chatPresence = await page.locator('#chatPartnerPresenceText').textContent();
    assert(chatPartner.includes('Frankline'), 'Self chat opened for current user');
    assert(chatPresence.includes('Message yourself') || chatPresence.includes('Notes & bookmarks'), 'Self presence displayed');
    console.log('   [PASS] Message Yourself card functionality remains 100% operational');

    // 10. Test Escape key closes modal
    console.log('10. Testing Escape key accessibility...');
    await page.click('#chatsHeaderNewBtn');
    await page.waitForSelector('#newChatModal.open', { state: 'visible', timeout: 5000 });
    await page.keyboard.press('Escape');
    await page.waitForSelector('#newChatModal', { state: 'hidden', timeout: 3000 });
    console.log('   [PASS] Escape key closes modal cleanly');

    // =========================================================================
    // PART 2: MOBILE VIEWPORT TESTS (375x812 - iPhone)
    // =========================================================================
    console.log('\n--- PART 2: MOBILE VIEWPORT TESTS ---');
    const mobileContext = await browser.newContext({
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();

    // Authenticate mobile page
    await mobilePage.goto('http://127.0.0.1:8000/login.html');
    await mobilePage.fill('#loginUsername', 'frankline30999112@gmail.com');
    await mobilePage.fill('#loginPassword', '#Frankline2006');
    await mobilePage.click('#loginSubmitBtn');
    await mobilePage.waitForTimeout(1000);

    await mobilePage.goto('http://127.0.0.1:8000/dashboard.html');
    await mobilePage.evaluate(() => {
        localStorage.setItem('frank_onboarded', 'true');
        const welcome = document.getElementById('welcomeOnboardingModal');
        if (welcome) welcome.remove();
        const loader = document.getElementById('appLoadingScreen');
        if (loader) loader.remove();
    });
    await mobilePage.waitForTimeout(500);

    // Open via mobile header new chat button
    console.log('11. Opening modal on mobile...');
    const mobileNewBtn = mobilePage.locator('#chatsHeaderNewBtn');
    await mobileNewBtn.click();
    await mobilePage.waitForSelector('#newChatModal.open', { state: 'visible', timeout: 5000 });
    console.log('   [PASS] Modal opened in mobile viewport');

    // Tap X close button on mobile
    console.log('12. Tapping X close button on mobile...');
    const mobileCloseBtn = mobilePage.locator('#closeNewChatModalBtn');
    await mobileCloseBtn.tap();
    await mobilePage.waitForSelector('#newChatModal', { state: 'hidden', timeout: 3000 });
    console.log('   [PASS] Modal closed immediately via touch on mobile');

    // Reopen on mobile
    console.log('13. Reopening on mobile and verifying touch target accessibility...');
    await mobileNewBtn.click();
    await mobilePage.waitForSelector('#newChatModal.open', { state: 'visible', timeout: 5000 });
    const mobileBox = await mobileCloseBtn.boundingBox();
    assert(mobileBox.width >= 30 && mobileBox.height >= 30, 'Touch target meets accessibility sizing');
    await mobileCloseBtn.tap();
    await mobilePage.waitForSelector('#newChatModal', { state: 'hidden', timeout: 3000 });
    console.log('   [PASS] Touch target size verified and closed successfully');

    await browser.close();

    console.log('\n================================================================');
    console.log(`SUMMARY: All tests passed with ${errors.length} unexpected errors.`);
    console.log('================================================================');
    if (errors.length > 0) {
        throw new Error(`Unexpected browser errors encountered: ${JSON.stringify(errors)}`);
    }
}

testNewChatModalClose()
    .then(() => {
        console.log('\n✓ ALL TESTS PASSED SUCCESSFULLY!');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n✗ TEST FAILED:', err);
        process.exit(1);
    });
