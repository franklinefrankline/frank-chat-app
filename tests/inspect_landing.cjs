const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function inspectLandingPage(url, label) {
    console.log(`\n==================================================`);
    console.log(`INSPECTING ${label}: ${url}`);
    console.log(`==================================================`);

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const consoleLogs = [];
    const failedRequests = [];

    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('requestfailed', req => failedRequests.push(`${req.url()} (${req.failure().errorText})`));

    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(2000);

    const screenshotPath = path.join(__dirname, `screenshot_${label}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to: ${screenshotPath}`);

    // Inspect all elements on page
    const elementsInfo = await page.evaluate(() => {
        const results = [];
        const allElements = document.querySelectorAll('*');

        allElements.forEach(el => {
            const tag = el.tagName.toLowerCase();
            if (['html', 'head', 'meta', 'link', 'script', 'style', 'title'].includes(tag)) return;

            const rect = el.getBoundingClientRect();
            const comp = window.getComputedStyle(el);
            const bg = comp.backgroundColor;
            const isWhiteOrNearWhite = (
                bg === 'rgb(255, 255, 255)' ||
                bg === 'rgba(255, 255, 255, 1)' ||
                bg === '#ffffff' ||
                bg === 'white'
            );

            // Check if element is large
            if (rect.height > 100 && rect.width > 200) {
                results.push({
                    tag: tag,
                    id: el.id,
                    className: el.className,
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    top: Math.round(rect.top + window.scrollY),
                    bg: bg,
                    borderRadius: comp.borderRadius,
                    display: comp.display,
                    childCount: el.childElementCount,
                    textSnippet: el.innerText ? el.innerText.trim().slice(0, 100) : ''
                });
            }
        });
        return results;
    });

    console.log(`Found ${elementsInfo.length} large elements (>100px height, >200px width):`);
    elementsInfo.forEach((info, idx) => {
        console.log(`[#${idx+1}] <${info.tag} id="${info.id}" class="${info.className}">`);
        console.log(`    Size: ${info.width}x${info.height} at top: ${info.top}`);
        console.log(`    BG: ${info.bg}, Border-radius: ${info.borderRadius}`);
        console.log(`    Children: ${info.childCount}, Text snippet: "${info.textSnippet.replace(/\n/g, ' ')}"`);
    });

    console.log(`Console logs (${consoleLogs.length}):`, consoleLogs.slice(0, 10));
    console.log(`Failed requests (${failedRequests.length}):`, failedRequests);

    await browser.close();
}

async function main() {
    const localFile = 'file:///' + path.resolve(__dirname, '../backend/frontend/index.html').replace(/\\/g, '/');
    await inspectLandingPage(localFile, 'local_file');
    try {
        await inspectLandingPage('https://frank-chat-app.vercel.app/', 'production_vercel');
    } catch (e) {
        console.error('Vercel probe error:', e.message);
    }
}

main().catch(console.error);
