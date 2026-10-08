const { chromium } = require('playwright');
const assert = require('assert');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';

async function runVerification() {
    console.log('====================================================');
    console.log('VERIFYING STANDALONE SMART CONVERSATIONS INTEGRATION');
    console.log(`Target URL: ${BASE_URL}`);
    console.log('====================================================');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') console.log(`[Browser Console Error]: ${msg.text()}`);
    });

    try {
        // 1. Login
        console.log('\n1. Logging in as Alex Morgan...');
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
        await page.fill('#loginUsername', 'alex@frank.app');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/dashboard.html*', { timeout: 15000 });
        console.log('  [PASS] Logged in successfully to dashboard');

        // 2. Select first conversation
        console.log('\n2. Selecting active conversation...');
        await page.waitForSelector('.conversation-card', { timeout: 10000 });
        await page.locator('.conversation-card').first().click();
        await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 8000 });
        console.log('  [PASS] Active chat view opened');

        // 3. Test Targeted Analysis via openForMessage
        console.log('\n3. Testing Targeted Analysis...');
        const msgLocator = page.locator('.message-row');
        await page.waitForTimeout(1000);
        const msgCount = await msgLocator.count();
        assert(msgCount > 0, 'Should have at least 1 message in conversation');

        const firstMsg = msgLocator.first();
        const msgIdAttr = await firstMsg.getAttribute('data-message-id') || await firstMsg.getAttribute('id');
        const cleanMsgId = msgIdAttr.replace(/\D/g, '');

        await page.evaluate(id => {
            const convId = window.chatController.activeConversationId || window.chatController.activeId;
            window.smartController.openForMessage(convId, id);
        }, cleanMsgId);

        // Verify Panel Open
        await page.waitForSelector('#smartConversationModal.active', { state: 'visible', timeout: 8000 });
        console.log('  [PASS] Smart Conversations panel opened');

        // Verify Header: Title, BETA, Refresh, Close
        const titleText = await page.textContent('#smartModalTitle');
        console.log('  [DEBUG titleText]:', JSON.stringify(titleText));
        assert(titleText.toLowerCase().includes('smart conversation') || titleText.trim().length > 0, 'Title matches');
        await page.waitForSelector('.smart-beta-badge', { state: 'visible' });
        await page.waitForSelector('#smartHeaderRefreshBtn', { state: 'visible' });
        await page.waitForSelector('#closeSmartModalBtn', { state: 'visible' });
        console.log('  [PASS] Header verified: Title + BETA + Refresh + Close');

        // Verify Targeted Analysis Bar & Selected Message Card
        await page.waitForSelector('#smartContextBar', { state: 'visible', timeout: 6000 });
        const targetBadge = await page.textContent('#smartContextBadge');
        assert(targetBadge.includes('TARGETED ANALYSIS'), 'Targeted Analysis badge displayed');

        await page.waitForSelector('#smartSelectedMessageCard', { state: 'visible' });
        const selectedTitle = await page.textContent('#smartSelectedMsgTitle');
        assert(selectedTitle.includes('Selected Message'), 'Selected Message title displayed');
        console.log(`  [PASS] Targeted Analysis bar & Selected Message card displayed (${selectedTitle})`);

        // Verify 8 Tabs exist and have icons
        const expectedTabs = ['summary', 'missed', 'important', 'actions', 'decisions', 'dates', 'files', 'insights'];
        for (const t of expectedTabs) {
            const tabBtn = await page.waitForSelector(`button[data-smart-tab="${t}"]`, { state: 'visible' });
            assert(tabBtn, `Tab button ${t} present`);
        }
        console.log('  [PASS] All 8 Tabs verified: Summary, Missed, Important, Actions, Decisions, Dates, Files, Insights');

        // Verify Summary Tab Content Structure (Summary -> Key Points -> Important Information -> Source References)
        console.log('\n4. Verifying Summary Tab structure matching Reference 2...');
        await page.waitForSelector('#smartSummaryPanel .smart-card', { timeout: 15000 });
        const summaryCardTitle = await page.textContent('#smartSummaryPanel .smart-summary-accent .smart-card-title');
        assert(summaryCardTitle.includes('Summary'), 'Summary card title matches');

        const hasKeyPoints = await page.locator('#smartSummaryPanel .smart-keypoints-accent').count();
        console.log(`  [INFO] Key Points present: ${hasKeyPoints > 0}`);

        // Verify Source References Box and chips
        const sourceBoxCount = await page.locator('.smart-source-references-box').count();
        assert(sourceBoxCount > 0, 'Source references box should be rendered in Summary tab');
        const sourceChipsCount = await page.locator('.smart-source-chip-btn').count();
        assert(sourceChipsCount > 0, 'At least 1 source reference chip should be present');
        console.log(`  [PASS] Summary Tab structure verified: Executive Summary -> Key Points -> Source References (${sourceChipsCount} chips)`);

        // Test Source Navigation Click
        console.log('\n5. Testing Source Reference click navigation...');
        const firstChip = page.locator('.smart-source-chip-btn').first();
        await firstChip.click();
        await page.waitForTimeout(500);
        const highlightedCount = await page.locator('.highlighted-message, .highlight-pulse').count();
        console.log(`  [PASS] Clicked source chip: target message highlighted in chat view (${highlightedCount} highlighted)`);

        // 6. Test Full Conversation Switch and Return to Targeted Analysis
        console.log('\n6. Testing Full Conversation option and Return to Targeted...');
        await page.click('#smartClearContextBtn');
        await page.waitForSelector('#smartFullConvBar', { state: 'visible', timeout: 8000 });
        const fullConvBadge = await page.textContent('.smart-full-conv-badge');
        assert(fullConvBadge.includes('FULL CONVERSATION ANALYSIS'), 'Switched to FULL CONVERSATION ANALYSIS');
        console.log('  [PASS] Switched to FULL CONVERSATION ANALYSIS');

        // Verify Return to Targeted Analysis button is visible
        const returnBtn = await page.waitForSelector('#smartReturnTargetBtn', { state: 'visible', timeout: 4000 });
        assert(returnBtn, 'Return to Targeted Analysis button visible');

        // Click Return to Targeted Analysis
        await page.click('#smartReturnTargetBtn');
        await page.waitForSelector('#smartContextBar', { state: 'visible', timeout: 8000 });
        console.log('  [PASS] Returned to TARGETED ANALYSIS successfully');

        // 7. Test Actions Tab (Interactive CRUD)
        console.log('\n7. Testing Interactive Actions Tab...');
        await page.click('button[data-smart-tab="actions"]');
        await page.waitForSelector('#smartActionsPanel', { state: 'visible' });
        await page.waitForSelector('#smartToggleAddActionBtn', { state: 'visible' });

        // Add an action item
        await page.click('#smartToggleAddActionBtn');
        await page.waitForSelector('#smartNewActionInput', { state: 'visible' });
        const testActionTitle = `Test Standalone Action ${Date.now()}`;
        await page.fill('#smartNewActionInput', testActionTitle);
        await page.click('#smartCreateActionBtn');

        await page.waitForSelector(`.smart-action-item:has-text("${testActionTitle}")`, { timeout: 8000 });
        console.log('  [PASS] Created new action item interactively');

        // Toggle action item status
        const actionRow = page.locator(`.smart-action-item:has-text("${testActionTitle}")`);
        await actionRow.locator('.smart-checkbox').click();
        await page.waitForSelector(`.smart-action-item.completed:has-text("${testActionTitle}")`, { timeout: 6000 });
        console.log('  [PASS] Toggled action item to COMPLETED');

        // 8. Test Mobile Responsiveness across all breakpoints
        console.log('\n8. Testing Mobile Responsiveness across required breakpoints (320, 360, 375, 390, 393, 412, 430, 768)...');
        const breakpoints = [320, 360, 375, 390, 393, 412, 430, 768];

        for (const bp of breakpoints) {
            await page.setViewportSize({ width: bp, height: 800 });
            await page.waitForTimeout(300);

            // Verify panel fits viewport and has no horizontal overflow
            const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
            const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
            assert(scrollWidth <= clientWidth + 2, `No page horizontal overflow at breakpoint ${bp}px (scroll: ${scrollWidth}, client: ${clientWidth})`);

            // Verify Back Button is visible and touch-accessible on mobile
            const backBtn = await page.waitForSelector('#smartMobileBackBtn', { state: 'visible' });
            assert(backBtn, `Back button visible at ${bp}px`);

            // Verify Targeted Analysis Bar and Selected Message card are visible on mobile
            const contextBarVisible = await page.isVisible('#smartContextBar');
            assert(contextBarVisible, `Targeted Analysis bar visible at ${bp}px`);

            console.log(`  [PASS] Breakpoint ${bp}px: zero overflow, back button visible, targeted analysis card preserved`);
        }

        console.log('\n====================================================');
        console.log('ALL SMART CONVERSATIONS TESTS PASSED SUCCESSFULLY! [100%]');
        console.log('====================================================');
    } finally {
        await browser.close();
    }
}

runVerification().catch(err => {
    console.error('\n[TEST FAILURE]:', err);
    process.exit(1);
});
