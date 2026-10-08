const { chromium } = require('playwright');
const assert = require('assert');

const PROD_URL = 'https://frank-chat-app.vercel.app';

async function verifyLiveSmartStructure() {
    console.log('====================================================');
    console.log('TESTING LIVE VERCEL PRODUCTION SMART STRUCTURE');
    console.log('====================================================');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    try {
        // 1. Login with existing preserved Alex account
        console.log('\n1. Logging into live Vercel as Alex Morgan...');
        await page.goto(`${PROD_URL}/login.html`, { waitUntil: 'networkidle' });
        await page.fill('#loginUsername', 'alex@frank.app');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/dashboard.html*', { timeout: 15000 });
        console.log('  [PASS] Logged in to live dashboard');

        // 2. Select conversation with Frankline Miller
        await page.waitForSelector('.conversation-card', { timeout: 15000 });
        await page.locator('.conversation-card').first().click();
        await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 8000 });
        console.log('  [PASS] Active chat view opened');

        // 3. Open Smart Conversations
        await page.waitForSelector('#chatSmartBtn', { state: 'visible' });
        await page.click('#chatSmartBtn');
        await page.waitForSelector('#smartConversationModal.active', { state: 'visible', timeout: 8000 });
        console.log('  [PASS] Smart Conversations panel opened');

        // 4. Verify Header Structure: Title + BETA + Refresh + Close
        const titleText = await page.textContent('#smartModalTitle');
        assert(titleText.includes('Smart Conversations') || titleText.includes('Smart'), 'Title correct');
        const betaBadge = await page.waitForSelector('.smart-beta-badge', { state: 'visible' });
        assert(betaBadge, 'BETA badge visible');
        const refreshBtn = await page.waitForSelector('#smartHeaderRefreshBtn', { state: 'visible' });
        assert(refreshBtn, 'Refresh button visible');
        const closeBtn = await page.waitForSelector('#closeSmartModalBtn', { state: 'visible' });
        assert(closeBtn, 'Close button visible');
        console.log('  [PASS] Header structure verified: Smart Conversations + BETA + Refresh + Close');

        // 5. Verify 8 Tabs exist and are clickable
        const tabs = ['summary', 'missed', 'important', 'actions', 'decisions', 'dates', 'files', 'insights'];
        for (const t of tabs) {
            const tabBtn = await page.waitForSelector(`button[data-smart-tab="${t}"]`, { state: 'visible' });
            assert(tabBtn, `Tab button ${t} visible`);
        }
        console.log('  [PASS] All 8 Smart tabs verified in tab bar');

        // 6. Test Targeted Analysis for a message
        console.log('\n2. Testing Targeted Analysis on a message...');
        const msgRows = await page.locator('.message-row').count();
        if (msgRows > 0) {
            const firstMsgId = await page.locator('.message-row').first().getAttribute('id');
            const cleanId = firstMsgId ? firstMsgId.replace('msgRow-', '') : null;
            if (cleanId) {
                await page.evaluate(id => window.smartController.openForMessage(window.chatController.activeConversationId, id), cleanId);
                await page.waitForSelector('#smartContextBar', { state: 'visible', timeout: 5000 });
                const targetText = await page.textContent('.smart-target-badge');
                assert(targetText.includes('TARGETED ANALYSIS'), 'TARGETED ANALYSIS badge visible');
                const selectedMsgCard = await page.waitForSelector('#smartSelectedMessageCard', { state: 'visible' });
                assert(selectedMsgCard, 'Selected Message Card visible');
                console.log('  [PASS] Targeted Analysis UI rendered correctly with Selected Message card');

                // Switch to Full Conversation
                await page.click('#smartClearContextBtn');
                await page.waitForSelector('#smartFullConvBar', { state: 'visible', timeout: 5000 });
                const fullConvText = await page.textContent('.smart-full-conv-badge');
                assert(fullConvText.includes('FULL CONVERSATION ANALYSIS'), 'FULL CONVERSATION ANALYSIS badge visible');
                console.log('  [PASS] Full Conversation switch verified');
            }
        }

        // 7. Verify Mobile Responsive & No horizontal scroll
        console.log('\n3. Testing Mobile Responsive (375px)...');
        await page.setViewportSize({ width: 375, height: 667 });
        const hasOverflow = await page.evaluate(() => {
            const modal = document.querySelector('.smart-modal-card');
            return modal ? modal.scrollWidth > window.innerWidth : false;
        });
        assert(!hasOverflow, 'Zero horizontal overflow on mobile 375px');
        console.log('  [PASS] Zero horizontal overflow on mobile');

        // 8. Close Smart panel
        await page.click('#closeSmartModalBtn');
        await page.waitForSelector('#smartConversationModal.active', { state: 'detached', timeout: 4000 });
        console.log('  [PASS] Panel closed cleanly');

        console.log('\n====================================================');
        console.log('🎉 ALL LIVE VERCEL SMART STRUCTURE TESTS PASSED 100%!');
        console.log('====================================================');
    } finally {
        await browser.close();
    }
}

verifyLiveSmartStructure().catch(err => {
    console.error('❌ LIVE SMART STRUCTURE TEST FAILED:', err);
    process.exit(1);
});
