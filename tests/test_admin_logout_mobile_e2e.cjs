const { chromium } = require('playwright');
const http = require('http');
const path = require('path');
const assert = require('assert');

function postJson(url, data) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const postData = JSON.stringify(data);
        const req = http.request({
            hostname: u.hostname,
            port: u.port,
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

const VIEWPORTS = [
    { name: 'iPhone SE (320px)', width: 320, height: 568 },
    { name: 'iPhone 8 (375px)', width: 375, height: 667 },
    { name: 'iPhone 12/13/14 (390px)', width: 390, height: 844 },
    { name: 'iPhone 14 Pro Max (430px)', width: 430, height: 932 },
    { name: 'iPad Portrait (768px)', width: 768, height: 1024 },
    { name: 'Desktop HD (1280px)', width: 1280, height: 800 }
];

let totalChecks = 0;
let passedChecks = 0;

function check(name, condition, extra = '') {
    totalChecks++;
    if (condition) {
        passedChecks++;
        console.log(`  [PASS] ${name} ${extra ? '(' + extra + ')' : ''}`);
    } else {
        console.error(`  [FAIL] ${name} ${extra ? '- ' + extra : ''}`);
    }
}

(async () => {
    console.log('================================================================');
    console.log('ADMIN MOBILE & RESPONSIVE LOGOUT BUTTON COMPREHENSIVE TEST');
    console.log('================================================================\n');

    // Step 1: Authenticate as admin
    console.log('1. Authenticating as administrator (frankline30999112@gmail.com)...');
    const loginRes = await postJson('http://127.0.0.1:8000/api/auth/login', {
        email: 'frankline30999112@gmail.com',
        password: '#Frankline2006'
    });

    if (loginRes.status !== 200 || !loginRes.data || !loginRes.data.access_token) {
        console.error('Authentication failed:', loginRes);
        process.exit(1);
    }

    const token = loginRes.data.access_token;
    const user = loginRes.data.user;
    check('Admin login succeeded', true, `Role: ${user.role}, ID: ${user.frank_id}`);

    const browser = await chromium.launch({ headless: true });

    // Step 2: Test responsiveness and visibility across all required widths
    console.log('\n2. Testing Logout button visibility & drawer access across viewports:');

    for (const vp of VIEWPORTS) {
        console.log(`\n--- Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();

        await page.goto('http://127.0.0.1:8000/login.html');
        await page.evaluate(({ token, user }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(user));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token, user });

        await page.goto('http://127.0.0.1:8000/admin.html');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(400);

        // A. Header logout button
        const headerLogout = await page.$('#adminHeaderSignOutBtn');
        check(`${vp.width}px: Header logout button #adminHeaderSignOutBtn exists`, !!headerLogout);

        if (headerLogout) {
            const isVisible = await headerLogout.isVisible();
            const box = await headerLogout.boundingBox();
            check(`${vp.width}px: Header logout button is visible in topbar`, isVisible && box && box.width > 0 && box.height > 0,
                  box ? `x: ${Math.round(box.x)}, y: ${Math.round(box.y)}, w: ${Math.round(box.width)}, h: ${Math.round(box.height)}` : 'no box');
        }

        // B. Zero horizontal overflow check
        const overflow = await page.evaluate(() => {
            const doc = document.documentElement;
            return {
                scrollWidth: doc.scrollWidth,
                clientWidth: doc.clientWidth,
                hasOverflow: doc.scrollWidth > doc.clientWidth
            };
        });
        check(`${vp.width}px: Zero horizontal overflow`, !overflow.hasOverflow, `scroll: ${overflow.scrollWidth}px, client: ${overflow.clientWidth}px`);

        // C. If mobile (<900px), test drawer logout menu item
        if (vp.width <= 900) {
            // Open hamburger drawer
            await page.click('#adminMobileNavBtn');
            await page.waitForTimeout(300);

            // Drawer logout menu item
            const drawerLogout = await page.$('#adminDrawerSignOutBtn');
            check(`${vp.width}px: Drawer menu item #adminDrawerSignOutBtn exists`, !!drawerLogout);

            if (drawerLogout) {
                const isVisible = await drawerLogout.isVisible();
                const text = await drawerLogout.innerText();
                const box = await drawerLogout.boundingBox();
                const hasLogoutText = text.toLowerCase().includes('sign out') || text.toLowerCase().includes('log out') || text.toLowerCase().includes('logout');
                check(`${vp.width}px: Drawer logout menu item is visible & labeled`, isVisible && hasLogoutText, `Text: "${text.trim()}"`);
                check(`${vp.width}px: Drawer logout menu item has valid geometry`, box && box.x >= 0 && box.y >= 0 && box.height >= 30);
            }

            // Footer logout button in drawer
            const footerLogout = await page.$('#adminSignOutBtn');
            check(`${vp.width}px: Sidebar footer #adminSignOutBtn exists`, !!footerLogout);
            if (footerLogout) {
                const isVisible = await footerLogout.isVisible();
                check(`${vp.width}px: Sidebar footer #adminSignOutBtn is visible in drawer`, isVisible);
            }

            // Close drawer
            await page.click('#adminMobileCloseBtn');
            await page.waitForTimeout(200);
            const isClosed = await page.evaluate(() => !document.getElementById('adminSidebar').classList.contains('open'));
            check(`${vp.width}px: Drawer closed cleanly`, isClosed);
        } else {
            // Desktop check
            const desktopFooterLogout = await page.$('#adminSignOutBtn');
            check(`Desktop ${vp.width}px: Sidebar footer #adminSignOutBtn visible`, !!desktopFooterLogout && await desktopFooterLogout.isVisible());
        }

        await context.close();
    }

    // Step 3: Functional verification - Test Logout via Mobile Header Button
    console.log('\n3. Testing functional Logout via Mobile Header Button (375px)...');
    {
        const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
        const page = await context.newPage();

        await page.goto('http://127.0.0.1:8000/login.html');
        await page.evaluate(({ token, user }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(user));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token, user });

        await page.goto('http://127.0.0.1:8000/admin.html');
        await page.waitForLoadState('networkidle');

        // Click header logout
        await page.click('#adminHeaderSignOutBtn');
        await page.waitForURL('**/login.html*', { timeout: 8000 });
        check('Clicking mobile header logout redirects to login.html', page.url().includes('login.html'), page.url());

        // Verify tokens cleared
        const tokensCleared = await page.evaluate(() => {
            return !localStorage.getItem('chatapp_token') && !localStorage.getItem('chatapp_user');
        });
        check('Authentication tokens cleared from localStorage', tokensCleared);

        // Verify protected route guard prevents re-entry to admin.html
        await page.goto('http://127.0.0.1:8000/admin.html');
        await page.waitForTimeout(500);
        check('Direct navigation to admin.html after logout is blocked & redirects to login.html', page.url().includes('login.html'), page.url());

        await context.close();
    }

    // Step 4: Functional verification - Test Logout via Mobile Drawer Nav Item
    console.log('\n4. Testing functional Logout via Mobile Drawer Nav Item (390px)...');
    {
        const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await context.newPage();

        await page.goto('http://127.0.0.1:8000/login.html');
        await page.evaluate(({ token, user }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(user));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token, user });

        await page.goto('http://127.0.0.1:8000/admin.html');
        await page.waitForLoadState('networkidle');

        // Open hamburger menu
        await page.click('#adminMobileNavBtn');
        await page.waitForTimeout(300);

        // Click drawer logout menu item
        await page.click('#adminDrawerSignOutBtn');
        await page.waitForURL('**/login.html*', { timeout: 8000 });
        check('Clicking drawer logout menu item redirects to login.html', page.url().includes('login.html'), page.url());

        // Verify protected access blocked
        await page.goto('http://127.0.0.1:8000/admin.html');
        await page.waitForTimeout(500);
        check('Direct navigation to admin.html blocked after drawer logout', page.url().includes('login.html'), page.url());

        await context.close();
    }

    // Step 5: Functional verification - Test Logout on Desktop (1280px)
    console.log('\n5. Testing functional Logout on Desktop layout (1280px)...');
    {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await context.newPage();

        await page.goto('http://127.0.0.1:8000/login.html');
        await page.evaluate(({ token, user }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(user));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token, user });

        await page.goto('http://127.0.0.1:8000/admin.html');
        await page.waitForLoadState('networkidle');

        // Click desktop footer sign out button
        await page.click('#adminSignOutBtn');
        await page.waitForURL('**/login.html*', { timeout: 8000 });
        check('Clicking desktop sidebar logout redirects to login.html', page.url().includes('login.html'), page.url());

        // Verify protected access blocked
        await page.goto('http://127.0.0.1:8000/admin.html');
        await page.waitForTimeout(500);
        check('Direct navigation to admin.html blocked on desktop after logout', page.url().includes('login.html'), page.url());

        await context.close();
    }

    await browser.close();

    console.log('\n================================================================');
    console.log(`TOTAL CHECKS  : ${totalChecks}`);
    console.log(`PASSED CHECKS : ${passedChecks}`);
    console.log(`FAILED CHECKS : ${totalChecks - passedChecks}`);
    console.log(`SUCCESS RATE  : ${((passedChecks / totalChecks) * 100).toFixed(1)}%`);
    console.log('================================================================');

    if (passedChecks !== totalChecks) {
        process.exit(1);
    }
})();
