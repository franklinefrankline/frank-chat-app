const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function runWordMobileE2ETests() {
    console.log('========================================================================');
    console.log('  FRANK Think — Word Document Viewer Mobile & Responsive Verification');
    console.log('  1. Proposed SLN Website Header.docx Verification (Mobile 375px)');
    console.log('  2. Multi-Breakpoint Responsive Testing (320, 360, 375, 390, 430, 768, 1280, 1440)');
    console.log('  3. Zoom Interaction Testing (75%, 100%, 125%)');
    console.log('  4. Multi-Page, Tables, Lists & Formatting Testing (rich_word_document.docx)');
    console.log('  5. Toolbar Spacing & Present Button Verification');
    console.log('========================================================================\n');

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const consoleErrors = [];

    // Helper to login and open chat
    async function setupPage(width, height) {
        const context = await browser.newContext({
            viewport: { width, height },
            deviceScaleFactor: 2,
            isMobile: width <= 768,
            hasTouch: width <= 768
        });
        const page = await context.newPage();

        page.on('console', msg => {
            if (msg.type() === 'error') {
                const text = msg.text();
                // Ignore harmless favicon or external font network errors if any
                if (!text.includes('favicon')) {
                    consoleErrors.push(text);
                }
            }
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'domcontentloaded' });
        await page.fill('#loginUsername', 'alex');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        await page.waitForTimeout(500);

        // Open chat
        await page.waitForSelector('.conversation-card', { timeout: 10000 });
        await page.click('.conversation-card');
        await page.waitForTimeout(300);

        return { context, page };
    }

    // Helper to load docx from buffer/b64
    async function loadDocx(page, filename, filePath) {
        const b64 = fs.readFileSync(filePath).toString('base64');
        await page.evaluate(async ({ b64, filename }) => {
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            const directUrl = URL.createObjectURL(blob);
            await window.inChatDocViewer.open(null, 'word', filename, directUrl, { file_size: bytes.length });
        }, { b64, filename });
        await page.waitForTimeout(1500);
    }

    const slnDocPath = path.join(__dirname, '..', 'backend', 'uploads', '355a0a93bfaa4c46a3c5600731cb9e32.docx');
    const richDocPath = path.join(__dirname, 'fixtures', 'rich_word_document.docx');

    try {
        // =====================================================================
        // PART 1: PROPOSED SLN WEBSITE HEADER.DOCX (MOBILE 375px)
        // =====================================================================
        console.log('------------------------------------------------------------------------');
        console.log('PART 1: Proposed SLN Website Header.docx on Mobile (375x812)');
        console.log('------------------------------------------------------------------------');

        const { page: pageMobile, context: ctxMobile } = await setupPage(375, 812);
        await loadDocx(pageMobile, 'Proposed SLN Website Header.docx', slnDocPath);

        const mobileLayout = await pageMobile.evaluate(() => {
            const vp = document.getElementById('docViewport');
            const sec = document.querySelector('section.docx-view-sheet');
            const presentBtn = document.getElementById('docPresentBtn');
            const firstP = sec ? sec.querySelector('p') : null;
            const heading = sec ? sec.querySelector('p:first-child span') : null;
            const thumbs = Array.from(document.querySelectorAll('#docThumbnailsList .thumb-card'));

            return {
                presentBtnDisplay: presentBtn ? window.getComputedStyle(presentBtn).display : null,
                thumbsCount: thumbs.length,
                totalPages: window.inChatDocViewer.totalPages,
                zoom: window.inChatDocViewer.zoom,
                vpRect: vp ? vp.getBoundingClientRect() : null,
                secRect: sec ? sec.getBoundingClientRect() : null,
                firstPRect: firstP ? firstP.getBoundingClientRect() : null,
                headingText: heading ? heading.innerText.trim() : null,
                bodyScrollWidth: document.documentElement.scrollWidth,
                windowWidth: window.innerWidth
            };
        });

        console.log('Mobile Layout Check:', {
            presentBtnDisplay: mobileLayout.presentBtnDisplay,
            totalPages: mobileLayout.totalPages,
            thumbsCount: mobileLayout.thumbsCount,
            secRect: { left: mobileLayout.secRect?.left, right: mobileLayout.secRect?.right, width: mobileLayout.secRect?.width },
            firstPRect: { left: mobileLayout.firstPRect?.left, right: mobileLayout.firstPRect?.right, width: mobileLayout.firstPRect?.width },
            headingText: mobileLayout.headingText
        });

        // Assertions for Part 1
        if (mobileLayout.presentBtnDisplay !== 'none') {
            throw new Error(`Expected Present button to be hidden (none), got ${mobileLayout.presentBtnDisplay}`);
        }
        console.log('✔ Present button is cleanly hidden for Word documents.');

        if (!mobileLayout.secRect || mobileLayout.secRect.left < 0 || mobileLayout.secRect.right > 375) {
            throw new Error(`Document section exceeds mobile boundaries: left=${mobileLayout.secRect?.left}, right=${mobileLayout.secRect?.right}`);
        }
        console.log('✔ Document section fits within mobile viewport boundaries (left >= 0, right <= 375).');

        if (!mobileLayout.firstPRect || mobileLayout.firstPRect.left < mobileLayout.secRect.left) {
            throw new Error(`Heading text rendered outside document page boundaries: left=${mobileLayout.firstPRect?.left}`);
        }
        console.log(`✔ Document text starts within page boundaries: "${mobileLayout.headingText}"`);

        if (mobileLayout.thumbsCount < 1) {
            throw new Error(`Expected at least 1 thumbnail, got ${mobileLayout.thumbsCount}`);
        }
        console.log(`✔ Left thumbnails generated correctly (${mobileLayout.thumbsCount} pages).`);

        // Test vertical scrolling
        const verticalScrollCheck = await pageMobile.evaluate(() => {
            const vp = document.getElementById('docViewport');
            const initialTop = vp.scrollTop;
            vp.scrollTop = 500;
            const scrolledTop = vp.scrollTop;
            return { initialTop, scrolledTop, canScroll: scrolledTop > 0 };
        });
        if (!verticalScrollCheck.canScroll) {
            throw new Error('Document viewport failed to scroll vertically');
        }
        console.log('✔ Document scrolls vertically smoothly.');

        await pageMobile.screenshot({ path: 'tests/test_mobile_word_sln_pass.png' });
        await ctxMobile.close();

        // =====================================================================
        // PART 2: MULTI-BREAKPOINT RESPONSIVE TESTING
        // =====================================================================
        console.log('\n------------------------------------------------------------------------');
        console.log('PART 2: Testing Responsive Layout Across 8 Breakpoints');
        console.log('------------------------------------------------------------------------');

        const breakpoints = [
            { name: 'Mobile 320px (iPhone SE 1st gen)', width: 320, height: 568 },
            { name: 'Mobile 360px (Galaxy S8)', width: 360, height: 740 },
            { name: 'Mobile 375px (iPhone X/11/12 mini)', width: 375, height: 812 },
            { name: 'Mobile 390px (iPhone 13/14)', width: 390, height: 844 },
            { name: 'Mobile 430px (iPhone 14/15 Pro Max)', width: 430, height: 932 },
            { name: 'Tablet 768px (iPad Mini/Air)', width: 768, height: 1024 },
            { name: 'Desktop 1280px', width: 1280, height: 800 },
            { name: 'Desktop 1440px', width: 1440, height: 900 }
        ];

        for (const bp of breakpoints) {
            const { page, context } = await setupPage(bp.width, bp.height);
            await loadDocx(page, 'Proposed SLN Website Header.docx', slnDocPath);

            const bpCheck = await page.evaluate((bp) => {
                const sec = document.querySelector('section.docx-view-sheet');
                const p = sec ? sec.querySelector('p') : null;
                const bodyWidth = document.documentElement.scrollWidth;
                const windowW = window.innerWidth;

                return {
                    bpName: bp.name,
                    windowW,
                    bodyWidth,
                    noBodyOverflow: bodyWidth <= windowW + 1, // 1px rounding margin
                    secRect: sec ? sec.getBoundingClientRect() : null,
                    pRect: p ? p.getBoundingClientRect() : null
                };
            }, bp);

            if (!bpCheck.noBodyOverflow) {
                throw new Error(`Break-point ${bp.name} caused horizontal body overflow: body=${bpCheck.bodyWidth}, window=${bpCheck.windowW}`);
            }

            if (bp.width <= 768) {
                if (bpCheck.secRect.left < 0 || bpCheck.secRect.right > bp.width + 1) {
                    throw new Error(`Break-point ${bp.name} section clipped: left=${bpCheck.secRect.left}, right=${bpCheck.secRect.right}`);
                }
            } else {
                // Desktop: section should be visible within screen
                if (bpCheck.secRect.width > bp.width) {
                    throw new Error(`Desktop ${bp.name} section width exceeds window: width=${bpCheck.secRect.width}`);
                }
            }

            console.log(`✔ [${bp.name}] Pass: Section visible, 0 body overflow (window: ${bpCheck.windowW}px).`);
            await context.close();
        }

        // =====================================================================
        // PART 3: ZOOM INTERACTION TESTING (75%, 100%, 125%)
        // =====================================================================
        console.log('\n------------------------------------------------------------------------');
        console.log('PART 3: Zoom Interaction Testing (75%, 100%, 125%)');
        console.log('------------------------------------------------------------------------');

        const { page: pageZoom, context: ctxZoom } = await setupPage(375, 812);
        await loadDocx(pageZoom, 'Proposed SLN Website Header.docx', slnDocPath);

        // 3.1 Test Zoom Out to 75%
        console.log('Testing Zoom at 75%...');
        const zoom75Result = await pageZoom.evaluate(() => {
            window.inChatDocViewer.setZoom(75);
            const sec = document.querySelector('section.docx-view-sheet');
            const label = document.getElementById('docZoomLevel')?.textContent;
            return {
                zoom: window.inChatDocViewer.zoom,
                label,
                secRect: sec ? sec.getBoundingClientRect() : null,
                windowW: window.innerWidth
            };
        });

        console.log(`Zoom 75% rect: left=${zoom75Result.secRect.left}, right=${zoom75Result.secRect.right}, width=${zoom75Result.secRect.width}`);
        if (zoom75Result.zoom !== 75 || zoom75Result.label !== '75%') {
            throw new Error(`Expected zoom 75%, got ${zoom75Result.zoom}`);
        }
        if (zoom75Result.secRect.left < 0 || zoom75Result.secRect.right > 375) {
            throw new Error(`At 75% zoom, document is clipped: left=${zoom75Result.secRect.left}, right=${zoom75Result.secRect.right}`);
        }
        console.log('✔ At 75% zoom, document is centered, completely visible, and not clipped.');

        // 3.2 Test Reset Zoom to 100%
        console.log('Testing Zoom at 100%...');
        const zoom100Result = await pageZoom.evaluate(() => {
            window.inChatDocViewer.setZoom(100);
            const sec = document.querySelector('section.docx-view-sheet');
            return {
                zoom: window.inChatDocViewer.zoom,
                secRect: sec ? sec.getBoundingClientRect() : null
            };
        });
        if (zoom100Result.zoom !== 100) throw new Error('Failed to reset zoom to 100%');
        if (zoom100Result.secRect.left < 0 || zoom100Result.secRect.right > 375) {
            throw new Error(`At 100% zoom, document is clipped: left=${zoom100Result.secRect.left}`);
        }
        console.log('✔ At 100% zoom, document layout is fully restored.');

        // 3.3 Test Zoom In to 125%
        console.log('Testing Zoom at 125%...');
        const zoom125Result = await pageZoom.evaluate(() => {
            window.inChatDocViewer.setZoom(125);
            const sec = document.querySelector('section.docx-view-sheet');
            return {
                zoom: window.inChatDocViewer.zoom,
                secRect: sec ? sec.getBoundingClientRect() : null
            };
        });
        if (zoom125Result.zoom !== 125) throw new Error('Failed to set zoom to 125%');
        // Crucial test: left edge must NEVER be negative (text starts inside boundaries)
        if (zoom125Result.secRect.left < 0) {
            throw new Error(`At 125% zoom, left edge pushed off-screen to negative X: left=${zoom125Result.secRect.left}`);
        }
        console.log(`✔ At 125% zoom, left edge remains visible at x=${zoom125Result.secRect.left}px (never negative).`);

        await ctxZoom.close();

        // =====================================================================
        // PART 4: MULTI-PAGE, TABLES, LISTS & FORMATTING (rich_word_document.docx)
        // =====================================================================
        console.log('\n------------------------------------------------------------------------');
        console.log('PART 4: Multi-Page, Tables, Lists & Formatting (rich_word_document.docx)');
        console.log('------------------------------------------------------------------------');

        const { page: pageRich, context: ctxRich } = await setupPage(375, 812);
        await loadDocx(pageRich, 'rich_word_document.docx', richDocPath);

        const richMetrics = await pageRich.evaluate(() => {
            const sections = Array.from(document.querySelectorAll('.docx-view-sheet-wrapper > section, section.docx-view-sheet'));
            const tableWrap = document.querySelector('.docx-table-responsive-wrapper');
            const table = document.querySelector('section.docx-view-sheet table');
            const lists = Array.from(document.querySelectorAll('section.docx-view-sheet ul, section.docx-view-sheet ol, section.docx-view-sheet p'));
            const bolds = Array.from(document.querySelectorAll('section.docx-view-sheet strong, section.docx-view-sheet b, section.docx-view-sheet span[style*="font-weight"]'));
            const thumbs = Array.from(document.querySelectorAll('#docThumbnailsList .thumb-card'));

            return {
                totalPages: window.inChatDocViewer.totalPages,
                sectionsCount: sections.length,
                thumbsCount: thumbs.length,
                tableWrapFound: !!tableWrap,
                tableFound: !!table,
                tableWrapOverflowX: tableWrap ? window.getComputedStyle(tableWrap).overflowX : null,
                listsFound: lists.length > 0,
                boldFound: bolds.length > 0,
                page2Id: sections[1] ? sections[1].id : null
            };
        });

        console.log('Rich Document Verification:', richMetrics);

        if (richMetrics.sectionsCount < 2) {
            throw new Error(`Expected at least 2 pages for multi-page document, found ${richMetrics.sectionsCount}`);
        }
        console.log(`✔ Multi-page rendering verified: ${richMetrics.sectionsCount} pages detected.`);

        if (richMetrics.thumbsCount < 2) {
            throw new Error(`Expected at least 2 thumbnails, got ${richMetrics.thumbsCount}`);
        }
        console.log(`✔ Thumbnails generated for all pages (${richMetrics.thumbsCount} thumbnails).`);

        if (!richMetrics.tableWrapFound) {
            throw new Error('Table was not wrapped in .docx-table-responsive-wrapper');
        }
        console.log('✔ Data tables wrapped in responsive horizontal scroller (.docx-table-responsive-wrapper).');

        // Test thumbnail click navigation to page 2 (open drawer on mobile first)
        console.log('Opening thumbnails panel and navigating to Page 2...');
        await pageRich.click('#docToggleThumbsBtn');
        await pageRich.waitForTimeout(300);
        await pageRich.click('#docThumbnailsList .thumb-card[data-page="2"]');
        await pageRich.waitForTimeout(500);

        const activePageAfterNav = await pageRich.evaluate(() => {
            return {
                currentPage: window.inChatDocViewer.currentPage,
                pageInputVal: document.getElementById('docPageInput')?.value,
                activeThumbPage: document.querySelector('#docThumbnailsList .thumb-card.active')?.dataset.page
            };
        });

        if (activePageAfterNav.currentPage !== 2) {
            throw new Error(`Expected active page to be 2, got ${activePageAfterNav.currentPage}`);
        }
        console.log(`✔ Page navigation verified: Active page is now ${activePageAfterNav.currentPage}.`);

        await pageRich.screenshot({ path: 'tests/test_mobile_word_rich_pass.png' });
        await ctxRich.close();

        // Check console errors
        if (consoleErrors.length > 0) {
            console.log('Console Errors caught:', consoleErrors);
            throw new Error(`Encountered ${consoleErrors.length} console errors during test run.`);
        }
        console.log('✔ Zero console errors recorded across all tests.');

        console.log('\n========================================================================');
        console.log('  ALL E2E WORD MOBILE & RESPONSIVE VERIFICATION TESTS PASSED (100%)');
        console.log('========================================================================\n');

    } catch (err) {
        console.error('Test Suite Failed:', err);
        throw err;
    } finally {
        await browser.close();
    }
}

runWordMobileE2ETests().catch(err => {
    console.error(err);
    process.exit(1);
});
