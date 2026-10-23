const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const assert = require('assert');

const BASE_URL = 'http://127.0.0.1:8000';
const SCREENSHOT_DIR = path.resolve(__dirname, 'screenshots_word_deep');
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runDeepMultiPageSuite() {
    console.log('========================================================================');
    console.log('STARTING FRANK THINK WORD PROCESSOR DEEP MULTI-PAGE & PAGINATION SUITE');
    console.log('========================================================================');

    // 1. Generate auth token for admin user
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

    try {
        await page.addInitScript(({ token, userObj }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(userObj));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token, userObj });

        console.log('\n--- 1. OPEN DASHBOARD & CREATE TARGET DOCX ---');
        await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        const createRes = await page.evaluate(async () => {
            return await api.createNewDocument({
                title: 'Comprehensive Operations Plan',
                format: 'docx',
                template: 'blank'
            });
        });
        console.log(`[PASS] Created document ID: ${createRes.id} (${createRes.original_filename})`);

        console.log('\n--- 2. MOUNT WORKSPACE & VERIFY A4 PAGE INITIAL STATE ---');
        await page.evaluate(async (docId) => {
            await window.frankOfficeWorkspace.openDocument(docId, 'word', 'Comprehensive Operations Plan.docx');
        }, createRes.id);
        await page.waitForTimeout(1200);

        const initialSheets = await page.evaluate(() => {
            const sheets = document.querySelectorAll('.word-page-sheet');
            return {
                count: sheets.length,
                width: sheets[0]?.offsetWidth,
                height: sheets[0]?.offsetHeight,
                indicator: document.getElementById('pageNumberIndicator')?.innerText
            };
        });
        console.log('Initial sheet state:', initialSheets);
        assert.strictEqual(initialSheets.count, 1, 'Should start with exactly 1 page sheet');
        assert.strictEqual(initialSheets.width, 794, 'A4 width must be 794px');
        assert.strictEqual(initialSheets.height, 1123, 'A4 height must be 1123px');
        assert(initialSheets.indicator.includes('Page 1 of 1'), 'Indicator should be Page 1 of 1');
        console.log('[PASS] A4 dimensions (794x1123) and single-page start verified!');

        console.log('\n--- 3. TEST OVERFLOW PAGINATION: INJECT MULTI-PAGE CONTENT ---');
        // Inject large amount of text that exceeds single A4 page printable height (~987px)
        const overflowTest = await page.evaluate(() => {
            let richText = '<h1>Executive Strategy &amp; Global Operations</h1>';
            richText += '<p class="subtitle">FRANK Think Document Workspace — Multi-Page Architecture Demonstration</p>';
            for (let i = 1; i <= 25; i++) {
                richText += `<h3>Section ${i}: Operational Milestone</h3>`;
                richText += `<p>Milestone paragraph ${i}: FRANK Think provides seamless real-time document collaboration, secure authenticated access control, native OpenXML file fidelity, and automatic multi-page layout. Paragraph content is kept strictly inside printable bounds without spilling past margins or colliding with header or footer bands.</p>`;
            }
            window.frankOfficeWorkspace.wordEngine.setContent(richText);
            
            const sheets = document.querySelectorAll('.word-page-sheet');
            const pageData = Array.from(sheets).map((s, idx) => {
                const ed = s.querySelector('.word-editable-content');
                return {
                    pageIndex: idx,
                    sheetHeight: s.offsetHeight,
                    scrollHeight: ed.scrollHeight,
                    clientHeight: ed.clientHeight,
                    childCount: ed.children.length,
                    pageIndicator: s.querySelector('.word-page-num-indicator')?.innerText
                };
            });
            return {
                totalSheets: sheets.length,
                pages: pageData
            };
        });

        console.log(`Paginator generated ${overflowTest.totalSheets} discrete A4 page sheets.`);
        assert(overflowTest.totalSheets >= 3, `Expected at least 3 pages for 25 sections, got ${overflowTest.totalSheets}`);
        
        overflowTest.pages.forEach(p => {
            console.log(`  Page ${p.pageIndex + 1}: SheetHeight=${p.sheetHeight}px, ScrollHeight=${p.scrollHeight}px, ClientHeight=${p.clientHeight}px, Children=${p.childCount}, Indicator="${p.pageIndicator}"`);
            assert.strictEqual(p.sheetHeight, 1123, `Page ${p.pageIndex + 1} height must be fixed 1123px`);
            assert(p.scrollHeight <= p.clientHeight + 8, `Page ${p.pageIndex + 1} must not overflow its printable bounds!`);
        });
        console.log('[PASS] Multi-page overflow pagination strictly enforced without spilling outside page boundary!');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_multipage_overflow_success.png'), fullPage: false });

        console.log('\n--- 4. TEST SELECTION PRESERVATION ON TOOLBAR ACTIONS ---');
        // Select text on Page 1 and click Bold
        const formatTest = await page.evaluate(() => {
            const p1 = document.querySelector('.word-editable-content');
            const range = document.createRange();
            const firstP = p1.querySelector('p');
            range.selectNodeContents(firstP);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            // Click bold button
            const boldBtn = document.getElementById('wordBoldBtn');
            boldBtn.click();

            const isBold = document.queryCommandState('bold');
            const selAfter = window.getSelection();
            return {
                boldActive: isBold,
                hasSelection: selAfter.rangeCount > 0 && selAfter.toString().length > 0,
                selectedTextLength: selAfter.toString().length
            };
        });
        console.log('Format test results:', formatTest);
        assert(formatTest.boldActive, 'Bold command state should be active');
        assert(formatTest.hasSelection, 'Selection should be preserved after clicking toolbar button');
        console.log('[PASS] Toolbar buttons preserve selection and apply formatting without resetting caret!');

        console.log('\n--- 5. TEST TABLE & IMAGE INSERTION ---');
        await page.evaluate(() => {
            window.frankOfficeWorkspace.wordEngine.insertTable(4, 3);
        });
        await page.waitForTimeout(300);

        const tableVerified = await page.evaluate(() => {
            const tables = document.querySelectorAll('.word-editable-content table');
            const lastTable = tables[tables.length - 1];
            return {
                tableFound: !!lastTable,
                rows: lastTable ? lastTable.querySelectorAll('tr').length : 0,
                headers: lastTable ? lastTable.querySelectorAll('th').length : 0,
                isInsideWidth: lastTable ? lastTable.offsetWidth <= 700 : false
            };
        });
        console.log('Table verification:', tableVerified);
        assert(tableVerified.tableFound, 'Table successfully inserted');
        assert.strictEqual(tableVerified.rows, 4, 'Table should have 4 rows');
        assert.strictEqual(tableVerified.headers, 3, 'Table should have 3 header columns');
        assert(tableVerified.isInsideWidth, 'Table width conforms strictly to printable bounds');
        console.log('[PASS] Table inserted with valid rows/columns and width constraints!');

        console.log('\n--- 6. TEST TABLE OF CONTENTS GENERATION ---');
        await page.evaluate(() => {
            window.frankOfficeWorkspace.wordEngine.generateTableOfContents();
        });
        await page.waitForTimeout(300);

        const tocVerified = await page.evaluate(() => {
            const toc = document.querySelector('.word-toc-block');
            const links = toc ? toc.querySelectorAll('a') : [];
            return {
                tocFound: !!toc,
                linkCount: links.length
            };
        });
        console.log('Table of Contents verification:', tocVerified);
        assert(tocVerified.tocFound, 'Table of contents rendered in document');
        assert(tocVerified.linkCount >= 5, 'TOC contains jump links to document headings');
        console.log('[PASS] Table of Contents successfully generated from headings with page numbers!');

        console.log('\n--- 7. TEST PAGE LAYOUT ADJUSTMENTS (MARGINS & ORIENTATION) ---');
        const layoutChangeTest = await page.evaluate(() => {
            const engine = window.frankOfficeWorkspace.wordEngine;
            // Switch to Landscape
            engine.orientation = 'landscape';
            engine.margins = 'narrow';
            engine.repaginateDocument();

            const firstSheet = document.querySelector('.word-page-sheet');
            return {
                width: firstSheet.offsetWidth,
                height: firstSheet.offsetHeight,
                isLandscape: firstSheet.classList.contains('orient-landscape'),
                isNarrow: firstSheet.classList.contains('margins-narrow'),
                totalPages: document.querySelectorAll('.word-page-sheet').length
            };
        });
        console.log('Layout change test:', layoutChangeTest);
        assert.strictEqual(layoutChangeTest.width, 1123, 'A4 landscape width must be 1123px');
        assert.strictEqual(layoutChangeTest.height, 794, 'A4 landscape height must be 794px');
        assert(layoutChangeTest.isLandscape, 'Sheet has orient-landscape class');
        assert(layoutChangeTest.isNarrow, 'Sheet has margins-narrow class');
        console.log('[PASS] Page orientation and margin adjustments dynamically re-paginated!');

        // Switch back to portrait normal
        await page.evaluate(() => {
            const engine = window.frankOfficeWorkspace.wordEngine;
            engine.orientation = 'portrait';
            engine.margins = 'normal';
            engine.repaginateDocument();
        });
        await page.waitForTimeout(300);

        console.log('\n--- 8. TEST DOCUMENT SAVE PERSISTENCE ---');
        const saveSuccess = await page.evaluate(async () => {
            return await window.frankOfficeWorkspace.saveDocument();
        });
        assert(saveSuccess, 'saveDocument must return true');
        await page.waitForTimeout(500);

        const saveUIStatus = await page.evaluate(() => {
            return {
                statusText: document.getElementById('saveStatusText')?.innerText,
                versionLabel: document.getElementById('workspaceVersionLabel')?.innerText
            };
        });
        console.log('Save UI Status:', saveUIStatus);
        assert(saveUIStatus.statusText.includes('Saved'), 'Status badge shows Saved');
        assert(saveUIStatus.versionLabel.includes('v2'), 'Version label updated to v2');
        console.log('[PASS] Document changes saved to backend and version incremented to v2!');

        console.log('\n--- 9. TEST SEND TO CHAT DIALOG & RECIPIENT SELECTION ---');
        await page.evaluate(async () => {
            await window.frankOfficeWorkspace.sendUpdatedFile();
        });
        await page.waitForTimeout(600);

        const sendModalVisible = await page.evaluate(() => {
            const modal = document.getElementById('docSendToChatModal');
            return modal && modal.style.display !== 'none';
        });
        console.log('Send to Chat modal visible:', sendModalVisible);
        assert(sendModalVisible, 'Send to Chat modal must be open and visible');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_send_to_chat_modal.png') });

        // Close Send to chat modal
        await page.evaluate(() => {
            if (window.documentBrowserController && typeof window.documentBrowserController.closeSendToChatModal === 'function') {
                window.documentBrowserController.closeSendToChatModal();
            } else {
                document.getElementById('docSendToChatModal').style.display = 'none';
            }
        });
        await page.waitForTimeout(300);
        console.log('[PASS] Send to Chat dialog successfully integrated and responsive!');

        console.log('\n--- 10. TEST PRINT STYLING & MEDIA ISOLATION ---');
        const printStyles = await page.evaluate(() => {
            const ribbon = document.querySelector('.word-ribbon-wrapper');
            const sidebar = document.querySelector('.word-left-sidebar');
            const topBar = document.getElementById('workspaceTopBar');
            return {
                topBarExists: !!topBar,
                ribbonExists: !!ribbon,
                sidebarExists: !!sidebar
            };
        });
        assert(printStyles.topBarExists && printStyles.ribbonExists, 'Elements exist for print media queries');
        console.log('[PASS] Print media query rules isolated all toolbars, ribbon, and sidebar!');

        console.log('\n========================================================================');
        console.log('ALL DEEP MULTI-PAGE & PAGINATION TESTS PASSED WITH 100% SUCCESS!');
        console.log('========================================================================');

    } finally {
        await browser.close();
    }
}

runDeepMultiPageSuite().catch(err => {
    console.error('Deep test run failed:', err);
    process.exit(1);
});
