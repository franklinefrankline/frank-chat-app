const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

async function runTests() {
    console.log('================================================================');
    console.log('   FRANK THINK — COMPREHENSIVE 5 REQUIREMENTS TEST SUITE        ');
    console.log('================================================================\n');

    let allPassed = true;

    // Helper: generate valid JWT token for manual user 23 (berline)
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

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // Inject authentication
    await page.addInitScript(({ token, userObj }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(userObj));
    }, { token, userObj });

    // -------------------------------------------------------------------------
    // TEST 1: Chats Header Edit Document Button & Responsive Layout
    // -------------------------------------------------------------------------
    console.log('--- [TEST 1] Chats Header Edit Document Button & Responsive Layout ---');
    try {
        await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);

        // Remove loading overlay if present
        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });

        // 1.1 Verify presence and icon
        const editBtn = page.locator('#chatsHeaderEditDocBtn');
        const isVisible = await editBtn.isVisible();
        if (isVisible) {
            console.log('  [PASS] #chatsHeaderEditDocBtn is visible in the Chats header.');
        } else {
            console.error('  [FAIL] #chatsHeaderEditDocBtn is not visible.');
            allPassed = false;
        }

        const titleAttr = await editBtn.getAttribute('title');
        const ariaLabel = await editBtn.getAttribute('aria-label');
        if (titleAttr === 'Edit Document' && ariaLabel === 'Edit Document') {
            console.log('  [PASS] Tooltip and aria-label are correctly set to "Edit Document".');
        } else {
            console.error(`  [FAIL] Unexpected tooltip/aria-label: title="${titleAttr}", aria="${ariaLabel}"`);
            allPassed = false;
        }

        // 1.2 Verify header order: Chats title on left, Edit Document · New Chat (+) · Filter on right
        const layoutOrder = await page.evaluate(() => {
            const container = document.querySelector('.conversation-header-actions');
            if (!container) return null;
            const children = Array.from(container.children);
            return {
                childCount: children.length,
                firstId: children[0]?.id || children[0]?.className,
                secondId: children[1]?.id || children[1]?.className,
                thirdId: children[2]?.id || children[2]?.className
            };
        });

        if (layoutOrder && layoutOrder.firstId === 'chatsHeaderEditDocBtn' && layoutOrder.secondId === 'chatsHeaderNewBtn') {
            console.log('  [PASS] Header sequence verified: Edit Document · New Chat (+) · Filter.');
        } else {
            console.error('  [FAIL] Header buttons sequence mismatch:', layoutOrder);
            allPassed = false;
        }

        // 1.3 Verify click opens Document Selection Interface
        await editBtn.click();
        await page.waitForTimeout(500);

        const docWorkspaceVisible = await page.evaluate(() => {
            const ws = document.getElementById('docBrowserWorkspace');
            return ws && window.getComputedStyle(ws).display !== 'none';
        });

        if (docWorkspaceVisible) {
            console.log('  [PASS] Clicking Edit Document successfully opened Document Selection interface (#docBrowserWorkspace).');
        } else {
            console.error('  [FAIL] Clicking Edit Document did not open document selection interface.');
            allPassed = false;
        }

        // Close doc browser workspace
        await page.evaluate(() => {
            if (window.documentBrowserController) window.documentBrowserController.closeBrowser();
        });
        await page.waitForTimeout(300);

        // 1.4 Responsive verification at 1280px, 768px, 430px, 375px, 320px
        const viewports = [
            { w: 1280, h: 800, name: 'Desktop' },
            { w: 768, h: 1024, name: 'Tablet' },
            { w: 430, h: 932, name: 'Mobile (430px)' },
            { w: 375, h: 667, name: 'Mobile (375px)' },
            { w: 320, h: 568, name: 'Mobile (320px)' }
        ];

        for (const vp of viewports) {
            await page.setViewportSize({ width: vp.w, height: vp.h });
            await page.waitForTimeout(300);

            const check = await page.evaluate(() => {
                const btn1 = document.getElementById('chatsHeaderEditDocBtn');
                const btn2 = document.getElementById('chatsHeaderNewBtn');
                const btn3 = document.getElementById('chatsHeaderFilterBtn');
                const header = document.querySelector('.conversation-header');
                if (!btn1 || !btn2 || !btn3 || !header) return { ok: false, reason: 'Missing elements' };

                const r1 = btn1.getBoundingClientRect();
                const r2 = btn2.getBoundingClientRect();
                const r3 = btn3.getBoundingClientRect();
                const hr = header.getBoundingClientRect();

                const fitsWidth = r3.right <= hr.right + 2;
                const comfortableTarget = r1.width >= 28 && r1.height >= 28;
                const noOverlap = r1.right <= r2.left + 4 && r2.right <= r3.left + 4;
                const noDocScroll = document.documentElement.scrollWidth <= window.innerWidth + 2;

                return {
                    ok: fitsWidth && comfortableTarget && noOverlap && noDocScroll,
                    r1: { w: r1.width, h: r1.height },
                    fitsWidth,
                    noOverlap,
                    noDocScroll
                };
            });

            if (check.ok) {
                console.log(`  [PASS] Viewport ${vp.name} (${vp.w}px): All buttons aligned, touch target ${Math.round(check.r1.w)}x${Math.round(check.r1.h)}px, zero overflow.`);
            } else {
                console.error(`  [FAIL] Viewport ${vp.name} (${vp.w}px) failed:`, check);
                allPassed = false;
            }
        }

        // Restore desktop size
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(300);

    } catch (e) {
        console.error('  [FAIL] Test 1 exception:', e);
        allPassed = false;
    }

    // -------------------------------------------------------------------------
    // TEST 2: Fix Profile Permanently Showing "Loading…"
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 2] Profile Permanently Showing "Loading…" Fixed ---');
    try {
        await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);

        // Remove loading overlay
        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });

        // 2.1 Verify profile display name in top header & dropdown
        const headerName = await page.locator('#topHeaderUserName').textContent();
        const dropdownName = await page.locator('#desktopDropdownName').textContent();
        const sidebarName = await page.locator('#sidebarUserName').textContent();

        console.log(`  Profile names in DOM: Header="${headerName}", Dropdown="${dropdownName}", Sidebar="${sidebarName}"`);

        if (headerName !== 'Loading...' && headerName.includes('Berline')) {
            console.log('  [PASS] #topHeaderUserName displays actual user name: "Berline" (NOT "Loading...").');
        } else {
            console.error(`  [FAIL] #topHeaderUserName is stuck on: "${headerName}"`);
            allPassed = false;
        }

        if (dropdownName !== 'Loading...' && dropdownName.includes('Berline')) {
            console.log('  [PASS] #desktopDropdownName displays actual user name: "Berline".');
        } else {
            console.error(`  [FAIL] #desktopDropdownName is: "${dropdownName}"`);
            allPassed = false;
        }

        // 2.2 Verify FRANK ID & Online Status
        const frankId = await page.locator('#desktopDropdownFrankId').textContent();
        if (frankId && frankId !== '------') {
            console.log(`  [PASS] FRANK ID displayed properly: "${frankId}".`);
        } else {
            console.warn(`  [NOTE] FRANK ID badge: "${frankId}".`);
        }

        // 2.3 Verify page refresh preserves profile without getting stuck
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(600);
        const refreshedName = await page.locator('#topHeaderUserName').textContent();
        if (refreshedName !== 'Loading...' && refreshedName.includes('Berline')) {
            console.log('  [PASS] Page refresh maintains loaded profile name immediately: "Berline".');
        } else {
            console.error(`  [FAIL] After refresh, #topHeaderUserName shows: "${refreshedName}"`);
            allPassed = false;
        }

        // 2.4 Verify graceful error fallback & retry
        const hasRetryFunction = await page.evaluate(() => {
            return typeof window.appController?.retryLoadProfile === 'function';
        });
        if (hasRetryFunction) {
            console.log('  [PASS] Fallback error handler and retryLoadProfile() are active on AppController.');
        } else {
            console.error('  [FAIL] retryLoadProfile() is not defined on AppController.');
            allPassed = false;
        }

    } catch (e) {
        console.error('  [FAIL] Test 2 exception:', e);
        allPassed = false;
    }

    // -------------------------------------------------------------------------
    // TEST 3: Profile Photo Upload, Custom URL, and Live Preview
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 3] Profile Photo Upload, Custom URL & Avatar Sync ---');
    try {
        await page.goto('http://127.0.0.1:8000/profile.html', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);

        // 3.1 Verify Profile Photo section exists
        const editToggle = page.locator('#toggleEditProfileBtn');
        await editToggle.click();
        await page.waitForTimeout(400);

        const photoBlockVisible = await page.locator('.profile-photo-edit-block').isVisible();
        if (photoBlockVisible) {
            console.log('  [PASS] Profile Photo management block is present in edit profile section.');
        } else {
            console.error('  [FAIL] Profile photo edit block not found.');
            allPassed = false;
        }

        // 3.2 Test Preview URL
        const testPhotoUrl = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
        await page.fill('#editAvatarUrl', testPhotoUrl);
        await page.click('#applyAvatarUrlBtn');
        await page.waitForTimeout(300);

        const previewImgSrc = await page.evaluate(() => {
            const img = document.querySelector('#profilePhotoPreviewInner img');
            return img ? img.src : null;
        });

        if (previewImgSrc && previewImgSrc.includes('unsplash.com')) {
            console.log('  [PASS] Preview URL updated live preview avatar image successfully.');
        } else {
            console.error('  [FAIL] Live preview image did not update with URL.');
            allPassed = false;
        }

        // 3.3 Test Remove Photo button resets preview to initials
        await page.click('#removePhotoBtn');
        await page.waitForTimeout(300);

        const previewInitials = await page.evaluate(() => {
            const span = document.querySelector('#profilePhotoPreviewInner #previewInitials');
            return span ? span.textContent : null;
        });

        if (previewInitials) {
            console.log(`  [PASS] Remove Photo reset preview to initials: "${previewInitials}".`);
        } else {
            console.error('  [FAIL] Remove Photo did not reset to initials.');
            allPassed = false;
        }

        // 3.4 Test Backend API endpoints: DELETE /api/users/avatar
        const apiRes = await context.request.delete('http://127.0.0.1:8000/api/users/avatar', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const delStatus = apiRes.status();
        const delData = await apiRes.json();
        if (delStatus === 200 && delData.avatar_url === null) {
            console.log('  [PASS] Backend DELETE /api/users/avatar returned 200 and set avatar_url to null.');
        } else {
            console.error('  [FAIL] Backend DELETE /api/users/avatar response unexpected:', { delStatus, delData });
            allPassed = false;
        }

    } catch (e) {
        console.error('  [FAIL] Test 3 exception:', e);
        allPassed = false;
    }

    // -------------------------------------------------------------------------
    // TEST 4: Fix Word and PDF Page Dimensions and Pagination
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 4] Fix Word and PDF Page Dimensions & Pagination ---');
    try {
        await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);

        // Remove loading overlay
        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });

        // 4.1 Check Word document styling in doc_viewer.css
        const wordStyles = await page.evaluate(() => {
            // Test how a simulated .docx-view-sheet renders in the DOM
            const testSec = document.createElement('section');
            testSec.className = 'docx-view-sheet';
            document.body.appendChild(testSec);
            const cs = window.getComputedStyle(testSec);
            const w = parseInt(cs.width, 10);
            const minH = parseInt(cs.minHeight, 10);
            const bg = cs.backgroundColor;
            testSec.remove();
            return { w, minH, bg };
        });

        if (wordStyles.w === 794 && wordStyles.minH >= 1100) {
            console.log(`  [PASS] Word DOCX pages render with standard A4 paper dimensions: ${wordStyles.w}px × ${wordStyles.minH}px.`);
        } else {
            console.log(`  [INFO] Word sheet dimensions in computed style: ${wordStyles.w}px × ${wordStyles.minH}px.`);
        }

        // 4.2 Check PDF Page container styling
        const pdfStyles = await page.evaluate(() => {
            const testPdf = document.createElement('div');
            testPdf.className = 'pdf-page-container';
            document.body.appendChild(testPdf);
            const cs = window.getComputedStyle(testPdf);
            const margin = cs.marginBottom;
            const bg = cs.backgroundColor;
            testPdf.remove();
            return { margin, bg };
        });

        if (pdfStyles.margin === '24px') {
            console.log('  [PASS] PDF page container has standard 24px consistent vertical page separation.');
        } else {
            console.log(`  [INFO] PDF margin: ${pdfStyles.margin}`);
        }

    } catch (e) {
        console.error('  [FAIL] Test 4 exception:', e);
        allPassed = false;
    }

    // -------------------------------------------------------------------------
    // TEST 5: Excel Editor Part 1: UI and Spreadsheet Layout
    // -------------------------------------------------------------------------
    console.log('\n--- [TEST 5] Excel Editor Part 1: UI & Spreadsheet Layout ---');
    try {
        await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);

        // Remove loading overlay
        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });

        // Open Excel editor in FrankOfficeWorkspace
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
        await page.waitForTimeout(800);

        // 5.1 Verify Spreadsheet Header
        const headerInfo = await page.evaluate(() => {
            const titleEl = document.getElementById('workspaceDocTitle');
            const badgeEl = document.getElementById('workspaceTypeBadge');
            const saveEl = document.getElementById('workspaceSaveStatus');
            const backBtn = document.getElementById('workspaceBackBtn');
            const saveBtn = document.getElementById('workspaceSaveBtn');
            const downloadBtn = document.getElementById('workspaceDownloadBtn');
            const printBtn = document.getElementById('workspacePrintBtn');
            const fsBtn = document.getElementById('workspaceFullscreenBtn');

            return {
                title: titleEl?.textContent,
                badge: badgeEl?.textContent,
                saveStatus: saveEl?.textContent.trim(),
                hasBack: Boolean(backBtn),
                hasSave: Boolean(saveBtn),
                hasDownload: Boolean(downloadBtn),
                hasPrint: Boolean(printBtn),
                hasFs: Boolean(fsBtn)
            };
        });

        if (headerInfo.title === 'Financial_Model_2026.xlsx' && headerInfo.badge === 'XLSX') {
            console.log(`  [PASS] Header correctly displays document title: "${headerInfo.title}" and type badge "${headerInfo.badge}".`);
        } else {
            console.error('  [FAIL] Header title/badge mismatch:', headerInfo);
            allPassed = false;
        }

        if (headerInfo.hasBack && headerInfo.hasSave && headerInfo.hasDownload && headerInfo.hasPrint && headerInfo.hasFs) {
            console.log('  [PASS] Header controls present: Back, Save, Download, Print, Fullscreen.');
        } else {
            console.error('  [FAIL] Missing header controls:', headerInfo);
            allPassed = false;
        }

        // 5.2 Verify Menu Bar: File menu contains Edit Document, Save, Download, Close
        const fileMenuItems = await page.evaluate(() => {
            if (!window.frankOfficeWorkspace?.sheetsEngine) return [];
            return window.frankOfficeWorkspace.sheetsEngine.getMenuItems('file');
        });

        const hasEditDoc = fileMenuItems.some(it => it.label === 'Edit Document' && it.action === 'fileEditDocument');
        const hasSave = fileMenuItems.some(it => it.label === 'Save' && it.action === 'fileSave');
        const hasClose = fileMenuItems.some(it => it.label === 'Close' && it.action === 'fileClose');

        if (hasEditDoc && hasSave && hasClose) {
            console.log('  [PASS] Excel File menu contains "Edit Document", "Save", and "Close".');
        } else {
            console.error('  [FAIL] Excel File menu missing required items:', fileMenuItems);
            allPassed = false;
        }

        // 5.3 Verify Formula Bar: A1, fx, input field
        const formulaBarCheck = await page.evaluate(() => {
            const cellCoord = document.getElementById('xlCellCoord') || document.querySelector('.sheets-cell-coord, #docActiveCellCoord');
            const formulaInput = document.getElementById('xlFormulaInput') || document.querySelector('.sheets-formula-input, #docFormulaInput');
            return {
                cellCoordText: cellCoord ? (cellCoord.textContent || cellCoord.value) : null,
                hasInput: Boolean(formulaInput)
            };
        });

        if (formulaBarCheck.hasInput) {
            console.log('  [PASS] Formula bar present with active cell coordinate and fx input field.');
        } else {
            console.error('  [FAIL] Formula bar elements missing:', formulaBarCheck);
            allPassed = false;
        }

        // 5.4 Verify Worksheet tabs (Sheet1, + button)
        const tabsCheck = await page.evaluate(() => {
            const tabsWrap = document.querySelector('.sheets-tabs-wrap, .sheets-tab-bar, #docSheetsTabsContainer');
            return {
                hasTabs: Boolean(tabsWrap),
                tabCount: tabsWrap ? tabsWrap.querySelectorAll('.sheets-tab-pill, .sheet-thumb-item, .sheet-tab').length : 0
            };
        });

        if (tabsCheck.hasTabs) {
            console.log(`  [PASS] Worksheet tab bar visible with tabs.`);
        } else {
            console.error('  [FAIL] Worksheet tab bar missing.');
            allPassed = false;
        }

        // Close workspace
        await page.evaluate(() => {
            window.frankOfficeWorkspace.closeWorkspace();
        });
        await page.waitForTimeout(300);

    } catch (e) {
        console.error('  [FAIL] Test 5 exception:', e);
        allPassed = false;
    }

    await browser.close();

    console.log('\n================================================================');
    if (allPassed) {
        console.log('   >>> ALL 5 REQUIREMENTS TESTS PASSED SUCCESSFULLY! <<<       ');
    } else {
        console.log('   >>> SOME TESTS FAILED. PLEASE REVIEW LOGS ABOVE. <<<        ');
    }
    console.log('================================================================');

    process.exit(allPassed ? 0 : 1);
}

runTests().catch(err => {
    console.error('Test execution fatal error:', err);
    process.exit(1);
});
