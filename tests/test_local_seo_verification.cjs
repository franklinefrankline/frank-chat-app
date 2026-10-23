const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// 1. Read vercel.json
const vercelConfig = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'vercel.json'), 'utf8'));

// Helper: match vercel headers
function getVercelHeaders(requestPath) {
    const matchedHeaders = {};
    if (vercelConfig.headers) {
        for (const rule of vercelConfig.headers) {
            // Convert source to regex
            let pattern = rule.source
                .replace(/\(\.\*\)/g, '.*')
                .replace(/\*/g, '.*');
            const reg = new RegExp(`^${pattern}$`);
            if (reg.test(requestPath)) {
                for (const h of rule.headers) {
                    matchedHeaders[h.key.toLowerCase()] = h.value;
                }
            }
        }
    }
    return matchedHeaders;
}

// Helper: resolve vercel rewrite
function resolveRewrite(requestPath) {
    if (vercelConfig.rewrites) {
        for (const rw of vercelConfig.rewrites) {
            let pattern = rw.source
                .replace(/\(\.\*\)/g, '(.*)')
                .replace(/\*/g, '.*');
            const reg = new RegExp(`^${pattern}$`);
            const match = requestPath.match(reg);
            if (match) {
                let dest = rw.destination;
                if (dest.includes('$1') && match[1]) {
                    dest = dest.replace('$1', match[1]);
                }
                return dest;
            }
        }
    }
    return requestPath;
}

// Create a local server simulating Vercel routing
function createVercelSimulatorServer() {
    return http.createServer((req, res) => {
        const urlObj = new URL(req.url, `http://${req.headers.host}`);
        let pathname = urlObj.pathname;

        // Apply rewrite if path is not a static file with extension or is rewritten
        let targetFile = pathname.replace(/^\//, '');
        if (!targetFile) targetFile = 'index.html';

        let filePath = path.join(ROOT_DIR, targetFile);

        if (!fs.existsSync(filePath)) {
            // Check rewrite
            const rewritten = resolveRewrite(pathname);
            if (rewritten !== pathname) {
                targetFile = rewritten.replace(/^\//, '');
                filePath = path.join(ROOT_DIR, targetFile);
            }
        }

        // Apply vercel headers
        const headers = getVercelHeaders(pathname);

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            let defaultType = 'application/octet-stream';
            if (ext === '.html') defaultType = 'text/html; charset=utf-8';
            else if (ext === '.txt') defaultType = 'text/plain; charset=utf-8';
            else if (ext === '.xml') defaultType = 'application/xml; charset=utf-8';
            else if (ext === '.css') defaultType = 'text/css; charset=utf-8';
            else if (ext === '.js') defaultType = 'application/javascript; charset=utf-8';
            else if (ext === '.svg') defaultType = 'image/svg+xml';

            const responseHeaders = {
                'content-type': headers['content-type'] || defaultType,
                ...headers
            };

            res.writeHead(200, responseHeaders);
            fs.createReadStream(filePath).pipe(res);
        } else {
            // Serve 404.html like Vercel
            const notFoundPath = path.join(ROOT_DIR, '404.html');
            res.writeHead(404, {
                'content-type': 'text/html; charset=utf-8',
                'content-disposition': 'inline; filename="404.html"',
                ...headers
            });
            if (fs.existsSync(notFoundPath)) {
                fs.createReadStream(notFoundPath).pipe(res);
            } else {
                res.end('404 Not Found');
            }
        }
    });
}

function fetchLocal(port, pathname) {
    return new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}${pathname}`, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: data
                });
            });
        }).on('error', reject);
    });
}

async function runLocalTests() {
    console.log('========================================================');
    console.log('   FRANK Think - Local Routing & SEO Verification');
    console.log('========================================================\n');

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

    // 1. Check local file existence and sizes
    console.log('1. Physical file existence in root:');
    assert('robots.txt exists in root directory', fs.existsSync(path.join(ROOT_DIR, 'robots.txt')));
    assert('sitemap.xml exists in root directory', fs.existsSync(path.join(ROOT_DIR, 'sitemap.xml')));
    assert('404.html exists in root directory', fs.existsSync(path.join(ROOT_DIR, '404.html')));
    assert('vercel.json exists in root directory', fs.existsSync(path.join(ROOT_DIR, 'vercel.json')));

    const robotsContent = fs.readFileSync(path.join(ROOT_DIR, 'robots.txt'), 'utf8');
    const sitemapContent = fs.readFileSync(path.join(ROOT_DIR, 'sitemap.xml'), 'utf8');

    // 2. Validate robots.txt content
    console.log('\n2. Validating robots.txt syntax:');
    assert('Contains User-agent: *', robotsContent.includes('User-agent: *'));
    assert('Contains Allow: /', robotsContent.includes('Allow: /'));
    assert('Contains Allow: /login', robotsContent.includes('Allow: /login'));
    assert('Contains Allow: /register', robotsContent.includes('Allow: /register'));
    assert('Contains Disallow: /dashboard', robotsContent.includes('Disallow: /dashboard'));
    assert('Contains Disallow: /admin', robotsContent.includes('Disallow: /admin'));
    assert('Contains Disallow: /api/', robotsContent.includes('Disallow: /api/'));
    assert('Contains Sitemap directive', robotsContent.includes('Sitemap: https://fnk.vercel.app/sitemap.xml'));

    // 3. Validate sitemap.xml structure
    console.log('\n3. Validating sitemap.xml structure:');
    assert('XML declaration present', sitemapContent.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert('xmlns namespace correct', sitemapContent.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'));
    assert('Includes https://fnk.vercel.app/', sitemapContent.includes('<loc>https://fnk.vercel.app/</loc>'));
    assert('Includes https://fnk.vercel.app/login', sitemapContent.includes('<loc>https://fnk.vercel.app/login</loc>'));
    assert('Includes https://fnk.vercel.app/register', sitemapContent.includes('<loc>https://fnk.vercel.app/register</loc>'));
    assert('Does not include private routes', !sitemapContent.includes('/dashboard') && !sitemapContent.includes('/admin'));

    // 4. Test with local server simulating Vercel routing
    console.log('\n4. Simulating Vercel Routing locally:');
    const server = createVercelSimulatorServer();
    await new Promise(resolve => server.listen(8765, '127.0.0.1', resolve));

    try {
        // Test /robots.txt
        const resRobots = await fetchLocal(8765, '/robots.txt');
        assert('GET /robots.txt returns HTTP 200', resRobots.statusCode === 200, `Got ${resRobots.statusCode}`);
        assert('GET /robots.txt Content-Type is text/plain; charset=utf-8',
            resRobots.headers['content-type'] === 'text/plain; charset=utf-8', `Got ${resRobots.headers['content-type']}`);
        assert('GET /robots.txt Cache-Control matches vercel.json',
            resRobots.headers['cache-control'] === 'public, max-age=3600, stale-while-revalidate=86400');
        assert('GET /robots.txt body matches file', resRobots.body === robotsContent);

        // Test /sitemap.xml
        const resSitemap = await fetchLocal(8765, '/sitemap.xml');
        assert('GET /sitemap.xml returns HTTP 200', resSitemap.statusCode === 200, `Got ${resSitemap.statusCode}`);
        assert('GET /sitemap.xml Content-Type is application/xml; charset=utf-8',
            resSitemap.headers['content-type'] === 'application/xml; charset=utf-8', `Got ${resSitemap.headers['content-type']}`);
        assert('GET /sitemap.xml Cache-Control matches vercel.json',
            resSitemap.headers['cache-control'] === 'public, max-age=3600, stale-while-revalidate=86400');
        assert('GET /sitemap.xml body matches file', resSitemap.body === sitemapContent);

        // Test / (homepage)
        const resHome = await fetchLocal(8765, '/');
        assert('GET / returns HTTP 200', resHome.statusCode === 200);

        // Test /login rewrite
        const resLogin = await fetchLocal(8765, '/login');
        assert('GET /login returns HTTP 200 (rewritten to login.html)', resLogin.statusCode === 200);

        // Test /register rewrite
        const resRegister = await fetchLocal(8765, '/register');
        assert('GET /register returns HTTP 200 (rewritten to register.html)', resRegister.statusCode === 200);

        // Test unmatched route (404 handling)
        const res404 = await fetchLocal(8765, '/nonexistent-route-xyz');
        assert('GET /nonexistent-route-xyz returns HTTP 404', res404.statusCode === 404);
        assert('GET /nonexistent-route-xyz returns 404.html body', res404.body.includes('Page not found'));

    } finally {
        server.close();
    }

    console.log('\n========================================================');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('========================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runLocalTests().catch(err => {
    console.error('Test failed with error:', err);
    process.exit(1);
});
