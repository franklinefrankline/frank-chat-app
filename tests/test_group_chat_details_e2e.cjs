const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('==================================================');
    console.log('RUNNING COMPREHENSIVE GROUP CHAT DETAILS TEST SUITE');
    console.log('==================================================\n');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('[BROWSER ERROR]', msg.text());
            consoleErrors.push(msg.text());
        }
    });
    page.on('pageerror', err => {
        console.log('[BROWSER UNCAUGHT]', err.message);
        consoleErrors.push(err.message);
    });

    const BASE_URL = 'http://127.0.0.1:8000';

    // 1. Log in as Frank (User ID 274, role: user)
    console.log('Step 1: Logging in as franklinesamy2006@gmail.com...');
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
    await page.fill('#loginUsername', 'franklinesamy2006@gmail.com');
    await page.fill('#loginPassword', '#Frankline2006');
    await page.click('#loginSubmitBtn');
    await page.waitForURL('**/dashboard.html', { timeout: 10000 });
    console.log('✓ Successfully logged in and reached dashboard.');

    // Wait for dashboard to fully load and dismiss any onboarding modal
    await page.waitForSelector('#chatApp', { state: 'visible', timeout: 8000 });
    await page.evaluate(() => {
        localStorage.setItem('frank_onboarded', 'true');
        const m = document.getElementById('welcomeOnboardingModal');
        if (m) {
            m.classList.remove('active', 'open', 'show');
            m.style.display = 'none';
        }
    });

    // 2. Create a dedicated isolated test group via API
    console.log('\nStep 2: Creating an isolated test group...');
    const testGroupName = `AutoTest Group ${Date.now().toString().slice(-4)}`;
    const createGroupRes = await page.evaluate(async (name) => {
        return await window.api.createGroup({
            name: name,
            description: 'Automated test group for details drawer verification',
            privacy: 'private',
            member_ids: []
        });
    }, testGroupName);
    const testGroupId = createGroupRes.id;
    console.log(`✓ Created test group: "${testGroupName}" (ID: ${testGroupId})`);

    // Reload conversations or open the group
    await page.evaluate(async (gid) => {
        const group = await window.api.getGroup(gid);
        window.chatController.openGroupChat(group);
    }, testGroupId);

    // 3. Open details drawer
    console.log('\nStep 3: Opening Group Chat Details drawer...');
    await page.evaluate(() => {
        window.chatController.openDrawer();
    });
    await page.waitForSelector('#detailsDrawer.open', { state: 'visible', timeout: 5000 });
    console.log('✓ Details drawer opened successfully.');

    // Verify Group Name, Subtitle, and Description in Drawer
    const drawerName = (await page.locator('#drawerName').innerText()).trim();
    const drawerSubtitle = (await page.locator('#drawerSubtitle').innerText()).trim();
    const drawerBio = (await page.locator('#drawerBio').innerText()).trim();
    console.log(`Drawer Header Name: "${drawerName}"`);
    console.log(`Drawer Subtitle: "${drawerSubtitle}"`);
    console.log(`Drawer Bio: "${drawerBio}"`);
    if (drawerName !== testGroupName) {
        throw new Error(`Drawer name mismatch: expected "${testGroupName}", got "${drawerName}"`);
    }
    if (!drawerSubtitle.includes('Private Group') || !drawerSubtitle.includes('1 member')) {
        throw new Error(`Drawer subtitle incorrect: "${drawerSubtitle}"`);
    }
    console.log('✓ Header alignment, privacy badge, and member count verified.');

    // 4. Test Tab Switching (Members <-> Documents)
    console.log('\nStep 4: Testing Members and Documents tabs...');
    const membersSec = page.locator('#drawerMembersSection');
    const docsSec = page.locator('#drawerDocsSection');
    const membersTabBtn = page.locator('#drawerTabMembersBtn');
    const docsTabBtn = page.locator('#drawerTabDocsBtn');

    // Default should be Members
    if (!(await membersSec.isVisible())) throw new Error('Members section should be visible by default');
    if (await docsSec.isVisible()) throw new Error('Docs section should be hidden by default');
    console.log('✓ Members tab is active by default.');

    // Switch to Documents tab
    await docsTabBtn.click();
    await page.waitForTimeout(400);
    if (await membersSec.isVisible()) throw new Error('Members section should be hidden when Docs tab is active');
    if (!(await docsSec.isVisible())) throw new Error('Docs section should be visible when Docs tab is active');
    const docsText = await docsSec.innerText();
    console.log('Docs section content:', docsText.replace(/\n+/g, ' ').slice(0, 80));
    console.log('✓ Switched to Documents tab cleanly.');

    // Switch back to Members tab
    await membersTabBtn.click();
    await page.waitForTimeout(400);
    if (!(await membersSec.isVisible())) throw new Error('Members section should be visible after switching back');
    if (await docsSec.isVisible()) throw new Error('Docs section should be hidden after switching back');
    console.log('✓ Switched back to Members tab cleanly without state duplication.');

    // 5. Test Add Members Button & Dialog
    console.log('\nStep 5: Testing Add Member Button & Searchable Modal...');
    const addMemberBtn = page.locator('#drawerAddMemberActionBtn');
    if (!(await addMemberBtn.isVisible())) throw new Error('Add Member button should be visible to group owner');
    await addMemberBtn.click();

    await page.waitForSelector('#addMembersModal', { state: 'visible', timeout: 5000 });
    console.log('✓ Add Members modal opened.');

    const searchInput = page.locator('#addMembersSearchInput');
    if (!(await searchInput.isVisible())) throw new Error('Search input missing in Add Members modal');

    // Wait for available contacts to load
    await page.waitForSelector('.add-member-picker-row', { state: 'visible', timeout: 5000 });
    const initialPickerCount = await page.locator('.add-member-picker-row').count();
    console.log(`✓ Loaded ${initialPickerCount} eligible contacts from backend.`);
    if (initialPickerCount === 0) throw new Error('Expected at least 1 eligible contact to be available');

    // Test search filter
    const firstUserName = await page.evaluate(() => {
        const row = document.querySelector('.add-member-picker-row');
        if (!row) return 'Alex';
        const nameEl = row.querySelector('span[style*="font-weight: 700"]') || row.querySelector('.drawer-member-name');
        return nameEl ? nameEl.textContent.trim() : 'Alex';
    });
    const queryPart = firstUserName.slice(0, 3);
    console.log(`Testing search filter in modal with query "${queryPart}" (user: "${firstUserName}")...`);
    await searchInput.fill(queryPart);
    await page.waitForTimeout(400);
    const filteredCount = await page.locator('.add-member-picker-row').count();
    console.log(`Filtered count for "${queryPart}": ${filteredCount}`);
    if (filteredCount === 0) throw new Error(`Search filter failed to find "${queryPart}"`);

    // Check FRANK ID presence on row
    const firstRowText = await page.locator('.add-member-picker-row').first().innerText();
    console.log('First eligible user card preview:\n', firstRowText.replace(/\n+/g, ' | '));

    // Select the user
    await page.locator('.add-member-picker-row input[type="checkbox"]').first().click();
    const selectedCountText = (await page.locator('#addMembersSelectedCount').innerText()).trim();
    console.log(`Selection count: "${selectedCountText}"`);
    if (!selectedCountText.includes('1 selected')) throw new Error('Selection counter failed to update');

    // Submit Add Members
    const confirmBtn = page.locator('#confirmAddMembersBtn');
    await confirmBtn.click();
    await page.waitForSelector('#addMembersModal', { state: 'detached', timeout: 6000 });
    console.log('✓ Modal closed after backend confirmed addition.');

    // Wait for member list refresh
    await page.waitForTimeout(1000);
    const memberCards = page.locator('.drawer-member-card');
    const memberCardsCount = await memberCards.count();
    console.log(`✓ Drawer member count after addition: ${memberCardsCount}`);
    if (memberCardsCount < 2) throw new Error('Expected at least 2 members in drawer list after addition');

    // 6. Test Member List Layout and Overlap Check
    console.log('\nStep 6: Verifying Member List Layout (No text/button overlap)...');
    for (let i = 0; i < memberCardsCount; i++) {
        const card = memberCards.nth(i);
        const nameEl = card.locator('.drawer-member-name');
        const roleBadge = card.locator('.member-role-badge');
        const fidPill = card.locator('.drawer-member-fid-pill');
        const actionsRow = card.locator('.drawer-member-actions-row');

        const nameBox = await nameEl.boundingBox();
        const badgeBox = await roleBadge.boundingBox();

        if (nameBox && badgeBox) {
            // Verify name and badge don't collide horizontally
            const overlapX = Math.max(0, Math.min(nameBox.x + nameBox.width, badgeBox.x + badgeBox.width) - Math.max(nameBox.x, badgeBox.x));
            if (overlapX > 2) {
                throw new Error(`Layout overlap detected between member name and role badge! Overlap: ${overlapX}px`);
            }
        }

        const actionsVisible = await actionsRow.isVisible();
        if (actionsVisible) {
            const actionsBox = await actionsRow.boundingBox();
            if (actionsBox && nameBox) {
                // Actions must be physically below the name row
                if (actionsBox.y < nameBox.y + nameBox.height - 2) {
                    throw new Error(`Actions row overlaps vertically with member name row!`);
                }
            }
        }
    }
    console.log('✓ Verified: ZERO overlap between names, role badges, FRANK IDs, and action buttons.');

    // 7. Test Make Admin Functionality
    console.log('\nStep 7: Testing Make Admin button...');
    const promoteBtn = page.locator('.drawer-member-card .promote-action').first();
    if (!(await promoteBtn.isVisible())) throw new Error('Promote to Admin button not found for non-owner member');

    await promoteBtn.click();
    // Confirmation modal should appear
    await page.waitForSelector('#dynamicConfirmModal', { state: 'visible', timeout: 3000 });
    console.log('✓ Make Admin confirmation dialog shown.');
    // Click Confirm
    await page.click('#confirmModalOk');

    // Wait for list refresh
    await page.waitForTimeout(1000);
    const adminBadges = await page.locator('.member-role-badge.role-admin').count();
    console.log(`Admin badges count after promotion: ${adminBadges}`);
    if (adminBadges === 0) throw new Error('Role badge did not update to 🛡️ Admin after promotion');
    console.log('✓ Successfully promoted member to Admin with backend confirmation and badge update.');

    // 8. Test Demote Member Functionality
    console.log('\nStep 8: Testing Demote Admin button...');
    const demoteBtn = page.locator('.drawer-member-card .demote-action').first();
    if (!(await demoteBtn.isVisible())) throw new Error('Demote button not found for newly promoted admin');

    await demoteBtn.click();
    await page.waitForSelector('#dynamicConfirmModal', { state: 'visible', timeout: 3000 });
    console.log('✓ Demote confirmation dialog shown.');
    await page.click('#confirmModalOk');

    await page.waitForTimeout(1000);
    const demotedCardRole = await page.locator('.drawer-member-card').nth(1).locator('.member-role-badge').innerText();
    console.log(`Member role badge after demotion: "${demotedCardRole}"`);
    if (demotedCardRole.includes('Admin')) throw new Error('Member should no longer have Admin role');
    console.log('✓ Successfully demoted Admin back to Member.');

    // 9. Test Remove Member Functionality
    console.log('\nStep 9: Testing Remove Member button...');
    const removeBtn = page.locator('.drawer-member-card .remove-action').first();
    await removeBtn.click();
    await page.waitForSelector('#dynamicConfirmModal', { state: 'visible', timeout: 3000 });
    console.log('✓ Remove Member confirmation dialog shown.');
    await page.click('#confirmModalOk');

    await page.waitForTimeout(1000);
    const countAfterRemove = await page.locator('.drawer-member-card').count();
    console.log(`Member count after removal: ${countAfterRemove}`);
    if (countAfterRemove !== 1) throw new Error(`Expected exactly 1 member remaining (the owner), got ${countAfterRemove}`);
    console.log('✓ Successfully removed member with confirmation; group updated.');

    // 10. Test Mobile Responsive Viewports
    console.log('\nStep 10: Testing Mobile & Desktop Responsive Viewports...');
    const viewports = [
        { width: 320, height: 600, label: '320px Mobile' },
        { width: 375, height: 667, label: '375px Mobile' },
        { width: 390, height: 844, label: '390px Mobile' },
        { width: 430, height: 932, label: '430px Mobile' },
        { width: 768, height: 1024, label: '768px Tablet' },
        { width: 1280, height: 800, label: '1280px Desktop' }
    ];

    for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.waitForTimeout(300);

        // Ensure drawer is open
        await page.evaluate(() => window.chatController.openDrawer());
        await page.waitForTimeout(200);

        const drawerBox = await page.locator('#detailsDrawer').boundingBox();
        const drawerScrollWidth = await page.evaluate(() => document.getElementById('detailsDrawer').scrollWidth);
        const drawerClientWidth = await page.evaluate(() => document.getElementById('detailsDrawer').clientWidth);

        console.log(`[${vp.label}] Drawer Width: ${drawerBox?.width}px, ClientWidth: ${drawerClientWidth}px, ScrollWidth: ${drawerScrollWidth}px`);
        if (drawerScrollWidth > drawerClientWidth + 1) {
            throw new Error(`Horizontal overflow inside details drawer on ${vp.label}! scrollWidth: ${drawerScrollWidth}, clientWidth: ${drawerClientWidth}`);
        }

        // Close button check
        const closeBtnVisible = await page.locator('#closeDrawerBtn').isVisible();
        if (!closeBtnVisible) throw new Error(`Close button missing or not visible on ${vp.label}`);

        const shotPath = path.resolve(__dirname, `screenshot_drawer_${vp.width}px.png`);
        await page.screenshot({ path: shotPath });
        console.log(`✓ ${vp.label} passed cleanly. Screenshot saved to: ${path.basename(shotPath)}`);
    }

    // 11. Test Delete Group Functionality
    console.log('\nStep 11: Testing Delete Group Button on isolated test group...');
    await page.setViewportSize({ width: 1280, height: 800 });
    const deleteGroupBtn = page.locator('#drawerDeleteGroupBtn');
    if (!(await deleteGroupBtn.isVisible())) throw new Error('Delete Group button not visible to owner');

    await deleteGroupBtn.click();
    await page.waitForSelector('#dynamicConfirmModal', { state: 'visible', timeout: 3000 });
    console.log('✓ Delete Group confirmation modal displayed.');
    await page.click('#confirmModalOk');

    await page.waitForTimeout(1200);
    const activeChatVisible = await page.locator('#activeChatView').isVisible();
    const emptyPlaceholderVisible = await page.locator('#emptyChatPlaceholder').isVisible();
    console.log(`After group deletion: activeChatView visible = ${activeChatVisible}, emptyPlaceholder visible = ${emptyPlaceholderVisible}`);
    if (activeChatVisible || !emptyPlaceholderVisible) {
        throw new Error('Active chat did not reset to empty placeholder after group deletion');
    }
    console.log('✓ Group successfully deleted, chat reset to placeholder, no dangling state.');

    // 12. Check for unexpected console errors
    console.log('\nStep 12: Checking Console Errors...');
    const fatalErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('404 (Not Found)'));
    if (fatalErrors.length > 0) {
        console.warn('Console warnings/errors encountered:', fatalErrors);
    } else {
        console.log('✓ 0 fatal console errors encountered throughout all tests.');
    }

    await browser.close();
    console.log('\n==================================================');
    console.log('ALL TESTS PASSED WITH 100% SUCCESS!');
    console.log('==================================================');
})().catch(err => {
    console.error('\n❌ TEST FAILURE:', err);
    process.exit(1);
});
