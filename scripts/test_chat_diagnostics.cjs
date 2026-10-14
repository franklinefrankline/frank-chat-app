const { chromium } = require('playwright');

(async () => {
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmcmFua2xpbmVzYW15MjAwNiIsInVzZXJfaWQiOjI3NCwiZW1haWwiOiJmcmFua2xpbmVzYW15MjAwNkBnbWFpbC5jb20iLCJyb2xlIjoidXNlciIsImV4cCI6MTc5MjUzNjczOH0.zCfLkXEBns234xAHnpxcGESxwVoNNl4aWStOUDGPFQk';
    const user = {
        id: 274,
        username: 'franklinesamy2006',
        email: 'franklinesamy2006@gmail.com',
        full_name: 'Frank',
        role: 'user',
        frank_id: 'WTW28X',
        account_status: 'active'
    };

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleLogs = [];
    page.on('console', msg => {
        consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    page.on('pageerror', err => {
        console.error('[PAGE ERROR]', err.message);
    });

    // Seed local storage before navigating
    await page.addInitScript(({ token, user }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(user));
        localStorage.setItem('frank_onboarded', 'true');
    }, { token, user });

    console.log('Navigating to http://localhost:8000/dashboard.html ...');
    await page.goto('http://localhost:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('Console logs on load (first 10):');
    consoleLogs.slice(0, 10).forEach(l => console.log(l));

    // Check conversation cards
    const cards = await page.$$eval('.conversation-card', els => els.map(e => ({
        id: e.dataset.id,
        name: e.querySelector('.conversation-name')?.textContent?.trim()
    })));
    console.log('Conversation cards found:', cards);

    // Click Berlin
    const berlinCard = await page.$('.conversation-card[data-id="23"]');
    if (berlinCard) {
        console.log('Clicking Berlin card...');
        await berlinCard.click();
        await page.waitForTimeout(2000);
        const msgs = await page.$$eval('.message-row', els => els.map(e => e.textContent.trim().slice(0, 50)));
        console.log('Messages loaded for Berlin count:', msgs.length, msgs);
    } else {
        console.log('Berlin card not found by data-id=23');
    }

    // Click Self (Frank)
    const selfCard = await page.$('.conversation-card.is-self-chat, .conversation-card[data-id="274"]');
    if (selfCard) {
        console.log('Clicking Self card...');
        await selfCard.click();
        await page.waitForTimeout(2000);
        const msgs = await page.$$eval('.message-row', els => els.map(e => e.textContent.trim().slice(0, 50)));
        console.log('Messages loaded for Self count:', msgs.length, msgs);
    }

    // Wait 5 seconds to observe if any continuous reloads or blinks occur
    console.log('Waiting 5 seconds to monitor reloads / blinks...');
    const initialLogCount = consoleLogs.length;
    await page.waitForTimeout(5000);
    console.log('New logs during wait:', consoleLogs.slice(initialLogCount));

    await browser.close();
    console.log('Diagnostic test completed.');
})();
