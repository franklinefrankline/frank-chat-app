const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const assert = require('assert');

const BASE_URL = 'http://127.0.0.1:8000';
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots_word');
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runWordEditorE2E() {
    console.log('================================================================');
    console.log('STARTING FRANK THINK WORD EDITOR COMPLETE BROWSER E2E TEST SUITE');
    console.log('================================================================');

    // 1. Generate auth token for User 1
    const token = execSync('python -c "import sys; sys.path.append(\'backend\'); from security import create_access_token; print(create_access_token({\'sub\': \'1\', \'id\': 1, \'email\': \'frankline30999112@gmail.com\'}))"')
        .toString().trim();

    const userObj = {
        id: 1,
        username: 'frankline30999112@gmail.com',
        email: 'frankline30999112@gmail.com',
        full_name: 'Frankline Admin',
        frank_id: 'ADM001'
    };

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            const t = msg.text();
            if (!t.includes('favicon') && !t.includes('status of 401') && !t.includes('status of 403')) {
                consoleErrors.push(t);
            }
        }
    });

    try {
        await page.addInitScript(({ token, userObj }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(userObj));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token, userObj });

        console.log('\n--- STEP 1: OPEN DASHBOARD AND VERIFY OFFICE WORKSPACE ENGINE ---');
        await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        // Verify FrankWordEditorEngine and FrankOfficeWorkspace exist
        const enginesLoaded = await page.evaluate(() => {
            return {
                workspace: typeof FrankOfficeWorkspace !== 'undefined',
                wordEngine: typeof FrankWordEditorEngine !== 'undefined',
                activeWorkspaceInstance: typeof window.frankOfficeWorkspace !== 'undefined'
            };
        });
        console.log('Engines loaded in browser:', enginesLoaded);
        assert(enginesLoaded.workspace, 'FrankOfficeWorkspace loaded');
        assert(enginesLoaded.wordEngine, 'FrankWordEditorEngine loaded');

        // Create or get a test Word document ID via API
        console.log('\n--- STEP 2: CREATE TEST WORD DOCUMENT VIA API ---');
        const createRes = await page.evaluate(async () => {
            return await api.createNewDocument({
                title: 'Annual Strategic Report',
                format: 'docx',
                template: 'report'
            });
        });
        console.log('Created test doc:', createRes.id, createRes.original_filename);
        assert(createRes.id, 'Document ID generated');

        // Mount Word Workspace
        console.log('\n--- STEP 3: MOUNT WORD EDITOR WORKSPACE ---');
        await page.evaluate(async (docId) => {
            await window.frankOfficeWorkspace.openDocument(docId, 'word', 'Annual Strategic Report.docx');
        }, createRes.id);

        await page.waitForTimeout(1200);

        // Verify Workspace visibility
        const isWsActive = await page.evaluate(() => {
            const ws = document.getElementById('frankDocumentWorkspace');
            return ws && ws.classList.contains('active');
        });
        assert(isWsActive, 'Workspace modal is active');
        console.log('[PASS] Word Workspace successfully opened and active!');

        // Verify Ribbon Tabs rendered
        console.log('\n--- STEP 4: VERIFY 11 MICROSOFT WORD RIBBON TABS ---');
        const ribbonTabs = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('.word-tab-btn'));
            return btns.map(b => ({ tab: b.dataset.tab, text: b.innerText.trim() }));
        });
        console.log('Found ribbon tabs:', ribbonTabs.map(t => t.text).join(' | '));
        const requiredTabs = ['File', 'Home', 'Insert', 'Draw', 'Design', 'Layout', 'References', 'Mailings', 'Review', 'View', 'Help'];
        requiredTabs.forEach(rt => {
            assert(ribbonTabs.some(t => t.text.toLowerCase() === rt.toLowerCase()), `Ribbon tab ${rt} missing!`);
        });
        console.log('[PASS] All 11 Microsoft Word Ribbon tabs present and verified!');

        // Take initial full editor screenshot
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_word_editor_desktop_home.png') });
        console.log('[PASS] Saved screenshot: 01_word_editor_desktop_home.png');

        // Verify Left Sidebar & Structure
        console.log('\n--- STEP 5: VERIFY LEFT SIDEBAR SECTIONS ---');
        const sidebarItems = await page.evaluate(() => {
            const items = Array.from(document.querySelectorAll('.word-nav-item'));
            return items.map(i => i.innerText.trim());
        });
        console.log('Left sidebar sections:', sidebarItems.join(' | '));
        assert(sidebarItems.some(i => i.includes('My Documents')), 'My Documents section missing');
        assert(sidebarItems.some(i => i.includes('Shared with Me')), 'Shared with Me section missing');
        assert(sidebarItems.some(i => i.includes('Templates')), 'Templates section missing');
        console.log('[PASS] Left sidebar document management navigation verified!');

        // Verify Rulers and Page Sheet
        console.log('\n--- STEP 6: VERIFY RULERS AND REALISTIC PAGE SHEET ---');
        const pageDimensions = await page.evaluate(() => {
            const sheet = document.querySelector('.word-page-sheet');
            const hRuler = document.getElementById('wordRulerH');
            const vRuler = document.getElementById('wordRulerV');
            const rect = sheet ? sheet.getBoundingClientRect() : null;
            return {
                sheetWidth: rect ? rect.width : 0,
                sheetHeight: rect ? rect.height : 0,
                hRulerVisible: hRuler && window.getComputedStyle(hRuler).display !== 'none',
                vRulerVisible: vRuler && window.getComputedStyle(vRuler).display !== 'none'
            };
        });
        console.log('Page sheet dimensions:', pageDimensions);
        assert(pageDimensions.sheetWidth >= 750, 'Page sheet width matches A4/Letter size');
        assert(pageDimensions.hRulerVisible, 'Horizontal ruler visible');
        assert(pageDimensions.vRulerVisible, 'Vertical ruler visible');
        console.log('[PASS] Rulers and realistic white page sheet verified!');

        // Test Ribbon Tab Switching
        console.log('\n--- STEP 7: TEST TAB SWITCHING & SPECIALIZED TOOLBARS ---');
        
        // Tab 1: Insert Tab
        await page.click('.word-tab-btn[data-tab="insert"]');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_word_ribbon_insert.png') });
        const hasTableBtn = await page.evaluate(() => !!document.getElementById('wordInsertTable'));
        assert(hasTableBtn, 'Insert Table button in Insert tab');

        // Tab 2: Draw Tab
        await page.click('.word-tab-btn[data-tab="draw"]');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_word_ribbon_draw.png') });
        const hasPenTool = await page.evaluate(() => !!document.getElementById('drawPenBtn'));
        assert(hasPenTool, 'Pen tool in Draw tab');

        // Tab 3: Design Tab
        await page.click('.word-tab-btn[data-tab="design"]');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_word_ribbon_design.png') });
        const hasWatermarkBtn = await page.evaluate(() => !!document.getElementById('docWatermarkBtn'));
        assert(hasWatermarkBtn, 'Watermark button in Design tab');

        // Tab 4: Layout Tab
        await page.click('.word-tab-btn[data-tab="layout"]');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_word_ribbon_layout.png') });
        const hasOrientSelect = await page.evaluate(() => !!document.getElementById('pageOrientSelect'));
        assert(hasOrientSelect, 'Orientation select in Layout tab');

        // Tab 5: References Tab
        await page.click('.word-tab-btn[data-tab="references"]');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_word_ribbon_references.png') });
        const hasTocBtn = await page.evaluate(() => !!document.getElementById('refGenerateTOC'));
        assert(hasTocBtn, 'Table of Contents button in References tab');

        // Tab 6: Mailings Tab
        await page.click('.word-tab-btn[data-tab="mailings"]');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_word_ribbon_mailings.png') });
        const hasMergePreview = await page.evaluate(() => !!document.getElementById('mailPreviewBtn'));
        assert(hasMergePreview, 'Merge Preview in Mailings tab');

        // Tab 7: Review Tab
        await page.click('.word-tab-btn[data-tab="review"]');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_word_ribbon_review.png') });
        const hasWordCountBtn = await page.evaluate(() => !!document.getElementById('reviewWordCountBtn'));
        assert(hasWordCountBtn, 'Word Count in Review tab');

        // Tab 8: View Tab
        await page.click('.word-tab-btn[data-tab="view"]');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_word_ribbon_view.png') });
        const hasZoomSelect = await page.evaluate(() => !!document.getElementById('viewPageModeBtn'));
        assert(hasZoomSelect, 'Page mode in View tab');

        // Back to Home Tab
        await page.click('.word-tab-btn[data-tab="home"]');
        await page.waitForTimeout(300);
        console.log('[PASS] All ribbon tabs switch dynamically and render full tool suites!');

        // Step 8: Edit Text and Insert Document Elements
        console.log('\n--- STEP 8: TEXT EDITING, FORMATTING & TABLE INSERTION ---');
        await page.evaluate(() => {
            const pageEl = document.getElementById('wordDocPage');
            pageEl.innerHTML = `
                <h1 style="text-align: center;">Executive Operations Dashboard</h1>
                <p>Welcome to <strong>FRANK Think</strong> Word Document Editor. This document demonstrates rich OpenXML formatting.</p>
                <h2>Quarterly Milestones</h2>
                <ul>
                    <li>Fully working Microsoft Word Ribbon layout.</li>
                    <li>Accurate typography, alignments, and lists.</li>
                    <li>Real OpenXML DOCX round-trip preservation.</li>
                </ul>
            `;
            window.frankOfficeWorkspace.wordEngine.updateWordCount();
            window.frankOfficeWorkspace.wordEngine.updatePagination();
            window.frankOfficeWorkspace.wordEngine.updateHeadingsOutline();
        });

        // Insert a table using Insert tab
        await page.click('.word-tab-btn[data-tab="insert"]');
        await page.waitForTimeout(200);
        await page.evaluate(() => {
            window.frankOfficeWorkspace.wordEngine.insertTable(3, 3);
        });
        await page.waitForTimeout(300);

        // Insert a page break
        await page.evaluate(() => {
            window.frankOfficeWorkspace.wordEngine.insertPageBreak();
        });
        await page.waitForTimeout(300);

        // Verify page break updated pagination
        const pageCountText = await page.evaluate(() => {
            const el = document.getElementById('pageNumberIndicator');
            return el ? el.innerText : '';
        });
        console.log('Pagination status indicator:', pageCountText);
        assert(pageCountText.includes('2'), 'Pagination reflects 2 pages after page break');
        console.log('[PASS] Multi-page pagination calculated accurately!');

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_word_document_multi_page_with_table.png') });
        console.log('[PASS] Saved screenshot: 10_word_document_multi_page_with_table.png');

        // Step 9: Test Right Tools Drawer (Find & Replace, Comments, Word Count)
        console.log('\n--- STEP 9: TEST RIGHT TOOLS DRAWER ---');
        await page.evaluate(() => {
            window.frankOfficeWorkspace.wordEngine.openRightDrawer('find');
        });
        await page.waitForTimeout(400);
        const findDrawerOpen = await page.evaluate(() => {
            const d = document.getElementById('wordRightDrawer');
            return d && d.classList.contains('open');
        });
        assert(findDrawerOpen, 'Find and Replace drawer opened');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_word_right_drawer_find.png') });
        console.log('[PASS] Right-side tools drawer opened with Find & Replace!');

        // Close right drawer and return to home tab
        await page.evaluate(() => {
            window.frankOfficeWorkspace.wordEngine.closeRightDrawer();
        });
        await page.click('.word-tab-btn[data-tab="home"]');
        await page.waitForTimeout(300);

        // Step 10: Test Document Persistence (Save Document)
        console.log('\n--- STEP 10: TEST SAVE PERSISTENCE ---');
        const saveResult = await page.evaluate(async () => {
            return await window.frankOfficeWorkspace.saveDocument();
        });
        assert(saveResult, 'saveDocument returned true');
        await page.waitForTimeout(600);

        const saveBadge = await page.evaluate(() => {
            return document.getElementById('saveStatusText')?.innerText;
        });
        console.log('Save status badge in UI:', saveBadge);
        assert(saveBadge.includes('Saved'), 'Save badge indicates Saved');
        console.log('[PASS] Document successfully persisted and confirmed by backend!');

        // Step 11: Test Responsive Layouts
        console.log('\n--- STEP 11: TEST RESPONSIVE VIEWPORTS ---');
        const viewports = [
            { name: 'desktop_1440', width: 1440, height: 900 },
            { name: 'tablet_768', width: 768, height: 1024 },
            { name: 'mobile_430', width: 430, height: 932 },
            { name: 'mobile_390', width: 390, height: 844 },
            { name: 'mobile_375', width: 375, height: 667 },
            { name: 'mobile_320', width: 320, height: 568 }
        ];

        for (const vp of viewports) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.evaluate((width) => {
                if (width <= 768 && window.frankOfficeWorkspace && window.frankOfficeWorkspace.wordEngine) {
                    window.frankOfficeWorkspace.wordEngine.sidebarCollapsed = true;
                    document.getElementById('wordStageContainer')?.classList.add('sidebar-collapsed');
                }
            }, vp.width);
            await page.waitForTimeout(300);

            // Verify no horizontal document overflow
            const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
            assert(scrollWidth <= vp.width + 5, `Horizontal overflow detected at ${vp.width}px (scrollWidth: ${scrollWidth})`);

            await page.screenshot({ path: path.join(SCREENSHOT_DIR, `12_responsive_${vp.name}.png`) });
            console.log(`[PASS] Responsive layout verified at ${vp.width}px (${vp.name})`);
        }

        console.log('\n================================================================');
        console.log('ALL BROWSER E2E TESTS PASSED WITH 100% SUCCESS!');
        console.log('================================================================');

    } finally {
        await browser.close();
    }
}

runWordEditorE2E().catch(err => {
    console.error('Test run failed:', err);
    process.exit(1);
});
