const { chromium } = require('playwright');
const path = require('path');

async function testComposer() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

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
    await page.waitForSelector('#messageComposerTextarea', { state: 'visible', timeout: 5000 });

    const artifactDir = 'C:/Users/inbat/.gemini/antigravity-ide/brain/5b6edf16-bde3-444f-b29a-2ac60c0e715b';

    // 1. DESKTOP ENGLISH
    let compBox = await page.locator('#mainComposerBar').boundingBox();
    let taBox = await page.locator('#messageComposerTextarea').boundingBox();
    let attachBox = await page.locator('#attachmentBtn').boundingBox();
    let sendBox = await page.locator('#composerSendBtn').boundingBox();
    console.log('--- Desktop (EN) ---');
    console.log('Composer bar:', compBox);
    console.log('Textarea:', taBox);
    console.log('Attach btn:', attachBox);
    console.log('Send btn:', sendBox);

    await page.locator('#mainComposerBar').screenshot({ path: path.join(artifactDir, 'composer_desktop_en.png') });

    // 2. DESKTOP TAMIL
    await page.evaluate(() => {
        if (typeof i18n !== 'undefined') i18n.setLanguage('ta');
    });
    await page.waitForTimeout(300);
    console.log('--- Desktop (TA) ---');
    console.log('Placeholder:', await page.locator('#messageComposerTextarea').getAttribute('placeholder'));
    await page.locator('#mainComposerBar').screenshot({ path: path.join(artifactDir, 'composer_desktop_ta.png') });

    // 3. DESKTOP HINDI
    await page.evaluate(() => {
        if (typeof i18n !== 'undefined') i18n.setLanguage('hi');
    });
    await page.waitForTimeout(300);
    console.log('--- Desktop (HI) ---');
    console.log('Placeholder:', await page.locator('#messageComposerTextarea').getAttribute('placeholder'));
    await page.locator('#mainComposerBar').screenshot({ path: path.join(artifactDir, 'composer_desktop_hi.png') });

    // 4. DESKTOP TYPED MESSAGE
    await page.evaluate(() => {
        if (typeof i18n !== 'undefined') i18n.setLanguage('en');
    });
    await page.fill('#messageComposerTextarea', 'Hello! This is a single line message.');
    await page.waitForTimeout(200);
    await page.locator('#mainComposerBar').screenshot({ path: path.join(artifactDir, 'composer_desktop_typed.png') });
    await page.fill('#messageComposerTextarea', '');
    await page.evaluate(() => window.chatController.autoResizeTextarea());

    // 5. MOBILE VIEWPORT (375px)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);

    // Ensure mobile chat window is active
    await page.evaluate(() => {
        document.getElementById('chatApp')?.classList.add('has-active-chat');
        document.getElementById('chatWindow')?.classList.add('mobile-open');
        const activeChat = document.getElementById('activeChatView');
        if (activeChat) activeChat.style.display = 'flex';
        window.chatController.autoResizeTextarea();
    });
    await page.waitForTimeout(300);

    let mobileCompBox = await page.locator('#mainComposerBar').boundingBox();
    let mobileTaBox = await page.locator('#messageComposerTextarea').boundingBox();
    console.log('--- Mobile (375px EN) ---');
    console.log('Mobile Composer bar:', mobileCompBox);
    console.log('Mobile Textarea:', mobileTaBox);
    await page.locator('#mainComposerBar').screenshot({ path: path.join(artifactDir, 'composer_mobile_en.png') });

    // Mobile Tamil
    await page.evaluate(() => {
        if (typeof i18n !== 'undefined') i18n.setLanguage('ta');
    });
    await page.waitForTimeout(300);
    await page.locator('#mainComposerBar').screenshot({ path: path.join(artifactDir, 'composer_mobile_ta.png') });

    // Mobile Hindi
    await page.evaluate(() => {
        if (typeof i18n !== 'undefined') i18n.setLanguage('hi');
    });
    await page.waitForTimeout(300);
    await page.locator('#mainComposerBar').screenshot({ path: path.join(artifactDir, 'composer_mobile_hi.png') });

    // Reset back to English
    await page.evaluate(() => {
        if (typeof i18n !== 'undefined') i18n.setLanguage('en');
    });

    console.log('All composer screenshot tests completed successfully!');
    await browser.close();
}

testComposer().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
