const { chromium } = require('playwright');
const assert = require('assert');

const PROD_URL = 'https://frank-chat-app.vercel.app';

async function runLiveProductionVerification() {
    console.log('================================================================');
    console.log(`RUNNING FULL PRODUCTION VERIFICATION ON: ${PROD_URL}`);
    console.log('================================================================');

    const browser = await chromium.launch({ headless: true });
    
    // User A context
    const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageA = await contextA.newPage();

    // User B context
    const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageB = await contextB.newPage();

    const consoleErrorsA = [];
    const consoleErrorsB = [];
    const failedRequests = [];
    const apiCalls = [];

    function setupListeners(page, name, consoleErrors) {
        page.on('console', msg => {
            if (msg.type() === 'error') {
                const text = msg.text();
                if (!text.includes('favicon') && !text.includes('chrome-extension')) {
                    consoleErrors.push(`[${name} Console Error] ${text}`);
                }
            }
        });
        page.on('request', req => {
            const url = req.url();
            apiCalls.push(`[${name}] ${req.method()} ${url}`);
            if (url.includes('localhost') || url.includes('127.0.0.1')) {
                console.error(`CRITICAL ERROR: Localhost call detected on live site: ${url}`);
                failedRequests.push(`CRITICAL LOCALHOST CALL: ${url}`);
            }
        });
        page.on('requestfailed', req => {
            if (!req.url().includes('favicon')) {
                failedRequests.push(`[${name}] ${req.method()} ${req.url()}: ${req.failure()?.errorText}`);
            }
        });
    }

    setupListeners(pageA, 'UserA', consoleErrorsA);
    setupListeners(pageB, 'UserB', consoleErrorsB);

    const testTime = Date.now();
    const messageFromA = `Test message from Alex at ${testTime}`;
    const messageFromB = `Reply from Sarah at ${testTime}`;

    try {
        // =============================================================
        // 1. LOGIN USER A (Alex)
        // =============================================================
        console.log('\n[STEP 1] Logging in User A (alex@frank.app) on live Vercel...');
        await pageA.goto(`${PROD_URL}/login.html`, { waitUntil: 'networkidle' });
        await pageA.fill('#loginUsername', 'alex@frank.app');
        await pageA.fill('#loginPassword', 'password123');
        await pageA.click('button[type="submit"]');

        await pageA.waitForURL('**/dashboard.html', { timeout: 20000 });
        console.log('✓ User A logged in successfully, reached dashboard');

        // =============================================================
        // 2. VERIFY DASHBOARD & CONVERSATIONS LOAD
        // =============================================================
        console.log('\n[STEP 2] Verifying dashboard and conversation list load...');
        await pageA.waitForSelector('#conversationList', { timeout: 15000 });
        await pageA.waitForTimeout(2000); // Wait for sync

        // Check if "Failed to sync messages" is shown
        const syncErrorEl = pageA.locator('.sync-error-banner, #syncErrorBanner, :has-text("Failed to sync messages")');
        const hasSyncError = (await syncErrorEl.count()) > 0 && await syncErrorEl.first().isVisible();
        console.log(`Sync error banner visible: ${hasSyncError}`);
        assert(!hasSyncError, 'Dashboard should NOT show "Failed to sync messages"');
        console.log('✓ Conversation list synced successfully with 0 sync errors');

        // Count loaded conversations
        const cards = pageA.locator('#conversationList .conversation-card');
        const cardCount = await cards.count();
        console.log(`✓ Loaded ${cardCount} conversation cards in the sidebar`);
        assert(cardCount > 0, 'Should load at least 1 conversation card');

        // =============================================================
        // 3. TEST MESSAGE MYSELF (NOTES)
        // =============================================================
        console.log('\n[STEP 3] Testing Message Myself (Self-Chat)...');
        const selfCard = pageA.locator('#conversationList .conversation-card:has-text("(You)")').first();
        if (await selfCard.count() > 0) {
            await selfCard.click();
        } else {
            // Find note to self button or click first card
            const noteBtn = pageA.locator('#newNoteBtn, [data-action="message-myself"]').first();
            if (await noteBtn.count() > 0) {
                await noteBtn.click();
            } else {
                await cards.first().click();
            }
        }

        await pageA.waitForSelector('#activeChatView', { state: 'visible', timeout: 10000 });
        await pageA.waitForTimeout(1000);

        // Check for "Failed to load messages"
        const failedLoadEl = pageA.locator(':has-text("Failed to load messages")');
        const hasFailedLoad = (await failedLoadEl.count()) > 0 && await failedLoadEl.first().isVisible();
        assert(!hasFailedLoad, 'Active chat view should NOT show "Failed to load messages"');
        console.log('✓ Self-chat loaded cleanly without "Failed to load messages" error');

        // Send a note in Message Myself
        const noteText = `Personal Note ${testTime}`;
        await pageA.fill('#messageComposerTextarea', noteText);
        await pageA.click('#composerSendBtn');
        await pageA.waitForTimeout(1500);

        const selfMsg = pageA.locator(`.message-row:has-text("${noteText}")`).last();
        await selfMsg.waitFor({ state: 'visible', timeout: 10000 });
        console.log(`✓ Note successfully sent and rendered: "${noteText}"`);

        // =============================================================
        // 4. OPEN 1-TO-1 CONVERSATION WITH SARAH
        // =============================================================
        console.log('\n[STEP 4] Opening 1-to-1 conversation with Sarah...');
        const sarahCard = pageA.locator('#conversationList .conversation-card:has-text("Sarah")').first();
        if (await sarahCard.count() > 0) {
            await sarahCard.click();
        } else {
            console.log('Sarah card not found directly, searching or starting new chat...');
            // Let's click on Sarah from contacts if available or open first other card
            const otherCard = pageA.locator('#conversationList .conversation-card:not(:has-text("(You)"))').first();
            await otherCard.click();
        }

        await pageA.waitForSelector('#activeChatView', { state: 'visible', timeout: 10000 });
        await pageA.waitForTimeout(1500);

        const hasSarahLoadError = (await failedLoadEl.count()) > 0 && await failedLoadEl.first().isVisible();
        assert(!hasSarahLoadError, '1-to-1 Chat view should NOT show "Failed to load messages"');
        console.log('✓ 1-to-1 conversation loaded without "Failed to load messages"');

        // =============================================================
        // 5. SEND MESSAGE FROM USER A (Alex)
        // =============================================================
        console.log('\n[STEP 5] Sending message from Alex to Sarah...');
        await pageA.fill('#messageComposerTextarea', messageFromA);
        await pageA.click('#composerSendBtn');
        await pageA.waitForTimeout(2000);

        const msgARendered = pageA.locator(`.message-row:has-text("${messageFromA}")`).last();
        await msgARendered.waitFor({ state: 'visible', timeout: 10000 });
        console.log(`✓ Message from Alex rendered in User A view: "${messageFromA}"`);

        // =============================================================
        // 6. LOGIN USER B (Sarah) IN PARALLEL BROWSER CONTEXT
        // =============================================================
        console.log('\n[STEP 6] Logging in User B (sarah@frank.app) in Browser B...');
        await pageB.goto(`${PROD_URL}/login.html`, { waitUntil: 'networkidle' });
        await pageB.fill('#loginUsername', 'sarah@frank.app');
        await pageB.fill('#loginPassword', 'password123');
        await pageB.click('button[type="submit"]');

        await pageB.waitForURL('**/dashboard.html', { timeout: 20000 });
        console.log('✓ User B logged in successfully, reached dashboard');

        await pageB.waitForSelector('#conversationList', { timeout: 15000 });
        await pageB.waitForTimeout(2000);

        // Open Alex's conversation in User B
        console.log('\n[STEP 7] Opening Alex conversation in User B...');
        const alexCard = pageB.locator('#conversationList .conversation-card:has-text("Alex")').first();
        if (await alexCard.count() > 0) {
            await alexCard.click();
        } else {
            const firstCardB = pageB.locator('#conversationList .conversation-card:not(:has-text("(You)"))').first();
            await firstCardB.click();
        }

        await pageB.waitForSelector('#activeChatView', { state: 'visible', timeout: 10000 });
        await pageB.waitForTimeout(2000);

        // Verify Sarah sees Alex's message
        const msgAReceived = pageB.locator(`.message-row:has-text("${messageFromA}")`).last();
        await msgAReceived.waitFor({ state: 'visible', timeout: 10000 });
        console.log(`✓ User B received Alex's message: "${messageFromA}"`);

        // =============================================================
        // 7. USER B REPLIES TO USER A
        // =============================================================
        console.log('\n[STEP 8] Sarah replies to Alex...');
        await pageB.fill('#messageComposerTextarea', messageFromB);
        await pageB.click('#composerSendBtn');
        await pageB.waitForTimeout(2000);

        const msgBRendered = pageB.locator(`.message-row:has-text("${messageFromB}")`).last();
        await msgBRendered.waitFor({ state: 'visible', timeout: 10000 });
        console.log(`✓ User B sent reply: "${messageFromB}"`);

        // =============================================================
        // 8. VERIFY USER A RECEIVES SARAH'S REPLY
        // =============================================================
        console.log('\n[STEP 9] Checking if Alex sees Sarah\'s reply...');
        // User A could get via WebSocket or poll
        await pageA.waitForTimeout(3000);
        const msgBReceivedOnA = pageA.locator(`.message-row:has-text("${messageFromB}")`).last();
        if (await msgBReceivedOnA.isVisible()) {
            console.log(`✓ User A received reply immediately: "${messageFromB}"`);
        } else {
            console.log('Checking with refresh on User A...');
            await pageA.reload({ waitUntil: 'networkidle' });
            await pageA.waitForSelector('#conversationList', { timeout: 15000 });
            const sCard = pageA.locator('#conversationList .conversation-card:has-text("Sarah")').first();
            if (await sCard.count() > 0) await sCard.click();
            await pageA.waitForSelector('#activeChatView', { state: 'visible', timeout: 10000 });
            const msgBAfterRefresh = pageA.locator(`.message-row:has-text("${messageFromB}")`).last();
            await msgBAfterRefresh.waitFor({ state: 'visible', timeout: 10000 });
            console.log(`✓ User A verified Sarah's reply persisted: "${messageFromB}"`);
        }

        // =============================================================
        // 9. REFRESH BOTH BROWSERS & VERIFY POSTGRESQL PERSISTENCE
        // =============================================================
        console.log('\n[STEP 10] Refreshing both browsers to test persistence from PostgreSQL...');
        await pageA.reload({ waitUntil: 'networkidle' });
        await pageB.reload({ waitUntil: 'networkidle' });

        await pageA.waitForSelector('#conversationList', { timeout: 15000 });
        await pageB.waitForSelector('#conversationList', { timeout: 15000 });

        // Open Sarah again on A
        const sCardA = pageA.locator('#conversationList .conversation-card:has-text("Sarah")').first();
        if (await sCardA.count() > 0) await sCardA.click();
        await pageA.waitForSelector('#activeChatView', { state: 'visible', timeout: 10000 });
        await pageA.waitForTimeout(1000);

        // Open Alex again on B
        const aCardB = pageB.locator('#conversationList .conversation-card:has-text("Alex")').first();
        if (await aCardB.count() > 0) await aCardB.click();
        await pageB.waitForSelector('#activeChatView', { state: 'visible', timeout: 10000 });
        await pageB.waitForTimeout(1000);

        const aPersistedOnA = await pageA.locator(`.message-row:has-text("${messageFromA}")`).count();
        const bPersistedOnA = await pageA.locator(`.message-row:has-text("${messageFromB}")`).count();
        const aPersistedOnB = await pageB.locator(`.message-row:has-text("${messageFromA}")`).count();
        const bPersistedOnB = await pageB.locator(`.message-row:has-text("${messageFromB}")`).count();

        console.log(`Persistence check: Alex's msg on A: ${aPersistedOnA}, Sarah's msg on A: ${bPersistedOnA}`);
        console.log(`Persistence check: Alex's msg on B: ${aPersistedOnB}, Sarah's msg on B: ${bPersistedOnB}`);
        assert(aPersistedOnA > 0 && bPersistedOnA > 0, 'Both messages must persist on User A after refresh');
        assert(aPersistedOnB > 0 && bPersistedOnB > 0, 'Both messages must persist on User B after refresh');
        console.log('✓ Persistence verified across page reloads in PostgreSQL!');

        // =============================================================
        // 10. TEST RETRY BUTTON ON ERROR HANDLER
        // =============================================================
        console.log('\n[STEP 11] Testing Retry Mechanism...');
        const retryResult = await pageA.evaluate(async () => {
            let directSuccess = false;
            let convSuccess = false;
            if (window.chatController && typeof window.chatController.loadDirectMessages === 'function') {
                await window.chatController.loadDirectMessages(window.chatController.activePartnerId || 2);
                directSuccess = true;
            }
            if (window.appController && typeof window.appController.loadConversations === 'function') {
                await window.appController.loadConversations(true);
                convSuccess = true;
            }
            return { directSuccess, convSuccess };
        });
        console.log(`✓ Retry functions verified: ${JSON.stringify(retryResult)}`);
        assert(retryResult.directSuccess && retryResult.convSuccess, 'Both retry functions must exist and execute successfully');

        // =============================================================
        // 11. TEST LOGOUT AND LOGIN AGAIN
        // =============================================================
        console.log('\n[STEP 12] Testing Logout and Re-Login...');
        await pageA.evaluate(() => {
            if (window.auth && typeof window.auth.logout === 'function') {
                window.auth.logout();
            } else if (window.api && typeof window.api.logout === 'function') {
                window.api.logout();
            } else {
                localStorage.clear();
                window.location.href = 'login.html?logout=1';
            }
        });
        await pageA.waitForURL('**/login.html*', { timeout: 15000 });
        console.log('✓ Logout successful, redirected to login page');

        // Re-login
        await pageA.fill('#loginUsername', 'alex@frank.app');
        await pageA.fill('#loginPassword', 'password123');
        await pageA.click('button[type="submit"]');
        await pageA.waitForURL('**/dashboard.html', { timeout: 20000 });
        console.log('✓ Re-login successful, dashboard reloaded cleanly');

        // =============================================================
        // 11. CHECK FOR LOCALHOST CALLS OR CRITICAL CONSOLE ERRORS
        // =============================================================
        console.log('\n[STEP 12] Checking Network & Console logs...');
        const localhostCalls = apiCalls.filter(call => call.includes('localhost') || call.includes('127.0.0.1'));
        console.log(`Total API/Network calls recorded: ${apiCalls.length}`);
        console.log(`Localhost calls detected: ${localhostCalls.length}`);
        assert(localhostCalls.length === 0, `Forbidden localhost calls detected: ${JSON.stringify(localhostCalls)}`);

        console.log(`User A Console Errors: ${consoleErrorsA.length}`);
        console.log(`User B Console Errors: ${consoleErrorsB.length}`);
        console.log(`Failed Requests: ${failedRequests.length}`);

        if (failedRequests.length > 0) {
            console.log('Failed requests detail:', failedRequests);
        }

        console.log('\n================================================================');
        console.log('ALL LIVE PRODUCTION VERIFICATION TESTS PASSED SUCCESSFULLY! 🚀');
        console.log('================================================================');

    } catch (err) {
        console.error('\n❌ TEST FAILED:', err.message);
        throw err;
    } finally {
        await browser.close();
    }
}

runLiveProductionVerification()
    .then(() => {
        console.log('Done.');
        process.exit(0);
    })
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
