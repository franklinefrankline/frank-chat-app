const { chromium } = require('playwright');

async function debugClick() {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERR:', err.message));

    await page.goto('http://127.0.0.1:8000/login.html');
    await page.fill('#loginUsername', 'testsuite@frank.app');
    await page.fill('#loginPassword', 'password123');
    await page.click('#loginSubmitBtn');
    await page.waitForTimeout(1000);

    const modalBefore = await page.evaluate(() => {
        const m = document.getElementById('frankContactAdminModal');
        return m ? { exists: true, display: m.style.display } : { exists: false };
    });
    console.log('Modal before click:', modalBefore);

    const btnInfo = await page.evaluate(() => {
        const b = document.getElementById('contactAdminDisabledBtn');
        return b ? { exists: true, bound: b.dataset.bound } : { exists: false };
    });
    console.log('Button info before click:', btnInfo);

    await page.click('#contactAdminDisabledBtn');
    await page.waitForTimeout(500);

    const modalAfter = await page.evaluate(() => {
        const m = document.getElementById('frankContactAdminModal');
        return m ? { exists: true, display: m.style.display, computed: window.getComputedStyle(m).display } : { exists: false };
    });
    console.log('Modal after click:', modalAfter);

    await browser.close();
}

debugClick();
