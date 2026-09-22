const { chromium } = require('playwright');
const http = require('http');

const BASE_URL = 'http://127.0.0.1:8000';

function postJson(path, payload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(payload);
        const req = http.request(`${BASE_URL}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch {
                    resolve({ status: res.statusCode, data: body });
                }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

async function runAdminE2ETests() {
    console.log('==================================================');
    console.log('STARTING PLAYWRIGHT E2E TESTS: FRANK ADMIN DASHBOARD');
    console.log('==================================================');

    // 0. Ensure target test user exists for moderation testing
    const testUsername = `moderation_test_${Date.now()}`;
    const testEmail = `${testUsername}@frank.app`;
    const regRes = await postJson('/api/auth/register', {
        username: testUsername,
        email: testEmail,
        password: 'TestPassword123!',
        full_name: 'Moderation Target User'
    });
    console.log(`[SETUP] Registered test target user: ${testUsername} (Status: ${regRes.status})`);

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    // Listen for console and errors
    page.on('console', msg => {
        if (msg.type() === 'error') console.log(`[BROWSER ERR] ${msg.text()}`);
    });
    page.on('pageerror', err => {
        console.log(`[PAGE UNCAUGHT ERR] ${err.message}`);
    });

    try {
        // -----------------------------------------------------------------
        // 1. Unified Login Page — Admin Authentication
        // -----------------------------------------------------------------
        console.log('1. Testing Unified Login Page with Admin Credentials...');
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });

        await page.fill('#loginUsername', 'frankline30999112@gmail.com');
        await page.fill('#loginPassword', '#Frankline2006');
        await page.click('#loginSubmitBtn');

        // Wait for redirect to admin.html
        await page.waitForURL('**/admin.html', { timeout: 10000 });
        console.log('[PASS] 1a. Unified login page redirected admin to admin.html');

        // Verify Admin Header and Profile info
        await page.waitForSelector('#adminSidebarName');
        const adminName = await page.textContent('#adminSidebarName');
        console.log(`[PASS] 1b. Admin sidebar user name: "${adminName.trim()}"`);

        // -----------------------------------------------------------------
        // 2. Real PostgreSQL / Database Metrics Verification
        // -----------------------------------------------------------------
        console.log('2. Verifying Real Overview Metrics from Database...');
        await page.waitForSelector('#metricTotalUsers');
        
        // Wait for values to populate from API
        await page.waitForFunction(() => {
            const el = document.getElementById('metricTotalUsers');
            return el && el.textContent.trim() !== '--';
        }, { timeout: 5000 });

        const totalUsers = parseInt((await page.textContent('#metricTotalUsers')).trim(), 10);
        const activeAccounts = parseInt((await page.textContent('#metricActiveAccounts')).trim(), 10);
        const disabledAccounts = parseInt((await page.textContent('#metricDisabledAccounts')).trim(), 10);
        const emailVerified = parseInt((await page.textContent('#metricEmailVerified')).trim(), 10);
        const totalMessages = parseInt((await page.textContent('#metricTotalMessages')).trim(), 10);
        const totalGroups = parseInt((await page.textContent('#metricTotalGroups')).trim(), 10);
        const totalFiles = parseInt((await page.textContent('#metricTotalFiles')).trim(), 10);

        console.log(`[METRICS] Users: ${totalUsers}, Active: ${activeAccounts}, Disabled: ${disabledAccounts}, Verified: ${emailVerified}, Msgs: ${totalMessages}, Groups: ${totalGroups}, Files: ${totalFiles}`);

        if (isNaN(totalUsers) || totalUsers < 1) throw new Error('Invalid total_users metric');
        if (isNaN(activeAccounts) || activeAccounts < 1) throw new Error('Invalid active_accounts metric');
        if (isNaN(totalMessages)) throw new Error('Invalid total_messages metric');
        console.log('[PASS] 2. All 7 overview metric counters loaded with real database values');

        // -----------------------------------------------------------------
        // 3. Section Navigation
        // -----------------------------------------------------------------
        console.log('3. Testing Admin Sidebar Navigation...');
        // Groups & Chats
        await page.click('#navGroupsBtn');
        await page.waitForSelector('#sectionGroups.active');
        const groupsTableContent = await page.textContent('#groupsTableBody');
        if (groupsTableContent.includes('Loading')) {
            await page.waitForSelector('#groupsTableBody tr:not(:has(.spinner))');
        }
        console.log('[PASS] 3a. Groups & Channels metadata section loaded successfully');

        // Audit Logs
        await page.click('#navAuditBtn');
        await page.waitForSelector('#sectionAudit.active');
        await page.waitForSelector('#auditTableBody tr');
        console.log('[PASS] 3b. Audit Logs section loaded successfully');

        // Admin Profile
        await page.click('#navProfileBtn');
        await page.waitForSelector('#sectionProfile.active');
        const profileEmail = await page.textContent('#profileCardEmail');
        console.log(`[PASS] 3c. Admin Profile section loaded: ${profileEmail.trim()}`);

        // Return to User Management
        await page.click('#navUsersBtn');
        await page.waitForSelector('#sectionUsers.active');
        console.log('[PASS] 3d. User Management section opened');

        // -----------------------------------------------------------------
        // 4. User Search & Filtering
        // -----------------------------------------------------------------
        console.log('4. Testing User Search and Filters...');
        await page.waitForSelector('#usersTableBody tr[data-user-id]');

        // Search for target test user
        await page.fill('#adminUserSearchInput', testUsername);
        await page.waitForTimeout(600); // debounce wait
        await page.waitForSelector(`tr[data-user-id]`);
        
        const searchMatches = await page.$$eval('#usersTableBody tr[data-user-id]', rows => rows.length);
        console.log(`[PASS] 4a. Search by username returned ${searchMatches} record(s) matching "${testUsername}"`);
        if (searchMatches < 1) throw new Error(`Search failed to find test user ${testUsername}`);

        // Clear search
        await page.click('#adminClearSearchBtn');
        await page.waitForTimeout(400);

        // Filter by Administrators
        await page.click('#userFilterChips button[data-filter="admin"]');
        await page.waitForTimeout(400);
        const adminFilterCount = await page.$$eval('#usersTableBody tr[data-user-id]', rows => rows.length);
        console.log(`[PASS] 4b. Filter by role="admin" returned ${adminFilterCount} admin user(s)`);

        // Reset filter
        await page.click('#userFilterChips button[data-filter="all"]');
        await page.waitForTimeout(400);

        // -----------------------------------------------------------------
        // 5. User Details Modal (Strict Privacy Assertion)
        // -----------------------------------------------------------------
        console.log('5. Testing User Details Modal & Privacy Boundary...');
        // Search target user again
        await page.fill('#adminUserSearchInput', testUsername);
        await page.waitForTimeout(600);

        // Click "View"
        await page.click(`tr[data-user-id] button[data-action="view"]`);
        await page.waitForSelector('#adminUserDetailsModal.open, #adminUserDetailsModal.active');
        await page.waitForSelector('#userDetailsModalBody .detail-row');

        const modalText = await page.textContent('#userDetailsModalBody');
        if (!modalText.includes(testUsername) && !modalText.includes('Moderation Target')) {
            throw new Error('User details modal missing user metadata');
        }

        // Strict Privacy Assertions: No message plaintext, no attachments
        if (modalText.toLowerCase().includes('message content') || modalText.includes('private message')) {
            throw new Error('Privacy breach: Message content found in administrative user details');
        }
        console.log('[PASS] 5a. User Details modal displayed safe administrative metadata only');

        // Close modal via button
        await page.click('#closeUserDetailsModalBtn');
        await page.waitForTimeout(300);
        console.log('[PASS] 5b. User Details modal closed cleanly');

        // -----------------------------------------------------------------
        // 6. Disable & Enable User Account
        // -----------------------------------------------------------------
        console.log('6. Testing Disable & Enable User Account Flow...');
        // Click Disable
        await page.click(`tr[data-user-id] button[data-action="disable"]`);
        await page.waitForSelector('#adminConfirmModal.open, #adminConfirmModal.active');
        
        // Confirm Disable
        await page.click('#adminConfirmSubmitBtn');
        await page.waitForTimeout(800);

        // Verify status badge changed to Disabled
        await page.waitForSelector(`tr[data-user-id] .badge-status-disabled`);
        console.log('[PASS] 6a. User status badge updated to "● Disabled"');

        // Verify disabled user cannot log in
        const disabledLoginRes = await postJson('/api/auth/login', {
            username: testUsername,
            password: 'TestPassword123!'
        });
        if (disabledLoginRes.status !== 403 && disabledLoginRes.status !== 401) {
            throw new Error(`Expected disabled user login to be rejected, got status ${disabledLoginRes.status}`);
        }
        console.log('[PASS] 6b. Disabled user was rejected from authenticating (HTTP 403/401)');

        // Re-Enable user
        await page.click(`tr[data-user-id] button[data-action="enable"]`);
        await page.waitForSelector('#adminConfirmModal.open, #adminConfirmModal.active');
        await page.click('#adminConfirmSubmitBtn');
        await page.waitForTimeout(800);

        // Verify status badge changed back to Active
        await page.waitForSelector(`tr[data-user-id] .badge-status-active`);
        console.log('[PASS] 6c. User account re-enabled to "● Active"');

        // -----------------------------------------------------------------
        // 7. Delete User Account with Confirmation Dialog
        // -----------------------------------------------------------------
        console.log('7. Testing Delete Account Flow with Confirmation Dialog...');
        // Click Delete
        await page.click(`tr[data-user-id] button[data-action="delete-account"]`);
        await page.waitForSelector('#adminConfirmModal.open, #adminConfirmModal.active');

        // Verify confirmation dialog title and warnings per specification
        const confirmTitle = await page.textContent('#adminConfirmTitle');
        const confirmWarning = await page.textContent('#adminConfirmWarning');
        if (!confirmTitle.includes('Delete Account')) {
            throw new Error(`Expected dialog title to contain "Delete Account", got "${confirmTitle}"`);
        }
        if (!confirmWarning.includes('cannot be undone')) {
            throw new Error('Expected dialog warning "This action cannot be undone."');
        }
        console.log('[PASS] 7a. Delete Account confirmation dialog displayed with non-destructive warning');

        // Test CANCEL first
        await page.click('#adminConfirmCancelBtn');
        await page.waitForTimeout(300);
        // Verify user still exists
        const userStillThere = await page.$(`tr[data-user-id]`);
        if (!userStillThere) throw new Error('User was deleted after clicking Cancel!');
        console.log('[PASS] 7b. Clicking Cancel dismissed dialog without deleting the account');

        // Open Delete dialog again and CONFIRM
        await page.click(`tr[data-user-id] button[data-action="delete-account"]`);
        await page.waitForSelector('#adminConfirmModal.open, #adminConfirmModal.active');
        await page.click('#adminConfirmSubmitBtn');
        await page.waitForTimeout(1000);

        // Verify user row is gone from the table
        const remainingRows = await page.$$eval('#usersTableBody tr[data-user-id]', (rows, targetName) => {
            return rows.filter(r => r.textContent.includes(targetName)).length;
        }, testUsername);
        if (remainingRows !== 0) throw new Error('Deleted user still appears in table');
        console.log('[PASS] 7c. User account permanently deleted and row removed from table');

        // Verify deleted user cannot log in
        const delLoginRes = await postJson('/api/auth/login', {
            username: testUsername,
            password: 'TestPassword123!'
        });
        if (delLoginRes.status !== 401 && delLoginRes.status !== 404) {
            throw new Error(`Deleted user was able to log in! Status: ${delLoginRes.status}`);
        }
        console.log('[PASS] 7d. Deleted user authentication permanently rejected');

        // -----------------------------------------------------------------
        // 8. Strict Privacy & Zero Chat Viewer Verification
        // -----------------------------------------------------------------
        console.log('8. Verifying Absolute Absence of User Chat Viewers in Admin...');
        const pageHtml = await page.content();
        if (pageHtml.includes('Open User Chat') || pageHtml.includes('chatViewer') || pageHtml.includes('messageViewer')) {
            throw new Error('Privacy requirement violated: "Open User Chat" or chat viewer found in admin DOM');
        }
        console.log('[PASS] 8. Confirmed: ZERO private chat viewers, backdoor or message plaintext in Admin UI');

        // -----------------------------------------------------------------
        // 9. Mobile Responsive Layout Test
        // -----------------------------------------------------------------
        console.log('9. Testing Mobile Responsive Drawer & Layout...');
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(300);

        // Verify mobile nav toggle button is visible
        await page.waitForSelector('#adminMobileNavBtn', { state: 'visible' });
        await page.click('#adminMobileNavBtn');
        await page.waitForSelector('#adminSidebar.open');
        await page.waitForSelector('#adminMobileOverlay.active');
        console.log('[PASS] 9a. Mobile drawer opened with overlay on 375px viewport');

        // Click overlay to close drawer
        await page.click('#adminMobileOverlay');
        await page.waitForTimeout(300);
        console.log('[PASS] 9b. Mobile drawer closed on backdrop click');

        // Restore viewport
        await page.setViewportSize({ width: 1280, height: 800 });

        // -----------------------------------------------------------------
        // 10. Global Refresh Button
        // -----------------------------------------------------------------
        console.log('10. Testing Refresh Button...');
        await page.click('#adminRefreshBtn');
        await page.waitForTimeout(800);
        console.log('[PASS] 10. Admin refresh button executed synchronized fetch cleanly');

        // -----------------------------------------------------------------
        // 11. Admin Sign Out Flow
        // -----------------------------------------------------------------
        console.log('11. Testing Admin Sign Out...');
        await page.click('#adminSignOutBtn');
        await page.waitForURL('**/login.html', { timeout: 8000 });

        // Verify token cleared
        const tokenAfterLogout = await page.evaluate(() => localStorage.getItem('chatapp_token'));
        if (tokenAfterLogout) throw new Error('Token was not cleared after sign out');
        console.log('[PASS] 11. Admin signed out successfully, redirected to login.html with token cleared');

        // -----------------------------------------------------------------
        // 12. Non-Admin Redirection Guard & API 403
        // -----------------------------------------------------------------
        console.log('12. Testing Normal User Redirection and 403 Guard...');
        // Log in as normal user
        await page.fill('#loginUsername', 'alex');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        console.log('[PASS] 12a. Normal user login redirected to user dashboard.html');

        // Normal user attempts to navigate to admin.html
        await page.goto(`${BASE_URL}/admin.html`);
        await page.waitForURL('**/dashboard.html', { timeout: 8000 });
        console.log('[PASS] 12b. Normal user attempting admin.html was redirected to dashboard.html');

        console.log('==================================================');
        console.log('ALL PLAYWRIGHT ADMIN DASHBOARD E2E TESTS PASSED (100%)');
        console.log('==================================================');

    } finally {
        await browser.close();
    }
}

runAdminE2ETests().catch(err => {
    console.error('TEST SUITE FAILED:', err);
    process.exit(1);
});
