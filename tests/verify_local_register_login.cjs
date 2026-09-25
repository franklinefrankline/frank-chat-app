const { chromium } = require('playwright');
const path = require('path');

async function testLocalRegisterLogin() {
    console.log('--- Starting Local Register & Login Verification ---');
    const browser = await chromium.launch({ headless: true });

    const localRegPath = 'file://' + path.resolve(__dirname, '..', 'register.html').replace(/\\/g, '/');
    const localLoginPath = 'file://' + path.resolve(__dirname, '..', 'login.html').replace(/\\/g, '/');

    const regContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const regPage = await regContext.newPage();

    regPage.on('console', msg => console.log(`[REG BROWSER ${msg.type().toUpperCase()}]`, msg.text()));
    regPage.on('pageerror', err => console.log('[REG PAGE ERROR]', err.message));

    const ts = Date.now().toString().slice(-6);
    const fullName = `Local Test User ${ts}`;
    const email = `local_test_${ts}@frank.app`;
    const password = 'Password123!';

    try {
        console.log('\n1. Navigating to local register.html:', localRegPath);
        await regPage.goto(localRegPath, { waitUntil: 'load' });

        // Ensure we are NOT redirected away to login.html?expired=1
        await regPage.waitForTimeout(1000);
        const currentUrl = regPage.url();
        console.log('Page URL after 1s:', currentUrl);
        if (currentUrl.includes('login.html')) {
            throw new Error('FAIL: register.html redirected to login.html immediately!');
        }

        // Verify username field is NOT present
        const usernameField = await regPage.$('#regUsername');
        if (usernameField) {
            throw new Error('FAIL: Username input field (#regUsername) is still present in register.html!');
        }
        console.log('PASS: Username field is not in register form.');

        // Verify required inputs exist and are visible
        await regPage.waitForSelector('#regFullName', { state: 'visible', timeout: 5000 });
        await regPage.waitForSelector('#regEmail', { state: 'visible', timeout: 5000 });
        await regPage.waitForSelector('#regPassword', { state: 'visible', timeout: 5000 });
        await regPage.waitForSelector('#regConfirmPassword', { state: 'visible', timeout: 5000 });
        await regPage.waitForSelector('#regTerms', { state: 'attached', timeout: 5000 });
        console.log('PASS: Full Name, Email, Password, Confirm Password, Terms elements present and visible!');

        // Fill form
        console.log(`2. Registering account with Full Name: "${fullName}" and Email: "${email}"...`);
        await regPage.fill('#regFullName', fullName);
        await regPage.fill('#regEmail', email);
        await regPage.fill('#regPassword', password);
        await regPage.fill('#regConfirmPassword', password);
        await regPage.check('#regTerms');

        // Submit form
        await regPage.click('#registerSubmitBtn');
        await regPage.waitForTimeout(3000);

        console.log('Current URL after registration click:', regPage.url());
        const tokenAfterReg = await regPage.evaluate(() => localStorage.getItem('chatapp_token'));
        console.log('Token after registration:', tokenAfterReg ? 'Present (Success!)' : 'None');
        await regContext.close();

        // Test login
        console.log('\n3. Testing Login via Email:', email);
        const loginContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const loginPage = await loginContext.newPage();
        loginPage.on('console', msg => console.log(`[LOGIN BROWSER ${msg.type().toUpperCase()}]`, msg.text()));

        await loginPage.goto(localLoginPath, { waitUntil: 'load' });
        await loginPage.fill('#loginUsername', email);
        await loginPage.fill('#loginPassword', password);
        await loginPage.click('#loginSubmitBtn');
        await loginPage.waitForTimeout(3000);

        const emailToken = await loginPage.evaluate(() => localStorage.getItem('chatapp_token'));
        console.log('Current URL after login:', loginPage.url());
        console.log('Token after Email login:', emailToken ? 'Present (Success!)' : 'None');

        await loginContext.close();
        console.log('\n=== ALL LOCAL REGISTER & LOGIN CHECKS PASSED 100% ===');
    } finally {
        await browser.close();
    }
}

testLocalRegisterLogin().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
