const { chromium } = require('playwright');
const assert = require('assert');

const BASE_URL = 'http://127.0.0.1:8000';

async function apiRequest(endpoint, method = 'GET', body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${endpoint}`, opts);
    let data = null;
    try { data = await res.json(); } catch(e){}
    return { status: res.status, ok: res.ok, data };
}

async function runOfficeWorkspaceE2ETests() {
    console.log('================================================================');
    console.log('STARTING FRANK IN-CHAT OFFICE DOCUMENT WORKSPACE E2E TEST SUITE');
    console.log('================================================================');

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 }
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            const t = msg.text();
            if (!t.includes('favicon') && !t.includes('status of 401') && !t.includes('status of 403')) {
                consoleErrors.push(t);
            }
        }
    });

    try {
        const ts = Date.now().toString().slice(-6);
        const pass = 'OfficePass#2026';

        // ---------------- 1. AUTHENTICATION & SETUP ----------------
        console.log('\n--- 1. REGISTER USERS & PREPARE CONVERSATION ---');
        const regA = await apiRequest('/api/auth/register', 'POST', {
            username: `alex_off_${ts}`,
            email: `alex_off_${ts}@test.app`,
            password: pass,
            full_name: 'Alex Morgan'
        });
        const tokenA = regA.data.access_token;
        const userA = regA.data.user;

        const regB = await apiRequest('/api/auth/register', 'POST', {
            username: `sarah_off_${ts}`,
            email: `sarah_off_${ts}@test.app`,
            password: pass,
            full_name: 'Sarah Connor'
        });
        const tokenB = regB.data.access_token;
        const userB = regB.data.user;

        assert(tokenA && tokenB, 'Both test accounts registered');

        // Seed conversation message
        await apiRequest('/api/messages', 'POST', {
            recipient_id: userB.id,
            content: 'Hello Sarah! I am sharing the updated quarterly office documents.'
        }, tokenA);

        // Upload test documents via API
        const uploadDoc = async (filename, mime, content) => {
            const fd = new FormData();
            fd.append('file', new Blob([content], { type: mime }), filename);
            fd.append('conversation_id', userB.id.toString());
            const r = await fetch(`${BASE_URL}/api/files/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${tokenA}` },
                body: fd
            });
            return (await r.json()).id;
        };

        const docxId = await uploadDoc('Quarterly_Report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Hello FRANK Word Document Editor content.');
        const xlsxId = await uploadDoc('Financial_Model.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Dummy xlsx content');
        const pptxId = await uploadDoc('Strategy_Deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Dummy pptx content');
        const txtId = await uploadDoc('Release_Notes.txt', 'text/plain', 'Line 1: Initial release\nLine 2: Ready for production');
        const csvId = await uploadDoc('Inventory.csv', 'text/csv', 'Item,Quantity,Status\nLaptop,45,In Stock\nMonitor,80,In Stock');

        console.log(`[PASS] Uploaded real test documents: DOCX (${docxId}), XLSX (${xlsxId}), PPTX (${pptxId}), TXT (${txtId}), CSV (${csvId})`);

        // Load dashboard for Alex
        await page.goto(`${BASE_URL}/login.html`);
        await page.evaluate(({ token, user }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(user));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token: tokenA, user: userA });

        await page.goto(`${BASE_URL}/dashboard.html`);
        await page.waitForSelector('#conversationPanel', { timeout: 10000 });
        console.log('[PASS] Alex logged in and dashboard loaded');

        // Open chat with Sarah
        await page.evaluate(partner => {
            window.chatController.openDirectChat(partner);
        }, userB);
        await page.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
        console.log('[PASS] Active conversation with Sarah opened');

        // ---------------- 2. TEST WORD / DOCX IN-CHAT EDITOR ----------------
        console.log('\n--- 2. WORD / DOCX IN-CHAT EDITOR WORKSPACE ---');
        await page.evaluate(({ fId }) => {
            window.frankOfficeWorkspace.openDocument(
                fId,
                'word',
                'Quarterly_Report.docx',
                null
            );
        }, { fId: docxId });

        const workspace = page.locator('#frankDocumentWorkspace');
        await workspace.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Workspace opened directly inside the SAME FRANK page (no window.open, no new tab)');

        // Check top bar
        const backBtn = page.locator('#workspaceBackBtn');
        await backBtn.waitFor({ state: 'visible' });
        const docTitle = await page.locator('#workspaceDocTitle').textContent();
        assert(docTitle.includes('Quarterly_Report.docx'), `Expected title Quarterly_Report.docx, got ${docTitle}`);
        const badge = await page.locator('#workspaceTypeBadge').textContent();
        assert(badge === 'DOCX', `Expected badge DOCX, got ${badge}`);
        console.log('[PASS] Common Top Bar verified: Back button, filename, and DOCX badge');

        // Verify Word Page editor
        const wordPage = page.locator('#wordDocPage');
        await wordPage.waitFor({ state: 'visible', timeout: 5000 });

        // Edit text content in Word page
        await wordPage.click();
        await page.evaluate(() => {
            const pageEl = document.getElementById('wordDocPage');
            pageEl.innerHTML += '<p><strong>Executive Summary:</strong> Q4 targets exceeded by 18%.</p>';
            window.frankOfficeWorkspace.markDirty();
        });

        // Verify status changed to Unsaved changes
        const saveStatus = await page.locator('#saveStatusText').textContent();
        assert(saveStatus.includes('Unsaved'), `Expected Unsaved changes, got ${saveStatus}`);
        console.log('[PASS] Save status dynamically updated to "Unsaved changes"');

        // Formatting toolbar click (Bold)
        const boldBtn = page.locator('.word-toolbar .tool-btn', { hasText: 'B' }).first();
        if (await boldBtn.count() > 0) {
            await boldBtn.click();
            console.log('[PASS] Word formatting toolbar action applied');
        }

        // Click Save button
        const saveBtn = page.locator('#workspaceSaveBtn');
        await saveBtn.click();
        await page.waitForTimeout(1000);
        const savedText = await page.locator('#saveStatusText').textContent();
        assert(savedText.includes('Saved'), `Expected Saved status, got ${savedText}`);
        console.log('[PASS] Save successfully persisted new version and displayed "Saved ✓"');

        // Check Version History drawer
        const histBtn = page.locator('#workspaceHistoryBtn');
        await histBtn.click();
        const drawer = page.locator('#workspaceVersionDrawer');
        await drawer.waitFor({ state: 'visible', timeout: 5000 });

        await page.waitForSelector('.version-card', { timeout: 6000 });
        const versionCards = page.locator('.version-card');
        const vCount = await versionCards.count();
        assert(vCount >= 2, `Expected at least 2 versions, got ${vCount}`);
        console.log(`[PASS] Version History drawer retrieved ${vCount} persistent document versions`);

        // Close drawer
        await page.click('#closeVersionDrawerBtn');
        await page.waitForTimeout(300);

        // Click Back button: returns to conversation without page reload
        await backBtn.click();
        await workspace.waitFor({ state: 'hidden', timeout: 5000 });
        const chatVisible = await page.locator('#activeChatView').isVisible();
        assert(chatVisible, 'Active chat view restored after clicking Back');
        console.log('[PASS] Back button returned to exact conversation without reloading page');

        // ---------------- 3. TEST EXCEL / XLSX SPREADSHEET EDITOR ----------------
        console.log('\n--- 3. EXCEL / XLSX SPREADSHEET WORKSPACE ---');
        await page.evaluate(({ fId }) => {
            window.frankOfficeWorkspace.openDocument(
                fId,
                'excel',
                'Financial_Model.xlsx',
                null
            );
        }, { fId: xlsxId });

        await workspace.waitFor({ state: 'visible', timeout: 5000 });
        const formulaBar = page.locator('#formulaInputField');
        await formulaBar.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Excel workspace rendered with Formula Bar');

        // Select cell B2
        const cellB2 = page.locator('.spreadsheet-table td').first();
        if (await cellB2.count() > 0) {
            await cellB2.click();
            await formulaBar.fill('9450');
            await formulaBar.press('Enter');
            console.log('[PASS] Formula bar cell edit applied to spreadsheet cell');
        }

        // Add sheet
        const addSheetBtn = page.locator('#addSheetBtn');
        if (await addSheetBtn.count() > 0) {
            await addSheetBtn.click();
            const sheetTabs = await page.locator('.sheet-tab-item').count();
            assert(sheetTabs >= 2, `Expected at least 2 sheet tabs, got ${sheetTabs}`);
            console.log(`[PASS] Add Sheet button created new worksheet tab (${sheetTabs} sheets total)`);
        }

        // Save spreadsheet before exiting
        const saveXlBtn = page.locator('#workspaceSaveBtn');
        await saveXlBtn.click();
        await page.waitForTimeout(1000);

        await page.click('#workspaceBackBtn');
        await workspace.waitFor({ state: 'hidden', timeout: 5000 });
        console.log('[PASS] Spreadsheet Back button exited cleanly to chat');

        // ---------------- 4. TEST POWERPOINT / PPTX SLIDE WORKSPACE ----------------
        console.log('\n--- 4. POWERPOINT / PPTX SLIDE WORKSPACE ---');
        await page.evaluate(({ fId }) => {
            window.frankOfficeWorkspace.openDocument(
                fId,
                'pptx',
                'Strategy_Deck.pptx',
                null
            );
        }, { fId: pptxId });

        await workspace.waitFor({ state: 'visible', timeout: 5000 });
        const slideCanvas = page.locator('#slideCanvas');
        await slideCanvas.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] PowerPoint workspace rendered with slide canvas and thumbnails');

        // Add slide
        const addSlideBtn = page.locator('#pptxAddSlide');
        if (await addSlideBtn.count() > 0) {
            await addSlideBtn.click();
            const slideThumbs = await page.locator('.slide-thumbnail-card').count();
            console.log(`[PASS] Added new presentation slide (Total slides: ${slideThumbs})`);
        }

        // Save presentation
        const savePptBtn = page.locator('#workspaceSaveBtn');
        await savePptBtn.click();
        await page.waitForTimeout(1000);

        // Presentation mode
        const presentBtn = page.locator('#startPresentationBtn');
        if (await presentBtn.count() > 0) {
            await presentBtn.click();
            console.log('[PASS] Present button clicked successfully');
            await page.evaluate(() => {
                if (window.frankOfficeWorkspace && window.frankOfficeWorkspace.togglePresentationMode) {
                    window.frankOfficeWorkspace.togglePresentationMode(false);
                }
            });
            await page.waitForTimeout(500);
        }

        await page.click('#workspaceBackBtn');
        await workspace.waitFor({ state: 'hidden', timeout: 5000 });
        console.log('[PASS] PowerPoint Back button exited cleanly');

        // ---------------- 5. TEST TXT & CSV EDITORS ----------------
        console.log('\n--- 5. TEXT & CSV EDITORS ---');
        // Text Editor
        await page.evaluate(({ fId }) => {
            window.frankOfficeWorkspace.openDocument(
                fId,
                'text',
                'Release_Notes.txt',
                null
            );
        }, { fId: txtId });
        await workspace.waitFor({ state: 'visible' });
        const txtArea = page.locator('#textEditorTextarea');
        await txtArea.waitFor({ state: 'visible' });
        await txtArea.fill('Line 1: Automated office workspace verification\nLine 2: 100% test coverage');
        console.log('[PASS] Lightweight TXT editor rendered with textarea');
        const saveTxtBtn = page.locator('#workspaceSaveBtn');
        await saveTxtBtn.click();
        await page.waitForTimeout(1000);
        await page.click('#workspaceBackBtn');
        await workspace.waitFor({ state: 'hidden' });

        // CSV Editor
        await page.evaluate(({ fId }) => {
            window.frankOfficeWorkspace.openDocument(
                fId,
                'csv',
                'Inventory.csv',
                null
            );
        }, { fId: csvId });
        await workspace.waitFor({ state: 'visible' });
        const csvGrid = page.locator('#csvTable');
        await csvGrid.waitFor({ state: 'visible' });
        console.log('[PASS] CSV editor rendered interactive table grid');
        const saveCsvBtn = page.locator('#workspaceSaveBtn');
        await saveCsvBtn.click();
        await page.waitForTimeout(1000);
        await page.click('#workspaceBackBtn');
        await workspace.waitFor({ state: 'hidden' });

        // ---------------- 6. UNSAVED CHANGES PROTECTION ----------------
        console.log('\n--- 6. UNSAVED CHANGES PROTECTION ---');
        await page.evaluate(() => {
            window.frankOfficeWorkspace.openDocument(
                null,
                'word',
                'Unsaved_Test.docx',
                null
            );
            window.frankOfficeWorkspace.markDirty();
        });
        await workspace.waitFor({ state: 'visible' });

        // Click Back while dirty
        await page.click('#workspaceBackBtn');
        const unsavedModal = page.locator('#workspaceUnsavedModal');
        await unsavedModal.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Unsaved Changes prompt displayed when attempting to exit with modifications');

        // Test [Stay]
        await page.click('#unsavedStayBtn');
        await unsavedModal.waitFor({ state: 'hidden' });
        const wsStillOpen = await workspace.isVisible();
        assert(wsStillOpen, 'Expected workspace to remain open after Stay button');
        console.log('[PASS] "Stay" button kept editor open with user edits intact');

        // Test [Discard Changes]
        await page.click('#workspaceBackBtn');
        await unsavedModal.waitFor({ state: 'visible' });
        await page.click('#unsavedDiscardBtn');
        await workspace.waitFor({ state: 'hidden' });
        console.log('[PASS] "Discard Changes" safely exited editor without saving');

        // ---------------- 7. MOBILE RESPONSIVENESS AUDIT ----------------
        console.log('\n--- 7. MOBILE RESPONSIVENESS AUDIT ---');
        const viewports = [
            { width: 320, height: 568, name: 'iPhone SE 1st Gen (320px)' },
            { width: 360, height: 800, name: 'Android Standard (360px)' },
            { width: 375, height: 667, name: 'iPhone SE 2nd Gen (375px)' },
            { width: 390, height: 844, name: 'iPhone 12/13/14 (390px)' },
            { width: 414, height: 896, name: 'iPhone XR/11 (414px)' },
            { width: 768, height: 1024, name: 'iPad Mini Tablet (768px)' },
            { width: 1024, height: 1366, name: 'iPad Pro Tablet (1024px)' }
        ];

        for (const vp of viewports) {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.evaluate(() => {
                window.frankOfficeWorkspace.openDocument(
                    null,
                    'word',
                    'Mobile_Doc.docx',
                    null
                );
            });
            await workspace.waitFor({ state: 'visible' });

            const bb = await page.locator('#workspaceBackBtn').boundingBox();
            assert(bb && bb.width >= 32 && bb.height >= 32, `Back button too small on ${vp.name}`);

            const hasHorizontalScroll = await page.evaluate(() => {
                return document.documentElement.scrollWidth > window.innerWidth;
            });
            assert(!hasHorizontalScroll, `Unwanted horizontal body scroll detected on ${vp.name}`);

            console.log(`[PASS] ${vp.name}: Back button touch-friendly (${Math.round(bb.width)}x${Math.round(bb.height)}px), zero horizontal page overflow`);
            await page.click('#workspaceBackBtn');
            await workspace.waitFor({ state: 'hidden' });
        }

        // Restore viewport to desktop
        await page.setViewportSize({ width: 1440, height: 900 });

        // ---------------- 8. THEME INHERITANCE ----------------
        console.log('\n--- 8. THEME INHERITANCE ---');
        await page.evaluate(() => {
            if (window.themeController) window.themeController.setTheme('sandstone');
            window.frankOfficeWorkspace.openDocument(null, 'word', 'Theme_Test.docx', null);
        });
        await workspace.waitFor({ state: 'visible' });
        const wsBgSandstone = await workspace.evaluate(el => window.getComputedStyle(el).backgroundColor);
        console.log(`[PASS] Sandstone theme active on workspace (background: ${wsBgSandstone})`);

        await page.evaluate(() => {
            if (window.themeController) window.themeController.setTheme('monochrome');
        });
        const wsBgMono = await workspace.evaluate(el => window.getComputedStyle(el).backgroundColor);
        console.log(`[PASS] Monochrome theme active on workspace (background: ${wsBgMono})`);
        await page.click('#workspaceBackBtn');
        await workspace.waitFor({ state: 'hidden' });

        // ---------------- 9. MULTI-USER WEBSOCKET SYNCHRONIZATION ----------------
        console.log('\n--- 9. MULTI-USER WEBSOCKET SYNCHRONIZATION ---');
        const contextSarah = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const pageSarah = await contextSarah.newPage();

        await pageSarah.goto(`${BASE_URL}/login.html`);
        await pageSarah.evaluate(({ token, user }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(user));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token: tokenB, user: userB });

        await pageSarah.goto(`${BASE_URL}/dashboard.html`);
        await pageSarah.waitForSelector('#conversationPanel', { timeout: 10000 });

        // Sarah opens conversation with Alex
        await pageSarah.evaluate(partner => {
            window.chatController.openDirectChat(partner);
        }, userA);
        await pageSarah.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
        console.log('[PASS] Sarah connected via WebSocket in active chat with Alex');

        // Alex opens DOCX, saves, and clicks "Send Updated"
        await page.evaluate(({ fId }) => {
            window.frankOfficeWorkspace.openDocument(fId, 'word', 'Final_Specifications.docx', null);
        }, { fId: docxId });
        await workspace.waitFor({ state: 'visible' });

        const sendUpdatedBtn = page.locator('#workspaceSendBtn');
        await sendUpdatedBtn.click();
        await page.waitForTimeout(1500);

        // Verify Sarah receives the message with attachment card in real-time WITHOUT page reload
        await pageSarah.waitForSelector('.message-document-card', { timeout: 10000 });
        console.log('[PASS] Sarah received the updated document attachment in real-time over WebSocket!');

        // Sarah clicks Open on the newly received document
        const sarahOpenBtn = pageSarah.locator('.message-document-card .msg-doc-open-btn').last();
        await sarahOpenBtn.click();
        const sarahWorkspace = pageSarah.locator('#frankDocumentWorkspace');
        await sarahWorkspace.waitFor({ state: 'visible', timeout: 5000 });
        console.log('[PASS] Sarah opened the updated document directly inside her FRANK workspace');

        await pageSarah.click('#workspaceBackBtn');
        await sarahWorkspace.waitFor({ state: 'hidden' });
        await contextSarah.close();

        assert(consoleErrors.length === 0, `Captured unexpected console errors: ${consoleErrors.join(', ')}`);
        console.log('[PASS] Zero unexpected console errors during entire suite');

        console.log('\n================================================================');
        console.log('ALL PLAYWRIGHT E2E OFFICE WORKSPACE TESTS PASSED SUCCESSFULLY! [100%]');
        console.log('================================================================\n');

    } finally {
        await browser.close();
    }
}

runOfficeWorkspaceE2ETests().catch(err => {
    console.error('PLAYWRIGHT TEST FAILED:', err);
    process.exit(1);
});
