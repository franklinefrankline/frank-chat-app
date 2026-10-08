const { chromium } = require('playwright');
const http = require('http');

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

(async () => {
    console.log('=== ADMIN MOBILE COMPLETE AUTOMATED TEST ===\n');

    // 1. Authenticate with local server
    console.log('1. Authenticating as admin (frankline30999112@gmail.com)...');
    const loginRes = await postJson('http://127.0.0.1:8000/api/auth/login', {
        email: 'frankline30999112@gmail.com',
        password: '#Frankline2006'
    });

    if (loginRes.status !== 200 || !loginRes.data || !loginRes.data.access_token) {
        console.error('Login failed:', loginRes);
        process.exit(1);
    }

    const token = loginRes.data.access_token;
    const user = loginRes.data.user;
    console.log(`[PASS] Admin logged in. Role: ${user.role}, Frank ID: ${user.frank_id}\n`);

    const browser = await chromium.launch({ headless: true });

    const viewports = [
        { name: 'iPhone SE (320x568)', width: 320, height: 568 },
        { name: 'Galaxy S8 (360x640)', width: 360, height: 640 },
        { name: 'iPhone 8 (375x667)', width: 375, height: 667 },
        { name: 'iPhone 12/13/14 (390x844)', width: 390, height: 844 },
        { name: 'iPhone 14 Pro (393x852)', width: 393, height: 852 },
        { name: 'Pixel 7 (412x915)', width: 412, height: 915 },
        { name: 'iPhone 14 Pro Max (430x932)', width: 430, height: 932 },
        { name: 'iPad Portrait (768x1024)', width: 768, height: 1024 },
        { name: 'Mobile Landscape (667x375)', width: 667, height: 375 }
    ];

    let allPassed = true;

    for (const vp of viewports) {
        console.log(`--- Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

        // Navigate to login first to set auth state
        await page.goto('http://127.0.0.1:8000/login.html');
        await page.evaluate(({ token, user }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(user));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token, user });

        // Now load admin dashboard
        await page.goto('http://127.0.0.1:8000/admin.html');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(600);

        // A. Check for horizontal overflow
        const overflowCheck = await page.evaluate(() => {
            const doc = document.documentElement;
            return {
                scrollWidth: doc.scrollWidth,
                innerWidth: window.innerWidth,
                bodyScrollWidth: document.body.scrollWidth,
                hasOverflow: doc.scrollWidth > window.innerWidth
            };
        });

        if (overflowCheck.hasOverflow) {
            console.error(`  [FAIL] Horizontal overflow detected! scrollWidth=${overflowCheck.scrollWidth}, innerWidth=${overflowCheck.innerWidth}`);
            allPassed = false;
        } else {
            console.log(`  [PASS] Zero horizontal overflow: ${overflowCheck.scrollWidth}px <= ${overflowCheck.innerWidth}px`);
        }

        // B. Check mobile hamburger button visibility
        const navBtnVisible = await page.evaluate(() => {
            const btn = document.getElementById('adminMobileNavBtn');
            if (!btn) return false;
            const style = window.getComputedStyle(btn);
            const rect = btn.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        });

        if (!navBtnVisible) {
            console.error('  [FAIL] Mobile hamburger button #adminMobileNavBtn is NOT visible');
            allPassed = false;
        } else {
            console.log('  [PASS] Mobile hamburger button is visible and sized correctly');
        }

        // C. Check drawer initially closed
        const initiallyClosed = await page.evaluate(() => {
            const sb = document.getElementById('adminSidebar');
            if (!sb) return false;
            return !sb.classList.contains('open');
        });
        if (!initiallyClosed) {
            console.error('  [FAIL] Admin sidebar should initially be closed on mobile');
            allPassed = false;
        } else {
            console.log('  [PASS] Drawer initially closed off-screen');
        }

        // D. Tap hamburger to open drawer
        await page.click('#adminMobileNavBtn');
        await page.waitForTimeout(300);

        const isOpen = await page.evaluate(() => {
            const sb = document.getElementById('adminSidebar');
            const overlay = document.getElementById('adminMobileOverlay');
            const rect = sb.getBoundingClientRect();
            const overlayStyle = window.getComputedStyle(overlay);
            return {
                hasOpenClass: sb.classList.contains('open'),
                rectLeft: Math.round(rect.left),
                overlayVisible: overlayStyle.display !== 'none' && parseFloat(overlayStyle.opacity) > 0
            };
        });

        if (!isOpen.hasOpenClass || isOpen.rectLeft !== 0 || !isOpen.overlayVisible) {
            console.error(`  [FAIL] Drawer open check failed:`, isOpen);
            allPassed = false;
        } else {
            console.log(`  [PASS] Drawer opened smoothly (left: ${isOpen.rectLeft}px, overlay active)`);
        }

        // E. Check close button inside drawer
        const closeBtnVisible = await page.evaluate(() => {
            const btn = document.getElementById('adminMobileCloseBtn');
            if (!btn) return false;
            const style = window.getComputedStyle(btn);
            const rect = btn.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0;
        });

        if (!closeBtnVisible) {
            console.error('  [FAIL] Mobile close button #adminMobileCloseBtn is NOT visible inside drawer');
            allPassed = false;
        } else {
            console.log('  [PASS] Close button [✕] visible inside drawer');
        }

        // F. Tap close button to close drawer
        await page.click('#adminMobileCloseBtn');
        await page.waitForTimeout(300);

        const isClosedViaBtn = await page.evaluate(() => {
            const sb = document.getElementById('adminSidebar');
            return !sb.classList.contains('open');
        });

        if (!isClosedViaBtn) {
            console.error('  [FAIL] Drawer failed to close after tapping close button');
            allPassed = false;
        } else {
            console.log('  [PASS] Drawer closed successfully via [✕] close button');
        }

        // G. Tap hamburger again, then click overlay to close (outside click)
        await page.click('#adminMobileNavBtn');
        await page.waitForTimeout(300);
        // Click on the uncovered overlay area to the right of the drawer
        await page.mouse.click(vp.width - 10, 150);
        await page.waitForTimeout(300);

        const isClosedViaOverlay = await page.evaluate(() => {
            const sb = document.getElementById('adminSidebar');
            return !sb.classList.contains('open');
        });

        if (!isClosedViaOverlay) {
            console.error('  [FAIL] Drawer failed to close after tapping outside overlay');
            allPassed = false;
        } else {
            console.log('  [PASS] Drawer closed successfully via outside click on overlay');
        }

        // H. Tap hamburger again, then press Escape to close
        await page.click('#adminMobileNavBtn');
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        const isClosedViaEsc = await page.evaluate(() => {
            const sb = document.getElementById('adminSidebar');
            return !sb.classList.contains('open');
        });

        if (!isClosedViaEsc) {
            console.error('  [FAIL] Drawer failed to close after pressing Escape');
            allPassed = false;
        } else {
            console.log('  [PASS] Drawer closed successfully via Escape key');
        }

        // I. Tap hamburger again, then click User Management nav item
        await page.click('#adminMobileNavBtn');
        await page.waitForTimeout(300);
        await page.click('#navUsersBtn');
        await page.waitForTimeout(400);

        const navItemWorked = await page.evaluate(() => {
            const sb = document.getElementById('adminSidebar');
            const usersSection = document.getElementById('sectionUsers');
            return {
                drawerClosed: !sb.classList.contains('open'),
                usersSectionActive: usersSection && usersSection.classList.contains('active')
            };
        });

        if (!navItemWorked.drawerClosed || !navItemWorked.usersSectionActive) {
            console.error('  [FAIL] Section switch navigation failed:', navItemWorked);
            allPassed = false;
        } else {
            console.log('  [PASS] Menu navigation item switched section to User Management and closed drawer automatically');
        }

        await page.close();
    }

    // Desktop Test (1280x800)
    console.log('\n--- Testing Desktop Viewport (1280x800) ---');
    const desktopPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await desktopPage.goto('http://127.0.0.1:8000/login.html');
    await desktopPage.evaluate(({ token, user }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(user));
        localStorage.setItem('frank_onboarded', 'true');
    }, { token, user });

    await desktopPage.goto('http://127.0.0.1:8000/admin.html');
    await desktopPage.waitForLoadState('networkidle');
    await desktopPage.waitForTimeout(600);

    const desktopState = await desktopPage.evaluate(() => {
        const sb = document.getElementById('adminSidebar');
        const navBtn = document.getElementById('adminMobileNavBtn');
        const closeBtn = document.getElementById('adminMobileCloseBtn');
        const sbStyle = window.getComputedStyle(sb);
        const navBtnStyle = window.getComputedStyle(navBtn);
        const closeBtnStyle = window.getComputedStyle(closeBtn);
        return {
            sidebarVisible: sbStyle.display !== 'none' && sb.getBoundingClientRect().left === 0,
            hamburgerHidden: navBtnStyle.display === 'none',
            closeBtnHidden: closeBtnStyle.display === 'none',
            sidebarWidth: Math.round(sb.getBoundingClientRect().width)
        };
    });

    if (!desktopState.sidebarVisible || !desktopState.hamburgerHidden || !desktopState.closeBtnHidden) {
        console.error('  [FAIL] Desktop layout check failed:', desktopState);
        allPassed = false;
    } else {
        console.log(`  [PASS] Desktop layout intact: sidebar permanently visible (${desktopState.sidebarWidth}px), mobile hamburger hidden, close button hidden.`);
    }

    await desktopPage.close();
    await browser.close();

    console.log('\n=============================================');
    if (allPassed) {
        console.log('🎉 ALL ADMIN MOBILE TESTS PASSED 100%!');
    } else {
        console.error('❌ SOME ADMIN MOBILE TESTS FAILED');
        process.exit(1);
    }
})();
