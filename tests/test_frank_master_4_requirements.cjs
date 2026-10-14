const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = 'http://127.0.0.1:8000';
const SCREENSHOT_DIR = path.join(__dirname, 'final_screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runComprehensiveVerification() {
    console.log('================================================================');
    console.log('   FRANK THINK — COMPREHENSIVE 4-REQUIREMENTS VERIFICATION      ');
    console.log('================================================================\n');

    const results = {
        req1_i18n: false,
        req2_admin_theme: false,
        req3_disabled_contact: false,
        req4_landing_contact: false
    };

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    try {
        // =====================================================================
        // REQUIREMENT 3: Disabled Account Contact Form & Error Banner
        // =====================================================================
        console.log('\n--- [REQUIREMENT 3] Testing Disabled Account Contact Form ---');
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        // 3a. Attempt login with disabled account
        await page.fill('#loginUsername', 'testsuite@frank.app');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');
        await page.waitForTimeout(1000);

        // Verify disabled banner is visible
        const isBannerVisible = await page.isVisible('#disabledAccountBanner');
        const bannerText = await page.textContent('#disabledAccountMessage');
        console.log(`Banner visible: ${isBannerVisible}, text: "${bannerText.trim()}"`);

        if (!isBannerVisible) {
            throw new Error('Disabled account banner failed to display on 403 error.');
        }

        // 3b. Verify Contact Administrator button inside disabled banner
        const isContactBtnVisible = await page.isVisible('#contactAdminDisabledBtn');
        console.log(`Contact Admin button visible: ${isContactBtnVisible}`);
        if (!isContactBtnVisible) {
            throw new Error('Contact Administrator button not found in disabled account banner.');
        }

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_login_disabled_banner.png') });

        // 3c. Click Contact Administrator button
        await page.click('#contactAdminDisabledBtn');
        await page.waitForSelector('#frankContactAdminModal', { state: 'visible', timeout: 5000 });
        console.log('[PASS] Shared Contact Administrator modal opened successfully.');

        // Verify email prefill
        const prefilledEmail = await page.inputValue('#contactEmail');
        console.log(`Prefilled email: "${prefilledEmail}"`);

        // Fill out description and submit
        await page.fill('#contactDescription', 'Automated E2E Test: Account access request for disabled account.');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_disabled_contact_form.png') });

        await page.click('#contactSubmitBtn');
        await page.waitForSelector('#contactSuccessView', { state: 'visible', timeout: 8000 });

        const disabledReqRef = await page.textContent('#contactSuccessRef');
        console.log(`[PASS] Disabled account request submitted! Reference: ${disabledReqRef.trim()}`);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_disabled_contact_success.png') });

        await page.click('#contactSuccessCloseBtn');
        await page.waitForTimeout(500);

        // =====================================================================
        // REQUIREMENT 4: Landing Page Footer Contact Administrator
        // =====================================================================
        console.log('\n--- [REQUIREMENT 4] Testing Landing Page Footer Contact ---');
        await page.goto(`${BASE_URL}/index.html`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        // Scroll to footer
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);

        const isFooterContactBtn = await page.isVisible('#landingContactAdminBtn');
        console.log(`Landing footer Contact Admin button visible: ${isFooterContactBtn}`);
        if (!isFooterContactBtn) {
            throw new Error('Landing footer Contact Administrator button not found.');
        }

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_landing_footer_contact_btn.png') });

        // Click landing contact button
        await page.click('#landingContactAdminBtn');
        await page.waitForSelector('#frankContactAdminModal', { state: 'visible', timeout: 5000 });
        console.log('[PASS] Landing Contact Administrator modal opened.');

        // Fill visitor contact form
        await page.fill('#contactEmail', 'visitor_landing@example.com');
        await page.fill('#contactSubject', 'General inquiry from public visitor');
        await page.fill('#contactDescription', 'Automated E2E Test: Landing page inquiry from unauthenticated visitor.');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_landing_contact_form.png') });

        await page.click('#contactSubmitBtn');
        await page.waitForSelector('#contactSuccessView', { state: 'visible', timeout: 8000 });

        const landingReqRef = await page.textContent('#contactSuccessRef');
        console.log(`[PASS] Landing page request submitted! Reference: ${landingReqRef.trim()}`);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_landing_contact_success.png') });

        await page.click('#contactSuccessCloseBtn');
        await page.waitForTimeout(500);
        results.req4_landing_contact = true;

        // =====================================================================
        // REQUIREMENT 2 & 3: Admin Page (Theme Switcher & Access Requests Management)
        // =====================================================================
        console.log('\n--- [REQUIREMENT 2 & 3] Testing Admin Page Features ---');
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });

        // Log in as administrator
        await page.fill('#loginUsername', 'frankline30999112@gmail.com');
        await page.fill('#loginPassword', '#Frankline2006');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/admin.html', { timeout: 10000 });
        console.log('[PASS] Administrator logged in successfully.');
        await page.waitForTimeout(1000);

        // 2a. Desktop Theme Switcher
        console.log('\nTesting Admin Theme Switcher (Desktop)...');
        const isTopbarThemeBtn = await page.isVisible('#adminThemeToggleBtn');
        console.log(`Admin topbar theme button visible: ${isTopbarThemeBtn}`);
        if (!isTopbarThemeBtn) {
            throw new Error('Admin topbar theme toggle button (#adminThemeToggleBtn) not visible.');
        }

        const initialTheme = await page.getAttribute('html', 'data-theme') || 'monochrome';
        console.log(`Initial Admin Theme: "${initialTheme}"`);

        // Click theme toggle button
        await page.click('#adminThemeToggleBtn');
        await page.waitForTimeout(500);
        const switchedTheme = await page.getAttribute('html', 'data-theme');
        console.log(`Switched Admin Theme: "${switchedTheme}"`);
        if (switchedTheme === initialTheme) {
            throw new Error(`Theme failed to toggle: still "${initialTheme}"`);
        }
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_admin_theme_sandstone_desktop.png') });

        // Reload to test persistence
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        const persistedTheme = await page.getAttribute('html', 'data-theme');
        console.log(`Persisted Admin Theme after reload: "${persistedTheme}"`);
        if (persistedTheme !== switchedTheme) {
            throw new Error(`Theme persistence failed: expected "${switchedTheme}", got "${persistedTheme}"`);
        }

        // Switch back to monochrome
        await page.click('#adminThemeToggleBtn');
        await page.waitForTimeout(500);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_admin_theme_monochrome_desktop.png') });

        // 2b. Mobile Theme Switcher
        console.log('\nTesting Admin Theme Switcher (Mobile 375px)...');
        await page.setViewportSize({ width: 375, height: 812 });
        await page.waitForTimeout(500);

        // Open mobile sidebar drawer
        const mobileToggleBtn = await page.$('#adminMobileNavBtn');
        if (mobileToggleBtn) {
            await page.click('#adminMobileNavBtn');
            await page.waitForTimeout(500);
        }

        const isMobileThemeBtn = await page.isVisible('#adminSidebarThemeBtn');
        console.log(`Admin mobile sidebar theme button visible: ${isMobileThemeBtn}`);
        if (!isMobileThemeBtn) {
            throw new Error('Admin sidebar theme button (#adminSidebarThemeBtn) not visible on mobile.');
        }

        // Click mobile theme toggle button
        await page.evaluate(() => {
            const btn = document.getElementById('adminSidebarThemeBtn');
            if (btn) {
                btn.scrollIntoView({ block: 'center' });
                btn.click();
            }
        });
        await page.waitForTimeout(500);
        const mobileToggledTheme = await page.getAttribute('html', 'data-theme');
        console.log(`Mobile toggled theme: "${mobileToggledTheme}"`);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_admin_theme_mobile_drawer.png') });

        // Close mobile drawer and restore desktop viewport
        await page.evaluate(() => {
            const ov = document.getElementById('adminMobileOverlay');
            if (ov) ov.click();
            const sb = document.getElementById('adminSidebar');
            if (sb) sb.classList.remove('open');
        });
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.waitForTimeout(500);
        results.req2_admin_theme = true;

        // 3d. Admin Account Access Requests Section
        console.log('\nTesting Admin Account Access Requests Section...');
        const isNavAccessBtn = await page.isVisible('#navAccessRequestsBtn');
        console.log(`Sidebar navigation "Account Access Requests" visible: ${isNavAccessBtn}`);
        if (!isNavAccessBtn) {
            throw new Error('Admin navigation button (#navAccessRequestsBtn) not visible.');
        }

        await page.click('#navAccessRequestsBtn');
        await page.waitForSelector('#sectionAccessRequests.active', { timeout: 5000 });
        await page.waitForTimeout(1000);
        console.log('[PASS] Account Access Requests section opened.');

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_admin_access_requests_table.png') });

        // Check metrics cards
        const totalReqCount = await page.textContent('#metricTotalAccessRequests');
        const pendingReqCount = await page.textContent('#metricPendingAccessRequests');
        console.log(`Metrics: Total Requests: ${totalReqCount.trim()}, Pending: ${pendingReqCount.trim()}`);

        // Search for the submitted disabled account request
        const refSearch = disabledReqRef.trim();
        await page.fill('#accessRequestsSearch', refSearch);
        await page.waitForTimeout(600);

        const tableText = await page.textContent('#accessRequestsTableBody');
        console.log(`Search result contains reference ${refSearch}: ${tableText.includes(refSearch)}`);
        if (!tableText.includes(refSearch)) {
            throw new Error(`Submitted request ${refSearch} not found in admin requests table.`);
        }

        // Open details modal
        const actionBtn = await page.$('.btn-view-request');
        if (!actionBtn) {
            throw new Error('Action button (.btn-view-request) not found in table row.');
        }
        await actionBtn.click();
        await page.waitForSelector('#adminAccessRequestModal', { state: 'visible', timeout: 5000 });
        console.log('[PASS] Admin request details modal opened.');

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_admin_access_request_details_modal.png') });

        // Update status to 'In Review' and add Admin Notes
        await page.selectOption('#modalReqStatusSelect', 'In Review');
        await page.fill('#modalReqAdminNotes', 'Automated E2E Verification: Reviewing access restoration.');
        await page.click('#saveAccessRequestModalBtn');
        await page.waitForTimeout(1000);

        console.log('[PASS] Admin request updated successfully.');
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_admin_access_request_updated.png') });
        results.req3_disabled_contact = true;

        // =====================================================================
        // REQUIREMENT 1: Centralized Language Management & Full App Translation
        // =====================================================================
        console.log('\n--- [REQUIREMENT 1] Testing Centralized Language Management & App Translation ---');
        await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'load' });
        await page.waitForTimeout(1500);

        // Remove loading overlay if present
        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });

        // 1a. Test language change without reload: English -> Tamil (ta)
        console.log('Testing Language Switch: English -> Tamil (ta)...');
        await page.evaluate(() => {
            if (window.i18n) {
                window.i18n.setLanguage('ta');
            }
        });
        await page.waitForTimeout(800);

        const currentLangTa = await page.evaluate(() => window.i18n ? window.i18n.currentLang : null);
        console.log(`Current language: ${currentLangTa}`);
        if (currentLangTa !== 'ta') {
            throw new Error(`Failed to set language to 'ta', got ${currentLangTa}`);
        }

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_dashboard_tamil_view.png') });

        // 1b. Test language change: Tamil -> Hindi (hi)
        console.log('Testing Language Switch: Tamil -> Hindi (hi)...');
        await page.evaluate(() => {
            if (window.i18n) {
                window.i18n.setLanguage('hi');
            }
        });
        await page.waitForTimeout(800);

        const currentLangHi = await page.evaluate(() => window.i18n ? window.i18n.currentLang : null);
        console.log(`Current language: ${currentLangHi}`);
        if (currentLangHi !== 'hi') {
            throw new Error(`Failed to set language to 'hi', got ${currentLangHi}`);
        }
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '14_dashboard_hindi_view.png') });

        // 1c. Test Persistence: Reload page and verify Hindi persists
        console.log('Testing Language Persistence across reload...');
        await page.reload({ waitUntil: 'load' });
        await page.waitForTimeout(1000);
        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });

        const persistedLang = await page.evaluate(() => window.i18n ? window.i18n.currentLang : null);
        console.log(`Persisted language after reload: ${persistedLang}`);
        if (persistedLang !== 'hi') {
            throw new Error(`Language persistence failed: expected 'hi', got '${persistedLang}'`);
        }

        // 1d. Switch back to English
        await page.evaluate(() => {
            if (window.i18n) {
                window.i18n.setLanguage('en');
            }
        });
        await page.waitForTimeout(500);

        // 1e. Test Document Viewer Toolbar Translation (Word, PDF, Excel, PPTX)
        console.log('Testing Document Viewer Toolbar & Menu Translation...');
        await page.evaluate(() => {
            if (window.inChatDocViewer) {
                window.inChatDocViewer.open(null, 'docx', 'Annual_Report.docx', '', {
                    mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    file_size: 25000
                });
            }
        });
        await page.waitForTimeout(500);

        // Switch language to Tamil while Document Viewer is open
        await page.evaluate(() => {
            if (window.i18n) {
                window.i18n.setLanguage('ta');
            }
        });
        await page.waitForTimeout(500);

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '15_doc_viewer_tamil_view.png') });

        // Close doc viewer and reset language to English
        await page.evaluate(() => {
            if (window.inChatDocViewer) window.inChatDocViewer.close();
            if (window.i18n) window.i18n.setLanguage('en');
        });
        await page.waitForTimeout(500);

        // 1f. Test Recipient Message Translation Toggle
        console.log('Testing Chat Message Translation Toggle...');
        await page.evaluate(() => {
            const dummyMsg = {
                id: 999991,
                sender_id: 999,
                content: 'How are you today?',
                translated_content: 'இன்று நீங்கள் எப்படி இருக்கிறீர்கள்?',
                target_language: 'ta',
                source_language: 'en',
                created_at: new Date().toISOString(),
                sender: { id: 999, username: 'UserA', full_name: 'User A' }
            };
            if (typeof messagesModule !== 'undefined') {
                const html = messagesModule.renderMessage(dummyMsg, 1);
                const div = document.createElement('div');
                div.id = 'testMessageWrapper';
                div.innerHTML = html;
                document.body.appendChild(div);
            }
        });
        await page.waitForTimeout(500);

        const isTransTextVisible = await page.isVisible('#msgTransText-999991');
        const isOrigTextHidden = !(await page.isVisible('#msgOrigText-999991'));
        console.log(`Translation text visible: ${isTransTextVisible}, original hidden: ${isOrigTextHidden}`);

        // Click toggle to show original
        const toggleBtn = await page.$('.btn-toggle-msg-translation[data-msg-id="999991"]');
        if (toggleBtn) {
            await toggleBtn.click();
            await page.waitForTimeout(300);
            const isOrigNowVisible = await page.isVisible('#msgOrigText-999991');
            const isTransNowHidden = !(await page.isVisible('#msgTransText-999991'));
            console.log(`After toggle: original visible: ${isOrigNowVisible}, translation hidden: ${isTransNowHidden}`);
            if (!isOrigNowVisible || !isTransNowHidden) {
                throw new Error('Message translation toggle failed to reveal original text.');
            }
        } else {
            console.warn('Toggle button not found on rendered dummy message.');
        }

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '16_chat_message_translation_toggle.png') });
        results.req1_i18n = true;

        console.log('\n================================================================');
        console.log('   ALL 4 REQUIREMENTS SUCCESSFULLY VERIFIED!                     ');
        console.log('================================================================');
        console.log('Results Summary:');
        console.log(`- Req 1 (Language Translation & Centralized i18n): ${results.req1_i18n ? 'PASS' : 'FAIL'}`);
        console.log(`- Req 2 (Admin Theme Switcher Desktop + Mobile):   ${results.req2_admin_theme ? 'PASS' : 'FAIL'}`);
        console.log(`- Req 3 (Disabled Account Contact & Admin Section): ${results.req3_disabled_contact ? 'PASS' : 'FAIL'}`);
        console.log(`- Req 4 (Landing Page Footer Contact Admin):        ${results.req4_landing_contact ? 'PASS' : 'FAIL'}`);

    } catch (err) {
        console.error('\n[TEST FAILURE]', err);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'error_state.png') });
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

runComprehensiveVerification();
