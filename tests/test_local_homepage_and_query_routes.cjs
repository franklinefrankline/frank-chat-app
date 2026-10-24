// tests/test_local_homepage_and_query_routes.cjs
// Comprehensive test suite for root homepage, query strings, and custom 404 page

const assert = require('assert');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';

async function runTests() {
    console.log('===========================================================');
    console.log('   FRANK Think — Homepage & Query Routing Test Suite');
    console.log(`   Target Server: ${BASE_URL}`);
    console.log('===========================================================\n');

    const cases = [
        // Root homepage with and without query strings
        { path: '/', expStatus: 200, expText: 'Communication, Reimagined.', name: 'Root URL /' },
        { path: '/?ref=test', expStatus: 200, expText: 'Communication, Reimagined.', name: 'Root with single query string (?ref=test)' },
        { path: '/?utm_source=google&utm_medium=cpc&utm_campaign=brand', expStatus: 200, expText: 'Communication, Reimagined.', name: 'Root with complex marketing query string' },
        { path: '/?fbclid=IwAR1234567890abcdef', expStatus: 200, expText: 'Communication, Reimagined.', name: 'Root with click tracking query string' },
        { path: '/?v=2026.1&t=' + Date.now(), expStatus: 200, expText: 'Communication, Reimagined.', name: 'Root with cache-busting query string' },
        { path: '/?p=home&lang=en', expStatus: 200, expText: 'Communication, Reimagined.', name: 'Root with multiple parameters' },

        // Clean aliases for homepage
        { path: '/index', expStatus: 200, expText: 'Communication, Reimagined.', name: 'Clean /index' },
        { path: '/index?ref=google', expStatus: 200, expText: 'Communication, Reimagined.', name: 'Clean /index with query string' },
        { path: '/home', expStatus: 200, expText: 'Communication, Reimagined.', name: 'Clean /home' },
        { path: '/home?ref=direct', expStatus: 200, expText: 'Communication, Reimagined.', name: 'Clean /home with query string' },
        { path: '/index.html', expStatus: 200, expText: 'Communication, Reimagined.', name: 'Explicit /index.html' },
        { path: '/index.html?ref=test', expStatus: 200, expText: 'Communication, Reimagined.', name: 'Explicit /index.html with query string' },

        // Supported public routes with query parameters
        { path: '/login?redirect=/dashboard', expStatus: 200, expText: 'Sign In', name: '/login with redirect param' },
        { path: '/register?ref=partner', expStatus: 200, expText: 'Create an Account', name: '/register with partner param' },
        { path: '/privacy?lang=en', expStatus: 200, expText: 'Privacy Policy', name: '/privacy with lang param' },

        // Custom 404 page preservation
        { path: '/404', expStatus: 404, expText: 'Page not found', name: 'Dedicated /404 path returns custom 404 HTML' },
        { path: '/404.html', expStatus: 200, expText: 'Page not found', name: 'Direct /404.html asset' },
        { path: '/nonexistent-route-xyz', expStatus: 404, expText: 'Page not found', name: 'Non-existent web route returns custom 404 HTML' },
        { path: '/missing-page?query=true', expStatus: 404, expText: 'Page not found', name: 'Non-existent route with query string returns custom 404 HTML' },

        // API routes preservation
        { path: '/api/health', expStatus: 200, expText: 'database', name: 'API health endpoint returns 200' },
        { path: '/api/nonexistent-endpoint-12345', expStatus: 404, expText: 'detail', name: 'Non-existent API endpoint returns 404 JSON (not HTML)' }
    ];

    let passed = 0;
    let failed = 0;

    for (const c of cases) {
        try {
            const res = await fetch(`${BASE_URL}${c.path}`);
            const text = await res.text();
            const statusOk = res.status === c.expStatus;
            const textOk = text.includes(c.expText);

            if (statusOk && textOk) {
                console.log(`  [PASS] ${c.name} (${c.path}) -> Status ${res.status}`);
                passed++;
            } else {
                console.error(`  [FAIL] ${c.name} (${c.path}) -> Status ${res.status} (expected ${c.expStatus}), content match: ${textOk}`);
                failed++;
            }
        } catch (err) {
            console.error(`  [ERROR] ${c.name} (${c.path}) -> ${err.message}`);
            failed++;
        }
    }

    console.log('\n===========================================================');
    console.log(`Summary: Passed: ${passed}, Failed: ${failed}, Total: ${cases.length}`);
    console.log('===========================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
