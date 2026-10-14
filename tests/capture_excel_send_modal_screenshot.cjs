const { chromium } = require('playwright');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:8000';

async function captureScreenshots() {
    const token = execSync('python -c "import sys; sys.path.append(\'backend\'); from security import create_access_token; print(create_access_token({\'sub\': \'franklinesamy2006\', \'id\': 274, \'email\': \'franklinesamy2006@gmail.com\'}))"')
        .toString().trim();

    const userObj = {
        id: 274,
        username: 'franklinesamy2006',
        email: 'franklinesamy2006@gmail.com',
        full_name: 'Frankline Samy',
        frank_id: 'FRK274'
    };

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.addInitScript(({ token, userObj }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(userObj));
        localStorage.setItem('frank_onboarded', 'true');
    }, { token, userObj });

    await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    await page.evaluate(() => {
        const el = document.getElementById('appLoadingScreen');
        if (el) el.remove();
    });

    // 1. Open Excel Workspace
    await page.evaluate(({ fileId, fileType, filename }) => {
        if (!window.frankOfficeWorkspace) window.frankOfficeWorkspace = new FrankOfficeWorkspace();
        window.frankOfficeWorkspace.openDocument(fileId, fileType, filename, `/api/files/${fileId}/view`);
    }, { fileId: 328, fileType: 'excel', filename: '2301 to 2400  (1).xlsx' });

    await page.waitForSelector('#frankDocumentWorkspace.active', { timeout: 8000 });
    await page.waitForTimeout(1000);

    // Click Send to Chat
    await page.click('#workspaceSendBtn');
    await page.waitForSelector('#docSendToChatModal', { state: 'visible', timeout: 5000 });
    await page.waitForSelector('.doc-send-recipient-row', { timeout: 8000 });

    // Select first recipient
    await page.locator('.doc-send-recipient-row').first().click();
    await page.waitForTimeout(500);

    // Capture screenshot of Send to Chat modal above Excel editor
    const modalShotPath = path.join(__dirname, 'excel_send_to_chat_modal_verified.png');
    await page.screenshot({ path: modalShotPath, fullPage: false });
    console.log(`Captured modal screenshot: ${modalShotPath}`);

    // Send Document
    await page.click('#confirmDocSendBtn');
    await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 8000 });
    await page.waitForTimeout(1000);

    // Capture screenshot of chat message
    const chatShotPath = path.join(__dirname, 'excel_shared_chat_message_verified.png');
    await page.screenshot({ path: chatShotPath, fullPage: false });
    console.log(`Captured chat screenshot: ${chatShotPath}`);

    await browser.close();
}

captureScreenshots().catch(console.error);
