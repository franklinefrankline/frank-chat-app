const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function runExcelMobileActionsTests() {
    console.log('=== STARTING EXCEL MOBILE EDIT, DOWNLOAD & PRINT E2E TESTS ===\n');

    const browser = await chromium.launch({ headless: true });
    
    // Test user credentials
    const testEmail = 'persistent_user_test@frank.app';
    const testPassword = 'SecurePass123!';

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`[PASS] ${message}`);
            passed++;
        } else {
            console.error(`[FAIL] ${message}`);
            failed++;
        }
    }

    try {
        // =====================================================================
        // PART 1: MOBILE VIEWPORT SPREADSHEET EDITOR (390 x 844)
        // =====================================================================
        console.log('--- PART 1: Testing Mobile Viewport (iPhone 14 / Pixel 7: 390x844) ---');
        const mobileContext = await browser.newContext({
            viewport: { width: 390, height: 844 },
            userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
            isMobile: true,
            hasTouch: true
        });

        await mobileContext.addInitScript(() => {
            try {
                window.__printCalled = false;
                window.print = () => { window.__printCalled = true; };
                const consent = {
                    version: '1.0',
                    noticeVersion: '2026.1',
                    timestamp: new Date().toISOString(),
                    categories: { essential: true, preferences: true, analytics: true, marketing: true }
                };
                localStorage.setItem('frank_cookie_consent_v1', JSON.stringify(consent));
            } catch (e) {}
        });

        const mobilePage = await mobileContext.newPage();

        // 1.1 Login test user
        console.log('Step 1.1: Logging in test user...');
        await mobilePage.goto('http://127.0.0.1:8000/login.html');
        await mobilePage.waitForSelector('#loginUsername', { timeout: 10000 });
        await mobilePage.fill('#loginUsername', testEmail);
        await mobilePage.fill('#loginPassword', testPassword);
        await mobilePage.click('#loginSubmitBtn', { force: true });
        await mobilePage.waitForURL('**/dashboard.html', { timeout: 10000 });
        assert(mobilePage.url().includes('dashboard.html'), 'Logged in successfully and reached dashboard');

        // Capture auth token from localStorage
        const token = await mobilePage.evaluate(() => localStorage.getItem('chatapp_token') || localStorage.getItem('frank_token'));
        assert(Boolean(token), 'Auth token acquired');

        // 1.2 Open standalone spreadsheet editor
        console.log('Step 1.2: Navigating to spreadsheet.html on mobile...');
        await mobilePage.goto('http://127.0.0.1:8000/spreadsheet.html');
        await mobilePage.waitForSelector('.spreadsheet-table', { timeout: 15000 });
        assert(await mobilePage.isVisible('.spreadsheet-table'), 'Spreadsheet table loaded on mobile viewport');

        // Check top bar and toolbar visibility
        const isTopBarVisible = await mobilePage.isVisible('.workspace-top-bar');
        const isToolbarVisible = await mobilePage.isVisible('.sheets-toolbar-inner');
        assert(isTopBarVisible, 'Mobile top workspace bar is visible');
        assert(isToolbarVisible, 'Mobile sheets toolbar ribbon is visible and scrollable');

        // 1.3 Verify Edit, Download, and Print buttons are present on mobile
        console.log('Step 1.3: Checking Edit, Download, and Print buttons on mobile...');
        const editBtnTop = await mobilePage.$('.workspace-top-actions .workspace-btn[aria-label="Edit Selected Cell"]');
        const downloadBtnTop = await mobilePage.$('.workspace-top-actions .workspace-btn[aria-label="Download Workbook"]');
        const printBtnTop = await mobilePage.$('.workspace-top-actions .workspace-btn[aria-label="Print Spreadsheet"]');

        const editBtnRibbon = await mobilePage.$('.sheets-toolbar-inner .tool-btn-edit');
        const downloadBtnRibbon = await mobilePage.$('.sheets-toolbar-inner .tool-btn-download');
        const printBtnRibbon = await mobilePage.$('.sheets-toolbar-inner .tool-btn-print');

        assert(Boolean(editBtnTop || editBtnRibbon), 'Edit button is present on mobile');
        assert(Boolean(downloadBtnTop || downloadBtnRibbon), 'Download button is present on mobile');
        assert(Boolean(printBtnTop || printBtnRibbon), 'Print button is present on mobile');

        // 1.4 Test Cell Editing and Formula Recalculation on Mobile
        console.log('Step 1.4: Testing Cell Editing and Formula Recalculation on Mobile...');
        
        // Find cell B4 (Active Users = 1250)
        const cellB4Locator = mobilePage.locator('td[data-coord="B4"]');
        assert(await cellB4Locator.count() > 0, 'Found cell B4 with data-coord="B4"');

        // Click cell B4 to select it
        await cellB4Locator.click();
        await mobilePage.waitForTimeout(200);

        // Tap the Edit button
        const editBtn = editBtnTop || editBtnRibbon;
        await editBtn.click();
        await mobilePage.waitForTimeout(200);

        // Check that inline input appeared
        const inlineInput = await mobilePage.$('.cell-inline-input');
        assert(Boolean(inlineInput), 'Inline cell editor input is active after tapping Edit');

        // Change value to 2500 and press Enter
        await inlineInput.fill('2500');
        await inlineInput.press('Enter');
        await mobilePage.waitForTimeout(400);

        // Verify cell B4 now shows 2,500
        const updatedB4Text = (await mobilePage.locator('td[data-coord="B4"]').textContent()).trim();
        console.log(`Updated cell B4 text: "${updatedB4Text}"`);
        assert(updatedB4Text.includes('2,500') || updatedB4Text.includes('2500'), 'Cell B4 successfully edited to 2,500');

        // Verify dependent formula cell D4 (=B4*C4) recalculated!
        // B4 is 2500, C4 is $48.50 -> 2500 * 48.5 = 121,250
        const updatedD4Text = (await mobilePage.locator('td[data-coord="D4"]').textContent()).trim();
        console.log(`Dependent formula cell D4 text: "${updatedD4Text}"`);
        assert(updatedD4Text.includes('121,250') || updatedD4Text.includes('121250'), 'Dependent formula D4 (=B4*C4) recalculated correctly');

        // Verify summary SUM cell B7 (=SUM(B4:B6)) recalculated!
        // 2500 + 1420 + 1890 = 5810
        const updatedB7Text = (await mobilePage.locator('td[data-coord="B7"]').textContent()).trim();
        console.log(`Summary formula cell B7 text: "${updatedB7Text}"`);
        assert(updatedB7Text.includes('5,810') || updatedB7Text.includes('5810'), 'Summary formula B7 (=SUM(B4:B6)) recalculated correctly');

        // 1.5 Test Mobile Formula Bar Editing
        console.log('Step 1.5: Testing Mobile Formula Bar editing...');
        // Select cell A4 (January)
        const cellA4Locator = mobilePage.locator('td[data-coord="A4"]');
        await cellA4Locator.click();
        await mobilePage.waitForTimeout(200);

        const formulaInput = await mobilePage.$('.formula-input-field');
        assert(Boolean(formulaInput), 'Formula input field is present');
        await formulaInput.fill('January (Q1)');
        await formulaInput.press('Enter');
        await mobilePage.waitForTimeout(300);

        const updatedA4Text = (await mobilePage.locator('td[data-coord="A4"]').textContent()).trim();
        console.log(`Updated cell A4 text: "${updatedA4Text}"`);
        assert(updatedA4Text === 'January (Q1)', 'Cell A4 updated from Formula Bar input');

        // 1.6 Test Mobile Tap-Again-To-Edit
        console.log('Step 1.6: Testing Tap-Again-To-Edit on mobile cell...');
        // Tapping cell A4 while already active should trigger inline editor
        await cellA4Locator.click();
        await mobilePage.waitForTimeout(200);
        const inlineInputTap = await mobilePage.$('.cell-inline-input');
        assert(Boolean(inlineInputTap), 'Tapping an already-active cell triggers inline editor (tap-to-edit)');
        if (inlineInputTap) {
            await inlineInputTap.press('Escape');
            await mobilePage.waitForTimeout(200);
        }

        // 1.7 Test Download Button (XLSX and CSV export)
        console.log('Step 1.7: Testing Download button and export...');
        const downloadBtn = downloadBtnTop || downloadBtnRibbon;
        await downloadBtn.click();
        await mobilePage.waitForSelector('.modal-content', { timeout: 5000 });
        assert(await mobilePage.isVisible('.modal-content'), 'Import/Export modal opened after clicking Download');

        // Test XLSX download event
        const downloadPromiseXlsx = mobilePage.waitForEvent('download', { timeout: 10000 });
        const exportBtn = await mobilePage.$('.modal-footer .workspace-btn-primary');
        await exportBtn.click();
        const downloadedXlsx = await downloadPromiseXlsx;
        assert(downloadedXlsx.suggestedFilename().endsWith('.xlsx'), `XLSX downloaded successfully with filename: ${downloadedXlsx.suggestedFilename()}`);

        // Wait for modal to close
        await mobilePage.waitForSelector('.modal-content', { state: 'detached', timeout: 5000 }).catch(() => {});
        await mobilePage.waitForTimeout(300);

        // Verify CSV export option
        await downloadBtn.click();
        await mobilePage.waitForSelector('.modal-content', { timeout: 5000 });
        // Select CSV radio
        const csvRadio = mobilePage.locator('label', { hasText: 'CSV (.csv)' });
        if (await csvRadio.count() > 0) {
            await csvRadio.click();
            await mobilePage.waitForTimeout(200);
            const downloadPromiseCsv = mobilePage.waitForEvent('download', { timeout: 10000 });
            const exportBtnCsv = await mobilePage.$('.modal-footer .workspace-btn-primary');
            await exportBtnCsv.click();
            const downloadedCsv = await downloadPromiseCsv;
            assert(downloadedCsv.suggestedFilename().endsWith('.csv'), `CSV downloaded successfully with filename: ${downloadedCsv.suggestedFilename()}`);
            
            // Read downloaded CSV content to verify edited data is present!
            const csvPath = await downloadedCsv.path();
            if (csvPath) {
                const csvData = fs.readFileSync(csvPath, 'utf-8');
                assert(csvData.includes('2500'), 'Downloaded CSV contains user edited value ("2500")');
            }
        } else {
            const closeBtn = await mobilePage.$('.modal-header button');
            if (closeBtn) await closeBtn.click();
        }
        await mobilePage.waitForSelector('.modal-content', { state: 'detached', timeout: 5000 }).catch(() => {});
        await mobilePage.waitForTimeout(400);

        // 1.8 Test Print Button and Clean Print Styles
        console.log('Step 1.8: Testing Print button and print layout...');
        // Hook window.print in page
        await mobilePage.evaluate(() => {
            window.__printCalled = false;
            window.print = () => { window.__printCalled = true; };
        });

        const printBtn = printBtnTop || printBtnRibbon;
        await printBtn.click();
        await mobilePage.waitForTimeout(400);

        const printCalled = await mobilePage.evaluate(() => window.__printCalled);
        assert(printCalled === true, 'Print button triggered window.print()');

        // Check data-print-title attribute on container
        const printTitle = await mobilePage.evaluate(() => {
            const container = document.querySelector('.app-container');
            return container ? container.getAttribute('data-print-title') : '';
        });
        assert(printTitle.length > 0, `Print title attribute properly set: "${printTitle}"`);

        // Check @media print CSS rules exist in stylesheet
        const printRulesExist = await mobilePage.evaluate(() => {
            let hasPrint = false;
            for (const sheet of document.styleSheets) {
                try {
                    for (const rule of sheet.cssRules) {
                        if (rule.media && rule.media.mediaText.includes('print')) {
                            hasPrint = true;
                            break;
                        }
                    }
                } catch (e) {}
            }
            return hasPrint;
        });
        assert(printRulesExist, '@media print stylesheet rules present for clean output');

        // 1.9 Test Themes (Sandstone and Monochrome)
        console.log('Step 1.9: Testing Sandstone and Monochrome theme toggle...');
        const initialTheme = await mobilePage.evaluate(() => document.documentElement.getAttribute('data-theme'));
        const themeBtn = await mobilePage.$('.theme-toggle-btn');
        if (themeBtn) {
            await themeBtn.click();
            await mobilePage.waitForTimeout(200);
            const toggledTheme = await mobilePage.evaluate(() => document.documentElement.getAttribute('data-theme'));
            assert(toggledTheme !== initialTheme, `Theme toggled from ${initialTheme} to ${toggledTheme}`);
            // Toggle back
            await themeBtn.click();
            await mobilePage.waitForTimeout(200);
        }

        // Take a screenshot of the responsive mobile spreadsheet
        const screenshotPath = path.join(__dirname, 'excel_mobile_verified.png');
        await mobilePage.screenshot({ path: screenshotPath });
        console.log(`Captured mobile screenshot: ${screenshotPath}`);

        await mobileContext.close();

        // =====================================================================
        // PART 2: DESKTOP VIEWPORT SPREADSHEET EDITOR (1280 x 800)
        // =====================================================================
        console.log('\n--- PART 2: Testing Desktop Viewport (1280x800) ---');
        const desktopContext = await browser.newContext({
            viewport: { width: 1280, height: 800 }
        });

        await desktopContext.addInitScript(() => {
            try {
                window.__printCalled = false;
                window.print = () => { window.__printCalled = true; };
                const consent = {
                    version: '1.0',
                    noticeVersion: '2026.1',
                    timestamp: new Date().toISOString(),
                    categories: { essential: true, preferences: true, analytics: true, marketing: true }
                };
                localStorage.setItem('frank_cookie_consent_v1', JSON.stringify(consent));
            } catch (e) {}
        });

        const desktopPage = await desktopContext.newPage();
        await desktopPage.goto('http://127.0.0.1:8000/login.html');
        await desktopPage.fill('#loginUsername', testEmail);
        await desktopPage.fill('#loginPassword', testPassword);
        await desktopPage.click('#loginSubmitBtn', { force: true });
        await desktopPage.waitForURL('**/dashboard.html');

        await desktopPage.goto('http://127.0.0.1:8000/spreadsheet.html');
        await desktopPage.waitForSelector('.spreadsheet-table', { timeout: 10000 });

        // Verify desktop toolbar buttons
        const desktopEditBtn = await desktopPage.$('.tool-btn-edit');
        const desktopDownloadBtn = await desktopPage.$('.tool-btn-download');
        const desktopPrintBtn = await desktopPage.$('.tool-btn-print');

        assert(Boolean(desktopEditBtn), 'Desktop Edit button is visible and active');
        assert(Boolean(desktopDownloadBtn), 'Desktop Download button is visible and active');
        assert(Boolean(desktopPrintBtn), 'Desktop Print button is visible and active');

        // Test desktop double-click to edit
        const desktopCellB4 = desktopPage.locator('td[data-coord="B4"]');
        await desktopCellB4.dblclick();
        await desktopPage.waitForTimeout(200);
        const desktopInlineInput = await desktopPage.$('.cell-inline-input');
        assert(Boolean(desktopInlineInput), 'Desktop double click activates cell inline editing');
        if (desktopInlineInput) {
            await desktopInlineInput.press('Escape');
        }

        await desktopContext.close();

        // =====================================================================
        // PART 3: IN-CHAT / IN-DASHBOARD VIEWER MOBILE VERIFICATION
        // =====================================================================
        console.log('\n--- PART 3: Testing In-Chat Document Viewer on Mobile ---');
        const inChatContext = await browser.newContext({
            viewport: { width: 390, height: 844 },
            isMobile: true,
            hasTouch: true
        });

        await inChatContext.addInitScript(() => {
            try {
                const consent = {
                    version: '1.0',
                    noticeVersion: '2026.1',
                    timestamp: new Date().toISOString(),
                    categories: { essential: true, preferences: true, analytics: true, marketing: true }
                };
                localStorage.setItem('frank_cookie_consent_v1', JSON.stringify(consent));
            } catch (e) {}
        });

        const inChatPage = await inChatContext.newPage();
        await inChatPage.goto('http://127.0.0.1:8000/login.html');
        await inChatPage.fill('#loginUsername', testEmail);
        await inChatPage.fill('#loginPassword', testPassword);
        await inChatPage.click('#loginSubmitBtn', { force: true });
        await inChatPage.waitForURL('**/dashboard.html');

        // Check that viewer elements in dashboard.html are properly configured
        const topDownloadBtn = await inChatPage.$('#inChatDocDownloadBtn');
        const topPrintBtn = await inChatPage.$('#inChatDocPrintBtn');
        const editCellBtn = await inChatPage.$('#docEditCellBtn');
        const overflowEditBtn = await inChatPage.$('#docOverflowEditBtn');

        assert(Boolean(topDownloadBtn), 'In-chat doc viewer top download button exists');
        assert(Boolean(topPrintBtn), 'In-chat doc viewer top print button exists');
        assert(Boolean(editCellBtn), 'In-chat doc viewer formula bar edit button exists');
        assert(Boolean(overflowEditBtn), 'In-chat doc viewer overflow edit option exists');

        await inChatContext.close();

    } catch (err) {
        console.error('Unhandled error during E2E test:', err);
        failed++;
    } finally {
        await browser.close();
    }

    console.log(`\n=== E2E TEST SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
    if (failed > 0) {
        process.exit(1);
    }
}

runExcelMobileActionsTests();
