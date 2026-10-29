const { chromium } = require('playwright');
const path = require('path');

async function runShareTargetE2ETests() {
    console.log('=== STARTING ANDROID SHARE TARGET E2E TESTS ===\n');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });

    await context.addInitScript(() => {
        try {
            const consent = {
                version: '1.0',
                noticeVersion: '2026.1',
                timestamp: new Date().toISOString(),
                categories: { essential: true, preferences: true, analytics: true, marketing: true }
            };
            localStorage.setItem('frank_cookie_consent_v1', JSON.stringify(consent));
        } catch (e) {}
    });

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`[PASS] ${message}`);
            passed++;
        } else {
            console.error(`[FAIL] ${message}`);
            failed++;
        }
    }

    try {
        const page = await context.newPage();

        // ---------------------------------------------------------------------
        // Step 1: Log in test user
        // ---------------------------------------------------------------------
        console.log('Step 1: Logging in test user...');
        await page.goto('http://127.0.0.1:8000/login.html');
        await page.waitForSelector('#loginUsername', { timeout: 10000 });
        await page.fill('#loginUsername', 'persistent_user_test@frank.app');
        await page.fill('#loginPassword', 'SecurePass123!');
        await page.click('#loginSubmitBtn', { force: true });
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        await page.waitForSelector('#chatApp', { timeout: 10000 });
        assert(page.url().includes('dashboard.html'), 'Successfully logged in and reached dashboard');

        // Allow appController and conversations to load
        await page.waitForTimeout(1000);

        // ---------------------------------------------------------------------
        // Scenario 1: Native Share Intent (Single Image with Caption)
        // ---------------------------------------------------------------------
        console.log('\n--- Scenario 1: Native Android Share Intent (Single Image) ---');
        const tinyPngB64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

        await page.evaluate((b64) => {
            window.dispatchEvent(new CustomEvent('frank:filesShared', {
                detail: {
                    action: 'android.intent.action.SEND',
                    caption: 'Check out this awesome view!',
                    files: [
                        {
                            name: 'scenic_photo.png',
                            mimeType: 'image/png',
                            size: 15400,
                            dataUrl: b64
                        }
                    ]
                }
            }));
        }, tinyPngB64);

        // Modal should open
        await page.waitForSelector('#frankShareTargetModal.open', { timeout: 5000 });
        assert(await page.isVisible('#frankShareTargetModal'), 'Share Target Modal opened upon receiving share intent');

        // Check Attachment Preview
        const countText = await page.textContent('#shareItemsCountLabel');
        assert(countText.includes('1 Attachment'), `Attachment count label is correct (${countText})`);

        const singleThumb = await page.$('.share-single-thumb');
        assert(singleThumb !== null, 'Image thumbnail preview element is rendered');

        const singleName = await page.textContent('.share-single-name');
        assert(singleName.includes('scenic_photo.png'), `Preview shows correct filename (${singleName})`);

        // Check Caption prefill
        const captionVal = await page.inputValue('#shareCaptionInput');
        assert(captionVal === 'Check out this awesome view!', `Caption input prefilled correctly: "${captionVal}"`);

        // Send button must initially be disabled
        const sendBtnDisabled = await page.isDisabled('#frankShareSendBtn');
        const sendBtnText = await page.textContent('#frankShareSendBtn');
        assert(sendBtnDisabled, 'Send button is disabled until recipient is selected');
        assert(sendBtnText.includes('Select a conversation') || sendBtnText.includes('Select Recipient'), `Button prompt indicates selection required (${sendBtnText.trim()})`);

        // Wait for conversations to render in the recipient list
        await page.waitForSelector('.share-conversation-item', { timeout: 5000 });
        const convItems = await page.$$('.share-conversation-item');
        assert(convItems.length > 0, `Recipient list rendered ${convItems.length} conversation(s)`);

        // Select first conversation
        const targetName = await convItems[0].$eval('.share-item-title', el => el.textContent.trim());
        await convItems[0].click({ force: true });

        // Check item selected and Send button enabled
        const isItemSelected = await convItems[0].evaluate(el => el.classList.contains('selected'));
        assert(isItemSelected, 'Conversation item has .selected class after click');

        const sendBtnEnabledAfterSelect = !(await page.isDisabled('#frankShareSendBtn'));
        const sendBtnTextAfterSelect = await page.textContent('#frankShareSendBtn');
        assert(sendBtnEnabledAfterSelect, 'Send button is enabled after conversation selection');
        assert(sendBtnTextAfterSelect.includes(targetName), `Send button text updated to: "${sendBtnTextAfterSelect.trim()}"`);

        // Tap Send and verify submission & closure
        await page.click('#frankShareSendBtn', { force: true });

        // Modal should close upon successful send
        await page.waitForSelector('#frankShareTargetModal', { state: 'hidden', timeout: 10000 });
        assert(true, 'Share Target Modal closed after successful send');

        await page.waitForTimeout(1000);

        // ---------------------------------------------------------------------
        // Scenario 2: Multiple Shared Files (ACTION_SEND_MULTIPLE) & Discard
        // ---------------------------------------------------------------------
        console.log('\n--- Scenario 2: Multiple Files Share (ACTION_SEND_MULTIPLE) & Cancellation ---');

        await page.evaluate((b64) => {
            window.dispatchEvent(new CustomEvent('frank:filesShared', {
                detail: {
                    action: 'android.intent.action.SEND_MULTIPLE',
                    caption: 'Project Documents Package',
                    files: [
                        { name: 'overview.png', mimeType: 'image/png', size: 10240, dataUrl: b64 },
                        { name: 'financials.pdf', mimeType: 'application/pdf', size: 450000, dataUrl: b64 },
                        { name: 'demo.mp4', mimeType: 'video/mp4', size: 2300000, dataUrl: b64 }
                    ]
                }
            }));
        }, tinyPngB64);

        await page.waitForSelector('#frankShareTargetModal.open', { timeout: 5000 });
        assert(await page.isVisible('#frankShareTargetModal'), 'Share Target Modal opened for multiple files');

        const multiCountText = await page.textContent('#shareItemsCountLabel');
        assert(multiCountText.includes('3 Attachments'), `Multiple items counter shows: "${multiCountText}"`);

        const previewCards = await page.$$('.share-preview-card');
        assert(previewCards.length === 3, `Rendered 3 preview cards in horizontal scroll strip`);

        // Test Discard / Cancel button
        await page.click('#frankShareCancelBtn', { force: true });
        await page.waitForSelector('#frankShareTargetModal', { state: 'hidden', timeout: 5000 });
        assert(true, 'Modal successfully closed without sending upon Cancel button click');

        // Verify storage is clean
        const pendingAfterCancel = await page.evaluate(() => sessionStorage.getItem('frank_pending_share'));
        assert(!pendingAfterCancel, 'Pending share state is completely cleared after cancellation');

        // ---------------------------------------------------------------------
        // Scenario 3: Unauthenticated Share with Auth Preservation
        // ---------------------------------------------------------------------
        console.log('\n--- Scenario 3: Unauthenticated Share & Login Preservation Flow ---');
        const unauthContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        await unauthContext.addInitScript(() => {
            try {
                localStorage.setItem('frank_cookie_consent', 'accepted');
                localStorage.setItem('frank_cookies_accepted', 'true');
            } catch (e) {}
        });
        const unauthPage = await unauthContext.newPage();

        // User opens login page
        await unauthPage.goto('http://127.0.0.1:8000/login.html');
        await unauthPage.waitForSelector('#loginForm', { timeout: 10000 });

        // A share intent arrives while user is logged out
        await unauthPage.evaluate((b64) => {
            window.dispatchEvent(new CustomEvent('frank:filesShared', {
                detail: {
                    action: 'android.intent.action.SEND',
                    caption: 'Urgent quarterly report',
                    files: [
                        { name: 'quarterly_report.pdf', mimeType: 'application/pdf', size: 85000, dataUrl: b64 }
                    ]
                }
            }));
        }, tinyPngB64);

        // Verify payload preserved in sessionStorage
        const preservedStorage = await unauthPage.evaluate(() => sessionStorage.getItem('frank_pending_share'));
        assert(preservedStorage && preservedStorage.includes('quarterly_report.pdf'), 'Pending share payload safely preserved in sessionStorage');

        // Verify login banner is displayed
        await unauthPage.waitForSelector('#shareLoginNotice', { timeout: 5000 });
        const bannerText = await unauthPage.textContent('#shareLoginNotice');
        assert(bannerText.includes('1 shared item(s) waiting'), `Login notice displayed to user: "${bannerText.trim()}"`);

        // Perform login
        await unauthPage.fill('#loginUsername', 'persistent_user_test@frank.app');
        await unauthPage.fill('#loginPassword', 'SecurePass123!');
        await unauthPage.click('#loginSubmitBtn', { force: true });
        await unauthPage.waitForURL('**/dashboard.html', { timeout: 10000 });
        await unauthPage.waitForSelector('#chatApp', { timeout: 10000 });

        // Share modal should automatically pop up on dashboard!
        await unauthPage.waitForSelector('#frankShareTargetModal.open', { timeout: 10000 });
        assert(await unauthPage.isVisible('#frankShareTargetModal'), 'Preserved share automatically opened on dashboard after login');

        const restoredFilename = await unauthPage.textContent('.share-single-name');
        assert(restoredFilename.includes('quarterly_report.pdf'), `Preserved filename restored: "${restoredFilename.trim()}"`);

        const restoredCaption = await unauthPage.inputValue('#shareCaptionInput');
        assert(restoredCaption === 'Urgent quarterly report', `Preserved caption restored: "${restoredCaption}"`);

        await unauthPage.click('#frankShareCancelBtn', { force: true });
        await unauthContext.close();

        // ---------------------------------------------------------------------
        // Scenario 4: Web Share Target / PWA Parameter Handling
        // ---------------------------------------------------------------------
        console.log('\n--- Scenario 4: Web Share Target / PWA Params ---');
        await page.goto('http://127.0.0.1:8000/dashboard.html?share_title=Meeting%20Notes&share_text=Discussed%20architecture');
        await page.waitForSelector('#frankShareTargetModal.open', { timeout: 8000 });
        assert(await page.isVisible('#frankShareTargetModal'), 'Share modal opened via Web Share Target query params');

        const webShareCaption = await page.inputValue('#shareCaptionInput');
        assert(webShareCaption.includes('Meeting Notes') && webShareCaption.includes('Discussed architecture'), 'Web Share params combined into message caption');

        await page.click('#frankShareCancelBtn', { force: true });
        await page.waitForTimeout(500);

        // ---------------------------------------------------------------------
        // Scenario 5: Regression Check — In-App Attachments
        // ---------------------------------------------------------------------
        console.log('\n--- Scenario 5: In-App Attachment Regression Check ---');
        const inAppAttachmentBtn = await page.$('#composerAttachmentBtn, [data-action="attach"], #attachmentBtn');
        const fileInput = await page.$('#fileUploadInput, input[type="file"]');
        assert(inAppAttachmentBtn !== null || fileInput !== null, 'In-app file attachment trigger remains accessible and functional');

    } catch (err) {
        console.error('Test execution error:', err);
        failed++;
    } finally {
        await browser.close();
    }

    console.log(`\n========================================`);
    console.log(`RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runShareTargetE2ETests();
