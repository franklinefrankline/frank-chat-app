const { chromium } = require('playwright');
const path = require('path');
const { execSync } = require('child_process');
const assert = require('assert');

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:8000';

async function runExcelSendToChatSuite() {
    console.log('========================================================================');
    console.log('  FRANK THINK EXCEL — SEND TO CHAT & SEND DOCUMENT E2E TEST SUITE');
    console.log('========================================================================\n');

    // 1. Generate auth token for user 274 (Frankline)
    const token = execSync('python -c "import sys; sys.path.append(\'backend\'); from security import create_access_token; print(create_access_token({\'sub\': \'franklinesamy2006\', \'id\': 274, \'email\': \'franklinesamy2006@gmail.com\'}))"')
        .toString().trim();

    const userObj = {
        id: 274,
        username: 'franklinesamy2006',
        email: 'franklinesamy2006@gmail.com',
        full_name: 'Frankline Samy',
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

        console.log('\n--- 1. MOUNT DASHBOARD & OPEN EXCEL EDITOR ---');
        await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });

        // Open Excel Workbook (fileId: 328)
        const testFilename = '2301 to 2400  (1).xlsx';
        await page.evaluate(({ fileId, fileType, filename }) => {
            if (!window.frankOfficeWorkspace) {
                window.frankOfficeWorkspace = new FrankOfficeWorkspace();
            }
            const viewUrl = `/api/files/${fileId}/view`;
            window.frankOfficeWorkspace.openDocument(fileId, fileType, filename, viewUrl);
        }, { fileId: 328, fileType: 'excel', filename: testFilename });

        await page.waitForSelector('#frankDocumentWorkspace.active', { timeout: 10000 });
        await page.waitForTimeout(1500);

        const isWorkspaceActive = await page.$eval('#frankDocumentWorkspace', el => el.classList.contains('active'));
        recordTest('Excel Workspace opened and active', isWorkspaceActive);

        // Verify toolbar Send to Chat button
        const sendBtn = page.locator('#workspaceSendBtn');
        const sendBtnVisible = await sendBtn.isVisible();
        const sendBtnText = await sendBtn.textContent();
        recordTest('Toolbar Send to Chat button visible', sendBtnVisible && sendBtnText.includes('Send to Chat'));

        // =====================================================================
        // PART 2 — TOOLBAR BUTTON & MODAL OPENING
        // =====================================================================
        console.log('\n--- 2. TOOLBAR BUTTON & MODAL OPENING ---');

        // Click Send to Chat
        await sendBtn.click();
        const sendModal = page.locator('#docSendToChatModal');
        await sendModal.waitFor({ state: 'visible', timeout: 5000 });
        const modalDisplay = await sendModal.evaluate(el => window.getComputedStyle(el).display);
        recordTest('Send Document to Chat modal opens on click', modalDisplay === 'flex');

        // Verify z-index above spreadsheet
        const zIndex = await sendModal.evaluate(el => parseInt(window.getComputedStyle(el).zIndex, 10));
        recordTest('Modal z-index is higher than workspace (10050)', zIndex >= 10050, `zIndex: ${zIndex}`);

        // Verify workbook metadata displayed
        const docNameEl = page.locator('#docSendDocName');
        const docNameText = await docNameEl.textContent();
        recordTest('Correct workbook filename displayed in modal header', docNameText.includes(testFilename), docNameText);

        const docMetaEl = page.locator('#docSendDocMeta');
        const docMetaText = await docMetaEl.textContent();
        recordTest('Workbook metadata displayed', docMetaText.length > 0, docMetaText);

        // Confirm recipients load from backend
        await page.waitForSelector('.doc-send-recipient-row', { timeout: 8000 });
        const recipientRows = page.locator('.doc-send-recipient-row');
        const count = await recipientRows.count();
        recordTest('Eligible recipients loaded from backend', count >= 1, `Found ${count} recipients`);

        // Confirm Send Document button is disabled initially
        const confirmBtn = page.locator('#confirmDocSendBtn');
        const initialDisabled = await confirmBtn.isDisabled();
        recordTest('Send Document button disabled before selection', initialDisabled);

        // =====================================================================
        // PART 3 — RECIPIENT SEARCH & SELECTION
        // =====================================================================
        console.log('\n--- 3. RECIPIENT SEARCH & SELECTION ---');

        const searchInput = page.locator('#docSendRecipientSearch');

        // Search test: filter by group or user
        await searchInput.fill('Group');
        await page.waitForTimeout(300);
        const filteredGroupCount = await page.locator('.doc-send-recipient-row').count();
        recordTest('Search filters recipients by query', filteredGroupCount >= 1, `Found ${filteredGroupCount} matches for "Group"`);

        // Search test: no results
        await searchInput.fill('nonexistent_recipient_xyz_9999');
        await page.waitForTimeout(300);
        const emptyStateCount = await page.locator('.doc-send-empty-state').count();
        recordTest('Empty state rendered when no search results match', emptyStateCount >= 1);

        // Clear search
        await searchInput.fill('');
        await page.waitForTimeout(300);
        const restoredCount = await page.locator('.doc-send-recipient-row').count();
        recordTest('Search query reset restores all recipients', restoredCount === count);

        // Select first recipient
        const firstRow = page.locator('.doc-send-recipient-row').first();
        await firstRow.click();
        const isSelected = await firstRow.evaluate(el => el.classList.contains('selected'));
        const hasCheckmark = await firstRow.locator('span:has-text("✓")').count();
        recordTest('Selected recipient visually highlighted with checkmark', isSelected && hasCheckmark > 0);

        // Send Document button becomes enabled
        const enabledAfterSelect = await confirmBtn.isEnabled();
        recordTest('Send Document button enabled after recipient selected', enabledAfterSelect);

        // =====================================================================
        // PART 4 — DIALOG DISMISSAL (CLOSE, CANCEL, ESCAPE, BACKDROP)
        // =====================================================================
        console.log('\n--- 4. DIALOG CONTROLS & DISMISSAL TESTS ---');

        // Test Cancel button closes dialog without sending
        const cancelBtn = page.locator('#cancelDocSendBtn');
        await cancelBtn.click();
        await page.waitForTimeout(300);
        const isClosedCancel = await sendModal.evaluate(el => el.style.display === 'none');
        recordTest('Cancel button closes dialog', isClosedCancel);

        // Reopen dialog
        await sendBtn.click();
        await sendModal.waitFor({ state: 'visible', timeout: 5000 });

        // Test Close (X) button closes dialog
        const closeXBtn = page.locator('#closeDocSendModalBtn');
        await closeXBtn.click();
        await page.waitForTimeout(300);
        const isClosedX = await sendModal.evaluate(el => el.style.display === 'none');
        recordTest('Close (X) button closes dialog', isClosedX);

        // Reopen dialog and test Escape key
        await sendBtn.click();
        await sendModal.waitFor({ state: 'visible', timeout: 5000 });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        const isClosedEsc = await sendModal.evaluate(el => el.style.display === 'none');
        const workspaceStillActive = await page.$eval('#frankDocumentWorkspace', el => el.classList.contains('active'));
        recordTest('Escape key closes modal without closing workspace', isClosedEsc && workspaceStillActive);

        // Reopen dialog and test backdrop click
        await sendBtn.click();
        await sendModal.waitFor({ state: 'visible', timeout: 5000 });
        await sendModal.click({ position: { x: 5, y: 5 } });
        await page.waitForTimeout(300);
        const isClosedBackdrop = await sendModal.evaluate(el => el.style.display === 'none');
        recordTest('Clicking modal backdrop closes dialog', isClosedBackdrop);

        // =====================================================================
        // PART 5 — SAVE STATE & SEND WORKBOOK
        // =====================================================================
        console.log('\n--- 5. SAVE INTEGRATION & SEND WORKBOOK ---');

        // Mark workspace dirty to simulate editing
        await page.evaluate(() => {
            if (window.frankOfficeWorkspace) {
                window.frankOfficeWorkspace.isDirty = true;
                window.frankOfficeWorkspace.setSaveStatus('unsaved');
            }
        });

        // Click Send to Chat: should automatically save workbook before opening dialog
        await sendBtn.click();
        await sendModal.waitFor({ state: 'visible', timeout: 5000 });
        const isDirtyAfter = await page.evaluate(() => window.frankOfficeWorkspace.isDirty);
        recordTest('Send to Chat saves unsaved workbook before opening dialog', !isDirtyAfter);

        // Select Self conversation (Note to self)
        await page.waitForSelector('.doc-send-recipient-row', { timeout: 5000 });
        const selfRow = page.locator('.doc-send-recipient-row[data-type="self"]').first();
        const selfRowCount = await selfRow.count();
        if (selfRowCount > 0) {
            await selfRow.click();
        } else {
            await page.locator('.doc-send-recipient-row').first().click();
        }

        // Enter optional message
        const commentInput = page.locator('#docSendCommentInput');
        await commentInput.fill('Please review this updated workbook');
        recordTest('Optional message entered in comment input', true);

        // Click Send Document
        await confirmBtn.click();
        console.log('  [ACTION] Clicked Send Document button');

        // Confirm modal closes after success
        await sendModal.waitFor({ state: 'hidden', timeout: 8000 });
        recordTest('Modal closed automatically after successful send', true);

        // Workspace closes and active chat view opens
        await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 8000 });
        const isChatOpen = await page.locator('#activeChatView').isVisible();
        recordTest('Navigated to recipient chat view', isChatOpen);

        // Verify shared document message in chat
        await page.waitForSelector('.message-row.has-document', { timeout: 8000 });
        const docMsg = page.locator('.message-row.has-document').last();
        const docTitle = await docMsg.locator('.message-doc-title').textContent();
        recordTest('Shared document message rendered in chat with correct filename', docTitle.includes(testFilename) || docTitle.includes('.xlsx'), docTitle);

        // Verify comment appears in message caption
        const captionText = await docMsg.locator('.message-caption').textContent();
        recordTest('Optional message caption rendered in chat message', captionText.includes('Please review this updated workbook'), captionText);

        // Verify Open and Download buttons in document card
        const openBtn = docMsg.locator('.msg-doc-open-btn');
        const dlBtn = docMsg.locator('.msg-doc-download-btn');
        recordTest('Open and Download buttons present on shared document', (await openBtn.count() > 0) && (await dlBtn.count() > 0));

        // Click Open on the shared document card
        await openBtn.click();
        const viewerLocator = page.locator('#inChatDocViewer:not([style*="display: none"]), #frankDocumentWorkspace.active');
        await viewerLocator.first().waitFor({ state: 'visible', timeout: 8000 });
        const reopenedTitle = (await page.locator('#inChatDocFilename, #workspaceDocTitle').first().textContent()).trim();
        recordTest('Clicking Open on shared document opens viewer with correct workbook', reopenedTitle.includes('2301 to 2400') || reopenedTitle.includes('.xlsx'), reopenedTitle);

        // Close viewer if open
        const closeViewerBtn = page.locator('#inChatDocCloseBtn:visible, #workspaceBackBtn:visible').first();
        if (await closeViewerBtn.count() > 0) {
            await closeViewerBtn.click();
            await page.waitForTimeout(500);
        }

        // =====================================================================
        // PART 6 — PERSISTENCE & RELOAD VERIFICATION
        // =====================================================================
        console.log('\n--- 6. PERSISTENCE ACROSS DASHBOARD REFRESH ---');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });

        // Open chat again
        await page.evaluate((uid) => {
            if (window.chatController) {
                window.chatController.openDirectChat({ id: uid, name: 'Frankline Samy (You)' });
            }
        }, userObj.id);

        await page.waitForSelector('.message-row.has-document', { timeout: 8000 });
        const persistedDoc = page.locator('.message-row.has-document').last();
        const persistedTitle = await persistedDoc.locator('.message-doc-title').textContent();
        recordTest('Shared document persists in database across page reload', persistedTitle.includes('2301 to 2400') || persistedTitle.includes('.xlsx'));

        // =====================================================================
        // PART 7 — RESPONSIVE VIEWPORT TESTS
        // =====================================================================
        console.log('\n--- 7. RESPONSIVE VIEWPORT AUDIT ---');
        const viewports = [
            { width: 320, height: 600, label: '320px (iPhone SE narrow)' },
            { width: 375, height: 667, label: '375px (iPhone 8/SE)' },
            { width: 390, height: 844, label: '390px (iPhone 12/13/14)' },
            { width: 430, height: 932, label: '430px (iPhone 14 Pro Max)' },
            { width: 768, height: 1024, label: '768px (iPad/Tablet)' },
            { width: 1280, height: 800, label: '1280px (Desktop)' }
        ];

        for (const vp of viewports) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            // Reopen Excel workspace
            await page.evaluate(({ fileId, fileType, filename }) => {
                if (!window.frankOfficeWorkspace) window.frankOfficeWorkspace = new FrankOfficeWorkspace();
                window.frankOfficeWorkspace.openDocument(fileId, fileType, filename, `/api/files/${fileId}/view`);
            }, { fileId: 328, fileType: 'excel', filename: testFilename });
            await page.waitForSelector('#frankDocumentWorkspace.active', { timeout: 5000 });

            // Click Send to Chat
            await page.click('#workspaceSendBtn');
            await page.waitForSelector('#docSendToChatModal', { state: 'visible', timeout: 5000 });

            // Check card bounding box fits viewport
            const cardBox = await page.locator('.doc-send-modal-card').boundingBox();
            const fitsWidth = cardBox.width <= vp.width;
            const fitsHeight = cardBox.height <= vp.height;
            recordTest(`Modal fits within viewport at ${vp.label}`, fitsWidth && fitsHeight, `Card: ${Math.round(cardBox.width)}x${Math.round(cardBox.height)}px`);

            // Close modal
            await page.click('#closeDocSendModalBtn');
            await page.waitForSelector('#docSendToChatModal', { state: 'hidden', timeout: 5000 });

            // Close workspace
            await page.click('#workspaceBackBtn');
            await page.waitForTimeout(300);
        }

        // =====================================================================
        // PART 8 — REGRESSION & ERROR LOGS AUDIT
        // =====================================================================
        console.log('\n--- 8. REGRESSION & CONSOLE ERROR AUDIT ---');
        recordTest('No unhandled browser console errors during session', consoleErrors.length === 0, consoleErrors.join(', '));

    } catch (err) {
        console.error('\n[EXCEPTION]', err);
        failedCount++;
    } finally {
        await browser.close();
    }

    console.log('\n========================================================================');
    console.log(`TEST SUITE RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('========================================================================\n');

    process.exit(failedCount > 0 ? 1 : 0);
}

runExcelSendToChatSuite();
