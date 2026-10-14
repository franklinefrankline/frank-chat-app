const { chromium } = require('playwright');
const { execSync } = require('child_process');

async function testProfileLoading() {
    console.log('Testing profile loading diagnosis...');
    const token = execSync('python -c "import sys; sys.path.append(\'backend\'); from security import create_access_token; print(create_access_token({\'sub\': \'berline\', \'id\': 23, \'email\': \'berline@gmail.com\'}))"')
        .toString().trim();

    const browser = await chromium.launch({ headless: true });
    
    // Test Case 1: Token exists, chatapp_user exists
    console.log('\n--- Case 1: Token exists, chatapp_user exists ---');
    const ctx1 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page1 = await ctx1.newPage();
    const consoleLogs = [];
    page1.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page1.on('pageerror', err => consoleLogs.push(`[PAGE ERROR] ${err.message}`));

    await page1.addInitScript(({ token }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify({
            id: 23,
            username: 'berline',
            email: 'berline@gmail.com',
            full_name: 'Berline',
            frank_id: 'BERLINE1'
        }));
    }, { token });

    await page1.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'networkidle' });
    await page1.waitForTimeout(1000);

    const userName1 = await page1.$eval('#topHeaderUserName', el => el.textContent);
    console.log('Case 1 topHeaderUserName:', userName1);

    // Test Case 2: ONLY token exists (e.g. after refresh or clearing user cache or different tab)
    console.log('\n--- Case 2: ONLY token exists, NO chatapp_user in localStorage ---');
    const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page2 = await ctx2.newPage();
    const consoleLogs2 = [];
    page2.on('console', msg => consoleLogs2.push(`[${msg.type()}] ${msg.text()}`));
    page2.on('pageerror', err => consoleLogs2.push(`[PAGE ERROR] ${err.message}`));

    await page2.addInitScript(({ token }) => {
        localStorage.setItem('chatapp_token', token);
        // NO chatapp_user
    }, { token });

    await page2.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'networkidle' });
    await page2.waitForTimeout(1000);

    const userName2 = await page2.$eval('#topHeaderUserName', el => el.textContent);
    console.log('Case 2 topHeaderUserName:', userName2);
    console.log('Case 2 logs:', consoleLogs2);

    await browser.close();
}

testProfileLoading().catch(console.error);
