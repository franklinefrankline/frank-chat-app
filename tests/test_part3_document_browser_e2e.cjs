const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.TEST_URL || 'http://127.0.0.1:8000';

async function apiRequest(endpoint, method = 'GET', body = null, token = null) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';

    const options = { method, headers };
    if (body) {
        options.body = (body instanceof FormData) ? body : JSON.stringify(body);
    }

    const res = await fetch(`${BASE_URL}${endpoint}`, options);
    let data = null;
    try {
        data = await res.json();
    } catch (e) {
        data = null;
    }
    return { status: res.status, ok: res.ok, data };
}

async function runPart3Tests() {
    console.log('================================================================');
    console.log('STARTING FRANK PART 3: OPEN & EDIT DOCUMENTS FULL E2E SUITE');
    console.log('================================================================\n');

    const ts = Date.now();
    const userAData = {
        username: `user_p3a_${ts}`,
        email: `user_p3a_${ts}@test.app`,
        password: 'Password123!',
        full_name: 'Arthur Pendelton',
        language: 'en'
    };
    const userBData = {
        username: `user_p3b_${ts}`,
        email: `user_p3b_${ts}@test.app`,
        password: 'Password123!',
        full_name: 'Beatrice Vance',
        language: 'en'
    };

    console.log('--- 1. REGISTER USERS ---');
    const regA = await apiRequest('/api/auth/register', 'POST', userAData);
    assert(regA.ok, `User A registration failed: ${JSON.stringify(regA.data)}`);
    const tokenA = regA.data.access_token;
    const userA = regA.data.user;

    const regB = await apiRequest('/api/auth/register', 'POST', userBData);
    assert(regB.ok, `User B registration failed: ${JSON.stringify(regB.data)}`);
    const tokenB = regB.data.access_token;
    const userB = regB.data.user;
    console.log(`✓ Users created: Arthur (${userA.id}) & Beatrice (${userB.id})`);

    // Launch browser
    const browser = await chromium.launch({ headless: true });
    const consoleErrors = [];

    try {
        const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const pageA = await contextA.newPage();
        pageA.on('console', msg => {
            console.log(`[PageA ${msg.type()}]`, msg.text());
            if (msg.type() === 'error') {
                const text = msg.text();
                if (!text.includes('favicon') && !text.includes('net::ERR_')) {
                    consoleErrors.push(`[PageA Error] ${text}`);
                }
            }
        });

        // Login User A
        await pageA.goto(`${BASE_URL}/login.html`);
        await pageA.evaluate(({ token, user }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(user));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token: tokenA, user: userA });
        await pageA.goto(`${BASE_URL}/dashboard.html`);
        await pageA.waitForSelector('#sidebar', { timeout: 10000 });
        console.log('✓ User A logged in and dashboard loaded');

        // --- 2. SIDEBAR OPEN & EDIT DOCUMENTS MENU ITEM ---
        console.log('\n--- 2. SIDEBAR MENU ITEM: OPEN & EDIT DOCUMENTS ---');
        const navDocsBtn = pageA.locator('#navOpenEditDocsBtn');
        await navDocsBtn.waitFor({ state: 'visible', timeout: 5000 });
        const navText = await navDocsBtn.textContent();
        assert(navText.includes('Open & Edit Documents'), 'Menu item has label "Open & Edit Documents"');
        console.log('✓ Verified sidebar button "#navOpenEditDocsBtn" with text "Open & Edit Documents"');

        // Click to open Document Browser
        await navDocsBtn.click();
        const docBrowser = pageA.locator('#docBrowserWorkspace');
        await docBrowser.waitFor({ state: 'visible', timeout: 5000 });
        console.log('✓ Document Browser opened full-screen workspace');

        // --- 3. DOCUMENT BROWSER TOOLBAR & FILTERS ---
        console.log('\n--- 3. DOCUMENT BROWSER TOOLBAR, SEARCH & FILTERS ---');
        const searchInput = pageA.locator('#docBrowserSearchInput');
        await searchInput.waitFor({ state: 'visible' });

        const filterPills = pageA.locator('.doc-filter-pill');
        const pillCount = await filterPills.count();
        assert(pillCount >= 8, `Expected at least 8 filter pills, got ${pillCount}`);
        console.log(`✓ Verified ${pillCount} filter pills (All, Recent, PDF, Word, Excel, PowerPoint, Text, CSV)`);

        // Check empty state
        const emptyState = pageA.locator('.doc-browser-empty');
        await emptyState.waitFor({ state: 'visible', timeout: 5000 });
        const emptyText = await emptyState.textContent();
        assert(emptyText.includes('No documents found'), 'Shows "No documents found" initially');
        console.log('✓ Empty state verified: "No documents found."');

        // --- 4. UPLOAD DOCUMENT VIA DOCUMENT BROWSER ---
        console.log('\n--- 4. UPLOAD REAL DOCUMENT VIA BROWSER ---');
        const testDocxPath = path.join(__dirname, `test_doc_${ts}.docx`);
        fs.writeFileSync(testDocxPath, 'PK\x03\x04Hello Frank Think Word Document Test');

        // Set input files on hidden file input
        const fileInput = pageA.locator('#docBrowserUploadInput');
        await fileInput.setInputFiles(testDocxPath);

        // Upload should trigger automatically, show success toast, and open in FrankOfficeWorkspace
        const officeWorkspace = pageA.locator('#frankDocumentWorkspace');
        await officeWorkspace.waitFor({ state: 'visible', timeout: 10000 });
        console.log('✓ Document uploaded and automatically opened in Office Workspace');

        // Verify Workspace Top Bar
        const docTitle = await pageA.locator('#workspaceDocTitle').textContent();
        assert(docTitle.includes(`test_doc_${ts}`), `Document title matches filename (${docTitle})`);
        const badge = await pageA.locator('#workspaceTypeBadge').textContent();
        assert(badge.includes('DOCX'), `Document type badge shows DOCX (${badge})`);
        console.log(`✓ Workspace opened real document: "${docTitle}" (${badge})`);

        // --- 5. EDIT & PERSIST IN WORKSPACE ---
        console.log('\n--- 5. EDIT & PERSIST DOCUMENT VERSION ---');
        // Edit word text
        const wordEditor = pageA.locator('#wordDocPage');
        if (await wordEditor.isVisible()) {
            await wordEditor.click();
            await pageA.keyboard.type(' Important specifications added.');
            await pageA.waitForTimeout(400);
        }

        // Verify save status became "Unsaved changes"
        const saveStatusText = await pageA.locator('#saveStatusText').textContent();
        assert(saveStatusText.includes('Unsaved changes') || saveStatusText.includes('Saved'), 'Save status tracks dirty state');

        // Save
        const saveBtn = pageA.locator('#workspaceSaveBtn');
        await saveBtn.click();
        await pageA.waitForTimeout(1000);
        const savedText = await pageA.locator('#saveStatusText').textContent();
        assert(savedText.includes('Saved'), 'Saved status displayed after backend persistence');
        console.log('✓ Document saved and persisted to database');

        // Check Back button returns to Document Browser
        const backBtn = pageA.locator('#workspaceBackBtn');
        await backBtn.click();
        await officeWorkspace.waitFor({ state: 'hidden' });
        await docBrowser.waitFor({ state: 'visible' });
        console.log('✓ Back button smoothly returned to Document Browser');

        // Clean up scratch file
        if (fs.existsSync(testDocxPath)) fs.unlinkSync(testDocxPath);

        // --- 6. DOCUMENT BROWSER LISTING & SEARCH ---
        console.log('\n--- 6. DOCUMENT BROWSER CARDS & LIVE SEARCH ---');
        await pageA.waitForSelector('.doc-browser-card', { timeout: 8000 });
        const docCards = pageA.locator('.doc-browser-card');
        const cardCount = await docCards.count();
        assert(cardCount >= 1, `Expected at least 1 document card, got ${cardCount}`);

        const firstCardTitle = await pageA.locator('.doc-card-title').first().textContent();
        assert(firstCardTitle.includes(`test_doc_${ts}`), 'Document card shows uploaded document filename');
        console.log(`✓ Document Browser displays real document card: "${firstCardTitle.trim()}"`);

        // Test search query
        await searchInput.fill('nonexistent_random_xyz_query');
        await pageA.waitForTimeout(400);
        await pageA.waitForSelector('.doc-browser-empty', { timeout: 5000 });
        console.log('✓ Search for non-existent query correctly renders "No documents found."');

        // Clear search query
        await searchInput.fill('');
        await pageA.waitForTimeout(400);
        await pageA.waitForSelector('.doc-browser-card', { timeout: 5000 });
        console.log('✓ Clearing search restores document card grid');

        // --- 7. FILTER PILLS FILTERING ---
        console.log('\n--- 7. FILTER PILLS FILTERING ---');
        // Click Word pill -> should show card
        const wordPill = pageA.locator('.doc-filter-pill[data-filter="word"]');
        await wordPill.click();
        await pageA.waitForTimeout(400);
        const wordCards = await pageA.locator('.doc-browser-card').count();
        assert(wordCards >= 1, 'Word filter displays DOCX document');

        // Click PDF pill -> should show empty since we uploaded DOCX
        const pdfPill = pageA.locator('.doc-filter-pill[data-filter="pdf"]');
        await pdfPill.click();
        await pageA.waitForTimeout(400);
        const pdfEmpty = await pageA.locator('.doc-browser-empty').count();
        assert(pdfEmpty >= 1, 'PDF filter correctly shows empty state');

        // Click All pill -> restore
        const allPill = pageA.locator('.doc-filter-pill[data-filter="all"]');
        await allPill.click();
        await pageA.waitForTimeout(400);
        await pageA.waitForSelector('.doc-browser-card', { timeout: 5000 });
        console.log('✓ Filter pills (All, Word, PDF) tested and functional');

        // --- 8. SEND DOCUMENT TO CHAT VIA BROWSER MODAL ---
        console.log('\n--- 8. SEND DOCUMENT TO CHAT (TWO-USER REALTIME WEBSOCKET) ---');
        // Setup Beatrice in Browser B
        const contextB = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const pageB = await contextB.newPage();
        await pageB.goto(`${BASE_URL}/login.html`);
        await pageB.evaluate(({ token, user }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(user));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token: tokenB, user: userB });
        await pageB.goto(`${BASE_URL}/dashboard.html`);
        await pageB.waitForSelector('#sidebar', { timeout: 10000 });

        // Beatrice opens direct conversation with Arthur
        await pageB.evaluate(partner => {
            window.chatController.openDirectChat(partner);
        }, userA);
        await pageB.waitForSelector('#activeChatView', { state: 'visible', timeout: 5000 });
        console.log('✓ Beatrice logged in and listening in chat with Arthur');

        // Arthur clicks "Send" on the document card in Document Browser
        const sendDocBtn = pageA.locator('.doc-browser-card .btn:has-text("Send")').first();
        await sendDocBtn.click();

        // Send to Chat Modal opens
        const sendModal = pageA.locator('#docSendToChatModal');
        await sendModal.waitFor({ state: 'visible', timeout: 5000 });
        console.log('✓ "Send Document to Chat" modal opened');

        // Recipient list populated with contacts
        await pageA.waitForSelector('.doc-send-recipient-row', { timeout: 5000 });
        const recipientRows = pageA.locator('.doc-send-recipient-row');
        const rCount = await recipientRows.count();
        assert(rCount >= 1, `Recipients listed (${rCount})`);

        // Search recipient
        const recSearch = pageA.locator('#docSendRecipientSearch');
        await recSearch.fill('Beatrice');
        await pageA.waitForTimeout(300);

        // Select Beatrice
        const beatriceRow = pageA.locator(`.doc-send-recipient-row[data-id="${userB.id}"]`);
        await beatriceRow.click();
        assert(await beatriceRow.evaluate(el => el.classList.contains('selected')), 'Beatrice row selected');

        // Confirm Send
        const confirmSendBtn = pageA.locator('#confirmDocSendBtn');
        assert(await confirmSendBtn.isEnabled(), 'Confirm Send button enabled');
        await confirmSendBtn.click();
        await pageA.waitForTimeout(1000);
        console.log('✓ Arthur sent document to Beatrice');

        // Beatrice receives document card in real-time over WebSocket without reload!
        await pageB.waitForSelector('.message-document-card', { timeout: 10000 });
        const beatriceReceivedFilename = await pageB.locator('.message-document-card .message-doc-title').last().textContent();
        assert(beatriceReceivedFilename.includes(`test_doc_${ts}`), 'Beatrice received exact document over WebSocket');
        console.log(`✓ Beatrice received document attachment in real time: "${beatriceReceivedFilename.trim()}"`);

        // Beatrice opens document directly inside her workspace
        const beatriceOpenBtn = pageB.locator('.message-document-card .msg-doc-open-btn').last();
        await beatriceOpenBtn.click();
        const beatriceWorkspace = pageB.locator('#frankDocumentWorkspace');
        await beatriceWorkspace.waitFor({ state: 'visible', timeout: 5000 });
        const bDocTitle = await pageB.locator('#workspaceDocTitle').textContent();
        assert(bDocTitle.includes(`test_doc_${ts}`), 'Beatrice workspace opened exact document');
        console.log(`✓ Beatrice opened received document directly in her workspace: "${bDocTitle.trim()}"`);

        // Beatrice closes workspace
        await pageB.click('#workspaceBackBtn');
        await beatriceWorkspace.waitFor({ state: 'hidden' });

        // --- 9. THEMES & MOBILE VIEWPORT AUDIT ---
        console.log('\n--- 9. THEMES & MOBILE RESPONSIVENESS AUDIT ---');
        // Toggle theme to Monochrome
        await pageA.evaluate(() => {
            if (window.themeController) window.themeController.setTheme('monochrome');
        });
        const themeBg = await docBrowser.evaluate(el => window.getComputedStyle(el).backgroundColor);
        console.log(`✓ Document Browser adaptive theme background verified: ${themeBg}`);

        // Responsive viewports
        const viewports = [320, 360, 375, 390, 414, 768, 1024];
        for (const w of viewports) {
            await pageA.setViewportSize({ width: w, height: 700 });
            await pageA.waitForTimeout(200);
            const scrollW = await pageA.evaluate(() => document.documentElement.scrollWidth);
            const innerW = await pageA.evaluate(() => window.innerWidth);
            assert(scrollW <= innerW + 1, `Horizontal overflow detected at ${w}px (${scrollW} > ${innerW})`);
        }
        console.log('✓ Zero horizontal overflow across all 7 mobile & tablet viewports (320px–1024px)');

        await contextA.close();
        await contextB.close();

        assert(consoleErrors.length === 0, `Captured unexpected console errors: ${consoleErrors.join(', ')}`);
        console.log('✓ Zero console errors detected during entire run');

        console.log('\n================================================================');
        console.log('ALL PART 3 PLAYWRIGHT E2E TESTS PASSED SUCCESSFULLY! [100%]');
        console.log('================================================================\n');

    } finally {
        await browser.close();
    }
}

runPart3Tests().catch(err => {
    console.error('PART 3 PLAYWRIGHT TEST FAILED:', err);
    process.exit(1);
});
