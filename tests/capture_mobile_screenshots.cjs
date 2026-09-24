const { chromium } = require('playwright');
const path = require('path');

async function captureScreenshots() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2
    });
    const page = await context.newPage();

    const uniqueId = Date.now().toString(36);
    const email = `capture_${uniqueId}@frank.test`;
    const password = 'Pass@Mobile123!';

    await page.goto('http://127.0.0.1:8000/register.html');
    await page.waitForSelector('#regFullName', { timeout: 8000 });
    await page.fill('#regFullName', 'Frank Miller');
    await page.fill('#regEmail', email);
    await page.fill('#regPassword', password);
    await page.fill('#regConfirmPassword', password);
    await page.check('#regTerms');
    await page.click('#registerSubmitBtn');

    await page.waitForURL('**/dashboard.html', { timeout: 10000 });

    await page.evaluate(() => {
        const loader = document.getElementById('appLoadingScreen');
        if (loader) loader.remove();
        const modal = document.getElementById('welcomeOnboardingModal');
        if (modal) modal.classList.remove('active');
        localStorage.setItem('frank_onboarded', 'true');
    });

    await page.waitForSelector('.conversation-card', { timeout: 8000 });
    await page.waitForTimeout(600);

    // 1. Screenshot Screen 1: Mobile Chat List
    await page.screenshot({ path: path.join(__dirname, 'mobile_screen1_chat_list.png') });
    console.log('Captured mobile_screen1_chat_list.png');

    // 2. Open chat -> Screenshot Screen 2: Active Conversation
    const firstCard = page.locator('.conversation-card').first();
    await firstCard.click();
    await page.waitForTimeout(600);

    const composer = page.locator('#messageComposerTextarea');
    await composer.fill('Hey! Checking out the new native mobile experience in FRANK 🚀');
    await page.waitForTimeout(300);
    const sendBtn = page.locator('#composerSendBtn');
    await sendBtn.click();
    await page.waitForTimeout(600);

    await composer.fill('This looks and feels like a native mobile app!');
    await page.waitForTimeout(300);

    await page.screenshot({ path: path.join(__dirname, 'mobile_screen2_active_chat.png') });
    console.log('Captured mobile_screen2_active_chat.png');

    // 3. Back to list -> Open Sidebar Drawer -> Screenshot Screen 3
    await page.click('#mobileBackBtn');
    await page.waitForTimeout(400);

    await page.click('#openSidebarBtn');
    await page.waitForTimeout(600);

    await page.screenshot({ path: path.join(__dirname, 'mobile_screen3_sidebar_drawer.png') });
    console.log('Captured mobile_screen3_sidebar_drawer.png');

    await browser.close();
}

captureScreenshots().catch(console.error);
