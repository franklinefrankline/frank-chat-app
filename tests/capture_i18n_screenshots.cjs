const { chromium } = require('playwright');
const path = require('path');

async function capture() {
    const browser = await chromium.launch({ headless: true });
    
    // Desktop Viewport (1440x900)
    const contextDesk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pageDesk = await contextDesk.newPage();

    // 1. English Desktop
    await pageDesk.goto('http://localhost:8000/index.html');
    await pageDesk.waitForTimeout(500);
    await pageDesk.screenshot({ path: path.join(__dirname, 'screenshot_landing_en.png'), fullPage: false });

    // 2. Tamil Desktop
    await pageDesk.evaluate(() => window.i18n.setLanguage('ta'));
    await pageDesk.waitForTimeout(400);
    await pageDesk.screenshot({ path: path.join(__dirname, 'screenshot_landing_ta.png'), fullPage: false });

    // 3. Hindi Desktop
    await pageDesk.evaluate(() => window.i18n.setLanguage('hi'));
    await pageDesk.waitForTimeout(400);
    await pageDesk.screenshot({ path: path.join(__dirname, 'screenshot_landing_hi.png'), fullPage: false });

    // 4. Mobile Viewport (375x667)
    const contextMob = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const pageMob = await contextMob.newPage();
    await pageMob.goto('http://localhost:8000/index.html');
    await pageMob.waitForTimeout(500);
    await pageMob.screenshot({ path: path.join(__dirname, 'screenshot_landing_mobile_en.png'), fullPage: false });

    // Open mobile drawer
    await pageMob.locator('#landingMobileToggle').click();
    await pageMob.waitForTimeout(300);
    await pageMob.screenshot({ path: path.join(__dirname, 'screenshot_landing_mobile_drawer.png'), fullPage: false });

    await browser.close();
    console.log('Screenshots captured successfully.');
}

capture().catch(err => console.error(err));
