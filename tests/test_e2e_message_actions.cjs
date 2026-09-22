const { chromium } = require('playwright');

async function runMessageActionTests() {
    console.log('==================================================');
    console.log('STARTING PLAYWRIGHT E2E MESSAGE ACTIONS TESTS');
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
        // 1. Navigate and Login
        console.log('1. Logging in as Alex...');
        await page.goto('http://127.0.0.1:8000/login.html');
        await page.waitForSelector('#loginUsername', { timeout: 10000 });
        await page.fill('#loginUsername', 'alex');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });

        // Dismiss loader if present
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

        // Wait for spinner to detach and messages to load
        await page.waitForSelector('#messagesContainer .spinner', { state: 'detached', timeout: 10000 });
        await page.waitForFunction(() => window.wsClient && window.wsClient.isConnected, { timeout: 10000 });
        await page.waitForFunction(() => window.chatController && window.chatController.activeId, { timeout: 5000 });
        console.log('[PASS] WebSocket connected & conversation messages loaded');

        // 3. Send a unique text message
        const uniqueText = `Playwright Test Msg ${Date.now()}`;
        console.log(`3. Sending test message: "${uniqueText}"...`);
        const textarea = page.locator('#messageComposerTextarea');
        await textarea.fill(uniqueText);
        await page.click('#composerSendBtn');

        // Wait for message to appear in chat and settle after WebSocket confirmation
        await page.waitForTimeout(800);
        const msgRow = page.locator('.message-row', { hasText: uniqueText }).last();
        await msgRow.waitFor({ state: 'visible', timeout: 10000 });
        await msgRow.scrollIntoViewIfNeeded();
        console.log('[PASS] Test message rendered in chat');

        // 4. Verify Professional SVG Icons (NO emoji for Copy, Edit, Delete, Reply, Download, Open)
        console.log('4. Verifying professional SVG icons for message actions...');
        await msgRow.hover();
        const actionToolbar = msgRow.locator('.message-actions-toolbar');
        await actionToolbar.waitFor({ state: 'visible', timeout: 5000 });

        // Reply button has SVG
        const replyBtn = actionToolbar.locator('.msg-action-reply');
        const hasReplySvg = await replyBtn.locator('svg').count() > 0;
        if (!hasReplySvg) throw new Error('Reply button must use a professional SVG icon, not emoji');

        // Copy button has SVG
        const copyBtn = actionToolbar.locator('.msg-action-copy');
        const hasCopySvg = await copyBtn.locator('svg').count() > 0;
        if (!hasCopySvg) throw new Error('Copy button must use a professional SVG icon, not emoji');

        // Edit button has SVG
        const editBtn = actionToolbar.locator('.msg-action-edit');
        const hasEditSvg = await editBtn.locator('svg').count() > 0;
        if (!hasEditSvg) throw new Error('Edit button must use a professional SVG icon, not emoji');

        // Delete button has SVG
        const deleteBtn = actionToolbar.locator('.msg-action-delete');
        const hasDeleteSvg = await deleteBtn.locator('svg').count() > 0;
        if (!hasDeleteSvg) throw new Error('Delete button must use a professional SVG icon, not emoji');

        console.log('[PASS] All action buttons (Reply, Copy, Edit, Delete) use professional SVG outline icons');

        // 5. Test Copy Action
        console.log('5. Testing Copy action...');
        const copyRow = page.locator('.message-row', { hasText: uniqueText }).last();
        await copyRow.scrollIntoViewIfNeeded();
        await copyRow.hover();
        const freshCopyBtn = copyRow.locator('.msg-action-copy');
        await freshCopyBtn.waitFor({ state: 'visible', timeout: 3000 });
        await freshCopyBtn.click();

        // Verify toast "✓ Copied"
        await page.waitForSelector('.toast', { state: 'visible', timeout: 3000 });
        const toastText = await page.locator('.toast').last().textContent();
        if (!toastText.includes('Copied')) {
            throw new Error(`Expected toast to contain "Copied", got: "${toastText}"`);
        }
        // Verify clipboard content
        const copiedContent = await page.evaluate(() => navigator.clipboard.readText());
        if (copiedContent.trim() !== uniqueText.trim()) {
            throw new Error(`Clipboard mismatch! Expected "${uniqueText}", got: "${copiedContent}"`);
        }
        console.log('[PASS] Copy successfully copies ONLY message text without metadata or HTML');

        // 6. Test Edit Action
        console.log('6. Testing Edit action...');
        const editRow = page.locator('.message-row', { hasText: uniqueText }).last();
        await editRow.scrollIntoViewIfNeeded();
        const msgRowId = await editRow.getAttribute('id');
        const targetRow = page.locator('#' + msgRowId);

        await targetRow.hover();
        const freshEditBtn = targetRow.locator('.msg-action-edit');
        await freshEditBtn.waitFor({ state: 'visible', timeout: 3000 });
        await freshEditBtn.click();

        // In-composer edit strip must be visible
        const editStrip = page.locator('#composerEditStrip');
        await editStrip.waitFor({ state: 'visible', timeout: 5000 });
        const editPreviewText = await page.locator('#composerEditText').textContent();
        if (!editPreviewText.includes(uniqueText.slice(0, 20))) {
            throw new Error(`Edit strip preview mismatch: "${editPreviewText}"`);
        }
        console.log('[PASS] In-composer edit mode activated with edit strip preview');

        // Modify text in composer and save
        const editedSuffix = ' [EDITED VIA PLAYWRIGHT]';
        const updatedText = uniqueText + editedSuffix;
        await textarea.fill(updatedText);
        await page.click('#composerSendBtn');

        // Edit strip should disappear
        await editStrip.waitFor({ state: 'hidden', timeout: 5000 });

        // Message row should now display updated text and (edited) indicator
        await page.waitForTimeout(600);
        await targetRow.waitFor({ state: 'visible', timeout: 5000 });
        const editedIndicator = targetRow.locator('.message-edited-badge');
        await editedIndicator.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Message edited successfully, displays updated text and (edited) indicator');

        // 6b. Verify Copying Edited Message copies the updated text (NOT the old text)
        console.log('6b. Testing Copy action on edited message...');
        await targetRow.scrollIntoViewIfNeeded();
        await targetRow.hover();
        const copyEditedBtn = targetRow.locator('.msg-action-copy');
        await copyEditedBtn.waitFor({ state: 'visible', timeout: 3000 });
        await copyEditedBtn.click();
        await page.waitForTimeout(300);
        const copiedEditedContent = await page.evaluate(() => navigator.clipboard.readText());
        if (copiedEditedContent.trim() !== updatedText.trim()) {
            throw new Error(`Copy on edited message failed! Expected updated text "${updatedText}", got: "${copiedEditedContent}"`);
        }
        if (copiedEditedContent.trim() === uniqueText.trim()) {
            throw new Error(`CRITICAL BUG: Copy on edited message copied the OLD text instead of updated text!`);
        }
        console.log('[PASS] Copying edited message correctly copies the UPDATED message text (not the old text)');

        // 7. Test Reply Action
        console.log('7. Testing Reply action...');
        await targetRow.scrollIntoViewIfNeeded();
        await targetRow.hover();
        const updatedToolbar = targetRow.locator('.message-actions-toolbar');
        const updatedReplyBtn = updatedToolbar.locator('.msg-action-reply');
        await updatedReplyBtn.waitFor({ state: 'visible', timeout: 3000 });
        await updatedReplyBtn.click();

        // Reply bar should be visible
        const replyBar = page.locator('#composerReplyStrip');
        await replyBar.waitFor({ state: 'visible', timeout: 5000 });
        const replyPreview = await page.locator('#replyPreviewText').textContent();
        if (!replyPreview.includes(updatedText.slice(0, 20))) {
            throw new Error(`Reply preview mismatch: "${replyPreview}"`);
        }
        console.log('[PASS] Reply quoting activated in composer');

        // Send reply
        const replyMsgText = `Reply to ${Date.now()}`;
        await textarea.fill(replyMsgText);
        await page.click('#composerSendBtn');

        // Verify reply message renders quoting the original message
        await page.waitForTimeout(600);
        const replyRow = page.locator('.message-row', { hasText: replyMsgText }).last();
        await replyRow.waitFor({ state: 'visible', timeout: 5000 });
        const quotedWrap = replyRow.locator('.message-reply-quote');
        await quotedWrap.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Reply sent and rendered with quote block');

        // 8. Test Emoji Reaction on target message
        console.log('8. Testing emoji reaction...');
        await targetRow.scrollIntoViewIfNeeded();
        await targetRow.hover();
        const reactToolbar = targetRow.locator('.message-actions-toolbar');
        const heartReactBtn = reactToolbar.locator('.msg-action-react', { hasText: '❤️' });
        await heartReactBtn.waitFor({ state: 'visible', timeout: 3000 });
        await heartReactBtn.click();

        // Wait for reaction pill
        const reactionPill = targetRow.locator('.reaction-pill', { hasText: '❤️' });
        await reactionPill.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Emoji reaction added and displayed in reaction pill');

        // 9. Test Delete Action (Cancel then Confirm) on target message
        console.log('9. Testing Delete action with confirmation modal...');
        await targetRow.scrollIntoViewIfNeeded();
        await targetRow.hover();
        const deleteToolbar = targetRow.locator('.message-actions-toolbar');
        const updatedDeleteBtn = deleteToolbar.locator('.msg-action-delete');
        await updatedDeleteBtn.waitFor({ state: 'visible', timeout: 3000 });
        await updatedDeleteBtn.click();

        // Confirmation modal appears
        const confirmModal = page.locator('#dynamicConfirmModal');
        await confirmModal.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Delete confirmation modal displayed');

        // Click Cancel -> message must remain
        await page.click('#confirmModalCancel');
        await confirmModal.waitFor({ state: 'hidden', timeout: 3000 });
        const stillExists = await targetRow.isVisible();
        if (!stillExists) throw new Error('Message should not be deleted when Cancel is clicked');
        console.log('[PASS] Canceling deletion keeps message intact');

        // Click Delete again -> Confirm
        await targetRow.scrollIntoViewIfNeeded();
        await targetRow.hover();
        await updatedDeleteBtn.waitFor({ state: 'visible', timeout: 3000 });
        await updatedDeleteBtn.click();
        await confirmModal.waitFor({ state: 'visible', timeout: 5000 });
        await page.click('#confirmModalOk');
        await confirmModal.waitFor({ state: 'hidden', timeout: 3000 });

        // Verify message is removed from chat
        await targetRow.waitFor({ state: 'hidden', timeout: 5000 });
        console.log('[PASS] Deletion confirmed and message removed cleanly from chat');

        console.log('==================================================');
        console.log('ALL MESSAGE ACTIONS TESTS PASSED! [SUCCESS]');
        console.log('==================================================');

    } finally {
        await browser.close();
    }
}

runMessageActionTests().catch(err => {
    console.error('MESSAGE ACTIONS TEST FAILED:', err);
    process.exit(1);
});
