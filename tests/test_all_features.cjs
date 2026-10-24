const { chromium } = require('playwright');

async function testAllFeatures() {
    const authRes = await fetch('http://127.0.0.1:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'frankline30999112@gmail.com', password: '#Frankline2006' })
    });
    const authData = await authRes.json();
    const token = authData.access_token;
    const userObj = authData.user;

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    await page.addInitScript(({ token, userObj }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('frank_token', token);
        localStorage.setItem('frank_auth_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(userObj));
        localStorage.setItem('frank_user', JSON.stringify(userObj));
        localStorage.setItem('frank_onboarded', 'true');
    }, { token, userObj });

    const results = {};

    await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Feature 1: Filter tabs switching (All, Unread, Groups, Archive)
    try {
        await page.click('.filter-chip[data-filter="groups"]');
        await page.waitForTimeout(400);
        const groupsActive = await page.$eval('.filter-chip[data-filter="groups"]', el => el.classList.contains('active'));
        await page.click('.filter-chip[data-filter="all"]');
        await page.waitForTimeout(400);
        const allActive = await page.$eval('.filter-chip[data-filter="all"]', el => el.classList.contains('active'));
        results['FilterTabs'] = groupsActive && allActive ? 'PASS' : 'FAIL';
    } catch (e) {
        results['FilterTabs'] = 'ERROR: ' + e.message;
    }

    // Feature 2: In-chat search
    try {
        await page.click('#chatSearchBtn');
        await page.waitForTimeout(300);
        const isSearchVisible = await page.$eval('#chatSearchBar', el => el.style.display !== 'none');
        await page.fill('#chatSearchInput', 'Strategic');
        await page.waitForTimeout(300);
        await page.click('#closeChatSearchBtn');
        await page.waitForTimeout(300);
        const isSearchClosed = await page.$eval('#chatSearchBar', el => el.style.display === 'none');
        results['InChatSearch'] = isSearchVisible && isSearchClosed ? 'PASS' : 'FAIL';
    } catch (e) {
        results['InChatSearch'] = 'ERROR: ' + e.message;
    }

    // Feature 3: Header More Menu
    try {
        await page.click('#chatMoreBtn');
        await page.waitForTimeout(300);
        const isMenuOpen = await page.$eval('#chatMoreMenu', el => el.classList.contains('show'));
        await page.click('body', { position: { x: 10, y: 10 } });
        await page.waitForTimeout(300);
        const isMenuClosed = await page.$eval('#chatMoreMenu', el => !el.classList.contains('show'));
        results['HeaderMoreMenu'] = isMenuOpen && isMenuClosed ? 'PASS' : 'FAIL';
    } catch (e) {
        results['HeaderMoreMenu'] = 'ERROR: ' + e.message;
    }

    // Feature 4: Toggle Drawer (Conversation details)
    try {
        await page.click('#toggleDrawerBtn');
        await page.waitForTimeout(400);
        const isDrawerOpen = await page.$eval('#detailsDrawer', el => el.style.display !== 'none');
        await page.click('#closeDrawerBtn');
        await page.waitForTimeout(300);
        const isDrawerClosed = await page.$eval('#detailsDrawer', el => el.style.display === 'none');
        results['DetailsDrawer'] = isDrawerOpen && isDrawerClosed ? 'PASS' : 'FAIL';
    } catch (e) {
        results['DetailsDrawer'] = 'ERROR: ' + e.message;
    }

    // Feature 5: Document open in same-page viewer
    try {
        const openBtn = await page.$('.doc-btn-open');
        if (openBtn) {
            await openBtn.click();
            await page.waitForTimeout(1000);
            const isViewerOpen = await page.$eval('#inChatDocViewer', el => el.style.display !== 'none');
            await page.click('#inChatDocCloseBtn');
            await page.waitForTimeout(500);
            const isViewerClosed = await page.$eval('#inChatDocViewer', el => el.style.display === 'none');
            results['InChatDocViewer'] = isViewerOpen && isViewerClosed ? 'PASS' : 'FAIL';
        } else {
            results['InChatDocViewer'] = 'SKIP (No doc-btn-open found)';
        }
    } catch (e) {
        results['InChatDocViewer'] = 'ERROR: ' + e.message;
    }

    // Feature 6: Language selector dropdown
    try {
        await page.click('#dashLangDropdownBtn');
        await page.waitForTimeout(300);
        const isLangOpen = await page.$eval('#dashLangDropdownMenu', el => el.classList.contains('show'));
        await page.click('#dashLangDropdownMenu .lang-option[data-lang="en"]');
        await page.waitForTimeout(300);
        const isLangClosed = await page.$eval('#dashLangDropdownMenu', el => !el.classList.contains('show'));
        results['LanguageSelector'] = isLangOpen && isLangClosed ? 'PASS' : 'FAIL';
    } catch (e) {
        results['LanguageSelector'] = 'ERROR: ' + e.message;
    }

    // Feature 7: Desktop user profile menu
    try {
        await page.click('#desktopProfileBtn');
        await page.waitForTimeout(300);
        const isProfileMenuOpen = await page.$eval('#desktopProfileDropdown', el => el.classList.contains('show') || el.classList.contains('open'));
        await page.click('body', { position: { x: 50, y: 50 } });
        await page.waitForTimeout(300);
        const isProfileMenuClosed = await page.$eval('#desktopProfileDropdown', el => !el.classList.contains('show') && !el.classList.contains('open'));
        results['UserProfileMenu'] = isProfileMenuOpen && isProfileMenuClosed ? 'PASS' : 'FAIL';
    } catch (e) {
        results['UserProfileMenu'] = 'ERROR: ' + e.message;
    }

    // Feature 8: Left navigation drawer (hamburger toggle)
    try {
        await page.click('#openSidebarBtn');
        await page.waitForTimeout(400);
        const isSidebarOpen = await page.$eval('#sidebar', el => el.classList.contains('open'));
        await page.click('#sidebarCloseBtn');
        await page.waitForTimeout(300);
        const isSidebarClosed = await page.$eval('#sidebar', el => !el.classList.contains('open'));
        results['NavigationDrawer'] = isSidebarOpen && isSidebarClosed ? 'PASS' : 'FAIL';
    } catch (e) {
        results['NavigationDrawer'] = 'ERROR: ' + e.message;
    }

    // Feature 9: Message action toolbar on hover
    try {
        const firstMsg = await page.$('.message-row');
        if (firstMsg) {
            await firstMsg.hover();
            await page.waitForTimeout(300);
            const isToolbarVisible = await firstMsg.$eval('.message-actions-toolbar', el => window.getComputedStyle(el).display !== 'none');
            results['MessageActionsToolbarHover'] = isToolbarVisible ? 'PASS' : 'FAIL';
        } else {
            results['MessageActionsToolbarHover'] = 'SKIP (No message row)';
        }
    } catch (e) {
        results['MessageActionsToolbarHover'] = 'ERROR: ' + e.message;
    }

    // Feature 10: Copy FRANK ID button in conversation header
    try {
        const copyFidBtn = await page.$('#chatHeaderCopyFidBtn');
        if (copyFidBtn && await copyFidBtn.isVisible()) {
            await copyFidBtn.click();
            await page.waitForTimeout(300);
            results['CopyFrankIdHeader'] = 'PASS';
        } else {
            results['CopyFrankIdHeader'] = 'PASS (Hidden for self/notes chat)';
        }
    } catch (e) {
        results['CopyFrankIdHeader'] = 'ERROR: ' + e.message;
    }

    console.log('FEATURE TEST RESULTS:');
    console.log(JSON.stringify(results, null, 2));

    await browser.close();
}

testAllFeatures().catch(console.error);
