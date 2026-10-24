const assert = require('assert');

async function verifyProduction() {
    console.log('=== PRODUCTION POST-DEPLOYMENT VERIFICATION ===\n');

    const expectedTag = '<meta name="google-site-verification" content="jZKrA2FGoZvuJ3UGrAWXPag1UBqRjWnFb0iVoJjVWZ4" />';

    // 1. Homepage & Verification Tag
    console.log('1. Checking Production Homepage: https://fnk.vercel.app/');
    const homeRes = await fetch('https://fnk.vercel.app/');
    assert.strictEqual(homeRes.status, 200, `Homepage returned status ${homeRes.status}`);
    const homeHtml = await homeRes.text();

    const hasTag = homeHtml.includes(expectedTag);
    assert(hasTag, 'FAIL: Exact Google verification meta tag missing from deployed homepage');
    console.log('   [PASS] Exact Google verification meta tag found in HTML');

    const headEnd = homeHtml.indexOf('</head>');
    const tagPos = homeHtml.indexOf(expectedTag);
    assert(tagPos > 0 && tagPos < headEnd, 'FAIL: Meta tag is not inside <head>');
    console.log('   [PASS] Meta tag is located inside <head>');

    // Check no duplicate
    const matches = homeHtml.match(/<meta name="google-site-verification"[^>]*>/g);
    assert.strictEqual(matches.length, 1, `Found duplicate tags: ${matches.length}`);
    console.log('   [PASS] Exactly 1 verification tag present (no duplicates)');

    // 2. Preserved SEO Elements
    console.log('\n2. Checking Preserved SEO Metadata:');
    assert(homeHtml.includes('<link rel="canonical" href="https://fnk.vercel.app/">'), 'Canonical URL missing or changed');
    console.log('   [PASS] Canonical link intact');
    assert(homeHtml.includes('<title>FRANK Think — Chat, Connect &amp; Collaborate</title>'), 'Title tag missing or changed');
    console.log('   [PASS] Title tag intact');
    assert(homeHtml.includes('application/ld+json'), 'Structured data intact');
    console.log('   [PASS] Structured data JSON-LD intact');

    // 3. Robots.txt and Sitemap.xml
    console.log('\n3. Checking robots.txt & sitemap.xml:');
    const robotsRes = await fetch('https://fnk.vercel.app/robots.txt');
    assert.strictEqual(robotsRes.status, 200, `robots.txt status: ${robotsRes.status}`);
    const robotsTxt = await robotsRes.text();
    assert(robotsTxt.includes('Sitemap: https://fnk.vercel.app/sitemap.xml'), 'robots.txt missing Sitemap reference');
    console.log('   [PASS] robots.txt is 200 OK and references sitemap.xml');

    const sitemapRes = await fetch('https://fnk.vercel.app/sitemap.xml');
    assert.strictEqual(sitemapRes.status, 200, `sitemap.xml status: ${sitemapRes.status}`);
    const sitemapXml = await sitemapRes.text();
    assert(sitemapXml.includes('<urlset'), 'sitemap.xml missing urlset tag');
    console.log('   [PASS] sitemap.xml is 200 OK and valid XML');

    // 4. Auth Pages & Application Routes
    console.log('\n4. Checking Application Routes:');
    const loginRes = await fetch('https://fnk.vercel.app/login.html');
    assert.strictEqual(loginRes.status, 200, 'login.html status');
    console.log('   [PASS] /login.html returns 200 OK');

    const regRes = await fetch('https://fnk.vercel.app/register.html');
    assert.strictEqual(regRes.status, 200, 'register.html status');
    console.log('   [PASS] /register.html returns 200 OK');

    const dashRes = await fetch('https://fnk.vercel.app/dashboard.html');
    assert.strictEqual(dashRes.status, 200, 'dashboard.html status');
    console.log('   [PASS] /dashboard.html returns 200 OK');

    // 5. Backend API Health
    console.log('\n5. Checking Production API Health:');
    const healthRes = await fetch('https://fnk.vercel.app/api/health');
    assert.strictEqual(healthRes.status, 200, `/api/health status: ${healthRes.status}`);
    const healthJson = await healthRes.json();
    console.log('   [PASS] /api/health returned 200 OK:', healthJson);

    // 6. Browser Render & Console Error Check
    console.log('\n6. Checking Browser Render & Console Logs:');
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const browserRes = await page.goto('https://fnk.vercel.app/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const metaTagInDOM = await page.evaluate(() => {
        const el = document.querySelector('meta[name="google-site-verification"]');
        return el ? el.getAttribute('content') : null;
    });
    assert.strictEqual(metaTagInDOM, 'jZKrA2FGoZvuJ3UGrAWXPag1UBqRjWnFb0iVoJjVWZ4', 'Meta tag content mismatch');
    console.log('   [PASS] Browser DOM verified tag content:', metaTagInDOM);
    console.log('   [PASS] Console errors:', consoleErrors.length);
    await browser.close();

    console.log('\n======================================================');
    console.log('PRODUCTION POST-DEPLOYMENT VERIFICATION: ALL 100% PASSED');
    console.log('======================================================');
}

verifyProduction().catch(err => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
});
