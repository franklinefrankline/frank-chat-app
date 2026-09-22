const { chromium } = require('playwright');

async function run() {
    console.log('--- Starting Full Live Vercel Form UI E2E Test ---');
    const browser = await chromium.launch({ headless: true });

    const ts = Date.now().toString().slice(-6);
    const fullName = 'UI Full Name User ' + ts;
    const email = 'ui_user_' + ts + '@gmail.com';
    const password = 'Password123!';

    try {
        // --- Step 1: Verify Registration without Username ---
        console.log('\n--- Step 1: Verify Registration without Username ---');
        const regContext = await browser.newContext();
        const regPage = await regContext.newPage();
        await regPage.goto('https://frank-chat-app.vercel.app/register.html', { waitUntil: 'networkidle', timeout: 30000 });

        const usernameField = await regPage.$('#regUsername');
        console.log('Is #regUsername present?', !!usernameField);
        if (usernameField) throw new Error('#regUsername is still present in register.html!');
        console.log('✓ Username field verified absent from register form.');

        await regPage.fill('#regFullName', fullName);
        await regPage.fill('#regEmail', email);
        await regPage.fill('#regPassword', password);
        await regPage.fill('#regConfirmPassword', password);
        await regPage.check('#regTerms');
        await regPage.click('#registerSubmitBtn');

        await regPage.waitForURL('**/dashboard.html', { timeout: 15000 });
        console.log('✓ Successfully registered and redirected to:', regPage.url());
        await regContext.close();

        // --- Step 2: Login via Full Name (fresh isolated context) ---
        console.log('\n--- Step 2: Login via Full Name ---');
        const nameContext = await browser.newContext();
        const namePage = await nameContext.newPage();
        namePage.on('console', msg => console.log('[NAME-LOGIN]', msg.text()));

        await namePage.goto('https://frank-chat-app.vercel.app/login.html', { waitUntil: 'networkidle', timeout: 30000 });

        const label = await namePage.textContent('label[for="loginUsername"]');
        const ph = await namePage.getAttribute('#loginUsername', 'placeholder');
        console.log('Login field label:', label.trim());
        console.log('Login field placeholder:', ph);

        await namePage.fill('#loginUsername', fullName);
        await namePage.fill('#loginPassword', password);
        await namePage.click('#loginSubmitBtn');
        await namePage.waitForURL('**/dashboard.html', { timeout: 15000 });
        console.log('✓ Successfully logged in with FULL NAME and redirected to:', namePage.url());
        await nameContext.close();

        // --- Step 3: Login via Email (fresh isolated context) ---
        console.log('\n--- Step 3: Login via Email ---');
        const emailContext = await browser.newContext();
        const emailPage = await emailContext.newPage();
        emailPage.on('console', msg => console.log('[EMAIL-LOGIN]', msg.text()));

        await emailPage.goto('https://frank-chat-app.vercel.app/login.html', { waitUntil: 'networkidle', timeout: 30000 });

        await emailPage.fill('#loginUsername', email);
        await emailPage.fill('#loginPassword', password);
        await emailPage.click('#loginSubmitBtn');
        await emailPage.waitForURL('**/dashboard.html', { timeout: 15000 });
        console.log('✓ Successfully logged in with EMAIL and redirected to:', emailPage.url());
        await emailContext.close();

        console.log('\n======================================================');
        console.log('🎉 ALL FORM UI STEPS PASSED WITH COMPLETE REDIRECTS! 🎉');
        console.log('======================================================');
    } catch (err) {
        console.error('Test failed:', err);
        throw err;
    } finally {
        await browser.close();
    }
}

run().catch(() => process.exit(1));
