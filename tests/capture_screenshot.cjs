const { chromium } = require('playwright');
const path = require('path');

async function capture() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:8000/login.html');
    await page.fill('#loginUsername', 'alex');
    await page.fill('#loginPassword', 'password123');
    await page.click('#loginSubmitBtn');
    await page.waitForURL('**/dashboard.html');

    await page.evaluate(() => {
        const loader = document.getElementById('appLoadingScreen');
        if (loader) loader.remove();
    });

    await page.waitForSelector('#conversationList .conversation-card', { timeout: 10000 });
    const selfCard = page.locator('#conversationList .conversation-card', { hasText: '(You)' }).first();
    await selfCard.click();

    await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
    await page.waitForFunction(() => window.wsClient && window.wsClient.isConnected, { timeout: 10000 });

    // Send a message with link
    const linkMsg = 'Check out our link: https://frank.app/features and www.google.com!';
    await page.fill('#messageComposerTextarea', linkMsg);
    await page.click('#composerSendBtn');
    await page.waitForTimeout(600);

    const linkRow = page.locator('.message-row', { hasText: 'Check out our link:' }).last();
    await linkRow.waitFor({ state: 'visible', timeout: 5000 });

    // Open in-message context menu
    await linkRow.hover();
    await linkRow.locator('.msg-action-more-btn').click();
    await page.waitForSelector('#activeMessageContextMenu', { state: 'visible', timeout: 5000 });

    // Capture screenshot of the full viewport
    const screenshotPath = path.resolve('C:/Users/inbat/.gemini/antigravity-ide/brain/189c0e95-6299-4799-9b34-4531f90be4f5/new_features_verified.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log('Screenshot saved to:', screenshotPath);

    await browser.close();
}

capture().catch(err => {
    console.error('Screenshot capture failed:', err);
    process.exit(1);
});
