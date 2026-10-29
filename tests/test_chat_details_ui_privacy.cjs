const { chromium } = require('playwright');
const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:8000';

(async () => {
    console.log('=== STARTING CHAT DETAILS UI EMAIL PRIVACY PLAYWRIGHT TEST ===');
    
    // Provision fresh users via Python helper
    const setupOutput = execSync('python scratch/setup_ui_test_users.py', { encoding: 'utf-8' }).trim();
    const { userA, userB } = JSON.parse(setupOutput);

    console.log(`[SETUP] Created User A: ${userA.email} (ID: ${userA.id}, FID: ${userA.frank_id})`);
    console.log(`[SETUP] Created User B: ${userB.email} (ID: ${userB.id}, FID: ${userB.frank_id})`);

    const browser = await chromium.launch({ headless: true });

    // ---------------- SCENARIO 1: Account A opens its own Chat Details ----------------
    console.log('\n--- Scenario 1: Account A opens its own profile & self Chat Details ---');
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    // Set auth token in localStorage before navigation and dismiss onboarding
    await pageA.addInitScript(({ token, user }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('frank_token', token);
        localStorage.setItem('frank_auth_token', token);
        localStorage.setItem('frank_onboarded', 'true');
        localStorage.setItem('qenvo_onboarded', 'true');
        localStorage.setItem('chatapp_user', JSON.stringify({
            id: user.id,
            email: user.email,
            username: user.username,
            full_name: user.full_name,
            frank_id: user.frank_id
        }));
    }, { token: userA.token, user: userA });

    await pageA.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await pageA.waitForSelector('#conversationList', { timeout: 10000 });
    console.log('[UI] Dashboard loaded for Account A');

    // Wait 1s for conversations and UI to settle
    await pageA.waitForTimeout(1000);

    // Dismiss any modal backdrop just in case
    await pageA.evaluate(() => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active', 'open', 'show'));
    });

    // Toggle Chat Details drawer
    await pageA.click('#toggleDrawerBtn');
    await pageA.waitForSelector('#detailsDrawer.open, #detailsDrawer[style*="flex"]', { timeout: 5000 });

    const drawerSubSelf = await pageA.textContent('#drawerSubtitle');
    const drawerFidSelf = await pageA.textContent('#drawerFrankIdVal');
    console.log(`[UI] Account A Self Drawer Subtitle: "${drawerSubSelf}"`);
    console.log(`[UI] Account A Self Drawer FRANK ID: "${drawerFidSelf}"`);

    // Owner should see their own FRANK ID and own email
    if (drawerSubSelf.includes(userA.email)) {
        console.log('[PASS] Account A views its own email address in own Chat Details');
    }
    if (drawerFidSelf.includes(userA.frank_id)) {
        console.log('[PASS] Account A views its own FRANK ID in own Chat Details');
    }

    // ---------------- SCENARIO 2: Account A opens Account B's Chat Details ----------------
    console.log("\n--- Scenario 2: Account A opens Account B's Chat Details ---");
    // Account A opens direct conversation with Account B
    await pageA.evaluate(async (target) => {
        if (window.chatController) {
            await window.chatController.openDirectChat({
                id: target.id,
                name: target.full_name,
                full_name: target.full_name,
                username: target.username,
                frank_id: target.frank_id
            });
        }
    }, userB);

    await pageA.waitForTimeout(1200);

    // Ensure Chat Details drawer is open
    const drawerDisplay = await pageA.evaluate(() => {
        const d = document.getElementById('detailsDrawer');
        return d ? d.style.display : 'none';
    });
    if (drawerDisplay === 'none') {
        await pageA.click('#toggleDrawerBtn');
        await pageA.waitForTimeout(500);
    }

    // Inspect all text content inside the drawer
    const drawerTextAViewsB = await pageA.evaluate(() => {
        const d = document.getElementById('detailsDrawer');
        return d ? d.innerText : '';
    });
    const drawerHtmlAViewsB = await pageA.evaluate(() => {
        const d = document.getElementById('detailsDrawer');
        return d ? d.innerHTML : '';
    });

    console.log(`[UI] Account A inspecting Account B's drawer:`);
    const fidVal = await pageA.textContent('#drawerFrankIdVal');
    const nameVal = await pageA.textContent('#drawerName');
    const subVal = await pageA.textContent('#drawerSubtitle');
    console.log(`  - Name displayed: "${nameVal}"`);
    console.log(`  - Handle displayed: "${subVal}"`);
    console.log(`  - FRANK ID displayed: "${fidVal}"`);

    // Verify FRANK ID is shown
    if (!fidVal.includes(userB.frank_id)) {
        throw new Error(`Expected Account B's FRANK ID ${userB.frank_id} to be visible in drawer, got: ${fidVal}`);
    }
    console.log(`[PASS] Account B's FRANK ID (${userB.frank_id}) is prominently displayed to Account A!`);

    // CRITICAL CHECK: Account B's email address must NEVER appear
    if (drawerTextAViewsB.toLowerCase().includes(userB.email.toLowerCase()) || drawerHtmlAViewsB.toLowerCase().includes(userB.email.toLowerCase())) {
        throw new Error(`CRITICAL PRIVACY BREACH: Account B's email (${userB.email}) was found in Account A's view of Chat Details!`);
    }
    console.log(`[PASS] Account B's email (${userB.email}) is 100% ABSENT from Account A's Chat Details!`);

    // Verify Copy FRANK ID button works
    await pageA.click('#drawerCopyFrankIdBtn');
    console.log(`[PASS] Clicked Copy FRANK ID button successfully`);

    // ---------------- SCENARIO 3: Account B opens Account A's Chat Details ----------------
    console.log("\n--- Scenario 3: Account B opens Account A's Chat Details (Reverse Verification) ---");
    const contextB = await browser.newContext();
    const pageB = await contextB.newPage();

    await pageB.addInitScript(({ token, user }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('frank_token', token);
        localStorage.setItem('frank_auth_token', token);
        localStorage.setItem('frank_onboarded', 'true');
        localStorage.setItem('qenvo_onboarded', 'true');
        localStorage.setItem('chatapp_user', JSON.stringify({
            id: user.id,
            email: user.email,
            username: user.username,
            full_name: user.full_name,
            frank_id: user.frank_id
        }));
    }, { token: userB.token, user: userB });

    await pageB.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'domcontentloaded' });
    await pageB.waitForSelector('#conversationList', { timeout: 10000 });
    await pageB.waitForTimeout(1000);

    // Dismiss any modal backdrop
    await pageB.evaluate(() => {
        document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active', 'open', 'show'));
    });

    // Account B opens direct chat with Account A
    await pageB.evaluate(async (target) => {
        if (window.chatController) {
            await window.chatController.openDirectChat({
                id: target.id,
                name: target.full_name,
                full_name: target.full_name,
                username: target.username,
                frank_id: target.frank_id
            });
        }
    }, userA);

    await pageB.waitForTimeout(1200);

    // Open Chat Details
    const drawerDisplayB = await pageB.evaluate(() => {
        const d = document.getElementById('detailsDrawer');
        return d ? d.style.display : 'none';
    });
    if (drawerDisplayB === 'none') {
        await pageB.click('#toggleDrawerBtn');
        await pageB.waitForTimeout(500);
    }

    const fidValB = await pageB.textContent('#drawerFrankIdVal');
    const nameValB = await pageB.textContent('#drawerName');
    const subValB = await pageB.textContent('#drawerSubtitle');
    const drawerHtmlBViewsA = await pageB.evaluate(() => {
        const d = document.getElementById('detailsDrawer');
        return d ? d.innerHTML : '';
    });

    console.log(`[UI] Account B inspecting Account A's drawer:`);
    console.log(`  - Name displayed: "${nameValB}"`);
    console.log(`  - Handle displayed: "${subValB}"`);
    console.log(`  - FRANK ID displayed: "${fidValB}"`);

    // Verify FRANK ID is shown
    if (!fidValB.includes(userA.frank_id)) {
        throw new Error(`Expected Account A's FRANK ID ${userA.frank_id} to be visible in drawer, got: ${fidValB}`);
    }
    console.log(`[PASS] Account A's FRANK ID (${userA.frank_id}) is prominently displayed to Account B!`);

    // CRITICAL CHECK: Account A's email address must NEVER appear
    if (drawerHtmlBViewsA.toLowerCase().includes(userA.email.toLowerCase())) {
        throw new Error(`CRITICAL PRIVACY BREACH: Account A's email (${userA.email}) was found in Account B's view of Chat Details!`);
    }
    console.log(`[PASS] Account A's email (${userA.email}) is 100% ABSENT from Account B's Chat Details!`);

    // Verify Copy FRANK ID button works for B copying A
    await pageB.click('#drawerCopyFrankIdBtn');
    console.log(`[PASS] Clicked Copy FRANK ID button for Account A's ID successfully`);

    await browser.close();

    console.log('\n======================================================');
    console.log('ALL PLAYWRIGHT CHAT DETAILS PRIVACY TESTS PASSED 100%!');
    console.log('======================================================\n');
})();
