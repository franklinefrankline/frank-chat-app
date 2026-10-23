/**
 * Test Suite: FRANK Think Complete SEO Implementation Verification
 * Tests routes, metadata, JSON-LD, sitemap, robots.txt, protected pages, and mirror synchronization.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:8000';
const ROOT_DIR = path.resolve(__dirname, '..');

function fetchUrl(pathname) {
    return new Promise((resolve, reject) => {
        const url = `${BASE_URL}${pathname}`;
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        }).on('error', (err) => reject(err));
    });
}

function parseMeta(html, nameOrProp) {
    const reg = new RegExp(`<meta\\s+[^>]*(?:name|property)=["']${nameOrProp}["'][^>]*content=["']([^"']*)["']`, 'i');
    const m = html.match(reg);
    if (m) return m[1];
    const reg2 = new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*(?:name|property)=["']${nameOrProp}["']`, 'i');
    const m2 = html.match(reg2);
    return m2 ? m2[1] : null;
}

function parseCanonical(html) {
    const m = html.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
    return m ? m[1] : null;
}

function parseTitle(html) {
    const m = html.match(/<title>([^<]*)<\/title>/i);
    return m ? m[1].trim() : null;
}

function parseJsonLd(html) {
    const m = html.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i);
    if (!m) return null;
    try {
        return JSON.parse(m[1].trim());
    } catch (e) {
        return { error: e.message };
    }
}

async function runTests() {
    console.log('======================================================');
    console.log('   FRANK Think — SEO Verification Test Suite');
    console.log('======================================================\n');

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

    // --- TEST 1: robots.txt ---
    console.log('1. Checking /robots.txt:');
    try {
        const res = await fetchUrl('/robots.txt');
        assert('Returns HTTP 200', res.statusCode === 200, `Got ${res.statusCode}`);
        assert('Content-Type is text/plain', res.headers['content-type'] && res.headers['content-type'].includes('text/plain'), res.headers['content-type']);
        assert('Contains User-agent: *', res.body.includes('User-agent: *'));
        assert('Contains Sitemap directive pointing to fnk.vercel.app', res.body.includes('Sitemap: https://fnk.vercel.app/sitemap.xml'));
        assert('Allows public root /', res.body.includes('Allow: /'));
        assert('Allows /login', res.body.includes('Allow: /login'));
        assert('Allows /register', res.body.includes('Allow: /register'));
        assert('Allows assets and styling', res.body.includes('Allow: /assets/') && res.body.includes('Allow: /css/'));
        assert('Disallows private dashboard', res.body.includes('Disallow: /dashboard'));
        assert('Disallows admin', res.body.includes('Disallow: /admin'));
        assert('Disallows api', res.body.includes('Disallow: /api/'));
    } catch (err) {
        assert('Fetch /robots.txt succeeded', false, err.message);
    }

    // --- TEST 2: sitemap.xml ---
    console.log('\n2. Checking /sitemap.xml:');
    try {
        const res = await fetchUrl('/sitemap.xml');
        assert('Returns HTTP 200', res.statusCode === 200, `Got ${res.statusCode}`);
        assert('Content-Type contains xml', res.headers['content-type'] && res.headers['content-type'].includes('xml'), res.headers['content-type']);
        assert('Contains XML declaration and urlset xmlns', res.body.includes('<?xml version="1.0"') && res.body.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
        assert('Lists primary homepage: https://fnk.vercel.app/', res.body.includes('<loc>https://fnk.vercel.app/</loc>'));
        assert('Lists login page: https://fnk.vercel.app/login', res.body.includes('<loc>https://fnk.vercel.app/login</loc>'));
        assert('Lists register page: https://fnk.vercel.app/register', res.body.includes('<loc>https://fnk.vercel.app/register</loc>'));
        assert('Does not include private chat or dashboard URLs', !res.body.includes('/dashboard') && !res.body.includes('/chat') && !res.body.includes('/admin'));
    } catch (err) {
        assert('Fetch /sitemap.xml succeeded', false, err.message);
    }

    // --- TEST 3: Homepage SEO (index.html) ---
    console.log('\n3. Checking Homepage SEO (/):');
    try {
        const res = await fetchUrl('/');
        assert('Returns HTTP 200', res.statusCode === 200, `Got ${res.statusCode}`);
        
        const title = parseTitle(res.body);
        const expectedTitle = 'FRANK Think — Chat, Connect & Collaborate';
        // Note: HTML entities might be unescaped or escaped
        const normalizedTitle = title ? title.replace(/&amp;/g, '&') : '';
        assert('Homepage Title matches specification', normalizedTitle === expectedTitle, `Got: "${title}"`);

        const desc = parseMeta(res.body, 'description');
        const expectedDesc = 'FRANK Think is a modern communication and collaboration platform for messaging, group conversations, file sharing, and document collaboration.';
        assert('Meta description matches specification', desc === expectedDesc, `Got: "${desc}"`);

        const canonical = parseCanonical(res.body);
        assert('Canonical URL is https://fnk.vercel.app/', canonical === 'https://fnk.vercel.app/', `Got: "${canonical}"`);

        // Structured Data
        const jsonLd = parseJsonLd(res.body);
        assert('Structured data JSON-LD exists and is valid JSON', jsonLd && !jsonLd.error, jsonLd ? jsonLd.error : 'Not found');
        if (jsonLd && !jsonLd.error) {
            assert('JSON-LD @context is https://schema.org', jsonLd['@context'] === 'https://schema.org');
            assert('JSON-LD @type is WebSite', jsonLd['@type'] === 'WebSite');
            assert('JSON-LD name is FRANK Think', jsonLd['name'] === 'FRANK Think');
            assert('JSON-LD alternateName is FRANK', jsonLd['alternateName'] === 'FRANK');
            assert('JSON-LD url is https://fnk.vercel.app/', jsonLd['url'] === 'https://fnk.vercel.app/');
        }

        // Open Graph
        assert('og:site_name is FRANK Think', parseMeta(res.body, 'og:site_name') === 'FRANK Think');
        assert('og:title is present', parseMeta(res.body, 'og:title')?.includes('FRANK Think'));
        assert('og:description is present', parseMeta(res.body, 'og:description')?.includes('messaging'));
        assert('og:url is https://fnk.vercel.app/', parseMeta(res.body, 'og:url') === 'https://fnk.vercel.app/');
        assert('og:image points to brand logo', parseMeta(res.body, 'og:image')?.includes('frank-logo.png'));

        // Twitter Card
        assert('twitter:card is summary_large_image', parseMeta(res.body, 'twitter:card') === 'summary_large_image');
        assert('twitter:title is present', parseMeta(res.body, 'twitter:title')?.includes('FRANK Think'));
        assert('twitter:image is present', parseMeta(res.body, 'twitter:image')?.includes('frank-logo.png'));

        // Accessibility and Semantics
        const h1Matches = res.body.match(/<h1[^>]*>/gi);
        assert('Exactly one <h1> heading present on landing page', h1Matches && h1Matches.length === 1, `Found ${h1Matches ? h1Matches.length : 0}`);

        // No noindex directive on homepage
        const robotsMeta = parseMeta(res.body, 'robots');
        assert('No noindex directive on homepage', !robotsMeta || !robotsMeta.includes('noindex'), `Robots meta: ${robotsMeta}`);
    } catch (err) {
        assert('Fetch / succeeded', false, err.message);
    }

    // --- TEST 4: Login Page SEO ---
    console.log('\n4. Checking Login Page (/login):');
    try {
        const res = await fetchUrl('/login');
        assert('Returns HTTP 200', res.statusCode === 200, `Got ${res.statusCode}`);
        const title = parseTitle(res.body);
        assert('Title is Sign In — FRANK Think', title === 'Sign In — FRANK Think', `Got: "${title}"`);
        const canonical = parseCanonical(res.body);
        assert('Canonical is https://fnk.vercel.app/login', canonical === 'https://fnk.vercel.app/login', `Got: "${canonical}"`);
        const desc = parseMeta(res.body, 'description');
        assert('Description describes sign-in', desc && desc.includes('FRANK Think'), `Got: "${desc}"`);
        const robotsMeta = parseMeta(res.body, 'robots');
        assert('Login page is indexable (no noindex)', !robotsMeta || !robotsMeta.includes('noindex'));
    } catch (err) {
        assert('Fetch /login succeeded', false, err.message);
    }

    // --- TEST 5: Register Page SEO ---
    console.log('\n5. Checking Register Page (/register):');
    try {
        const res = await fetchUrl('/register');
        assert('Returns HTTP 200', res.statusCode === 200, `Got ${res.statusCode}`);
        const title = parseTitle(res.body);
        assert('Title is Create an Account — FRANK Think', title === 'Create an Account — FRANK Think', `Got: "${title}"`);
        const canonical = parseCanonical(res.body);
        assert('Canonical is https://fnk.vercel.app/register', canonical === 'https://fnk.vercel.app/register', `Got: "${canonical}"`);
        const desc = parseMeta(res.body, 'description');
        assert('Description describes account creation', desc && desc.includes('FRANK Think'), `Got: "${desc}"`);
        const robotsMeta = parseMeta(res.body, 'robots');
        assert('Register page is indexable (no noindex)', !robotsMeta || !robotsMeta.includes('noindex'));
    } catch (err) {
        assert('Fetch /register succeeded', false, err.message);
    }

    // --- TEST 6: Protected Pages (noindex, nofollow) ---
    console.log('\n6. Checking Protected Pages for noindex, nofollow:');
    const protectedPages = [
        { path: '/dashboard.html', name: 'Dashboard' },
        { path: '/profile.html', name: 'Profile' },
        { path: '/settings.html', name: 'Settings' },
        { path: '/admin.html', name: 'Admin Console' },
        { path: '/forgot-password.html', name: 'Forgot Password' },
        { path: '/reset-password.html', name: 'Reset Password' },
        { path: '/404.html', name: '404 Page' }
    ];

    for (const p of protectedPages) {
        try {
            const res = await fetchUrl(p.path);
            const robots = parseMeta(res.body, 'robots');
            assert(`${p.name} (${p.path}) has noindex, nofollow`, robots && robots.includes('noindex') && robots.includes('nofollow'), `Got: "${robots}"`);
            const title = parseTitle(res.body);
            assert(`${p.name} has brand title mentioning FRANK Think`, title && title.includes('FRANK Think'), `Got: "${title}"`);
        } catch (err) {
            assert(`Check ${p.path} succeeded`, false, err.message);
        }
    }

    // --- TEST 7: Mirror Consistency ---
    console.log('\n7. Checking Mirror Files Consistency:');
    const mirrors = [
        path.join(ROOT_DIR, 'frontend'),
        path.join(ROOT_DIR, 'backend', 'frontend'),
        path.join(ROOT_DIR, 'api', '_backend', 'frontend')
    ];
    const testFiles = ['index.html', 'login.html', 'register.html', 'robots.txt', 'sitemap.xml'];
    for (const file of testFiles) {
        const rootContent = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
        for (const mirror of mirrors) {
            const mirrorFile = path.join(mirror, file);
            assert(`${path.relative(ROOT_DIR, mirrorFile)} exists`, fs.existsSync(mirrorFile));
            if (fs.existsSync(mirrorFile)) {
                const mirrorContent = fs.readFileSync(mirrorFile, 'utf8');
                assert(`${path.relative(ROOT_DIR, mirrorFile)} content matches root`, mirrorContent === rootContent);
            }
        }
    }

    console.log('\n======================================================');
    console.log(`Verification Summary: Passed: ${passed}, Failed: ${failed}`);
    console.log('======================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});
