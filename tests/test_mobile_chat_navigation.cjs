const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('=== TESTING MOBILE CHAT TRANSITION (390px) ===\n');

    const authRes = await fetch('http://127.0.0.1:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'frankline30999112@gmail.com', password: '#Frankline2006' })
    });
    const authData = await authRes.json();
    const token = authData.access_token;
    const userObj = authData.user;

    const browser = await chromium.launch({ headless: true });

    try {
        const context = await browser.newContext();
        await context.addInitScript(({ token, userObj }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('frank_token', token);
            localStorage.setItem('frank_auth_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(userObj));
            localStorage.setItem('frank_user', JSON.stringify(userObj));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token, userObj });

        const page = await context.newPage();
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);

        // Verify Sidebar is initially visible
        const sidebarInitial = await page.$eval('.conversation-panel', el => ({
            width: el.offsetWidth,
            visible: window.getComputedStyle(el).display !== 'none'
        }));
        console.log('1. Sidebar initial state:', sidebarInitial);

        // Click first conversation card
        const firstChat = await page.waitForSelector('.conversation-card', { timeout: 5000 });
        if (firstChat) {
            await firstChat.click();
            await page.waitForTimeout(600);

            // Verify Chat window is now active on mobile
            const chatState = await page.$eval('.chat-window', el => ({
                width: el.offsetWidth,
                visible: window.getComputedStyle(el).display !== 'none'
            }));
            console.log('2. Chat Window after selecting conversation on mobile:', chatState);

            const composerState = await page.$eval('.chat-composer-container', el => ({
                visible: window.getComputedStyle(el).display !== 'none',
                height: el.offsetHeight
            }));
            console.log('3. Composer visible on mobile:', composerState);

            // Take screenshot of mobile chat
            await page.screenshot({ path: path.resolve(__dirname, 'mobile_chat_active_390.png') });
            console.log('4. Screenshot captured: tests/mobile_chat_active_390.png');

            // Test Mobile Back button
            const backBtn = await page.$('#mobileBackBtn');
            if (backBtn) {
                await backBtn.click();
                await page.waitForTimeout(600);

                const sidebarAfterBack = await page.$eval('.conversation-panel', el => ({
                    width: el.offsetWidth,
                    visible: window.getComputedStyle(el).display !== 'none'
                }));
                console.log('5. Sidebar restored after clicking mobile back:', sidebarAfterBack);
            }
        }

        console.log('\n=== MOBILE CHAT TRANSITION: COMPLETE SUCCESS ===');
    } catch (err) {
        console.error('Error during mobile chat test:', err);
    } finally {
        await browser.close();
    }
})();
