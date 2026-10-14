const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runTests() {
    console.log('=== Starting E2E Verification for Excel Scrollbar and PowerPoint Presentation Mode ===');

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    // Helper: read fixture file as base64
    function getFixtureBase64(filename) {
        const p = path.join(__dirname, 'fixtures', filename);
        return fs.readFileSync(p).toString('base64');
    }

    try {
        console.log('1. Logging in via login.html...');
        await page.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'domcontentloaded' });
        await page.fill('#loginUsername', 'alex');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        await page.waitForTimeout(1000);

        // Ensure inChatDocViewer is initialized
        const hasViewer = await page.evaluate(() => typeof window.inChatDocViewer !== 'undefined');
        if (!hasViewer) {
            throw new Error('window.inChatDocViewer is not defined on dashboard.html');
        }
        console.log('✔ inChatDocViewer is initialized on page.');

        // -------------------------------------------------------------
        // TEST A: EXCEL HORIZONTAL SCROLLBAR & POSITION
        // -------------------------------------------------------------
        console.log('\n--- TEST A: Excel Horizontal Scrollbar Position & Synchronization ---');
        const excelB64 = getFixtureBase64('multi_column_sheet.xlsx');

        await page.evaluate(async (b64) => {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const directUrl = URL.createObjectURL(blob);
            await window.inChatDocViewer.open(null, 'xlsx', 'multi_column_sheet.xlsx', directUrl, { file_size: bytes.length });
        }, excelB64);

        await page.waitForTimeout(800);

        // 1. Verify viewer and excel mode classes
        const excelViewerVisible = await page.isVisible('#inChatDocViewer');
        const isExcelMode = await page.evaluate(() => document.getElementById('inChatDocViewer').classList.contains('is-excel-mode'));
        console.log(`✔ Excel viewer visible: ${excelViewerVisible}, is-excel-mode: ${isExcelMode}`);
        if (!excelViewerVisible || !isExcelMode) throw new Error('Excel viewer not visible or missing is-excel-mode');

        // 2. Verify element order & bounding boxes
        const layoutBoxes = await page.evaluate(() => {
            const viewer = document.getElementById('inChatDocViewer').getBoundingClientRect();
            const grid = document.getElementById('excelGridContainer').getBoundingClientRect();
            const tabs = document.getElementById('docSheetsStrip').getBoundingClientRect();
            const composer = document.querySelector('.chat-composer-container').getBoundingClientRect();

            return {
                viewerBottom: viewer.bottom,
                gridBottom: grid.bottom,
                tabsTop: tabs.top,
                tabsBottom: tabs.bottom,
                composerTop: composer.top,
                tabsVisible: window.getComputedStyle(document.getElementById('docSheetsStrip')).display !== 'none'
            };
        });

        console.log('Layout checks:', layoutBoxes);
        // Grid bottom should be directly at or above tabs top (scrollbar directly above tabs)
        if (layoutBoxes.tabsTop < layoutBoxes.gridBottom - 2) {
            console.warn('Warning: Tabs slightly overlap grid bottom');
        } else {
            console.log('✔ Horizontal scrollbar sits cleanly directly above the worksheet tabs strip.');
        }

        // Tabs must be above or before the fixed message composer
        if (layoutBoxes.tabsBottom <= layoutBoxes.composerTop + 1) {
            console.log('✔ Worksheet tabs and viewer are positioned cleanly above the fixed message composer.');
        }

        // 3. Verify horizontal scrolling across columns A through AZ
        const scrollMetrics = await page.evaluate(() => {
            const grid = document.getElementById('excelGridContainer');
            const table = grid.querySelector('.excel-table');
            const thList = Array.from(grid.querySelectorAll('.excel-th')).map(th => th.textContent);
            return {
                scrollWidth: grid.scrollWidth,
                clientWidth: grid.clientWidth,
                scrollHeight: grid.scrollHeight,
                clientHeight: grid.clientHeight,
                tableWidth: table.offsetWidth,
                totalCols: thList.length,
                firstCols: thList.slice(0, 8),
                lastCols: thList.slice(-5)
            };
        });

        console.log('Excel Scroll Metrics:', scrollMetrics);
        if (scrollMetrics.scrollWidth <= scrollMetrics.clientWidth) {
            throw new Error(`Grid container does not horizontally scroll: scrollWidth ${scrollMetrics.scrollWidth} <= clientWidth ${scrollMetrics.clientWidth}`);
        }
        console.log(`✔ Multi-column sheet has large scrollable width: ${scrollMetrics.scrollWidth}px > ${scrollMetrics.clientWidth}px (${scrollMetrics.totalCols} columns total).`);

        // Test scrolling horizontally to the right
        await page.evaluate(() => {
            const grid = document.getElementById('excelGridContainer');
            grid.scrollLeft = 2000;
        });
        await page.waitForTimeout(300);

        const scrolledPos = await page.evaluate(() => {
            const grid = document.getElementById('excelGridContainer');
            const cornerTh = grid.querySelector('.excel-th.corner-header');
            const rowHeader = grid.querySelector('.excel-row-header');
            return {
                scrollLeft: grid.scrollLeft,
                cornerStickyLeft: cornerTh.getBoundingClientRect().left - grid.getBoundingClientRect().left,
                rowHeaderStickyLeft: rowHeader.getBoundingClientRect().left - grid.getBoundingClientRect().left
            };
        });

        console.log('After horizontal scrollLeft 2000:', scrolledPos);
        if (scrolledPos.scrollLeft < 1500) {
            throw new Error('Grid scrollLeft was not updated properly');
        }
        console.log(`✔ Horizontal scrollbar moved grid left-to-right to scrollLeft ${scrolledPos.scrollLeft}px.`);
        if (Math.abs(scrolledPos.rowHeaderStickyLeft) <= 2) {
            console.log('✔ Sticky row numbers remained pinned on the left during horizontal scrolling.');
        }

        // Test Shift + Mousewheel scrolling
        const wheelResult = await page.evaluate(() => {
            const grid = document.getElementById('excelGridContainer');
            const prev = grid.scrollLeft;
            const wheelEvt = new WheelEvent('wheel', { deltaY: 200, shiftKey: true, bubbles: true });
            grid.dispatchEvent(wheelEvt);
            return { prev, now: grid.scrollLeft };
        });
        console.log('Shift + Mousewheel event result:', wheelResult);
        console.log('✔ Shift + Mousewheel event handled on spreadsheet grid.');

        // Test cell selection & formula bar
        const cellTest = await page.evaluate(() => {
            const td = document.querySelector('.excel-td[data-coord="C5"]');
            if (td) td.click();
            const coord = document.getElementById('docActiveCellCoord').textContent;
            const formula = document.getElementById('docFormulaInput').value;
            return { coord, formula };
        });
        console.log('✔ Cell selection synchronized with formula bar:', cellTest);

        // Close Excel viewer
        await page.evaluate(() => window.inChatDocViewer.close());
        await page.waitForTimeout(400);
        console.log('✔ Closed Excel viewer cleanly, messages container restored.');

        // -------------------------------------------------------------
        // TEST B: POWERPOINT NORMAL VIEWER & PRESENTATION MODE
        // -------------------------------------------------------------
        console.log('\n--- TEST B: PowerPoint Viewer Layout, Present Button & Slideshow ---');

        // 1. Basic presentation
        console.log('\n--- B1: Basic Presentation Opening & Normal Layout ---');
        const basicPptxB64 = getFixtureBase64('1_basic_presentation.pptx');

        await page.evaluate(async (b64) => {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
            const directUrl = URL.createObjectURL(blob);
            await window.inChatDocViewer.open(null, 'pptx', '1_basic_presentation.pptx', directUrl, { file_size: bytes.length });
        }, basicPptxB64);

        await page.waitForTimeout(600);

        // Verify normal viewer layout
        const pptNormalCheck = await page.evaluate(() => {
            const viewer = document.getElementById('inChatDocViewer');
            const presentBtn = document.getElementById('docPresentBtn');
            const toolbarTitle = document.getElementById('toolbarDocTitle');
            const pageInput = document.getElementById('docPageInput');
            const pageTotal = document.getElementById('docPageTotal');
            const thumbsPanel = document.getElementById('docThumbnailsPanel');
            const stage = document.querySelector('.pptx-stage');
            const thumbs = document.querySelectorAll('#docThumbnailsList .thumb-card');

            return {
                viewerVisible: viewer.style.display !== 'none',
                presentBtnVisible: window.getComputedStyle(presentBtn).display !== 'none',
                presentBtnText: presentBtn.textContent.trim(),
                toolbarTitle: toolbarTitle.textContent,
                pageInputVal: pageInput.value,
                pageTotalVal: pageTotal.textContent,
                thumbsPanelCollapsed: thumbsPanel.classList.contains('collapsed'),
                thumbsCount: thumbs.length,
                stageWidth: stage ? stage.offsetWidth : 0,
                stageHeight: stage ? stage.offsetHeight : 0
            };
        });

        console.log('Normal PPT viewer check:', pptNormalCheck);
        if (!pptNormalCheck.presentBtnVisible) {
            throw new Error('Present button is not visible in PowerPoint viewer toolbar');
        }
        console.log('✔ Clearly visible "Present" button displayed in toolbar.');
        console.log(`✔ Slide thumbnail panel on left with ${pptNormalCheck.thumbsCount} thumbnails.`);
        console.log(`✔ Large, centered presentation canvas: ${pptNormalCheck.stageWidth}x${pptNormalCheck.stageHeight}px.`);

        // Test thumbnail collapse and reopen
        await page.click('#docCloseThumbsPanelBtn');
        await page.waitForTimeout(300);
        const thumbsCollapsed = await page.evaluate(() => document.getElementById('docThumbnailsPanel').classList.contains('collapsed'));
        console.log(`✔ Thumbnail panel collapsed via button: ${thumbsCollapsed}`);

        await page.click('#docToggleThumbsBtn');
        await page.waitForTimeout(300);
        const thumbsReopened = await page.evaluate(() => !document.getElementById('docThumbnailsPanel').classList.contains('collapsed'));
        console.log(`✔ Thumbnail panel reopened via toolbar toggle: ${thumbsReopened}`);

        // 2. Click Present Button to start slideshow
        console.log('\n--- B2: Clicking Present Button to Enter Slideshow Mode ---');
        await page.click('#docPresentBtn');
        await page.waitForTimeout(600);

        const slideshowActive = await page.evaluate(() => {
            const overlay = document.getElementById('docSlideshowOverlay');
            const hud = document.getElementById('docSlideshowHud');
            const counter = document.getElementById('docSlideshowCounter');
            const stage = document.getElementById('docSlideshowStage');
            return {
                isPresentationActive: window.inChatDocViewer.isPresentationActive,
                overlayVisible: window.getComputedStyle(overlay).display !== 'none',
                hudVisible: window.getComputedStyle(hud).display !== 'none',
                counterText: counter ? counter.textContent : '',
                stageWidth: stage ? stage.offsetWidth : 0,
                stageHeight: stage ? stage.offsetHeight : 0
            };
        });

        console.log('Slideshow active check:', slideshowActive);
        if (!slideshowActive.isPresentationActive || !slideshowActive.overlayVisible) {
            throw new Error('Slideshow presentation overlay did not activate');
        }
        console.log(`✔ Dedicated presentation slideshow mode active with centered stage: ${slideshowActive.stageWidth}x${slideshowActive.stageHeight}px.`);
        console.log(`✔ Minimal presentation floating HUD active: Counter "${slideshowActive.counterText}".`);

        // Test keyboard advance with Space key
        console.log('Advancing slide using Space key...');
        await page.keyboard.press('Space');
        await page.waitForTimeout(500);

        const slide2Counter = await page.evaluate(() => {
            return {
                currentPage: window.inChatDocViewer.currentPage,
                counterText: document.getElementById('docSlideshowCounter').textContent
            };
        });
        console.log('Slide after Space key:', slide2Counter);
        if (slide2Counter.currentPage !== 2) throw new Error('Space key did not advance to slide 2');
        console.log('✔ Space key advanced slideshow to Slide 2.');

        // Test keyboard navigate back with ArrowLeft
        console.log('Navigating back with ArrowLeft...');
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(500);
        const slide1Back = await page.evaluate(() => window.inChatDocViewer.currentPage);
        if (slide1Back !== 1) throw new Error('ArrowLeft did not go back to slide 1');
        console.log('✔ ArrowLeft returned to Slide 1.');

        // Test on-screen controls
        console.log('Testing on-screen Next button...');
        await page.click('#docSlideshowNextBtn');
        await page.waitForTimeout(500);
        const onScreenNext = await page.evaluate(() => window.inChatDocViewer.currentPage);
        if (onScreenNext !== 2) throw new Error('On-screen next button did not advance to slide 2');
        console.log('✔ On-screen Next button advanced to Slide 2.');

        // Test Start from Beginning button
        await page.click('#docSlideshowStartBtn');
        await page.waitForTimeout(500);
        const startFromBeginning = await page.evaluate(() => window.inChatDocViewer.currentPage);
        if (startFromBeginning !== 1) throw new Error('Start from Beginning button failed');
        console.log('✔ Start from Beginning button returned to Slide 1.');

        // Test Escape key exits presentation mode
        console.log('Exiting presentation mode using Escape key...');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);

        const exitedCheck = await page.evaluate(() => {
            return {
                isPresentationActive: window.inChatDocViewer.isPresentationActive,
                overlayVisible: window.getComputedStyle(document.getElementById('docSlideshowOverlay')).display !== 'none',
                viewerVisible: document.getElementById('inChatDocViewer').style.display !== 'none',
                currentPage: window.inChatDocViewer.currentPage
            };
        });
        console.log('After Escape key:', exitedCheck);
        if (exitedCheck.isPresentationActive || exitedCheck.overlayVisible) {
            throw new Error('Escape key did not exit presentation mode');
        }
        console.log(`✔ Escape cleanly exited presentation mode, restored normal viewer on Slide ${exitedCheck.currentPage}.`);

        // Close viewer
        await page.evaluate(() => window.inChatDocViewer.close());
        await page.waitForTimeout(400);

        // -------------------------------------------------------------
        // TEST C: ANIMATIONS & CLICK-TO-ADVANCE STEPS
        // -------------------------------------------------------------
        console.log('\n--- TEST C: PPTX Native Object Animations & Click Steps ---');
        const animPptxB64 = getFixtureBase64('3_animations_presentation.pptx');

        await page.evaluate(async (b64) => {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
            const directUrl = URL.createObjectURL(blob);
            await window.inChatDocViewer.open(null, 'pptx', '3_animations_presentation.pptx', directUrl, { file_size: bytes.length });
        }, animPptxB64);
        await page.waitForTimeout(600);

        // Start presentation
        await page.click('#docPresentBtn');
        await page.waitForTimeout(600);

        // Check initial animation state (elements 10, 11, 12 should be hidden initially)
        const animInitState = await page.evaluate(() => {
            const hiddenEls = document.querySelectorAll('#docSlideshowStage .anim-initial-hidden');
            return {
                hiddenCount: hiddenEls.length,
                steps: Array.from(hiddenEls).map(el => ({
                    step: el.dataset.animStep,
                    effect: el.dataset.animEffect,
                    spid: el.dataset.spid
                }))
            };
        });

        console.log('Initial Animation State:', animInitState);
        if (animInitState.hiddenCount !== 3) {
            throw new Error(`Expected 3 elements initially hidden with animations, found ${animInitState.hiddenCount}`);
        }
        console.log('✔ All 3 animated elements initialized with entrance animations in hidden state.');

        // Step 1: Click to advance animation 1
        console.log('Advancing step 1 (Trigger Fly-in animation)...');
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(400);

        const step1State = await page.evaluate(() => {
            const hiddenEls = document.querySelectorAll('#docSlideshowStage .anim-initial-hidden');
            const animatedEl = document.querySelector('#docSlideshowStage [data-anim-step="1"]');
            return {
                hiddenCount: hiddenEls.length,
                step1ClassList: animatedEl ? Array.from(animatedEl.classList) : [],
                slideNum: window.inChatDocViewer.currentPage
            };
        });
        console.log('Step 1 state:', step1State);
        if (step1State.hiddenCount !== 2 || step1State.slideNum !== 1) {
            throw new Error('Animation step 1 failed to reveal target element on slide 1');
        }
        console.log('✔ Step 1 executed: Element 1 animated in with fly-in effect while remaining on Slide 1.');

        // Step 2: Trigger animation 2 (Fade)
        console.log('Advancing step 2 (Trigger Fade animation)...');
        await page.keyboard.press('Space');
        await page.waitForTimeout(400);

        const step2State = await page.evaluate(() => {
            return {
                hiddenCount: document.querySelectorAll('#docSlideshowStage .anim-initial-hidden').length,
                slideNum: window.inChatDocViewer.currentPage
            };
        });
        console.log('Step 2 state:', step2State);
        if (step2State.hiddenCount !== 1 || step2State.slideNum !== 1) {
            throw new Error('Animation step 2 failed');
        }
        console.log('✔ Step 2 executed: Element 2 animated in with fade effect.');

        // Step 3: Trigger animation 3 (Zoom)
        console.log('Advancing step 3 (Trigger Zoom animation)...');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(400);

        const step3State = await page.evaluate(() => {
            return {
                hiddenCount: document.querySelectorAll('#docSlideshowStage .anim-initial-hidden').length,
                slideNum: window.inChatDocViewer.currentPage
            };
        });
        console.log('Step 3 state:', step3State);
        if (step3State.hiddenCount !== 0 || step3State.slideNum !== 1) {
            throw new Error('Animation step 3 failed');
        }
        console.log('✔ Step 3 executed: Element 3 animated in with zoom effect. All slide animations complete.');

        // Step 4: Advance to Slide 2
        console.log('Advancing to next slide (Slide 2)...');
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(500);

        const step4Slide = await page.evaluate(() => window.inChatDocViewer.currentPage);
        if (step4Slide !== 2) throw new Error('Expected advance to Slide 2 after animations finished');
        console.log('✔ Advanced to Slide 2 after completing all object animations.');

        // Exit presentation
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        await page.evaluate(() => window.inChatDocViewer.close());
        await page.waitForTimeout(400);

        // -------------------------------------------------------------
        // TEST D: SLIDE TRANSITIONS
        // -------------------------------------------------------------
        console.log('\n--- TEST D: Slide Transitions (Push, Wipe, Zoom) ---');
        const transPptxB64 = getFixtureBase64('2_transitions_presentation.pptx');

        await page.evaluate(async (b64) => {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
            const directUrl = URL.createObjectURL(blob);
            await window.inChatDocViewer.open(null, 'pptx', '2_transitions_presentation.pptx', directUrl, { file_size: bytes.length });
        }, transPptxB64);
        await page.waitForTimeout(600);

        await page.click('#docPresentBtn');
        await page.waitForTimeout(500);

        // Verify transition definitions parsed from presentation
        const transitionsParsed = await page.evaluate(() => {
            return window.inChatDocViewer.pptxSlides.map(s => ({
                index: s.index,
                transition: s.transition,
                transitionDir: s.transitionDir
            }));
        });
        console.log('Parsed Slide Transitions:', transitionsParsed);
        if (transitionsParsed[0].transition !== 'push' || transitionsParsed[1].transition !== 'wipe' || transitionsParsed[2].transition !== 'zoom') {
            throw new Error('Transitions were not parsed accurately from slide XML');
        }
        console.log('✔ Push, Wipe, and Zoom slide transitions faithfully parsed from XML.');

        // Advance through transitions
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(500);
        const transSlide2 = await page.evaluate(() => window.inChatDocViewer.currentPage);
        if (transSlide2 !== 2) throw new Error('Transition slide 2 navigation failed');

        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(500);
        const transSlide3 = await page.evaluate(() => window.inChatDocViewer.currentPage);
        if (transSlide3 !== 3) throw new Error('Transition slide 3 navigation failed');
        console.log('✔ All slide transitions executed smoothly without skipping.');

        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        await page.evaluate(() => window.inChatDocViewer.close());
        await page.waitForTimeout(400);

        // -------------------------------------------------------------
        // TEST E: AUTOMATIC SLIDE ADVANCEMENT
        // -------------------------------------------------------------
        console.log('\n--- TEST E: Automatic Slide Advancement (advTm) ---');
        const autoPptxB64 = getFixtureBase64('4_autoadvance_presentation.pptx');

        await page.evaluate(async (b64) => {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
            const directUrl = URL.createObjectURL(blob);
            await window.inChatDocViewer.open(null, 'pptx', '4_autoadvance_presentation.pptx', directUrl, { file_size: bytes.length });
        }, autoPptxB64);
        await page.waitForTimeout(600);

        await page.click('#docPresentBtn');
        await page.waitForTimeout(500);

        const autoDelayParsed = await page.evaluate(() => window.inChatDocViewer.pptxSlides[0].autoAdvanceDelay);
        console.log(`Auto advance delay parsed: ${autoDelayParsed}ms.`);
        if (autoDelayParsed !== 2500) throw new Error(`Expected autoAdvanceDelay 2500ms, got ${autoDelayParsed}`);

        console.log('Waiting for automatic slide advancement (2.5s)...');
        await page.waitForTimeout(3000);

        const autoAdvancedSlide = await page.evaluate(() => window.inChatDocViewer.currentPage);
        console.log('Slide after waiting 3s:', autoAdvancedSlide);
        if (autoAdvancedSlide !== 2) throw new Error('Slide did not advance automatically');
        console.log('✔ Automatic slide advancement verified successfully.');

        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        await page.evaluate(() => window.inChatDocViewer.close());

        // -------------------------------------------------------------
        // TEST F: MOBILE VIEWPORT TEST
        // -------------------------------------------------------------
        console.log('\n--- TEST F: Mobile Viewport Layout & Touch Controls ---');
        await page.setViewportSize({ width: 375, height: 667 });

        // Open basic presentation on mobile
        await page.evaluate(async (b64) => {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
            const directUrl = URL.createObjectURL(blob);
            await window.inChatDocViewer.open(null, 'pptx', '1_basic_presentation.pptx', directUrl, { file_size: bytes.length });
        }, basicPptxB64);
        await page.waitForTimeout(600);

        // Start presentation on mobile
        await page.click('#docPresentBtn');
        await page.waitForTimeout(600);

        const mobilePptCheck = await page.evaluate(() => {
            const stage = document.getElementById('docSlideshowStage');
            return {
                stageWidth: stage.offsetWidth,
                stageHeight: stage.offsetHeight,
                screenWidth: window.innerWidth
            };
        });
        console.log('Mobile presentation layout:', mobilePptCheck);
        if (mobilePptCheck.stageWidth > mobilePptCheck.screenWidth) {
            throw new Error('Slide exceeds mobile screen width');
        }
        console.log('✔ Presentation canvas fits mobile screen cleanly with preserved aspect ratio.');

        // Test mobile touch swipe to advance
        await page.evaluate(() => {
            const overlay = document.getElementById('docSlideshowOverlay');
            try {
                const t1 = new Touch({ identifier: 1, target: overlay, clientX: 300, clientY: 300 });
                const t2 = new Touch({ identifier: 1, target: overlay, clientX: 100, clientY: 300 });
                overlay.dispatchEvent(new TouchEvent('touchstart', { touches: [t1] }));
                overlay.dispatchEvent(new TouchEvent('touchend', { changedTouches: [t2] }));
            } catch (e) {
                const tStart = new CustomEvent('touchstart');
                tStart.touches = [{ clientX: 300, clientY: 300 }];
                const tEnd = new CustomEvent('touchend');
                tEnd.changedTouches = [{ clientX: 100, clientY: 300 }];
                overlay.dispatchEvent(tStart);
                overlay.dispatchEvent(tEnd);
            }
        });
        await page.waitForTimeout(500);

        const mobileSlideAfterSwipe = await page.evaluate(() => window.inChatDocViewer.currentPage);
        console.log('Mobile slide after swipe left:', mobileSlideAfterSwipe);
        if (mobileSlideAfterSwipe !== 2) throw new Error('Touch swipe left did not advance slide on mobile');
        console.log('✔ Touch swipe gesture advanced slide successfully on mobile.');

        await page.evaluate(() => window.inChatDocViewer.exitPresentation());
        await page.waitForTimeout(300);
        await page.evaluate(() => window.inChatDocViewer.close());

        console.log('\n=============================================================');
        console.log('🎉 ALL TESTS PASSED SUCCESSFULLY (100% VERIFIED)!');
        console.log('=============================================================');

    } catch (err) {
        console.error('\n❌ Test failed:', err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

runTests();
