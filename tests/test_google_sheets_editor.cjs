// =========================================================================
// TEST SUITE: FRANK Office Google Sheets Rebuild Verification
// Tests header, menus, toolbar (30 controls), name box, formula bar, grid,
// keyboard navigation, formulas, tabs, filter, sorting, and status bar.
// =========================================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const BASE_URL = 'http://127.0.0.1:8000';
const ARTIFACT_DIR = path.resolve('C:/Users/inbat/.gemini/antigravity-ide/brain/5b6edf16-bde3-444f-b29a-2ac60c0e715b');

async function runGoogleSheetsTests() {
    console.log('Starting FRANK Office Google Sheets Rebuild E2E Tests...\n');

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
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    await page.addInitScript(({ token, userObj }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(userObj));
        localStorage.setItem('frank_onboarded', 'true');
    }, { token, userObj });

    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    function record(name, passed, details = '') {
        if (passed) {
            results.passed++;
            console.log(`[PASS] ${name}${details ? ` -> ${details}` : ''}`);
        } else {
            results.failed++;
            console.error(`[FAIL] ${name}${details ? ` -> ${details}` : ''}`);
        }
        results.tests.push({ name, passed, details });
    }

    try {
        console.log('--- Step 1: Navigate to Dashboard ---');
        await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        // Remove loading overlay if present
        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });

        const url = page.url();
        record('Authentication & Dashboard Load', url.includes('dashboard.html'), url);

        // 2. Open Excel Document (File ID 328)
        console.log('\n--- Step 2: Open Excel Document in FRANK Workspace ---');
        await page.evaluate(({ fileId, fileType, filename }) => {
            if (!window.frankOfficeWorkspace) {
                window.frankOfficeWorkspace = new FrankOfficeWorkspace();
            }
            const viewUrl = `/api/files/${fileId}/view`;
            window.frankOfficeWorkspace.openDocument(fileId, fileType, filename, viewUrl);
        }, { fileId: 328, fileType: 'excel', filename: '2301 to 2400  (1).xlsx' });

        await page.waitForSelector('#frankDocumentWorkspace.active', { timeout: 10000 });
        await page.waitForTimeout(1500); // Wait for data parsing and grid render

        const isWorkspaceActive = await page.$eval('#frankDocumentWorkspace', el => el.classList.contains('active'));
        record('FRANK Workspace Opened', isWorkspaceActive);

        // 3. Verify Header Menus (File, Edit, View, Insert, Format, Data, Tools, Extensions, Help)
        console.log('\n--- Step 3: Google Sheets Menus ---');
        const menuItems = await page.$$eval('.sheets-menu-item', els => els.map(e => e.textContent.trim()));
        const expectedMenus = ['File', 'Edit', 'View', 'Insert', 'Format', 'Data', 'Tools', 'Extensions', 'Help'];
        const allMenusPresent = expectedMenus.every(m => menuItems.includes(m));
        record('All 9 Google Sheets Menus Present', allMenusPresent, JSON.stringify(menuItems));

        // Click Edit Menu and check dropdown options
        await page.click('.sheets-menu-item[data-menu="edit"]');
        await page.waitForTimeout(200);
        const editOptions = await page.$$eval('.sheets-dropdown-menu .sheets-menu-option', els => els.map(e => e.textContent.trim()));
        record('Edit Menu Dropdown Opens', editOptions.length >= 5, `Options: ${editOptions.slice(0, 4).join(', ')}...`);
        // Close menu
        await page.click('#workspaceDocTitle');
        await page.waitForTimeout(100);

        // 4. Verify Toolbar Controls (Google Sheets 30 controls)
        console.log('\n--- Step 4: 30 Google Sheets Toolbar Controls ---');
        const toolbarChecks = await page.evaluate(() => {
            const checks = {
                search: !!document.getElementById('xlSearchBtn'),
                undo: !!document.getElementById('xlUndoBtn'),
                redo: !!document.getElementById('xlRedoBtn'),
                print: !!document.getElementById('xlPrintBtn'),
                paintFormat: !!document.getElementById('xlPaintFormatBtn'),
                zoom: !!document.getElementById('xlZoomSelect'),
                currency: !!document.getElementById('xlCurrencyBtn'),
                percent: !!document.getElementById('xlPercentBtn'),
                decrDecimals: !!document.getElementById('xlDecrDecimalsBtn'),
                incrDecimals: !!document.getElementById('xlIncrDecimalsBtn'),
                numFormat: !!document.getElementById('xlNumFormatBtn'),
                fontFamily: !!document.getElementById('xlFontFamily'),
                fontSize: !!document.getElementById('xlFontSize'),
                bold: !!document.getElementById('xlBoldBtn'),
                italic: !!document.getElementById('xlItalicBtn'),
                strike: !!document.getElementById('xlStrikeBtn'),
                textColor: !!document.getElementById('xlColorInput'),
                fillColor: !!document.getElementById('xlBgColorInput'),
                borders: !!document.getElementById('xlBordersBtn'),
                merge: !!document.getElementById('xlMergeBtn'),
                alignLeft: !!document.getElementById('xlAlignLeft'),
                alignCenter: !!document.getElementById('xlAlignCenter'),
                alignRight: !!document.getElementById('xlAlignRight'),
                alignMiddle: !!document.getElementById('xlAlignMiddle'),
                textWrap: !!document.getElementById('xlTextWrapBtn'),
                textRotate: !!document.getElementById('xlTextRotateBtn'),
                insertLink: !!document.getElementById('xlInsertLinkBtn'),
                addComment: !!document.getElementById('xlAddCommentBtn'),
                insertChart: !!document.getElementById('xlInsertChartBtn'),
                createFilter: !!document.getElementById('xlCreateFilterBtn'),
                functions: !!document.getElementById('xlFunctionsBtn'),
                collapse: !!document.getElementById('xlCollapseBtn')
            };
            return {
                allPresent: Object.values(checks).every(Boolean),
                checks
            };
        });
        record('All Toolbar Controls Mounted', toolbarChecks.allPresent, `Total checked: ${Object.keys(toolbarChecks.checks).length}`);

        // 5. Test Zoom Functionality
        console.log('\n--- Step 5: Zoom & Viewport ---');
        await page.selectOption('#xlZoomSelect', '125');
        await page.waitForTimeout(200);
        const zoomStyle = await page.$eval('#spreadsheetTable', el => el.style.transform);
        record('Spreadsheet Zoom Scales Grid to 125%', zoomStyle.includes('scale(1.25)'), zoomStyle);
        // Reset zoom to 100%
        await page.selectOption('#xlZoomSelect', '100');

        // 6. Test Name Box and Formula Bar
        console.log('\n--- Step 6: Name Box & Formula Bar Synchronization ---');
        // Click cell B3
        await page.evaluate(() => {
            const cellB3 = document.querySelector('.sheet-cell[data-r="2"][data-c="1"]');
            if (cellB3) cellB3.click();
        });
        await page.waitForTimeout(200);

        let nameBoxVal = await page.$eval('#activeCellLabel', el => el.value);
        record('Name Box Synchronizes with Cell B3 Click', nameBoxVal === 'B3', `Name box: ${nameBoxVal}`);

        // Jump to cell D5 using Name Box
        await page.fill('#activeCellLabel', 'D5');
        await page.press('#activeCellLabel', 'Enter');
        await page.waitForTimeout(200);

        const activeCellD5 = await page.evaluate(() => {
            const cell = document.querySelector('.sheet-cell.selected');
            return cell ? { coord: cell.dataset.coord, r: cell.dataset.r, c: cell.dataset.c } : null;
        });
        record('Name Box Jump to D5 on Enter', activeCellD5 && activeCellD5.coord === 'D5', JSON.stringify(activeCellD5));

        // 7. Formula Engine Calculation & Evaluation
        console.log('\n--- Step 7: Real Formula Calculation Engine ---');
        // Put numbers in A1 and A2
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            sheet.data[0][0] = '100';
            sheet.data[1][0] = '250';
            se.selectCell(2, 0); // select A3
        });
        await page.waitForTimeout(200);

        // Enter formula in formula bar: =SUM(A1:A2)
        await page.fill('#formulaInputField', '=SUM(A1:A2)');
        await page.click('#applyFormulaBtn');
        await page.waitForTimeout(300);

        const a3Eval = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return {
                formula: sheet.formulas['A3'],
                display: se.getDisplayValue(2, 0, sheet)
            };
        });
        record('SUM Formula Evaluated Correctly (=SUM(A1:A2) -> 350)', a3Eval.display === '350', JSON.stringify(a3Eval));

        // Test Arithmetic Formula (=A1*2 + A2/5) -> 100*2 + 50 = 250
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            se.selectCell(3, 0); // select A4
        });
        await page.fill('#formulaInputField', '=A1*2 + A2/5');
        await page.click('#applyFormulaBtn');
        await page.waitForTimeout(300);

        const a4Eval = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return se.getDisplayValue(3, 0, sheet);
        });
        record('Arithmetic Formula Evaluated (=A1*2 + A2/5 -> 250)', a4Eval === '250', `Result: ${a4Eval}`);

        // Test AVERAGE formula (=AVERAGE(A1:A2) -> 175)
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            se.selectCell(4, 0); // select A5
        });
        await page.fill('#formulaInputField', '=AVERAGE(A1:A2)');
        await page.click('#applyFormulaBtn');
        await page.waitForTimeout(300);

        const a5Eval = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return se.getDisplayValue(4, 0, sheet);
        });
        record('AVERAGE Formula Evaluated (=AVERAGE(A1:A2) -> 175)', a5Eval === '175', `Result: ${a5Eval}`);

        // 8. Test Cell Formatting: Currency, Bold, Alignment
        console.log('\n--- Step 8: Cell Styling & Number Formats ---');
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            se.selectCell(0, 0); // Select A1 (100)
        });
        // Click Currency format ($)
        await page.click('#xlCurrencyBtn');
        await page.waitForTimeout(200);

        const formattedCurrency = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return se.getDisplayValue(0, 0, sheet);
        });
        record('Currency Format Applied ($100.00)', formattedCurrency === '$100.00', formattedCurrency);

        // Click Bold toggle
        await page.click('#xlBoldBtn');
        await page.waitForTimeout(200);
        const isBold = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return sheet.styles['A1'] && sheet.styles['A1'].bold;
        });
        record('Bold Toggle Applied to A1', isBold === true);

        // 9. Test Sorting (A-Z)
        console.log('\n--- Step 9: Sorting Range ---');
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            sheet.data[10][2] = 'Zebra';
            sheet.data[11][2] = 'Apple';
            sheet.data[12][2] = 'Mango';
            se.selectedRange = { startR: 10, startC: 2, endR: 12, endC: 2 };
            se.sortRange(true);
        });
        const sortedColC = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return [sheet.data[10][2], sheet.data[11][2], sheet.data[12][2]];
        });
        const isSortedAsc = sortedColC[0] === 'Apple' && sortedColC[1] === 'Mango' && sortedColC[2] === 'Zebra';
        record('Sort Range Ascending (Apple, Mango, Zebra)', isSortedAsc, JSON.stringify(sortedColC));

        // 10. Test Filtering Toggle
        console.log('\n--- Step 10: Filter Toggling ---');
        await page.click('#xlCreateFilterBtn');
        await page.waitForTimeout(200);
        const filterBtnsCount = await page.$$eval('.col-filter-btn', els => els.length);
        record('Filter Mode Enables Column Filter Dropdown Arrows', filterBtnsCount > 5, `Buttons: ${filterBtnsCount}`);

        // 11. Test Range Statistics on Bottom Status Bar
        console.log('\n--- Step 11: Live Status Bar Aggregations ---');
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            // Select range A1:A2 (A1 = 100, A2 = 250)
            se.selectedRange = { startR: 0, startC: 0, endR: 1, endC: 0 };
            se.updateStatusBar();
        });
        const statText = await page.$eval('#sheetStatPill', el => el.textContent.trim());
        record('Status Bar Live Statistics (Sum: 350)', statText.includes('Sum: 350'), statText);

        // 12. Test Worksheet Tabs Management (Add, Rename, Switch)
        console.log('\n--- Step 12: Worksheet Tabs Management ---');
        const initialTabs = await page.$$eval('.sheet-tab-item', els => els.length);
        // Click Add Sheet (+)
        await page.click('.sheet-tab-add-btn');
        await page.waitForTimeout(400);

        const tabsAfterAdd = await page.$$eval('.sheet-tab-item', els => els.length);
        record('Add New Worksheet Tab (+)', tabsAfterAdd === initialTabs + 1, `Tabs: ${tabsAfterAdd}`);

        // Verify newly created sheet is active and empty
        const activeTabTitle = await page.$eval('.sheet-tab-item.active .sheet-tab-title', el => el.textContent.trim());
        record('Active Worksheet Switched to New Sheet', activeTabTitle.includes('Sheet'), activeTabTitle);

        // Switch back to Sheet1
        await page.locator('.sheet-tab-item').first().click();
        await page.waitForTimeout(300);
        const switchedBackDisplay = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return se.getDisplayValue(2, 0, sheet); // A3 was 350
        });
        record('Switch Back Preserves Original Sheet Data (A3 = 350)', switchedBackDisplay === '350', `Display: ${switchedBackDisplay}`);

        // 13. Test Undo / Redo
        console.log('\n--- Step 13: Undo / Redo Support ---');
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            se.selectCell(5, 5);
            se.setCellValue(5, 5, 'UndoTest');
        });
        await page.waitForTimeout(100);

        let cellF6 = await page.evaluate(() => window.frankOfficeWorkspace.sheetsEngine.getCurrentSheet().data[5][5]);
        record('Cell Edited Before Undo', cellF6 === 'UndoTest', cellF6);

        // Click Undo
        await page.click('#xlUndoBtn');
        await page.waitForTimeout(200);
        cellF6 = await page.evaluate(() => window.frankOfficeWorkspace.sheetsEngine.getCurrentSheet().data[5][5]);
        record('Undo Restores Previous Cell State', cellF6 !== 'UndoTest', `Now: "${cellF6}"`);

        // Click Redo
        await page.click('#xlRedoBtn');
        await page.waitForTimeout(200);
        cellF6 = await page.evaluate(() => window.frankOfficeWorkspace.sheetsEngine.getCurrentSheet().data[5][5]);
        record('Redo Re-applies Cell Edit', cellF6 === 'UndoTest', `Now: "${cellF6}"`);

        // 14. Capture Desktop, Tablet, and Mobile Screenshots
        console.log('\n--- Step 14: Visual Verification Screenshots ---');
        // Desktop screenshot
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.waitForTimeout(300);
        const desktopShot = path.join(ARTIFACT_DIR, 'google_sheets_desktop_1440.png');
        await page.screenshot({ path: desktopShot, fullPage: false });
        console.log(`[ARTIFACT] Saved ${desktopShot}`);

        // Tablet screenshot
        await page.setViewportSize({ width: 768, height: 1024 });
        await page.waitForTimeout(300);
        const tabletShot = path.join(ARTIFACT_DIR, 'google_sheets_tablet_768.png');
        await page.screenshot({ path: tabletShot, fullPage: false });
        console.log(`[ARTIFACT] Saved ${tabletShot}`);

        // Mobile screenshot
        await page.setViewportSize({ width: 375, height: 812 });
        await page.waitForTimeout(300);
        const mobileShot = path.join(ARTIFACT_DIR, 'google_sheets_mobile_375.png');
        await page.screenshot({ path: mobileShot, fullPage: false });
        console.log(`[ARTIFACT] Saved ${mobileShot}`);

        console.log('\n======================================================');
        console.log(`GOOGLE SHEETS E2E TEST SUMMARY: ${results.passed} PASSED, ${results.failed} FAILED`);
        console.log('======================================================\n');

    } catch (err) {
        console.error('Fatal error during E2E test:', err);
        results.failed++;
    } finally {
        await browser.close();
    }

    if (results.failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runGoogleSheetsTests();
