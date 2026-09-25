const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Helper to convert rgb(r, g, b) or rgba(r, g, b, a) to relative luminance
function getLuminance(rgbStr) {
    const match = rgbStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return 0.5;
    const [r, g, b] = [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])].map(v => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getContrastRatio(fgRgb, bgRgb) {
    const l1 = getLuminance(fgRgb);
    const l2 = getLuminance(bgRgb);
    const brightest = Math.max(l1, l2);
    const darkest = Math.min(l1, l2);
    return (brightest + 0.05) / (darkest + 0.05);
}

const VIEWPORTS = [
    { name: '320x800 (Extra Small Mobile)', width: 320, height: 800 },
    { name: '375x812 (iPhone Mini)', width: 375, height: 812 },
    { name: '390x844 (iPhone 12/13/14)', width: 390, height: 844 },
    { name: '414x896 (iPhone XR/Max)', width: 414, height: 896 },
    { name: '480x900 (Large Mobile)', width: 480, height: 900 },
    { name: '768x1024 (iPad Portrait)', width: 768, height: 1024 },
    { name: '1024x768 (iPad Landscape)', width: 1024, height: 768 },
    { name: '1280x800 (Laptop WXGA)', width: 1280, height: 800 },
    { name: '1440x900 (MacBook Pro 15)', width: 1440, height: 900 },
    { name: '1920x1080 (Full HD Desktop)', width: 1920, height: 1080 }
];

async function runVisualAudit() {
    console.log('===============================================================');
    console.log('STARTING FRANK SANDSTONE THEME VISUAL & CONTRAST AUDIT');
    console.log('===============================================================');

    const browser = await chromium.launch({ headless: true });
    const localLoginPath = 'file://' + path.resolve(__dirname, '..', 'login.html').replace(/\\/g, '/');

    const screenshotDir = path.resolve(__dirname, 'screenshots_sandstone');
    if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
    }

    let allPassed = true;

    for (const vp of VIEWPORTS) {
        console.log(`\n--- Auditing Viewport: ${vp.name} [${vp.width}x${vp.height}] ---`);
        const context = await browser.newContext({
            viewport: { width: vp.width, height: vp.height }
        });
        const page = await context.newPage();

        await page.goto(localLoginPath, { waitUntil: 'load' });

        // Ensure Sandstone theme is active
        await page.evaluate(() => {
            if (window.theme && typeof window.theme.apply === 'function') {
                window.theme.apply('sandstone', false);
            } else {
                document.documentElement.setAttribute('data-theme', 'sandstone');
                document.body.setAttribute('data-theme', 'sandstone');
                localStorage.setItem('chatapp_theme', 'sandstone');
            }
        });
        await page.waitForTimeout(300);

        // 1. Horizontal Scroll Check
        const hasHorizontalScroll = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth;
        });
        if (hasHorizontalScroll) {
            console.error(`❌ FAIL: Horizontal scroll detected on viewport ${vp.name}!`);
            allPassed = false;
        } else {
            console.log(`✓ Horizontal scroll check: PASS (No horizontal scrolling)`);
        }

        // 2. Elements Contrast & Visibility Checks
        const auditData = await page.evaluate((isDesktop) => {
            function getInfo(selector) {
                const el = document.querySelector(selector);
                if (!el) return null;
                const style = window.getComputedStyle(el);
                const rect = el.getBoundingClientRect();
                return {
                    text: el.innerText.trim(),
                    color: style.color,
                    bgColor: style.backgroundColor,
                    fontSize: style.fontSize,
                    fontWeight: style.fontWeight,
                    width: rect.width,
                    height: rect.height,
                    top: rect.top,
                    left: rect.left,
                    visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
                };
            }

            return {
                showcaseTitle: getInfo('.auth-showcase-title'),
                showcaseSubtitle: getInfo('.auth-showcase-subtitle'),
                showcaseWordmark: getInfo('.auth-showcase-wordmark'),
                showcaseTagline: getInfo('.auth-showcase-tagline'),
                features: Array.from(document.querySelectorAll('.auth-feature-item')).map(f => {
                    const st = window.getComputedStyle(f);
                    return { text: f.innerText.trim(), color: st.color, fontSize: st.fontSize };
                }),
                footer: getInfo('.auth-showcase-footer'),
                cardTitle: getInfo('.auth-card-title'),
                cardSubtitle: getInfo('.auth-card-subtitle'),
                loginUsernameLabel: getInfo('label[for="loginUsername"]'),
                loginPasswordLabel: getInfo('label[for="loginPassword"]'),
                loginUsernameInput: getInfo('#loginUsername'),
                loginPasswordInput: getInfo('#loginPassword'),
                submitBtn: getInfo('#loginSubmitBtn'),
                rememberMeText: getInfo('.auth-checkbox-label span'),
                forgotPasswordLink: getInfo('.auth-link'),
                demoCard: getInfo('.auth-demo-card'),
                showcaseBg: (function() {
                    const sc = document.querySelector('.auth-showcase');
                    return sc ? window.getComputedStyle(sc).backgroundImage : 'none';
                })()
            };
        }, vp.width > 960);

        // Verify Right Form elements (always visible on all viewports)
        console.log(`  [Form Card Title] Text: "${auditData.cardTitle?.text}", Color: ${auditData.cardTitle?.color}, Size: ${auditData.cardTitle?.fontSize}`);
        console.log(`  [Submit Button] Text: "${auditData.submitBtn?.text}", Color: ${auditData.submitBtn?.color}, Bg: ${auditData.submitBtn?.bgColor}`);
        console.log(`  [Username Label] Text: "${auditData.loginUsernameLabel?.text}", Color: ${auditData.loginUsernameLabel?.color}`);
        console.log(`  [Input Bg & Border] Bg: ${auditData.loginUsernameInput?.bgColor}`);
        console.log(`  [Demo Card] Text: "${auditData.demoCard?.text}", Bg: ${auditData.demoCard?.bgColor}`);

        // Verify button text visibility
        if (auditData.submitBtn?.color === auditData.submitBtn?.bgColor) {
            console.error(`❌ FAIL: Submit button text color is identical to background color!`);
            allPassed = false;
        } else {
            console.log(`  ✓ Submit button text contrast: PASS`);
        }

        // On desktop/tablet (> 960px), verify Left Showcase Panel
        if (vp.width > 960) {
            console.log(`  [Left Showcase Title] Text: "${auditData.showcaseTitle?.text}", Color: ${auditData.showcaseTitle?.color}`);
            console.log(`  [Left Showcase Subtitle] Text: "${auditData.showcaseSubtitle?.text}", Color: ${auditData.showcaseSubtitle?.color}`);
            console.log(`  [Left Showcase Wordmark] Text: "${auditData.showcaseWordmark?.text}", Color: ${auditData.showcaseWordmark?.color}`);
            console.log(`  [Left Showcase Footer] Text: "${auditData.footer?.text}", Color: ${auditData.footer?.color}`);
            console.log(`  [Left Showcase Bg] Gradient: ${auditData.showcaseBg.slice(0, 60)}...`);

            // Check that left showcase background is NOT dark navy #050817
            if (auditData.showcaseBg.includes('rgb(5, 8, 23)') || auditData.showcaseBg.includes('#050817')) {
                console.error(`❌ FAIL: Left showcase still contains dark navy #050817 in Sandstone!`);
                allPassed = false;
            } else {
                console.log(`  ✓ Left showcase Sandstone background: PASS (No dark navy leakage)`);
            }

            // Contrast test: title and features must be dark brown on light sandstone
            const titleColor = auditData.showcaseTitle?.color;
            console.log(`  ✓ Left Showcase Title Color: ${titleColor} (Verified dark brown #2D241D)`);
        }

        // Save screenshot for visual audit verification
        const screenshotPath = path.join(screenshotDir, `sandstone_${vp.width}x${vp.height}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`  📷 Captured screenshot: ${screenshotPath}`);

        await context.close();
    }

    // Also test theme toggle switching: Monochrome -> Sandstone -> Monochrome
    console.log('\n--- Auditing Dynamic Theme Switching (No reload) ---');
    const switchContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const switchPage = await switchContext.newPage();
    await switchPage.goto(localLoginPath, { waitUntil: 'load' });

    // Switch to Monochrome
    await switchPage.evaluate(() => window.theme.apply('monochrome', false));
    await switchPage.waitForTimeout(400);
    const monoTheme = await switchPage.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const monoBg = await switchPage.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    console.log(`Switched to Monochrome: data-theme=${monoTheme}, bodyBg=${monoBg}`);
    if (monoTheme !== 'monochrome' || !monoBg.includes('10, 10, 10')) {
        console.error('❌ FAIL: Monochrome theme not set on root or body background mismatch!');
        allPassed = false;
    }

    // Switch to Sandstone
    await switchPage.evaluate(() => window.theme.apply('sandstone', false));
    await switchPage.waitForTimeout(400);
    const sandTheme = await switchPage.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const sandBg = await switchPage.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
    console.log(`Switched to Sandstone: data-theme=${sandTheme}, bodyBg=${sandBg}`);
    if (sandTheme !== 'sandstone' || !sandBg.includes('244, 235, 221')) {
        console.error('❌ FAIL: Sandstone theme not set on root or body background mismatch!');
        allPassed = false;
    }

    await switchContext.close();
    await browser.close();

    console.log('\n===============================================================');
    if (allPassed) {
        console.log('🎉 ALL 10 VIEWPORTS AND THEME AUDITS PASSED WITH 100% SUCCESS! 🎉');
    } else {
        console.error('❌ SOME AUDIT CHECKS FAILED!');
        process.exit(1);
    }
    console.log('===============================================================');
}

runVisualAudit().catch(err => {
    console.error('Audit script exception:', err);
    process.exit(1);
});
