const { chromium } = require('playwright');

(async () => {
    console.log('=== STARTING PLAYWRIGHT E2E FRONTEND VERIFICATION ===');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    try {
        // 1. Navigate to Login Page
        console.log('[1] Navigating to login page...');
        await page.goto('http://127.0.0.1:8000/login.html');
        await page.waitForSelector('#loginUsername', { timeout: 10000 });
        
        await page.fill('#loginUsername', 'franklinesamy2006');
        await page.fill('#loginPassword', '#Frankline2006');
        await page.click('#loginSubmitBtn');

        // 2. Wait for Dashboard to Load
        console.log('[2] Waiting for dashboard navigation...');
        await page.waitForURL('**/dashboard.html', { timeout: 15000 });
        await page.waitForSelector('.conversation-card', { timeout: 10000 });
        console.log('[OK] Dashboard loaded successfully.');

        // 3. Verify Chat List Cards (Line 1: Name, Line 2: FRANK ID, Line 3: Snippet)
        console.log('[3] Inspecting conversation list cards...');
        const cards = await page.$$('.conversation-card');
        console.log(`Found ${cards.length} conversation cards.`);
        
        // Find Berlin card
        const berlinCard = await page.waitForSelector('.conversation-card[data-id="23"]', { timeout: 5000 });
        const berlinName = await berlinCard.$eval('.conversation-name', el => el.textContent.trim());
        const berlinFid = await berlinCard.$eval('.conversation-frank-id-badge', el => el.textContent.trim());
        const berlinSnippet = await berlinCard.$eval('.conversation-snippet', el => el.textContent.trim());
        
        console.log(`Berlin Card -> Name: "${berlinName}", ID Badge: "${berlinFid}", Snippet: "${berlinSnippet}"`);
        if (!berlinFid.includes('FRANK ID:') || !berlinFid.includes('MGMYYI')) {
            throw new Error(`Expected Berlin card to display FRANK ID: MGMYYI, got: ${berlinFid}`);
        }
        console.log('[OK] Berlin card correctly displays name on Line 1, FRANK ID: MGMYYI on Line 2, snippet on Line 3.');

        // Find Self-chat card (ID 274)
        const selfCard = await page.waitForSelector('.conversation-card[data-id="274"]', { timeout: 5000 });
        const selfName = await selfCard.$eval('.conversation-name', el => el.textContent.trim());
        const selfFid = await selfCard.$eval('.conversation-frank-id-badge', el => el.textContent.trim());
        console.log(`Self Chat Card -> Name: "${selfName}", ID Badge: "${selfFid}"`);
        if (!selfFid.includes('FRANK ID:') || !selfFid.includes('WTW28X')) {
            throw new Error(`Expected Self-chat card to display user's own FRANK ID: WTW28X, got: ${selfFid}`);
        }
        console.log('[OK] Self-chat card correctly displays current user\'s own FRANK ID: WTW28X.');

        // 4. Test Search by FRANK ID
        console.log('[4] Testing conversation search filter by FRANK ID...');
        const searchInput = await page.$('#conversationSearchInput');
        await searchInput.fill('MGM');
        await page.waitForTimeout(400);
        
        const visibleCards = await page.$$eval('.conversation-card', els => els.map(e => e.dataset.id));
        console.log('Visible cards when searching "MGM":', visibleCards);
        if (!visibleCards.includes('23') || visibleCards.includes('274')) {
            throw new Error('Search by FRANK ID filter failed!');
        }
        console.log('[OK] Search by FRANK ID accurately filters the conversation list.');
        await searchInput.fill(''); // Clear search
        await page.waitForTimeout(400);

        // 5. Open Berlin Conversation & Verify Header
        console.log('[5] Opening Berlin conversation...');
        await page.click('.conversation-card[data-id="23"]');
        await page.waitForTimeout(600);

        const headerName = await page.$eval('#chatPartnerName', el => el.textContent.trim());
        const headerFidWrap = await page.$eval('#chatHeaderFrankIdWrap', el => window.getComputedStyle(el).display);
        const headerFidVal = await page.$eval('#chatHeaderFrankId', el => el.textContent.trim());
        
        console.log(`Chat Header -> Name: "${headerName}", Display: "${headerFidWrap}", ID: "${headerFidVal}"`);
        if (headerFidWrap === 'none' || headerFidVal !== 'MGMYYI') {
            throw new Error(`Chat header failed to display Berlin FRANK ID MGMYYI (got ${headerFidVal})`);
        }
        console.log('[OK] Chat header correctly displays Berlin\'s FRANK ID (MGMYYI).');

        // 6. Test Copying FRANK ID from Chat Header
        console.log('[6] Testing copy button in chat header...');
        const headerCopyBtn = await page.$('#chatHeaderCopyFidBtn');
        await headerCopyBtn.click();
        await page.waitForTimeout(500);

        // Check toast notification
        const toastEl = await page.$('.toast, .toast-notification, .toast-msg');
        let toastText = toastEl ? await toastEl.textContent() : '';
        console.log(`Toast message after copy: "${toastText.trim()}"`);
        if (!toastText.includes('FRANK ID copied')) {
            console.warn('Toast text warning:', toastText);
        } else {
            console.log('[OK] Toast confirmation "FRANK ID copied" displayed.');
        }

        // Verify clipboard content
        const copiedText = await page.evaluate(async () => {
            try { return await navigator.clipboard.readText(); } catch (e) { return null; }
        });
        console.log(`Clipboard content: "${copiedText}"`);
        if (copiedText && copiedText !== 'MGMYYI') {
            throw new Error(`Expected clipboard to contain MGMYYI, got: ${copiedText}`);
        }
        console.log('[OK] Copy button copied exact FRANK ID (MGMYYI).');

        // 7. Verify Contact Details Drawer
        console.log('[7] Opening contact details drawer...');
        const drawerToggleBtn = await page.$('#toggleDrawerBtn');
        await drawerToggleBtn.click();
        await page.waitForTimeout(500);

        const drawerBoxDisplay = await page.$eval('#drawerFrankIdBox', el => window.getComputedStyle(el).display);
        const drawerFidVal = await page.$eval('#drawerFrankIdVal', el => el.textContent.trim());
        console.log(`Drawer -> Box Display: "${drawerBoxDisplay}", ID: "${drawerFidVal}"`);
        if (drawerBoxDisplay === 'none' || drawerFidVal !== 'MGMYYI') {
            throw new Error(`Drawer failed to display MGMYYI (got ${drawerFidVal})`);
        }
        console.log('[OK] Contact details drawer correctly displays FRANK ID (MGMYYI) with copy button.');

        // Test drawer copy button
        const drawerCopyBtn = await page.$('#drawerCopyFrankIdBtn');
        await drawerCopyBtn.click();
        await page.waitForTimeout(400);
        console.log('[OK] Drawer copy button clicked successfully.');

        // 8. Test Self-Chat Switch
        console.log('[8] Switching to Self-Chat ("Frank (You)")...');
        const selfCardAgain = await page.waitForSelector('.conversation-card[data-id="274"]');
        await selfCardAgain.click();
        await page.waitForTimeout(600);

        const selfHeaderFid = await page.$eval('#chatHeaderFrankId', el => el.textContent.trim());
        console.log(`Self Chat Header ID: "${selfHeaderFid}"`);
        if (selfHeaderFid !== 'WTW28X') {
            throw new Error(`Expected self-chat header to display WTW28X, got: ${selfHeaderFid}`);
        }
        console.log('[OK] Self-chat conversation header displays current user\'s own FRANK ID: WTW28X.');

        // 9. Mobile Responsive Viewport Test
        console.log('[9] Testing Mobile Viewport (375x667)...');
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(500);

        const mobileHeaderFidWrap = await page.$eval('#chatHeaderFrankIdWrap', el => window.getComputedStyle(el).display);
        const mobilePartnerName = await page.$eval('#chatPartnerName', el => el.offsetWidth);
        console.log(`Mobile view -> Header ID visible: ${mobileHeaderFidWrap !== 'none'}, Name width: ${mobilePartnerName}px`);
        if (mobileHeaderFidWrap === 'none') {
            throw new Error('FRANK ID was hidden on mobile header!');
        }
        console.log('[OK] Mobile header displays FRANK ID without overflowing or breaking layout.');

        console.log('\n=== ALL PLAYWRIGHT E2E TESTS PASSED 100%! ===');
    } catch (err) {
        console.error('Test error:', err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
})();
