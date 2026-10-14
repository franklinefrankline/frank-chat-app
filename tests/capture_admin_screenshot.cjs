const { chromium } = require('playwright');
const path = require('path');

async function testAdmin() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    console.log('Logging in as Frankline...');
    await page.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'networkidle' });
    await page.fill('#loginUsername', 'frankline30999112@gmail.com');
    await page.fill('#loginPassword', '#Frankline2006');
    await page.click('#loginSubmitBtn');

    await page.waitForURL('**/admin.html', { timeout: 10000 });
    console.log('✓ Reached admin.html');

    // Wait for overview metrics
    await page.waitForSelector('#metricTotalUsers');
    console.log('✓ Metrics loaded');

    // Click User Management
    console.log('Clicking User Management nav...');
    await page.click('#navUsersBtn');
    await page.waitForSelector('#sectionUsers.active', { timeout: 5000 });
    console.log('✓ #sectionUsers is active');

    // Wait for users table rows to populate
    await page.waitForSelector('#usersTableBody tr[data-user-id]', { timeout: 10000 });
    const rowCount = await page.$$eval('#usersTableBody tr[data-user-id]', rows => rows.length);
    console.log(`✓ Users table rendered with ${rowCount} users!`);

    const screenshotPath = path.resolve(__dirname, 'admin_user_management_fixed.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`✓ Screenshot saved to: ${screenshotPath}`);

    await browser.close();
}

testAdmin().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
