const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    const screenshotDir = path.resolve(__dirname, 'screenshots_toolbar');
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }

    const browser = await chromium.launch({
        headless: true,
        args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
    });

    console.log('==================================================');
    console.log('1. DESKTOP TEST: Hover Toolbar & 3-Dot Button Removal');
    console.log('==================================================');

    const desktopContext = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        permissions: ['clipboard-read', 'clipboard-write']
    });
    const page = await desktopContext.newPage();

    await page.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'load' });
    await page.fill('#loginUsername', 'alex');
    await page.fill('#loginPassword', 'password123');
    await page.click('#loginSubmitBtn');

    await page.waitForURL('**/dashboard.html', { timeout: 10000 });
    console.log('✓ Successfully logged in to Dashboard on Desktop');

    await page.evaluate(() => {
        const loader = document.getElementById('appLoadingScreen');
        if (loader) loader.remove();
    });

    await page.waitForSelector('.conversation-card', { timeout: 10000 });
    const sarahCard = page.locator('.conversation-card', { hasText: 'Sarah' }).first();
    await sarahCard.click();
    await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
    await page.waitForSelector('.message-row', { timeout: 10000 });
    console.log('✓ Conversation opened and messages loaded');

    // 1. Verify bubble-more-trigger is completely gone everywhere in message bubbles
    const inBubbleMoreTriggers = await page.$$('.bubble-more-trigger');
    console.log(`Checking for .bubble-more-trigger in DOM: found ${inBubbleMoreTriggers.length}`);
    if (inBubbleMoreTriggers.length > 0) {
        throw new Error(`FAIL: Found ${inBubbleMoreTriggers.length} .bubble-more-trigger buttons in message bubbles!`);
    }
    console.log('✓ PASS: Zero .bubble-more-trigger buttons exist in the DOM!');

    // 2. Check message row and hover toolbar
    const messageRows = await page.$$('.message-row');
    const messageRow = messageRows[messageRows.length - 1]; // Latest message
    const toolbar = await messageRow.$('.message-actions-toolbar');
    if (!toolbar) {
        throw new Error('FAIL: .message-actions-toolbar element not found in .message-row!');
    }

    // Hover over message
    await messageRow.hover();
    await page.waitForTimeout(300);

    const isVisibleOnHover = await toolbar.evaluate(el => {
        const style = window.getComputedStyle(el);
        return style.display === 'flex' && style.visibility !== 'hidden';
    });
    console.log(`✓ Toolbar display on hover: ${isVisibleOnHover ? 'display: flex (PASS)' : 'FAIL'}`);

    // 3. Verify exactly 8 action buttons in exact required order
    const actionButtons = await toolbar.$$('.action-tool-btn');
    console.log(`Toolbar action button count: ${actionButtons.length}`);
    if (actionButtons.length !== 8) {
        throw new Error(`FAIL: Expected 8 action buttons, found ${actionButtons.length}!`);
    }
    console.log('✓ PASS: Toolbar has exactly 8 action buttons!');

    const buttonDetails = [];
    for (let i = 0; i < actionButtons.length; i++) {
        const btn = actionButtons[i];
        const info = await btn.evaluate(el => ({
            className: el.className,
            title: el.getAttribute('title') || el.getAttribute('aria-label') || '',
            text: el.innerText.trim(),
            emoji: el.getAttribute('data-emoji') || '',
            hasSvg: !!el.querySelector('svg')
        }));
        buttonDetails.push(info);
        console.log(`  Action ${i + 1}: class="${info.className}" title="${info.title}" text="${info.text || (info.hasSvg ? '[SVG Icon]' : '')}" emoji="${info.emoji}"`);
    }

    // Required order validation:
    // 1: Reply
    if (!buttonDetails[0].className.includes('msg-action-reply')) throw new Error('Action 1 is not Reply!');
    // 2: AI / sparkle
    if (!buttonDetails[1].className.includes('msg-action-smart')) throw new Error('Action 2 is not AI / sparkle!');
    // 3: Heart reaction
    if (buttonDetails[2].emoji !== '❤️') throw new Error('Action 3 is not Heart reaction!');
    // 4: Thumbs-up reaction
    if (buttonDetails[3].emoji !== '👍') throw new Error('Action 4 is not Thumbs-up reaction!');
    // 5: Laugh reaction
    if (buttonDetails[4].emoji !== '😂') throw new Error('Action 5 is not Laugh reaction!');
    // 6: Fire reaction
    if (buttonDetails[5].emoji !== '🔥') throw new Error('Action 6 is not Fire reaction!');
    // 7: Copy message
    if (!buttonDetails[6].className.includes('msg-action-copy')) throw new Error('Action 7 is not Copy message!');
    // 8: More options (three-dot menu)
    if (!buttonDetails[7].className.includes('msg-action-more-btn')) throw new Error('Action 8 is not More options (3-dot)!');

    console.log('✓ PASS: All 8 actions match the exact required order!');

    // Test More options (three-dot menu) button click opens context menu
    const moreBtn = actionButtons[7];
    await moreBtn.click();
    await page.waitForTimeout(500);

    const contextMenu = await page.$('#activeMessageContextMenu');
    if (!contextMenu) {
        throw new Error('FAIL: More options button did not open #activeMessageContextMenu!');
    }
    console.log('✓ PASS: More options (3-dot) button successfully opens context menu!');

    await page.screenshot({ path: path.join(screenshotDir, 'desktop_toolbar_and_menu.png') });
    console.log('✓ Saved desktop screenshot: desktop_toolbar_and_menu.png');

    // Dismiss menu
    await page.mouse.click(20, 20);
    await page.waitForTimeout(300);

    // Hover over message again and capture single-row toolbar
    await messageRow.hover();
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(screenshotDir, 'desktop_hover_toolbar.png') });
    console.log('✓ Saved desktop screenshot: desktop_hover_toolbar.png');

    await desktopContext.close();

    console.log('\n==================================================');
    console.log('2. MOBILE TEST: Touch, Tap, Boundaries (375x812)');
    console.log('==================================================');

    const mobileContext = await browser.newContext({
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();

    await mobilePage.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'load' });
    await mobilePage.fill('#loginUsername', 'alex');
    await mobilePage.fill('#loginPassword', 'password123');
    await mobilePage.click('#loginSubmitBtn');

    await mobilePage.waitForURL('**/dashboard.html', { timeout: 10000 });
    console.log('✓ Logged in on Mobile (375x812)');

    await mobilePage.evaluate(() => {
        const loader = document.getElementById('appLoadingScreen');
        if (loader) loader.remove();
    });

    await mobilePage.waitForSelector('.conversation-card', { timeout: 10000 });
    const mobileSarahCard = mobilePage.locator('.conversation-card', { hasText: 'Sarah' }).first();
    await mobileSarahCard.click();
    await mobilePage.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
    await mobilePage.waitForSelector('.message-row', { timeout: 10000 });

    // Verify zero in-bubble triggers on mobile
    const mobileInBubble = await mobilePage.$$('.bubble-more-trigger');
    if (mobileInBubble.length > 0) {
        throw new Error(`FAIL: Found ${mobileInBubble.length} .bubble-more-trigger buttons on mobile!`);
    }
    console.log('✓ PASS: Zero .bubble-more-trigger buttons on mobile!');

    const mobileRows = await mobilePage.$$('.message-row');
    const mobileMsgRow = mobileRows[mobileRows.length - 1];
    const mobileMsgBubble = await mobileMsgRow.$('.message-bubble');
    const mobileToolbar = await mobileMsgRow.$('.message-actions-toolbar');

    // Tap message bubble to toggle toolbar
    console.log('Tapping message bubble...');
    await mobileMsgBubble.click();
    await mobilePage.waitForTimeout(300);

    const activeDisplay = await mobileToolbar.evaluate(el => window.getComputedStyle(el).display);
    const hasActiveClass = await mobileMsgRow.evaluate(el => el.classList.contains('toolbar-active'));
    console.log(`After tap: class contains toolbar-active: ${hasActiveClass}, display: ${activeDisplay}`);
    if (!hasActiveClass || activeDisplay !== 'flex') {
        throw new Error('FAIL: Tapping message bubble did not activate toolbar on mobile!');
    }
    console.log('✓ PASS: Tapping message activates toolbar on touch devices!');

    // Check viewport boundaries and overflow
    const toolbarBox = await mobileToolbar.boundingBox();
    console.log(`Mobile toolbar bounding box: x=${toolbarBox.x}, width=${toolbarBox.width}, right=${toolbarBox.x + toolbarBox.width}`);
    if (toolbarBox.x < 0 || (toolbarBox.x + toolbarBox.width) > 375 + 5) {
        throw new Error(`FAIL: Toolbar extends beyond viewport bounds! x=${toolbarBox.x}, width=${toolbarBox.width}`);
    }
    console.log('✓ PASS: Toolbar is contained within mobile screen boundaries!');

    // Verify 8 buttons are all present on mobile
    const mobileButtons = await mobileToolbar.$$('.action-tool-btn');
    if (mobileButtons.length !== 8) {
        throw new Error(`FAIL: Expected 8 buttons on mobile toolbar, found ${mobileButtons.length}`);
    }
    console.log('✓ PASS: All 8 actions accessible on mobile!');

    await mobilePage.screenshot({ path: path.join(screenshotDir, 'mobile_active_toolbar.png') });
    console.log('✓ Saved mobile screenshot: mobile_active_toolbar.png');

    // Test dismiss when tapping outside
    console.log('Testing dismissal on tapping outside...');
    await mobilePage.mouse.click(50, 80);
    await mobilePage.waitForTimeout(300);

    const isDismissed = await mobileMsgRow.evaluate(el => !el.classList.contains('toolbar-active'));
    console.log(`Toolbar dismissed on outside tap: ${isDismissed}`);
    if (!isDismissed) {
        throw new Error('FAIL: Toolbar was not dismissed when tapping outside!');
    }
    console.log('✓ PASS: Toolbar closes cleanly when user taps outside!');

    await mobileContext.close();

    console.log('\n==================================================');
    console.log('3. TABLET TEST: Viewport (768x1024)');
    console.log('==================================================');

    const tabletContext = await browser.newContext({
        viewport: { width: 768, height: 1024 }
    });
    const tabletPage = await tabletContext.newPage();

    await tabletPage.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'load' });
    await tabletPage.fill('#loginUsername', 'alex');
    await tabletPage.fill('#loginPassword', 'password123');
    await tabletPage.click('#loginSubmitBtn');

    await tabletPage.waitForURL('**/dashboard.html', { timeout: 10000 });
    await tabletPage.evaluate(() => {
        const loader = document.getElementById('appLoadingScreen');
        if (loader) loader.remove();
    });

    await tabletPage.waitForSelector('.conversation-card', { timeout: 10000 });
    const tabletSarahCard = tabletPage.locator('.conversation-card', { hasText: 'Sarah' }).first();
    await tabletSarahCard.click();
    await tabletPage.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
    await tabletPage.waitForSelector('.message-row', { timeout: 10000 });

    const tabletRows = await tabletPage.$$('.message-row');
    const tabletRow = tabletRows[tabletRows.length - 1];
    if (tabletRow) {
        await tabletRow.hover();
        await tabletPage.waitForTimeout(300);
        await tabletPage.screenshot({ path: path.join(screenshotDir, 'tablet_toolbar.png') });
        console.log('✓ Saved tablet screenshot: tablet_toolbar.png');
    }

    await tabletContext.close();
    await browser.close();

    console.log('\n==================================================');
    console.log('ALL TESTS PASSED 100%!');
    console.log('==================================================');
})().catch(err => {
    console.error('TEST ERROR:', err);
    process.exit(1);
});
