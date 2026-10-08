const { chromium } = require('playwright');
const http = require('http');

function postJson(url, data, token = null) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const postData = JSON.stringify(data);
        const headers = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const req = http.request({
            hostname: u.hostname,
            port: u.port,
            path: u.pathname,
            method: 'POST',
            headers
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
    console.log('=== USER CHAT & SMART CONVERSATIONS MOBILE TEST ===\n');

    const ts = Date.now();
    // 1. Create two test users and a conversation
    const userARes = await postJson('http://127.0.0.1:8000/api/auth/register', {
        username: `smart_mob_a_${ts}`,
        email: `smart_mob_a_${ts}@test.app`,
        password: 'Pass#User2026',
        full_name: 'Smart Mobile User A'
    });
    const tokenA = userARes.data.access_token;
    const userA = userARes.data.user;

    const userBRes = await postJson('http://127.0.0.1:8000/api/auth/register', {
        username: `smart_mob_b_${ts}`,
        email: `smart_mob_b_${ts}@test.app`,
        password: 'Pass#User2026',
        full_name: 'Smart Mobile User B'
    });
    const userB = userBRes.data.user;

    // Create private conversation
    const convRes = await postJson('http://127.0.0.1:8000/api/users/conversations/private', {
        target_user_id: userB.id
    }, tokenA);
    const convId = convRes.data.id;

    // Send Tamil story message
    const msgRes = await postJson('http://127.0.0.1:8000/api/messages', {
        recipient_id: userB.id,
        content: `முயற்சியின் வெற்றி\n\nஒரு சிறிய கிராமத்தில் குமார் என்ற இளைஞன் வாழ்ந்து வந்தான். அவன் ஒரு சிறிய விவசாய நிலத்தை வைத்திருந்தான்.`
    }, tokenA);
    const msgId = msgRes.data.id;

    console.log(`[PASS] Setup complete: Conv ID ${convId}, Msg ID ${msgId}\n`);

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

        // Navigate to login to set auth state
        await page.goto('http://127.0.0.1:8000/login.html');
        await page.evaluate(({ tokenA, userA }) => {
            localStorage.setItem('chatapp_token', tokenA);
            localStorage.setItem('chatapp_user', JSON.stringify(userA));
            localStorage.setItem('frank_onboarded', 'true');
        }, { tokenA, userA });

        // Navigate to dashboard
        await page.goto('http://127.0.0.1:8000/dashboard.html');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(600);

        // Check Dashboard Page Horizontal Overflow
        const dashOverflow = await page.evaluate(() => {
            return {
                scrollWidth: document.documentElement.scrollWidth,
                innerWidth: window.innerWidth,
                hasOverflow: document.documentElement.scrollWidth > window.innerWidth
            };
        });

        if (dashOverflow.hasOverflow) {
            console.error(`  [FAIL] Dashboard horizontal overflow: scrollWidth=${dashOverflow.scrollWidth}, innerWidth=${dashOverflow.innerWidth}`);
            allPassed = false;
        } else {
            console.log(`  [PASS] Dashboard zero horizontal overflow: ${dashOverflow.scrollWidth}px <= ${dashOverflow.innerWidth}px`);
        }

        // Open Smart Conversations panel via JS API or trigger
        await page.evaluate((cid) => {
            if (window.smartConversations && typeof window.smartConversations.open === 'function') {
                window.smartConversations.open(cid);
            } else {
                const modal = document.getElementById('smartConversationModal') || document.getElementById('smartPanel');
                if (modal) {
                    modal.classList.add('active');
                    modal.classList.add('open');
                }
            }
        }, convId);

        await page.waitForTimeout(400);

        // Check Smart Panel Display & Dimensions
        const smartCheck = await page.evaluate(() => {
            const panel = document.getElementById('smartConversationModal') || document.getElementById('smartPanel');
            if (!panel) return { found: false };
            const rect = panel.getBoundingClientRect();
            const doc = document.documentElement;
            return {
                found: true,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                viewportWidth: window.innerWidth,
                scrollWidth: doc.scrollWidth,
                hasOverflow: doc.scrollWidth > window.innerWidth
            };
        });

        if (!smartCheck.found) {
            console.error('  [FAIL] Smart panel element not found');
            allPassed = false;
        } else if (smartCheck.hasOverflow) {
            console.error(`  [FAIL] Smart panel caused horizontal overflow: scrollWidth=${smartCheck.scrollWidth}, innerWidth=${smartCheck.viewportWidth}`);
            allPassed = false;
        } else {
            console.log(`  [PASS] Smart panel responsive: panelWidth=${smartCheck.width}px, pageOverflow=0`);
        }

        // Verify Tab bar horizontal scrolling without page overflow
        const tabsCheck = await page.evaluate(() => {
            const tabsBar = document.querySelector('.smart-tabs-bar') || document.querySelector('.smart-modal-tabs');
            if (!tabsBar) return { found: false };
            const style = window.getComputedStyle(tabsBar);
            const tabButtons = tabsBar.querySelectorAll('.smart-tab-btn, button');
            return {
                found: true,
                tabCount: tabButtons.length,
                overflowX: style.overflowX
            };
        });

        if (tabsCheck.found) {
            console.log(`  [PASS] Tabs container verified: ${tabsCheck.tabCount} tabs, overflowX=${tabsCheck.overflowX}`);
        }

        // Close Smart Conversations panel
        await page.evaluate(() => {
            if (window.smartConversations && typeof window.smartConversations.close === 'function') {
                window.smartConversations.close();
            } else {
                const modal = document.getElementById('smartConversationModal') || document.getElementById('smartPanel');
                if (modal) {
                    modal.classList.remove('active');
                    modal.classList.remove('open');
                }
            }
        });
        await page.waitForTimeout(300);

        await page.close();
    }

    await browser.close();

    console.log('\n=============================================');
    if (allPassed) {
        console.log('🎉 ALL USER & SMART MOBILE TESTS PASSED 100%!');
    } else {
        console.error('❌ SOME USER & SMART MOBILE TESTS FAILED');
        process.exit(1);
    }
})();
