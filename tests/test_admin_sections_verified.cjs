const { chromium } = require('playwright');
const path = require('path');

async function testAllAdminSections() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    console.log('1. Logging in as Administrator Frankline...');
    await page.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'networkidle' });
    await page.fill('#loginUsername', 'frankline30999112@gmail.com');
    await page.fill('#loginPassword', '#Frankline2006');
    await page.click('#loginSubmitBtn');
    await page.waitForURL('**/admin.html', { timeout: 10000 });
    console.log('✓ Redirected to admin.html');

    // 1. Overview & Metrics
    console.log('2. Verifying Overview & Metrics...');
    await page.waitForSelector('#sectionOverview.active');
    await page.waitForSelector('#metricTotalUsers');
    const totalUsers = await page.textContent('#metricTotalUsers');
    console.log(`✓ Overview loaded, Total Users: ${totalUsers.trim()}`);

    // 2. User Management
    console.log('3. Verifying User Management section...');
    await page.click('#navUsersBtn');
    await page.waitForSelector('#sectionUsers.active');
    await page.waitForSelector('#usersTableBody tr[data-user-id]');
    const userRows = await page.$$eval('#usersTableBody tr[data-user-id]', r => r.length);
    console.log(`✓ User Management active with ${userRows} user rows`);

    // 3. Groups & Channels
    console.log('4. Verifying Groups & Channels section...');
    await page.click('#navGroupsBtn');
    await page.waitForSelector('#sectionGroups.active');
    console.log('✓ Groups & Channels section active');

    // 4. Audit Logs
    console.log('5. Verifying Audit Logs section...');
    await page.click('#navAuditBtn');
    await page.waitForSelector('#sectionAudit.active');
    console.log('✓ Audit Logs section active');

    // 5. Admin Profile
    console.log('6. Verifying Admin Profile section...');
    await page.click('#navProfileBtn');
    await page.waitForSelector('#sectionProfile.active');
    const profileEmail = await page.textContent('#profileCardEmail');
    console.log(`✓ Admin Profile active for: ${profileEmail.trim()}`);

    // Return to User Management and capture screenshot
    await page.click('#navUsersBtn');
    await page.waitForSelector('#sectionUsers.active');
    await page.screenshot({ path: path.resolve(__dirname, 'admin_all_sections_verified.png') });
    console.log('✓ All sections verified successfully!');

    await browser.close();
}

testAllAdminSections().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
