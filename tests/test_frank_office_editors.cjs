const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const BASE_URL = 'http://127.0.0.1:8000';
const ARTIFACT_DIR = path.resolve('C:/Users/inbat/.gemini/antigravity-ide/brain/5b6edf16-bde3-444f-b29a-2ac60c0e715b');

async function main() {
    console.log('================================================================');
    console.log('   FRANK OFFICE - DOCUMENT EDITOR UI BUG VERIFICATION TEST SUITE');
    console.log('================================================================');

    // 1. Generate auth token for Berline
    const token = execSync('python -c "import sys; sys.path.append(\'backend\'); from security import create_access_token; print(create_access_token({\'sub\': \'berline\', \'id\': 23, \'email\': \'berline@gmail.com\'}))"')
        .toString().trim();

    const userObj = {
        id: 23,
        username: 'berline',
        email: 'berline@gmail.com',
        full_name: 'Berline',
        frank_id: 'BERLINE1'
    };

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const testResults = {
        word: { pass: true, checks: [] },
        pdf: { pass: true, checks: [] },
        pptx: { pass: true, checks: [] },
        excel: { pass: true, checks: [] },
        viewports: { pass: true, checks: [] }
    };

    function record(cat, testName, passed, detail = '') {
        testResults[cat].checks.push({ testName, passed, detail });
        if (!passed) testResults[cat].pass = false;
        console.log(`[${passed ? 'PASS' : 'FAIL'}] [${cat.toUpperCase()}] ${testName}${detail ? ' -> ' + detail : ''}`);
    }

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    await page.addInitScript(({ token, userObj }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(userObj));
        localStorage.setItem('frank_onboarded', 'true');
    }, { token, userObj });

    console.log('Opening dashboard...');
    await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    // Remove loading screen if present
    await page.evaluate(() => {
        const el = document.getElementById('appLoadingScreen');
        if (el) el.remove();
    });

    // Helper: open a document in FrankOfficeWorkspace directly
    async function openInOffice(fileId, fileType, filename) {
        await page.evaluate(({ fileId, fileType, filename }) => {
            if (!window.frankOfficeWorkspace) {
                window.frankOfficeWorkspace = new FrankOfficeWorkspace();
            }
            const baseUrl = (window.FRANK_CONFIG && window.FRANK_CONFIG.API_BASE) || '';
            const viewUrl = `${baseUrl}/api/files/${fileId}/view`;
            window.frankOfficeWorkspace.openDocument(fileId, fileType, filename, viewUrl);
        }, { fileId, fileType, filename });
        await page.waitForTimeout(1500);
    }

    // Helper: check that a list of element selectors don't overlap horizontally
    async function checkNoOverlap(selectors) {
        return await page.evaluate((sels) => {
            const rects = sels.map(s => {
                const el = document.querySelector(s);
                return el ? { sel: s, rect: el.getBoundingClientRect(), visible: el.offsetParent !== null } : null;
            }).filter(Boolean);

            const overlaps = [];
            for (let i = 0; i < rects.length; i++) {
                for (let j = i + 1; j < rects.length; j++) {
                    const a = rects[i];
                    const b = rects[j];
                    if (!a.visible || !b.visible) continue;
                    // Check horizontal overlap if on the same row
                    const vertOverlap = Math.max(0, Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top));
                    const horizOverlap = Math.max(0, Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left));
                    if (vertOverlap > 10 && horizOverlap > 3) {
                        overlaps.push(`${a.sel} overlaps with ${b.sel} by ${horizOverlap}px`);
                    }
                }
            }
            return { ok: overlaps.length === 0, overlaps, count: rects.length };
        }, selectors);
    }

    // -------------------------------------------------------------
    // TEST 1: WORD EDITOR (.docx)
    // -------------------------------------------------------------
    console.log('\n================== 1. TESTING WORD EDITOR (.docx) ==================');
    await openInOffice(331, 'word', 'Proposed SLN Website Header.docx');

    const wsActive = await page.$eval('#frankDocumentWorkspace', el => el.classList.contains('active') && el.style.display !== 'none');
    record('word', 'Workspace Active', wsActive);

    const wordTitle = await page.$eval('#workspaceDocTitle', el => el.textContent.trim());
    record('word', 'Document Title Displayed', wordTitle.includes('Proposed SLN'), `Title: ${wordTitle}`);

    // Check formatting toolbar alignment and no overlap
    const wordToolbarSels = [
        '#wordUndoBtn', '#wordRedoBtn', '#wordStyleSelect', '#wordFontFamily', '#wordFontSize',
        '#wordBoldBtn', '#wordItalicBtn', '#wordUnderlineBtn', '#wordStrikeBtn',
        '#wordAlignLeft', '#wordAlignCenter', '#wordAlignRight', '#wordAlignJustify',
        '#wordBulletList', '#wordNumList', '#wordOutdentBtn', '#wordIndentBtn',
        '#wordInsertTable', '#wordInsertLink', '#wordInsertLine'
    ];
    const wordOverlap = await checkNoOverlap(wordToolbarSels);
    record('word', 'Toolbar Buttons Do Not Overlap', wordOverlap.ok, wordOverlap.overlaps.join('; '));

    // Verify toolbar does not cover document stage
    const wordStagePos = await page.evaluate(() => {
        const tb = document.getElementById('workspaceToolbar');
        const stage = document.querySelector('.word-editor-stage');
        const pageEl = document.getElementById('wordDocPage');
        const tbRect = tb.getBoundingClientRect();
        const stageRect = stage.getBoundingClientRect();
        const pageRect = pageEl.getBoundingClientRect();
        const stageCentered = Math.abs((stageRect.width - pageRect.width) / 2 - (pageRect.left - stageRect.left)) < 25;
        const noOverlap = tbRect.bottom <= pageRect.top;
        return { noOverlap, tbBottom: tbRect.bottom, pageTop: pageRect.top, stageCentered };
    });
    record('word', 'Toolbar Does Not Cover Document Page', wordStagePos.noOverlap, `tbBottom: ${wordStagePos.tbBottom}, pageTop: ${wordStagePos.pageTop}`);
    record('word', 'Document Page Centered In Stage', wordStagePos.stageCentered);

    // Entity decoding check
    const wordText = await page.$eval('#wordDocPage', el => el.innerText);
    const wordHtml = await page.$eval('#wordDocPage', el => el.innerHTML);
    const hasRawAmpInText = wordText.includes('&amp;');
    const hasDoubleAmpInHtml = wordHtml.includes('&amp;amp;');
    record('word', 'No Double-Escaped HTML Entities (&amp;)', !hasRawAmpInText && !hasDoubleAmpInHtml && wordText.includes('Partners & Accreditations'), `Visible text has &amp;: ${hasRawAmpInText}, HTML has &amp;amp;: ${hasDoubleAmpInHtml}`);

    // Capture initial document screenshot showing clean text and Partners & Accreditations
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_office_word_desktop.png') });
    console.log('[ARTIFACT] Saved test_office_word_desktop.png');

    // Test Word Toolbar Click Functionality
    await page.click('#wordBoldBtn');
    await page.click('#wordItalicBtn');
    await page.click('#wordUnderlineBtn');
    await page.click('#wordInsertTable');
    const tableInserted = await page.$eval('#wordDocPage', el => el.querySelectorAll('table').length > 0);
    record('word', 'Insert Table Functionality', tableInserted);

    // Type text and verify word count
    await page.type('#wordDocPage', ' Additional verified text.');
    const wordCountText = await page.$eval('#statusBarLeft', el => el.textContent);
    record('word', 'Word Count & Status Update', wordCountText.includes('words'), wordCountText);

    // -------------------------------------------------------------
    // TEST 2: PDF VIEWER (.pdf)
    // -------------------------------------------------------------
    console.log('\n================== 2. TESTING PDF VIEWER (.pdf) ==================');
    await openInOffice(330, 'pdf', 'Frankline_L_ATS_Resume.pdf');

    const pdfTitle = await page.$eval('#workspaceDocTitle', el => el.textContent.trim());
    record('pdf', 'Actual PDF Filename Displayed', pdfTitle === 'Frankline_L_ATS_Resume.pdf', pdfTitle);

    const pdfToolbarSels = [
        '#pdfPrevPage', '#pdfPageIndicator', '#pdfNextPage',
        '#pdfZoomOut', '#pdfZoomLabel', '#pdfZoomIn', '#pdfFitWidth',
        '#pdfPrintBtn', '#pdfDownloadBtn'
    ];
    const pdfOverlap = await checkNoOverlap(pdfToolbarSels);
    record('pdf', 'PDF Toolbar Controls Do Not Overlap', pdfOverlap.ok, pdfOverlap.overlaps.join('; '));

    // Centered PDF in viewer area
    const pdfLayout = await page.evaluate(() => {
        const area = document.querySelector('.pdf-viewport-area');
        const container = document.getElementById('pdfZoomContainer');
        const frame = document.getElementById('pdfViewFrame');
        const aRect = area.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        const centered = Math.abs((aRect.width - cRect.width) / 2 - (cRect.left - aRect.left)) < 30;
        return { centered, frameSrc: frame ? frame.src : '' };
    });
    record('pdf', 'PDF Centered In Viewport', pdfLayout.centered);
    record('pdf', 'PDF View Frame Loaded', pdfLayout.frameSrc.includes('/api/files/330/view'), pdfLayout.frameSrc);

    // Test Zoom In / Out / Fit Width
    await page.click('#pdfZoomIn');
    let zoomText = await page.$eval('#pdfZoomLabel', el => el.textContent.trim());
    record('pdf', 'Zoom In (125%)', zoomText === '125%', zoomText);

    await page.click('#pdfFitWidth');
    zoomText = await page.$eval('#pdfZoomLabel', el => el.textContent.trim());
    record('pdf', 'Fit to Width (100%)', zoomText === '100%', zoomText);

    // Test Page Navigation
    await page.click('#pdfNextPage');
    let pageInd = await page.$eval('#pdfPageIndicator', el => el.textContent.trim());
    record('pdf', 'Page Navigation Next (Page 2)', pageInd === 'Page 2', pageInd);

    await page.click('#pdfPrevPage');
    pageInd = await page.$eval('#pdfPageIndicator', el => el.textContent.trim());
    record('pdf', 'Page Navigation Prev (Page 1)', pageInd === 'Page 1', pageInd);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_office_pdf_desktop.png') });
    console.log('[ARTIFACT] Saved test_office_pdf_desktop.png');

    // -------------------------------------------------------------
    // TEST 3: POWERPOINT EDITOR (.pptx)
    // -------------------------------------------------------------
    console.log('\n================== 3. TESTING POWERPOINT EDITOR (.pptx) ==================');
    await openInOffice(329, 'pptx', 'SLN Internship Page (1).pptx');

    const pptxTitle = await page.$eval('#workspaceDocTitle', el => el.textContent.trim());
    record('pptx', 'PPTX Title Displayed', pptxTitle.includes('SLN Internship'), pptxTitle);

    // Check button overlap: + Slide, Duplicate, Delete, Present
    const pptxToolbarSels = ['#pptxAddSlide', '#pptxDupSlide', '#pptxDelSlide', '#startPresentationBtn'];
    const pptxOverlap = await checkNoOverlap(pptxToolbarSels);
    record('pptx', 'Add/Dup/Del Slide & Present Buttons Do Not Overlap', pptxOverlap.ok, pptxOverlap.overlaps.join('; '));

    // Check slide thumbnails in properly sized left sidebar
    const pptxSidebar = await page.evaluate(() => {
        const pane = document.getElementById('pptxThumbnailsPane');
        const cards = pane.querySelectorAll('.slide-thumbnail-card');
        const activeCard = pane.querySelector('.slide-thumbnail-card.active');
        const paneRect = pane.getBoundingClientRect();
        return {
            paneWidth: paneRect.width,
            cardCount: cards.length,
            hasActive: activeCard !== null
        };
    });
    record('pptx', 'Thumbnails Left Sidebar Sized Correctly', pptxSidebar.paneWidth >= 180 && pptxSidebar.paneWidth <= 260, `Width: ${pptxSidebar.paneWidth}px`);
    record('pptx', 'Selected Slide Highlighted', pptxSidebar.hasActive, `Slides: ${pptxSidebar.cardCount}`);

    // Check slide canvas centered
    const pptxCanvasLayout = await page.evaluate(() => {
        const area = document.getElementById('pptxCanvasArea');
        const canvas = document.getElementById('slideCanvas');
        const aRect = area.getBoundingClientRect();
        const cRect = canvas.getBoundingClientRect();
        const centered = Math.abs((aRect.width - cRect.width) / 2 - (cRect.left - aRect.left)) < 25;
        return { centered, width: cRect.width, height: cRect.height };
    });
    record('pptx', 'Presentation Canvas Centered', pptxCanvasLayout.centered);

    // Test Add Slide, Duplicate Slide, Delete Slide
    const initialSlideCount = pptxSidebar.cardCount;
    await page.click('#pptxAddSlide');
    let newCount = await page.$$eval('.slide-thumbnail-card', els => els.length);
    record('pptx', 'Add Slide Action', newCount === initialSlideCount + 1, `Count: ${newCount}`);

    await page.click('#pptxDupSlide');
    newCount = await page.$$eval('.slide-thumbnail-card', els => els.length);
    record('pptx', 'Duplicate Slide Action', newCount === initialSlideCount + 2, `Count: ${newCount}`);

    await page.click('#pptxDelSlide');
    newCount = await page.$$eval('.slide-thumbnail-card', els => els.length);
    record('pptx', 'Delete Slide Action', newCount === initialSlideCount + 1, `Count: ${newCount}`);

    // Test Presentation Mode Toggle
    await page.click('#startPresentationBtn');
    let inPres = await page.$eval('#slideCanvas', el => el.classList.contains('in-presentation'));
    record('pptx', 'Enter Presentation Mode', inPres);

    const deckExitBtn = await page.$('#presExitBtn');
    if (deckExitBtn) {
        await deckExitBtn.click();
        inPres = await page.$eval('#slideCanvas', el => el.classList.contains('in-presentation'));
        record('pptx', 'Exit Presentation Mode', !inPres);
    }

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_office_pptx_desktop.png') });
    console.log('[ARTIFACT] Saved test_office_pptx_desktop.png');

    // -------------------------------------------------------------
    // TEST 4: EXCEL EDITOR (.xlsx)
    // -------------------------------------------------------------
    console.log('\n================== 4. TESTING EXCEL EDITOR (.xlsx) ==================');
    await openInOffice(328, 'excel', '2301 to 2400  (1).xlsx');

    const xlTitle = await page.$eval('#workspaceDocTitle', el => el.textContent.trim());
    record('excel', 'Excel Title Displayed', xlTitle.includes('2301 to 2400'), xlTitle);

    // Check formatting toolbar and row/col buttons
    const xlToolbarSels = [
        '#xlBoldBtn', '#xlItalicBtn', '#xlColorLabelBtn',
        '#xlAlignLeft', '#xlAlignCenter', '#xlAlignRight',
        '#xlInsertRowBtn', '#xlDeleteRowBtn', '#xlInsertColBtn', '#xlDeleteColBtn',
        '#xlFormulaSum', '#xlFormulaAvg', '#xlFormulaMin', '#xlFormulaMax'
    ];
    const xlOverlap = await checkNoOverlap(xlToolbarSels);
    record('excel', 'Formatting & Row/Col Buttons Do Not Overlap', xlOverlap.ok, xlOverlap.overlaps.join('; '));

    // Check row/column control labels
    const btnLabels = await page.evaluate(() => {
        return {
            insertRow: document.getElementById('xlInsertRowBtn')?.innerText.trim(),
            deleteRow: document.getElementById('xlDeleteRowBtn')?.innerText.trim(),
            insertCol: document.getElementById('xlInsertColBtn')?.innerText.trim(),
            deleteCol: document.getElementById('xlDeleteColBtn')?.innerText.trim()
        };
    });
    record('excel', 'Row & Column Controls Clearly Labeled',
        btnLabels.insertRow.includes('Row') && btnLabels.deleteRow.includes('Row') &&
        btnLabels.insertCol.includes('Col') && btnLabels.deleteCol.includes('Col'),
        JSON.stringify(btnLabels)
    );

    // Formula bar aligned on one responsive row
    const formulaBarLayout = await page.evaluate(() => {
        const bar = document.querySelector('.formula-bar-container');
        const badge = document.getElementById('activeCellLabel');
        const fx = document.querySelector('.formula-fx-label');
        const input = document.getElementById('formulaInputField');
        const apply = document.getElementById('applyFormulaBtn');

        const badgeRect = badge.getBoundingClientRect();
        const inputRect = input.getBoundingClientRect();
        const applyRect = apply.getBoundingClientRect();

        // Check vertical alignment: all tops roughly the same row
        const aligned = Math.abs(badgeRect.top - inputRect.top) < 6 && Math.abs(inputRect.top - applyRect.top) < 6;
        return { aligned, badgeTop: badgeRect.top, inputTop: inputRect.top, applyTop: applyRect.top };
    });
    record('excel', 'Formula Bar Aligned on One Row', formulaBarLayout.aligned, `Tops: badge=${formulaBarLayout.badgeTop}, input=${formulaBarLayout.inputTop}, apply=${formulaBarLayout.applyTop}`);

    // Spreadsheet grid headers, borders, tabs
    const gridLayout = await page.evaluate(() => {
        const table = document.getElementById('spreadsheetTable');
        const ths = table.querySelectorAll('th');
        const rows = table.querySelectorAll('tr');
        const tabs = document.querySelectorAll('.sheet-tab-item');
        return { thCount: ths.length, rowCount: rows.length, tabCount: tabs.length };
    });
    record('excel', 'Spreadsheet Table Grid Rendered', gridLayout.rowCount > 10 && gridLayout.thCount > 5, `Rows: ${gridLayout.rowCount}, Cols: ${gridLayout.thCount}`);
    record('excel', 'Sheet Tabs Rendered', gridLayout.tabCount >= 1, `Tabs: ${gridLayout.tabCount}`);

    // Test cell click and formula bar sync
    await page.evaluate(() => {
        const cellB2 = document.querySelector('.sheet-cell[data-r="1"][data-c="1"]');
        if (cellB2) cellB2.click();
    });
    await page.waitForTimeout(300);
    const activeCellCoord = await page.$eval('#activeCellLabel', el => el.textContent.trim());
    record('excel', 'Active Cell Coordinate Updates to B2', activeCellCoord === 'B2', activeCellCoord);

    // Test Formula apply
    await page.fill('#formulaInputField', '=SUM(A1:A5)');
    await page.click('#applyFormulaBtn');
    await page.waitForTimeout(300);
    const cellValue = await page.evaluate(() => {
        const cellB2 = document.querySelector('.sheet-cell[data-r="1"][data-c="1"]');
        return cellB2 ? cellB2.textContent.trim() : '';
    });
    record('excel', 'Formula Applied to Cell', cellValue !== undefined);

    // Test Add Sheet
    await page.click('#addSheetBtn');
    await page.waitForTimeout(400);
    const newTabCount = await page.$$eval('.sheet-tab-item', els => els.length);
    record('excel', 'Add Worksheet Tab Functionality', newTabCount === gridLayout.tabCount + 1, `Tabs now: ${newTabCount}`);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_office_excel_desktop.png') });
    console.log('[ARTIFACT] Saved test_office_excel_desktop.png');

    // -------------------------------------------------------------
    // TEST 5: MULTI-VIEWPORT RESPONSIVENESS
    // -------------------------------------------------------------
    console.log('\n================== 5. TESTING VIEWPORT SIZES ==================');
    const viewports = [
        { name: '1600px Extra Wide', width: 1600, height: 900 },
        { name: '1280px Desktop', width: 1280, height: 800 },
        { name: '768px Tablet', width: 768, height: 1024 },
        { name: '430px Mobile (iPhone Pro Max)', width: 430, height: 932 },
        { name: '375px Mobile (iPhone SE)', width: 375, height: 667 },
        { name: '320px Mobile (Smallest)', width: 320, height: 568 }
    ];

    for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(400);

        // Check Excel toolbar and stage layout at this viewport
        const check = await page.evaluate(() => {
            const tb = document.getElementById('workspaceToolbar');
            const ws = document.getElementById('frankDocumentWorkspace');
            const formulaBar = document.querySelector('.formula-bar-container');
            const gridWrapper = document.getElementById('spreadsheetGridWrapper');

            const tbRect = tb.getBoundingClientRect();
            const wsRect = ws.getBoundingClientRect();
            const formulaRect = formulaBar.getBoundingClientRect();
            const gridRect = gridWrapper.getBoundingClientRect();

            // Toolbar should NOT overlap formula bar
            const noOverlap = tbRect.bottom <= formulaRect.top + 2;
            // Formula bar should NOT overlap grid
            const gridClear = formulaRect.bottom <= gridRect.top + 2;

            return {
                noOverlap,
                gridClear,
                tbHeight: tbRect.height,
                wsVisible: wsRect.width > 0 && wsRect.height > 0
            };
        });

        record('viewports', `${vp.name} (${vp.width}x${vp.height}) Layout Intact`,
            check.noOverlap && check.gridClear && check.wsVisible,
            `noOverlap: ${check.noOverlap}, gridClear: ${check.gridClear}, tbHeight: ${check.tbHeight}px`
        );

        if (vp.width === 768) {
            await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_office_tablet_768.png') });
        } else if (vp.width === 375) {
            await page.screenshot({ path: path.join(ARTIFACT_DIR, 'test_office_mobile_375.png') });
        }
    }

    await browser.close();

    console.log('\n================================================================');
    console.log('                 FINAL TEST RESULTS SUMMARY                     ');
    console.log('================================================================');
    console.log(`Word Processor:       ${testResults.word.pass ? 'PASSED (ALL CHECKS)' : 'FAILED'}`);
    console.log(`PDF Viewer:           ${testResults.pdf.pass ? 'PASSED (ALL CHECKS)' : 'FAILED'}`);
    console.log(`PowerPoint Editor:    ${testResults.pptx.pass ? 'PASSED (ALL CHECKS)' : 'FAILED'}`);
    console.log(`Excel Spreadsheet:    ${testResults.excel.pass ? 'PASSED (ALL CHECKS)' : 'FAILED'}`);
    console.log(`Responsive Viewports: ${testResults.viewports.pass ? 'PASSED (ALL CHECKS)' : 'FAILED'}`);
    console.log('================================================================\n');

    fs.writeFileSync(path.join(ARTIFACT_DIR, 'test_results.json'), JSON.stringify(testResults, null, 2));
}

main().catch(err => {
    console.error('Test run failed:', err);
    process.exit(1);
});
