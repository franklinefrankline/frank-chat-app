const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runE2EPersistenceAndAttachments() {
    console.log('==================================================');
    console.log('STARTING PLAYWRIGHT E2E PERSISTENCE & ATTACHMENTS');
    console.log('==================================================');

    const browser = await chromium.launch({
        headless: true,
        args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error' || msg.text().includes('[DOCUMENTS]')) {
            console.log('[BROWSER]', msg.type(), msg.text());
        }
    });

    try {
        const uniqueSuffix = Date.now().toString(36);
        const regUser = `PermUser_${uniqueSuffix}`;
        const regEmail = `PermUser_${uniqueSuffix}@FrankChat.IO`;
        const regPass = 'SecurePass2026!';

        // 1. Permanent Account Registration
        console.log(`1. Registering user ${regUser} (${regEmail})...`);
        await page.goto('http://127.0.0.1:8000/register.html');
        await page.waitForSelector('#regUsername', { timeout: 10000 });
        await page.fill('#regFullName', 'Permanent User');
        await page.fill('#regUsername', regUser);
        await page.fill('#regEmail', regEmail);
        await page.fill('#regPassword', regPass);
        await page.fill('#regConfirmPassword', regPass);
        await page.check('#regTerms');
        await page.click('#registerSubmitBtn');

        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        console.log('[PASS] 1. User registered and redirected to dashboard');

        // Dismiss loader if present
        await page.evaluate(() => {
            const loader = document.getElementById('appLoadingScreen');
            if (loader) loader.remove();
        });

        // 2. Verify FRANK ID is 6 characters
        const frankId = await page.evaluate(() => {
            const user = (window.auth && window.auth.getUser()) || JSON.parse(localStorage.getItem('chatapp_user') || '{}');
            return user.frank_id;
        });
        console.log(`2. Retrieved FRANK ID: ${frankId}`);
        if (!frankId || frankId.length !== 6 || !/^[A-Z0-9]{6}$/.test(frankId)) {
            throw new Error(`Invalid FRANK ID: ${frankId}`);
        }
        console.log('[PASS] 2. FRANK ID is 6 characters uppercase alphanumeric');

        // 3. Open Message Yourself conversation
        console.log('3. Opening Message Yourself conversation via New Chat modal...');
        await page.waitForSelector('#newChatModalBtn', { timeout: 10000 });
        await page.click('#newChatModalBtn');
        await page.waitForSelector('#newChatModal.open', { state: 'visible', timeout: 5000 });
        await page.click('#newChatSelfCard');
        await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
        await page.waitForTimeout(1000);
        console.log('[PASS] 3. Chat opened');

        // 4. Create and stage a sample test document
        console.log('4. Staging document attachment...');
        const tempDocPath = path.join(__dirname, 'test_attachment.txt');
        fs.writeFileSync(tempDocPath, 'Hello FRANK permanent persistence test document content!');

        const fileInput = page.locator('#frankDocInput');
        await fileInput.setInputFiles(tempDocPath);

        // Verify attachment tray becomes visible
        await page.waitForSelector('#composerAttachmentTray', { state: 'visible', timeout: 5000 });
        const stagedName = await page.locator('#trayFilename').textContent();
        console.log(`[PASS] 4. Attachment tray visible with file: ${stagedName.trim()}`);

        // 5. Send staged document
        console.log('5. Clicking Send on attachment tray...');
        await page.click('#traySendBtn');

        // Wait for upload and message card to appear
        await page.waitForSelector('.message-document-card', { state: 'visible', timeout: 10000 });
        console.log('[PASS] 5. Document message card rendered in chat container');

        // 6. Test the Open button
        console.log('6. Clicking Open button on document card...');
        const openBtn = page.locator('.message-document-card .msg-doc-open-btn').last();
        await openBtn.click();

        // 7. Verify modal opens and becomes visible
        await page.waitForSelector('#attachmentViewerModal.open', { state: 'visible', timeout: 5000 });
        const modalTitle = await page.locator('#attachmentViewerTitle').textContent();
        console.log(`[PASS] 7. Attachment viewer modal opened with title: "${modalTitle.trim()}"`);

        // Close viewer modal
        await page.click('#closeAttachmentViewerBtn');
        await page.waitForTimeout(500);

        // 8. Log out
        console.log('8. Logging out...');
        await page.evaluate(() => {
            if (window.auth) window.auth.logout();
            else window.location.href = 'login.html';
        });
        await page.waitForURL(url => url.pathname.endsWith('login.html'), { timeout: 10000 });
        console.log('[PASS] 8. Successfully logged out');

        // 9. Case-insensitive login with lowercase email
        console.log(`9. Logging back in with lowercase email: ${regEmail.toLowerCase()}...`);
        await page.waitForSelector('#loginUsername', { timeout: 10000 });
        await page.fill('#loginUsername', regEmail.toLowerCase());
        await page.fill('#loginPassword', regPass);
        await page.click('#loginSubmitBtn');

        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        console.log('[PASS] 9. Case-insensitive email login succeeded permanently');

        // Clean up temp file
        if (fs.existsSync(tempDocPath)) fs.unlinkSync(tempDocPath);

        console.log('==================================================');
        console.log('ALL E2E PERSISTENCE & ATTACHMENT TESTS PASSED! [SUCCESS]');
        console.log('==================================================');
        await browser.close();
        process.exit(0);

    } catch (err) {
        console.error('Test failed with error:', err);
        await browser.close();
        process.exit(1);
    }
}

runE2EPersistenceAndAttachments();
