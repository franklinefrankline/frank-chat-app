const { chromium } = require('playwright');

async function testLiveVercel() {
    console.log('--- Starting Live Vercel Register & Login Verification ---');
    const browser = await chromium.launch({ headless: true });

    // Use fresh context for registration
    const regContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const regPage = await regContext.newPage();

    regPage.on('console', msg => console.log(`[REG BROWSER ${msg.type().toUpperCase()}]`, msg.text()));
    regPage.on('pageerror', err => console.log('[REG PAGE ERROR]', err.message));

    const ts = Date.now().toString().slice(-6);
    const fullName = `Live Playwright User ${ts}`;
    const email = `live_pw_${ts}@frank.app`;
    const password = 'Password123!';

    try {
        // 1. Visit Register Page
        console.log('\n1. Navigating to https://frank-chat-app.vercel.app/register.html...');
        await regPage.goto('https://frank-chat-app.vercel.app/register.html', { waitUntil: 'networkidle', timeout: 30000 });

        // Verify username field is NOT present
        const usernameField = await regPage.$('#regUsername');
        if (usernameField) {
            throw new Error('FAIL: Username input field (#regUsername) is still present in register.html!');
        }
        console.log('✓ Verified: Username field has been completely removed from register form.');

        // Verify required fields exist
        await regPage.waitForSelector('#regFullName', { timeout: 10000 });
        await regPage.waitForSelector('#regEmail', { timeout: 10000 });
        await regPage.waitForSelector('#regPassword', { timeout: 10000 });
        await regPage.waitForSelector('#regConfirmPassword', { timeout: 10000 });
        await regPage.waitForSelector('#regTerms', { timeout: 10000 });
        console.log('✓ Verified: Full Name, Email, Password, Confirm Password, Terms elements present.');

        // Fill registration form
        console.log(`2. Registering account with Full Name: "${fullName}" and Email: "${email}"...`);
        await regPage.fill('#regFullName', fullName);
        await regPage.fill('#regEmail', email);
        await regPage.fill('#regPassword', password);
        await regPage.fill('#regConfirmPassword', password);
        await regPage.check('#regTerms');

        // Submit form
        await Promise.all([
            regPage.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
            regPage.click('#registerSubmitBtn')
        ]);

        await regPage.waitForTimeout(3000);
        console.log('Current URL after registration:', regPage.url());

        // Check if token exists in localStorage
        const tokenAfterReg = await regPage.evaluate(() => localStorage.getItem('chatapp_token'));
        console.log('Token after registration:', tokenAfterReg ? 'Present (Registration Success!)' : 'None');
        await regContext.close();

        // 3. Test Login via Email with a fresh browser context
        console.log(`\n3. Testing Login via Email: "${email}" in a clean browser context...`);
        const emailLoginContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const emailLoginPage = await emailLoginContext.newPage();
        emailLoginPage.on('console', msg => console.log(`[EMAIL-LOGIN ${msg.type().toUpperCase()}]`, msg.text()));

        await emailLoginPage.goto('https://frank-chat-app.vercel.app/login.html', { waitUntil: 'networkidle', timeout: 30000 });

        const labelText = await emailLoginPage.textContent('label[for="loginUsername"]');
        const placeholderText = await emailLoginPage.getAttribute('#loginUsername', 'placeholder');
        console.log('Login identifier label text:', labelText.trim());
        console.log('Login identifier placeholder:', placeholderText);

        await emailLoginPage.fill('#loginUsername', email);
        await emailLoginPage.fill('#loginPassword', password);
        await Promise.all([
            emailLoginPage.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
            emailLoginPage.click('#loginSubmitBtn')
        ]);
        await emailLoginPage.waitForTimeout(3000);

        const emailToken = await emailLoginPage.evaluate(() => localStorage.getItem('chatapp_token'));
        console.log('Current URL after Email login:', emailLoginPage.url());
        console.log('Token after Email login:', emailToken ? 'Present (Success!)' : 'None');
        if (!emailToken) {
            throw new Error('FAIL: Login with email did not produce an auth token!');
        }
        console.log('✓ Successfully logged in with Email + Password!');
        await emailLoginContext.close();

        // 4. Test Login via Full Name with a fresh browser context
        console.log(`\n4. Testing Login via Full Name: "${fullName}" in a clean browser context...`);
        const nameLoginContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const nameLoginPage = await nameLoginContext.newPage();
        nameLoginPage.on('console', msg => console.log(`[NAME-LOGIN ${msg.type().toUpperCase()}]`, msg.text()));

        await nameLoginPage.goto('https://frank-chat-app.vercel.app/login.html', { waitUntil: 'networkidle', timeout: 30000 });
        await nameLoginPage.fill('#loginUsername', fullName);
        await nameLoginPage.fill('#loginPassword', password);
        await Promise.all([
            nameLoginPage.waitForNavigation({ waitUntil: 'networkidle', timeout: 20000 }).catch(() => {}),
            nameLoginPage.click('#loginSubmitBtn')
        ]);
        await nameLoginPage.waitForTimeout(3000);

        const nameToken = await nameLoginPage.evaluate(() => localStorage.getItem('chatapp_token'));
        console.log('Current URL after Full Name login:', nameLoginPage.url());
        console.log('Token after Full Name login:', nameToken ? 'Present (Success!)' : 'None');
        if (!nameToken) {
            throw new Error('FAIL: Login with full name did not produce an auth token!');
        }
        console.log('✓ Successfully logged in with Full Name + Password!');
        await nameLoginContext.close();

        console.log('\n=============================================');
        console.log('🎉 ALL VERCEL LIVE PRODUCTION TESTS PASSED! 🎉');
        console.log('=============================================');
    } catch (err) {
        console.error('\n❌ Test Error:', err.message);
        throw err;
    } finally {
        await browser.close();
    }
}

testLiveVercel().catch(err => {
    process.exit(1);
});
