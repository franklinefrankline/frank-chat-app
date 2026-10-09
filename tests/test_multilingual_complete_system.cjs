const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:8000';

async function runMultilingualTests() {
    console.log('====================================================');
    console.log('FRANK MULTILINGUAL COMPLETE SYSTEM AUDIT & E2E TEST');
    console.log('====================================================');

    const browser = await chromium.launch({ headless: true });
    let passedTests = 0;
    let totalTests = 0;

    function assertTest(desc, condition, details = '') {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`[PASS] ${desc} ${details ? '(' + details + ')' : ''}`);
        } else {
            console.error(`[FAIL] ${desc} ${details ? '(' + details + ')' : ''}`);
            throw new Error(`Test failed: ${desc}`);
        }
    }

    try {
        // ==========================================
        // TEST SUITE 1: LOGIN PAGE UI TRANSLATION
        // ==========================================
        console.log('\n--- 1. Testing Login Page UI Translation ---');
        const loginContext = await browser.newContext();
        const loginPage = await loginContext.newPage();
        await loginPage.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });

        // Check language selector dropdown exists
        const langDropdown = loginPage.locator('#langSelector, .lang-selector-container').first();
        assertTest('Language selector exists on Login page', await langDropdown.count() > 0);

        // Switch to Tamil
        const langBtn = loginPage.locator('.lang-btn').first();
        await langBtn.click();
        const tamilOption = loginPage.locator('.lang-option[data-lang="ta"]').first();
        await tamilOption.click();
        await loginPage.waitForTimeout(300);

        // Check Tamil UI elements
        const titleTextTa = await loginPage.locator('.auth-card-title').first().textContent();
        assertTest('Login title translated to Tamil', titleTextTa.includes('உள்நுழைக') || titleTextTa.includes('உள்நுழை') || titleTextTa.includes('மீண்டும் வருக'), titleTextTa.trim());

        const submitBtnTextTa = await loginPage.locator('#loginSubmitBtn .btn-text').first().textContent();
        assertTest('Login button translated to Tamil', submitBtnTextTa.includes('உள்நுழைக') || submitBtnTextTa.includes('உள்நுழை'), submitBtnTextTa.trim());

        // Switch back to English
        await langBtn.click();
        const enOption = loginPage.locator('.lang-option[data-lang="en"]').first();
        await enOption.click();
        await loginPage.waitForTimeout(300);

        const titleTextEn = await loginPage.locator('.auth-card-title').first().textContent();
        assertTest('Login title restored to English', titleTextEn.includes('Sign In') || titleTextEn.includes('Welcome Back'), titleTextEn.trim());

        await loginContext.close();

        // ==========================================
        // TEST SUITE 2: DASHBOARD UI TRANSLATION
        // ==========================================
        console.log('\n--- 2. Testing Dashboard UI Translation ---');
        const userAContext = await browser.newContext();
        const pageA = await userAContext.newPage();

        // Log in as Alex (User A)
        await pageA.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
        await pageA.fill('#loginUsername', 'alex');
        await pageA.fill('#loginPassword', 'password123');
        await pageA.click('#loginSubmitBtn');
        await pageA.waitForURL('**/dashboard.html', { timeout: 10000 });
        await pageA.waitForTimeout(1000);

        // Test language selector on dashboard
        const dashLangBtn = pageA.locator('#dashLangSelector .lang-btn, .header-actions .lang-btn').first();
        assertTest('Dashboard top language selector exists', await dashLangBtn.count() > 0);

        // Switch to Tamil
        await dashLangBtn.click();
        await pageA.locator('.lang-option[data-lang="ta"]').first().click();
        await pageA.waitForTimeout(500);

        // Verify Search placeholder in Tamil
        const searchInput = pageA.locator('#conversationSearchInput');
        const searchPlaceholderTa = await searchInput.getAttribute('placeholder');
        assertTest('Search placeholder translated to Tamil', searchPlaceholderTa.includes('உரையாடல்கள்') || searchPlaceholderTa.includes('தேடுங்கள்') || searchPlaceholderTa.includes('அரட்டைகள்'), searchPlaceholderTa);

        // Verify Filter chips in Tamil
        const filterAllTa = await pageA.locator('.filter-chip[data-filter="all"]').textContent();
        assertTest('Filter chip "All" translated to Tamil', filterAllTa.includes('அனைத்தும்'), filterAllTa.trim());

        const filterUnreadTa = await pageA.locator('.filter-chip[data-filter="unread"]').textContent();
        assertTest('Filter chip "Unread" translated to Tamil', filterUnreadTa.includes('படிக்காதவை'), filterUnreadTa.trim());

        // Verify Composer placeholder in Tamil
        const composerInput = pageA.locator('#messageComposerTextarea');
        const composerPlaceholderTa = await composerInput.getAttribute('placeholder');
        assertTest('Composer placeholder translated to Tamil', composerPlaceholderTa.includes('செய்தியை') || composerPlaceholderTa.includes('தட்டச்சு'), composerPlaceholderTa);

        // Verify Smart Conversations 8 tabs in Tamil
        const smartSummaryTab = await pageA.locator('[data-smart-tab="summary"]').textContent();
        assertTest('Smart tab "Summary" in Tamil', smartSummaryTab.includes('சுருக்கம்'), smartSummaryTab.trim());

        const smartMissedTab = await pageA.locator('[data-smart-tab="missed"]').textContent();
        assertTest('Smart tab "Missed" in Tamil', smartMissedTab.includes('தவறவிட்டவை') || smartMissedTab.includes('விடுபட்டவை'), smartMissedTab.trim());

        const smartImportantTab = await pageA.locator('[data-smart-tab="important"]').textContent();
        assertTest('Smart tab "Important" in Tamil', smartImportantTab.includes('முக்கியமானவை'), smartImportantTab.trim());

        const smartActionsTab = await pageA.locator('[data-smart-tab="actions"]').textContent();
        assertTest('Smart tab "Actions" in Tamil', smartActionsTab.includes('செயல்கள்'), smartActionsTab.trim());

        const smartDecisionsTab = await pageA.locator('[data-smart-tab="decisions"]').textContent();
        assertTest('Smart tab "Decisions" in Tamil', smartDecisionsTab.includes('முடிவுகள்'), smartDecisionsTab.trim());

        const smartDatesTab = await pageA.locator('[data-smart-tab="dates"]').textContent();
        assertTest('Smart tab "Dates" in Tamil', smartDatesTab.includes('தேதிகள்'), smartDatesTab.trim());

        const smartFilesTab = await pageA.locator('[data-smart-tab="files"]').textContent();
        assertTest('Smart tab "Files" in Tamil', smartFilesTab.includes('கோப்புகள்'), smartFilesTab.trim());

        const smartInsightsTab = await pageA.locator('[data-smart-tab="insights"]').textContent();
        assertTest('Smart tab "Insights" in Tamil', smartInsightsTab.includes('நுண்ணறிவு'), smartInsightsTab.trim());

        // Switch User A back to English for Feature B testing
        await dashLangBtn.click();
        await pageA.locator('.lang-option[data-lang="en"]').first().click();
        await pageA.waitForTimeout(500);

        const filterAllEn = await pageA.locator('.filter-chip[data-filter="all"]').textContent();
        assertTest('User A successfully reset to English', filterAllEn.includes('All'), filterAllEn.trim());

        // ==========================================
        // TEST SUITE 3: FEATURE B - MESSAGE TRANSLATION
        // USER A (English) -> USER B (Tamil)
        // ==========================================
        console.log('\n--- 3. Testing Feature B: User A (English) -> User B (Tamil) ---');
        const userBContext = await browser.newContext();
        const pageB = await userBContext.newPage();

        // Log in as Sarah (User B)
        await pageB.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
        await pageB.fill('#loginUsername', 'sarah');
        await pageB.fill('#loginPassword', 'password123');
        await pageB.click('#loginSubmitBtn');
        await pageB.waitForURL('**/dashboard.html', { timeout: 10000 });
        await pageB.waitForTimeout(1000);

        // Set User B language preference to Tamil (ta) via header selector and persist
        const pageBLangBtn = pageB.locator('#dashLangSelector .lang-btn, .header-actions .lang-btn').first();
        await pageBLangBtn.click();
        await pageB.locator('.lang-option[data-lang="ta"]').first().click();
        await pageB.waitForTimeout(500);

        // Open chat with Alex on User B's page
        const alexItemOnB = pageB.locator('.conversation-card:has-text("Alex Morgan"), .conversation-card:has-text("Alex")').first();
        if (await alexItemOnB.count() > 0) {
            await alexItemOnB.click();
        } else {
            // Find via contacts or search
            await pageB.fill('#conversationSearchInput', 'Alex');
            await pageB.waitForTimeout(300);
            await pageB.locator('.conversation-card').first().click();
        }
        await pageB.waitForTimeout(800);

        // Open chat with Sarah on User A's page
        const sarahItemOnA = pageA.locator('.conversation-card:has-text("Sarah Connor"), .conversation-card:has-text("Sarah")').first();
        if (await sarahItemOnA.count() > 0) {
            await sarahItemOnA.click();
        } else {
            await pageA.fill('#conversationSearchInput', 'Sarah');
            await pageA.waitForTimeout(300);
            await pageA.locator('.conversation-card').first().click();
        }
        await pageA.waitForTimeout(800);

        // User A sends English message
        const testEnglishMsg = "Good morning! How are you?";
        await pageA.fill('#messageComposerTextarea', testEnglishMsg);
        await pageA.press('#messageComposerTextarea', 'Enter');
        await pageA.waitForTimeout(1500);

        // User A must see original English message
        const lastMsgRowA = pageA.locator('.message-row.sent').last();
        const textContentA = await lastMsgRowA.textContent();
        assertTest('User A continues to see canonical English message', textContentA.includes(testEnglishMsg), textContentA);

        // User B must receive message translated into Tamil!
        await pageB.waitForTimeout(1500);
        const lastMsgRowB = pageB.locator('.message-row.received').last();
        const transTextB = await lastMsgRowB.locator('.msg-text-trans, .message-text-content').first().textContent();
        const hasTamilTranslation = transTextB.includes('காலை வணக்கம்') || transTextB.includes('எப்படி இருக்கிறீர்கள்');
        assertTest('User B receives automatic Tamil translation', hasTamilTranslation, transTextB.trim());

        // User B tests "Show original" toggle
        const toggleBtnB = lastMsgRowB.locator('.btn-toggle-msg-translation');
        assertTest('"Show original" toggle button exists for User B', await toggleBtnB.count() > 0);

        await toggleBtnB.click();
        await pageB.waitForTimeout(300);

        // Now original English text is visible to User B
        const origVisibleB = await lastMsgRowB.locator('.msg-text-orig').isVisible();
        const origTextB = await lastMsgRowB.locator('.msg-text-orig').textContent();
        assertTest('Clicking toggle reveals canonical English text to User B', origVisibleB && origTextB.includes(testEnglishMsg), origTextB.trim());

        // User B toggles back to "Show translation"
        await toggleBtnB.click();
        await pageB.waitForTimeout(300);
        const transVisibleB = await lastMsgRowB.locator('.msg-text-trans').isVisible();
        assertTest('Toggling back restores Tamil translation display', transVisibleB);

        // ==========================================
        // TEST SUITE 4: FEATURE B - REPLY TRANSLATION
        // USER B (Tamil) -> USER A (English)
        // ==========================================
        console.log('\n--- 4. Testing Feature B: User B (Tamil) -> User A (English) ---');
        const testTamilReply = "நான் நலமாக இருக்கிறேன்.";
        await pageB.fill('#messageComposerTextarea', testTamilReply);
        await pageB.press('#messageComposerTextarea', 'Enter');
        await pageB.waitForTimeout(1500);

        // User B must see original Tamil reply
        const lastReplyRowB = pageB.locator('.message-row.sent').last();
        const replyTextB = await lastReplyRowB.textContent();
        assertTest('User B continues to see original Tamil reply', replyTextB.includes('நான் நலமாக இருக்கிறேன்'), replyTextB.trim());

        // User A must receive English translation
        await pageA.waitForTimeout(1500);
        const lastReplyRowA = pageA.locator('.message-row.received').last();
        const replyTextA = await lastReplyRowA.locator('.msg-text-trans, .message-text-content').first().textContent();
        const hasEnglishTrans = replyTextA.toLowerCase().includes('doing well') || replyTextA.toLowerCase().includes('fine') || replyTextA.toLowerCase().includes('good');
        assertTest('User A receives automatic English translation of Tamil reply', hasEnglishTrans, replyTextA.trim());

        // User A tests "Show original" toggle to see Tamil
        const toggleBtnA = lastReplyRowA.locator('.btn-toggle-msg-translation');
        if (await toggleBtnA.count() > 0) {
            await toggleBtnA.click();
            await pageA.waitForTimeout(300);
            const origVisibleA = await lastReplyRowA.locator('.msg-text-orig').isVisible();
            const origTextA = await lastReplyRowA.locator('.msg-text-orig').textContent();
            assertTest('User A can toggle to view canonical Tamil text', origVisibleA && origTextA.includes('நான் நலமாக இருக்கிறேன்'), origTextA.trim());
        }

        // ==========================================
        // TEST SUITE 5: SETTINGS PAGE TRANSLATION PREFERENCES
        // ==========================================
        console.log('\n--- 5. Testing Settings Page Language & Translation Controls ---');
        await pageA.goto(`${BASE_URL}/settings.html`, { waitUntil: 'networkidle' });
        await pageA.waitForTimeout(500);

        const autoTranslateToggle = pageA.locator('#settingAutoTranslate');
        assertTest('Automatic message translation toggle exists in Settings', await autoTranslateToggle.count() > 0);

        const defaultViewToggle = pageA.locator('#settingDefaultViewTranslation');
        assertTest('Default view translation toggle exists in Settings', await defaultViewToggle.count() > 0);

        const langCardTa = pageA.locator('#langCardTa');
        assertTest('Tamil language card exists in Settings', await langCardTa.count() > 0);

        await userAContext.close();
        await userBContext.close();

        console.log('\n====================================================');
        console.log(`ALL TESTS PASSED! (${passedTests}/${totalTests})`);
        console.log('====================================================');

    } catch (err) {
        console.error('\nE2E TEST ERROR:', err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

runMultilingualTests();
