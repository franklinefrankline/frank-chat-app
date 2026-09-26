const { chromium } = require('playwright');
const PROD_URL = 'https://frank-chat-app.vercel.app';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function report(name, passed, detail = '') {
    totalTests++;
    if (passed) {
        passedTests++;
        console.log(`  [PASS] ${name} ${detail ? '(' + detail + ')' : ''}`);
    } else {
        failedTests++;
        console.error(`  [FAIL] ${name} - ${detail}`);
    }
}

async function runProductionTests() {
    console.log('===========================================================================');
    console.log('STARTING FULL FRANK PRODUCTION VERIFICATION SUITE');
    console.log('URL: ' + PROD_URL);
    console.log('===========================================================================');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    const consoleErrors = [];
    const failed404s = [];

    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('response', res => {
        if (res.status() === 404 && (res.url().includes('i18n') || res.url().includes('.json'))) {
            failed404s.push(res.url());
        }
    });

    try {
        console.log('\n[1] Testing Production Landing Page & Default Language...');
        await page.goto(`${PROD_URL}/index.html`, { waitUntil: 'networkidle' });

        const activeLang = await page.evaluate(() => window.i18n ? window.i18n.currentLang : null);
        report('English loads by default on production', activeLang === 'en', `Detected: ${activeLang}`);

        const heroTitleEn = await page.locator('#heroTitle').textContent();
        report('Production hero title is in English', heroTitleEn.includes('Communication, Reimagined.'));

        console.log('\n[2] Testing Language Selector Dropdown & Accessibility...');
        const langBtn = page.locator('#langDropdownBtn');
        const langDropdown = page.locator('#langDropdownMenu');

        report('Language selector exists on production', await langBtn.count() > 0);
        await langBtn.click();
        await page.waitForTimeout(200);
        report('Language dropdown opens on production', await langDropdown.evaluate(el => el.classList.contains('show')));

        console.log('\n[3] Testing Tamil Switching (Zero Reload)...');
        await page.evaluate(() => { window.__no_reload_prod = 999; });
        await langDropdown.locator('[data-lang="ta"]').click();
        await page.waitForTimeout(300);

        report('No page reload on production language switch', (await page.evaluate(() => window.__no_reload_prod)) === 999);
        const heroTitleTa = await page.locator('#heroTitle').textContent();
        report('Production hero title updated to Tamil', heroTitleTa.includes('தகவல்தொடர்பு'), `Title: "${heroTitleTa.trim()}"`);

        console.log('\n[4] Testing Hindi Switching...');
        await langBtn.click();
        await page.waitForTimeout(200);
        await langDropdown.locator('[data-lang="hi"]').click();
        await page.waitForTimeout(300);

        const heroTitleHi = await page.locator('#heroTitle').textContent();
        report('Production hero title updated to Hindi', heroTitleHi.includes('संचार'), `Title: "${heroTitleHi.trim()}"`);

        console.log('\n[5] Testing Persistence Across Page Reload...');
        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);

        const langAfterReload = await page.evaluate(() => window.i18n.currentLang);
        report('Production language persists after refresh', langAfterReload === 'hi');

        console.log('\n[6] Testing Production Login & Theme Support...');
        await page.goto(`${PROD_URL}/login.html`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(400);

        const loginBtn = page.locator('#loginSubmitBtn');
        report('Login page loads on production with localized submit button', await loginBtn.count() > 0);

        // Switch to Tamil on Login
        await page.evaluate(() => window.i18n.setLanguage('ta'));
        await page.waitForTimeout(200);
        const loginBtnTa = await loginBtn.textContent();
        report('Login submit button updates to Tamil on production', loginBtnTa.includes('உள்நுழை'), `Text: "${loginBtnTa.trim()}"`);

        // Theme test on production
        await page.evaluate(() => { if (window.theme) window.theme.apply('sandstone'); });
        await page.waitForTimeout(200);
        const themeOnProd = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
        report('Sandstone theme applied on production', themeOnProd === 'sandstone');

        console.log('\n[7] Testing Production Network & 404 Integrity...');
        report('Zero 404 translation files on production', failed404s.length === 0, `Failed: ${failed404s.join(', ') || 'None'}`);

    } catch (err) {
        console.error('Production test error:', err);
    } finally {
        await browser.close();
    }

    console.log('\n===========================================================================');
    console.log(`TOTAL PRODUCTION TESTS : ${totalTests}`);
    console.log(`TOTAL PASSED           : ${passedTests}`);
    console.log(`TOTAL FAILED           : ${failedTests}`);
    console.log(`SUCCESS RATE           : ${((passedTests / totalTests) * 100).toFixed(1)}%`);
    console.log('===========================================================================');

    if (failedTests > 0) process.exit(1);
}

runProductionTests();
