const { chromium } = require('playwright');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = 'http://127.0.0.1:8000';

async function runPart1Tests() {
    console.log('===============================================================');
    console.log('   FRANK THINK EXCEL — PART 1 COMPREHENSIVE VERIFICATION SUITE ');
    console.log('===============================================================\n');

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

    let passedCount = 0;
    let failedCount = 0;

    function assert(name, condition, details = '') {
        if (condition) {
            passedCount++;
            console.log(`  [PASS] ${name}${details ? ` -> ${details}` : ''}`);
        } else {
            failedCount++;
            console.error(`  [FAIL] ${name}${details ? ` -> ${details}` : ''}`);
        }
    }

    try {
        console.log('--- Step 1: Open Dashboard and Mount Excel Editor ---');
        await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });

        // Open test Excel document
        await page.evaluate(({ fileId, fileType, filename }) => {
            if (!window.frankOfficeWorkspace) {
                window.frankOfficeWorkspace = new FrankOfficeWorkspace();
            }
            const viewUrl = `/api/files/${fileId}/view`;
            window.frankOfficeWorkspace.openDocument(fileId, fileType, filename, viewUrl);
        }, { fileId: 328, fileType: 'excel', filename: '2301 to 2400  (1).xlsx' });

        await page.waitForSelector('#frankDocumentWorkspace.active', { timeout: 10000 });
        await page.waitForTimeout(1500);

        const isOpen = await page.$eval('#frankDocumentWorkspace', el => el.classList.contains('active'));
        assert('Workspace opened in Excel mode', isOpen);

        // =====================================================================
        // SECTION 1: CELL SELECTION & KEYBOARD NAVIGATION
        // =====================================================================
        console.log('\n--- Section 1: Single-Cell Selection & Name Box Synchronization ---');
        // Click cell B3 (r=2, c=1)
        await page.click('td.sheet-cell[data-r="2"][data-c="1"]');
        await page.waitForTimeout(100);

        let activeCoord = await page.evaluate(() => {
            const cell = document.querySelector('td.sheet-cell.active-focus');
            const nameBox = document.getElementById('activeCellLabel');
            return {
                cellCoord: cell ? cell.dataset.coord : null,
                nameBoxVal: nameBox ? nameBox.value : null
            };
        });
        assert('Cell B3 clicked, has active-focus outline', activeCoord.cellCoord === 'B3', activeCoord.cellCoord);
        assert('Name box updated to B3', activeCoord.nameBoxVal === 'B3', activeCoord.nameBoxVal);

        console.log('\n--- Section 2: Keyboard Grid Navigation ---');
        // Press ArrowRight -> should move to C3
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(100);
        let coord = await page.$eval('#activeCellLabel', el => el.value);
        assert('ArrowRight moves active cell to C3', coord === 'C3', coord);

        // Press ArrowDown -> should move to C4
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(100);
        coord = await page.$eval('#activeCellLabel', el => el.value);
        assert('ArrowDown moves active cell to C4', coord === 'C4', coord);

        // Press Enter -> should move to C5
        await page.keyboard.press('Enter');
        await page.waitForTimeout(100);
        coord = await page.$eval('#activeCellLabel', el => el.value);
        assert('Enter moves active cell to C5', coord === 'C5', coord);

        // Press Shift+Enter -> should move to C4
        await page.keyboard.press('Shift+Enter');
        await page.waitForTimeout(100);
        coord = await page.$eval('#activeCellLabel', el => el.value);
        assert('Shift+Enter moves active cell back to C4', coord === 'C4', coord);

        // Press Tab -> should move to D4
        await page.keyboard.press('Tab');
        await page.waitForTimeout(100);
        coord = await page.$eval('#activeCellLabel', el => el.value);
        assert('Tab moves active cell to D4', coord === 'D4', coord);

        // Press Shift+Tab -> should move to C4
        await page.keyboard.press('Shift+Tab');
        await page.waitForTimeout(100);
        coord = await page.$eval('#activeCellLabel', el => el.value);
        assert('Shift+Tab moves active cell to C4', coord === 'C4', coord);

        // Press Home -> should move to A4
        await page.keyboard.press('Home');
        await page.waitForTimeout(100);
        coord = await page.$eval('#activeCellLabel', el => el.value);
        assert('Home key moves active cell to A4', coord === 'A4', coord);

        // Press Ctrl+Home -> should move to A1
        await page.keyboard.press('Control+Home');
        await page.waitForTimeout(100);
        coord = await page.$eval('#activeCellLabel', el => el.value);
        assert('Ctrl+Home moves active cell to A1', coord === 'A1', coord);

        // =====================================================================
        // SECTION 2: RANGE SELECTION (DRAG, SHIFT+CLICK, SHIFT+ARROW)
        // =====================================================================
        console.log('\n--- Section 3: Range Selection ---');
        // Click B2
        await page.click('td.sheet-cell[data-r="1"][data-c="1"]');
        await page.waitForTimeout(100);

        // Shift+Click D4 -> range B2:D4
        await page.click('td.sheet-cell[data-r="3"][data-c="3"]', { modifiers: ['Shift'] });
        await page.waitForTimeout(100);

        let rangeInfo = await page.evaluate(() => {
            const nameBox = document.getElementById('activeCellLabel').value;
            const selectedCells = document.querySelectorAll('td.sheet-cell.selected, td.sheet-cell.range-selected').length;
            const se = window.frankOfficeWorkspace.sheetsEngine;
            return {
                nameBox,
                selectedCells,
                mode: se.selectionMode,
                range: se.selectedRange
            };
        });
        assert('Shift+Click creates range B2:D4 in Name box', rangeInfo.nameBox === 'B2:D4', rangeInfo.nameBox);
        assert('Highlight applied to all 9 cells in B2:D4', rangeInfo.selectedCells === 9, `Selected: ${rangeInfo.selectedCells}`);

        // Shift+ArrowRight extends range to B2:E4
        await page.keyboard.press('Shift+ArrowRight');
        await page.waitForTimeout(100);
        coord = await page.$eval('#activeCellLabel', el => el.value);
        assert('Shift+ArrowRight extends range to B2:E4', coord === 'B2:E4', coord);

        // =====================================================================
        // SECTION 3: ROW SELECTION (CLICK, SHIFT+CLICK, HIGHLIGHT)
        // =====================================================================
        console.log('\n--- Section 4: Row Selection ---');
        // Click row header 5 (data-r="4")
        await page.click('td.row-header[data-r="4"]');
        await page.waitForTimeout(100);

        let rowSel = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const nameBox = document.getElementById('activeCellLabel').value;
            const isRowHeaderSelected = document.querySelector('td.row-header[data-r="4"]').classList.contains('selected');
            const rowCellsSelected = document.querySelectorAll('tr[data-r="4"] td.sheet-cell.range-selected').length;
            return {
                mode: se.selectionMode,
                nameBox,
                isRowHeaderSelected,
                rowCellsSelected
            };
        });
        assert('Click row header 5 sets mode to "row"', rowSel.mode === 'row', rowSel.mode);
        assert('Name box reflects row range 5:5', rowSel.nameBox === '5:5', rowSel.nameBox);
        assert('Row header 5 is visually selected', rowSel.isRowHeaderSelected);
        assert('All cells in row 5 are highlighted', rowSel.rowCellsSelected > 0, `Cells: ${rowSel.rowCellsSelected}`);

        // Shift+Click row header 7 (data-r="6") -> rows 5:7
        await page.click('td.row-header[data-r="6"]', { modifiers: ['Shift'] });
        await page.waitForTimeout(100);

        coord = await page.$eval('#activeCellLabel', el => el.value);
        assert('Shift+Click row header 7 selects rows 5:7', coord === '5:7', coord);

        // =====================================================================
        // SECTION 4: COLUMN SELECTION (CLICK, SHIFT+CLICK, HIGHLIGHT, CORNER ALL)
        // =====================================================================
        console.log('\n--- Section 5: Column Selection & Corner Select All ---');
        // Click column header B (data-c="1")
        await page.click('th.col-header[data-c="1"]');
        await page.waitForTimeout(100);

        let colSel = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const nameBox = document.getElementById('activeCellLabel').value;
            const isColHeaderSelected = document.querySelector('th.col-header[data-c="1"]').classList.contains('selected');
            const colCellsSelected = document.querySelectorAll('td.sheet-cell[data-c="1"].range-selected').length;
            return {
                mode: se.selectionMode,
                nameBox,
                isColHeaderSelected,
                colCellsSelected
            };
        });
        assert('Click column header B sets mode to "col"', colSel.mode === 'col', colSel.mode);
        assert('Name box reflects column range B:B', colSel.nameBox === 'B:B', colSel.nameBox);
        assert('Column header B is visually selected', colSel.isColHeaderSelected);
        assert('All cells in column B are highlighted', colSel.colCellsSelected > 0, `Cells: ${colSel.colCellsSelected}`);

        // Shift+Click column header D (data-c="3") -> columns B:D
        await page.click('th.col-header[data-c="3"]', { modifiers: ['Shift'] });
        await page.waitForTimeout(100);

        coord = await page.$eval('#activeCellLabel', el => el.value);
        assert('Shift+Click column header D selects columns B:D', coord === 'B:D', coord);

        // Click Corner Select All (#xlCornerSelectAll)
        await page.click('#xlCornerSelectAll');
        await page.waitForTimeout(100);

        let allSel = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const nameBox = document.getElementById('activeCellLabel').value;
            const cornerSelected = document.getElementById('xlCornerSelectAll').classList.contains('selected');
            return {
                mode: se.selectionMode,
                nameBox,
                cornerSelected
            };
        });
        assert('Corner click sets mode to "all"', allSel.mode === 'all', allSel.mode);
        assert('Corner header button has selected class', allSel.cornerSelected);
        assert('Name box shows entire sheet range', allSel.nameBox.includes(':'), allSel.nameBox);

        // =====================================================================
        // SECTION 5: CUSTOM RIGHT-CLICK CONTEXT MENUS (ROW, COL, CELL)
        // =====================================================================
        console.log('\n--- Section 6: Context Menus ---');
        // A. Row Context Menu
        await page.click('td.row-header[data-r="2"]', { button: 'right' });
        await page.waitForTimeout(200);

        let rowMenu = await page.evaluate(() => {
            const menu = document.getElementById('spreadsheetContextMenu');
            if (!menu) return null;
            const items = Array.from(menu.querySelectorAll('.sheets-context-menu-item')).map(el => el.textContent.trim());
            return {
                visible: true,
                items,
                rect: { top: menu.offsetTop, left: menu.offsetLeft }
            };
        });
        assert('Row context menu appeared on right-click', !!rowMenu);
        assert('Row menu contains "Insert row above"', rowMenu?.items.some(it => it.includes('Insert') && it.includes('above')));
        assert('Row menu contains "Insert row below"', rowMenu?.items.some(it => it.includes('Insert') && it.includes('below')));
        assert('Row menu contains "Delete row"', rowMenu?.items.some(it => it.includes('Delete')));
        assert('Row menu contains "Clear contents"', rowMenu?.items.some(it => it.includes('Clear contents')));
        assert('Row menu contains "Resize row height..."', rowMenu?.items.some(it => it.includes('Resize row height')));
        assert('Row menu contains "Hide row"', rowMenu?.items.some(it => it.includes('Hide')));
        assert('Row menu contains "Unhide rows"', rowMenu?.items.some(it => it.includes('Unhide')));

        // Test Escape closes context menu
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        let menuGone = await page.$('#spreadsheetContextMenu') === null;
        assert('Escape key closes context menu', menuGone);

        // B. Column Context Menu
        await page.click('#spreadsheetTable th.col-header[data-c="2"]', { button: 'right' });
        await page.waitForTimeout(200);

        let colMenu = await page.evaluate(() => {
            const menu = document.getElementById('spreadsheetContextMenu');
            if (!menu) return null;
            const items = Array.from(menu.querySelectorAll('.sheets-context-menu-item')).map(el => el.textContent.trim());
            return {
                visible: true,
                items
            };
        });
        assert('Column context menu appeared on right-click', !!colMenu);
        assert('Column menu contains "Insert column left"', colMenu?.items.some(it => it.includes('Insert') && it.includes('left')));
        assert('Column menu contains "Insert column right"', colMenu?.items.some(it => it.includes('Insert') && it.includes('right')));
        assert('Column menu contains "Delete column"', colMenu?.items.some(it => it.includes('Delete')));
        assert('Column menu contains "Clear contents"', colMenu?.items.some(it => it.includes('Clear contents')));
        assert('Column menu contains "Resize column width..."', colMenu?.items.some(it => it.includes('Resize column width')));
        assert('Column menu contains "Hide column"', colMenu?.items.some(it => it.includes('Hide')));
        assert('Column menu contains "Unhide columns"', colMenu?.items.some(it => it.includes('Unhide')));

        // Click outside closes context menu
        await page.click('#workspaceDocTitle');
        await page.waitForTimeout(100);
        menuGone = await page.$('#spreadsheetContextMenu') === null;
        assert('Click outside closes context menu', menuGone);

        // C. Cell Context Menu
        await page.click('td.sheet-cell[data-r="2"][data-c="2"]', { button: 'right', force: true });
        await page.waitForTimeout(200);

        let cellMenu = await page.evaluate(() => {
            const menu = document.getElementById('spreadsheetContextMenu');
            if (!menu) return null;
            const items = Array.from(menu.querySelectorAll('.sheets-context-menu-item')).map(el => ({
                text: el.textContent.trim(),
                disabled: el.classList.contains('disabled')
            }));
            return items;
        });
        assert('Cell context menu appeared on right-click', cellMenu && cellMenu.length > 0);
        assert('Cell menu contains Cut, Copy, Paste', cellMenu?.some(it => it.text.includes('Cut')) && cellMenu?.some(it => it.text.includes('Copy')));
        assert('Cell menu contains disabled "Insert cells..."', cellMenu?.some(it => it.text.includes('Insert cells') && it.disabled));
        assert('Cell menu contains disabled "Delete cells..."', cellMenu?.some(it => it.text.includes('Delete cells') && it.disabled));
        assert('Cell menu contains "Format cells..."', cellMenu?.some(it => it.text.includes('Format cells')));

        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);

        // =====================================================================
        // SECTION 6: STRUCTURAL ROW & COLUMN OPERATIONS
        // =====================================================================
        console.log('\n--- Section 7: Structural Row & Column Operations ---');

        // Put test content in A1, B1, C1
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            sheet.data[0][0] = 'Alpha';
            sheet.data[0][1] = 'Beta';
            sheet.data[0][2] = 'Gamma';
            se.renderGrid();
        });
        await page.waitForTimeout(100);

        // 1. Insert Row Above Row 1 (atRow=0)
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            se.excelInsertRows(0, 1, false);
        });
        await page.waitForTimeout(200);

        let testRowInsert = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return {
                row0Val: sheet.data[0][0], // should now be empty string
                row1Val: sheet.data[1][0]  // should now be 'Alpha'
            };
        });
        assert('Insert row above row 1: original Alpha shifted to row 2', testRowInsert.row0Val === '' && testRowInsert.row1Val === 'Alpha');

        // 2. Delete Row (row 1, so Alpha moves back to row 1)
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            se.excelDeleteRows(0, 1);
        });
        await page.waitForTimeout(200);

        let testRowDelete = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return sheet.data[0][0];
        });
        assert('Delete row 1: Alpha shifted back to row 1', testRowDelete === 'Alpha');

        // 3. Insert Column Left of Column A (atCol=0)
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            se.excelInsertCols(0, 1, false);
        });
        await page.waitForTimeout(200);

        let testColInsert = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return {
                colA: sheet.data[0][0], // should be empty
                colB: sheet.data[0][1]  // should be 'Alpha'
            };
        });
        assert('Insert column left: Alpha shifted to Column B', testColInsert.colA === '' && testColInsert.colB === 'Alpha');

        // 4. Delete Column (col 0, so Alpha moves back to Col A)
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            se.excelDeleteCols(0, 1);
        });
        await page.waitForTimeout(200);

        let testColDelete = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return sheet.data[0][0];
        });
        assert('Delete column A: Alpha shifted back to Column A', testColDelete === 'Alpha');

        // 5. Clear Contents action
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            se.selectCell(0, 0); // select A1
            se.excelClearContents('cell');
        });
        await page.waitForTimeout(100);

        let testClear = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return {
                a1: sheet.data[0][0],
                b1: sheet.data[0][1] // should still be 'Beta'
            };
        });
        assert('Clear contents emptied A1', testClear.a1 === '');
        assert('Unrelated cell B1 preserved ("Beta")', testClear.b1 === 'Beta');

        // =====================================================================
        // SECTION 7: RESIZING ROWS AND COLUMNS
        // =====================================================================
        console.log('\n--- Section 8: Interactive and Programmatic Resizing ---');
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            sheet.colWidths[1] = 180; // Column B = 180px
            sheet.rowHeights[0] = 50;  // Row 1 = 50px
            se.renderGrid();
        });
        await page.waitForTimeout(100);

        let resizeCheck = await page.evaluate(() => {
            const colB = document.querySelector('th.col-header[data-c="1"]');
            const row1 = document.querySelector('tr[data-r="0"]');
            return {
                colW: colB ? colB.offsetWidth : 0,
                rowH: row1 ? row1.offsetHeight : 0
            };
        });
        assert('Column B width set to 180px in DOM', resizeCheck.colW >= 170, `Width: ${resizeCheck.colW}`);
        assert('Row 1 height set to 50px in DOM', resizeCheck.rowH >= 45, `Height: ${resizeCheck.rowH}`);

        // =====================================================================
        // SECTION 8: HIDE AND UNHIDE ROWS AND COLUMNS
        // =====================================================================
        console.log('\n--- Section 9: Hide and Unhide Rows & Columns ---');
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            se.excelHideRows(1, 1); // Hide row 2
            se.excelHideCols(2, 2); // Hide col C
        });
        await page.waitForTimeout(200);

        let hideCheck = await page.evaluate(() => {
            const row2Hidden = document.querySelector('tr.hidden-row[data-r="1"]') !== null;
            const colCHidden = document.querySelector('th.col-header.hidden-col[data-c="2"]') !== null;
            return { row2Hidden, colCHidden };
        });
        assert('Row 2 has .hidden-row style and display:none', hideCheck.row2Hidden);
        assert('Column C has .hidden-col style and display:none', hideCheck.colCHidden);

        // Unhide rows and columns
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            se.excelUnhideRows();
            se.excelUnhideCols();
        });
        await page.waitForTimeout(200);

        let unhideCheck = await page.evaluate(() => {
            const row2Hidden = document.querySelector('tr.hidden-row[data-r="1"]') !== null;
            const colCHidden = document.querySelector('th.col-header.hidden-col[data-c="2"]') !== null;
            return { row2Hidden, colCHidden };
        });
        assert('Row 2 is visible again after unhide', !unhideCheck.row2Hidden);
        assert('Column C is visible again after unhide', !unhideCheck.colCHidden);

        // =====================================================================
        // SECTION 9: FORMULA REFERENCE INTEGRITY ON ROW/COL OPERATIONS
        // =====================================================================
        console.log('\n--- Section 10: Formula Reference Integrity ---');
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            sheet.data[0][0] = '100'; // A1 = 100
            sheet.formulas['B1'] = '=A1*2'; // B1 formula references A1
            sheet.data[0][1] = '=A1*2';
        });

        // Insert row above row 1: B1 moves to B2, formula should update to =A2*2
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            se.excelInsertRows(0, 1, false);
        });
        await page.waitForTimeout(100);

        let formulaShiftCheck = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return {
                b2Formula: sheet.formulas['B2'],
                b1Formula: sheet.formulas['B1']
            };
        });
        assert('Formula reference shifted from =A1*2 to =A2*2 on row insertion', formulaShiftCheck.b2Formula === '=A2*2', JSON.stringify(formulaShiftCheck));

        // Delete row 2: B2 moves back to B1, formula should update back to =A1*2
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            se.excelDeleteRows(0, 1);
        });
        await page.waitForTimeout(100);

        let formulaDeleteCheck = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            const sheet = se.getCurrentSheet();
            return sheet.formulas['B1'];
        });
        assert('Formula reference shifted back to =A1*2 on row deletion', formulaDeleteCheck === '=A1*2', formulaDeleteCheck);

        // =====================================================================
        // SECTION 10: WORKBOOK PERSISTENCE
        // =====================================================================
        console.log('\n--- Section 11: Document Persistence ---');
        const saveResult = await page.evaluate(async () => {
            return await window.frankOfficeWorkspace.saveDocument();
        });
        assert('Document saved successfully with existing API', saveResult === true, `Result: ${saveResult}`);

    } catch (err) {
        console.error('Fatal test error:', err);
        failedCount++;
    } finally {
        await browser.close();
    }

    console.log('\n===============================================================');
    console.log(`PART 1 VERIFICATION COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('===============================================================\n');

    process.exit(failedCount === 0 ? 0 : 1);
}

runPart1Tests();
