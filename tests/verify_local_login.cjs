const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', msg => console.log('[LOCAL BROWSER]', msg.text()));

    const localFilePath = 'file://' + path.resolve(__dirname, '..', 'login.html').replace(/\\/g, '/');
    console.log('Navigating to local file:', localFilePath);
    await page.goto(localFilePath, { waitUntil: 'load' });

    const btn = page.locator('#loginSubmitBtn');
    const btnColor = await btn.evaluate(el => window.getComputedStyle(el).color);
    const btnBg = await btn.evaluate(el => window.getComputedStyle(el).backgroundColor);
    const btnText = (await btn.innerText()).trim();

    console.log('\n=== LOCAL BUTTON VISIBILITY CHECK ===');
    console.log('Button Inner Text:', JSON.stringify(btnText));
    console.log('Button Background:', btnBg);
    console.log('Button Text Color:', btnColor);

    if (btnColor === btnBg) {
        throw new Error('FAIL: Button text color is identical to background color!');
    }
    console.log('PASS: Button text is clearly visible locally!');

    console.log('\n=== LOCAL LOGIN RESILIENCE CHECK (NO LOCAL SERVER) ===');
    await page.fill('#loginUsername', 'alex');
    await page.fill('#loginPassword', 'password123');
    await btn.click();

    // Check toast or redirect
    await page.waitForTimeout(3000);
    const toast = await page.$('.toast');
    if (toast) {
        const toastText = (await toast.innerText()).trim();
        console.log('Toast displayed:', toastText);
        if (toastText.includes('Failed to fetch')) {
            throw new Error('FAIL: Still getting Failed to fetch error!');
        }
    }

    console.log('Current URL after login attempt:', page.url());
    console.log('PASS: Zero "Failed to fetch" errors encountered!');

    await browser.close();
    console.log('\n=== ALL LOCAL CHECKS PASSED 100% ===');
})().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
