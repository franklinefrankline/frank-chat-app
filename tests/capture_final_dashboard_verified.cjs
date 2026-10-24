const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('Capturing final verified dashboard screenshots...');
    const authRes = await fetch('http://127.0.0.1:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'frankline30999112@gmail.com', password: '#Frankline2006' })
    });
    const authData = await authRes.json();
    const token = authData.access_token;
    const userObj = authData.user;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    await page.addInitScript(({ token, userObj }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('frank_token', token);
        localStorage.setItem('frank_auth_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(userObj));
        localStorage.setItem('frank_user', JSON.stringify(userObj));
        localStorage.setItem('frank_onboarded', 'true');
    }, { token, userObj });

    await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Click first conversation if available
    const firstChat = await page.$('.conversation-card');
    if (firstChat) {
        await firstChat.click();
        await page.waitForTimeout(1000);
    }

    const dest = path.resolve(__dirname, 'final_dashboard_verified.png');
    await page.screenshot({ path: dest, fullPage: false });
    console.log('Final screenshot saved to:', dest);

    await browser.close();
})();
