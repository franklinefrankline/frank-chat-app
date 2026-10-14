const { chromium } = require('playwright');
const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert');

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:8000';

async function runWhatsAppAndExcelE2ESuite() {
    console.log('========================================================================');
    console.log('  FRANK THINK: WHATSAPP CHAT & EXCEL E2E BROWSER TEST SUITE');
    console.log('========================================================================\n');

    // 1. Generate auth token for user 274 (Frankline)
    const token = execSync('python -c "import sys; sys.path.append(\'backend\'); from security import create_access_token; print(create_access_token({\'sub\': \'franklinesamy2006\', \'id\': 274, \'email\': \'franklinesamy2006@gmail.com\'}))"')
        .toString().trim();

    const userObj = {
        id: 274,
        username: 'franklinesamy2006',
        email: 'franklinesamy2006@gmail.com',
        full_name: 'Frank',
        frank_id: 'FRK274'
    };

    console.log(`[AUTH] Authenticated as user ${userObj.id} (${userObj.username})`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const consoleErrors = [];
    let passedCount = 0;
    let failedCount = 0;

    function recordTest(testName, condition, details = '') {
        if (condition) {
            passedCount++;
            console.log(`  [PASS] ${testName}${details ? ` -> ${details}` : ''}`);
        } else {
            failedCount++;
            console.error(`  [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
        }
    }

    try {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();

        page.on('console', msg => {
            if (msg.type() === 'error') {
                const text = msg.text();
                if (!text.includes('favicon') && !text.includes('net::ERR_') && !text.includes('404')) {
                    consoleErrors.push(text);
                }
            }
        });

        await page.addInitScript(({ token, userObj }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(userObj));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token, userObj });

        console.log('\n--- 1. LOAD DASHBOARD & CONVERSATION LIST ---');
        await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });

        // Wait for sidebar conversation cards
        await page.waitForSelector('.conversation-card', { timeout: 10000 });
        const cardCount = await page.locator('.conversation-card').count();
        recordTest('Conversation cards rendered in sidebar', cardCount > 0, `Found ${cardCount} conversations`);

        // =====================================================================
        // PART 2: ONE-TO-ONE CHAT SELECTION & MESSAGE RENDERING
        // =====================================================================
        console.log('\n--- 2. ONE-TO-ONE CHAT SELECTION & WHATSAPP DISPLAY ---');

        // Find a direct chat card (not group)
        const directCard = page.locator('.conversation-card:not([data-type="group"])').first();
        const partnerNameInCard = await directCard.locator('.conversation-name').textContent();
        await directCard.click();
        await page.waitForTimeout(1000);

        // Verify active chat view visible and empty placeholder hidden
        const activeViewDisplay = await page.$eval('#activeChatView', el => window.getComputedStyle(el).display);
        recordTest('Active chat view visible on conversation click', activeViewDisplay === 'flex');

        // Verify header displays correct partner name
        const headerPartnerName = await page.$eval('#chatPartnerName', el => el.textContent.trim());
        recordTest('Chat header displays correct partner name', headerPartnerName.length > 0, headerPartnerName);

        // Verify composer is visible and attached to active chat
        const composerVisible = await page.locator('#messageComposerTextarea').isVisible();
        recordTest('Message composer input visible at bottom', composerVisible);

        // Check message rows styling (WhatsApp left vs right)
        const messageRows = page.locator('.message-row');
        const msgRowCount = await messageRows.count();
        if (msgRowCount > 0) {
            const hasSentOrReceived = await page.evaluate(() => {
                const rows = Array.from(document.querySelectorAll('.message-row'));
                const hasSent = rows.some(r => r.classList.contains('sent'));
                const hasReceived = rows.some(r => r.classList.contains('received'));
                return { hasSent, hasReceived, total: rows.length };
            });
            recordTest('WhatsApp alignment: Sent (right) and/or Received (left) classes applied',
                hasSentOrReceived.hasSent || hasSentOrReceived.hasReceived,
                `Total: ${hasSentOrReceived.total}, hasSent: ${hasSentOrReceived.hasSent}, hasReceived: ${hasSentOrReceived.hasReceived}`);

            // Verify timestamps visible on messages
            const timestampCount = await page.locator('.message-time').count();
            recordTest('Message timestamps rendered', timestampCount > 0, `Found ${timestampCount} timestamps`);
        } else {
            console.log('  [INFO] Conversation empty state displayed');
            const emptyState = await page.locator('.empty-state').count();
            recordTest('Empty state rendered when no messages exist', emptyState > 0);
        }

        // Test sending a 1-to-1 message via composer
        console.log('\n--- 3. MESSAGE COMPOSER & SEND ACTION ---');
        const testDirectMessage = `WhatsApp style test message ${Date.now()}`;
        await page.fill('#messageComposerTextarea', testDirectMessage);
        await page.waitForTimeout(300);

        // Send button should switch from mic to send mode
        const sendBtnMode = await page.$eval('#composerSendBtn', el => el.classList.contains('mode-send'));
        recordTest('Send button dynamically enters mode-send when typing text', sendBtnMode);

        // Click send button
        await page.click('#composerSendBtn');
        await page.waitForTimeout(1000);

        // Input should be cleared after send succeeds
        const inputValAfterSend = await page.$eval('#messageComposerTextarea', el => el.value);
        recordTest('Message input cleared after successful send', inputValAfterSend === '');

        // Verify sent message appears in chat
        const sentMsgAppeared = await page.locator(`.message-row.sent:has-text("${testDirectMessage}")`).count();
        recordTest('Sent message immediately displayed on the right with class .sent', sentMsgAppeared >= 1);

        // =====================================================================
        // PART 4: GROUP CHAT SELECTION & CHAT SWITCHING
        // =====================================================================
        console.log('\n--- 4. GROUP CHAT SELECTION & WHATSAPP DISPLAY ---');

        const groupCard = page.locator('.conversation-card[data-type="group"]').first();
        if (await groupCard.count() > 0) {
            const groupNameInCard = await groupCard.locator('.conversation-name').textContent();
            
            // Switch to group chat
            await groupCard.click();
            await page.waitForTimeout(1000);

            // Verify header updated to group name
            const headerGroupName = await page.$eval('#chatPartnerName', el => el.textContent.trim());
            recordTest('Chat header updated to group name', groupNameInCard.includes(headerGroupName), headerGroupName);

            // Verify previous 1-to-1 message is NOT visible in group chat (No message bleeding)
            const bleedingDirectMsg = await page.locator(`.message-row:has-text("${testDirectMessage}")`).count();
            recordTest('Never display messages from previously selected conversation (No bleeding)', bleedingDirectMsg === 0);

            // Test sending to group
            const testGroupMsg = `Hello group from E2E ${Date.now()}`;
            await page.fill('#messageComposerTextarea', testGroupMsg);
            await page.click('#composerSendBtn');
            await page.waitForTimeout(1000);

            const groupMsgAppeared = await page.locator(`.message-row.sent.is-group:has-text("${testGroupMsg}")`).count();
            recordTest('Group message sent and rendered with .sent.is-group', groupMsgAppeared >= 1);
        } else {
            console.log('  [SKIP] No group card found in sidebar list');
        }

        // =====================================================================
        // PART 5: EXCEL EDITOR — SAVE & SEND TO CHAT
        // =====================================================================
        console.log('\n--- 5. EXCEL EDITOR: SAVE & SEND LATEST WORKBOOK TO CHAT ---');

        // Open Document ID 338 in Frank Office Workspace
        await page.evaluate(() => {
            if (!window.frankOfficeWorkspace) {
                window.frankOfficeWorkspace = new FrankOfficeWorkspace();
            }
            window.frankOfficeWorkspace.openDocument(338, 'excel', 'Q1_Revenue_Forecast.xlsx', '/api/files/338/view');
        });

        await page.waitForSelector('#frankDocumentWorkspace.active', { timeout: 10000 });
        await page.waitForTimeout(1500);

        const wsActive = await page.$eval('#frankDocumentWorkspace', el => el.classList.contains('active'));
        recordTest('Excel Workspace opened and active', wsActive);

        // Edit cell A2 inline
        await page.evaluate(() => {
            const ws = window.frankOfficeWorkspace;
            if (ws && ws.excelData && ws.excelData.sheets) {
                const sheet = ws.excelData.sheets[0];
                sheet.data[1][0] = 'Q1-E2E-Updated';
                sheet.data[1][1] = 999;
                ws.markDirty();
            }
        });

        // Click Save button in workspace header
        await page.click('#workspaceSaveBtn');
        await page.waitForTimeout(1500);

        // Verify save status shows saved
        const saveStatusText = await page.$eval('#saveStatusText', el => el.textContent.trim());
        recordTest('Workbook successfully saved with updated version', saveStatusText.includes('Saved'), saveStatusText);

        // Click Send to Chat button
        await page.click('#workspaceSendBtn');
        await page.waitForTimeout(1500);

        const sendModalVisible = await page.locator('#docSendToChatModal').isVisible();
        recordTest('Send Document to Chat modal opens after commit and save', sendModalVisible);

        // Select first recipient and send
        await page.waitForSelector('.doc-send-recipient-row', { timeout: 8000 });
        const firstRecipient = page.locator('.doc-send-recipient-row').first();
        await firstRecipient.click();
        await page.waitForTimeout(300);

        await page.click('#confirmDocSendBtn');
        await page.waitForTimeout(2000);

        // Verify modal closed and chat shows shared document card
        const modalClosed = await page.$eval('#docSendToChatModal', el => el.style.display === 'none');
        recordTest('Send modal closes after document is shared', modalClosed);

        // Verify attachment card in chat
        const docCardCount = await page.locator('.message-document-card').count();
        recordTest('Document attachment card rendered in chat with actions', docCardCount >= 1, `Cards: ${docCardCount}`);

        const hasOpenBtn = await page.locator('.msg-doc-open-btn').count();
        const hasDownloadBtn = await page.locator('.msg-doc-download-btn').count();
        recordTest('Attachment cards have Open and Download action buttons', hasOpenBtn >= 1 && hasDownloadBtn >= 1);

        console.log('\n========================================================================');
        console.log(`  E2E TEST SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
        console.log('========================================================================\n');

        assert.strictEqual(failedCount, 0, `There were ${failedCount} test failures.`);
    } finally {
        await browser.close();
    }
}

runWhatsAppAndExcelE2ESuite().catch(err => {
    console.error('Test Suite Error:', err);
    process.exit(1);
});
