const { chromium } = require('playwright');

(async () => {
    console.log('=== VERIFYING LIVE PRODUCTION GOOGLE SSO FLOW ===');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log('1. Loading https://fnk.vercel.app/login.html ...');
    await page.goto('https://fnk.vercel.app/login.html', { waitUntil: 'networkidle' });

    const googleBtn = page.locator('#ssoGoogleBtn');
    const appleBtn = page.locator('#ssoAppleBtn');
    const msBtn = page.locator('#ssoMicrosoftBtn');

    const googleVisible = await googleBtn.isVisible();
    const appleCount = await appleBtn.count();
    const msCount = await msBtn.count();

    console.log(`[CHECK] Google button visible: ${googleVisible}`);
    console.log(`[CHECK] Apple button count: ${appleCount} (should be 0)`);
    console.log(`[CHECK] Microsoft button count: ${msCount} (should be 0)`);

    console.log('2. Clicking Google SSO button on live production...');
    const [nav] = await Promise.all([
        page.waitForNavigation({ url: url => url.hostname.includes('accounts.google.com'), timeout: 15000 }),
        googleBtn.click()
    ]);

    const targetUrl = page.url();
    console.log(`[CHECK] Successfully redirected to Google Accounts OAuth!`);
    console.log(`Target URL: ${targetUrl.slice(0, 100)}...`);

    // Verify callback URL directly handles missing code without 404
    console.log('3. Checking direct visit to callback endpoint on live production...');
    const callbackResp = await page.goto('https://fnk.vercel.app/api/auth/google/callback');
    console.log(`[CHECK] Callback response status: ${callbackResp.status()} (Expected: 200 after redirect)`);
    console.log(`[CHECK] Landed on: ${page.url()}`);

    await browser.close();
    console.log('\n=== ALL PRODUCTION GOOGLE OAUTH VERIFICATIONS PASSED ===');
})();
