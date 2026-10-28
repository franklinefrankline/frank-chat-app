/**
 * Google Search Favicon Audit Suite for FRANK Think
 * Validates Google Search Central Favicon Guidelines:
 * 1. Image is square high-res PNG (512x512) and 48x48 multiple of 48px
 * 2. Stable, publicly accessible root URLs (/favicon.png, /favicon.ico, /apple-touch-icon.png)
 * 3. HTML head link tags use canonical, non-conflicting root-relative paths
 * 4. Robots.txt does not block Googlebot-Image or favicon assets
 * 5. Multi-frame ICO contains 16x16, 32x32, and 48x48 frames
 * 6. Mirrors are 100% synchronized
 */

const fs = require('fs');
const path = require('path');

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
    
    // Root favicon.png (512x512 high-resolution source)
    const rootFavPng = path.join(ROOT_DIR, 'favicon.png');
    assert('favicon.png exists at root', fs.existsSync(rootFavPng));
    if (fs.existsSync(rootFavPng)) {
        const dims = readPngDimensions(fs.readFileSync(rootFavPng));
        assert('favicon.png has high-resolution 512x512 dimensions', dims && dims.width === 512 && dims.height === 512, JSON.stringify(dims));
    }

    // Root favicon-48x48.png (48x48 exact multiple of 48)
    const rootFav48 = path.join(ROOT_DIR, 'favicon-48x48.png');
    assert('favicon-48x48.png exists at root', fs.existsSync(rootFav48));
    if (fs.existsSync(rootFav48)) {
        const dims = readPngDimensions(fs.readFileSync(rootFav48));
        assert('favicon-48x48.png has exactly 48x48 dimensions', dims && dims.width === 48 && dims.height === 48, JSON.stringify(dims));
    }

    // Root apple-touch-icon.png (180x180 standard touch icon)
    const rootApple = path.join(ROOT_DIR, 'apple-touch-icon.png');
    assert('apple-touch-icon.png exists at root', fs.existsSync(rootApple));
    if (fs.existsSync(rootApple)) {
        const dims = readPngDimensions(fs.readFileSync(rootApple));
        assert('apple-touch-icon.png has 180x180 dimensions', dims && dims.width === 180 && dims.height === 180, JSON.stringify(dims));
    }

    // Root favicon.ico (multi-layer ICO)
    const rootIco = path.join(ROOT_DIR, 'favicon.ico');
    assert('favicon.ico exists at root', fs.existsSync(rootIco));
    if (fs.existsSync(rootIco)) {
        const sizes = readIcoSizes(fs.readFileSync(rootIco));
        assert('favicon.ico contains multi-resolution frames (16, 32, 48)', 
            sizes && sizes.some(s => s.width === 16) && sizes.some(s => s.width === 32) && sizes.some(s => s.width === 48), 
            JSON.stringify(sizes)
        );
    }

    // Brand directory assets
    const brandFavPng = path.join(ROOT_DIR, 'assets', 'brand', 'favicon.png');
    assert('assets/brand/favicon.png exists', fs.existsSync(brandFavPng));

    const brandFav48 = path.join(ROOT_DIR, 'assets', 'brand', 'favicon-48x48.png');
    assert('assets/brand/favicon-48x48.png exists', fs.existsSync(brandFav48));

    const brandIcon = path.join(ROOT_DIR, 'assets', 'brand', 'frank-icon.png');
    assert('assets/brand/frank-icon.png exists', fs.existsSync(brandIcon));

    // 2. HTML Markup & Canonical Favicon Linking
    console.log('\n2. Auditing HTML Head Favicon Link Tags & Canonical Priority:');
    const htmlPages = ['index.html', 'login.html', 'register.html', 'privacy.html', '404.html'];
    for (const pageName of htmlPages) {
        const content = fs.readFileSync(path.join(ROOT_DIR, pageName), 'utf8');
        
        // Canonical favicon.png link
        const hasFavPng = content.includes('<link rel="icon" type="image/png" href="/favicon.png">');
        assert(`${pageName}: Has canonical <link rel="icon" type="image/png" href="/favicon.png">`, hasFavPng);

        // ICO fallback link
        const hasIco = content.includes('<link rel="icon" type="image/x-icon" href="/favicon.ico">');
        assert(`${pageName}: Has /favicon.ico fallback tag`, hasIco);

        // Apple touch icon
        const hasApple = content.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
        assert(`${pageName}: Has /apple-touch-icon.png tag`, hasApple);

        // No conflicting duplicate declarations
        const iconMatches = content.match(/<link[^>]+rel=["']icon["'][^>]*>/g) || [];
        assert(`${pageName}: Has clean non-duplicated rel="icon" declarations (expected 2: PNG + ICO)`, iconMatches.length === 2, `Found ${iconMatches.length}`);
    }

    // 3. Robots.txt Compliance for Googlebot-Image
    console.log('\n3. Auditing Robots.txt Crawlability:');
    const robotsTxt = fs.readFileSync(path.join(ROOT_DIR, 'robots.txt'), 'utf8');
    assert('robots.txt allows root /', robotsTxt.includes('Allow: /'));
    assert('robots.txt allows /assets/', robotsTxt.includes('Allow: /assets/'));
    assert('robots.txt does not disallow favicon.ico', !robotsTxt.includes('Disallow: /favicon.ico'));
    assert('robots.txt does not disallow favicon.png', !robotsTxt.includes('Disallow: /favicon.png'));
    assert('robots.txt does not disallow favicon-48x48.png', !robotsTxt.includes('Disallow: /favicon-48x48.png'));

    // 4. Vercel Header Configuration
    console.log('\n4. Auditing Vercel JSON Header Configuration:');
    const vercelJson = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'vercel.json'), 'utf8'));
    const headers = vercelJson.headers || [];
    const hasFavIcoHeader = headers.some(h => h.source === '/favicon.ico' && h.headers.some(x => x.key === 'Content-Type' && x.value === 'image/x-icon'));
    const hasFavPngHeader = headers.some(h => h.source === '/favicon.png' && h.headers.some(x => x.key === 'Content-Type' && x.value === 'image/png'));
    const hasFav48Header = headers.some(h => h.source === '/favicon-48x48.png' && h.headers.some(x => x.key === 'Content-Type' && x.value === 'image/png'));
    const hasAppleHeader = headers.some(h => h.source === '/apple-touch-icon.png' && h.headers.some(x => x.key === 'Content-Type' && x.value === 'image/png'));
    assert('vercel.json specifies image/x-icon header for /favicon.ico', hasFavIcoHeader);
    assert('vercel.json specifies image/png header for /favicon.png', hasFavPngHeader);
    assert('vercel.json specifies image/png header for /favicon-48x48.png', hasFav48Header);
    assert('vercel.json specifies image/png header for /apple-touch-icon.png', hasAppleHeader);

    // 5. Mirror Parity Check
    console.log('\n5. Auditing Mirror Consistency:');
    const mirrorDirs = [
        path.join(ROOT_DIR, 'frontend'),
        path.join(ROOT_DIR, 'backend', 'frontend'),
        path.join(ROOT_DIR, 'api', '_backend', 'frontend')
    ];
    for (const mDir of mirrorDirs) {
        const mFavPng = path.join(mDir, 'favicon.png');
        assert(`${path.relative(ROOT_DIR, mFavPng)} exists and matches root`, fs.existsSync(mFavPng) && fs.readFileSync(mFavPng).equals(fs.readFileSync(rootFavPng)));

        const mFavIco = path.join(mDir, 'favicon.ico');
        assert(`${path.relative(ROOT_DIR, mFavIco)} exists and matches root`, fs.existsSync(mFavIco) && fs.readFileSync(mFavIco).equals(fs.readFileSync(rootIco)));

        const mFav48 = path.join(mDir, 'favicon-48x48.png');
        assert(`${path.relative(ROOT_DIR, mFav48)} exists and matches root`, fs.existsSync(mFav48) && fs.readFileSync(mFav48).equals(fs.readFileSync(rootFav48)));

        const mApple = path.join(mDir, 'apple-touch-icon.png');
        assert(`${path.relative(ROOT_DIR, mApple)} exists and matches root`, fs.existsSync(mApple) && fs.readFileSync(mApple).equals(fs.readFileSync(rootApple)));
    }

    console.log('\n======================================================');
    console.log(`Google Favicon Audit Summary: Passed: ${passed}, Failed: ${failed}`);
    console.log('======================================================');

    process.exit(failed > 0 ? 1 : 0);
}

runAudit();
