const { chromium } = require('playwright');
const path = require('path');
const { execSync } = require('child_process');

const BASE_URL = 'http://127.0.0.1:8000';

async function runMobileTests() {
    console.log('===============================================================');
    console.log('   FRANK THINK EXCEL — PART 1 MOBILE & TOUCH VERIFICATION      ');
    console.log('===============================================================\n');

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

    // iPhone 12/13/14 size viewport
    const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true
    });
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

        // 1. Mobile touch row selection
        console.log('\n--- Test 1: Mobile Row Header Tap & Selection ---');
        await page.tap('td.row-header[data-r="2"]');
        await page.waitForTimeout(100);

        let rowSelected = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            return se.selectionMode === 'row' && se.selectedRange.startR === 2;
        });
        assert('Row 3 selected on mobile tap', rowSelected);

        // 2. Mobile touch column selection
        console.log('\n--- Test 2: Mobile Column Header Tap & Selection ---');
        await page.tap('th.col-header[data-c="1"]');
        await page.waitForTimeout(100);

        let colSelected = await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            return se.selectionMode === 'col' && se.selectedRange.startC === 1;
        });
        assert('Column B selected on mobile tap', colSelected);

        // 3. Mobile Long-Press / Context Menu trigger on Cell
        console.log('\n--- Test 3: Mobile Touch Context Menu & Viewport Clamping ---');
        await page.evaluate(() => {
            const se = window.frankOfficeWorkspace.sheetsEngine;
            // Trigger long-press context menu at (300, 700) on 390x844 viewport
            se.openCellContextMenu({ clientX: 300, clientY: 700, preventDefault: () => {}, stopPropagation: () => {} }, 2, 2);
        });
        await page.waitForTimeout(200);

        let menuBounds = await page.evaluate(() => {
            const menu = document.getElementById('spreadsheetContextMenu');
            if (!menu) return null;
            const r = menu.getBoundingClientRect();
            return {
                visible: true,
                left: r.left,
                top: r.top,
                right: r.right,
                bottom: r.bottom,
                windowW: window.innerWidth,
                windowH: window.innerHeight,
                fitsInViewport: r.left >= 0 && r.right <= window.innerWidth && r.top >= 0 && r.bottom <= window.innerHeight
            };
        });
        assert('Context menu clamped within mobile viewport boundaries', menuBounds && menuBounds.fitsInViewport, JSON.stringify(menuBounds));

        // Close on tap outside
        await page.tap('#workspaceDocTitle');
        await page.waitForTimeout(100);
        let menuClosed = await page.$('#spreadsheetContextMenu') === null;
        assert('Context menu closes on tap outside on mobile', menuClosed);

        // 4. Test Scrollability
        console.log('\n--- Test 4: Mobile Scrollability ---');
        const scrollInfo = await page.evaluate(() => {
            const wrapper = document.getElementById('spreadsheetGridWrapper');
            return {
                scrollWidth: wrapper.scrollWidth,
                clientWidth: wrapper.clientWidth,
                scrollHeight: wrapper.scrollHeight,
                clientHeight: wrapper.clientHeight,
                canScrollX: wrapper.scrollWidth > wrapper.clientWidth,
                canScrollY: wrapper.scrollHeight > wrapper.clientHeight
            };
        });
        assert('Grid supports horizontal and vertical scrolling on mobile', scrollInfo.canScrollX && scrollInfo.canScrollY, JSON.stringify(scrollInfo));

    } catch (err) {
        console.error('Fatal mobile test error:', err);
        failedCount++;
    } finally {
        await browser.close();
    }

    console.log('\n===============================================================');
    console.log(`MOBILE VERIFICATION COMPLETE: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log('===============================================================\n');

    process.exit(failedCount === 0 ? 0 : 1);
}

runMobileTests();
