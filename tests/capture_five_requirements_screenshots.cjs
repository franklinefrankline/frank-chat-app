const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

async function capture() {
    const outDir = path.resolve('tests/final_screenshots');
    fs.mkdirSync(outDir, { recursive: true });

    const browser = await chromium.launch({ headless: true });

    const token = execSync('python -c "import sys; sys.path.append(\'backend\'); from security import create_access_token; print(create_access_token({\'sub\': \'berline\', \'id\': 23, \'email\': \'berline@gmail.com\'}))"')
        .toString().trim();
    const userObj = {
        id: 23,
        username: 'berline',
        email: 'berline@gmail.com',
        full_name: 'Berline',
        frank_id: 'BERLINE1',
        avatar_url: null,
        is_online: true
    };

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    await page.addInitScript(({ token, userObj }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(userObj));
    }, { token, userObj });

    // 1. Desktop Chats Header
    await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
        const el = document.getElementById('appLoadingScreen');
        if (el) el.remove();
    });

    // Screenshot 1: Desktop Chats Header showing Edit Document · New Chat (+) · Filter
    await page.screenshot({ path: path.join(outDir, 'req1_chats_header_desktop.png') });
    console.log('Saved req1_chats_header_desktop.png');

    // Screenshot 2: Mobile Chats Header (375px)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, 'req1_chats_header_mobile.png') });
    console.log('Saved req1_chats_header_mobile.png');

    // Restore desktop
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(400);

    // Screenshot 3: Open Document Selection Interface
    await page.click('#chatsHeaderEditDocBtn');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(outDir, 'req1_edit_doc_picker_opened.png') });
    console.log('Saved req1_edit_doc_picker_opened.png');

    // Close Document Browser
    await page.evaluate(() => {
        if (window.documentBrowserController) window.documentBrowserController.closeBrowser();
    });
    await page.waitForTimeout(400);

    // Screenshot 4: Profile Dropdown showing loaded profile details (Berline)
    await page.click('#desktopProfileBtn');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, 'req2_profile_loaded_desktop.png') });
    console.log('Saved req2_profile_loaded_desktop.png');

    // Close profile dropdown
    await page.click('body');
    await page.waitForTimeout(300);

    // Screenshot 5: Profile Photo Management in profile.html
    await page.goto('http://127.0.0.1:8000/profile.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.click('#toggleEditProfileBtn');
    await page.waitForTimeout(500);
    // Preview sample avatar
    await page.fill('#editAvatarUrl', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150');
    await page.click('#applyAvatarUrlBtn');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(outDir, 'req3_profile_photo_edit_page.png') });
    console.log('Saved req3_profile_photo_edit_page.png');

    // Screenshot 6: Word Document Viewer with A4 centered pages
    await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
        const el = document.getElementById('appLoadingScreen');
        if (el) el.remove();
    });
    await page.evaluate(async () => {
        if (window.inChatDocViewer) {
            await window.inChatDocViewer.open(331, 'word', 'Proposed SLN Website Header.docx', '/api/files/331/view', {
                file_size: 3451,
                created_at: new Date().toISOString()
            });
        }
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, 'req4_word_doc_standard_pages.png') });
    console.log('Saved req4_word_doc_standard_pages.png');

    // Screenshot 7: PDF Document Viewer with standard centered pages and pagination
    await page.evaluate(async () => {
        if (window.inChatDocViewer) {
            await window.inChatDocViewer.open(330, 'pdf', 'Frankline_L_ATS_Resume.pdf', '/api/files/330/view', {
                file_size: 31993,
                created_at: new Date().toISOString()
            });
        }
    });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(outDir, 'req4_pdf_doc_standard_pages.png') });
    console.log('Saved req4_pdf_doc_standard_pages.png');

    // Close in-chat viewer
    await page.evaluate(() => {
        if (window.inChatDocViewer) window.inChatDocViewer.close();
    });
    await page.waitForTimeout(400);

    // Screenshot 8: Excel Spreadsheet Editor with header, File menu, formula bar, grid, tabs
    await page.evaluate(() => {
        if (!window.frankOfficeWorkspace) {
            window.frankOfficeWorkspace = new FrankOfficeWorkspace();
        }
        window.frankOfficeWorkspace.openDocument(
            999,
            'excel',
            'Financial_Model_2026.xlsx',
            ''
        );
    });
    await page.waitForTimeout(1000);
    // Open File menu in Excel
    await page.evaluate(() => {
        const fileBtn = document.querySelector('.sheets-menu-item[data-menu="file"], #menu-file, .menu-item:first-child');
        if (fileBtn) fileBtn.click();
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, 'req5_excel_editor_ui.png') });
    console.log('Saved req5_excel_editor_ui.png');

    await browser.close();
    console.log('All 8 screenshots captured successfully.');
}

capture().catch(e => {
    console.error('Screenshot capture failed:', e);
    process.exit(1);
});
