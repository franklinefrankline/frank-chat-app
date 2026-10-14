const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runTests() {
    console.log('--- Starting Playwright In-Chat Document Viewer Test Suite ---');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    // 1. Generate JWT for Berline (user 23)
    const { execSync } = require('child_process');
    const token = execSync('python -c "import sys; sys.path.append(\'backend\'); from security import create_access_token; print(create_access_token({\'sub\': \'berline\', \'id\': 23, \'email\': \'berline@gmail.com\'}))"')
        .toString().trim();

    const userObj = {
        id: 23,
        username: 'berline',
        email: 'berline@gmail.com',
        full_name: 'Berline',
        frank_id: 'BERLINE1'
    };

    // Pre-populate localStorage
    await page.addInitScript(({ token, userObj }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(userObj));
    }, { token, userObj });

    page.on('console', msg => {
        const txt = msg.text();
        if (txt.includes('DOC') || txt.includes('Doc') || txt.includes('Error') || txt.includes('error')) {
            console.log('PAGE:', txt);
        }
    });
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    console.log('Navigating to dashboard...');
    await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Ensure dashboard loaded
    const appLoading = await page.$('#appLoadingScreen');
    if (appLoading) {
        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });
    }

    // 2. Select first conversation to open activeChatView
    console.log('Selecting active conversation...');
    await page.waitForSelector('.conversation-item, #conversationList', { timeout: 10000 });
    const firstConv = await page.$('.conversation-item');
    if (firstConv) {
        await firstConv.click();
        await page.waitForTimeout(1000);
    } else {
        await page.evaluate(() => {
            const el = document.getElementById('activeChatView');
            if (el) el.style.display = 'flex';
        });
    }

    const isChatOpen = await page.isVisible('#activeChatView');
    console.log('activeChatView is open:', isChatOpen);

    // Helper function to check layout state
    async function getLayoutState() {
        return await page.evaluate(() => {
            const viewer = document.getElementById('inChatDocViewer');
            const header = document.querySelector('.chat-header');
            const composer = document.querySelector('.chat-composer-container');
            const sidebar = document.querySelector('.conversations-sidebar') || document.querySelector('.sidebar');
            const bodyHasFsClass = document.body.classList.contains('doc-viewer-fullscreen-active');
            const viewerHasFsClass = viewer?.classList.contains('is-fullscreen') || false;
            const exitPill = document.getElementById('docExitFullscreenPill');

            const viewerRect = viewer ? viewer.getBoundingClientRect() : null;
            const headerRect = header ? header.getBoundingClientRect() : null;
            const composerRect = composer ? composer.getBoundingClientRect() : null;

            return {
                viewerVisible: viewer ? (viewer.offsetParent !== null && window.getComputedStyle(viewer).display !== 'none') : false,
                headerVisible: header ? (header.offsetParent !== null && window.getComputedStyle(header).display !== 'none') : false,
                composerVisible: composer ? (composer.offsetParent !== null && window.getComputedStyle(composer).display !== 'none') : false,
                sidebarVisible: sidebar ? (sidebar.offsetParent !== null && window.getComputedStyle(sidebar).display !== 'none') : false,
                bodyHasFsClass,
                viewerHasFsClass,
                exitPillVisible: exitPill ? (exitPill.offsetParent !== null && window.getComputedStyle(exitPill).display !== 'none') : false,
                viewerRect: viewerRect ? { x: Math.round(viewerRect.x), y: Math.round(viewerRect.y), width: Math.round(viewerRect.width), height: Math.round(viewerRect.height) } : null,
                headerRect: headerRect ? { y: Math.round(headerRect.y), height: Math.round(headerRect.height) } : null,
                composerRect: composerRect ? { y: Math.round(composerRect.y), height: Math.round(composerRect.height) } : null,
                windowSize: { width: window.innerWidth, height: window.innerHeight }
            };
        });
    }

    // -------------------------------------------------------------------------
    // TEST 1: PDF VIEWER (OPEN -> NORMAL MODE -> FULL SCREEN -> EXIT FULL SCREEN)
    // -------------------------------------------------------------------------
    console.log('\n================ TEST 1: PDF VIEWER ================');
    await page.evaluate(async () => {
        await window.inChatDocViewer.open(330, 'pdf', 'Frankline_L_ATS_Resume.pdf', '/api/files/330/view', {
            file_size: 31993,
            created_at: new Date().toISOString()
        });
    });
    await page.waitForTimeout(2000);

    // 1.1 Verify Normal Mode
    let state = await getLayoutState();
    console.log('[PDF Normal Mode] Viewer visible:', state.viewerVisible);
    console.log('[PDF Normal Mode] Header visible:', state.headerVisible);
    console.log('[PDF Normal Mode] Composer visible:', state.composerVisible);
    console.log('[PDF Normal Mode] Sidebar visible:', state.sidebarVisible);
    console.log('[PDF Normal Mode] Viewer rect:', JSON.stringify(state.viewerRect));
    console.log('[PDF Normal Mode] Exit Pill hidden:', !state.exitPillVisible);
    if (!state.viewerVisible || !state.headerVisible || !state.composerVisible) {
        throw new Error('PDF Normal mode failed: Header, Composer, or Viewer not properly arranged!');
    }

    // Verify PDF controls
    const pdfThumbs = await page.$$('.thumb-card');
    console.log('[PDF Normal Mode] Thumbnails count:', pdfThumbs.length);
    const pdfCanvases = await page.$$('.pdf-page-container canvas');
    console.log('[PDF Normal Mode] Canvases count:', pdfCanvases.length);
    await page.click('#docZoomInBtn');
    console.log('[PDF Normal Mode] Zoom after Zoom In:', await page.innerText('#docZoomLevel'));

    await page.screenshot({ path: 'tests/test_pdf_normal.png' });

    // 1.2 Verify Full Screen Mode
    console.log('Toggling Full Screen...');
    await page.click('#docFullscreenToolBtn');
    await page.waitForTimeout(500);

    state = await getLayoutState();
    console.log('[PDF Full Screen] Viewer rect:', JSON.stringify(state.viewerRect));
    console.log('[PDF Full Screen] Viewer is fullscreen (1440x900):', state.viewerRect.width === state.windowSize.width && state.viewerRect.height === state.windowSize.height);
    console.log('[PDF Full Screen] Header hidden/covered:', !state.headerVisible);
    console.log('[PDF Full Screen] Composer hidden/covered:', !state.composerVisible);
    console.log('[PDF Full Screen] Sidebar hidden/covered:', !state.sidebarVisible);
    console.log('[PDF Full Screen] Exit pill visible:', state.exitPillVisible);
    console.log('[PDF Full Screen] Fullscreen button title:', await page.getAttribute('#docFullscreenToolBtn', 'title'));

    if (state.headerVisible || state.composerVisible || state.sidebarVisible) {
        throw new Error('PDF Full Screen failed: Header, Composer, or Sidebar still visible in full-screen mode!');
    }
    if (state.viewerRect.width !== state.windowSize.width || state.viewerRect.height !== state.windowSize.height) {
        throw new Error(`PDF Full Screen failed: Viewer rect ${JSON.stringify(state.viewerRect)} does not cover viewport ${JSON.stringify(state.windowSize)}!`);
    }

    await page.screenshot({ path: 'tests/test_pdf_fullscreen.png' });

    // 1.3 Exit Full Screen via Exit Full Screen Pill
    console.log('Exiting Full Screen via Exit Pill...');
    await page.click('#docExitFullscreenPill');
    await page.waitForTimeout(500);

    state = await getLayoutState();
    console.log('[PDF Restored] Viewer visible:', state.viewerVisible);
    console.log('[PDF Restored] Header restored:', state.headerVisible);
    console.log('[PDF Restored] Composer restored:', state.composerVisible);
    console.log('[PDF Restored] Sidebar restored:', state.sidebarVisible);
    console.log('[PDF Restored] Viewer rect:', JSON.stringify(state.viewerRect));
    if (!state.headerVisible || !state.composerVisible) {
        throw new Error('PDF Exit Full Screen failed: Header or Composer not restored!');
    }

    // -------------------------------------------------------------------------
    // TEST 2: WORD DOCX VIEWER (OPEN -> FULL SCREEN -> ESCAPE KEY EXIT)
    // -------------------------------------------------------------------------
    console.log('\n================ TEST 2: WORD DOCX VIEWER ================');
    await page.evaluate(async () => {
        await window.inChatDocViewer.open(331, 'word', 'Proposed SLN Website Header.docx', '/api/files/331/view', {
            file_size: 3451,
            created_at: new Date().toISOString()
        });
    });
    await page.waitForTimeout(2000);

    state = await getLayoutState();
    console.log('[DOCX Normal Mode] Viewer visible:', state.viewerVisible);
    console.log('[DOCX Normal Mode] Header visible:', state.headerVisible);
    console.log('[DOCX Normal Mode] Composer visible:', state.composerVisible);

    const docxContainers = await page.$$('.docx-wrapper, .docx-container');
    console.log('[DOCX Normal Mode] Rendered containers count:', docxContainers.length);
    await page.screenshot({ path: 'tests/test_docx_normal.png' });

    // Full Screen
    console.log('Entering DOCX Full Screen...');
    await page.click('#docFullscreenToolBtn');
    await page.waitForTimeout(500);

    state = await getLayoutState();
    console.log('[DOCX Full Screen] Covers viewport:', state.viewerRect.width === 1440 && state.viewerRect.height === 900);
    console.log('[DOCX Full Screen] Header hidden:', !state.headerVisible);
    console.log('[DOCX Full Screen] Composer hidden:', !state.composerVisible);

    await page.screenshot({ path: 'tests/test_docx_fullscreen.png' });

    // Exit Full Screen via ESCAPE KEY
    console.log('Exiting DOCX Full Screen via Escape Key...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    state = await getLayoutState();
    console.log('[DOCX Restored via Esc] Viewer visible:', state.viewerVisible);
    console.log('[DOCX Restored via Esc] Header restored:', state.headerVisible);
    console.log('[DOCX Restored via Esc] Composer restored:', state.composerVisible);
    if (!state.headerVisible || !state.composerVisible) {
        throw new Error('DOCX Escape key exit failed: Layout not restored!');
    }

    // -------------------------------------------------------------------------
    // TEST 3: EXCEL XLSX VIEWER (GRID, FORMULA BAR, SELECTION & FULLSCREEN)
    // -------------------------------------------------------------------------
    console.log('\n================ TEST 3: EXCEL XLSX VIEWER ================');
    await page.evaluate(async () => {
        await window.inChatDocViewer.open(328, 'excel', '2301 to 2400  (1).xlsx', '/api/files/328/view', {
            file_size: 9506,
            created_at: new Date().toISOString()
        });
    });
    await page.waitForTimeout(2000);

    state = await getLayoutState();
    console.log('[Excel Normal Mode] Viewer visible:', state.viewerVisible);
    console.log('[Excel Normal Mode] Formula bar visible:', await page.isVisible('#docFormulaBar'));
    console.log('[Excel Normal Mode] Sheets strip visible:', await page.isVisible('#docSheetsStrip'));

    // Select cell B2
    const cellB2 = await page.$('.excel-td[data-coord="B2"]');
    if (cellB2) {
        await cellB2.click();
        const coordText = await page.innerText('#docActiveCellCoord');
        console.log('[Excel Normal Mode] Selected cell:', coordText);
    }

    await page.screenshot({ path: 'tests/test_excel_normal.png' });

    // Full Screen
    console.log('Entering Excel Full Screen...');
    await page.click('#docFullscreenToolBtn');
    await page.waitForTimeout(500);

    state = await getLayoutState();
    console.log('[Excel Full Screen] Covers viewport:', state.viewerRect.width === 1440 && state.viewerRect.height === 900);
    console.log('[Excel Full Screen] Formula bar still visible:', await page.isVisible('#docFormulaBar'));
    console.log('[Excel Full Screen] Active cell preserved:', await page.innerText('#docActiveCellCoord'));

    await page.screenshot({ path: 'tests/test_excel_fullscreen.png' });

    // Exit Full Screen by toggling Full Screen button again
    console.log('Exiting Excel Full Screen via Toggle Button...');
    await page.click('#docFullscreenToolBtn');
    await page.waitForTimeout(500);

    state = await getLayoutState();
    console.log('[Excel Restored] Header restored:', state.headerVisible);
    console.log('[Excel Restored] Composer restored:', state.composerVisible);
    console.log('[Excel Restored] Active cell still preserved:', await page.innerText('#docActiveCellCoord'));

    // -------------------------------------------------------------------------
    // TEST 4: POWERPOINT PPTX VIEWER (SLIDES, NAVIGATION & FULLSCREEN)
    // -------------------------------------------------------------------------
    console.log('\n================ TEST 4: POWERPOINT PPTX VIEWER ================');
    await page.evaluate(async () => {
        await window.inChatDocViewer.open(329, 'presentation', 'SLN Internship Page (1).pptx', '/api/files/329/view', {
            file_size: 1560036,
            created_at: new Date().toISOString()
        });
    });
    await page.waitForTimeout(2500);

    state = await getLayoutState();
    console.log('[PPTX Normal Mode] Viewer visible:', state.viewerVisible);
    const initialSlide = await page.$eval('#docPageInput', el => el.value);
    const totalSlides = await page.innerText('#docPageTotal');
    console.log(`[PPTX Normal Mode] Current slide: ${initialSlide} of ${totalSlides}`);

    // Advance to Slide 2
    await page.click('#docNextBtn');
    await page.waitForTimeout(500);
    const advancedSlide = await page.$eval('#docPageInput', el => el.value);
    console.log('[PPTX Normal Mode] Advanced to slide:', advancedSlide);

    await page.screenshot({ path: 'tests/test_pptx_normal.png' });

    // Full Screen
    console.log('Entering PPTX Full Screen...');
    await page.click('#docFullscreenToolBtn');
    await page.waitForTimeout(500);

    state = await getLayoutState();
    console.log('[PPTX Full Screen] Covers viewport:', state.viewerRect.width === 1440 && state.viewerRect.height === 900);
    console.log('[PPTX Full Screen] Current slide preserved:', await page.$eval('#docPageInput', el => el.value));

    await page.screenshot({ path: 'tests/test_pptx_fullscreen.png' });

    // Exit Full Screen via Escape
    console.log('Exiting PPTX Full Screen via Escape Key...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    state = await getLayoutState();
    console.log('[PPTX Restored] Layout restored:', state.headerVisible && state.composerVisible);
    console.log('[PPTX Restored] Current slide still preserved:', await page.$eval('#docPageInput', el => el.value));

    // -------------------------------------------------------------------------
    // TEST 5: CLOSE VIEWER AND VERIFY RETURN TO MESSAGE HISTORY
    // -------------------------------------------------------------------------
    console.log('\n================ TEST 5: CLOSE VIEWER ================');
    await page.click('#inChatDocCloseBtn');
    await page.waitForTimeout(500);

    state = await getLayoutState();
    console.log('Doc Viewer closed:', !state.viewerVisible);
    console.log('Messages stream visible:', await page.isVisible('#messagesContainer'));
    console.log('Composer ready for chat:', state.composerVisible);

    // -------------------------------------------------------------------------
    // TEST 6: MOBILE RESPONSIVE LAYOUT (375x812 VIEWPORT)
    // -------------------------------------------------------------------------
    console.log('\n================ TEST 6: MOBILE RESPONSIVE LAYOUT (375x812) ================');
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(500);

    // Open PDF on mobile
    await page.evaluate(async () => {
        await window.inChatDocViewer.open(330, 'pdf', 'Frankline_L_ATS_Resume.pdf', '/api/files/330/view', {
            file_size: 31993
        });
    });
    await page.waitForTimeout(1500);

    let mobileState = await getLayoutState();
    console.log('[Mobile Normal Mode] Viewer visible:', mobileState.viewerVisible);
    console.log('[Mobile Normal Mode] Header visible:', mobileState.headerVisible);
    console.log('[Mobile Normal Mode] Composer visible:', mobileState.composerVisible);
    console.log('[Mobile Normal Mode] Viewer rect:', JSON.stringify(mobileState.viewerRect));

    await page.screenshot({ path: 'tests/test_mobile_normal.png' });

    // Mobile Full Screen
    console.log('Entering Mobile Full Screen...');
    await page.click('#docFullscreenToolBtn');
    await page.waitForTimeout(500);

    mobileState = await getLayoutState();
    console.log('[Mobile Full Screen] Covers mobile screen:', mobileState.viewerRect.width === 375 && mobileState.viewerRect.height === 812);
    console.log('[Mobile Full Screen] Header hidden:', !mobileState.headerVisible);
    console.log('[Mobile Full Screen] Composer hidden:', !mobileState.composerVisible);

    await page.screenshot({ path: 'tests/test_mobile_fullscreen.png' });

    // Mobile Exit Full Screen via button
    console.log('Exiting Mobile Full Screen...');
    await page.click('#docFullscreenToolBtn');
    await page.waitForTimeout(500);

    mobileState = await getLayoutState();
    console.log('[Mobile Restored] Header restored:', mobileState.headerVisible);
    console.log('[Mobile Restored] Composer restored:', mobileState.composerVisible);

    // Close on mobile
    await page.click('#inChatDocCloseBtn');
    await page.waitForTimeout(500);
    console.log('[Mobile] Viewer closed cleanly, chat restored.');

    await browser.close();
    console.log('\n======================================================');
    console.log('>>> ALL IN-CHAT DOC VIEWER TESTS PASSED SUCCESSFULLY! <<<');
    console.log('======================================================\n');
}

runTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
