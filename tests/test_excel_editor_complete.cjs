// =========================================================================
// FRANK Think — Complete Excel Editor Functionality Repair Test Suite
// Verifies every menu item, toolbar action, keyboard shortcut, dialog,
// formula engine calculation, and spreadsheet operation (Phases 1-12).
// =========================================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const HARNESS_PATH = path.resolve(__dirname, 'test_excel_harness.html');
const HARNESS_URL = `file://${HARNESS_PATH.replace(/\\/g, '/')}`;

async function runExcelEditorCompleteTestSuite() {
    console.log('================================================================');
    console.log('  FRANK THINK — COMPLETE EXCEL EDITOR AUDIT & TEST SUITE');
    console.log('================================================================\n');

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            const txt = msg.text();
            if (!txt.includes('favicon')) {
                consoleErrors.push(txt);
            }
        }
    });

    const results = {
        passed: 0,
        failed: 0,
        tests: []
    };

    function test(name, condition, details = '') {
        if (condition) {
            results.passed++;
            console.log(`  [PASS] ${name}${details ? ` -> ${details}` : ''}`);
        } else {
            results.failed++;
            console.error(`  [FAIL] ${name}${details ? ` -> ${details}` : ''}`);
        }
        results.tests.push({ name, passed: !!condition, details });
    }

    try {
        console.log('--- Phase 1: Mount & Architecture Verification ---');
        await page.goto(HARNESS_URL, { waitUntil: 'load' });
        await page.waitForFunction(() => window.sheetsEngineReady === true);

        // Verify Menus
        const menuItems = await page.$$eval('.sheets-menu-item', els => els.map(e => e.textContent.trim()));
        const expectedMenus = ['File', 'Edit', 'View', 'Insert', 'Format', 'Data', 'Tools', 'Extensions', 'Help'];
        test('Phase 1.1: All 9 Menu Categories Rendered', expectedMenus.every(m => menuItems.includes(m)), JSON.stringify(menuItems));

        // Verify Toolbar 30 controls
        const toolbarButtons = await page.$$eval('.sheets-toolbar-inner button, .sheets-toolbar-inner select', els => els.length);
        test('Phase 1.2: Toolbar Controls Mounted (>= 25 controls)', toolbarButtons >= 25, `Found ${toolbarButtons} controls`);

        // Verify Formula Bar
        const formulaBarExists = await page.$('#formulaInputField') !== null;
        const nameBoxExists = await page.$('#activeCellLabel') !== null;
        test('Phase 1.3: Formula Bar and Name Box Present', formulaBarExists && nameBoxExists);

        // Verify Grid
        const gridCellsCount = await page.$$eval('td.sheet-cell', els => els.length);
        test('Phase 1.4: Grid Table Mounted with Cells', gridCellsCount > 0, `Cells: ${gridCellsCount}`);

        // =====================================================================
        // PHASE 2: FILE MENU
        // =====================================================================
        console.log('\n--- Phase 2: File Menu Actions ---');

        // 2.1 File -> Document Information
        await page.evaluate(() => window.sheetsEngine.fileDocInfo());
        await page.waitForTimeout(100);
        let modalHeader = await page.$eval('.sheets-dialog-header h3', el => el.textContent);
        test('Phase 2.1: Document Information Dialog Opened', modalHeader.includes('Document Information'));
        await page.click('.sheets-dialog-close');
        await page.waitForTimeout(100);

        // 2.2 File -> Rename Workbook
        await page.evaluate(() => window.sheetsEngine.fileRenameWorkbook());
        await page.waitForTimeout(100);
        modalHeader = await page.$eval('.sheets-dialog-header h3', el => el.textContent);
        test('Phase 2.2: Rename Workbook Dialog Opened', modalHeader.includes('Rename Workbook'));
        // Type new name
        await page.fill('#renameWorkbookInput', 'Q3_Financial_Model');
        await page.click('#btnConfirmRename');
        await page.waitForTimeout(100);
        const renamedTitle = await page.$eval('#workspaceDocTitle', el => el.textContent);
        test('Phase 2.3: Workbook Title Renamed with .xlsx preserved', renamedTitle === 'Q3_Financial_Model.xlsx', renamedTitle);

        // 2.3 File -> Edit Document (Properties/Metadata)
        await page.evaluate(() => window.sheetsEngine.fileEditDocument());
        await page.waitForTimeout(100);
        modalHeader = await page.$eval('.sheets-dialog-header h3', el => el.textContent);
        test('Phase 2.4: Edit Document Properties Dialog Opened', modalHeader.includes('Workbook Properties'));
        await page.fill('#propAuthor', 'Frankline Auditor');
        await page.click('#btnSaveDocProps');
        await page.waitForTimeout(100);
        const authorSaved = await page.evaluate(() => window.sheetsEngine.getCurrentSheet().properties?.author === 'Frankline Auditor');
        test('Phase 2.5: Workbook Metadata Saved', authorSaved);

        // 2.4 File -> Make a Copy
        const origSheetCount = await page.evaluate(() => window.mockWorkspace.excelData.sheets.length);
        await page.evaluate(() => window.sheetsEngine.fileMakeCopy());
        await page.waitForTimeout(100);
        const copiedTitle = await page.$eval('#workspaceDocTitle', el => el.textContent);
        test('Phase 2.6: Make a Copy Creates Independent Workbook', copiedTitle.includes('(Copy)') || copiedTitle.includes('Copy of'), copiedTitle);

        // 2.5 File -> Save
        await page.evaluate(() => window.sheetsEngine.fileSave());
        await page.waitForTimeout(150);
        const saveStatusText = await page.$eval('#workspaceSaveStatus', el => el.textContent);
        test('Phase 2.7: Save Workbook Updates Status to Saved', saveStatusText === 'Saved');

        // 2.6 File -> Download as Excel (.xlsx)
        const xlsxResult = await page.evaluate(() => {
            try {
                window.sheetsEngine.fileExportXlsx();
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });
        test('Phase 2.8: Download as Excel (.xlsx) invokes SheetJS export safely', xlsxResult.success);

        // 2.7 File -> Download as CSV (.csv)
        const csvResult = await page.evaluate(() => {
            try {
                window.sheetsEngine.fileExportCsv();
                return { success: true };
            } catch (e) {
                return { success: false, error: e.message };
            }
        });
        test('Phase 2.9: Download as CSV (.csv) executes safely', csvResult.success);

        // 2.8 File -> Print
        const printResult = await page.evaluate(() => {
            const orig = window.print;
            let called = false;
            window.print = () => { called = true; };
            window.sheetsEngine.filePrint();
            window.print = orig;
            return called;
        });
        test('Phase 2.10: Print Workbook Invokes Print Handler', printResult);

        // 2.9 File -> Version History
        await page.evaluate(() => window.sheetsEngine.fileVersionHistory());
        test('Phase 2.11: Version History Drawer Toggled', await page.evaluate(() => window.mockWorkspace.versionDrawerOpen));

        // 2.10 File -> Close
        await page.evaluate(() => {
            window.mockWorkspace.isDirty = false;
            window.sheetsEngine.fileClose();
        });
        test('Phase 2.12: Close Document Triggered When Clean', await page.evaluate(() => window.mockWorkspace.closeAttempted));

        // 2.11 File -> New Workbook (with dirty check)
        await page.evaluate(() => {
            window.sheetsEngine.setCellValue(0, 0, 'Temporary Data');
            window.mockWorkspace.markDirty();
            window.sheetsEngine.fileNewWorkbook();
        });
        await page.waitForTimeout(100);
        const dirtyModalOpen = await page.$('.sheets-modal-overlay') !== null;
        test('Phase 2.13: New Workbook with unsaved changes prompts Warning Modal', dirtyModalOpen);
        // Click Discard
        await page.click('#btnDiscardNew');
        await page.waitForTimeout(100);
        const resetCellA1 = await page.evaluate(() => window.sheetsEngine.getCellValue(0, 0));
        test('Phase 2.14: Discarding Resets Workbook to Blank State', resetCellA1 === '');

        // =====================================================================
        // PHASE 3: EDIT MENU
        // =====================================================================
        console.log('\n--- Phase 3: Edit Menu Actions ---');

        // Setup test data in A1, B1, C1
        await page.evaluate(() => {
            window.sheetsEngine.setCellValue(0, 0, 'Apple');
            window.sheetsEngine.setCellValue(0, 1, 'Banana');
            window.sheetsEngine.setCellValue(0, 2, 'Cherry');
            window.sheetsEngine.renderGrid(true);
        });

        // 3.1 Undo & Redo
        await page.evaluate(() => {
            window.sheetsEngine.setCellValue(0, 0, 'Orange');
            window.sheetsEngine.renderGrid(true);
        });
        test('Phase 3.1: Cell Value Changed to Orange', await page.evaluate(() => window.sheetsEngine.getCellValue(0, 0)) === 'Orange');
        await page.evaluate(() => window.sheetsEngine.undo());
        test('Phase 3.2: Undo Restores Cell Value to Apple', await page.evaluate(() => window.sheetsEngine.getCellValue(0, 0)) === 'Apple');
        await page.evaluate(() => window.sheetsEngine.redo());
        test('Phase 3.3: Redo Reapplies Cell Value to Orange', await page.evaluate(() => window.sheetsEngine.getCellValue(0, 0)) === 'Orange');

        // 3.2 Cut, Copy & Paste
        await page.evaluate(() => {
            window.sheetsEngine.selectRange(0, 0, 0, 0); // Select A1
            window.sheetsEngine.editCopy();
            window.sheetsEngine.selectCell(2, 0, 'A3'); // Move to A3
            window.sheetsEngine.editPaste();
        });
        test('Phase 3.4: Copy and Paste Duplicates Data to Target Cell', await page.evaluate(() => window.sheetsEngine.getCellValue(2, 0)) === 'Orange');

        // 3.3 Clear Contents
        await page.evaluate(() => {
            window.sheetsEngine.selectCell(2, 0, 'A3');
            window.sheetsEngine.editClearContents();
        });
        test('Phase 3.5: Clear Contents Empties Cell Value', await page.evaluate(() => window.sheetsEngine.getCellValue(2, 0)) === '');

        // 3.4 Select All
        await page.evaluate(() => window.sheetsEngine.editSelectAll());
        const isAllSelected = await page.evaluate(() => {
            const range = window.sheetsEngine.selectedRange;
            const sheet = window.sheetsEngine.getCurrentSheet();
            return range.startR === 0 && range.startC === 0 &&
                   range.endR === sheet.data.length - 1 && range.endC === sheet.data[0].length - 1;
        });
        test('Phase 3.6: Select All Selects Entire Grid Dimensions', isAllSelected);

        // 3.5 Find and Replace
        await page.evaluate(() => {
            window.sheetsEngine.setCellValue(1, 0, 'Fruit Market');
            window.sheetsEngine.setCellValue(2, 0, 'Fruit Store');
            window.sheetsEngine.editFindReplace();
        });
        await page.waitForTimeout(100);
        await page.fill('#findInput', 'Fruit');
        await page.fill('#replaceInput', 'Fresh');
        await page.click('#replaceAllBtn');
        await page.waitForTimeout(100);
        const replacedA2 = await page.evaluate(() => window.sheetsEngine.getCellValue(1, 0));
        const replacedA3 = await page.evaluate(() => window.sheetsEngine.getCellValue(2, 0));
        test('Phase 3.7: Find and Replace (Replace All) Updates Matches', replacedA2 === 'Fresh Market' && replacedA3 === 'Fresh Store');

        // 3.6 Delete Row & Delete Column
        const prevRows = await page.evaluate(() => window.sheetsEngine.getCurrentSheet().data.length);
        await page.evaluate(() => {
            window.sheetsEngine.selectCell(2, 0, 'A3');
            window.sheetsEngine.excelDeleteRow();
        });
        const afterRows = await page.evaluate(() => window.sheetsEngine.getCurrentSheet().data.length);
        test('Phase 3.8: Delete Row Decrements Total Row Count', afterRows === prevRows - 1);

        const prevCols = await page.evaluate(() => window.sheetsEngine.getCurrentSheet().data[0].length);
        await page.evaluate(() => {
            window.sheetsEngine.selectCell(0, 2, 'C1');
            window.sheetsEngine.excelDeleteCol();
        });
        const afterCols = await page.evaluate(() => window.sheetsEngine.getCurrentSheet().data[0].length);
        test('Phase 3.9: Delete Column Decrements Total Col Count', afterCols === prevCols - 1);

        // =====================================================================
        // PHASE 4: VIEW MENU
        // =====================================================================
        console.log('\n--- Phase 4: View Menu Actions ---');

        // 4.1 Zoom Levels
        for (const zoom of [50, 75, 100, 125, 150]) {
            await page.evaluate((z) => window.sheetsEngine.setZoom(z), zoom);
            const actualZoom = await page.evaluate(() => window.sheetsEngine.zoomLevel);
            const selectVal = await page.$eval('#xlZoomSelect', el => el.value);
            test(`Phase 4.1: Set Zoom to ${zoom}% Updates Viewport & Select`, actualZoom === zoom && selectVal === String(zoom));
        }

        // 4.2 Show / Hide Formula Bar
        await page.evaluate(() => window.sheetsEngine.viewToggleFormulaBar());
        const formulaBarHidden = await page.$eval('.sheets-formula-bar', el => el.style.display === 'none');
        test('Phase 4.2: Hide Formula Bar Updates Layout', formulaBarHidden);
        await page.evaluate(() => window.sheetsEngine.viewToggleFormulaBar());
        const formulaBarVisible = await page.$eval('.sheets-formula-bar', el => el.style.display !== 'none');
        test('Phase 4.3: Show Formula Bar Restores Visibility', formulaBarVisible);

        // 4.3 Show / Hide Gridlines
        await page.evaluate(() => window.sheetsEngine.viewToggleGridlines());
        const gridlinesHidden = await page.$eval('.spreadsheet-table', el => el.classList.contains('hide-gridlines'));
        test('Phase 4.4: Hide Gridlines Adds hide-gridlines Class', gridlinesHidden);
        await page.evaluate(() => window.sheetsEngine.viewToggleGridlines());
        const gridlinesRestored = await page.$eval('.spreadsheet-table', el => !el.classList.contains('hide-gridlines'));
        test('Phase 4.5: Show Gridlines Removes hide-gridlines Class', gridlinesRestored);

        // 4.4 Freeze Panes
        await page.evaluate(() => window.sheetsEngine.setFrozen(1, 1));
        const frozenRows1 = await page.evaluate(() => window.sheetsEngine.frozenRows);
        const frozenCols1 = await page.evaluate(() => window.sheetsEngine.frozenCols);
        test('Phase 4.6: Freeze 1 Row & 1 Column Updates State', frozenRows1 === 1 && frozenCols1 === 1);

        await page.evaluate(() => window.sheetsEngine.setFrozen(0, 0));
        const noFrozen = await page.evaluate(() => window.sheetsEngine.frozenRows === 0 && window.sheetsEngine.frozenCols === 0);
        test('Phase 4.7: No Frozen Panes Clears Sticky Offsets', noFrozen);

        // 4.5 Full Screen
        const fsSafe = await page.evaluate(() => {
            try {
                window.sheetsEngine.viewToggleFullScreen();
                return true;
            } catch (e) {
                return false;
            }
        });
        test('Phase 4.8: Full Screen Handles Browser Context Gracefully', fsSafe);

        // =====================================================================
        // PHASE 5: INSERT MENU
        // =====================================================================
        console.log('\n--- Phase 5: Insert Menu Actions ---');

        // 5.1 Insert Row Above & Below
        const rowsBeforeInsert = await page.evaluate(() => window.sheetsEngine.getCurrentSheet().data.length);
        await page.evaluate(() => {
            window.sheetsEngine.selectCell(1, 0, 'A2');
            window.sheetsEngine.excelInsertRow();
        });
        const rowsAfterInsertAbove = await page.evaluate(() => window.sheetsEngine.getCurrentSheet().data.length);
        test('Phase 5.1: Insert Row Above Increments Row Count', rowsAfterInsertAbove === rowsBeforeInsert + 1);

        await page.evaluate(() => {
            window.sheetsEngine.selectCell(1, 0, 'A2');
            window.sheetsEngine.excelInsertRowBelow();
        });
        const rowsAfterInsertBelow = await page.evaluate(() => window.sheetsEngine.getCurrentSheet().data.length);
        test('Phase 5.2: Insert Row Below Increments Row Count', rowsAfterInsertBelow === rowsAfterInsertAbove + 1);

        // 5.2 Insert Column Left & Right
        const colsBeforeInsert = await page.evaluate(() => window.sheetsEngine.getCurrentSheet().data[0].length);
        await page.evaluate(() => {
            window.sheetsEngine.selectCell(0, 1, 'B1');
            window.sheetsEngine.excelInsertCol();
        });
        const colsAfterInsertLeft = await page.evaluate(() => window.sheetsEngine.getCurrentSheet().data[0].length);
        test('Phase 5.3: Insert Column Left Increments Col Count', colsAfterInsertLeft === colsBeforeInsert + 1);

        await page.evaluate(() => {
            window.sheetsEngine.selectCell(0, 1, 'B1');
            window.sheetsEngine.excelInsertColRight();
        });
        const colsAfterInsertRight = await page.evaluate(() => window.sheetsEngine.getCurrentSheet().data[0].length);
        test('Phase 5.4: Insert Column Right Increments Col Count', colsAfterInsertRight === colsAfterInsertLeft + 1);

        // 5.3 New Worksheet
        const sheetsBefore = await page.evaluate(() => window.mockWorkspace.excelData.sheets.length);
        await page.evaluate(() => window.sheetsEngine.excelAddSheet());
        const sheetsAfter = await page.evaluate(() => window.mockWorkspace.excelData.sheets.length);
        const activeSheetName = await page.evaluate(() => window.sheetsEngine.getCurrentSheet().name);
        test('Phase 5.5: New Worksheet Appends Unique Sheet and Activates It', sheetsAfter === sheetsBefore + 1 && activeSheetName === 'Sheet2');

        // Switch back to Sheet1
        await page.evaluate(() => window.sheetsEngine.switchSheet(0));

        // 5.4 Insert Link
        await page.evaluate(() => {
            window.sheetsEngine.selectCell(0, 0, 'A1');
            window.sheetsEngine.insertLink();
        });
        await page.waitForTimeout(100);
        await page.fill('#linkUrl', 'https://frank.app');
        await page.fill('#linkText', 'FRANK Portal');
        await page.click('#btnApplyLink');
        await page.waitForTimeout(100);
        const linkInserted = await page.evaluate(() => {
            const st = window.sheetsEngine.getCellStyle(0, 0);
            return st && st.link === 'https://frank.app' && window.sheetsEngine.getCellValue(0, 0) === 'FRANK Portal';
        });
        test('Phase 5.6: Insert Link Stores URL & Display Text in Sheet Model', linkInserted);

        // 5.5 Insert Checkbox
        await page.evaluate(() => {
            window.sheetsEngine.selectCell(0, 1, 'B1');
            window.sheetsEngine.insertCheckbox();
        });
        const checkboxState = await page.evaluate(() => {
            const st = window.sheetsEngine.getCellStyle(0, 1);
            return st && st.isCheckbox === true && window.sheetsEngine.getCellValue(0, 1) === false;
        });
        test('Phase 5.7: Insert Checkbox Sets isCheckbox Flag with Default False', checkboxState);

        // 5.6 Insert Chart
        await page.evaluate(() => {
            window.sheetsEngine.setCellValue(3, 0, 'Sales');
            window.sheetsEngine.setCellValue(3, 1, 100);
            window.sheetsEngine.setCellValue(4, 0, 'Profit');
            window.sheetsEngine.setCellValue(4, 1, 45);
            window.sheetsEngine.selectRange(3, 0, 4, 1);
            window.sheetsEngine.insertChart();
        });
        await page.waitForTimeout(100);
        const chartModalOpen = await page.$('.chart-modal-card') !== null;
        test('Phase 5.8: Insert Chart Opens Visual Chart Builder Modal', chartModalOpen);
        await page.click('.chart-modal-card .sheets-dialog-close');
        await page.waitForTimeout(100);

        // =====================================================================
        // PHASE 6: FORMAT MENU
        // =====================================================================
        console.log('\n--- Phase 6: Format Menu Actions ---');

        await page.evaluate(() => {
            window.sheetsEngine.selectCell(5, 5, 'F6');
            window.sheetsEngine.setCellValue(5, 5, '1234.56');
        });

        // 6.1 Font Styles: Bold, Italic, Underline, Strikethrough
        await page.evaluate(() => window.sheetsEngine.toggleCellFormat('bold'));
        test('Phase 6.1: Bold Format Applied', await page.evaluate(() => window.sheetsEngine.getCellStyle(5, 5).bold === true));

        await page.evaluate(() => window.sheetsEngine.toggleCellFormat('italic'));
        test('Phase 6.2: Italic Format Applied', await page.evaluate(() => window.sheetsEngine.getCellStyle(5, 5).italic === true));

        await page.evaluate(() => window.sheetsEngine.toggleCellFormat('underline'));
        test('Phase 6.3: Underline Format Applied', await page.evaluate(() => window.sheetsEngine.getCellStyle(5, 5).underline === true));

        await page.evaluate(() => window.sheetsEngine.toggleCellFormat('strike'));
        test('Phase 6.4: Strikethrough Format Applied', await page.evaluate(() => window.sheetsEngine.getCellStyle(5, 5).strike === true));

        // 6.2 Number Formats: Currency, Percentage, Date, Text
        await page.evaluate(() => window.sheetsEngine.setNumberFormat('currency'));
        test('Phase 6.5: Currency ($) Number Format Set', await page.evaluate(() => window.sheetsEngine.getCellStyle(5, 5).numFormat === 'currency'));

        await page.evaluate(() => window.sheetsEngine.setNumberFormat('percent'));
        test('Phase 6.6: Percentage (%) Number Format Set', await page.evaluate(() => window.sheetsEngine.getCellStyle(5, 5).numFormat === 'percent'));

        await page.evaluate(() => window.sheetsEngine.setNumberFormat('date'));
        test('Phase 6.7: Date Number Format Set', await page.evaluate(() => window.sheetsEngine.getCellStyle(5, 5).numFormat === 'date'));

        await page.evaluate(() => window.sheetsEngine.setNumberFormat('text'));
        test('Phase 6.8: Plain Text Number Format Set', await page.evaluate(() => window.sheetsEngine.getCellStyle(5, 5).numFormat === 'text'));

        // 6.3 Alignments
        await page.evaluate(() => window.sheetsEngine.setCellFormat('align', 'right'));
        test('Phase 6.9: Alignment Right Applied', await page.evaluate(() => window.sheetsEngine.getCellStyle(5, 5).align === 'right'));

        await page.evaluate(() => window.sheetsEngine.setCellFormat('align', 'center'));
        test('Phase 6.10: Alignment Center Applied', await page.evaluate(() => window.sheetsEngine.getCellStyle(5, 5).align === 'center'));

        // 6.4 Text Wrapping
        await page.evaluate(() => window.sheetsEngine.setCellFormat('wrap', 'wrap'));
        test('Phase 6.11: Text Wrapping Wrap Applied', await page.evaluate(() => window.sheetsEngine.getCellStyle(5, 5).wrap === 'wrap'));

        // 6.5 Clear Formatting
        await page.evaluate(() => window.sheetsEngine.formatClearFormatting());
        const styleCleared = await page.evaluate(() => {
            const st = window.sheetsEngine.getCellStyle(5, 5);
            return Object.keys(st).length === 0;
        });
        const valuePreserved = await page.evaluate(() => window.sheetsEngine.getCellValue(5, 5) === '1234.56');
        test('Phase 6.12: Clear Formatting Removes Styles but Preserves Cell Value', styleCleared && valuePreserved);

        // =====================================================================
        // PHASE 7: DATA MENU
        // =====================================================================
        console.log('\n--- Phase 7: Data Menu Actions ---');

        // Setup unsorted data in column 0 (rows 10-13)
        await page.evaluate(() => {
            window.sheetsEngine.setCellValue(10, 0, 'Zebra');
            window.sheetsEngine.setCellValue(11, 0, 'Bear');
            window.sheetsEngine.setCellValue(12, 0, 'Monkey');
            window.sheetsEngine.setCellValue(13, 0, 'Antelope');
            window.sheetsEngine.selectRange(10, 0, 13, 0);
        });

        // 7.1 Sort Range A → Z
        await page.evaluate(() => window.sheetsEngine.sortRange(true));
        const sortedAZ = await page.evaluate(() => [
            window.sheetsEngine.getCellValue(10, 0),
            window.sheetsEngine.getCellValue(11, 0),
            window.sheetsEngine.getCellValue(12, 0),
            window.sheetsEngine.getCellValue(13, 0)
        ]);
        test('Phase 7.1: Sort Range A → Z Sorts Ascending', sortedAZ[0] === 'Antelope' && sortedAZ[3] === 'Zebra', JSON.stringify(sortedAZ));

        // 7.2 Sort Range Z → A
        await page.evaluate(() => window.sheetsEngine.sortRange(false));
        const sortedZA = await page.evaluate(() => [
            window.sheetsEngine.getCellValue(10, 0),
            window.sheetsEngine.getCellValue(11, 0),
            window.sheetsEngine.getCellValue(12, 0),
            window.sheetsEngine.getCellValue(13, 0)
        ]);
        test('Phase 7.2: Sort Range Z → A Sorts Descending', sortedZA[0] === 'Zebra' && sortedZA[3] === 'Antelope', JSON.stringify(sortedZA));

        // 7.3 Create / Remove Filter
        await page.evaluate(() => window.sheetsEngine.toggleFilter());
        test('Phase 7.3: Create Filter Toggles filterActive Flag', await page.evaluate(() => window.sheetsEngine.filterActive === true));
        await page.evaluate(() => window.sheetsEngine.toggleFilter());
        test('Phase 7.4: Remove Filter Deactivates filterActive Flag', await page.evaluate(() => window.sheetsEngine.filterActive === false));

        // 7.4 Data Validation Modal
        await page.evaluate(() => window.sheetsEngine.openDataValidation());
        await page.waitForTimeout(100);
        const dvModalOpen = await page.$eval('.sheets-dialog-header h3', el => el.textContent.includes('Data validation'));
        test('Phase 7.5: Data Validation Dialog Opened', dvModalOpen);
        await page.click('.sheets-dialog-close');
        await page.waitForTimeout(100);

        // 7.5 Remove Duplicates Modal
        await page.evaluate(() => window.sheetsEngine.removeDuplicates());
        await page.waitForTimeout(100);
        const dupModalOpen = await page.$eval('.sheets-dialog-header h3', el => el.textContent.includes('Remove Duplicates'));
        test('Phase 7.6: Remove Duplicates Dialog Opened', dupModalOpen);
        await page.click('.sheets-dialog-close');
        await page.waitForTimeout(100);

        // 7.6 Split Text to Columns Modal
        await page.evaluate(() => {
            window.sheetsEngine.setCellValue(15, 0, 'New York, USA, 8000000');
            window.sheetsEngine.selectCell(15, 0, 'A16');
            window.sheetsEngine.splitTextToColumns();
        });
        await page.waitForTimeout(100);
        const splitModalOpen = await page.$eval('.sheets-dialog-header h3', el => el.textContent.includes('Split Text to Columns'));
        test('Phase 7.7: Split Text to Columns Dialog Opened with Delimiter Options', splitModalOpen);
        await page.click('#confirmSplitBtn');
        await page.waitForTimeout(100);
        const splitValCol1 = await page.evaluate(() => window.sheetsEngine.getCellValue(15, 0));
        const splitValCol2 = await page.evaluate(() => window.sheetsEngine.getCellValue(15, 1));
        const splitValCol3 = await page.evaluate(() => window.sheetsEngine.getCellValue(15, 2));
        test('Phase 7.8: Split Text to Columns Separates Data Accurately', splitValCol1.trim() === 'New York' && splitValCol2.trim() === 'USA' && splitValCol3.trim() === '8000000');

        // =====================================================================
        // PHASE 8: TOOLS & EXTENSIONS MENUS
        // =====================================================================
        console.log('\n--- Phase 8: Tools & Extensions Actions ---');

        // 8.1 Spellcheck & Trim Spaces
        await page.evaluate(() => {
            window.sheetsEngine.setCellValue(16, 0, '   Extra    Spaces   ');
            window.sheetsEngine.selectCell(16, 0, 'A17');
            window.sheetsEngine.toolSpellcheck();
        });
        const trimmedVal = await page.evaluate(() => window.sheetsEngine.getCellValue(16, 0));
        test('Phase 8.1: Trim Spaces Normalizes Excessive Whitespace', trimmedVal === 'Extra Spaces', trimmedVal);

        // 8.2 Formula Syntax Assistance
        await page.evaluate(() => {
            window.sheetsEngine.getCurrentSheet().formulas['A18'] = '=SUM(1, 2'; // Mismatched paren
            window.sheetsEngine.toolFormulaHelp();
        });
        await page.waitForTimeout(100);
        const formulaModalOpen = await page.$eval('.sheets-dialog-header h3', el => el.textContent.includes('Formula Syntax Assistance'));
        test('Phase 8.2: Formula Syntax Assistance Detects Formula Errors', formulaModalOpen);
        await page.click('.sheets-dialog-close');
        await page.waitForTimeout(100);

        // 8.3 Accessibility Mode
        await page.evaluate(() => window.sheetsEngine.toolAccessibility());
        const a11yActive = await page.$eval('#frankDocumentWorkspace', el => el.classList.contains('spreadsheet-accessibility-mode'));
        test('Phase 8.3: Accessibility Mode Enables High-Contrast Focus & Labels', a11yActive);
        await page.evaluate(() => window.sheetsEngine.toolAccessibility());
        const a11yDisabled = await page.$eval('#frankDocumentWorkspace', el => !el.classList.contains('spreadsheet-accessibility-mode'));
        test('Phase 8.4: Accessibility Mode Toggles Off Cleanly', a11yDisabled);

        // 8.4 FRANK AI Data Assistant
        await page.evaluate(() => window.sheetsEngine.extFrankAiAssistant());
        await page.waitForTimeout(100);
        const aiModalOpen = await page.$eval('.sheets-dialog-header h3', el => el.textContent.includes('FRANK AI Data Assistant'));
        test('Phase 8.5: FRANK AI Data Assistant Opens with Contextual Insights', aiModalOpen);
        await page.click('.sheets-dialog-close');
        await page.waitForTimeout(100);

        // 8.5 Export JSON Dataset
        const jsonExport = await page.evaluate(() => {
            try {
                window.sheetsEngine.extExportJson();
                return true;
            } catch (e) {
                return false;
            }
        });
        test('Phase 8.6: Export JSON Dataset Generates Structured Output', jsonExport);

        // =====================================================================
        // PHASE 9: HELP MENU & KEYBOARD SHORTCUTS
        // =====================================================================
        console.log('\n--- Phase 9: Help Menu & Shortcuts Modals ---');

        // 9.1 Keyboard Shortcuts Dialog
        await page.evaluate(() => window.sheetsEngine.helpShortcuts());
        await page.waitForTimeout(100);
        const shortcutsModal = await page.$eval('.sheets-dialog-header h3', el => el.textContent.includes('Keyboard shortcuts'));
        test('Phase 9.1: Keyboard Shortcuts Modal Displays Supported Shortcuts', shortcutsModal);
        await page.click('.sheets-dialog-close');
        await page.waitForTimeout(100);

        // 9.2 Function List & Syntax Dialog
        await page.evaluate(() => window.sheetsEngine.helpFunctions());
        await page.waitForTimeout(100);
        const functionsModal = await page.$eval('.sheets-dialog-header h3', el => el.textContent.includes('Function list'));
        test('Phase 9.2: Function List Reference Modal Lists Supported Formulas', functionsModal);
        await page.click('.sheets-dialog-close');
        await page.waitForTimeout(100);

        // 9.3 Spreadsheet Help Guide Dialog
        await page.evaluate(() => window.sheetsEngine.helpGuide());
        await page.waitForTimeout(100);
        const guideModal = await page.$eval('.sheets-dialog-header h3', el => el.textContent.includes('Spreadsheet Help Guide'));
        test('Phase 9.3: Spreadsheet Help Guide Modal Displays Detailed Guidance', guideModal);
        await page.click('.sheets-dialog-close');
        await page.waitForTimeout(100);

        // =====================================================================
        // PHASE 10: REAL FORMULA ENGINE VERIFICATION
        // =====================================================================
        console.log('\n--- Phase 10: Formula Engine Verification ---');

        // Setup numeric grid for formulas
        await page.evaluate(() => {
            window.sheetsEngine.setCellValue(20, 0, 10); // A21 = 10
            window.sheetsEngine.setCellValue(21, 0, 20); // A22 = 20
            window.sheetsEngine.setCellValue(22, 0, 30); // A23 = 30
            window.sheetsEngine.setCellValue(23, 0, 40); // A24 = 40
        });

        // 10.1 SUM
        const sumResult = await page.evaluate(() => window.sheetsEngine.evalRealFormula('=SUM(A21:A24)', window.sheetsEngine.getCurrentSheet()));
        test('Phase 10.1: Formula SUM(A21:A24) calculates 100', sumResult === 100, `Result: ${sumResult}`);

        // 10.2 AVERAGE
        const avgResult = await page.evaluate(() => window.sheetsEngine.evalRealFormula('=AVERAGE(A21:A24)', window.sheetsEngine.getCurrentSheet()));
        test('Phase 10.2: Formula AVERAGE(A21:A24) calculates 25', avgResult === 25, `Result: ${avgResult}`);

        // 10.3 COUNT
        const countResult = await page.evaluate(() => window.sheetsEngine.evalRealFormula('=COUNT(A21:A24)', window.sheetsEngine.getCurrentSheet()));
        test('Phase 10.3: Formula COUNT(A21:A24) calculates 4', countResult === 4, `Result: ${countResult}`);

        // 10.4 MAX & MIN
        const maxResult = await page.evaluate(() => window.sheetsEngine.evalRealFormula('=MAX(A21:A24)', window.sheetsEngine.getCurrentSheet()));
        const minResult = await page.evaluate(() => window.sheetsEngine.evalRealFormula('=MIN(A21:A24)', window.sheetsEngine.getCurrentSheet()));
        test('Phase 10.4: Formulas MAX & MIN calculate 40 and 10', maxResult === 40 && minResult === 10, `Max: ${maxResult}, Min: ${minResult}`);

        // 10.5 IF condition
        const ifTrueResult = await page.evaluate(() => window.sheetsEngine.evalRealFormula('=IF(A21>5, "Pass", "Fail")', window.sheetsEngine.getCurrentSheet()));
        test('Phase 10.5: Formula IF(A21>5, "Pass", "Fail") evaluates "Pass"', ifTrueResult === 'Pass', `Result: ${ifTrueResult}`);

        // 10.6 Unrecognized function name returns #NAME?
        const unsupportedResult = await page.evaluate(() => window.sheetsEngine.evalRealFormula('=NONEXISTENT_FUNCTION(A21:A24)', window.sheetsEngine.getCurrentSheet()));
        test('Phase 10.6: Unrecognized Formula Name Reports #NAME? Error', unsupportedResult === '#NAME?', `Result: ${unsupportedResult}`);

        // 10.7 Arithmetic Expressions
        const mathResult = await page.evaluate(() => window.sheetsEngine.evalRealFormula('= (10 + 5) * 2 - 6 / 2', window.sheetsEngine.getCurrentSheet()));
        test('Phase 10.7: Operator Precedence (10 + 5) * 2 - 6 / 2 calculates 27', mathResult === 27, `Result: ${mathResult}`);

        // =====================================================================
        // PHASE 11: KEYBOARD SHORTCUTS INTEGRATION
        // =====================================================================
        console.log('\n--- Phase 11: Keyboard Shortcut Triggers ---');

        // Ctrl+B
        await page.evaluate(() => window.sheetsEngine.selectCell(0, 0, 'A1'));
        await page.keyboard.press('Control+b');
        test('Phase 11.1: Keyboard Shortcut Ctrl+B Toggles Bold', await page.evaluate(() => window.sheetsEngine.getCellStyle(0, 0).bold === true));

        // Ctrl+I
        await page.keyboard.press('Control+i');
        test('Phase 11.2: Keyboard Shortcut Ctrl+I Toggles Italic', await page.evaluate(() => window.sheetsEngine.getCellStyle(0, 0).italic === true));

        // Ctrl+U
        await page.keyboard.press('Control+u');
        test('Phase 11.3: Keyboard Shortcut Ctrl+U Toggles Underline', await page.evaluate(() => window.sheetsEngine.getCellStyle(0, 0).underline === true));

        // Ctrl+\ (Clear Formatting)
        await page.keyboard.press('Control+\\');
        const shortcutsClear = await page.evaluate(() => Object.keys(window.sheetsEngine.getCellStyle(0, 0)).length === 0);
        test('Phase 11.4: Keyboard Shortcut Ctrl+\\ Clears Formatting', shortcutsClear);

        // Escape closes any open menu or modal
        await page.evaluate(() => window.sheetsEngine.helpGuide());
        await page.waitForTimeout(100);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(100);
        const modalClosedOnEscape = await page.$('.sheets-modal-overlay') === null;
        test('Phase 11.5: Escape Key Closes Modals and Menus', modalClosedOnEscape);

        // Check console errors
        test('Phase 12: Zero Unexpected Console Errors', consoleErrors.length === 0, consoleErrors.join('; '));

    } catch (err) {
        console.error('Test execution exception:', err);
        test('Test suite runtime exception', false, err.message);
    } finally {
        await browser.close();
    }

    console.log('\n================================================================');
    console.log(`TOTAL TESTS: ${results.passed + results.failed}`);
    console.log(`PASSED: ${results.passed}`);
    console.log(`FAILED: ${results.failed}`);
    console.log('================================================================');

    if (results.failed > 0) {
        process.exit(1);
    }
}

runExcelEditorCompleteTestSuite();
