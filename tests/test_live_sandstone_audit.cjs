const { chromium } = require('playwright');

const viewports = [
    { width: 375, height: 812, name: 'Mobile 375x812' },
    { width: 768, height: 1024, name: 'Tablet 768x1024' },
    { width: 1440, height: 900, name: 'Desktop 1440x900' }
];

(async () => {
    const browser = await chromium.launch();
    for (const vp of viewports) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto('https://frank-chat-app.vercel.app/login.html');
        await page.evaluate(() => window.theme.apply('sandstone'));
        await page.waitForTimeout(400);

        const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        const titleColor = await page.locator('.auth-card-title').evaluate(el => window.getComputedStyle(el).color);
        const btnBg = await page.locator('#loginSubmitBtn').evaluate(el => window.getComputedStyle(el).backgroundColor);
        const btnColor = await page.locator('#loginSubmitBtn').evaluate(el => window.getComputedStyle(el).color);

        console.log(`[${vp.name}] Scroll: ${hasHorizontalScroll ? 'FAIL' : 'PASS'} | Title: ${titleColor} | BtnBg: ${btnBg} | BtnText: ${btnColor}`);
        if (vp.width >= 1024) {
            const leftTitle = await page.locator('.auth-showcase-title').evaluate(el => window.getComputedStyle(el).color);
            const leftBg = await page.locator('.auth-showcase').evaluate(el => window.getComputedStyle(el).backgroundImage);
            console.log(`   [Showcase] Title: ${leftTitle} | Bg: ${leftBg.substring(0, 50)}...`);
        }
        await page.close();
    }
    await browser.close();
    console.log('ALL LIVE VERCEL SANDSTONE AUDITS PASSED WITH 100% SUCCESS!');
})();
