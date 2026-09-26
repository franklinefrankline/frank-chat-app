const { chromium } = require('playwright');

async function testProd() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    const failed404s = [];

    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('response', res => {
        if (res.status() === 404) failed404s.push(res.url());
    });

    console.log('Testing production site: https://frank-chat-app.vercel.app/ ...');
    try {
        const resp = await page.goto('https://frank-chat-app.vercel.app/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        console.log('HTTP Status:', resp.status());
        const title = await page.title();
        console.log('Page Title:', title);

        const hasLangBtn = await page.locator('#langDropdownBtn').count();
        console.log('Has Language Selector on current deployed prod:', hasLangBtn > 0);
        console.log('Console errors:', consoleErrors.length);
        console.log('404 errors:', failed404s.length);
    } catch (e) {
        console.error('Prod test error:', e.message);
    } finally {
        await browser.close();
    }
}

testProd();
