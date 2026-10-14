const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

async function runVerification() {
    console.log('====================================================');
    console.log('   FRANK THINK — 4 REQUIREMENTS COMPREHENSIVE SUITE   ');
    console.log('====================================================\n');

    let allPassed = true;

    // -------------------------------------------------------------------------
    // REQUIREMENT 1: Remove Demo Accounts Only & Preserve Manual Accounts
    // -------------------------------------------------------------------------
    console.log('--- [REQUIREMENT 1] Verify Demo Accounts Removal & Manual Preservation ---');
    try {
        const pyCheck = execSync('python scripts/verify_accounts_state.py').toString().trim();
        const data = JSON.parse(pyCheck);

        console.log(`Database State: Demos: ${data.demos}, Manuals: ${data.manuals}, Messages: ${data.manual_messages}`);
        if (data.demos === 0) {
            console.log('  [PASS] Confirmed demo accounts (Alex, Sarah, David) are 0 in the database.');
        } else {
            console.error(`  [FAIL] Found ${data.demos} demo accounts in the database.`);
            allPassed = false;
        }

        if (data.manuals === 6) {
            console.log('  [PASS] All 6 manual accounts are completely preserved:');
            data.manual_accounts.forEach(m => console.log(`         - ID ${m.id}: ${m.username} (${m.email})`));
        } else {
            console.error(`  [FAIL] Expected 6 manual accounts, found ${data.manuals}.`);
            allPassed = false;
        }

        if (data.manual_messages > 0) {
            console.log(`  [PASS] Manual user chat messages & attachments preserved (${data.manual_messages} messages).`);
        } else {
            console.error('  [FAIL] Manual user messages appear to be missing.');
            allPassed = false;
        }
    } catch (e) {
        console.error('  [FAIL] Database check failed:', e.message);
        allPassed = false;
    }

    // Launch Browser for UI Tests (Req 2, 3, 4)
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    // Authenticate as manual user (Berline, user 23)
    const token = execSync('python -c "import sys; sys.path.append(\'backend\'); from security import create_access_token; print(create_access_token({\'sub\': \'berline\', \'id\': 23, \'email\': \'berline@gmail.com\'}))"')
        .toString().trim();

    const userObj = {
        id: 23,
        username: 'berline',
        email: 'berline@gmail.com',
        full_name: 'Berline',
        frank_id: 'BERLINE1'
    };

    await page.addInitScript(({ token, userObj }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(userObj));
    }, { token, userObj });

    try {
        await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        // Remove loading overlay if present
        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });

        // ---------------------------------------------------------------------
        // REQUIREMENT 4: Show Present Button ONLY for PowerPoint
        // ---------------------------------------------------------------------
        console.log('\n--- [REQUIREMENT 4] Show Present Button Only for PowerPoint ---');

        // Test Word (.docx)
        await page.evaluate(() => {
            window.inChatDocViewer.open(null, 'docx', 'Quarterly_Report.docx', '', {
                mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                file_size: 15420
            });
        });
        await page.waitForTimeout(500);
        const wordPresentBtnHidden = await page.evaluate(() => {
            const btn = document.getElementById('docPresentBtn');
            const style = window.getComputedStyle(btn);
            return style.display === 'none' || style.visibility === 'hidden';
        });
        if (wordPresentBtnHidden) {
            console.log('  [PASS] Word (.docx): Present button is HIDDEN.');
        } else {
            console.error('  [FAIL] Word (.docx): Present button is VISIBLE.');
            allPassed = false;
        }

        // Test Excel (.xlsx)
        await page.evaluate(() => {
            window.inChatDocViewer.open(null, 'xlsx', 'Financial_Model.xlsx', '', {
                mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                file_size: 32000
            });
        });
        await page.waitForTimeout(500);
        const excelPresentBtnHidden = await page.evaluate(() => {
            const btn = document.getElementById('docPresentBtn');
            const style = window.getComputedStyle(btn);
            return style.display === 'none' || style.visibility === 'hidden';
        });
        if (excelPresentBtnHidden) {
            console.log('  [PASS] Excel (.xlsx): Present button is HIDDEN.');
        } else {
            console.error('  [FAIL] Excel (.xlsx): Present button is VISIBLE.');
            allPassed = false;
        }

        // Test PDF (.pdf)
        await page.evaluate(() => {
            window.inChatDocViewer.open(null, 'pdf', 'Product_Specs.pdf', '', {
                mime_type: 'application/pdf',
                file_size: 98000
            });
        });
        await page.waitForTimeout(500);
        const pdfPresentBtnHidden = await page.evaluate(() => {
            const btn = document.getElementById('docPresentBtn');
            const style = window.getComputedStyle(btn);
            return style.display === 'none' || style.visibility === 'hidden';
        });
        if (pdfPresentBtnHidden) {
            console.log('  [PASS] PDF (.pdf): Present button is HIDDEN.');
        } else {
            console.error('  [FAIL] PDF (.pdf): Present button is VISIBLE.');
            allPassed = false;
        }

        // Test PowerPoint (.pptx)
        const pptxBuffer = fs.readFileSync('tests/fixtures/multi_slide_presentation.pptx');
        const pptxBase64 = pptxBuffer.toString('base64');
        await page.evaluate(async (b64) => {
            const byteCharacters = atob(b64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
            const blobUrl = URL.createObjectURL(blob);

            await window.inChatDocViewer.open(null, 'pptx', 'multi_slide_presentation.pptx', blobUrl, {
                mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            });
        }, pptxBase64);
        await page.waitForTimeout(1000);

        const pptxPresentBtnVisible = await page.evaluate(() => {
            const btn = document.getElementById('docPresentBtn');
            const style = window.getComputedStyle(btn);
            return style.display !== 'none' && style.visibility !== 'hidden';
        });
        if (pptxPresentBtnVisible) {
            console.log('  [PASS] PowerPoint (.pptx): Present button is VISIBLE.');
        } else {
            console.error('  [FAIL] PowerPoint (.pptx): Present button is HIDDEN.');
            allPassed = false;
        }

        // Test dynamic switch back to PDF without refresh
        await page.evaluate(() => {
            window.inChatDocViewer.open(null, 'pdf', 'Switch_Back.pdf', '', { mime_type: 'application/pdf' });
        });
        await page.waitForTimeout(500);
        const switchBackPdfHidden = await page.evaluate(() => {
            const btn = document.getElementById('docPresentBtn');
            return window.getComputedStyle(btn).display === 'none';
        });
        if (switchBackPdfHidden) {
            console.log('  [PASS] Dynamic switch to PDF: Present button immediately disappears.');
        } else {
            console.error('  [FAIL] Dynamic switch to PDF: Present button remained visible.');
            allPassed = false;
        }

        // ---------------------------------------------------------------------
        // REQUIREMENT 2: PowerPoint Full-Page Layout & Fixed Bottom Toolbar
        // ---------------------------------------------------------------------
        console.log('\n--- [REQUIREMENT 2] PowerPoint Full-Page Layout & Fixed Solid Bottom Toolbar ---');

        // Re-open PPTX
        await page.evaluate(async (b64) => {
            const byteCharacters = atob(b64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
            const blobUrl = URL.createObjectURL(blob);

            await window.inChatDocViewer.open(null, 'pptx', 'multi_slide_presentation.pptx', blobUrl);
        }, pptxBase64);
        await page.waitForTimeout(1000);

        // Click Present button to enter presentation mode
        await page.click('#docPresentBtn');
        await page.waitForTimeout(600);

        // Check Overlay and Toolbar State
        const slideshowInfo = await page.evaluate(() => {
            const overlay = document.getElementById('docSlideshowOverlay');
            const stage = document.getElementById('docSlideshowStage');
            const toolbar = document.getElementById('docSlideshowHud');
            const counter = document.getElementById('docSlideshowCounter');

            const oRect = overlay.getBoundingClientRect();
            const sRect = stage.getBoundingClientRect();
            const tRect = toolbar.getBoundingClientRect();
            const tStyle = window.getComputedStyle(toolbar);

            return {
                overlayActive: overlay.classList.contains('is-active'),
                overlayDisplay: window.getComputedStyle(overlay).display,
                toolbarBg: tStyle.backgroundColor,
                toolbarOpacity: tStyle.opacity,
                toolbarPosition: tStyle.position,
                toolbarBottom: tRect.bottom,
                toolbarTop: tRect.top,
                toolbarHeight: tRect.height,
                stageTop: sRect.top,
                stageBottom: sRect.bottom,
                stageWidth: sRect.width,
                stageHeight: sRect.height,
                viewportWidth: window.innerWidth,
                viewportHeight: window.innerHeight,
                counterText: counter ? counter.textContent : '',
                stageOverlapsToolbar: sRect.bottom > tRect.top
            };
        });

        console.log('Slideshow Layout Info:');
        console.log(`  Toolbar Background: ${slideshowInfo.toolbarBg}, Opacity: ${slideshowInfo.toolbarOpacity}`);
        console.log(`  Stage: ${Math.round(slideshowInfo.stageWidth)}x${Math.round(slideshowInfo.stageHeight)}, Bottom: ${Math.round(slideshowInfo.stageBottom)}px`);
        console.log(`  Toolbar: Height: ${Math.round(slideshowInfo.toolbarHeight)}px, Top: ${Math.round(slideshowInfo.toolbarTop)}px`);
        console.log(`  Overlap: ${slideshowInfo.stageOverlapsToolbar}`);

        if (slideshowInfo.overlayActive && slideshowInfo.overlayDisplay === 'flex') {
            console.log('  [PASS] Slideshow presentation overlay opened successfully.');
        } else {
            console.error('  [FAIL] Slideshow presentation overlay not active.');
            allPassed = false;
        }

        // Solid, opaque dark background check
        if (slideshowInfo.toolbarOpacity === '1' && (slideshowInfo.toolbarBg.includes('15, 23, 42') || slideshowInfo.toolbarBg.includes('0F172A') || slideshowInfo.toolbarBg.includes('rgb(15, 23, 42)'))) {
            console.log('  [PASS] Bottom toolbar has solid, opaque dark background (#0F172A).');
        } else {
            console.error(`  [FAIL] Bottom toolbar background is not solid #0F172A: bg=${slideshowInfo.toolbarBg}, opacity=${slideshowInfo.toolbarOpacity}`);
            allPassed = false;
        }

        // Check NO overlap: Slide bottom <= Toolbar top
        if (!slideshowInfo.stageOverlapsToolbar) {
            console.log('  [PASS] Slide stage sits strictly above toolbar (NO overlap, bottom portion never covered).');
        } else {
            console.error('  [FAIL] Slide stage overlaps bottom toolbar!');
            allPassed = false;
        }

        // Check All 7 Toolbar Controls
        const controls = await page.evaluate(() => {
            return {
                startBtn: Boolean(document.getElementById('docSlideshowStartBtn')),
                prevBtn: Boolean(document.getElementById('docSlideshowPrevBtn')),
                counter: Boolean(document.getElementById('docSlideshowCounter')),
                nextBtn: Boolean(document.getElementById('docSlideshowNextBtn')),
                playBtn: Boolean(document.getElementById('docSlideshowPlayBtn')),
                fsBtn: Boolean(document.getElementById('docSlideshowFsBtn')),
                exitBtn: Boolean(document.getElementById('docSlideshowExitBtn'))
            };
        });

        const allControlsPresent = Object.values(controls).every(Boolean);
        if (allControlsPresent) {
            console.log('  [PASS] All 7 dedicated toolbar controls present and accessible.');
        } else {
            console.error('  [FAIL] Missing toolbar controls:', controls);
            allPassed = false;
        }

        // Test Navigation (Next slide button)
        await page.click('#docSlideshowNextBtn');
        await page.waitForTimeout(400);
        const counterAfterNext = await page.textContent('#docSlideshowCounter');
        console.log(`  Counter after Next Slide: ${counterAfterNext}`);
        if (counterAfterNext.includes('2')) {
            console.log('  [PASS] Next slide navigation and counter work correctly.');
        } else {
            console.error('  [FAIL] Counter did not advance to slide 2.');
            allPassed = false;
        }

        // Test Previous slide button
        await page.click('#docSlideshowPrevBtn');
        await page.waitForTimeout(400);
        const counterAfterPrev = await page.textContent('#docSlideshowCounter');
        console.log(`  Counter after Prev Slide: ${counterAfterPrev}`);
        if (counterAfterPrev.includes('1 /')) {
            console.log('  [PASS] Previous slide navigation works correctly.');
        } else {
            console.error('  [FAIL] Counter did not return to slide 1.');
            allPassed = false;
        }

        // Test Mobile Responsiveness (Portrait 390x844)
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(500);
        const mobilePortraitLayout = await page.evaluate(() => {
            const stage = document.getElementById('docSlideshowStage');
            const toolbar = document.getElementById('docSlideshowHud');
            const sRect = stage.getBoundingClientRect();
            const tRect = toolbar.getBoundingClientRect();
            return {
                stageWidth: sRect.width,
                stageHeight: sRect.height,
                stageBottom: sRect.bottom,
                toolbarTop: tRect.top,
                overlaps: sRect.bottom > tRect.top,
                horizontalOverflow: sRect.width > window.innerWidth
            };
        });
        if (!mobilePortraitLayout.overlaps && !mobilePortraitLayout.horizontalOverflow) {
            console.log(`  [PASS] Mobile Portrait (390x844): Proportional scaling (${Math.round(mobilePortraitLayout.stageWidth)}x${Math.round(mobilePortraitLayout.stageHeight)}), zero overlap, zero overflow.`);
        } else {
            console.error('  [FAIL] Mobile Portrait layout issue:', mobilePortraitLayout);
            allPassed = false;
        }

        // Test Mobile Landscape (844x390)
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForTimeout(500);
        const mobileLandscapeLayout = await page.evaluate(() => {
            const stage = document.getElementById('docSlideshowStage');
            const toolbar = document.getElementById('docSlideshowHud');
            const sRect = stage.getBoundingClientRect();
            const tRect = toolbar.getBoundingClientRect();
            return {
                stageWidth: sRect.width,
                stageHeight: sRect.height,
                stageBottom: sRect.bottom,
                toolbarTop: tRect.top,
                overlaps: sRect.bottom > tRect.top
            };
        });
        if (!mobileLandscapeLayout.overlaps) {
            console.log(`  [PASS] Mobile Landscape (844x390): Efficient screen usage (${Math.round(mobileLandscapeLayout.stageWidth)}x${Math.round(mobileLandscapeLayout.stageHeight)}), zero overlap.`);
        } else {
            console.error('  [FAIL] Mobile Landscape layout issue:', mobileLandscapeLayout);
            allPassed = false;
        }

        // Restore Desktop viewport and test Exit presentation
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(400);
        await page.click('#docSlideshowExitBtn');
        await page.waitForTimeout(500);
        const isExited = await page.evaluate(() => {
            const overlay = document.getElementById('docSlideshowOverlay');
            return window.getComputedStyle(overlay).display === 'none';
        });
        if (isExited) {
            console.log('  [PASS] Exit presentation button closes overlay and restores viewer.');
        } else {
            console.error('  [FAIL] Overlay still visible after exit.');
            allPassed = false;
        }

        // ---------------------------------------------------------------------
        // REQUIREMENT 3: Word Viewer with Page Thumbnails
        // ---------------------------------------------------------------------
        console.log('\n--- [REQUIREMENT 3] Word Viewer with Page Thumbnails ---');

        const docxBuffer = fs.readFileSync('tests/fixtures/rich_word_document.docx');
        const docxBase64 = docxBuffer.toString('base64');
        await page.evaluate(async (b64) => {
            const byteCharacters = atob(b64);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            const blobUrl = URL.createObjectURL(blob);

            await window.inChatDocViewer.open(null, 'docx', 'rich_word_document.docx', blobUrl);
        }, docxBase64);
        await page.waitForTimeout(1500);

        const wordInfo = await page.evaluate(() => {
            const titleEl = document.getElementById('docThumbnailsTitle');
            const thumbs = Array.from(document.querySelectorAll('#docThumbnailsList .thumb-card'));
            const activeThumb = document.querySelector('#docThumbnailsList .thumb-card.active');
            const activeThumbBorder = activeThumb ? window.getComputedStyle(activeThumb).borderColor : '';

            return {
                titleText: titleEl ? titleEl.textContent.trim() : '',
                thumbnailCount: thumbs.length,
                hasActiveThumb: Boolean(activeThumb),
                activeThumbBorder: activeThumbBorder,
                hasPreviewContainers: document.querySelectorAll('.docx-page-thumb-preview').length,
                hasPageNumbers: Array.from(document.querySelectorAll('.thumb-card-num')).map(el => el.textContent.trim())
            };
        });

        console.log('Word Viewer State:');
        console.log(`  Sidebar Title: "${wordInfo.titleText}"`);
        console.log(`  Thumbnail Count: ${wordInfo.thumbnailCount}`);
        console.log(`  Active Thumb Border Color: ${wordInfo.activeThumbBorder}`);
        console.log(`  Page Number Badges: ${wordInfo.hasPageNumbers.join(', ')}`);

        if (wordInfo.titleText === 'PAGES') {
            console.log('  [PASS] Dedicated vertical sidebar titled "PAGES".');
        } else {
            console.error(`  [FAIL] Sidebar title is "${wordInfo.titleText}", expected "PAGES".`);
            allPassed = false;
        }

        if (wordInfo.thumbnailCount > 0 && wordInfo.hasPreviewContainers > 0) {
            console.log(`  [PASS] Miniature preview cards rendered for Word pages (${wordInfo.thumbnailCount} thumbnails).`);
        } else {
            console.error('  [FAIL] Word thumbnails missing or preview containers not found.');
            allPassed = false;
        }

        // Clear blue border check: #2563EB = rgb(37, 99, 235)
        if (wordInfo.activeThumbBorder.includes('37, 99, 235') || wordInfo.activeThumbBorder.includes('2563EB')) {
            console.log('  [PASS] Currently selected page highlighted with clear blue border (#2563EB).');
        } else {
            console.error(`  [FAIL] Active thumbnail border is not blue: ${wordInfo.activeThumbBorder}`);
            allPassed = false;
        }

        // Test thumbnail click navigation
        if (wordInfo.thumbnailCount > 1) {
            await page.click('#docThumbnailsList .thumb-card:nth-child(2)');
            await page.waitForTimeout(500);
            const secondPageActive = await page.evaluate(() => {
                const card = document.querySelector('#docThumbnailsList .thumb-card:nth-child(2)');
                return card.classList.contains('active');
            });
            if (secondPageActive) {
                console.log('  [PASS] Thumbnail click navigation successfully switched active page.');
            } else {
                console.error('  [FAIL] Second thumbnail did not become active on click.');
                allPassed = false;
            }
        }

        // Test sidebar collapse/expand button
        const toggleBtnExists = await page.evaluate(() => Boolean(document.getElementById('docToggleThumbsBtn')));
        if (toggleBtnExists) {
            await page.click('#docToggleThumbsBtn');
            await page.waitForTimeout(300);
            const isCollapsed = await page.evaluate(() => {
                const panel = document.getElementById('docThumbnailsPanel');
                return panel.classList.contains('collapsed');
            });
            await page.click('#docToggleThumbsBtn'); // Restore
            await page.waitForTimeout(300);
            if (isCollapsed) {
                console.log('  [PASS] Sidebar collapse/expand button works as expected.');
            } else {
                console.error('  [FAIL] Sidebar did not collapse on toggle button click.');
                allPassed = false;
            }
        }

    } catch (err) {
        console.error('Browser testing error:', err);
        allPassed = false;
    } finally {
        await browser.close();
    }

    console.log('\n====================================================');
    if (allPassed) {
        console.log('   RESULT: ALL 4 REQUIREMENTS VERIFIED & PASSED!     ');
    } else {
        console.log('   RESULT: ONE OR MORE TESTS FAILED.                ');
    }
    console.log('====================================================\n');

    process.exit(allPassed ? 0 : 1);
}

runVerification();
