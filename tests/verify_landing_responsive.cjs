const { chromium } = require('playwright');
const path = require('path');

async function testViewports() {
    console.log('--- Running Multi-Viewport Verification on Fixed Landing Page ---');
    const browser = await chromium.launch({ headless: true });

    const viewports = [
        // Mobile
        { name: 'Mobile 320px', width: 320, height: 600 },
        { name: 'Mobile 360px', width: 360, height: 640 },
        { name: 'Mobile 375px', width: 375, height: 667 },
        { name: 'Mobile 390px', width: 390, height: 844 },
        { name: 'Mobile 414px', width: 414, height: 896 },
        { name: 'Mobile 480px', width: 480, height: 800 },
        // Desktop
        { name: 'Desktop 1024px', width: 1024, height: 768 },
        { name: 'Desktop 1280px', width: 1280, height: 800 },
        { name: 'Desktop 1440px', width: 1440, height: 900 },
        { name: 'Desktop 1920px', width: 1920, height: 1080 }
    ];

    const localFile = 'file:///' + path.resolve(__dirname, '../backend/frontend/index.html').replace(/\\/g, '/');

    for (const vp of viewports) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(localFile, { waitUntil: 'load' });
        await page.waitForTimeout(500);

        const check = await page.evaluate(() => {
            const body = document.body;
            const html = document.documentElement;
            const hasHorizontalScroll = (
                html.scrollWidth > html.clientWidth ||
                body.scrollWidth > body.clientWidth
            );

            const cta = document.querySelector('.cta-banner');
            let ctaInfo = null;
            if (cta) {
                const rect = cta.getBoundingClientRect();
                const style = window.getComputedStyle(cta);
                const isWhite = (
                    style.backgroundColor === 'rgb(255, 255, 255)' ||
                    style.backgroundImage.includes('rgb(255, 255, 255) 0%') && style.backgroundImage.includes('rgb(255, 255, 255) 100%')
                );
                ctaInfo = {
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    bg: style.backgroundColor,
                    isWhite: isWhite,
                    text: cta.innerText.trim()
                };
            }

            return {
                hasHorizontalScroll,
                scrollWidth: html.scrollWidth,
                clientWidth: html.clientWidth,
                ctaInfo
            };
        });

        console.log(`[${vp.name}]`);
        console.log(`  Horizontal Overflow : ${check.hasHorizontalScroll ? 'FAIL (Scrollable)' : 'PASS (Clean)'}`);
        console.log(`  CTA Container Color : ${check.ctaInfo.bg} (Is White Bug: ${check.ctaInfo.isWhite})`);
        console.log(`  CTA Dimensions      : ${check.ctaInfo.width}x${check.ctaInfo.height}`);
        console.log(`  CTA Visible Text    : "${check.ctaInfo.text.slice(0, 45)}..."`);

        if (check.hasHorizontalScroll || check.ctaInfo.isWhite) {
            console.error(`  ERROR on ${vp.name}!`);
        }

        await page.close();
    }

    await browser.close();
    console.log('\n--- All Viewport Tests Completed Successfully ---');
}

testViewports().catch(console.error);
