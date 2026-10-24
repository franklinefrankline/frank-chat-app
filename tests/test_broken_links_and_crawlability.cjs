/**
 * Verification Script: Broken Links, Mobile Responsiveness Tags, and Public Crawlability
 */
const http = require('http');

const BASE_URL = 'http://127.0.0.1:8000';

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

function extractHrefs(html) {
    const matches = [];
    const reg = /<a\s+[^>]*href=["']([^"']*)["']/gi;
    let m;
    while ((m = reg.exec(html)) !== null) {
        matches.push(m[1]);
    }
    return matches;
}

async function run() {
    console.log('Testing public page links and crawlability...\n');
    const publicPages = ['/', '/login', '/register', '/privacy'];
    let allPassed = true;

    for (const page of publicPages) {
        const res = await fetchUrl(page);
        console.log(`Page: ${page} -> Status ${res.statusCode}`);
        if (res.statusCode !== 200) {
            console.error(`  [FAIL] Expected 200 for ${page}`);
            allPassed = false;
        }

        // Check viewport tag for mobile responsiveness
        const hasViewport = res.body.includes('name="viewport"') && res.body.includes('width=device-width');
        console.log(`  Viewport mobile meta tag present: ${hasViewport}`);
        if (!hasViewport) allPassed = false;

        // Check canonical link
        const hasCanonical = res.body.includes('rel="canonical"');
        console.log(`  Canonical link tag present: ${hasCanonical}`);
        if (!hasCanonical) allPassed = false;

        // Extract internal links
        const hrefs = extractHrefs(res.body);
        for (const href of hrefs) {
            if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) continue;
            let targetPath = href;
            if (href.startsWith('https://fnk.vercel.app')) {
                targetPath = href.replace('https://fnk.vercel.app', '') || '/';
            }
            if (!targetPath.startsWith('/')) {
                targetPath = '/' + targetPath;
            }
            try {
                const linkRes = await fetchUrl(targetPath);
                if (linkRes.statusCode >= 200 && linkRes.statusCode < 400) {
                    console.log(`    Link ${href} -> ${linkRes.statusCode} [OK]`);
                } else {
                    console.error(`    Link ${href} -> ${linkRes.statusCode} [BROKEN]`);
                    allPassed = false;
                }
            } catch (err) {
                console.error(`    Link ${href} -> ERROR: ${err.message}`);
                allPassed = false;
            }
        }
    }

    if (allPassed) {
        console.log('\n[ALL LINK AND CRAWLABILITY CHECKS PASSED]');
        process.exit(0);
    } else {
        console.error('\n[LINK AND CRAWLABILITY CHECKS FAILED]');
        process.exit(1);
    }
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
