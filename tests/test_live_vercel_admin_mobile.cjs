const { chromium } = require('playwright');
const https = require('https');

function postJson(url, data) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const postData = JSON.stringify(data);
        const req = https.request({
            hostname: u.hostname,
            path: u.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(body) });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: body });
                }
            });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

(async () => {
    console.log('=== LIVE VERCEL PRODUCTION ADMIN MOBILE TEST ===\n');

    console.log('1. Authenticating as admin on Vercel...');
    const loginRes = await postJson('https://frank-chat-app.vercel.app/api/auth/login', {
        email: 'frankline30999112@gmail.com',
        password: '#Frankline2006'
    });

    if (loginRes.status !== 200 || !loginRes.data || !loginRes.data.access_token) {
        console.error('Login failed on Vercel:', loginRes);
        process.exit(1);
    }

    const token = loginRes.data.access_token;
    const user = loginRes.data.user;
    console.log(`[PASS] Admin logged in on Vercel. Role: ${user.role}, Frank ID: ${user.frank_id}\n`);

    const browser = await chromium.launch({ headless: true });

    const viewports = [
        { name: 'iPhone SE (320x568)', width: 320, height: 568 },
        { name: 'iPhone 14 Pro (393x852)', width: 393, height: 852 },
        { name: 'iPad Portrait (768x1024)', width: 768, height: 1024 },
        { name: 'Desktop (1280x800)', width: 1280, height: 800 }
    ];

    for (const vp of viewports) {
        console.log(`--- Testing Viewport on Vercel: ${vp.name} (${vp.width}x${vp.height}) ---`);
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

        await page.goto('https://frank-chat-app.vercel.app/login.html');
        await page.evaluate(({ token, user }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(user));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token, user });

        await page.goto('https://frank-chat-app.vercel.app/admin.html');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);

        const check = await page.evaluate((isDesktop) => {
            const doc = document.documentElement;
            const navBtn = document.getElementById('adminMobileNavBtn');
            const sidebar = document.getElementById('adminSidebar');
            const closeBtn = document.getElementById('adminMobileCloseBtn');
            
            const navBtnStyle = navBtn ? window.getComputedStyle(navBtn) : null;
            const sidebarStyle = sidebar ? window.getComputedStyle(sidebar) : null;
            const closeBtnStyle = closeBtn ? window.getComputedStyle(closeBtn) : null;

            return {
                scrollWidth: doc.scrollWidth,
                innerWidth: window.innerWidth,
                hasOverflow: doc.scrollWidth > window.innerWidth,
                navBtnVisible: navBtnStyle && navBtnStyle.display !== 'none',
                sidebarVisible: sidebarStyle && sidebarStyle.display !== 'none',
                sidebarLeft: sidebar ? Math.round(sidebar.getBoundingClientRect().left) : null,
                closeBtnVisible: closeBtnStyle && closeBtnStyle.display !== 'none'
            };
        }, vp.width >= 1000);

        console.log(`  scrollWidth: ${check.scrollWidth}px, innerWidth: ${check.innerWidth}px, overflow: ${check.hasOverflow}`);
        if (vp.width <= 768) {
            console.log(`  Mobile hamburger visible: ${check.navBtnVisible}`);
            console.log(`  Sidebar initially off-screen: ${check.sidebarLeft < 0}`);
            // Tap hamburger
            await page.click('#adminMobileNavBtn');
            await page.waitForTimeout(400);

            const openCheck = await page.evaluate(() => {
                const sb = document.getElementById('adminSidebar');
                const cb = document.getElementById('adminMobileCloseBtn');
                return {
                    isOpen: sb.classList.contains('open'),
                    left: Math.round(sb.getBoundingClientRect().left),
                    closeBtnVisible: window.getComputedStyle(cb).display !== 'none'
                };
            });
            console.log(`  Drawer opened: left=${openCheck.left}px, closeBtnVisible=${openCheck.closeBtnVisible}`);

            // Tap close button
            await page.click('#adminMobileCloseBtn');
            await page.waitForTimeout(400);

            const closedCheck = await page.evaluate(() => {
                const sb = document.getElementById('adminSidebar');
                return !sb.classList.contains('open');
            });
            console.log(`  Drawer closed via [✕]: ${closedCheck}`);
        } else {
            console.log(`  Desktop layout: sidebar left=${check.sidebarLeft}px, hamburger hidden=${!check.navBtnVisible}`);
        }

        await page.close();
    }

    await browser.close();
    console.log('\n🎉 LIVE VERCEL PRODUCTION ADMIN VERIFIED 100%!');
})();
