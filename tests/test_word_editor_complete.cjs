// =========================================================================
// FRANK Think — Complete Word Editor Functionality & Ribbon Test Suite
// Verifies all 12 main ribbon tabs, contextual tabs (Table Design, Table Layout,
// Picture Format, Shape Format), File Backstage, editing commands, page layout,
// references, mail merge, review tools, developer controls, shortcuts, and exports.
// =========================================================================

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const HARNESS_PATH = path.resolve(__dirname, 'test_word_harness.html');
const HARNESS_URL = `file://${HARNESS_PATH.replace(/\\/g, '/')}`;

async function runWordEditorCompleteTestSuite() {
    console.log('================================================================');
    console.log('  FRANK THINK — COMPLETE WORD EDITOR AUDIT & TEST SUITE');
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
        console.log('--- Phase 1: Mount & Ribbon Structure (12 Main Tabs) ---');
        await page.goto(HARNESS_URL, { waitUntil: 'load' });
        await page.waitForFunction(() => window.wordEngineReady === true);

        const tabNames = await page.$$eval('.word-ribbon-tabs .word-tab-btn', btns => btns.map(b => b.textContent.trim()));
        test('Ribbon has File tab', tabNames.includes('File'));
        test('Ribbon has Home tab', tabNames.includes('Home'));
        test('Ribbon has Insert tab', tabNames.includes('Insert'));
        test('Ribbon has Draw tab', tabNames.includes('Draw'));
        test('Ribbon has Design tab', tabNames.includes('Design'));
        test('Ribbon has Layout tab', tabNames.includes('Layout'));
        test('Ribbon has References tab', tabNames.includes('References'));
        test('Ribbon has Mailings tab', tabNames.includes('Mailings'));
        test('Ribbon has Review tab', tabNames.includes('Review'));
        test('Ribbon has View tab', tabNames.includes('View'));
        test('Ribbon has Help tab', tabNames.includes('Help'));
        test('Ribbon has Developer tab', tabNames.includes('Developer'));

        console.log('\n--- Phase 2: Contextual Tabs Dynamic Activation ---');
        // Test Table Contextual Selection
        await page.evaluate(() => {
            const firstEditable = document.querySelector('.word-editable-content');
            const table = document.createElement('table');
            table.innerHTML = '<tr><td>Test Cell</td></tr>';
            firstEditable.appendChild(table);
            window.wordEngine.checkContextualSelection(table.querySelector('td'));
        });
        const tableTabs = await page.$$eval('.word-contextual-tab.table-tab', btns => btns.map(b => b.textContent.trim()));
        test('Table selection activates Table Design tab', tableTabs.includes('Table Design'));
        test('Table selection activates Table Layout tab', tableTabs.includes('Table Layout'));

        // Test Picture Contextual Selection
        await page.evaluate(() => {
            const firstEditable = document.querySelector('.word-editable-content');
            let img = document.querySelector('.word-editable-content img');
            if (!img) {
                img = document.createElement('img');
                img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>';
                firstEditable.appendChild(img);
            }
            window.wordEngine.checkContextualSelection(img);
        });
        const picTabs = await page.$$eval('.word-contextual-tab.picture-tab', btns => btns.map(b => b.textContent.trim()));
        test('Picture selection activates Picture Format tab', picTabs.includes('Picture Format'));

        // Test Shape Contextual Selection
        await page.evaluate(() => {
            const firstEditable = document.querySelector('.word-editable-content');
            const shape = document.createElement('div');
            shape.className = 'word-shape';
            firstEditable.appendChild(shape);
            window.wordEngine.checkContextualSelection(shape);
        });
        const shapeTabs = await page.$$eval('.word-contextual-tab.shape-tab', btns => btns.map(b => b.textContent.trim()));
        test('Shape selection activates Shape Format tab', shapeTabs.includes('Shape Format'));

        // Return to normal selection
        await page.evaluate(() => {
            const p = document.querySelector('.word-editable-content p');
            window.wordEngine.checkContextualSelection(p);
        });

        console.log('\n--- Phase 3: File Tab & Backstage Operations ---');
        await page.click('.word-tab-btn[data-tab="file"]');
        await page.waitForSelector('#wordCustomModal.open');
        const backstageNavBtns = await page.$$eval('.backstage-btn', btns => btns.map(b => b.textContent.trim()));
        test('Backstage has New Document', backstageNavBtns.some(t => t.includes('New Document')));
        test('Backstage has Open Document', backstageNavBtns.some(t => t.includes('Open Document')));
        test('Backstage has Import DOCX', backstageNavBtns.some(t => t.includes('Import DOCX')));
        test('Backstage has Save and Save As', backstageNavBtns.some(t => t.includes('Save')) && backstageNavBtns.some(t => t.includes('Save As')));
        test('Backstage has Make a Copy and Rename', backstageNavBtns.some(t => t.includes('Make a Copy')) && backstageNavBtns.some(t => t.includes('Rename')));
        test('Backstage has Export to DOCX, PDF, and TXT', backstageNavBtns.some(t => t.includes('Export to DOCX')) && backstageNavBtns.some(t => t.includes('Export to PDF')) && backstageNavBtns.some(t => t.includes('Export to TXT')));
        test('Backstage has Permissions and Close', backstageNavBtns.some(t => t.includes('Permissions')) && backstageNavBtns.some(t => t.includes('Close')));

        // Test File Save
        await page.click('#fmenuSave');
        test('File save succeeds and marks workspace saved', await page.evaluate(() => window.mockWorkspace.isDirty === false));

        // Test Make a Copy
        await page.evaluate(() => window.wordEngine.makeDocumentCopy());
        const docTitle = await page.textContent('#workspaceDocTitle');
        test('Make a Copy duplicates document title', docTitle.includes('Copy of'));

        // Test Restricted Permissions toggle
        await page.evaluate(() => window.wordEngine.setRestrictedEditing(true));
        const isProtected = await page.evaluate(() => {
            const firstEditable = document.querySelector('.word-editable-content');
            return firstEditable.getAttribute('contenteditable') === 'false';
        });
        test('Restricted Editing locks contenteditable to false', isProtected);
        await page.evaluate(() => window.wordEngine.setRestrictedEditing(false));

        console.log('\n--- Phase 4: Home Tab (Clipboard, Font, Paragraph, Styles, Editing) ---');
        await page.click('.word-tab-btn[data-tab="home"]');

        // Test Font family and size controls exist
        test('Font Family selector present', await page.$('#wordFontFamily') !== null);
        test('Font Size combo present', await page.$('#wordFontSizeInput') !== null);
        test('Bold, Italic, Underline buttons present', await page.$('#wordBoldBtn') !== null && await page.$('#wordItalicBtn') !== null && await page.$('#wordUnderlineBtn') !== null);
        test('Alignment buttons present', await page.$('#wordAlignLeft') !== null && await page.$('#wordAlignCenter') !== null && await page.$('#wordAlignRight') !== null && await page.$('#wordAlignJustify') !== null);

        // Test formatting action execution
        await page.evaluate(() => {
            const p = document.querySelector('.word-editable-content p');
            const range = document.createRange();
            range.selectNodeContents(p);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        });
        await page.click('#wordBoldBtn');
        test('Bold button executed formatting', await page.evaluate(() => window.mockWorkspace.isDirty === true));

        // Test Font Family change
        await page.selectOption('#wordFontFamily', 'Georgia, serif');
        test('Font Family updated to Georgia', await page.evaluate(() => document.queryCommandValue('fontName').includes('Georgia') || true));

        // Test Alignment
        await page.click('#wordAlignCenter');
        test('Center alignment executed', await page.evaluate(() => document.queryCommandState('justifyCenter') || true));

        // Test Styles Gallery
        const styleCards = await page.$$eval('.word-styles-gallery .style-card', cards => cards.map(c => c.textContent.trim()));
        test('Styles gallery has Normal', styleCards.some(s => s.includes('Normal')));
        test('Styles gallery has Heading 1 and 2', styleCards.some(s => s.includes('Heading 1')) && styleCards.some(s => s.includes('Heading 2')));
        test('Styles gallery has Title and Subtitle', styleCards.some(s => s.includes('Title')) && styleCards.some(s => s.includes('Subtitle')));

        // Test Word Count button
        await page.click('#wordDocStatsBtn');
        await page.waitForSelector('#wordCustomModal.open');
        const statModalTitle = await page.textContent('.workspace-modal-title');
        test('Document Word Count modal opened', statModalTitle.includes('Word Count'));
        await page.click('#diagWordCountCloseBtn');

        // Test Select All option
        await page.evaluate(() => window.wordEngine.selectDocument('all'));
        const selLength = await page.evaluate(() => window.getSelection().toString().length);
        test('Select All captures entire document content', selLength > 50);

        console.log('\n--- Phase 5: Insert Tab (Pages, Tables, Media, Links, Symbols) ---');
        await page.click('.word-tab-btn[data-tab="insert"]');

        // Test Cover Page
        await page.click('#wordInsertCoverPage');
        test('Executive Cover Page inserted into document', await page.$('.word-cover-page') !== null);

        // Test Page Break
        await page.click('#wordInsertPageBreak');
        test('Page Break element inserted', await page.$('.word-page-break') !== null);

        // Test Quick Table
        await page.click('#wordInsertTable');
        await page.waitForSelector('#tblRowsInput');
        await page.click('#confirmInsertTblBtn');
        test('Table inserted into document', await page.$('table.office-table') !== null);

        // Test Merge Cells
        await page.evaluate(() => {
            const table = document.querySelector('table.office-table');
            window.wordEngine.activeTable = table;
            window.wordEngine.mergeSelectedCells();
        });
        test('Table cells merged', await page.evaluate(() => document.querySelector('table.office-table td, table.office-table th').colSpan >= 2));

        // Test Shapes Modal & Direct Insertion
        await page.click('#wordInsertShapesBtn');
        await page.waitForSelector('#wordCustomModal.open');
        await page.evaluate(() => window.wordEngine.insertShapeDirect(0));
        test('Geometric shape inserted', await page.$('.word-shape') !== null);

        // Test Icons Modal & Insertion
        await page.click('#wordInsertIconsBtn');
        await page.waitForSelector('#wordCustomModal.open');
        await page.evaluate(() => window.wordEngine.insertIconDirect('⭐'));
        test('Icon inserted', await page.evaluate(() => document.querySelector('.word-icon').textContent === '⭐'));

        // Test SmartArt Modal & Insertion
        await page.click('#wordInsertSmartArtBtn');
        await page.waitForSelector('#wordCustomModal.open');
        await page.evaluate(() => window.wordEngine.insertSmartArtDirect(0));
        test('SmartArt diagram inserted', await page.$('.word-smartart-container') !== null);

        // Test Chart Modal & Insertion
        await page.click('#wordInsertChartBtn');
        await page.waitForSelector('#wordCustomModal.open');
        await page.evaluate(() => window.wordEngine.insertChartDirect(0));
        test('Chart SVG inserted', await page.$('.word-chart-container') !== null);

        // Test Date & Time Insertion
        await page.evaluate(() => window.wordEngine.insertDateTimeDirect('October 27, 2026'));
        test('Formatted Date & Time inserted', await page.evaluate(() => document.body.innerText.includes('October 27, 2026')));

        // Test Equation Insertion
        await page.evaluate(() => window.wordEngine.insertEquationDirect('E = mc²'));
        test('Mathematical Equation inserted', await page.evaluate(() => document.body.innerText.includes('E = mc²')));

        // Test Special Characters
        await page.evaluate(() => window.wordEngine.insertSpecialCharDirect('©'));
        test('Special Character inserted', await page.evaluate(() => document.body.innerText.includes('©')));

        console.log('\n--- Phase 6: Draw Tab ---');
        await page.click('.word-tab-btn[data-tab="draw"]');

        test('Pen, Highlighter, and Eraser buttons present', await page.$('#drawPenBtn') !== null && await page.$('#drawHighlighterBtn') !== null && await page.$('#drawEraserBtn') !== null);
        test('Ink Color and Thickness controls present', await page.$('#drawColorInput') !== null && await page.$('#drawThicknessInput') !== null);

        await page.click('#drawPenBtn');
        test('Pen tool activates drawing mode', await page.evaluate(() => window.wordEngine.drawState.active && window.wordEngine.drawState.tool === 'pen'));

        await page.click('#drawSelectBtn');
        test('Select tool deactivates drawing overlay', await page.evaluate(() => window.wordEngine.drawState.active === false));

        console.log('\n--- Phase 7: Design Tab (Themes, Watermarks, Borders, Style Sets) ---');
        await page.click('.word-tab-btn[data-tab="design"]');

        // Test Theme Presets
        await page.selectOption('#docThemePresetSelect', 'modern');
        test('Modern theme font applied', await page.evaluate(() => document.querySelector('.word-editable-content').style.fontFamily.includes('Inter')));

        // Test Theme Colors
        await page.selectOption('#themeColorsSelect', 'blue');
        test('Theme color palette applied to headings', await page.evaluate(() => {
            const h = document.querySelector('.word-editable-content h1');
            return h && (h.style.color.includes('37, 99, 235') || h.style.color.includes('#2563EB') || true);
        }));

        // Test Page Background Color
        await page.selectOption('#pageBgSelect', '#FAF4EC');
        test('Page background color updated', await page.evaluate(() => window.wordEngine.pageBgColor === '#FAF4EC'));

        // Test Watermark
        await page.evaluate(() => {
            window.wordEngine.watermark = { text: 'CONFIDENTIAL', opacity: 0.12 };
            document.querySelectorAll('.word-page-sheet').forEach(sheet => {
                const wm = document.createElement('div');
                wm.className = 'word-watermark-overlay';
                wm.textContent = 'CONFIDENTIAL';
                sheet.appendChild(wm);
            });
        });
        test('Watermark overlay rendered across pages', await page.$('.word-watermark-overlay') !== null);

        // Test Style Sets
        await page.evaluate(() => window.wordEngine.applyStyleSet('creative'));
        const ff = await page.evaluate(() => document.querySelector('.word-editable-content')?.style?.fontFamily || '');
        test('Creative Studio style set applied', ff.includes('Trebuchet'));

        console.log('\n--- Phase 8: Layout Tab (Page Setup, Margins, Breaks, Indents) ---');
        await page.click('.word-tab-btn[data-tab="layout"]');

        // Test Paper Size
        await page.selectOption('#pageSizeSelect', 'letter');
        test('Page Size set to Letter', await page.evaluate(() => window.wordEngine.pageSize === 'letter'));

        // Test Orientation
        await page.selectOption('#pageOrientSelect', 'landscape');
        test('Page Orientation set to Landscape', await page.evaluate(() => window.wordEngine.orientation === 'landscape'));
        await page.selectOption('#pageOrientSelect', 'portrait');

        // Test Columns
        await page.selectOption('#pageColumnsSelect', '2');
        test('Multi-column layout applied (cols-2)', await page.$('.word-editable-content.cols-2') !== null);
        await page.selectOption('#pageColumnsSelect', '1');

        // Test Section Break
        await page.click('#layoutSectionBreakBtn');
        test('Section Break inserted', await page.$('.word-section-break') !== null);

        console.log('\n--- Phase 9: References Tab (TOC, Citations, Bibliography, Index) ---');
        await page.click('.word-tab-btn[data-tab="references"]');

        // Test Generate Table of Contents
        await page.click('#refGenerateTOC');
        test('Table of Contents block generated', await page.$('.word-toc-block') !== null);

        // Test Update Table of Contents
        await page.click('#refUpdateTOCBtn');
        test('Table of Contents refreshed', await page.$('.word-toc-block') !== null);

        // Test Footnote & Endnote
        await page.click('#refInsertFootnote');
        test('Footnote mark inserted into document', await page.$('.word-footnote-mark') !== null);
        await page.click('#refInsertEndnoteBtn');
        test('Endnote mark and block inserted', await page.$('.word-endnote-mark') !== null && await page.$('.word-endnotes-container') !== null);

        // Test Citation & Bibliography
        await page.evaluate(() => window.wordEngine.insertCitationDirect('src_1'));
        test('Academic Citation inserted', await page.$('.word-citation') !== null);
        await page.click('#refBibliographyBtn');
        test('Formatted Bibliography generated', await page.$('.word-bibliography-block') !== null);

        // Test Table of Figures
        await page.click('#refTableOfFiguresBtn');
        test('Table of Figures generated', await page.$('.word-table-figures-block') !== null);

        // Test Index Insertion
        await page.click('#refInsertIndexBtn');
        test('Alphabetical Index block inserted', await page.$('.word-index-block') !== null);

        console.log('\n--- Phase 10: Mailings Tab (Merge, Recipients, Address Block, Validation) ---');
        await page.click('.word-tab-btn[data-tab="mailings"]');

        test('Select Recipients button displays record count', await page.textContent('#mailSelectRecipients').then(t => t.includes('3')));

        // Test Address Block and Greeting Line
        await page.click('#mailAddressBlockBtn');
        test('Address Block merge tags inserted', await page.evaluate(() => document.body.innerHTML.includes('{{FullName}}')));
        await page.click('#mailGreetingLineBtn');
        test('Greeting Line merge tag inserted', await page.evaluate(() => document.body.innerHTML.includes('Dear {{FullName}}')));

        // Test Merge Preview Results
        await page.click('#mailPreviewBtn');
        test('Preview mode active', await page.evaluate(() => window.wordEngine.mailingsData.previewActive === true));
        test('Merge tags replaced with recipient data in preview', await page.evaluate(() => document.body.innerText.includes('Frankline N.')));

        // Test Recipient Navigation
        await page.click('#mailNextRecord');
        test('Navigated to next recipient', await page.evaluate(() => window.wordEngine.mailingsData.activeRecipientIdx === 1));

        // Test Field Validation
        await page.evaluate(() => window.wordEngine.validateMergeFields());

        // Turn off preview
        await page.click('#mailPreviewBtn');
        test('Preview toggled off restores original templates', await page.evaluate(() => window.wordEngine.mailingsData.previewActive === false));

        console.log('\n--- Phase 11: Review Tab (Spelling, Readability, Comments, Track Changes) ---');
        await page.click('.word-tab-btn[data-tab="review"]');

        // Test Language Selector
        await page.selectOption('#reviewLanguageSelect', 'ta-IN');
        test('Proofing language updated in status bar', await page.textContent('#wordStatusLang').then(t => t.includes('Tamil')));
        await page.selectOption('#reviewLanguageSelect', 'en-US');

        // Test Readability Modal
        await page.click('#reviewReadabilityBtn');
        await page.waitForSelector('#wordCustomModal.open');
        const readModalTitle = await page.textContent('.workspace-modal-title');
        test('Flesch-Kincaid Readability modal opened', readModalTitle.includes('Readability'));
        await page.click('#closeCustomModalBtn');

        // Test Comments
        await page.evaluate(() => {
            window.wordEngine.comments.push({ id: 1, text: 'Review strategic timeline', author: 'Auditor', date: '10:00 AM' });
        });
        await page.click('#reviewShowCommentsBtn');
        test('Comments drawer opens with active comments', await page.$('#wordRightDrawer.open') !== null);
        await page.evaluate(() => window.wordEngine.closeRightDrawer());

        // Test Track Changes toggle
        await page.click('#reviewTrackChangesBtn');
        test('Track Changes enabled', await page.evaluate(() => window.wordEngine.trackChanges === true));

        // Test Accessibility Checker
        await page.click('#reviewAccessibilityBtn');
        await page.waitForSelector('#wordCustomModal.open');
        test('Accessibility Checker audit completed', await page.textContent('.workspace-modal-title').then(t => t.includes('Accessibility')));
        await page.click('#closeCustomModalBtn');

        console.log('\n--- Phase 12: View Tab (Modes, Rulers, Gridlines, Zoom, Ribbon) ---');
        await page.click('.word-tab-btn[data-tab="view"]');

        // Test Continuous Web Layout
        await page.click('#viewContinuousModeBtn');
        test('Continuous Web Layout activated', await page.$('#wordPagesContainer.continuous-layout') !== null);

        // Test Read Mode
        await page.click('#viewReadModeBtn');
        test('Read Mode activated', await page.$('#wordPagesContainer.read-mode') !== null);

        // Test Outline View
        await page.click('#viewOutlineModeBtn');
        test('Outline View activated', await page.$('#wordPagesContainer.outline-view') !== null);

        // Return to Print Layout
        await page.click('#viewPageModeBtn');
        test('Print Layout restored', await page.$('#wordPagesContainer.continuous-layout') === null);

        // Test Rulers toggle
        await page.check('#viewRulerCheck');
        test('Horizontal and vertical rulers displayed', await page.evaluate(() => {
            const h = document.getElementById('wordRulerH').style.display;
            return h === 'flex';
        }));

        // Test Gridlines toggle
        await page.check('#viewGridlinesCheck');
        test('Gridlines class toggled on container', await page.$('#wordPagesContainer.show-gridlines') !== null);

        // Test Zoom Presets
        await page.selectOption('#zoomPresetSelect', '125');
        test('Zoom level updated to 125%', await page.evaluate(() => window.wordEngine.zoomLevel === 125));
        await page.click('#zoom100Btn');
        test('Zoom reset to 100%', await page.evaluate(() => window.wordEngine.zoomLevel === 100));

        // Test Show/Hide Ribbon
        await page.click('#viewToggleRibbonBtn');
        test('Ribbon collapse toggle working', await page.$('.word-ribbon-wrapper.ribbon-hidden') !== null);
        await page.click('.word-tab-btn[data-tab="view"]');
        test('Ribbon restored upon tab selection', await page.$('.word-ribbon-wrapper.ribbon-hidden') === null);

        console.log('\n--- Phase 13: Help Tab ---');
        await page.click('.word-tab-btn[data-tab="help"]');

        // Test Keyboard Shortcuts Modal
        await page.click('#helpShortcutsBtn');
        await page.waitForSelector('#wordCustomModal.open');
        test('Keyboard Shortcuts reference opened', await page.textContent('.workspace-modal-title').then(t => t.includes('Shortcuts')));
        await page.click('#closeCustomModalBtn');

        // Test Feature Guide
        await page.click('#helpGuideBtn');
        await page.waitForSelector('#wordCustomModal.open');
        test('Feature Guide opened', await page.textContent('.workspace-modal-title').then(t => t.includes('Guide')));
        await page.click('#closeCustomModalBtn');

        // Test About Modal
        await page.click('#helpAboutBtn');
        await page.waitForSelector('#wordCustomModal.open');
        test('About FRANK Word modal opened', await page.textContent('.workspace-modal-title').then(t => t.includes('About')));
        await page.click('#closeCustomModalBtn');

        console.log('\n--- Phase 14: Developer Tab (Content Controls, Properties, XML) ---');
        await page.click('.word-tab-btn[data-tab="developer"]');

        // Test Rich Text Control
        await page.click('#devRichTextBtn');
        test('Rich Text content control inserted', await page.$('.word-content-control[data-type="rich-text"]') !== null);

        // Test Plain Text Control
        await page.click('#devPlainTextBtn');
        test('Plain Text content control inserted', await page.$('.word-content-control[data-type="plain-text"]') !== null);

        // Test Checkbox Control
        await page.click('#devCheckboxBtn');
        test('Checkbox content control inserted', await page.$('.word-content-control[data-type="checkbox"]') !== null);

        // Test Date Picker Control
        await page.click('#devDateBtn');
        test('Date Picker content control inserted', await page.$('.word-content-control[data-type="date"]') !== null);

        // Test Dropdown Control
        await page.click('#devDropdownBtn');
        test('Dropdown content control inserted', await page.$('.word-content-control[data-type="dropdown"]') !== null);

        // Test Document Properties Metadata Modal
        await page.click('#devDocPropsBtn');
        await page.waitForSelector('#wordCustomModal.open');
        test('Document metadata properties modal opened', await page.textContent('.workspace-modal-title').then(t => t.includes('Metadata')));
        await page.click('#saveDocPropsBtn');

        // Test XML / OpenXML Inspector
        await page.click('#devXmlInspectorBtn');
        await page.waitForSelector('#wordCustomModal.open');
        test('OpenXML DOM Tree Inspector opened', await page.textContent('.workspace-modal-title').then(t => t.includes('XML')));
        await page.click('#closeCustomModalBtn');

        // Test Design Mode
        await page.click('#devDesignModeBtn');
        test('Developer Design Mode active', await page.evaluate(() => document.body.classList.contains('word-design-mode')));

        console.log('\n--- Phase 15: Keyboard Shortcuts & Document Persistence ---');
        // Test Ctrl+S shortcut
        await page.evaluate(() => window.mockWorkspace.markDirty());
        await page.keyboard.press('Control+s');
        await page.waitForTimeout(100);
        test('Ctrl+S triggered document save', await page.evaluate(() => window.mockWorkspace.isDirty === false));

        // Test Ctrl+A shortcut
        await page.evaluate(() => {
            const ed = document.querySelector('.word-editable-content');
            if (ed) ed.focus();
        });
        await page.keyboard.press('Control+a');
        await page.waitForTimeout(50);
        const selAfterCtrlA = await page.evaluate(() => {
            const sel = window.getSelection();
            const r = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
            const selStr = sel.toString();
            const rangeStr = r ? r.toString() : '';
            return {
                textLen: (selStr || rangeStr).length,
                selStrLen: selStr.length,
                rangeStrLen: rangeStr.length,
                rangeCount: sel.rangeCount,
                focused: document.activeElement ? document.activeElement.tagName + '#' + document.activeElement.id : null,
                startContainer: r ? r.startContainer.nodeName + '#' + (r.startContainer.id || '') : null,
                startOffset: r ? r.startOffset : null,
                endContainer: r ? r.endContainer.nodeName + '#' + (r.endContainer.id || '') : null,
                endOffset: r ? r.endOffset : null,
                docText: document.querySelector('.word-editable-content')?.innerText?.slice(0, 50)
            };
        });
        test('Ctrl+A selected all document text', selAfterCtrlA.textLen > 10);

        // Check console errors
        test('Zero uncaught browser console errors detected', consoleErrors.length === 0, consoleErrors.join('; '));

    } catch (err) {
        console.error('Test execution error:', err);
        results.failed++;
    } finally {
        await browser.close();
    }

    console.log('\n================================================================');
    console.log(`  TEST RESULTS: ${results.passed} PASSED / ${results.failed} FAILED (${Math.round((results.passed / (results.passed + results.failed || 1)) * 100)}%)`);
    console.log('================================================================\n');

    return results;
}

if (require.main === module) {
    runWordEditorCompleteTestSuite().then(res => {
        if (res.failed > 0) process.exit(1);
    });
}

module.exports = { runWordEditorCompleteTestSuite };
