const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ARTIFACT_DIR = 'C:/Users/inbat/.gemini/antigravity-ide/brain/c2a6713c-4959-43bf-be00-4d4084426a31';

async function captureScreenshots() {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    function getFixtureBase64(filename) {
        return fs.readFileSync(path.join(__dirname, 'fixtures', filename)).toString('base64');
    }

    // Login
    await page.goto('http://127.0.0.1:8000/login.html');
    await page.fill('#loginUsername', 'alex');
    await page.fill('#loginPassword', 'password123');
    await page.click('#loginSubmitBtn');
    await page.waitForURL('**/dashboard.html');
    await page.waitForTimeout(800);

    // 1. Capture Chats Filter Popover
    await page.click('#chatsHeaderFilterBtn');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'chats_filter_popover.png'), fullPage: false });
    console.log('Saved chats_filter_popover.png');

    // Close popover
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // 2. Open 10-slide PowerPoint presentation
    const pptxB64 = getFixtureBase64('multi_slide_presentation.pptx');
    await page.evaluate(async (b64) => {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
        const directUrl = URL.createObjectURL(blob);
        await window.inChatDocViewer.open(null, 'pptx', 'multi_slide_presentation.pptx', directUrl, { file_size: bytes.length });
    }, pptxB64);
    await page.waitForTimeout(1000);

    // Select slide 8 so slide 8 is active with its real thumbnail
    await page.click('#docThumbnailsList .thumb-card[data-page="8"]');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'pptx_slide8_real_thumbnails.png'), fullPage: false });
    console.log('Saved pptx_slide8_real_thumbnails.png');

    // 3. Launch presentation slideshow mode
    await page.click('#docPresentBtn');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'pptx_slideshow_presentation_mode.png'), fullPage: false });
    console.log('Saved pptx_slideshow_presentation_mode.png');

    // Exit presentation mode
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // 4. Capture Mobile layout (375px) with Toolbar Overflow
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await page.click('#docMoreActionsBtn');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'pptx_mobile_toolbar_overflow.png'), fullPage: false });
    console.log('Saved pptx_mobile_toolbar_overflow.png');

    await browser.close();
    console.log('All verification screenshots captured successfully.');
}

captureScreenshots().catch(console.error);
