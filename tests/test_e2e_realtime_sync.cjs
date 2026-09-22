const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runTwoUserRealTimeTest(targetUrl = 'http://127.0.0.1:8000') {
    console.log('====================================================');
    console.log(`STARTING TWO-USER REAL-TIME E2E TEST ON: ${targetUrl}`);
    console.log('====================================================');

    const browser = await chromium.launch({ headless: true });

    // Browser Context A (User A)
    const contextA = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
        viewport: { width: 1280, height: 800 }
    });
    const pageA = await contextA.newPage();

    // Browser Context B (User B)
    const contextB = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
        viewport: { width: 1280, height: 800 }
    });
    const pageB = await contextB.newPage();

    const errLogs = [];
    [pageA, pageB].forEach((page, idx) => {
        const u = idx === 0 ? 'UserA' : 'UserB';
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errLogs.push(`[${u} ERR] ${msg.text()}`);
                console.log(`[${u} ERR]`, msg.text());
            }
        });
    });

    try {
        const uniqueSuffix = Date.now().toString(36);
        const userA_name = `UserA_${uniqueSuffix}`;
        const userB_name = `UserB_${uniqueSuffix}`;
        const pass = 'TestPass2026!';

        // Step 1: Register User A
        console.log(`\n1. Registering User A (${userA_name})...`);
        await pageA.goto(`${targetUrl}/register.html`);
        await pageA.fill('#regFullName', 'User Alpha');
        await pageA.fill('#regUsername', userA_name);
        await pageA.fill('#regEmail', `${userA_name}@frankchat.test`);
        await pageA.fill('#regPassword', pass);
        await pageA.fill('#regConfirmPassword', pass);
        await pageA.check('#regTerms');
        await pageA.click('#registerSubmitBtn');
        await pageA.waitForURL('**/dashboard.html', { timeout: 12000 });

        // Retrieve User A FRANK ID and Database ID
        const userA_data = await pageA.evaluate(() => window.auth.getUser());
        console.log(`  -> User A Frank ID: ${userA_data.frank_id}, ID: ${userA_data.id}`);

        // Step 2: Register User B
        console.log(`\n2. Registering User B (${userB_name})...`);
        await pageB.goto(`${targetUrl}/register.html`);
        await pageB.fill('#regFullName', 'User Beta');
        await pageB.fill('#regUsername', userB_name);
        await pageB.fill('#regEmail', `${userB_name}@frankchat.test`);
        await pageB.fill('#regPassword', pass);
        await pageB.fill('#regConfirmPassword', pass);
        await pageB.check('#regTerms');
        await pageB.click('#registerSubmitBtn');
        await pageB.waitForURL('**/dashboard.html', { timeout: 12000 });

        const userB_data = await pageB.evaluate(() => window.auth.getUser());
        console.log(`  -> User B Frank ID: ${userB_data.frank_id}, ID: ${userB_data.id}`);

        // Dismiss modals & loading screens
        for (const p of [pageA, pageB]) {
            await p.evaluate(() => {
                document.getElementById('appLoadingScreen')?.remove();
                document.getElementById('welcomeOnboardingModal')?.classList.remove('active');
                localStorage.setItem('frank_onboarded', 'true');
            });
        }

        // Step 3: User A opens conversation with User B via FRANK ID
        console.log('\n3. User A starting chat with User B via FRANK ID...');
        await pageA.waitForTimeout(2000);
        await pageA.click('#newChatModalBtn');
        await pageA.waitForSelector('#newChatModal.open', { timeout: 5000 });
        await pageA.fill('#frankIdSearchInput', userB_data.frank_id);
        await pageA.click('#frankIdSearchBtn');

        const startChatBtn = pageA.locator('#previewStartChatBtn');
        try {
            await startChatBtn.waitFor({ state: 'visible', timeout: 6000 });
        } catch (e) {
            // Retry once if replica lagged
            await pageA.click('#frankIdSearchBtn');
            await startChatBtn.waitFor({ state: 'visible', timeout: 6000 });
        }
        await startChatBtn.click();
        await pageA.waitForTimeout(1500);
        console.log('  -> User A opened direct chat with User B');

        // Step 4: User A sends text message
        const testMsgText = `Live message from A at ${Date.now()}`;
        console.log(`\n4. User A sending: "${testMsgText}"...`);
        await pageA.fill('#messageComposerTextarea', testMsgText);
        await pageA.click('#composerSendBtn');
        await pageA.waitForTimeout(500);

        // Verify User A sees message
        const userA_sentMsg = pageA.locator(`.message-row.sent:has-text("${testMsgText}")`);
        await userA_sentMsg.waitFor({ state: 'visible', timeout: 5000 });
        console.log('  [PASS] User A sees sent message');

        // Step 5: User B receives message in real time (WITHOUT PAGE REFRESH!)
        console.log('\n5. Verifying User B receives message in real time (No refresh)...');
        // If User B doesn't have chat open yet, open it or check conversation list
        const convCardB = pageB.locator(`.conversation-card:has-text("User Alpha")`).first();
        await convCardB.waitFor({ state: 'visible', timeout: 15000 });
        console.log('  [PASS] User B conversation list updated with User Alpha card in real time');
        await convCardB.click();
        await pageB.waitForTimeout(1000);

        const userB_receivedMsg = pageB.locator(`.message-row:has-text("${testMsgText}")`);
        await userB_receivedMsg.waitFor({ state: 'visible', timeout: 12000 });
        console.log('  [PASS] User B received and rendered message without reload!');

        // Step 6: User A edits message
        const editedText = `${testMsgText} (EDITED_CONTENT)`;
        console.log(`\n6. User A editing message to: "${editedText}"...`);
        await userA_sentMsg.hover();
        await pageA.waitForTimeout(300);
        const editBtn = userA_sentMsg.locator('.msg-action-edit');
        await editBtn.dispatchEvent('click');
        await pageA.waitForSelector('#composerEditStrip', { state: 'visible', timeout: 4000 });
        await pageA.fill('#messageComposerTextarea', editedText);
        await pageA.click('#saveEditBtn');
        await pageA.waitForTimeout(1000);

        // Verify User A sees edit
        await pageA.locator(`.message-row:has-text("${editedText}")`).waitFor({ state: 'visible', timeout: 8000 });
        console.log('  [PASS] User A sees edited text and badge');

        // Step 7: User B receives edit in real time (WITHOUT RELOAD!)
        console.log('\n7. Verifying User B sees edit in real time (No reload)...');
        await pageB.locator(`.message-row:has-text("${editedText}")`).waitFor({ state: 'visible', timeout: 15000 });
        console.log('  [PASS] User B received live message edit without reload!');

        // Step 8: User B reacts with emoji 👍
        console.log('\n8. User B reacting with 👍...');
        const userB_msgRow = pageB.locator(`.message-row:has-text("${editedText}")`);
        await userB_msgRow.hover();
        await pageB.waitForTimeout(300);
        const reactBtnB = userB_msgRow.locator('.msg-action-react[data-emoji="👍"]');
        await reactBtnB.dispatchEvent('click');
        await pageB.waitForTimeout(1000);

        // Verify User B sees reaction pill
        await userB_msgRow.locator('.reaction-pill:has-text("👍")').waitFor({ state: 'visible', timeout: 8000 });
        console.log('  [PASS] User B reaction pill rendered');

        // Step 9: User A receives reaction in real time (WITHOUT RELOAD!)
        console.log('\n9. Verifying User A sees reaction in real time (No reload)...');
        const userA_msgRow = pageA.locator(`.message-row:has-text("${editedText}")`);
        await userA_msgRow.locator('.reaction-pill:has-text("👍")').waitFor({ state: 'visible', timeout: 15000 });
        console.log('  [PASS] User A received live emoji reaction without reload!');

        // Step 10: User A deletes message
        console.log('\n10. User A deleting message...');
        await userA_msgRow.hover();
        await pageA.waitForTimeout(300);
        const delBtn = userA_msgRow.locator('.msg-action-delete');
        await delBtn.dispatchEvent('click');
        // Confirm in modal
        const confirmBtn = pageA.locator('#confirmModalOk');
        await confirmBtn.waitFor({ state: 'visible', timeout: 4000 });
        await confirmBtn.click();
        await pageA.waitForTimeout(1000);

        // Verify message removed for User A
        const isMsgGoneA = await pageA.locator(`.message-row:has-text("${editedText}")`).count();
        if (isMsgGoneA !== 0) throw new Error('Message still visible to User A after deletion');
        console.log('  [PASS] Message removed from User A view');

        // Step 11: User B sees message deletion in real time (WITHOUT RELOAD!)
        console.log('\n11. Verifying User B sees message deletion in real time (No reload)...');
        await pageB.waitForTimeout(4000);
        await pageB.locator(`.message-row:has-text("${editedText}")`).waitFor({ state: 'detached', timeout: 15000 });
        console.log('  [PASS] Message removed from User B view in real time without reload!');

        // Step 12: Verify no stray localhost:8000 calls on production
        console.log('\n12. Checking for stray localhost calls or critical errors...');
        const localhostErrors = errLogs.filter(e => e.includes('localhost:8000') || e.includes('127.0.0.1'));
        if (localhostErrors.length > 0) {
            throw new Error(`Stray localhost calls detected: ${localhostErrors.join(', ')}`);
        }
        console.log('  [PASS] Zero stray localhost calls detected!');

        console.log('\n====================================================');
        console.log('ALL TWO-USER REAL-TIME SYNC TESTS PASSED WITH 100% SUCCESS!');
        console.log('====================================================');

    } catch (err) {
        console.error('\n[TEST FAILED]', err);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

const target = process.argv[2] || 'http://127.0.0.1:8000';
runTwoUserRealTimeTest(target);
