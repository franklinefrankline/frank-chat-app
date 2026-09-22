const { chromium } = require('playwright');

(async () => {
    console.log('Launching browser to test live Vercel dashboard at https://frank-chat-app.vercel.app...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    page.on('console', msg => console.log('[BROWSER]', msg.type(), msg.text()));
    page.on('pageerror', err => console.log('[PAGE ERROR]', err.message));

    try {
        const unique = Math.random().toString(36).substring(2, 8);
        const username = `live_e2e_${unique}`;
        const email = `live_${unique}@frankchat.test`;

        await page.goto('https://frank-chat-app.vercel.app/register.html', { waitUntil: 'networkidle' });
        console.log('Opened register page');

        await page.fill('#regFullName', 'Live E2E Tester');
        await page.fill('#regUsername', username);
        await page.fill('#regEmail', email);
        await page.fill('#regPassword', 'Password123!');
        await page.fill('#regConfirmPassword', 'Password123!');
        await page.click('#agreeTerms');
        await page.click('#registerSubmitBtn');

        await page.waitForURL('**/dashboard.html', { timeout: 20000 });
        console.log('[PASS] Registered and navigated to live dashboard');

        // Wait for page to initialize
        await page.waitForTimeout(2000);

        // Click new chat or select contact
        const newChatBtn = await page.$('#newChatBtn, [data-open-modal="newChatModal"]');
        if (newChatBtn) {
            await newChatBtn.click();
            await page.waitForSelector('#newChatModal.open, .new-chat-user-item', { timeout: 5000 });
            const userItem = await page.$('.new-chat-user-item');
            if (userItem) {
                await userItem.click();
                console.log('Started chat from new chat modal');
            }
        }

        // Wait for composer
        await page.waitForSelector('#mainComposerBar', { timeout: 10000 });

        // Trigger file input upload with a test text document
        const fileInput = await page.$('#frankDocInput');
        if (fileInput) {
            await fileInput.setInputFiles({
                name: 'live_test_report.txt',
                mimeType: 'text/plain',
                buffer: Buffer.from('Testing live attachment upload on Vercel!')
            });
            console.log('Set file input files');

            // Wait for composer attachment tray
            await page.waitForSelector('#composerAttachmentTray', { state: 'visible', timeout: 8000 });
            console.log('[PASS] Composer attachment tray is visible');

            // Click send button
            await page.click('#traySendBtn');
            console.log('Clicked Send button in tray');

            // Wait for message card to appear
            await page.waitForSelector('.message-document-card', { timeout: 15000 });
            console.log('[PASS] Document message card rendered in chat container');

            // Find and click the open button
            const openBtn = await page.$('.msg-doc-open-btn');
            if (openBtn) {
                await openBtn.click();
                console.log('Clicked Open button on document');

                await page.waitForSelector('#attachmentViewerModal.open', { timeout: 5000 });
                console.log('[PASS] Attachment viewer modal opened with class "open"!');

                const modalTitle = await page.$eval('#attachmentViewerTitle', el => el.textContent);
                console.log('Modal title is:', modalTitle);
            }
        }

        console.log('==================================================');
        console.log('LIVE BROWSER E2E TEST COMPLETED SUCCESSFULLY!');
        console.log('==================================================');
    } catch (e) {
        console.error('Test error:', e);
        await page.screenshot({ path: 'tests/live_browser_error.png' });
    } finally {
        await browser.close();
    }
})();
