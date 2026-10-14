const { chromium } = require('playwright');

const BASE_URL = 'http://127.0.0.1:8000';

async function runComprehensiveTranslationAudit() {
    console.log('================================================================');
    console.log('FRANK THINK — COMPLETE LANGUAGE TRANSLATION SYSTEM AUDIT');
    console.log('================================================================');

    const browser = await chromium.launch({ headless: true });
    let passedTests = 0;
    let totalTests = 0;

    function assertTest(desc, condition, details = '') {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`[PASS] ${desc} ${details ? '-> ' + details : ''}`);
        } else {
            console.error(`[FAIL] ${desc} ${details ? '-> ' + details : ''}`);
            throw new Error(`Test assertion failed: ${desc}`);
        }
    }

    try {
        // =====================================================================
        // TEST 1: LANDING PAGE & LOGIN PAGE I18N SYNC
        // =====================================================================
        console.log('\n--- 1. Testing Landing Page Language Selector & Login Page I18n ---');
        const context1 = await browser.newContext();
        const pageLanding = await context1.newPage();
        await pageLanding.goto(`${BASE_URL}/index.html`, { waitUntil: 'networkidle' });

        // Check landing page selector
        const landingLangBtn = pageLanding.locator('.lang-btn').first();
        assertTest('Landing page language button exists', await landingLangBtn.count() > 0);

        // Switch to Tamil
        await landingLangBtn.click();
        await pageLanding.locator('.lang-option[data-lang="ta"]').first().click();
        await pageLanding.waitForTimeout(400);

        const heroTitleTa = await pageLanding.locator('#heroTitle').first().textContent();
        assertTest('Landing hero title translated to Tamil', heroTitleTa.includes('தகவல்தொடர்பு'), heroTitleTa.trim());

        // Navigate to login.html - must inherit Tamil from localStorage
        const pageLogin = await context1.newPage();
        await pageLogin.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
        await pageLogin.waitForTimeout(400);

        const loginTitleTa = await pageLogin.locator('#loginSubmitBtn .btn-text').first().textContent();
        assertTest('Login page inherits Tamil preference', loginTitleTa.includes('உள்நுழை'), loginTitleTa.trim());

        // Switch landing page to Hindi
        await landingLangBtn.click();
        await pageLanding.locator('.lang-option[data-lang="hi"]').first().click();
        await pageLanding.waitForTimeout(400);

        const heroTitleHi = await pageLanding.locator('#heroTitle').first().textContent();
        assertTest('Landing hero title translated to Hindi', heroTitleHi.includes('संचार'), heroTitleHi.trim());

        // Navigate back to English
        await landingLangBtn.click();
        await pageLanding.locator('.lang-option[data-lang="en"]').first().click();
        await pageLanding.waitForTimeout(400);

        await context1.close();

        // =====================================================================
        // TEST 2: DASHBOARD INSTANT UI TRANSLATION ACROSS ALL SECTIONS
        // =====================================================================
        console.log('\n--- 2. Testing Dashboard Instant UI Translation (EN, TA, HI) ---');
        const contextA = await browser.newContext();
        const pageA = await contextA.newPage();

        // Log in as Alex (User A)
        await pageA.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
        await pageA.fill('#loginUsername', 'alex');
        await pageA.fill('#loginPassword', 'password123');
        await pageA.click('#loginSubmitBtn');
        await pageA.waitForURL('**/dashboard.html', { timeout: 10000 });
        await pageA.waitForTimeout(1000);

        const dashLangBtn = pageA.locator('#dashLangSelector .lang-btn, .header-actions .lang-btn').first();
        assertTest('Dashboard language selector exists', await dashLangBtn.count() > 0);

        // Test Tamil
        await dashLangBtn.click();
        await pageA.locator('.lang-option[data-lang="ta"]').first().click();
        await pageA.waitForTimeout(500);

        const searchPlaceholderTa = await pageA.locator('#conversationSearchInput').getAttribute('placeholder');
        assertTest('Search placeholder translated to Tamil', searchPlaceholderTa.includes('உரையாடல்கள்') || searchPlaceholderTa.includes('தேடுங்கள்'), searchPlaceholderTa);

        const filterAllTa = await pageA.locator('.filter-chip[data-filter="all"]').textContent();
        assertTest('Filter chip All translated to Tamil', filterAllTa.includes('அனைத்தும்'), filterAllTa.trim());

        const composerTa = await pageA.locator('#messageComposerTextarea').getAttribute('placeholder');
        assertTest('Composer placeholder translated to Tamil', composerTa.includes('செய்தியை') || composerTa.includes('தட்டச்சு'), composerTa);

        // Test Hindi
        await dashLangBtn.click();
        await pageA.locator('.lang-option[data-lang="hi"]').first().click();
        await pageA.waitForTimeout(500);

        const searchPlaceholderHi = await pageA.locator('#conversationSearchInput').getAttribute('placeholder');
        assertTest('Search placeholder translated to Hindi', searchPlaceholderHi.includes('खोजें') || searchPlaceholderHi.includes('बातचीत'), searchPlaceholderHi);

        const filterAllHi = await pageA.locator('.filter-chip[data-filter="all"]').textContent();
        assertTest('Filter chip All translated to Hindi', filterAllHi.includes('सभी'), filterAllHi.trim());

        const composerHi = await pageA.locator('#messageComposerTextarea').getAttribute('placeholder');
        assertTest('Composer placeholder translated to Hindi', composerHi.includes('संदेश') || composerHi.includes('लिखें'), composerHi);

        // Reset User A to English
        await dashLangBtn.click();
        await pageA.locator('.lang-option[data-lang="en"]').first().click();
        await pageA.waitForTimeout(500);

        // =====================================================================
        // TEST 3: SMART CONVERSATIONS TABS TRANSLATION
        // =====================================================================
        console.log('\n--- 3. Testing Smart Conversations Tabs UI Translation ---');
        // Switch to Tamil to check tab titles
        await dashLangBtn.click();
        await pageA.locator('.lang-option[data-lang="ta"]').first().click();
        await pageA.waitForTimeout(400);

        const smartSummaryTa = await pageA.locator('[data-smart-tab="summary"]').textContent();
        assertTest('Smart tab Summary in Tamil', smartSummaryTa.includes('சுருக்கம்'), smartSummaryTa.trim());

        const smartMissedTa = await pageA.locator('[data-smart-tab="missed"]').textContent();
        assertTest('Smart tab Missed in Tamil', smartMissedTa.includes('தவறவிட்டவை') || smartMissedTa.includes('விடுபட்டவை'), smartMissedTa.trim());

        const smartActionsTa = await pageA.locator('[data-smart-tab="actions"]').textContent();
        assertTest('Smart tab Actions in Tamil', smartActionsTa.includes('செயல்கள்'), smartActionsTa.trim());

        const smartDecisionsTa = await pageA.locator('[data-smart-tab="decisions"]').textContent();
        assertTest('Smart tab Decisions in Tamil', smartDecisionsTa.includes('முடிவுகள்'), smartDecisionsTa.trim());

        // Reset User A to English
        await dashLangBtn.click();
        await pageA.locator('.lang-option[data-lang="en"]').first().click();
        await pageA.waitForTimeout(400);

        // =====================================================================
        // TEST 4: RECIPIENT-SPECIFIC CHAT TRANSLATION (USER A: EN <-> USER B: TA)
        // =====================================================================
        console.log('\n--- 4. Testing Recipient-Specific Chat Translation (EN <-> TA) ---');
        const contextB = await browser.newContext();
        const pageB = await contextB.newPage();

        // Log in as Sarah (User B)
        await pageB.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
        await pageB.fill('#loginUsername', 'sarah');
        await pageB.fill('#loginPassword', 'password123');
        await pageB.click('#loginSubmitBtn');
        await pageB.waitForURL('**/dashboard.html', { timeout: 10000 });
        await pageB.waitForTimeout(1000);

        // Set User B language preference to Tamil (ta)
        const pageBLangBtn = pageB.locator('#dashLangSelector .lang-btn, .header-actions .lang-btn').first();
        await pageBLangBtn.click();
        await pageB.locator('.lang-option[data-lang="ta"]').first().click();
        await pageB.waitForTimeout(600);

        // Open chat with Sarah on User A's page
        const sarahCardA = pageA.locator('.conversation-card:has-text("Sarah")').first();
        if (await sarahCardA.count() > 0) {
            await sarahCardA.click();
        } else {
            await pageA.fill('#conversationSearchInput', 'Sarah');
            await pageA.waitForTimeout(300);
            await pageA.locator('.conversation-card').first().click();
        }
        await pageA.waitForTimeout(800);

        // Open chat with Alex on User B's page
        const alexCardB = pageB.locator('.conversation-card:has-text("Alex")').first();
        if (await alexCardB.count() > 0) {
            await alexCardB.click();
        } else {
            await pageB.fill('#conversationSearchInput', 'Alex');
            await pageB.waitForTimeout(300);
            await pageB.locator('.conversation-card').first().click();
        }
        await pageB.waitForTimeout(800);

        // User A sends English message
        const testEnglishMsg = "How are you doing today?";
        await pageA.fill('#messageComposerTextarea', testEnglishMsg);
        await pageA.press('#messageComposerTextarea', 'Enter');
        await pageA.waitForTimeout(1800);

        // User A sees original English
        const lastSentA = pageA.locator('.message-row.sent').last();
        const sentTextA = await lastSentA.textContent();
        assertTest('User A sees original English message', sentTextA.includes(testEnglishMsg), sentTextA.trim());

        // User B receives translated Tamil message
        await pageB.waitForTimeout(1800);
        const lastRecvB = pageB.locator('.message-row.received').last();
        const recvTextB = await lastRecvB.locator('.msg-text-trans, .message-text-content').first().textContent();
        const isTamil = recvTextB.includes('எப்படி') || recvTextB.includes('நலமா') || /[\u0B80-\u0BFF]/.test(recvTextB);
        assertTest('User B receives automatic Tamil translation', isTamil, recvTextB.trim());

        // User B toggles "Show original"
        const toggleBtnB = lastRecvB.locator('.btn-toggle-msg-translation');
        assertTest('Show original button exists on User B message', await toggleBtnB.count() > 0);
        await toggleBtnB.click();
        await pageB.waitForTimeout(300);

        const origVisibleB = await lastRecvB.locator('.msg-text-orig').isVisible();
        const origTextB = await lastRecvB.locator('.msg-text-orig').textContent();
        assertTest('User B can view original English message', origVisibleB && origTextB.includes(testEnglishMsg), origTextB.trim());

        // User B toggles back to Tamil
        await toggleBtnB.click();
        await pageB.waitForTimeout(300);
        assertTest('User B can toggle back to Tamil translation', await lastRecvB.locator('.msg-text-trans').isVisible());

        // User B replies in Tamil
        const testTamilReply = "நான் நன்றாக இருக்கிறேன், நன்றி!";
        await pageB.fill('#messageComposerTextarea', testTamilReply);
        await pageB.press('#messageComposerTextarea', 'Enter');
        await pageB.waitForTimeout(1800);

        // User B sees original Tamil reply
        const lastSentB = pageB.locator('.message-row.sent').last();
        const sentTextB = await lastSentB.textContent();
        assertTest('User B sees original Tamil reply', sentTextB.includes('நான் நன்றாக இருக்கிறேன்'), sentTextB.trim());

        // User A receives translated English reply
        await pageA.waitForTimeout(1800);
        const lastRecvA = pageA.locator('.message-row.received').last();
        const recvTextA = await lastRecvA.locator('.msg-text-trans, .message-text-content').first().textContent();
        const isEnglishReply = recvTextA.toLowerCase().includes('good') || recvTextA.toLowerCase().includes('well') || recvTextA.toLowerCase().includes('fine') || recvTextA.toLowerCase().includes('thank');
        assertTest('User A receives English translation of Tamil reply', isEnglishReply, recvTextA.trim());

        // =====================================================================
        // TEST 5: DYNAMIC MESSAGE RELOADING ON LANGUAGE CHANGE
        // =====================================================================
        console.log('\n--- 5. Testing Dynamic Message Translation on Preference Change ---');
        // Switch User B from Tamil to Hindi while viewing the chat
        await pageBLangBtn.click();
        await pageB.waitForTimeout(300);
        await pageB.locator('#dashLangSelector .lang-option[data-lang="hi"]').first().click();

        // Wait for reloaded messages to show the Hindi translation badge
        const hiBadge = pageB.locator('.message-row.received .translation-badge:has-text("HI")').last();
        await hiBadge.waitFor({ state: 'visible', timeout: 10000 });
        await pageB.waitForTimeout(300);

        // The previously received message should now be in Hindi!
        const lastRecvB_Hi = pageB.locator('.message-row.received').last();
        const recvTextB_Hi = await lastRecvB_Hi.locator('.msg-text-trans, .message-text-content').first().textContent();
        const isHindi = recvTextB_Hi.includes('आप') || recvTextB_Hi.includes('कैसे') || recvTextB_Hi.includes('हैं') || recvTextB_Hi.includes('सुप्रभात') || /[\u0900-\u097F]/.test(recvTextB_Hi);
        assertTest('Previously received message translated dynamically into Hindi on preference change', isHindi, recvTextB_Hi.trim());

        // Switch User B back to Tamil
        await pageBLangBtn.click();
        await pageB.waitForTimeout(300);
        await pageB.locator('#dashLangSelector .lang-option[data-lang="ta"]').first().click();
        const taBadge = pageB.locator('.message-row.received .translation-badge:has-text("TA")').last();
        await taBadge.waitFor({ state: 'visible', timeout: 10000 });
        await pageB.waitForTimeout(300);

        // =====================================================================
        // TEST 6: ADMIN PORTAL TRANSLATION
        // =====================================================================
        console.log('\n--- 6. Testing Admin Portal Translation ---');
        const contextAdmin = await browser.newContext();
        const pageAdmin = await contextAdmin.newPage();

        // Log in as Admin
        await pageAdmin.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
        await pageAdmin.fill('#loginUsername', 'frankline30999112@gmail.com');
        await pageAdmin.fill('#loginPassword', '#Frankline2006');
        await pageAdmin.click('#loginSubmitBtn');
        await pageAdmin.waitForURL('**/admin.html', { timeout: 10000 });
        await pageAdmin.waitForTimeout(800);

        const adminLangBtn = pageAdmin.locator('#adminLangSelector .lang-btn, .lang-btn').first();
        assertTest('Admin portal language selector exists', await adminLangBtn.count() > 0);

        // Switch Admin portal to Tamil
        await adminLangBtn.click();
        await pageAdmin.waitForTimeout(300);
        await pageAdmin.locator('#adminLangSelector .lang-option[data-lang="ta"]').first().click();
        await pageAdmin.waitForTimeout(500);

        const adminTitleTa = await pageAdmin.locator('[data-i18n="admin.systemOverviewTitle"], .section-title, #adminTopbarTitle').first().textContent();
        assertTest('Admin portal title translated to Tamil', adminTitleTa.includes('கண்ணோட்டம்') || adminTitleTa.includes('அளவீடுகள்') || adminTitleTa.includes('மேலோட்டம்') || adminTitleTa.includes('நிர்வாக'), adminTitleTa.trim());

        const adminTotalUsersLabelTa = await pageAdmin.locator('[data-i18n="admin.totalUsers"]').first().textContent();
        assertTest('Admin metric "Total Users" translated to Tamil', adminTotalUsersLabelTa.includes('மொத்த பயனர்கள்'), adminTotalUsersLabelTa.trim());

        // Switch Admin portal to Hindi
        await adminLangBtn.click();
        await pageAdmin.waitForTimeout(300);
        await pageAdmin.locator('#adminLangSelector .lang-option[data-lang="hi"]').first().click();
        await pageAdmin.waitForTimeout(500);

        const adminTotalUsersLabelHi = await pageAdmin.locator('[data-i18n="admin.totalUsers"]').first().textContent();
        assertTest('Admin metric "Total Users" translated to Hindi', adminTotalUsersLabelHi.includes('कुल उपयोगकर्ता'), adminTotalUsersLabelHi.trim());

        // Switch Admin portal back to English
        await adminLangBtn.click();
        await pageAdmin.waitForTimeout(300);
        await pageAdmin.locator('#adminLangSelector .lang-option[data-lang="en"]').first().click();
        await pageAdmin.waitForTimeout(500);

        // =====================================================================
        // TEST 7: COMPOSER PLACEHOLDER VERTICAL ALIGNMENT & RESPONSIVENESS
        // =====================================================================
        console.log('\n--- 7. Testing Composer Placeholder Alignment Desktop & Mobile ---');
        // Check Desktop composer metrics on User A page
        const composerMetricsDesktop = await pageA.evaluate(() => {
            const ta = document.getElementById('messageComposerTextarea');
            const btnAttach = document.getElementById('attachmentBtn') || document.getElementById('composerSendBtn');
            const rectTa = ta.getBoundingClientRect();
            const rectBtn = btnAttach.getBoundingClientRect();
            const style = window.getComputedStyle(ta);
            return {
                taHeight: rectTa.height,
                taY: Math.round(rectTa.y),
                btnY: Math.round(rectBtn.y),
                lineHeight: style.lineHeight,
                paddingTop: style.paddingTop,
                paddingBottom: style.paddingBottom,
                fontSize: style.fontSize
            };
        });

        assertTest('Desktop composer height is 38px', composerMetricsDesktop.taHeight >= 36 && composerMetricsDesktop.taHeight <= 40, `${composerMetricsDesktop.taHeight}px`);
        assertTest('Desktop composer vertically aligned with action buttons', Math.abs(composerMetricsDesktop.taY - composerMetricsDesktop.btnY) <= 2, `taY=${composerMetricsDesktop.taY}, btnY=${composerMetricsDesktop.btnY}`);

        // Check Mobile viewport (375x667)
        await pageA.setViewportSize({ width: 375, height: 667 });
        await pageA.evaluate(() => {
            document.getElementById('chatApp')?.classList.add('has-active-chat');
            document.getElementById('chatWindow')?.classList.add('mobile-open');
        });
        await pageA.waitForTimeout(400);

        const composerMetricsMobile = await pageA.evaluate(() => {
            const ta = document.getElementById('messageComposerTextarea');
            const rectTa = ta.getBoundingClientRect();
            const style = window.getComputedStyle(ta);
            return {
                taHeight: rectTa.height,
                fontSize: style.fontSize,
                overflowY: style.overflowY
            };
        });

        assertTest('Mobile composer height is 40px with no vertical clipping', composerMetricsMobile.taHeight >= 38 && composerMetricsMobile.taHeight <= 42, `${composerMetricsMobile.taHeight}px`);

        // Close all contexts
        await contextA.close();
        await contextB.close();
        await contextAdmin.close();

        console.log('\n================================================================');
        console.log(`ALL INTEGRATION TESTS PASSED! (${passedTests}/${totalTests})`);
        console.log('================================================================');

    } catch (err) {
        console.error('\nE2E AUDIT FAILED:', err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

runComprehensiveTranslationAudit();
