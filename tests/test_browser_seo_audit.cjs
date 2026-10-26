/**
 * Playwright Browser SEO & Accessibility Audit for FRANK Think
 */
const { chromium } = require('playwright');

const BASE_URL = 'http://127.0.0.1:8000';

async function audit() {
    console.log('======================================================');
    console.log('   Browser SEO & Console Audit (Playwright)');
    console.log('======================================================\n');

    const browser = await chromium.launch({ headless: true });
    let passed = 0;
    let failed = 0;

    function assert(desc, condition, details = '') {
        if (condition) {
            console.log(`  [PASS] ${desc}`);
            passed++;
        } else {
            console.error(`  [FAIL] ${desc} ${details ? '(' + details + ')' : ''}`);
            failed++;
        }
    }

    // 1. Desktop Landing Page
    console.log('1. Auditing Desktop Landing Page (/)...');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            // Filter expected minor network or font errors if any
            consoleErrors.push(msg.text());
        }
    });

    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

    const title = await page.title();
    assert('Page title contains FRANK Think and relevant keywords', title.includes('FRANK Think') && (title.includes('Online Office Suite') || title.includes('Chat, Connect & Collaborate')), `Got: "${title}"`);

    const metaDesc = await page.$eval('meta[name="description"]', el => el.getAttribute('content'));
    assert('Meta description is set correctly', metaDesc && metaDesc.includes('FRANK Think') && (metaDesc.includes('productivity platform') || metaDesc.includes('communication and collaboration platform')), `Got: "${metaDesc}"`);

    const canonical = await page.$eval('link[rel="canonical"]', el => el.getAttribute('href'));
    assert('Canonical URL points to https://fnk.vercel.app/', canonical === 'https://fnk.vercel.app/', `Got: "${canonical}"`);

    const ogTitle = await page.$eval('meta[property="og:title"]', el => el.getAttribute('content'));
    assert('OpenGraph title is present', ogTitle && ogTitle.includes('FRANK Think'), `Got: "${ogTitle}"`);

    const ogSiteName = await page.$eval('meta[property="og:site_name"]', el => el.getAttribute('content'));
    assert('OpenGraph site_name is "FRANK Think"', ogSiteName === 'FRANK Think', `Got: "${ogSiteName}"`);

    const jsonLdContent = await page.$eval('script[type="application/ld+json"]', el => el.textContent);
    let jsonLdObj = null;
    try {
        jsonLdObj = JSON.parse(jsonLdContent);
    } catch(e) {}
    assert('JSON-LD structured data is present and valid JSON', jsonLdObj !== null);
    if (jsonLdObj) {
        const graph = jsonLdObj['@graph'] || [jsonLdObj];
        const websiteNode = graph.find(n => n['@type'] === 'WebSite') || jsonLdObj;
        assert('JSON-LD contains WebSite schema', !!websiteNode && websiteNode['@type'] === 'WebSite');
        assert('JSON-LD name is FRANK Think', websiteNode['name'] === 'FRANK Think');
        assert('JSON-LD alternateName is FRANK', websiteNode['alternateName'] === 'FRANK');
        assert('JSON-LD url is https://fnk.vercel.app/', websiteNode['url'] === 'https://fnk.vercel.app/');
    }

    const h1Count = await page.$$eval('h1', els => els.length);
    assert('Page has exactly one <h1> heading', h1Count === 1, `Found ${h1Count}`);

    const imagesWithoutAlt = await page.$$eval('img:not([alt]), img[alt=""]', els => els.length);
    assert('All images have descriptive alt text', imagesWithoutAlt === 0, `Found ${imagesWithoutAlt} images missing alt`);

    assert('Zero console errors on homepage', consoleErrors.length === 0, consoleErrors.join(', '));

    // 2. Mobile Responsive Landing Page
    console.log('\n2. Auditing Mobile Responsive Landing Page (/)...');
    const mobilePage = await browser.newPage({
        viewport: { width: 375, height: 667 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'
    });
    await mobilePage.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

    const mobileH1Visible = await mobilePage.isVisible('#heroTitle');
    assert('Hero title is visible on mobile', mobileH1Visible);

    const mobileStartBtnVisible = await mobilePage.isVisible('#heroStartChattingBtn');
    assert('Hero CTA button is visible on mobile', mobileStartBtnVisible);

    // 3. Login Page
    console.log('\n3. Auditing Login Page (/login)...');
    const loginPage = await browser.newPage();
    await loginPage.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    const loginTitle = await loginPage.title();
    assert('Login page title is "Sign In — FRANK Think"', loginTitle === 'Sign In — FRANK Think', `Got: "${loginTitle}"`);
    const loginCanonical = await loginPage.$eval('link[rel="canonical"]', el => el.getAttribute('href'));
    assert('Login canonical is "https://fnk.vercel.app/login"', loginCanonical === 'https://fnk.vercel.app/login');

    // 4. Register Page
    console.log('\n4. Auditing Register Page (/register)...');
    const regPage = await browser.newPage();
    await regPage.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle' });
    const regTitle = await regPage.title();
    assert('Register page title is "Create an Account — FRANK Think"', regTitle === 'Create an Account — FRANK Think', `Got: "${regTitle}"`);
    const regCanonical = await regPage.$eval('link[rel="canonical"]', el => el.getAttribute('href'));
    assert('Register canonical is "https://fnk.vercel.app/register"', regCanonical === 'https://fnk.vercel.app/register');

    // 5. Dashboard Protection
    console.log('\n5. Auditing Dashboard Page Protection (/dashboard.html)...');
    const dashPage = await browser.newPage();
    // Log in to prevent unauthenticated client-side redirect
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            username: 'frankline30999112@gmail.com',
            password: '#Frankline2006'
        })
    });
    const loginData = await loginRes.json();
    await dashPage.addInitScript((token) => {
        localStorage.setItem('frank_token', token);
    }, loginData.token);

    await dashPage.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'networkidle' });
    const dashRobots = await dashPage.$eval('meta[name="robots"]', el => el.getAttribute('content'));
    assert('Dashboard has noindex, nofollow meta tag in DOM', dashRobots === 'noindex, nofollow', `Got: "${dashRobots}"`);
    const dashTitle = await dashPage.title();
    assert('Dashboard title is "Dashboard — FRANK Think"', dashTitle === 'Dashboard — FRANK Think', `Got: "${dashTitle}"`);

    await browser.close();

    console.log('\n======================================================');
    console.log(`Browser Audit Summary: Passed: ${passed}, Failed: ${failed}`);
    console.log('======================================================');

    if (failed > 0) process.exit(1);
}

audit().catch(e => {
    console.error('Audit failed:', e);
    process.exit(1);
});
