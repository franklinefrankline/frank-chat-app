const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

async function captureScreenshots() {
    const outDir = 'tests/final_screenshots';
    fs.mkdirSync(outDir, { recursive: true });

    const browser = await chromium.launch({ headless: true });

    // 1. Desktop PPTX Presentation Mode
    const contextDesktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pageDesktop = await contextDesktop.newPage();

    const token = execSync('python -c "import sys; sys.path.append(\'backend\'); from security import create_access_token; print(create_access_token({\'sub\': \'berline\', \'id\': 23, \'email\': \'berline@gmail.com\'}))"')
        .toString().trim();
    const userObj = { id: 23, username: 'berline', email: 'berline@gmail.com', full_name: 'Berline', frank_id: 'BERLINE1' };

    await pageDesktop.addInitScript(({ token, userObj }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(userObj));
    }, { token, userObj });

    await pageDesktop.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'networkidle' });
    await pageDesktop.waitForTimeout(1000);
    await pageDesktop.evaluate(() => {
        const el = document.getElementById('appLoadingScreen');
        if (el) el.remove();
    });

    const pptxBuffer = fs.readFileSync('tests/fixtures/multi_slide_presentation.pptx');
    const pptxBase64 = pptxBuffer.toString('base64');

    await pageDesktop.evaluate(async (b64) => {
        const byteCharacters = atob(b64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
        await window.inChatDocViewer.open(null, 'pptx', 'multi_slide_presentation.pptx', URL.createObjectURL(blob), {
            mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        });
    }, pptxBase64);
    await pageDesktop.waitForTimeout(1000);

    // Screenshot 1: In-Chat PPTX viewer with Present button
    await pageDesktop.screenshot({ path: path.join(outDir, '1_pptx_with_present_btn.png') });

    // Click Present
    await pageDesktop.click('#docPresentBtn');
    await pageDesktop.waitForTimeout(800);

    // Screenshot 2: PPTX Slideshow Full Page with Dedicated Solid Bottom Toolbar
    await pageDesktop.screenshot({ path: path.join(outDir, '2_pptx_slideshow_solid_bottom_toolbar_desktop.png') });

    // Mobile Portrait PPTX
    await pageDesktop.setViewportSize({ width: 390, height: 844 });
    await pageDesktop.waitForTimeout(500);
    await pageDesktop.screenshot({ path: path.join(outDir, '3_pptx_slideshow_mobile_portrait.png') });

    // Mobile Landscape PPTX
    await pageDesktop.setViewportSize({ width: 844, height: 390 });
    await pageDesktop.waitForTimeout(500);
    await pageDesktop.screenshot({ path: path.join(outDir, '4_pptx_slideshow_mobile_landscape.png') });

    // Exit Presentation & Test Word Viewer
    await pageDesktop.setViewportSize({ width: 1280, height: 800 });
    await pageDesktop.waitForTimeout(400);
    await pageDesktop.click('#docSlideshowExitBtn');
    await pageDesktop.waitForTimeout(500);

    const docxBuffer = fs.readFileSync('tests/fixtures/rich_word_document.docx');
    const docxBase64 = docxBuffer.toString('base64');

    await pageDesktop.evaluate(async (b64) => {
        const byteCharacters = atob(b64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
        await window.inChatDocViewer.open(null, 'docx', 'rich_word_document.docx', URL.createObjectURL(blob));
    }, docxBase64);
    await pageDesktop.waitForTimeout(1500);

    // Screenshot 5: Word Viewer with "PAGES" sidebar and page thumbnails
    await pageDesktop.screenshot({ path: path.join(outDir, '5_word_viewer_pages_thumbnails_desktop.png') });

    await browser.close();
    console.log('Screenshots saved to:', outDir);
}

captureScreenshots();
