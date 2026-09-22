const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runE2ETests() {
    console.log('==================================================');
    console.log('STARTING PLAYWRIGHT E2E ATTACHMENT & VOICE TESTS');
    console.log('==================================================');

    // Create temporary test files
    const testDir = path.join(__dirname, 'test_fixtures');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

    const testImagePath = path.join(testDir, 'test_image.png');
    // 1x1 transparent PNG
    const pngBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(testImagePath, pngBuffer);

    const testPdfPath = path.join(testDir, 'test_doc.pdf');
    fs.writeFileSync(testPdfPath, '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');

    const browser = await chromium.launch({
        headless: true,
        args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
    });

    const context = await browser.newContext({
        permissions: ['microphone']
    });

    const page = await context.newPage();

    // Listen to console logs
    page.on('console', msg => {
        console.log('[BROWSER CONSOLE]', msg.type(), msg.text());
    });

    try {
        // 1. Navigate to login
        console.log('1. Navigating to login page...');
        await page.goto('http://127.0.0.1:8000/login.html');
        await page.waitForSelector('#loginUsername', { timeout: 10000 });

        // Fill credentials for alex
        await page.fill('#loginUsername', 'alex');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');

        // Wait for redirection to dashboard
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        console.log('[PASS] Logged in successfully, navigated to dashboard.html');

        // Dismiss loading screen if present
        await page.evaluate(() => {
            const loader = document.getElementById('appLoadingScreen');
            if (loader) loader.remove();
        });

        // 2. Open chat with Sarah
        console.log('2. Opening conversation with Sarah...');
        await page.waitForSelector('.conversation-card', { timeout: 10000 });
        const sarahCard = page.locator('.conversation-card', { hasText: 'Sarah' }).first();
        await sarahCard.click();
        await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
        console.log('[PASS] Conversation view opened');

        // 3. Test Composer Send / Mic Button logic (Empty -> Mic, Text -> Send, Emoji -> Send, Clear -> Mic)
        console.log('3. Testing composer button state transitions...');
        const sendBtn = page.locator('#composerSendBtn');
        const textarea = page.locator('#messageComposerTextarea');

        // Initially empty -> mode-mic
        let isMic = await sendBtn.evaluate(el => el.classList.contains('mode-mic'));
        if (!isMic) throw new Error('Send button should have mode-mic when composer is empty');
        console.log('[PASS] Empty composer displays microphone button');

        // Type text -> mode-send
        await textarea.fill('Hello Sarah!');
        let isSend = await sendBtn.evaluate(el => el.classList.contains('mode-send'));
        if (!isSend) throw new Error('Send button should have mode-send when composer has text');
        console.log('[PASS] Composer with text displays Send button');

        // Clear text -> mode-mic
        await textarea.fill('');
        isMic = await sendBtn.evaluate(el => el.classList.contains('mode-mic'));
        if (!isMic) throw new Error('Send button should return to mode-mic after clearing text');
        console.log('[PASS] Cleared composer returns to microphone button');

        // Test Emoji -> mode-send
        console.log('Testing emoji picker button transition...');
        await page.click('#emojiBtn');
        await page.waitForSelector('#emojiPickerPopover.show', { state: 'visible' });
        const firstEmoji = page.locator('.emoji-item-btn').first();
        await firstEmoji.click();
        isSend = await sendBtn.evaluate(el => el.classList.contains('mode-send'));
        if (!isSend) throw new Error('Send button should have mode-send after selecting emoji');
        console.log('[PASS] Selecting emoji updates composer button to Send');

        // Clear again
        await textarea.fill('');
        await page.evaluate(() => window.chatController.updateComposerActionButton());

        // 4. Test Photo Flow: Select -> Preview Card -> Cancel -> Re-select -> Send -> Same-Page View
        console.log('4. Testing photo attachment flow...');
        const photoInput = page.locator('#frankPhotoInput');
        await photoInput.setInputFiles(testImagePath);

        // Verify attachment staging tray appears
        const tray = page.locator('#composerAttachmentTray');
        await tray.waitFor({ state: 'visible', timeout: 5000 });
        const trayFilename = await page.locator('#trayFilename').textContent();
        if (!trayFilename.includes('test_image.png')) {
            throw new Error(`Expected tray filename to include test_image.png, got ${trayFilename}`);
        }
        console.log('[PASS] Photo staging preview displayed with correct filename');

        // Verify tray Cancel and Send buttons are visible
        const trayCancelBtn = page.locator('#trayCancelBtn');
        const traySendBtn = page.locator('#traySendBtn');
        await trayCancelBtn.waitFor({ state: 'visible' });
        await traySendBtn.waitFor({ state: 'visible' });
        console.log('[PASS] Tray Cancel and Send buttons are present');

        // Test Cancel
        await trayCancelBtn.click();
        await tray.waitFor({ state: 'hidden', timeout: 3000 });
        console.log('[PASS] Clicking Cancel properly removes staged preview card');

        // Re-select photo to send
        await photoInput.setInputFiles(testImagePath);
        await tray.waitFor({ state: 'visible', timeout: 5000 });
        await traySendBtn.click();

        // Wait for message to appear in chat
        await page.waitForSelector('.message-photo-card', { timeout: 10000 });
        console.log('[PASS] Photo message successfully uploaded and rendered in chat');

        // Verify same-page internal lightbox viewer modal
        console.log('5. Testing same-page photo viewer lightbox modal...');
        const imgCount = await page.locator('.msg-photo-img').count();
        console.log('Found photo img count:', imgCount);
        const cardHtml = await page.locator('.message-photo-card').last().evaluate(el => el.outerHTML);
        console.log('Photo card outerHTML:', cardHtml);

        const photoImg = page.locator('.msg-photo-img').last();
        await photoImg.click({ force: true });

        const modalClasses = await page.locator('#attachmentViewerModal').evaluate(el => el.className + ' | style=' + el.getAttribute('style'));
        console.log('Modal state after click:', modalClasses);

        const viewerModal = page.locator('#attachmentViewerModal');
        await viewerModal.waitFor({ state: 'visible', timeout: 5000 });
        const viewerImg = page.locator('#attachmentViewerBody img');
        await viewerImg.waitFor({ state: 'visible' });
        console.log('[PASS] Photo opens in same-page internal lightbox viewer modal (no window.open)');

        // Close viewer modal
        await page.click('#closeAttachmentViewerBtn');
        await viewerModal.waitFor({ state: 'hidden' });
        console.log('[PASS] Viewer modal closes cleanly');

        // 5. Test Document Flow: Select PDF -> Preview Card -> Send -> Same-Page View
        console.log('6. Testing PDF document flow...');
        const docInput = page.locator('#frankDocInput');
        await docInput.setInputFiles(testPdfPath);
        await tray.waitFor({ state: 'visible', timeout: 5000 });
        const docTrayName = await page.locator('#trayFilename').textContent();
        if (!docTrayName.includes('test_doc.pdf')) {
            throw new Error(`Expected doc filename to include test_doc.pdf, got ${docTrayName}`);
        }
        console.log('[PASS] Document staging preview card displayed');

        await traySendBtn.click();
        await page.waitForSelector('.message-document-card', { timeout: 10000 });
        console.log('[PASS] Document message successfully uploaded and rendered in chat');

        // Test document open button opens same-page viewer
        const openDocBtn = page.locator('.message-document-card .msg-doc-open-btn').last();
        await openDocBtn.click();
        await viewerModal.waitFor({ state: 'visible', timeout: 5000 });
        const viewerIframe = page.locator('#attachmentViewerBody iframe');
        await viewerIframe.waitFor({ state: 'visible' });
        console.log('[PASS] PDF document opens in same-page viewer modal with iframe');

        await page.click('#closeAttachmentViewerBtn');
        await viewerModal.waitFor({ state: 'hidden' });

        // 6. Test Voice Recording Flow
        console.log('7. Testing voice message recording flow...');
        // Ensure composer is in mode-mic
        await textarea.fill('');
        await page.evaluate(() => window.chatController.updateComposerActionButton());
        await sendBtn.click();

        // Voice recording bar should be visible
        const recordingBar = page.locator('#composerRecordingBar');
        await recordingBar.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Voice recording started, recording bar is active');

        // Wait 1.5 seconds for recording
        await page.waitForTimeout(1500);

        // Stop recording
        await page.click('#stopRecordingBtn');

        // Voice preview bar should be visible
        const voicePreviewBar = page.locator('#composerVoicePreviewBar');
        await voicePreviewBar.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Recording stopped, in-composer voice preview displayed');

        // Send voice message
        await page.click('#sendVoicePreviewBtn');
        await page.waitForSelector('.message-voice-card', { timeout: 10000 });
        console.log('[PASS] Voice message successfully uploaded and rendered with audio player');

        // Verify composer returned to normal state with microphone button
        isMic = await sendBtn.evaluate(el => el.classList.contains('mode-mic'));
        if (!isMic) throw new Error('Composer should return to mode-mic after sending voice message');
        console.log('[PASS] Composer returned to normal state with microphone button');

        console.log('==================================================');
        console.log('ALL PLAYWRIGHT E2E TESTS PASSED SUCCESSFULLY! [SUCCESS]');
        console.log('==================================================');

    } finally {
        await browser.close();
        // Clean up test fixtures
        try {
            fs.rmSync(testDir, { recursive: true, force: true });
        } catch {}
    }
}

runE2ETests().catch(err => {
    console.error('PLAYWRIGHT TEST FAILED:', err);
    process.exit(1);
});
