const { chromium } = require('playwright');

async function testNewFeatures() {
    console.log('==================================================');
    console.log('STARTING E2E TESTS: SELF-CHAT LIST, HYPERLINKS, IN-MESSAGE CONTEXT MENU');
    console.log('==================================================');

    const browser = await chromium.launch({
        headless: true,
        args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
    });

    const context = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write']
    });

    const page = await context.newPage();

    page.on('console', msg => {
        console.log('[BROWSER]', msg.type(), msg.text());
    });
    page.on('pageerror', err => {
        console.log('[PAGE ERR]', err.message);
    });

    try {
        // 1. Login as Alex
        console.log('1. Logging in as Alex...');
        await page.goto('http://127.0.0.1:8000/login.html');
        await page.waitForSelector('#loginUsername', { timeout: 10000 });
        await page.fill('#loginUsername', 'alex');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });

        await page.evaluate(() => {
            const loader = document.getElementById('appLoadingScreen');
            if (loader) loader.remove();
        });

        // 2. Verify Self-Conversation (Notes to Self) in Main Conversation Sidebar List
        console.log('2. Verifying Notes to Self in sidebar conversation list...');
        await page.waitForSelector('#conversationList .conversation-card', { timeout: 10000 });
        const selfCard = page.locator('#conversationList .conversation-card', { hasText: '(You)' }).first();
        await selfCard.waitFor({ state: 'visible', timeout: 5000 });

        const selfCardName = await selfCard.locator('.conversation-name').textContent();
        if (!selfCardName.includes('(You)')) {
            throw new Error(`Expected conversation card to display "(You)", got "${selfCardName}"`);
        }
        const hasNotesBadge = await selfCard.locator('.self-prefix-badge').count() > 0;
        if (!hasNotesBadge) {
            throw new Error('Expected self card to have "Notes" badge');
        }
        const avatarSpan = await selfCard.locator('.avatar span').first().textContent();
        if (!avatarSpan.includes('📝')) {
            throw new Error(`Expected self card avatar to be 📝, got "${avatarSpan}"`);
        }
        console.log('[PASS] Notes to Self card is present in sidebar list with (You), Notes badge, and 📝 avatar');

        // 3. Click Self Card -> Opens Self Chat
        console.log('3. Opening Notes to Self chat...');
        await selfCard.click();
        await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
        const headerPartnerName = await page.locator('#chatPartnerName').textContent();
        if (!headerPartnerName.includes('(You)')) {
            throw new Error(`Expected header partner name to include "(You)", got "${headerPartnerName}"`);
        }
        console.log('[PASS] Self chat view opened successfully');

        // Wait for WebSocket connection
        await page.waitForFunction(() => window.wsClient && window.wsClient.isConnected, { timeout: 10000 });

        // 4. Test Chat More Menu for Self-Chat (Notes Info & Delete Notes)
        console.log('4. Testing header more menu adaptations for self-chat...');
        await page.click('#chatMoreBtn');
        await page.waitForSelector('#chatMoreMenu.show', { state: 'visible', timeout: 3000 });
        const infoItemText = await page.locator('#moreGroupInfoText').textContent();
        if (!infoItemText.includes('Notes Info')) {
            throw new Error(`Expected header menu to display "Notes Info", got "${infoItemText}"`);
        }
        const deleteItemText = await page.locator('#moreDeleteChatBtn').textContent();
        if (!deleteItemText.includes('Delete Notes')) {
            throw new Error(`Expected delete button to display "Delete Notes", got "${deleteItemText}"`);
        }
        console.log('[PASS] Header more menu correctly customized for self-chat (Notes Info, Delete Notes)');
        await page.click('#chatMoreBtn');

        // 5. Test Hyperlink Auto-Detection & Opening
        console.log('5. Testing Hyperlink auto-detection in messages...');
        const linkUrl = 'https://frank.app/join/xyz?code=abc123';
        const linkMsg = `Join our channel here: ${linkUrl} or visit https://google.com for info`;
        await page.fill('#messageComposerTextarea', linkMsg);
        await page.click('#composerSendBtn');

        await page.waitForTimeout(600);
        const linkRow = page.locator('.message-row', { hasText: 'Join our channel here:' }).last();
        await linkRow.waitFor({ state: 'visible', timeout: 10000 });

        const chatLinks = linkRow.locator('a.chat-link');
        const linkCount = await chatLinks.count();
        if (linkCount < 2) {
            throw new Error(`Expected at least 2 clickable links in message row, found ${linkCount}`);
        }

        const firstHref = await chatLinks.first().getAttribute('href');
        if (firstHref !== linkUrl) {
            throw new Error(`Expected first link href to be "${linkUrl}", got "${firstHref}"`);
        }
        const firstTarget = await chatLinks.first().getAttribute('target');
        if (firstTarget !== '_blank') {
            throw new Error(`Expected link target to be "_blank", got "${firstTarget}"`);
        }
        console.log('[PASS] Hyperlinks properly detected, linkified, and configured with target="_blank"');

        // 6. Test In-Message Functions Context Menu
        console.log('6. Testing in-message 3-dots button and context menu...');
        await linkRow.hover();
        const moreActionsBtn = linkRow.locator('.msg-action-more-btn');
        await moreActionsBtn.waitFor({ state: 'visible', timeout: 5000 });
        await moreActionsBtn.click();

        const ctxMenu = page.locator('#activeMessageContextMenu');
        await ctxMenu.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] In-message context menu opened');

        // Verify options in menu
        const menuText = await ctxMenu.textContent();
        const expectedOptions = ['Reply', 'Copy Text', 'Edit Message', 'Pin Message', 'Star Message', 'Message Info', 'Delete Message'];
        for (const opt of expectedOptions) {
            if (!menuText.includes(opt)) {
                throw new Error(`Expected in-message context menu to contain option "${opt}"`);
            }
        }
        console.log('[PASS] All expected message options verified (Reply, Copy, Edit, Pin, Star, Info, Delete)');

        // 7. Test "Message Info" option
        console.log('7. Testing "Message Info" action...');
        await ctxMenu.locator('.ctx-info').click();
        const infoBackdrop = page.locator('#messageInfoBackdrop');
        await infoBackdrop.waitFor({ state: 'visible', timeout: 5000 });
        const modalText = await infoBackdrop.textContent();
        if (!modalText.includes('Message Info') || !modalText.includes('From') || !modalText.includes('Sent')) {
            throw new Error(`Unexpected message info modal content: "${modalText}"`);
        }
        console.log('[PASS] Message Info modal displays detailed metadata');
        await page.click('#closeMsgInfoBtn');
        await infoBackdrop.waitFor({ state: 'detached', timeout: 5000 });

        // 8. Test "Pin Message" action
        console.log('8. Testing "Pin Message" action...');
        await linkRow.hover();
        await linkRow.locator('.msg-action-more-btn').click();
        await ctxMenu.waitFor({ state: 'visible', timeout: 5000 });
        await ctxMenu.locator('.ctx-pin').click();
        await page.waitForTimeout(400);

        const pinIndicator = linkRow.locator('.message-pin-indicator');
        await pinIndicator.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Pin indicator (📌) rendered on message');

        // 9. Test "Star Message" action
        console.log('9. Testing "Star Message" action...');
        await linkRow.hover();
        await linkRow.locator('.msg-action-more-btn').click();
        await ctxMenu.waitFor({ state: 'visible', timeout: 5000 });
        await ctxMenu.locator('.ctx-star').click();
        await page.waitForTimeout(400);

        const starIndicator = linkRow.locator('.message-star-indicator');
        await starIndicator.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Star indicator (⭐) rendered on message');

        // 10. Test Right-Click (contextmenu) trigger
        console.log('10. Testing right-click context menu trigger on message row...');
        await linkRow.click({ button: 'right' });
        await ctxMenu.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Right-click contextmenu triggered message options menu successfully');

        // Close menu
        await page.keyboard.press('Escape');
        await ctxMenu.waitFor({ state: 'detached', timeout: 5000 });

        console.log('==================================================');
        console.log('ALL NEW FEATURES VALIDATED SUCCESSFULLY! [100% PASS]');
        console.log('==================================================');

    } finally {
        await browser.close();
    }
}

testNewFeatures().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
