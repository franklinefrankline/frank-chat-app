/**
 * Google Search Favicon Audit Suite for FRANK Think
 * Validates Google Search Central Favicon Guidelines:
 * 1. Image is square and multiple of 48x48px (48x48 PNG provided)
 * 2. Stable, publicly accessible URL on the same domain
 * 3. HTML link tags use root-relative paths and raster-first priority
 * 4. Robots.txt does not block Googlebot-Image
 * 5. HTTP endpoints return 200 OK with correct image MIME types
 * 6. Playwright browser audit confirms clean rendering with 0 network failures
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const BASE_URL = 'http://127.0.0.1:8000';
const ROOT_DIR = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function assert(description, condition, details = '') {
    if (condition) {
        console.log(`  [PASS] ${description}`);
        passed++;
    } else {
        console.error(`  [FAIL] ${description} ${details ? '— ' + details : ''}`);
        failed++;
    }
}

function fetch(urlPath) {
    return new Promise((resolve, reject) => {
        const u = new URL(urlPath, BASE_URL);
        http.get(u, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: buf
                });
            });
        }).on('error', reject);
    });
}

function readPngDimensions(buf) {
    if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG') {
        return {
            width: buf.readUInt32BE(16),
            height: buf.readUInt32BE(20)
        };
    }
    return null;
}

function readIcoSizes(buf) {
    if (buf.length >= 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) {
        const count = buf.readUInt16LE(4);
        const sizes = [];
        for (let i = 0; i < count; i++) {
            const offset = 6 + i * 16;
            const w = buf.readUInt8(offset) || 256;
            const h = buf.readUInt8(offset + 1) || 256;
            sizes.push({ width: w, height: h });
        }
        return sizes;
    }
    return null;
}

async function runAudit() {
    console.log('======================================================');
    console.log('   FRANK Think — Google Search Favicon Audit Suite');
    console.log('======================================================\n');

    // 1. Physical Assets & Dimensions
    console.log('1. Auditing Physical Favicon Assets & Pixel Dimensions:');
    const rootFav48 = path.join(ROOT_DIR, 'favicon-48x48.png');
    assert('favicon-48x48.png exists at root', fs.existsSync(rootFav48));
    if (fs.existsSync(rootFav48)) {
        const dims = readPngDimensions(fs.readFileSync(rootFav48));
        assert('favicon-48x48.png has exactly 48x48 dimensions', dims && dims.width === 48 && dims.height === 48, JSON.stringify(dims));
    }

    const brandFav48 = path.join(ROOT_DIR, 'assets', 'brand', 'favicon-48x48.png');
    assert('assets/brand/favicon-48x48.png exists', fs.existsSync(brandFav48));
    if (fs.existsSync(brandFav48)) {
        const dims = readPngDimensions(fs.readFileSync(brandFav48));
        assert('assets/brand/favicon-48x48.png has exactly 48x48 dimensions', dims && dims.width === 48 && dims.height === 48, JSON.stringify(dims));
    }

    const brandFav96 = path.join(ROOT_DIR, 'assets', 'brand', 'frank-icon.png');
    assert('assets/brand/frank-icon.png exists (96x96 multiple of 48)', fs.existsSync(brandFav96));
    if (fs.existsSync(brandFav96)) {
        const dims = readPngDimensions(fs.readFileSync(brandFav96));
        assert('assets/brand/frank-icon.png has exactly 96x96 dimensions', dims && dims.width === 96 && dims.height === 96, JSON.stringify(dims));
    }

    const rootIco = path.join(ROOT_DIR, 'favicon.ico');
    assert('favicon.ico exists at root', fs.existsSync(rootIco));
    if (fs.existsSync(rootIco)) {
        const sizes = readIcoSizes(fs.readFileSync(rootIco));
        assert('favicon.ico contains multiple frames including 48x48', sizes && sizes.some(s => s.width === 48 && s.height === 48), JSON.stringify(sizes));
    }

    // 2. HTML Markup & Googlebot Ordering
    console.log('\n2. Auditing HTML Head Favicon Link Tags & Googlebot Ordering:');
    const htmlPages = ['index.html', 'login.html', 'register.html', 'privacy.html', '404.html'];
    for (const pageName of htmlPages) {
        const content = fs.readFileSync(path.join(ROOT_DIR, pageName), 'utf8');
        
        // Check 48x48 PNG link
        const has48Png = content.includes('<link rel="icon" type="image/png" sizes="48x48" href="/assets/brand/favicon-48x48.png">');
        assert(`${pageName}: Has 48x48 PNG favicon tag with root-relative path`, has48Png);

        // Check 96x96 PNG link
        const has96Png = content.includes('<link rel="icon" type="image/png" sizes="96x96" href="/assets/brand/frank-icon.png">');
        assert(`${pageName}: Has 96x96 PNG favicon tag with root-relative path`, has96Png);

        // Check ICO link
        const hasIco = content.includes('<link rel="icon" type="image/x-icon" href="/favicon.ico">');
        assert(`${pageName}: Has /favicon.ico icon tag with root-relative path`, hasIco);

        // Check shortcut icon link
        const hasShortcut = content.includes('<link rel="shortcut icon" href="/favicon.ico">');
        assert(`${pageName}: Has /favicon.ico shortcut icon tag`, hasShortcut);

        // Check raster before SVG ordering
        const pngIndex = content.indexOf('favicon-48x48.png');
        const svgIndex = content.indexOf('frank-icon.svg');
        assert(`${pageName}: Raster PNG is declared BEFORE SVG (critical for Googlebot)`, pngIndex !== -1 && svgIndex !== -1 && pngIndex < svgIndex);
    }

    // 3. Robots.txt Compliance for Googlebot-Image
    console.log('\n3. Auditing Robots.txt Crawlability:');
    const robotsTxt = fs.readFileSync(path.join(ROOT_DIR, 'robots.txt'), 'utf8');
    assert('robots.txt allows root /', robotsTxt.includes('Allow: /'));
    assert('robots.txt allows /assets/', robotsTxt.includes('Allow: /assets/'));
    assert('robots.txt does not disallow favicon.ico', !robotsTxt.includes('Disallow: /favicon.ico'));
    assert('robots.txt does not disallow favicon-48x48.png', !robotsTxt.includes('Disallow: /favicon-48x48.png'));

    // 4. Local Server HTTP Endpoints & Content-Type
    console.log('\n4. Auditing Local Server Favicon HTTP Responses & MIME Types:');
    try {
        const resFavIco = await fetch('/favicon.ico');
        assert('GET /favicon.ico returns 200 OK', resFavIco.statusCode === 200, `Got ${resFavIco.statusCode}`);
        assert('GET /favicon.ico Content-Type is image/x-icon', (resFavIco.headers['content-type'] || '').includes('image/x-icon') || (resFavIco.headers['content-type'] || '').includes('icon'));
        assert('GET /favicon.ico has valid non-empty body', resFavIco.body.length > 500, `${resFavIco.body.length} bytes`);

        const resFav48 = await fetch('/favicon-48x48.png');
        assert('GET /favicon-48x48.png returns 200 OK', resFav48.statusCode === 200, `Got ${resFav48.statusCode}`);
        assert('GET /favicon-48x48.png Content-Type is image/png', (resFav48.headers['content-type'] || '').includes('image/png'));
        assert('GET /favicon-48x48.png has valid non-empty body', resFav48.body.length > 500, `${resFav48.body.length} bytes`);

        const resBrandFav48 = await fetch('/assets/brand/favicon-48x48.png');
        assert('GET /assets/brand/favicon-48x48.png returns 200 OK', resBrandFav48.statusCode === 200, `Got ${resBrandFav48.statusCode}`);
        assert('GET /assets/brand/favicon-48x48.png Content-Type is image/png', (resBrandFav48.headers['content-type'] || '').includes('image/png'));

        const resBrandFav96 = await fetch('/assets/brand/frank-icon.png');
        assert('GET /assets/brand/frank-icon.png returns 200 OK', resBrandFav96.statusCode === 200, `Got ${resBrandFav96.statusCode}`);
        assert('GET /assets/brand/frank-icon.png Content-Type is image/png', (resBrandFav96.headers['content-type'] || '').includes('image/png'));

        const resBrandSvg = await fetch('/assets/brand/frank-icon.svg');
        assert('GET /assets/brand/frank-icon.svg returns 200 OK', resBrandSvg.statusCode === 200, `Got ${resBrandSvg.statusCode}`);
        assert('GET /assets/brand/frank-icon.svg Content-Type is image/svg+xml', (resBrandSvg.headers['content-type'] || '').includes('svg'));
    } catch (err) {
        console.error('Server fetch failed:', err.message);
        failed++;
    }

    // 5. Mirror Parity Check
    console.log('\n5. Auditing Mirror Consistency:');
    const mirrorDirs = [
        path.join(ROOT_DIR, 'frontend'),
        path.join(ROOT_DIR, 'backend', 'frontend'),
        path.join(ROOT_DIR, 'api', '_backend', 'frontend')
    ];
    for (const mDir of mirrorDirs) {
        const mFav48 = path.join(mDir, 'favicon-48x48.png');
        assert(`${path.relative(ROOT_DIR, mFav48)} exists and matches root`, fs.existsSync(mFav48) && fs.readFileSync(mFav48).equals(fs.readFileSync(rootFav48)));

        const mBrandFav48 = path.join(mDir, 'assets', 'brand', 'favicon-48x48.png');
        assert(`${path.relative(ROOT_DIR, mBrandFav48)} exists and matches root`, fs.existsSync(mBrandFav48) && fs.readFileSync(mBrandFav48).equals(fs.readFileSync(brandFav48)));
    }

    // 6. Playwright Headless Browser Audit
    console.log('\n6. Playwright Headless Browser End-to-End Audit:');
    let browser;
    try {
        browser = await chromium.launch();
        const page = await browser.newPage();
        
        const consoleErrors = [];
        const failedRequests = [];
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('requestfailed', req => {
            failedRequests.push(`${req.url()} (${req.failure() ? req.failure().errorText : 'failed'})`);
        });

        await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

        // Check favicon elements in live DOM
        const domFav48 = await page.$eval('link[rel="icon"][sizes="48x48"]', el => el.getAttribute('href')).catch(() => null);
        assert('DOM has 48x48 favicon element pointing to /assets/brand/favicon-48x48.png', domFav48 === '/assets/brand/favicon-48x48.png');

        const domFavIco = await page.$eval('link[rel="icon"][href="/favicon.ico"]', el => el.getAttribute('href')).catch(() => null);
        assert('DOM has /favicon.ico element with leading slash', domFavIco === '/favicon.ico');

        const domFavSvg = await page.$eval('link[rel="icon"][type="image/svg+xml"]', el => el.getAttribute('href')).catch(() => null);
        assert('DOM has SVG favicon element with leading slash', domFavSvg === '/assets/brand/frank-icon.svg');

        assert('0 console errors on homepage with new favicon links', consoleErrors.length === 0, consoleErrors.join(', '));
        assert('0 failed network requests on homepage', failedRequests.length === 0, failedRequests.join(', '));
    } catch (err) {
        console.error('Playwright audit failed:', err.message);
        failed++;
    } finally {
        if (browser) await browser.close();
    }

    console.log('\n======================================================');
    console.log(`Google Favicon Audit Summary: Passed: ${passed}, Failed: ${failed}`);
    console.log('======================================================');

    process.exit(failed > 0 ? 1 : 0);
}

runAudit();
