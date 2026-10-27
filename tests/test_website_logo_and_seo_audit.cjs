// tests/test_website_logo_and_seo_audit.cjs
// Comprehensive Playwright audit for FRANK Think Website Logo and Homepage SEO changes

const { chromium } = require('playwright');
const assert = require('assert');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8000';

async function runAudit() {
    console.log('========================================================');
    console.log('   FRANK Think — Playwright Logo & SEO Audit Suite');
    console.log(`   Target Server: ${BASE_URL}`);
    console.log('========================================================\n');

    const browser = await chromium.launch({ headless: true });
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;

    function check(description, condition, details = '') {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`  [PASS] ${description}`);
        } else {
            failedTests++;
            console.error(`  [FAIL] ${description} ${details ? '— ' + details : ''}`);
        }
    }

    // 1. Audit Homepage on Desktop Viewport (1280x800)
    console.log('1. Auditing Homepage (Desktop 1280x800):');
    const contextDesktop = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const pageDesktop = await contextDesktop.newPage();
    const consoleErrorsDesktop = [];
    const failedRequestsDesktop = [];

    pageDesktop.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrorsDesktop.push(msg.text());
        }
    });

    pageDesktop.on('response', res => {
        if (res.status() >= 400) {
            failedRequestsDesktop.push(`${res.status()} ${res.url()}`);
        }
    });

    try {
        const response = await pageDesktop.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
        check('Root / returns HTTP 200', response.status() === 200, `Got ${response.status()}`);

        // Title and Meta Tags
        const title = await pageDesktop.title();
        check('Page title contains "FRANK Think — Chat, Connect & Collaborate"', title.includes('FRANK Think') && title.includes('Chat, Connect & Collaborate'), `Got "${title}"`);

        const canonical = await pageDesktop.$eval('link[rel="canonical"]', el => el.getAttribute('href')).catch(() => null);
        check('Canonical URL is https://fnk.vercel.app/', canonical === 'https://fnk.vercel.app/', `Got "${canonical}"`);

        const metaDesc = await pageDesktop.$eval('meta[name="description"]', el => el.getAttribute('content')).catch(() => null);
        check('Meta description mentions FRANK Think and collaboration', metaDesc && metaDesc.includes('FRANK Think') && metaDesc.length >= 80, `Length: ${metaDesc ? metaDesc.length : 0}`);

        // Favicons
        const png48Icon = await pageDesktop.$eval('link[rel="icon"][sizes="48x48"]', el => el.getAttribute('href')).catch(() => null);
        check('48x48 PNG favicon tag is present for Google Search', png48Icon && png48Icon.includes('favicon-48x48.png'));

        const svgIcon = await pageDesktop.$eval('link[rel="icon"][type="image/svg+xml"]', el => el.getAttribute('href')).catch(() => null);
        check('SVG favicon tag is assets/brand/frank-icon.svg', svgIcon && svgIcon.includes('frank-icon.svg'));

        const icoIcon = await pageDesktop.$eval('link[rel="icon"][href*="favicon.ico"]', el => el.getAttribute('href')).catch(() => null);
        check('ICO favicon tag is favicon.ico', icoIcon && icoIcon.includes('favicon.ico'));

        // Logo in Navigation Bar
        const navBrandLogo = await pageDesktop.$('header.landing-header a.brand-link img');
        check('Navbar brand logo image exists', !!navBrandLogo);
        if (navBrandLogo) {
            const logoSrc = await navBrandLogo.getAttribute('src');
            check('Navbar logo src is assets/brand/frank-icon.svg', logoSrc === 'assets/brand/frank-icon.svg');
            const isVisible = await navBrandLogo.isVisible();
            check('Navbar logo is visible', isVisible);
            const naturalWidth = await navBrandLogo.evaluate(img => img.naturalWidth);
            check('Navbar logo loaded properly with positive natural width', naturalWidth > 0, `Width: ${naturalWidth}`);
        }

        const brandText = await pageDesktop.$eval('header.landing-header a.brand-link', el => el.innerText.trim().replace(/\s+/g, ' '));
        check('Navbar brand text is "FRANK Think"', brandText.includes('FRANK') && brandText.includes('Think'), `Got: "${brandText}"`);

        // Hero Section Content
        const h1 = await pageDesktop.$eval('h1#heroTitle', el => el.innerText.trim());
        check('Hero single <h1> is "Communication, Reimagined."', h1 === 'Communication, Reimagined.', `Got "${h1}"`);

        const heroSubtitle = await pageDesktop.$eval('section.hero p[data-i18n="hero.subtitle"]', el => el.innerText.trim());
        check('Hero subtitle includes "FRANK Think"', heroSubtitle.includes('FRANK Think'));
        check('Hero subtitle includes "online productivity tools"', heroSubtitle.includes('online productivity tools'));
        check('Hero subtitle includes "document editing"', heroSubtitle.includes('document editing'));
        check('Hero subtitle includes "AI assistant"', heroSubtitle.includes('AI assistant'));

        // Feature Action Links
        const featureLinks = await pageDesktop.$$eval('.feature-action-link', els => els.map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') })));
        check('Feature cards have 6 crawlable action links', featureLinks.length === 6, `Found ${featureLinks.length}`);
        for (const fl of featureLinks) {
            check(`Feature link "${fl.text}" has valid href`, !!fl.href && (fl.href.startsWith('#') || fl.href.endsWith('.html')));
        }

        // Schema.org Structured Data
        const schemas = await pageDesktop.$$eval('script[type="application/ld+json"]', els => els.map(s => JSON.parse(s.innerText)));
        let orgLogoUrl = null;
        for (const s of schemas) {
            if (s['@graph']) {
                for (const node of s['@graph']) {
                    if (node['@type'] === 'Organization' && node.logo) {
                        orgLogoUrl = typeof node.logo === 'string' ? node.logo : node.logo.url;
                    }
                }
            }
        }
        check('Schema.org Organization logo points to official frank-logo.png', orgLogoUrl === 'https://fnk.vercel.app/assets/brand/frank-logo.png', `Got "${orgLogoUrl}"`);

        // Footer elements
        const footerLogo = await pageDesktop.$('footer.footer img');
        check('Footer brand logo exists', !!footerLogo);
        const footerPrivacyLink = await pageDesktop.$('footer.footer a[href="privacy.html"]');
        check('Footer Privacy Policy link exists and points to privacy.html', !!footerPrivacyLink);

        // Network and Console Integrity
        check('0 console errors on desktop homepage', consoleErrorsDesktop.length === 0, consoleErrorsDesktop.join('; '));
        check('0 failed network requests on desktop homepage', failedRequestsDesktop.length === 0, failedRequestsDesktop.join('; '));

    } catch (err) {
        check('Homepage desktop execution succeeded', false, err.message);
    } finally {
        await contextDesktop.close();
    }

    // 2. Audit Homepage on Mobile Viewport (375x667 - iPhone SE)
    console.log('\n2. Auditing Homepage on Mobile (375x667):');
    const contextMobile = await browser.newContext({
        viewport: { width: 375, height: 667 },
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
    });

    const pageMobile = await contextMobile.newPage();
    const consoleErrorsMobile = [];
    const failedRequestsMobile = [];

    pageMobile.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrorsMobile.push(msg.text());
        }
    });

    pageMobile.on('response', res => {
        if (res.status() >= 400) {
            failedRequestsMobile.push(`${res.status()} ${res.url()}`);
        }
    });

    try {
        await pageMobile.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

        // Mobile drawer toggle button
        const mobileToggle = await pageMobile.$('#landingMobileToggle');
        check('Mobile menu drawer toggle button exists and is visible', mobileToggle && await mobileToggle.isVisible());

        // Open mobile drawer
        await mobileToggle.click();
        await pageMobile.waitForTimeout(300);

        const drawer = await pageMobile.$('#landingMobileDrawer');
        const isDrawerOpen = await drawer.evaluate(el => el.classList.contains('open'));
        check('Clicking mobile toggle opens navigation drawer', isDrawerOpen);

        const drawerLogo = await pageMobile.$('#landingMobileDrawer a.brand-link img');
        check('Mobile drawer contains brand logo image', !!drawerLogo && await drawerLogo.isVisible());

        const drawerBrandText = await pageMobile.$eval('#landingMobileDrawer a.brand-link', el => el.innerText.trim().replace(/\s+/g, ' '));
        check('Mobile drawer brand text is "FRANK Think"', drawerBrandText.includes('FRANK') && drawerBrandText.includes('Think'), `Got "${drawerBrandText}"`);

        // Close drawer
        const closeBtn = await pageMobile.$('#landingMobileCloseBtn');
        await closeBtn.click();
        await pageMobile.waitForTimeout(300);
        const isDrawerClosed = await drawer.evaluate(el => !el.classList.contains('open'));
        check('Clicking close button closes mobile drawer', isDrawerClosed);

        check('0 console errors on mobile homepage', consoleErrorsMobile.length === 0, consoleErrorsMobile.join('; '));
        check('0 failed network requests on mobile homepage', failedRequestsMobile.length === 0, failedRequestsMobile.join('; '));

    } catch (err) {
        check('Homepage mobile execution succeeded', false, err.message);
    } finally {
        await contextMobile.close();
    }

    // 3. Auditing Login & Register Pages for Logo Navigation & Integrity
    console.log('\n3. Auditing Login & Register Pages:');
    const authPages = [
        { path: '/login', expectedTitle: 'Sign In — FRANK Think' },
        { path: '/register', expectedTitle: 'Create an Account — FRANK Think' }
    ];

    for (const ap of authPages) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await ctx.newPage();
        const errs = [];
        const badReqs = [];
        page.on('console', msg => { if (msg.type() === 'error') errs.push(msg.text()); });
        page.on('response', res => { if (res.status() >= 400) badReqs.push(`${res.status()} ${res.url()}`); });

        try {
            await page.goto(`${BASE_URL}${ap.path}`, { waitUntil: 'networkidle' });
            const title = await page.title();
            check(`${ap.path} title is "${ap.expectedTitle}"`, title === ap.expectedTitle, `Got "${title}"`);

            // Auth card logo back to home link
            const logoLink = await page.$eval('a.auth-card-logo', el => el.getAttribute('href')).catch(() => null);
            check(`${ap.path} auth-card logo links back to index.html`, logoLink === 'index.html', `Got "${logoLink}"`);

            const logoImg = await page.$('.auth-card-logo img');
            check(`${ap.path} brand logo image is present and visible`, logoImg && await logoImg.isVisible());
            if (logoImg) {
                const nw = await logoImg.evaluate(img => img.naturalWidth);
                check(`${ap.path} brand logo loaded with positive natural width`, nw > 0, `Width: ${nw}`);
            }

            check(`0 console errors on ${ap.path}`, errs.length === 0, errs.join('; '));
            check(`0 failed network requests on ${ap.path}`, badReqs.length === 0, badReqs.join('; '));
        } catch (e) {
            check(`Audit of ${ap.path} succeeded`, false, e.message);
        } finally {
            await ctx.close();
        }
    }

    // 4. Auditing Privacy Policy Page
    console.log('\n4. Auditing Privacy Policy Page (/privacy):');
    const privacyCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const privacyPage = await privacyCtx.newPage();
    const privacyErrs = [];
    const privacyBadReqs = [];
    privacyPage.on('console', msg => { if (msg.type() === 'error') privacyErrs.push(msg.text()); });
    privacyPage.on('response', res => { if (res.status() >= 400) privacyBadReqs.push(`${res.status()} ${res.url()}`); });

    try {
        await privacyPage.goto(`${BASE_URL}/privacy`, { waitUntil: 'networkidle' });
        const title = await privacyPage.title();
        check('Privacy page title contains "Privacy Policy" and "FRANK Think"', title.includes('Privacy Policy') && title.includes('FRANK Think'), `Got "${title}"`);

        const navLogo = await privacyPage.$('header.privacy-header a.privacy-brand img.privacy-brand-logo');
        check('Privacy page header contains brand logo', !!navLogo && await navLogo.isVisible());

        const h1Count = await privacyPage.$$eval('h1', els => els.length);
        check('Privacy page has exactly one <h1>', h1Count === 1, `Found ${h1Count}`);

        check('0 console errors on /privacy', privacyErrs.length === 0, privacyErrs.join('; '));
        check('0 failed network requests on /privacy', privacyBadReqs.length === 0, privacyBadReqs.join('; '));
    } catch (e) {
        check('Audit of /privacy succeeded', false, e.message);
    } finally {
        await privacyCtx.close();
    }

    await browser.close();

    console.log('\n========================================================');
    console.log(`Audit Summary: Passed: ${passedTests}, Failed: ${failedTests}, Total: ${totalTests}`);
    console.log('========================================================');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runAudit().catch(err => {
    console.error('Fatal audit failure:', err);
    process.exit(1);
});
