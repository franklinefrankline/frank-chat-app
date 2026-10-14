const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:8000';

async function testAuthPagesI18nAndTheme() {
    console.log('================================================================');
    console.log('   TESTING LOGIN & REGISTER LANGUAGE SELECTOR & THEME TOGGLE    ');
    console.log('================================================================\n');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        // --- 1. LOGIN PAGE ---
        console.log('--- 1. Testing login.html Language Selector & Theme Toggle ---');
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        // Verify Theme Toggle Button exists on login page
        const isLoginThemeBtn = await page.isVisible('#themeToggleBtn');
        console.log(`Login page #themeToggleBtn visible: ${isLoginThemeBtn}`);
        if (!isLoginThemeBtn) throw new Error('#themeToggleBtn not visible on login.html');

        // Test theme toggle on login page
        const initialTheme = await page.getAttribute('html', 'data-theme') || 'sandstone';
        await page.click('#themeToggleBtn');
        await page.waitForTimeout(300);
        const toggledTheme = await page.getAttribute('html', 'data-theme');
        console.log(`Login page theme toggled: ${initialTheme} -> ${toggledTheme}`);
        if (toggledTheme === initialTheme) throw new Error('Theme failed to toggle on login.html');

        // Verify Language Selector exists on login page
        const isLoginLangBtn = await page.isVisible('#loginLangSelector .lang-btn');
        console.log(`Login page language button visible: ${isLoginLangBtn}`);
        if (!isLoginLangBtn) throw new Error('Language button not visible on login.html');

        // Switch to Tamil on login page
        await page.click('#loginLangSelector .lang-btn');
        await page.waitForTimeout(200);
        await page.click('#loginLangSelector .lang-option[data-lang="ta"]');
        await page.waitForTimeout(500);

        const currentLangTa = await page.evaluate(() => window.i18n ? window.i18n.currentLang : null);
        const submitBtnTextTa = await page.textContent('#loginSubmitBtn .btn-text');
        console.log(`Current lang: ${currentLangTa}, submit button text: "${submitBtnTextTa.trim()}"`);
        if (currentLangTa !== 'ta' || !submitBtnTextTa.includes('உள்நுழை')) {
            throw new Error(`Login page failed to translate to Tamil: got "${submitBtnTextTa}"`);
        }
        console.log('[PASS] login.html successfully switched to Tamil!');

        // Switch to Hindi on login page
        await page.click('#loginLangSelector .lang-btn');
        await page.waitForTimeout(200);
        await page.click('#loginLangSelector .lang-option[data-lang="hi"]');
        await page.waitForTimeout(500);

        const currentLangHi = await page.evaluate(() => window.i18n ? window.i18n.currentLang : null);
        const submitBtnTextHi = await page.textContent('#loginSubmitBtn .btn-text');
        console.log(`Current lang: ${currentLangHi}, submit button text: "${submitBtnTextHi.trim()}"`);
        if (currentLangHi !== 'hi' || !submitBtnTextHi.includes('साइन इन')) {
            throw new Error(`Login page failed to translate to Hindi: got "${submitBtnTextHi}"`);
        }
        console.log('[PASS] login.html successfully switched to Hindi!');

        // Switch back to English
        await page.click('#loginLangSelector .lang-btn');
        await page.waitForTimeout(200);
        await page.click('#loginLangSelector .lang-option[data-lang="en"]');
        await page.waitForTimeout(300);

        // --- 2. REGISTER PAGE ---
        console.log('\n--- 2. Testing register.html Language Selector & Theme Toggle ---');
        await page.goto(`${BASE_URL}/register.html`, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        // Verify Theme Toggle Button exists on register page
        const isRegThemeBtn = await page.isVisible('#themeToggleBtn');
        console.log(`Register page #themeToggleBtn visible: ${isRegThemeBtn}`);
        if (!isRegThemeBtn) throw new Error('#themeToggleBtn not visible on register.html');

        // Verify Language Selector exists on register page
        const isRegLangBtn = await page.isVisible('#regLangSelector .lang-btn');
        console.log(`Register page language button visible: ${isRegLangBtn}`);
        if (!isRegLangBtn) throw new Error('Language button not visible on register.html');

        // Switch to Tamil on register page
        await page.click('#regLangSelector .lang-btn');
        await page.waitForTimeout(200);
        await page.click('#regLangSelector .lang-option[data-lang="ta"]');
        await page.waitForTimeout(500);

        const regCardTitleTa = await page.textContent('.auth-card-title');
        console.log(`Register card title in Tamil: "${regCardTitleTa.trim()}"`);
        if (!regCardTitleTa.includes('உருவாக்க')) {
            throw new Error(`Register page failed to translate to Tamil: got "${regCardTitleTa}"`);
        }
        console.log('[PASS] register.html successfully switched to Tamil!');

        // Switch back to English
        await page.click('#regLangSelector .lang-btn');
        await page.waitForTimeout(200);
        await page.click('#regLangSelector .lang-option[data-lang="en"]');
        await page.waitForTimeout(300);

        console.log('\n================================================================');
        console.log('   LOGIN & REGISTER I18N AND THEME TESTS PASSED COMPLETELY!    ');
        console.log('================================================================\n');

    } catch (err) {
        console.error('[TEST ERROR]', err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

testAuthPagesI18nAndTheme();
