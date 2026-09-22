const { chromium } = require('playwright');

async function auditLiveVercel() {
    console.log('--- Launching Playwright Audit on Live Vercel ---');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    const consoleLogs = [];
    const failedRequests = [];
    const wsAttempts = [];

    page.on('console', msg => {
        consoleLogs.push({ type: msg.type(), text: msg.text() });
        console.log(`[BROWSER ${msg.type().toUpperCase()}]`, msg.text());
    });

    page.on('pageerror', err => {
        console.log('[PAGE ERROR]', err.message);
    });

    page.on('requestfailed', req => {
        failedRequests.push({ url: req.url(), failure: req.failure() });
        console.log('[REQUEST FAILED]', req.url(), req.failure());
    });

    page.on('websocket', ws => {
        wsAttempts.push(ws.url());
        console.log('[WEBSOCKET OPENING]', ws.url());
        ws.on('framesent', f => console.log('[WS SENT]', f.payload));
        ws.on('framereceived', f => console.log('[WS RECEIVED]', f.payload));
        ws.on('close', () => console.log('[WS CLOSED]', ws.url()));
        ws.on('socketerror', err => console.log('[WS ERROR]', err));
    });

    try {
        console.log('1. Navigating to login page...');
        await page.goto('https://frank-chat-app.vercel.app/login.html');
        await page.waitForLoadState('networkidle');

        console.log('2. Logging in as alex...');
        await page.fill('#loginUsername', 'alex');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');

        await page.waitForURL('**/dashboard.html', { timeout: 15000 });
        console.log('3. Redirected to dashboard:', page.url());

        // Wait 5 seconds to observe WebSocket, pollers, and initial loads
        await page.waitForTimeout(5000);

        // Check user info in DOM
        const userName = await page.textContent('#sidebarUserName');
        const userFrankId = await page.textContent('#sidebarUserFrankId');
        console.log('Dashboard loaded for:', userName?.trim(), 'FRANK ID:', userFrankId?.trim());

        // Check conversation list
        const convCount = await page.locator('.conversation-item').count();
        console.log('Rendered conversations count:', convCount);

        // Check messages if conversation clicked
        if (convCount > 0) {
            console.log('4. Clicking first conversation...');
            await page.locator('.conversation-item').first().click();
            await page.waitForTimeout(2000);
            const msgCount = await page.locator('.chat-bubble-container, .message-bubble').count();
            console.log('Rendered messages in chat:', msgCount);
        }

        // Test opening admin
        console.log('5. Navigating to admin.html...');
        await page.goto('https://frank-chat-app.vercel.app/admin.html');
        await page.waitForTimeout(3000);
        const adminHeader = await page.locator('.admin-header, h1, #adminUserName').first().textContent().catch(() => 'N/A');
        console.log('Admin header/user:', adminHeader?.trim());

        console.log('\n--- AUDIT SUMMARY ---');
        console.log('Failed Requests:', failedRequests.length);
        failedRequests.forEach(f => console.log(' -', f.url, f.failure));
        console.log('WebSocket Attempts:', wsAttempts.length);
        wsAttempts.forEach(w => console.log(' -', w));

    } catch (err) {
        console.error('Audit failed:', err);
    } finally {
        await browser.close();
    }
}

auditLiveVercel();
