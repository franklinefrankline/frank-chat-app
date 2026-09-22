const { chromium } = require('playwright');

async function testMessageYourself() {
    console.log('==================================================');
    console.log('STARTING PLAYWRIGHT E2E MESSAGE YOURSELF (NOTES TO SELF) TESTS');
    console.log('==================================================');

    const browser = await chromium.launch({
        headless: true,
        args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
    });

    const context = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write', 'microphone']
    });

    const page = await context.newPage();

    page.on('console', msg => {
        console.log('[BROWSER]', msg.type(), msg.text());
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

        // Dismiss loading screen if present
        await page.evaluate(() => {
            const loader = document.getElementById('appLoadingScreen');
            if (loader) loader.remove();
        });

        // 2. Open New Conversation Modal
        console.log('2. Opening New Conversation modal...');
        await page.waitForSelector('#newChatModalBtn', { timeout: 10000 });
        await page.click('#newChatModalBtn');
        await page.waitForSelector('#newChatModal.open', { state: 'visible', timeout: 5000 });
        console.log('[PASS] New Conversation modal opened');

        // 3. Verify Quick Self-Message Card is featured in modal
        console.log('3. Verifying featured "Message Yourself" card in modal...');
        const selfCard = page.locator('#newChatSelfCard');
        await selfCard.waitFor({ state: 'visible', timeout: 5000 });
        const selfCardTitle = await selfCard.textContent();
        if (!selfCardTitle.includes('Message Yourself')) {
            throw new Error(`Expected self card to contain "Message Yourself", got: "${selfCardTitle}"`);
        }
        if (!selfCardTitle.includes('Personal notes, bookmarks, drafts')) {
            throw new Error(`Expected self card description, got: "${selfCardTitle}"`);
        }
        console.log('[PASS] Featured Message Yourself card verified with title and description');

        // 4. Click Message Yourself card -> Should open self chat
        console.log('4. Clicking Message Yourself card...');
        await selfCard.click();
        await page.waitForSelector('#newChatModal', { state: 'hidden', timeout: 5000 });
        await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });

        // Verify Header UI
        const partnerName = await page.locator('#chatPartnerName').textContent();
        if (!partnerName.includes('(You)')) {
            throw new Error(`Expected chat header to display "(You)", got: "${partnerName}"`);
        }
        const partnerPresence = await page.locator('#chatPartnerPresenceText').textContent();
        if (!partnerPresence.includes('Message yourself') && !partnerPresence.includes('Notes & bookmarks')) {
            throw new Error(`Expected subtitle to mention "Message yourself" or "Notes & bookmarks", got: "${partnerPresence}"`);
        }
        console.log('[PASS] Self chat view opened with "(You)" branding and "Message yourself • Notes & bookmarks" presence');

        // Wait for WebSocket & message list to settle
        await page.waitForFunction(() => window.wsClient && window.wsClient.isConnected, { timeout: 10000 });
        await page.waitForSelector('#messagesContainer .spinner', { state: 'detached', timeout: 10000 });

        // 5. Send a Note to Self
        const noteText = `Personal Note #${Date.now()}: Review FRANK release checklist`;
        console.log(`5. Sending note to self: "${noteText}"...`);
        const textarea = page.locator('#messageComposerTextarea');
        await textarea.fill(noteText);
        await page.click('#composerSendBtn');

        // Wait for message to render in chat
        await page.waitForTimeout(600);
        const noteRow = page.locator('.message-row', { hasText: noteText }).last();
        await noteRow.waitFor({ state: 'visible', timeout: 10000 });
        console.log('[PASS] Personal note rendered in chat');

        // Verify NO duplicate message bubbles were created
        const countOfNote = await page.locator('.message-row', { hasText: noteText }).count();
        if (countOfNote !== 1) {
            throw new Error(`Expected exactly 1 message bubble for note, found ${countOfNote}`);
        }
        console.log('[PASS] Verified single message delivery (no duplicate bubbles on self-chat)');

        // 6. Verify Conversation Card in Sidebar
        console.log('6. Verifying self conversation card in sidebar list...');
        await page.waitForTimeout(600);
        const selfConvCard = page.locator('.conversation-card', { hasText: '(You)' }).first();
        await selfConvCard.waitFor({ state: 'visible', timeout: 5000 });
        const cardNotesBadge = selfConvCard.locator('.self-prefix-badge');
        await cardNotesBadge.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Self conversation card displayed with "Notes" badge and "(You)" branding');

        // 7. Test searching own FRANK ID (F4M8Q1) in New Conversation Modal
        console.log('7. Testing own FRANK ID search in New Conversation modal...');
        await page.click('#newChatModalBtn');
        await page.waitForSelector('#newChatModal.open', { state: 'visible', timeout: 5000 });

        const frankIdInput = page.locator('#frankIdSearchInput');
        await frankIdInput.fill('F4M8Q1');
        await page.click('#frankIdSearchBtn');

        // Profile preview card should appear for self
        const previewCard = page.locator('#frankIdProfilePreview');
        await previewCard.waitFor({ state: 'visible', timeout: 5000 });
        const previewName = await page.locator('#previewFullName').textContent();
        if (!previewName.includes('(You)')) {
            throw new Error(`Expected preview card to show "(You)", got: "${previewName}"`);
        }
        const previewBio = await page.locator('#previewBio').textContent();
        if (!previewBio.includes('Message yourself')) {
            throw new Error(`Expected preview bio to mention "Message yourself", got: "${previewBio}"`);
        }
        console.log('[PASS] Searching own FRANK ID previews self profile with "Message yourself"');

        // Click start chat from preview
        await page.click('#previewStartChatBtn');
        await page.waitForSelector('#newChatModal', { state: 'hidden', timeout: 5000 });
        await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
        console.log('[PASS] Start chat from FRANK ID preview opens self chat');

        // 8. Refresh and verify persistence
        console.log('8. Refreshing page and verifying self-conversation persistence...');
        await page.reload();
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        await page.evaluate(() => {
            const loader = document.getElementById('appLoadingScreen');
            if (loader) loader.remove();
        });

        // Verify conversation card remains in sidebar
        const reloadedSelfCard = page.locator('.conversation-card', { hasText: '(You)' }).first();
        await reloadedSelfCard.waitFor({ state: 'visible', timeout: 10000 });
        await reloadedSelfCard.click();

        // Verify our previously sent note is still in the chat
        await page.waitForSelector('.message-row', { hasText: noteText, timeout: 10000 });
        console.log('[PASS] Self conversation and notes persist across page reload');

        console.log('==================================================');
        console.log('ALL MESSAGE YOURSELF (NOTES TO SELF) TESTS PASSED! [SUCCESS]');
        console.log('==================================================');

    } finally {
        await browser.close();
    }
}

testMessageYourself().catch(err => {
    console.error('MESSAGE YOURSELF TEST FAILED:', err);
    process.exit(1);
});
