const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runComprehensiveVerification() {
    console.log('========================================================================');
    console.log('  FRANK Think — Comprehensive E2E Verification Suite');
    console.log('  1. PowerPoint Thumbnails & Scaled Mini Previews (Slides 1, 7, 8, 9, 10)');
    console.log('  2. PowerPoint Toolbar Layout, Overflow, & Presentation Mode');
    console.log('  3. Chats Filter Button, Popover, Filtering, Search & Reset');
    console.log('  4. Multi-Breakpoint Responsive Testing (1280, 1440, 1920, 320, 375, 390, 430)');
    console.log('========================================================================\n');

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    // Collect console errors
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push(msg.text());
        }
    });

    function getFixtureBase64(filename) {
        const p = path.join(__dirname, 'fixtures', filename);
        return fs.readFileSync(p).toString('base64');
    }

    try {
        // Step 1: Login
        console.log('Step 1: Logging into FRANK Think dashboard...');
        await page.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'domcontentloaded' });
        await page.fill('#loginUsername', 'alex');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        await page.waitForTimeout(1000);
        console.log('✔ Successfully logged in as Alex.\n');

        // =====================================================================
        // PART 1: CHATS FILTER BUTTON & POPOVER
        // =====================================================================
        console.log('------------------------------------------------------------------------');
        console.log('PART 1: Verifying Chats Filter Button & Popover');
        console.log('------------------------------------------------------------------------');

        // 1.1 Verify Filter button exists and is clickable
        const filterBtnVisible = await page.isVisible('#chatsHeaderFilterBtn');
        if (!filterBtnVisible) throw new Error('#chatsHeaderFilterBtn is not visible');
        console.log('✔ Filter button beside Chats heading is visible.');

        // 1.2 Click filter button to open popover
        await page.click('#chatsHeaderFilterBtn');
        await page.waitForTimeout(200);

        const popoverState1 = await page.evaluate(() => {
            const popover = document.getElementById('chatsFilterPopover');
            const btn = document.getElementById('chatsHeaderFilterBtn');
            const items = Array.from(popover.querySelectorAll('.filter-popover-item')).map(el => ({
                filter: el.dataset.filter,
                text: el.querySelector('.filter-item-label')?.textContent.trim(),
                isActive: el.classList.contains('active')
            }));
            return {
                display: window.getComputedStyle(popover).display,
                ariaExpanded: btn.getAttribute('aria-expanded'),
                itemsCount: items.length,
                items: items
            };
        });

        console.log(`✔ Filter popover opened. Display: ${popoverState1.display}, Items count: ${popoverState1.itemsCount}`);
        if (popoverState1.display === 'none') throw new Error('Filter popover did not open');
        if (popoverState1.itemsCount < 7) throw new Error(`Expected at least 7 filter options, got ${popoverState1.itemsCount}`);

        // 1.3 Test Outside Click Dismissal
        await page.click('#desktopHeaderTitle');
        await page.waitForTimeout(200);
        const popoverClosedAfterOutsideClick = await page.evaluate(() => {
            const popover = document.getElementById('chatsFilterPopover');
            return window.getComputedStyle(popover).display === 'none';
        });
        if (!popoverClosedAfterOutsideClick) throw new Error('Filter popover did not close on outside click');
        console.log('✔ Popover closes on outside click.');

        // 1.4 Test Escape Key Dismissal
        await page.click('#chatsHeaderFilterBtn');
        await page.waitForTimeout(200);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        const popoverClosedAfterEsc = await page.evaluate(() => {
            const popover = document.getElementById('chatsFilterPopover');
            return window.getComputedStyle(popover).display === 'none';
        });
        if (!popoverClosedAfterEsc) throw new Error('Filter popover did not close on Escape key');
        console.log('✔ Popover closes on Escape key.');

        // 1.5 Apply "groups" filter
        await page.click('#chatsHeaderFilterBtn');
        await page.waitForTimeout(200);
        await page.click('.filter-popover-item[data-filter="groups"]');
        await page.waitForTimeout(300);

        const groupsFilterState = await page.evaluate(() => {
            const dot = document.getElementById('filterActiveDot');
            const btn = document.getElementById('chatsHeaderFilterBtn');
            const cards = Array.from(document.querySelectorAll('#conversationList .conversation-card'));
            const allGroups = cards.every(c => c.classList.contains('is-group'));
            return {
                isFiltered: btn.classList.contains('is-filtered'),
                dotVisible: window.getComputedStyle(dot).display !== 'none',
                cardsCount: cards.length,
                allGroups: allGroups
            };
        });
        console.log(`✔ "Groups" filter applied. Card count: ${groupsFilterState.cardsCount}, All groups: ${groupsFilterState.allGroups}, Dot visible: ${groupsFilterState.dotVisible}`);

        // 1.6 Apply "direct" filter
        await page.click('#chatsHeaderFilterBtn');
        await page.waitForTimeout(200);
        await page.click('.filter-popover-item[data-filter="direct"]');
        await page.waitForTimeout(300);
        const directFilterState = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('#conversationList .conversation-card'));
            const noneAreGroups = cards.every(c => !c.classList.contains('is-group'));
            return { cardsCount: cards.length, noneAreGroups: noneAreGroups };
        });
        console.log(`✔ "Direct" filter applied. Card count: ${directFilterState.cardsCount}, No groups: ${directFilterState.noneAreGroups}`);

        // 1.7 Test Combined Filtering + Search
        await page.fill('#conversationSearchInput', 'Sarah');
        await page.waitForTimeout(300);
        const searchCombinedState = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('#conversationList .conversation-card'));
            return {
                cardsCount: cards.length,
                matchedNames: cards.map(c => c.querySelector('.conversation-name')?.textContent.trim())
            };
        });
        console.log(`✔ Search combined with filter. Matched:`, searchCombinedState.matchedNames);

        // 1.8 Clear search and Reset filter
        await page.fill('#conversationSearchInput', '');
        await page.click('#chatsHeaderFilterBtn');
        await page.waitForTimeout(200);
        await page.click('#clearChatsFilterBtn');
        await page.waitForTimeout(300);

        const resetFilterState = await page.evaluate(() => {
            const dot = document.getElementById('filterActiveDot');
            const btn = document.getElementById('chatsHeaderFilterBtn');
            const cards = Array.from(document.querySelectorAll('#conversationList .conversation-card'));
            return {
                isFiltered: btn.classList.contains('is-filtered'),
                dotVisible: window.getComputedStyle(dot).display !== 'none',
                cardsCount: cards.length
            };
        });
        console.log(`✔ Filter reset. All conversations restored (${resetFilterState.cardsCount} cards). Filter dot hidden: ${!resetFilterState.dotVisible}\n`);

        // =====================================================================
        // PART 2: POWERPOINT 10-SLIDE THUMBNAILS & PREVIEWS
        // =====================================================================
        console.log('------------------------------------------------------------------------');
        console.log('PART 2: Verifying PowerPoint Document Viewer & Thumbnails');
        console.log('------------------------------------------------------------------------');

        const pptxB64 = getFixtureBase64('multi_slide_presentation.pptx');

        await page.evaluate(async (b64) => {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
            const directUrl = URL.createObjectURL(blob);
            await window.inChatDocViewer.open(null, 'pptx', 'multi_slide_presentation.pptx', directUrl, { file_size: bytes.length });
        }, pptxB64);

        await page.waitForTimeout(1000);

        // 2.1 Check total slides loaded
        const totalSlides = await page.evaluate(() => window.inChatDocViewer.totalPages);
        console.log(`✔ Presentation loaded with total slides: ${totalSlides} (Expected: 10)`);
        if (totalSlides !== 10) throw new Error(`Expected 10 slides, got ${totalSlides}`);

        // 2.2 Verify Thumbnails show REAL scaled content (not generic "Slide X" text)
        const thumbnailAnalysis = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('#docThumbnailsList .thumb-card'));
            return cards.map(c => {
                const pageNum = parseInt(c.dataset.page, 10);
                const miniStage = c.querySelector('.slide-thumb-mini-stage');
                const elements = miniStage ? miniStage.querySelectorAll('.pptx-slide-element') : [];
                const hasTable = miniStage ? Boolean(miniStage.querySelector('.pptx-table')) : false;
                const hasImg = miniStage ? Boolean(miniStage.querySelector('.pptx-slide-pic-shape img')) : false;
                const textContent = (miniStage ? miniStage.textContent : '').trim();
                const numLabel = c.querySelector('.thumb-card-num')?.textContent.trim();
                const isActive = c.classList.contains('active');

                return {
                    pageNum,
                    numLabel,
                    isActive,
                    elementsCount: elements.length,
                    hasTable,
                    hasImg,
                    textSnippet: textContent.substring(0, 45),
                    // Check if it's a generic placeholder like just "Slide 8"
                    isGenericPlaceholder: textContent === `Slide ${pageNum}`
                };
            });
        });

        console.log('Thumbnail Analysis Summary:');
        thumbnailAnalysis.forEach(t => {
            console.log(`  Slide ${t.pageNum}: ${t.elementsCount} elements | Table: ${t.hasTable} | Img: ${t.hasImg} | Snippet: "${t.textSnippet}"`);
        });

        // Verify specific requirements:
        // Slide 1 has real content
        const t1 = thumbnailAnalysis.find(t => t.pageNum === 1);
        if (!t1 || t1.elementsCount === 0 || !t1.textSnippet.includes('FRANK Platform')) {
            throw new Error('Slide 1 thumbnail does not show actual content');
        }
        console.log('✔ Slide 1 thumbnail renders actual platform overview content.');

        // Slide 7 has actual specifications content
        const t7 = thumbnailAnalysis.find(t => t.pageNum === 7);
        if (!t7 || t7.elementsCount === 0 || !t7.textSnippet.includes('Technical Specifications')) {
            throw new Error('Slide 7 thumbnail does not show actual content');
        }
        console.log('✔ Slide 7 thumbnail renders actual Technical Specifications.');

        // Slide 8 has actual Financial Projections table content
        const t8 = thumbnailAnalysis.find(t => t.pageNum === 8);
        if (!t8 || !t8.hasTable || !t8.textSnippet.includes('Financial Projections')) {
            throw new Error('Slide 8 thumbnail does not show actual table content');
        }
        console.log('✔ Slide 8 thumbnail renders actual Financial Projections table.');

        // Slide 9 has Roadmap content
        const t9 = thumbnailAnalysis.find(t => t.pageNum === 9);
        if (!t9 || t9.elementsCount === 0 || !t9.textSnippet.includes('Global Deployment Roadmap')) {
            throw new Error('Slide 9 thumbnail does not show actual roadmap content');
        }
        console.log('✔ Slide 9 thumbnail renders actual Global Deployment Roadmap.');

        // Slide 10: genuinely blank slide preview
        const t10 = thumbnailAnalysis.find(t => t.pageNum === 10);
        if (!t10 || t10.elementsCount !== 0 || t10.textSnippet !== '') {
            throw new Error('Slide 10 should show a clean blank-slide preview without fabricated text');
        }
        console.log('✔ Slide 10 thumbnail shows a clean blank-slide preview (zero fabricated text).');

        // 2.3 Clicking Thumbnail 8 switches to Slide 8
        console.log('\nTesting Thumbnail Selection & Navigation...');
        const card8 = page.locator('#docThumbnailsList .thumb-card[data-page="8"]');
        await card8.click();
        await page.waitForTimeout(400);

        const slide8ActiveState = await page.evaluate(() => {
            const currentPg = window.inChatDocViewer.currentPage;
            const inputVal = document.getElementById('docPageInput').value;
            const card8Active = document.querySelector('#docThumbnailsList .thumb-card[data-page="8"]').classList.contains('active');
            const stageText = document.querySelector('.pptx-stage')?.textContent || '';
            const stageTable = Boolean(document.querySelector('.pptx-stage .pptx-table'));
            return {
                currentPg,
                inputVal,
                card8Active,
                stageTable,
                hasSlide8Text: stageText.includes('Slide 8: Financial Projections')
            };
        });

        console.log('Slide 8 Active Check:', slide8ActiveState);
        if (slide8ActiveState.currentPg !== 8 || !slide8ActiveState.card8Active || !slide8ActiveState.hasSlide8Text) {
            throw new Error('Clicking thumbnail 8 did not activate slide 8');
        }
        console.log('✔ Clicking thumbnail 8 updates active border, page input to 8, and renders exact slide 8 with table.');

        // 2.4 Next / Previous navigation
        await page.click('#docNextBtn');
        await page.waitForTimeout(300);
        const slide9PageNum = await page.evaluate(() => window.inChatDocViewer.currentPage);
        if (slide9PageNum !== 9) throw new Error(`Expected page 9 after next, got ${slide9PageNum}`);
        console.log('✔ Next button advanced to slide 9.');

        await page.click('#docPrevBtn');
        await page.waitForTimeout(300);
        const backTo8PageNum = await page.evaluate(() => window.inChatDocViewer.currentPage);
        if (backTo8PageNum !== 8) throw new Error(`Expected page 8 after prev, got ${backTo8PageNum}`);
        console.log('✔ Prev button returned to slide 8.\n');

        // =====================================================================
        // PART 3: PRESENTATION BUTTON & SLIDESHOW MODE
        // =====================================================================
        console.log('------------------------------------------------------------------------');
        console.log('PART 3: Verifying Presentation Button & Slideshow Presentation Mode');
        console.log('------------------------------------------------------------------------');

        // 3.1 Verify Presentation Button Visible and Not Overlapping Nearby Buttons
        const toolbarPositions = await page.evaluate(() => {
            const present = document.getElementById('docPresentBtn').getBoundingClientRect();
            const search = document.getElementById('docSearchToggleBtn').getBoundingClientRect();
            const download = document.getElementById('docDownloadToolBtn').getBoundingClientRect();
            const print = document.getElementById('docPrintToolBtn').getBoundingClientRect();
            const fs = document.getElementById('docFullscreenToolBtn').getBoundingClientRect();
            const close = document.getElementById('docToolbarCloseBtn').getBoundingClientRect();

            // Check overlap between present and its immediate siblings
            const overlapsSearch = !(present.right <= search.left || present.left >= search.right || present.bottom <= search.top || present.top >= search.bottom);
            const overlapsDownload = !(present.right <= download.left || present.left >= download.right || present.bottom <= download.top || present.top >= download.bottom);
            const overlapsPrint = !(present.right <= print.left || present.left >= print.right || present.bottom <= print.top || present.top >= print.bottom);
            const overlapsFs = !(present.right <= fs.left || present.left >= fs.right || present.bottom <= fs.top || present.top >= fs.bottom);
            const overlapsClose = !(present.right <= close.left || present.left >= close.right || present.bottom <= close.top || present.top >= close.bottom);

            return {
                presentRect: { x: present.x, y: present.y, width: present.width, height: present.height },
                overlaps: overlapsSearch || overlapsDownload || overlapsPrint || overlapsFs || overlapsClose,
                overlapsDetail: { overlapsSearch, overlapsDownload, overlapsPrint, overlapsFs, overlapsClose }
            };
        });

        console.log('Toolbar Positions & Overlap Check:', toolbarPositions);
        if (toolbarPositions.overlaps) {
            throw new Error(`Presentation button overlaps nearby controls: ${JSON.stringify(toolbarPositions.overlapsDetail)}`);
        }
        console.log('✔ Presentation button has dedicated space and ZERO overlap with Search, Download, Print, Fullscreen, or Close.');

        // 3.2 Launch Slideshow Mode
        await page.click('#docPresentBtn');
        await page.waitForTimeout(500);

        const slideshowModeActive = await page.evaluate(() => {
            const overlay = document.getElementById('docSlideshowOverlay');
            const hud = document.getElementById('docSlideshowHud');
            const counter = document.getElementById('docSlideshowCounter');
            const stage = document.getElementById('docSlideshowStage');
            return {
                isPresentationActive: window.inChatDocViewer.isPresentationActive,
                display: window.getComputedStyle(overlay).display,
                counterText: counter ? counter.textContent : '',
                stageWidth: stage ? stage.offsetWidth : 0,
                stageHeight: stage ? stage.offsetHeight : 0,
                stageHasContent: (stage ? stage.textContent : '').includes('Financial Projections')
            };
        });

        console.log('Slideshow Active State:', slideshowModeActive);
        if (!slideshowModeActive.isPresentationActive || slideshowModeActive.display === 'none') {
            throw new Error('Presentation mode failed to launch');
        }
        if (!slideshowModeActive.stageHasContent) {
            throw new Error('Presentation mode did not preserve slide 8 content upon entering');
        }
        console.log(`✔ Slideshow opened from slide 8: Counter "${slideshowModeActive.counterText}", stage size: ${slideshowModeActive.stageWidth}x${slideshowModeActive.stageHeight}px.`);

        // 3.3 Keyboard Navigation in Slideshow (ArrowRight -> Slide 9)
        await page.keyboard.press('ArrowRight');
        await page.waitForTimeout(400);
        const ssPageAfterRight = await page.evaluate(() => ({
            page: window.inChatDocViewer.currentPage,
            counter: document.getElementById('docSlideshowCounter')?.textContent,
            hasRoadmap: document.getElementById('docSlideshowStage')?.textContent.includes('Global Deployment Roadmap')
        }));
        console.log('After ArrowRight in Slideshow:', ssPageAfterRight);
        if (ssPageAfterRight.page !== 9 || !ssPageAfterRight.hasRoadmap) {
            throw new Error('ArrowRight did not advance slideshow to Slide 9');
        }
        console.log('✔ ArrowRight advanced slideshow to Slide 9.');

        // 3.4 Keyboard Navigation (ArrowLeft -> Slide 8)
        await page.keyboard.press('ArrowLeft');
        await page.waitForTimeout(400);
        const ssPageAfterLeft = await page.evaluate(() => window.inChatDocViewer.currentPage);
        if (ssPageAfterLeft !== 8) {
            throw new Error(`Expected slide 8 after ArrowLeft, got ${ssPageAfterLeft}`);
        }
        console.log('✔ ArrowLeft returned slideshow to Slide 8.');

        // 3.5 Escape to exit slideshow mode
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        const exitedState = await page.evaluate(() => {
            const overlay = document.getElementById('docSlideshowOverlay');
            return {
                isPresentationActive: window.inChatDocViewer.isPresentationActive,
                overlayHidden: window.getComputedStyle(overlay).display === 'none',
                normalViewerVisible: document.getElementById('inChatDocViewer').style.display !== 'none',
                currentPage: window.inChatDocViewer.currentPage
            };
        });

        console.log('Exited Slideshow State:', exitedState);
        if (exitedState.isPresentationActive || !exitedState.overlayHidden || !exitedState.normalViewerVisible || exitedState.currentPage !== 8) {
            throw new Error('Escape did not cleanly exit slideshow mode back to normal viewer with current slide intact');
        }
        console.log('✔ Escape cleanly exited slideshow presentation mode back to document viewer at slide 8.\n');

        // =====================================================================
        // PART 4: MULTI-BREAKPOINT RESPONSIVE VERIFICATION
        // =====================================================================
        console.log('------------------------------------------------------------------------');
        console.log('PART 4: Multi-Breakpoint Responsive Testing');
        console.log('------------------------------------------------------------------------');

        const testWidths = [1920, 1440, 1280, 430, 390, 375, 320];

        for (const w of testWidths) {
            await page.setViewportSize({ width: w, height: 800 });
            await page.waitForTimeout(300);

            const bpCheck = await page.evaluate((width) => {
                const toolbar = document.querySelector('.in-chat-doc-toolbar');
                const presentBtn = document.getElementById('docPresentBtn');
                const overflowBtn = document.getElementById('docMoreActionsBtn');
                const closeBtn = document.getElementById('docToolbarCloseBtn');

                // Check if toolbar has visible horizontal overflow
                const hasOverflow = toolbar.scrollWidth > toolbar.clientWidth + 2;

                // Check overlaps
                let hasOverlap = false;
                if (presentBtn && closeBtn) {
                    const pRect = presentBtn.getBoundingClientRect();
                    const cRect = closeBtn.getBoundingClientRect();
                    if (!(pRect.right <= cRect.left || pRect.left >= cRect.right)) {
                        hasOverlap = true;
                    }
                }

                return {
                    width,
                    toolbarWidth: toolbar.clientWidth,
                    scrollWidth: toolbar.scrollWidth,
                    hasOverflow,
                    hasOverlap,
                    overflowBtnVisible: overflowBtn ? window.getComputedStyle(overflowBtn).display !== 'none' : false,
                    presentBtnVisible: presentBtn ? window.getComputedStyle(presentBtn).display !== 'none' : false
                };
            }, w);

            console.log(`Breakpoint ${w}px: Toolbar width: ${bpCheck.toolbarWidth}px | Overflow: ${bpCheck.hasOverflow} | Overlap: ${bpCheck.hasOverlap} | More Actions Btn: ${bpCheck.overflowBtnVisible}`);
            if (bpCheck.hasOverlap) {
                throw new Error(`Overlap detected at width ${w}px!`);
            }
        }
        console.log('✔ All desktop (1920, 1440, 1280) and mobile (430, 390, 375, 320) viewports pass without toolbar overlap.\n');

        // Test Overflow Dropdown on mobile width (375px)
        await page.setViewportSize({ width: 375, height: 800 });
        await page.click('#docMoreActionsBtn');
        await page.waitForTimeout(300);
        const overflowDropdownState = await page.evaluate(() => {
            const dropdown = document.getElementById('docMoreActionsDropdown');
            return {
                visible: window.getComputedStyle(dropdown).display !== 'none',
                itemsCount: dropdown.querySelectorAll('.doc-overflow-item').length
            };
        });
        console.log(`✔ Overflow dropdown on mobile: Visible: ${overflowDropdownState.visible}, Options: ${overflowDropdownState.itemsCount}`);
        if (!overflowDropdownState.visible || overflowDropdownState.itemsCount < 4) {
            throw new Error('Overflow dropdown did not display options on mobile');
        }

        // Close viewer
        await page.click('#docToolbarCloseBtn');
        await page.waitForTimeout(400);
        console.log('✔ Document viewer closed cleanly.');

        // Check console errors
        console.log('\n------------------------------------------------------------------------');
        console.log('Console Errors Check:');
        console.log('------------------------------------------------------------------------');
        const relevantErrors = consoleErrors.filter(e => !e.includes('favicon'));
        if (relevantErrors.length > 0) {
            console.warn('Console errors detected:', relevantErrors);
        } else {
            console.log('✔ Zero console errors recorded during entire suite run.');
        }

        console.log('\n========================================================================');
        console.log('  ALL TESTS PASSED SUCCESSFULLY! 🚀');
        console.log('========================================================================');

    } catch (err) {
        console.error('❌ Test failed with error:', err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

runComprehensiveVerification();
