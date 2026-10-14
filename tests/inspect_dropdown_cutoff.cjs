const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function inspectDropdown() {
    const browser = await chromium.launch({ headless: true });
    const screenSizes = [
        { name: 'desktop_1280', width: 1280, height: 800 },
        { name: 'mobile_430', width: 430, height: 932 },
        { name: 'mobile_390', width: 390, height: 844 },
        { name: 'mobile_375', width: 375, height: 667 },
        { name: 'mobile_320', width: 320, height: 640 }
    ];

    const outDir = path.resolve(__dirname, 'inspect_dropdown_out');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    for (const scr of screenSizes) {
        console.log(`\n=== Testing ${scr.name} (${scr.width}x${scr.height}) ===`);
        const context = await browser.newContext({ viewport: { width: scr.width, height: scr.height } });
        const page = await context.newPage();

        await page.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'load' });
        await page.fill('#loginUsername', 'alex');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });

        await page.evaluate(() => {
            const loader = document.getElementById('appLoadingScreen');
            if (loader) loader.remove();
        });

        await page.waitForTimeout(500);

        // Click desktop profile button
        const btn = page.locator('#desktopProfileBtn');
        await btn.click();
        await page.waitForTimeout(300);

        const dropdown = page.locator('#desktopProfileDropdown');
        const isVisible = await dropdown.isVisible();
        const box = await dropdown.boundingBox();
        const styles = await dropdown.evaluate(el => {
            const cs = window.getComputedStyle(el);
            const parent = el.parentElement;
            const parentCs = window.getComputedStyle(parent);
            const header = document.getElementById('appTopHeader');
            const headerCs = window.getComputedStyle(header);
            return {
                display: cs.display,
                position: cs.position,
                top: cs.top,
                left: cs.left,
                right: cs.right,
                bottom: cs.bottom,
                width: cs.width,
                height: cs.height,
                maxHeight: cs.maxHeight,
                overflowY: cs.overflowY,
                zIndex: cs.zIndex,
                parentOverflow: parentCs.overflow,
                parentZIndex: parentCs.zIndex,
                headerOverflow: headerCs.overflow,
                headerZIndex: headerCs.zIndex,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
                offsetHeight: el.offsetHeight,
                itemsCount: el.querySelectorAll('.dropdown-item').length
            };
        });

        console.log(`Dropdown visible: ${isVisible}`);
        console.log(`Bounding box:`, box);
        console.log(`Styles & measurements:`, styles);

        // Check if bottom extends beyond window.innerHeight
        if (box) {
            const bottom = box.y + box.height;
            const diff = bottom - scr.height;
            console.log(`Dropdown bottom: ${bottom}px, Viewport height: ${scr.height}px. (Overflow: ${diff > 0 ? diff + 'px cut off!' : 'within viewport'})`);
            const right = box.x + box.width;
            const diffRight = right - scr.width;
            console.log(`Dropdown right: ${right}px, Viewport width: ${scr.width}px. (Overflow: ${diffRight > 0 ? diffRight + 'px cut off!' : 'within viewport'})`);
        }

        await page.screenshot({ path: path.join(outDir, `${scr.name}_dropdown.png`) });
        await context.close();
    }

    await browser.close();
}

inspectDropdown().catch(err => {
    console.error(err);
    process.exit(1);
});
