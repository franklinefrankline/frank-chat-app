const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    console.log('==================================================');
    console.log('RUNNING SMART CONVERSATIONS ATTACHMENT ANALYSIS E2E TEST');
    console.log('==================================================');

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.error('[Browser Error]:', msg.text());
            consoleErrors.push(msg.text());
        }
    });

    try {
        const BASE_URL = 'http://127.0.0.1:8000';

        // Step 1: Login
        console.log('Step 1: Logging in as franklinesamy2006@gmail.com...');
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
        await page.fill('#loginUsername', 'franklinesamy2006@gmail.com');
        await page.fill('#loginPassword', '#Frankline2006');
        await page.click('#loginSubmitBtn');

        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        console.log('✓ Reached dashboard.');

        // Dismiss onboarding modal if open
        await page.evaluate(() => {
            localStorage.setItem('frank_onboarded', 'true');
            const m = document.getElementById('welcomeOnboardingModal');
            if (m) {
                m.classList.remove('active', 'open', 'show');
                m.style.display = 'none';
            }
        });

        await page.waitForTimeout(1000);

        // Step 2: Create a dedicated test group and open it
        console.log('\nStep 2: Creating a dedicated isolated test group...');
        const testGroupName = `SmartAnalysis Group ${Date.now().toString().slice(-4)}`;
        const createGroupRes = await page.evaluate(async (name) => {
            return await window.api.createGroup({
                name: name,
                description: 'Automated test group for Smart Conversations verification',
                privacy: 'private',
                member_ids: []
            });
        }, testGroupName);
        const testGroupId = createGroupRes.id;
        console.log(`✓ Created test group: "${testGroupName}" (ID: ${testGroupId})`);

        await page.evaluate(async (gid) => {
            const group = await window.api.getGroup(gid);
            await window.chatController.openGroupChat(group);
        }, testGroupId);
        await page.waitForTimeout(1000);

        // Step 3: Send a message in the group
        console.log('\nStep 3: Sending a test message...');
        await page.evaluate(async (gid) => {
            await window.api.sendMessage({
                group_id: gid,
                content: 'Welcome team! Please review the project architecture, timeline, and deliverables for Q4.',
                message_type: 'text'
            });
            await window.chatController.loadGroupMessages(gid);
        }, testGroupId);
        await page.waitForTimeout(1000);

        // Step 4: Test Full Conversation Analysis
        console.log('\nStep 4: Opening Smart Conversations (Full Conversation Mode)...');
        await page.evaluate(() => {
            window.smartController.open();
        });

        await page.waitForSelector('#smartConversationModal.open, #smartConversationModal.active', { timeout: 8000 });
        console.log('✓ Smart Conversations modal opened.');

        // Wait for analysis to load
        await page.waitForSelector('#smartLoadingState', { state: 'hidden', timeout: 45000 });
        const isErrorVisible = await page.locator('#smartErrorState').isVisible();
        if (isErrorVisible) {
            const errDesc = await page.locator('#smartErrorDesc').innerText();
            throw new Error(`Smart Conversation failed with error: ${errDesc}`);
        }
        console.log('✓ Full Conversation analysis loaded successfully.');

        // Verify Full Conversation bar is visible
        const fullConvBar = page.locator('#smartFullConvBar');
        if (!(await fullConvBar.isVisible())) {
            throw new Error('Full Conversation bar should be visible in full mode');
        }

        // Close modal
        await page.click('#closeSmartModalBtn');
        await page.waitForTimeout(500);

        // Step 5: Test Targeted Document Analysis
        console.log('\nStep 5: Testing Targeted Document Analysis on existing document...');
        const docResult = await page.evaluate(async (gid) => {
            const res = await window.api.request('/api/files');
            const docs = Array.isArray(res) ? res : (res.documents || res.files || []);
            if (docs && docs.length > 0) {
                const targetDoc = docs[0];
                await window.smartController.openForDocument(gid, null, targetDoc.id, targetDoc.original_filename);
                return { success: true, doc: targetDoc };
            }
            return { success: false };
        }, testGroupId);

        if (!docResult.success) {
            throw new Error('No files found in database to test document analysis');
        }
        console.log(`Analyzing document ID=${docResult.doc.id} ("${docResult.doc.original_filename}")...`);

        await page.waitForSelector('#smartConversationModal.open, #smartConversationModal.active', { timeout: 5000 });
        await page.waitForSelector('#smartLoadingState', { state: 'hidden', timeout: 45000 });

        const isDocError = await page.locator('#smartErrorState').isVisible();
        if (isDocError) {
            const errText = await page.locator('#smartErrorDesc').innerText();
            throw new Error(`Document analysis failed with error: "${errText}"`);
        }

        // Verify Selected Document card is visible and displays document name
        const docCard = page.locator('#smartSelectedDocCard');
        if (!(await docCard.isVisible())) {
            throw new Error('Selected Document card should be visible in document analysis mode');
        }
        const displayedDocName = await page.locator('#smartSelectedDocName').innerText();
        console.log(`✓ Document analysis rendered successfully! Selected Doc: "${displayedDocName}"`);

        // Verify content tabs
        const summaryText = await page.locator('#smartSummaryPanel').innerText();
        console.log(`✓ Summary preview: ${summaryText.slice(0, 100).replace(/\n+/g, ' ')}...`);

        // Test Files tab
        console.log('\nStep 6: Testing Files tab...');
        await page.click('.smart-tab-btn[data-smart-tab="files"]');
        await page.waitForTimeout(500);
        const filesPanelVisible = await page.locator('#smartFilesPanel').isVisible();
        if (!filesPanelVisible) throw new Error('Files panel should be visible after clicking Files tab');
        console.log('✓ Files tab rendered cleanly.');

        // Test Full Conversation switch from Context Bar
        console.log('\nStep 7: Testing "Full Conversation" switch...');
        await page.click('#smartClearContextBtn');
        await page.waitForSelector('#smartLoadingState', { state: 'hidden', timeout: 20000 });
        if (!(await fullConvBar.isVisible())) {
            throw new Error('Expected Full Conversation bar after clearing context');
        }
        console.log('✓ Switched to Full Conversation mode cleanly.');

        // Test "Return to Targeted Analysis"
        console.log('\nStep 8: Testing "Return to Targeted Analysis" button...');
        const returnBtn = page.locator('#smartReturnTargetBtn');
        if (await returnBtn.isVisible()) {
            await returnBtn.click();
            await page.waitForSelector('#smartLoadingState', { state: 'hidden', timeout: 20000 });
            if (!(await docCard.isVisible())) {
                throw new Error('Expected Selected Document card after returning to targeted analysis');
            }
            console.log('✓ Returned to Targeted Analysis cleanly.');
        }

        // Step 9: Test Refresh & Try Again
        console.log('\nStep 9: Testing Refresh button...');
        const refreshBtn = page.locator('#smartHeaderRefreshBtn');
        if (await refreshBtn.isVisible()) {
            await refreshBtn.click();
            console.log('Clicked Refresh button...');
            await page.waitForSelector('#smartLoadingState', { state: 'hidden', timeout: 20000 });
            console.log('✓ Refresh reloaded analysis successfully.');
        }

        await page.click('#closeSmartModalBtn');

        // Step 10: Cleanup test group
        console.log('\nStep 10: Cleaning up test group...');
        await page.evaluate(async (gid) => {
            await window.api.deleteGroup(gid);
        }, testGroupId);
        console.log('✓ Isolated test group deleted.');

        console.log('\n==================================================');
        console.log('ALL SMART CONVERSATIONS TESTS PASSED SUCCESSFULLY (100%)!');
        console.log('==================================================');

    } catch (err) {
        console.error('\n❌ TEST FAILED:', err.message);
        await page.screenshot({ path: 'test_smart_failure.png', fullPage: true });
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
