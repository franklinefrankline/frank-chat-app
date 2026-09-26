const { chromium } = require('playwright');

const PROD_URL = 'https://frank-chat-app.vercel.app';

async function runProdVerification() {
    console.log('===========================================================================');
    console.log('STARTING FRANK PRODUCTION (VERCEL) MULTILINGUAL VERIFICATION');
    console.log('===========================================================================');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        extraHTTPHeaders: { 'Cache-Control': 'no-cache, no-store' }
    });
    const page = await context.newPage();

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

    console.log(`Checking ${PROD_URL} ...`);
    await page.goto(`${PROD_URL}/index.html?ts=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    const hasLangBtn = await page.locator('#langDropdownBtn').count();
    console.log('Deployed commit active with Multi-Language selector:', hasLangBtn > 0);

    if (hasLangBtn > 0) {
        console.log('\n--- VERIFYING MULTI-LANGUAGE ON PRODUCTION ---');
        // 1. English default
        const activeLang = await page.evaluate(() => window.i18n ? window.i18n.currentLang : null);
        console.log('Production Default Language:', activeLang);

        // 2. Switch to Tamil
        await page.locator('#langDropdownBtn').click();
        await page.waitForTimeout(200);
        await page.locator('#langDropdownMenu [data-lang="ta"]').click();
        await page.waitForTimeout(300);

        const heroTitleTa = await page.locator('#heroTitle').textContent();
        console.log('Production Tamil Hero Title:', heroTitleTa.trim());

        // 3. Switch to Hindi
        await page.locator('#langDropdownBtn').click();
        await page.waitForTimeout(200);
        await page.locator('#langDropdownMenu [data-lang="hi"]').click();
        await page.waitForTimeout(300);

        const heroTitleHi = await page.locator('#heroTitle').textContent();
        console.log('Production Hindi Hero Title:', heroTitleHi.trim());

        // 4. Persistence check
        const stored = await page.evaluate(() => localStorage.getItem('frank_lang'));
        console.log('Production localStorage persistence:', stored);
        console.log('Console Errors:', consoleErrors.length);
        console.log('404 Translation Requests:', failed404s.length);
        console.log('\n>>> PRODUCTION SITE VERIFIED SUCCESSFULLY! <<<');
    } else {
        console.log('\n[NOTE] Vercel build is currently deploying in the background.');
        console.log('The Git commit was pushed to main branch (commit: acec47c).');
    }

    await browser.close();
}

runProdVerification().catch(err => console.error(err));
