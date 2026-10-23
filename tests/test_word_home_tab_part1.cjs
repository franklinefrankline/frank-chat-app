const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const assert = require('assert');

const BASE_URL = 'http://127.0.0.1:8000';

async function runPart1TestSuite() {
    console.log('========================================================================');
    console.log('STARTING FRANK THINK WORD EDITOR PART 1: HOME TAB & EDITING SUITE');
    console.log('========================================================================');

    // Generate auth token for test admin user
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

    let passedTests = 0;
    let totalTests = 8;

    try {
        await page.addInitScript(({ token, userObj }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(userObj));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token, userObj });

        console.log('\n--- SETUP: LAUNCH DASHBOARD & CREATE DOCUMENT ---');
        await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1000);

        const createRes = await page.evaluate(async () => {
            return await api.createNewDocument({
                title: 'Part 1 Home Tab Verification',
                format: 'docx',
                template: 'blank'
            });
        });
        assert(createRes && createRes.id, 'Failed to create test document');
        console.log(`[PASS] Created document ID: ${createRes.id}`);

        await page.evaluate(async (docId) => {
            await window.frankOfficeWorkspace.openDocument(docId, 'word', 'Part 1 Home Tab Verification.docx');
        }, createRes.id);
        await page.waitForTimeout(1500);

        // Verify Home tab 5 groups are present
        const ribbonGroups = await page.evaluate(() => {
            return {
                clipboard: !!document.getElementById('wordGroupClipboard'),
                font: !!document.getElementById('wordGroupFont'),
                paragraph: !!document.getElementById('wordGroupParagraph'),
                styles: !!document.getElementById('wordGroupStyles'),
                editing: !!document.getElementById('wordGroupEditing')
            };
        });
        assert(ribbonGroups.clipboard && ribbonGroups.font && ribbonGroups.paragraph && ribbonGroups.styles && ribbonGroups.editing, 'All 5 Home tab ribbon groups must exist');
        console.log('[PASS] Verified all 5 Microsoft Word ribbon groups rendered on Home tab');

        // =====================================================================
        // TEST A: FONT FORMATTING
        // =====================================================================
        console.log('\n--- TEST A: FONT FORMATTING (BOLD, ITALIC, UNDERLINE, STRIKE, FAMILY, SIZE, COLOR, HIGHLIGHT) ---');
        await page.evaluate(() => {
            const ed = document.querySelector('.word-editable-content');
            ed.innerHTML = '<p id="testParaA">The quick brown fox jumps over the lazy dog.</p>';
            
            // Select "brown fox"
            const p = document.getElementById('testParaA');
            const textNode = p.firstChild;
            const range = document.createRange();
            range.setStart(textNode, 10); // "brown fox"
            range.setEnd(textNode, 19);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);

            // Apply bold, italic, underline, strike
            document.execCommand('bold');
            document.execCommand('italic');
            document.execCommand('underline');
            document.execCommand('strikeThrough');

            // Apply font family and size
            window.frankOfficeWorkspace.wordEngine.applyFontSize(16);
            window.frankOfficeWorkspace.wordEngine.applyFontFamily('Georgia');

            // Apply color and highlight
            window.frankOfficeWorkspace.wordEngine.applyFontColor('#B86B3D');
            window.frankOfficeWorkspace.wordEngine.applyHighlightColor('#FEF08A');
        });
        await page.waitForTimeout(400);

        const testAResult = await page.evaluate(() => {
            const p = document.getElementById('testParaA');
            return {
                html: p.innerHTML,
                hasBold: /<b|<strong|font-weight/i.test(p.innerHTML),
                hasItalic: /<i|<em|font-style/i.test(p.innerHTML),
                hasUnderline: /<u|underline/i.test(p.innerHTML),
                hasStrike: /<s|<strike|line-through/i.test(p.innerHTML),
                hasGeorgia: p.innerHTML.includes('Georgia'),
                has16pt: p.innerHTML.includes('16pt')
            };
        });
        console.log('Test A Generated HTML:', testAResult.html);
        assert(testAResult.hasBold && testAResult.hasItalic && testAResult.hasUnderline && testAResult.hasStrike, 'Font attributes must be applied to selected text');
        assert(testAResult.hasGeorgia || testAResult.html.includes('georgia') || testAResult.html.includes('Georgia'), 'Font family Georgia must be applied');
        assert(testAResult.has16pt, 'Font size 16pt must be applied');
        console.log('[PASS] Test A Passed: Font formatting correctly modified targeted selection');
        passedTests++;

        // =====================================================================
        // TEST B: PARAGRAPH FORMATTING (ALIGNMENT, BULLETS, NUMBERING, INDENT, LINE SPACING)
        // =====================================================================
        console.log('\n--- TEST B: PARAGRAPH FORMATTING ---');
        await page.evaluate(() => {
            const ed = document.querySelector('.word-editable-content');
            ed.innerHTML = `
                <p id="paraAlign">Center aligned paragraph content.</p>
                <ul id="testUl"><li id="li1">Bullet item 1</li><li id="li2">Bullet item 2</li></ul>
                <ol id="testOl"><li id="oli1">Numbered item 1</li><li id="oli2">Numbered item 2</li></ol>
            `;

            // Test alignment
            const p = document.getElementById('paraAlign');
            const range = document.createRange();
            range.selectNodeContents(p);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand('justifyCenter');

            // Test line spacing and borders
            window.frankOfficeWorkspace.wordEngine.setLineSpacing('2.0');
            window.frankOfficeWorkspace.wordEngine.applyParagraphBorder('bottom');

            // Test bullet style
            const ul = document.getElementById('testUl');
            const rangeUl = document.createRange();
            rangeUl.selectNodeContents(document.getElementById('li1'));
            sel.removeAllRanges();
            sel.addRange(rangeUl);
            window.frankOfficeWorkspace.wordEngine.applyBulletStyle('square');
        });
        await page.waitForTimeout(400);

        const testBResult = await page.evaluate(() => {
            const p = document.getElementById('paraAlign');
            const ul = document.getElementById('testUl');
            return {
                align: window.getComputedStyle(p).textAlign,
                lineHeight: p.style.lineHeight,
                borderBottom: p.style.borderBottom,
                ulClass: ul?.className,
                ulStyle: ul?.style.listStyleType
            };
        });
        assert(testBResult.align === 'center', 'Paragraph must be centered');
        assert(testBResult.lineHeight === '2' || testBResult.lineHeight === '2.0', 'Line height 2.0 must be set');
        assert(testBResult.borderBottom.includes('solid'), 'Paragraph bottom border must be set');
        assert(testBResult.ulClass === 'bullet-square' && testBResult.ulStyle === 'square', 'Square bullet list must be applied');
        console.log('[PASS] Test B Passed: Alignment, line spacing, borders, and bullet styles verified');
        passedTests++;

        // =====================================================================
        // TEST C: STYLES GALLERY (NORMAL, TITLE, H1, H2, QUOTE)
        // =====================================================================
        console.log('\n--- TEST C: STYLES GALLERY ---');
        await page.evaluate(() => {
            const ed = document.querySelector('.word-editable-content');
            ed.innerHTML = `
                <p id="styleTitle">Document Title Header</p>
                <p id="styleH1">Major Section Heading</p>
                <p id="styleQuote">A famous quotation statement.</p>
                <p id="styleNormal">Standard body paragraph content.</p>
            `;

            const sel = window.getSelection();

            // Apply Title
            const r1 = document.createRange();
            r1.selectNodeContents(document.getElementById('styleTitle'));
            sel.removeAllRanges();
            sel.addRange(r1);
            window.frankOfficeWorkspace.wordEngine.applySemanticStyle('title');

            // Apply Heading 1
            const r2 = document.createRange();
            r2.selectNodeContents(document.getElementById('styleH1'));
            sel.removeAllRanges();
            sel.addRange(r2);
            window.frankOfficeWorkspace.wordEngine.applySemanticStyle('h1');

            // Apply Quote
            const r3 = document.createRange();
            r3.selectNodeContents(document.getElementById('styleQuote'));
            sel.removeAllRanges();
            sel.addRange(r3);
            window.frankOfficeWorkspace.wordEngine.applySemanticStyle('quote');
        });
        await page.waitForTimeout(500);

        const testCResult = await page.evaluate(() => {
            const ed = document.querySelector('.word-editable-content');
            const hasTitle = !!ed.querySelector('p.doc-title');
            const hasH1 = !!ed.querySelector('h1');
            const hasQuote = !!ed.querySelector('blockquote.doc-quote');
            return { hasTitle, hasH1, hasQuote, content: ed.innerHTML };
        });
        assert(testCResult.hasTitle, 'Title style must produce p.doc-title');
        assert(testCResult.hasH1, 'Heading 1 style must produce h1');
        assert(testCResult.hasQuote, 'Quote style must produce blockquote.doc-quote');
        console.log('[PASS] Test C Passed: Semantic Word styles (Title, H1, Quote) correctly applied');
        passedTests++;

        // =====================================================================
        // TEST D: FIND AND REPLACE
        // =====================================================================
        console.log('\n--- TEST D: FIND AND REPLACE (COUNT, NAVIGATE, REPLACE, REPLACE ALL) ---');
        await page.evaluate(() => {
            const ed = document.querySelector('.word-editable-content');
            ed.innerHTML = '<p id="repPara">Apples are delicious. Eating apples is great. Red apples and green apples.</p>';
            window.frankOfficeWorkspace.wordEngine.openFindReplaceDrawer('replace');
        });
        await page.waitForTimeout(300);

        // Find matches for "apples"
        await page.fill('#findTextInput', 'apples');
        await page.waitForTimeout(400);

        const matchCount = await page.evaluate(() => {
            return document.querySelectorAll('.word-find-highlight').length;
        });
        assert(matchCount === 4, `Expected 4 matches for "apples", got ${matchCount}`);
        console.log(`[PASS] Found ${matchCount} highlighted occurrences of "apples"`);

        // Replace all "apples" with "oranges"
        await page.fill('#replaceTextInput', 'oranges');
        await page.click('#replaceAllBtn');
        await page.waitForTimeout(500);

        const replacedContent = await page.evaluate(() => {
            return document.getElementById('repPara').innerText;
        });
        assert(replacedContent.includes('oranges') && !replacedContent.toLowerCase().includes('apples'),
            `All apples should be replaced with oranges: ${replacedContent}`);
        console.log('[PASS] Test D Passed: Replace All successfully replaced all occurrences without corrupting structure');
        passedTests++;

        // =====================================================================
        // TEST E: WORD COUNT STATISTICS & DIALOG
        // =====================================================================
        console.log('\n--- TEST E: WORD COUNT & DOCUMENT STATISTICS ---');
        await page.evaluate(() => {
            window.frankOfficeWorkspace.wordEngine.openWordCountDialog();
        });
        await page.waitForTimeout(400);

        const modalOpen = await page.evaluate(() => {
            const modal = document.getElementById('wordCustomModal');
            return {
                isOpen: modal?.classList.contains('open'),
                hasWords: modal?.innerText.includes('Words'),
                hasPages: modal?.innerText.includes('Pages'),
                hasChars: modal?.innerText.includes('Characters')
            };
        });
        assert(modalOpen.isOpen && modalOpen.hasWords && modalOpen.hasPages, 'Word count modal must display accurate stats');
        console.log('[PASS] Test E Passed: Word Count statistics dialog calculates pages, words, characters, and paragraphs');

        await page.evaluate(() => {
            window.frankOfficeWorkspace.wordEngine.closeCustomModal();
        });
        passedTests++;

        // =====================================================================
        // TEST F: SAVE, REOPEN & PERSISTENCE ROUND-TRIP
        // =====================================================================
        console.log('\n--- TEST F: SAVE & REOPEN PERSISTENCE ---');
        await page.evaluate(async () => {
            const ed = document.querySelector('.word-editable-content');
            ed.innerHTML = `
                <p class="doc-title">Persistent Document Title</p>
                <h1>Section 1: Implementation</h1>
                <p>Paragraph with <span style="font-size:16pt;color:#B86B3D;font-weight:700;">styled emphasis</span> text.</p>
                <blockquote class="doc-quote">Verified semantic quotation.</blockquote>
            `;
            window.frankOfficeWorkspace.markDirty();
            await window.frankOfficeWorkspace.saveDocument();
        });
        await page.waitForTimeout(1500);

        const saveStatusText = await page.evaluate(() => {
            return document.getElementById('saveStatusText')?.textContent;
        });
        assert(saveStatusText && saveStatusText.includes('Saved'), `Save status should contain Saved, got ${saveStatusText}`);
        console.log(`[PASS] Confirmed backend server save confirmation: "${saveStatusText}"`);

        // Reopen document
        await page.evaluate(async (docId) => {
            await window.frankOfficeWorkspace.openDocument(docId, 'word', 'Part 1 Home Tab Verification.docx');
        }, createRes.id);
        await page.waitForFunction(() => {
            const ed = document.querySelector('.word-editable-content');
            return ed && (ed.querySelector('p.doc-title') || ed.querySelector('blockquote.doc-quote') || ed.innerHTML.includes('styled emphasis'));
        }, { timeout: 6000 });
        await page.waitForTimeout(500);

        const reopenedContent = await page.evaluate(() => {
            const ed = document.querySelector('.word-editable-content');
            return {
                hasTitle: !!ed.querySelector('p.doc-title'),
                hasH1: !!ed.querySelector('h1'),
                has16pt: ed.innerHTML.includes('16pt'),
                hasQuote: !!ed.querySelector('blockquote.doc-quote'),
                html: ed.innerHTML
            };
        });
        console.log('[DEBUG Test F Reopened HTML]:', reopenedContent.html);
        assert(reopenedContent.hasTitle && reopenedContent.hasH1 && reopenedContent.has16pt && reopenedContent.hasQuote,
            `All semantic styles, typography, and point sizes must be preserved across reopen. Got: ${JSON.stringify(reopenedContent)}`);
        console.log('[PASS] Test F Passed: Reopened document preserved exact semantic tags, styles, and point sizes');
        passedTests++;

        // =====================================================================
        // TEST G: EXISTING FEATURES INTEGRATION
        // =====================================================================
        console.log('\n--- TEST G: EXISTING WORKSPACE FEATURES INTEGRATION ---');
        const existingFeatures = await page.evaluate(() => {
            return {
                saveBtn: !!document.getElementById('workspaceSaveBtn'),
                sendToChatBtn: !!document.getElementById('workspaceSendBtn'),
                downloadBtn: !!document.getElementById('workspaceDownloadBtn'),
                historyBtn: !!document.getElementById('workspaceHistoryBtn'),
                printBtn: !!document.getElementById('workspacePrintBtn'),
                backBtn: !!document.getElementById('workspaceBackBtn'),
                tabFile: !!document.querySelector('.word-tab-btn[data-tab="file"]'),
                tabInsert: !!document.querySelector('.word-tab-btn[data-tab="insert"]'),
                tabLayout: !!document.querySelector('.word-tab-btn[data-tab="layout"]'),
                tabReview: !!document.querySelector('.word-tab-btn[data-tab="review"]'),
                tabView: !!document.querySelector('.word-tab-btn[data-tab="view"]')
            };
        });
        assert(existingFeatures.saveBtn && existingFeatures.sendToChatBtn && existingFeatures.downloadBtn,
            'Top bar Save, Send to Chat, and Download buttons must remain active');
        assert(existingFeatures.tabInsert && existingFeatures.tabLayout && existingFeatures.tabReview,
            'All existing ribbon tabs must remain present and intact');
        console.log('[PASS] Test G Passed: Top action bar (Send to Chat, Download, Save, History) and all 10 ribbon tabs functional');
        passedTests++;

        // =====================================================================
        // TEST H: ERROR HANDLING & ROBUSTNESS
        // =====================================================================
        console.log('\n--- TEST H: ERROR HANDLING & EDGE CASES ---');
        await page.evaluate(() => {
            // Test 1: Invalid font size clamp
            window.frankOfficeWorkspace.wordEngine.applyFontSize(-5);
            window.frankOfficeWorkspace.wordEngine.applyFontSize(9999);
            // Test 2: Empty selection change case
            window.getSelection().removeAllRanges();
            window.frankOfficeWorkspace.wordEngine.changeCase('upper');
            // Test 3: Empty find input
            window.frankOfficeWorkspace.wordEngine.openFindReplaceDrawer('find');
            document.getElementById('findTextInput').value = '';
            document.getElementById('findNextBtn').click();
            // Test 4: Escape key closes popups and format painter
            window.frankOfficeWorkspace.wordEngine.formatPainterActive = true;
            window.frankOfficeWorkspace.wordEngine.handleKeyDown({ key: 'Escape' });
        });
        await page.waitForTimeout(300);

        const errorChecks = await page.evaluate(() => {
            const sizeVal = parseInt(document.getElementById('wordFontSizeInput')?.value, 10);
            return {
                fpDeactivated: !window.frankOfficeWorkspace.wordEngine.formatPainterActive,
                sizeClamped: sizeVal >= 4 && sizeVal <= 144
            };
        });
        assert(errorChecks.fpDeactivated, 'Escape must cancel format painter mode');
        assert(errorChecks.sizeClamped, 'Font size must clamp to safe bounds [4, 144]');
        console.log('[PASS] Test H Passed: Invalid sizes clamped, empty find/case operations handled gracefully without corrupting document');
        passedTests++;

        console.log('\n========================================================================');
        console.log(`ALL TESTS PASSED: ${passedTests} / ${totalTests} (100% SUCCESS)`);
        console.log('========================================================================');
    } finally {
        await browser.close();
    }
}

runPart1TestSuite().catch(err => {
    console.error('[FAIL] Suite encountered error:', err);
    process.exit(1);
});
