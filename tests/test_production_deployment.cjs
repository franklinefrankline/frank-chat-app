/**
 * Automated Production Deployment Verification Suite for FRANK Think
 * Target: https://fnk.vercel.app
 */

const https = require('https');

const PROD_BASE = 'https://fnk.vercel.app';

function fetchUrl(pathname, method = 'GET', postData = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(pathname, PROD_BASE);
        const reqHeaders = { ...headers };
        if (postData) {
            reqHeaders['Content-Type'] = 'application/json';
            reqHeaders['Content-Length'] = Buffer.byteLength(postData);
        }
        const req = https.request(url, { method, headers: reqHeaders }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        });
        req.on('error', err => reject(err));
        if (postData) req.write(postData);
        req.end();
    });
}

function parseMeta(html, nameOrProp) {
    const reg = new RegExp(`<meta\\s+[^>]*(?:name|property)=["']${nameOrProp}["'][^>]*content=["']([^"']*)["']`, 'i');
    const m = html.match(reg);
    return m ? m[1] : null;
}

function parseTitle(html) {
    const m = html.match(/<title>([^<]*)<\/title>/i);
    return m ? m[1].trim() : null;
}

async function runProductionTests() {
    console.log('======================================================');
    console.log(`   FRANK Think — Live Production Verification Suite`);
    console.log(`   Target: ${PROD_BASE}`);
    console.log('======================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, message) {
        if (condition) {
            console.log(`  [PASS] ${message}`);
            passed++;
        } else {
            console.error(`  [FAIL] ${message}`);
            failed++;
        }
    }

    try {
        // 1. API Health Check
        console.log('1. Checking Live API Health:');
        const healthRes = await fetchUrl('/api/health');
        assert(healthRes.statusCode === 200, `/api/health returns 200 OK (got ${healthRes.statusCode})`);
        try {
            const hJson = JSON.parse(healthRes.body);
            assert(hJson.status === 'ok' || hJson.status === 'healthy', `API status is operational (${hJson.status})`);
            assert(hJson.database === 'connected' || hJson.database === 'operational', `Production database is connected (${hJson.database})`);
        } catch (e) {
            assert(false, `Failed to parse health JSON: ${e.message}`);
        }

        // 2. Favicon Verification
        console.log('\n2. Checking Production Favicon:');
        const favRes = await fetchUrl('/favicon.ico');
        assert(favRes.statusCode === 200, `/favicon.ico returns 200 OK (got ${favRes.statusCode})`);
        assert(favRes.body.length > 500, `Favicon contains valid binary image data (${favRes.body.length} bytes)`);

        // 3. Robots.txt Verification
        console.log('\n3. Checking Production Robots.txt:');
        const robRes = await fetchUrl('/robots.txt');
        assert(robRes.statusCode === 200, `/robots.txt returns 200 OK`);
        assert(robRes.body.includes('Sitemap: https://fnk.vercel.app/sitemap.xml'), `Contains correct production Sitemap directive`);
        assert(robRes.body.includes('Disallow: /admin*'), `Disallows /admin* from search crawlers`);
        assert(robRes.body.includes('Disallow: /dashboard*'), `Disallows /dashboard* from search crawlers`);
        assert(robRes.body.includes('Disallow: /privacy-dashboard*'), `Disallows /privacy-dashboard*`);

        // 4. Sitemap.xml Verification
        console.log('\n4. Checking Production Sitemap.xml:');
        const smRes = await fetchUrl('/sitemap.xml');
        assert(smRes.statusCode === 200, `/sitemap.xml returns 200 OK`);
        assert(smRes.body.includes('<loc>https://fnk.vercel.app/</loc>'), `Lists root canonical homepage`);
        assert(smRes.body.includes('<loc>https://fnk.vercel.app/login</loc>'), `Lists public login page`);
        assert(smRes.body.includes('<loc>https://fnk.vercel.app/register</loc>'), `Lists public register page`);
        assert(smRes.body.includes('<loc>https://fnk.vercel.app/privacy</loc>'), `Lists public privacy policy page`);

        // 5. Root Homepage SEO & Assets
        console.log('\n5. Checking Production Homepage SEO & Assets:');
        const homeRes = await fetchUrl('/');
        assert(homeRes.statusCode === 200, `Root / returns 200 OK`);
        const rawTitle = parseTitle(homeRes.body);
        const title = rawTitle ? rawTitle.replace(/&amp;/g, '&') : '';
        assert(title.includes('FRANK Think') && (title.includes('Online Office Suite') || title.includes('Chat, Connect & Collaborate')), `Title matches specification (${title})`);
        const desc = parseMeta(homeRes.body, 'description');
        assert(desc && desc.includes('FRANK Think'), `Meta description contains FRANK Think brand`);
        assert(desc && (desc.includes('document collaboration') || desc.includes('document editing')), `Meta description contains productivity keywords`);
        const canonical = homeRes.body.match(/<link\s+[^>]*rel=["']canonical["'][^>]*href=["']([^"']*)["']/i);
        assert(canonical && canonical[1] === 'https://fnk.vercel.app/', `Canonical URL is https://fnk.vercel.app/`);
        assert(homeRes.body.includes('application/ld+json'), `Structured data JSON-LD present`);
        assert(homeRes.body.includes('assets/brand/frank-logo.png'), `Brand logo present in HTML markup`);

        // 6. Query String & URL Routing
        console.log('\n6. Checking Query String & Path Routing:');
        const q1 = await fetchUrl('/?ref=test');
        assert(q1.statusCode === 200, `/?ref=test returns 200 OK`);
        const q2 = await fetchUrl('/?utm_source=google&utm_campaign=brand');
        assert(q2.statusCode === 200, `/?utm_source=google returns 200 OK`);
        const q3 = await fetchUrl('/index');
        assert(q3.statusCode === 200, `/index returns 200 OK`);
        const q4 = await fetchUrl('/home');
        assert(q4.statusCode === 200, `/home returns 200 OK`);

        // 7. Public Feature Pages
        console.log('\n7. Checking Public Feature Pages:');
        const logRes = await fetchUrl('/login');
        assert(logRes.statusCode === 200, `/login returns 200 OK`);
        assert(parseTitle(logRes.body).includes('Sign In'), `/login has Sign In title`);

        const regRes = await fetchUrl('/register');
        assert(regRes.statusCode === 200, `/register returns 200 OK`);
        assert(parseTitle(regRes.body).includes('Create an Account'), `/register has Create Account title`);

        const privRes = await fetchUrl('/privacy');
        assert(privRes.statusCode === 200, `/privacy returns 200 OK`);
        assert(parseTitle(privRes.body).includes('Privacy Policy'), `/privacy has Privacy Policy title`);

        // 8. Protected Pages Header Security (noindex)
        console.log('\n8. Checking Protected Pages Indexing Safeguards:');
        const dashRes = await fetchUrl('/dashboard.html');
        assert(dashRes.statusCode === 200, `/dashboard.html returns 200 OK`);
        const dashRobots = parseMeta(dashRes.body, 'robots');
        assert(dashRobots === 'noindex, nofollow', `Dashboard protected with noindex, nofollow`);

        const adminRes = await fetchUrl('/admin.html');
        assert(adminRes.statusCode === 200, `/admin.html returns 200 OK`);
        const adminRobots = parseMeta(adminRes.body, 'robots');
        assert(adminRobots === 'noindex, nofollow', `Admin console protected with noindex, nofollow`);

        // 9. Custom 404 Page
        console.log('\n9. Checking Custom 404 Routing:');
        const notFoundRes = await fetchUrl('/nonexistent-test-page-12345');
        assert(notFoundRes.statusCode === 404, `Nonexistent path returns 404 status (got ${notFoundRes.statusCode})`);
        assert(notFoundRes.body.includes('Page Not Found') || notFoundRes.body.includes('404'), `Returns custom 404 HTML body`);

        console.log('\n======================================================');
        console.log(`Live Production Test Summary: Passed: ${passed}, Failed: ${failed}`);
        console.log('======================================================\n');
        process.exit(failed > 0 ? 1 : 0);
    } catch (err) {
        console.error('Production test execution failed:', err);
        process.exit(1);
    }
}

runProductionTests();
