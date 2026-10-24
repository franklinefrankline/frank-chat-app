const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const testUrls = [
        'https://fnk.vercel.app/',
        'https://fnk.vercel.app/?',
        'https://fnk.vercel.app/?ref=test',
        'https://fnk.vercel.app/?utm_source=google',
        'https://fnk.vercel.app/?fbclid=123',
        'https://fnk.vercel.app/?p=home',
        'https://fnk.vercel.app/?q=search',
        'https://fnk.vercel.app/?logout=1',
        'https://fnk.vercel.app/?expired=1',
        'https://fnk.vercel.app/index.html?logout=1',
        'https://fnk.vercel.app/index.html',
        'https://fnk.vercel.app/index',
        'https://fnk.vercel.app/index?query=1'
    ];

    console.log('Testing URLs on fnk.vercel.app in Playwright:\n');
    for (const u of testUrls) {
        try {
            const res = await page.goto(u, { waitUntil: 'load' });
            const title = await page.title();
            const h1 = await page.$eval('h1', el => el.innerText).catch(() => 'NO H1');
            const is404 = title.includes('404') || h1.includes('404') || h1.toLowerCase().includes('not found');
            console.log(u.padEnd(45), 'Status:', res.status(), 'Title:', title, 'H1:', h1, is404 ? '>>> 404 DETECTED <<<' : 'OK');
        } catch (e) {
            console.log(u.padEnd(45), 'ERROR:', e.message);
        }
    }
    await browser.close();
})();
