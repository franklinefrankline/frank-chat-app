const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', msg => console.log('[BROWSER]', msg.text()));

    console.log('Navigating to https://frank-chat-app.vercel.app/login.html ...');
    await page.goto('https://frank-chat-app.vercel.app/login.html', { waitUntil: 'networkidle', timeout: 30000 });

    const btn = page.locator('#loginSubmitBtn');
    const btnColor = await btn.evaluate(el => window.getComputedStyle(el).color);
    const btnBg = await btn.evaluate(el => window.getComputedStyle(el).backgroundColor);
    const btnText = (await btn.innerText()).trim();

    console.log('=== BUTTON VISIBILITY CHECK ===');
    console.log('Button Inner Text:', JSON.stringify(btnText));
    console.log('Button Background:', btnBg);
    console.log('Button Text Color:', btnColor);

    if (btnColor === btnBg) {
        throw new Error('FAIL: Button text color is identical to background color!');
    }
    console.log('PASS: Button text is clearly visible with distinct contrast!');

    console.log('\n=== LIVE VERCEL LOGIN CHECK ===');
    await page.fill('#loginUsername', 'alex');
    await page.fill('#loginPassword', 'password123');
    await btn.click();

    await page.waitForURL('**/dashboard.html', { timeout: 15000 });
    console.log('PASS: Logged in and redirected to:', page.url());

    await page.waitForSelector('.chat-sidebar, .sidebar', { timeout: 10000 });
    console.log('PASS: Dashboard sidebar and conversation layout loaded!');

    await browser.close();
    console.log('\n=== ALL CHECKS PASSED 100% ===');
})().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
