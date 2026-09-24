const { chromium } = require('playwright');
const assert = require('assert');

async function runMobileTestSuite() {
    console.log('====================================================');
    console.log('STARTING PLAYWRIGHT MOBILE-FIRST UI VALIDATION SUITE');
    console.log('====================================================');

    const browser = await chromium.launch({
        headless: true
    });

    const viewports = [
        { width: 320, height: 800, name: '320px (Compact Mobile)' },
        { width: 360, height: 800, name: '360px (Standard Android)' },
        { width: 375, height: 812, name: '375px (iPhone SE/mini)' },
        { width: 390, height: 844, name: '390px (iPhone 12/13/14)' },
        { width: 414, height: 896, name: '414px (iPhone XR/Plus)' },
        { width: 430, height: 932, name: '430px (iPhone 14/15 Pro Max)' },
        { width: 480, height: 854, name: '480px (Large Android)' }
    ];

    let passedTests = 0;
    let failedTests = 0;

    function recordPass(testName) {
        passedTests++;
        console.log(`  ✓ PASS: ${testName}`);
    }

    function recordFail(testName, err) {
        failedTests++;
        console.error(`  ✗ FAIL: ${testName} - ${err.message || err}`);
    }

    // First: Register a user and prepare conversations
    const context = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
        viewport: { width: 390, height: 844 }
    });
    const page = await context.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('[BROWSER ERR]', msg.text());
        }
    });

    const uniqueId = Date.now().toString(36);
    const username = `mobile_tester_${uniqueId}`;
    const email = `mobile_${uniqueId}@frank.test`;
    const password = 'Pass@Mobile123!';

    console.log(`\n[SETUP] Registering test user: ${email}...`);
    await page.goto('http://127.0.0.1:8000/register.html');
    await page.waitForSelector('#regFullName', { timeout: 8000 });
    await page.fill('#regFullName', 'Mobile Test User');
    await page.fill('#regEmail', email);
    await page.fill('#regPassword', password);
    await page.fill('#regConfirmPassword', password);
    await page.check('#regTerms');
    await page.click('#registerSubmitBtn');

    await page.waitForURL('**/dashboard.html', { timeout: 10000 });
    console.log('  -> Registered & reached dashboard');

    // Dismiss onboarding / loaders
    await page.evaluate(() => {
        const loader = document.getElementById('appLoadingScreen');
        if (loader) loader.remove();
        const modal = document.getElementById('welcomeOnboardingModal');
        if (modal) modal.classList.remove('active');
        localStorage.setItem('frank_onboarded', 'true');
    });

    // Wait for conversations to load
    await page.waitForSelector('.conversation-card', { timeout: 10000 });
    console.log('  -> Conversations loaded on dashboard');

    // ----------------------------------------------------
    // TEST SUITE 1: SCREEN 1 - CHAT LIST
    // ----------------------------------------------------
    console.log('\n--- 1. MOBILE CHAT LIST TESTS ---');

    try {
        // A. Header Branding & Menu Button
        const brandVisible = await page.locator('.mobile-header-brand').isVisible();
        const brandTitle = await page.locator('.mobile-brand-title').innerText();
        const menuBtnVisible = await page.locator('#openSidebarBtn').isVisible();
        assert(brandVisible, 'Mobile brand container must be visible');
        assert.strictEqual(brandTitle.trim(), 'FRANK', 'Mobile brand title must be FRANK');
        assert(menuBtnVisible, 'Mobile menu button (⋮) must be visible');
        recordPass('Screen 1 Header with FRANK brand logo + title and menu button (⋮)');
    } catch (e) {
        recordFail('Screen 1 Header with FRANK brand logo + title and menu button (⋮)', e);
    }

    try {
        // B. Desktop elements are hidden
        const desktopTitleHidden = await page.locator('.desktop-header-title').isHidden();
        const desktopNewChatHidden = await page.locator('.desktop-new-chat-btn').isHidden();
        const desktopFiltersHidden = await page.locator('.desktop-filters').isHidden();
        assert(desktopTitleHidden && desktopNewChatHidden && desktopFiltersHidden, 'Desktop elements must be hidden on mobile');
        recordPass('Desktop elements hidden on mobile chat list');
    } catch (e) {
        recordFail('Desktop elements hidden on mobile chat list', e);
    }

    try {
        // C. Category Tabs (Chats, Groups, Contacts)
        const tabChats = page.locator('#tabBtnChats');
        const tabGroups = page.locator('#tabBtnGroups');
        const tabContacts = page.locator('#tabBtnContacts');

        const tabsVisible = await tabChats.isVisible() && await tabGroups.isVisible() && await tabContacts.isVisible();
        assert(tabsVisible, 'All 3 category tabs must be visible');

        // Check touch target size >= 44px
        const boxChats = await tabChats.boundingBox();
        assert(boxChats.height >= 44, `Tab height must be >= 44px, got ${boxChats.height}px`);
        recordPass('Category tabs visible with >= 44px touch targets');

        // Test tab switching
        await tabGroups.click();
        await page.waitForTimeout(300);
        const groupsActive = await tabGroups.evaluate(el => el.classList.contains('active'));
        const groupsPlaceholder = await page.locator('#conversationSearchInput').getAttribute('placeholder');
        assert(groupsActive, 'Groups tab must be active');
        assert.strictEqual(groupsPlaceholder, 'Search groups...', 'Placeholder must change for groups');
        recordPass('Groups tab activation & contextual placeholder');

        await tabContacts.click();
        await page.waitForTimeout(400);
        const contactsActive = await tabContacts.evaluate(el => el.classList.contains('active'));
        const contactsPlaceholder = await page.locator('#conversationSearchInput').getAttribute('placeholder');
        assert(contactsActive, 'Contacts tab must be active');
        assert.strictEqual(contactsPlaceholder, 'Search contacts...', 'Placeholder must change for contacts');
        recordPass('Contacts tab activation & contextual placeholder');

        // Return to Chats tab
        await tabChats.click();
        await page.waitForTimeout(300);
        const chatsActive = await tabChats.evaluate(el => el.classList.contains('active'));
        assert(chatsActive, 'Chats tab must be active again');
        recordPass('Return to Chats tab');
    } catch (e) {
        recordFail('Category Tabs switching & touch standards', e);
    }

    try {
        // D. Search bar live filtering & clear button
        const searchInput = page.locator('#conversationSearchInput');
        const clearBtn = page.locator('#clearSearchBtn');

        await searchInput.fill('NonExistentContactXYZ999');
        await page.waitForTimeout(200);

        const clearVisible = await clearBtn.isVisible();
        assert(clearVisible, 'Clear button (✕) must appear when typing in search');

        const emptyVisible = await page.locator('#conversationList .empty-state').isVisible();
        assert(emptyVisible, 'Empty state must show when search has no matches');

        await clearBtn.click();
        await page.waitForTimeout(200);

        const clearedVal = await searchInput.inputValue();
        assert.strictEqual(clearedVal, '', 'Search input should be cleared');
        const cardsCount = await page.locator('.conversation-card').count();
        assert(cardsCount > 0, 'Conversation cards restored after clearing search');
        recordPass('Full-width search input with live filtering & clear button');
    } catch (e) {
        // Guarantee search input is cleared even if an assertion failed
        await page.evaluate(() => {
            const input = document.getElementById('conversationSearchInput');
            if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
        recordFail('Search input with live filtering & clear button', e);
    }

    try {
        // E. Mobile Bottom Navigation
        const bottomNav = page.locator('#mobileBottomNav');
        const navVisible = await bottomNav.isVisible();
        assert(navVisible, 'Bottom navigation must be visible on Screen 1');

        const chatsItem = page.locator('#bottomNavChats');
        const groupsItem = page.locator('#bottomNavGroups');
        const contactsItem = page.locator('#bottomNavContacts');
        const favsItem = page.locator('#bottomNavFavorites');
        const settingsItem = page.locator('#bottomNavSettings');

        const allItemsPresent = await chatsItem.isVisible() && await groupsItem.isVisible() &&
            await contactsItem.isVisible() && await favsItem.isVisible() && await settingsItem.isVisible();
        assert(allItemsPresent, 'All 5 bottom navigation items must be present');

        // Test bottom nav interaction
        await groupsItem.click();
        await page.waitForTimeout(200);
        const groupNavActive = await groupsItem.evaluate(el => el.classList.contains('active'));
        const groupTabActive = await page.locator('#tabBtnGroups').evaluate(el => el.classList.contains('active'));
        assert(groupNavActive && groupTabActive, 'Bottom nav Groups click must synchronize tab & view');

        await chatsItem.click();
        await page.waitForTimeout(200);
        recordPass('Mobile Bottom Navigation bar with 5 synchronized items');
    } catch (e) {
        recordFail('Mobile Bottom Navigation bar', e);
    }

    // ----------------------------------------------------
    // TEST SUITE 2: SCREEN 2 - MOBILE ACTIVE CONVERSATION
    // ----------------------------------------------------
    console.log('\n--- 2. MOBILE ACTIVE CONVERSATION TESTS ---');

    try {
        // A. Tap conversation card -> Full-screen takeover
        const firstCard = page.locator('.conversation-card').first();
        await firstCard.click();
        await page.waitForTimeout(400);

        const chatWindowOpen = await page.locator('#chatWindow').evaluate(el => el.classList.contains('mobile-open'));
        const convPanelHidden = await page.locator('#conversationPanel').evaluate(el => {
            return window.getComputedStyle(el).display === 'none';
        });
        const bottomNavHidden = await page.locator('#mobileBottomNav').evaluate(el => {
            return window.getComputedStyle(el).display === 'none';
        });

        assert(chatWindowOpen, 'Chat window must have mobile-open class');
        assert(convPanelHidden, 'Conversation panel must be hidden during active chat');
        assert(bottomNavHidden, 'Bottom navigation must be hidden during active chat');
        recordPass('Conversation card tap triggers full-screen chat takeover');

        // B. Active Chat Header & Back button
        const backBtn = page.locator('#mobileBackBtn');
        const backVisible = await backBtn.isVisible();
        const partnerName = await page.locator('#chatPartnerName').innerText();
        assert(backVisible, 'Back button (←) must be visible in active chat header');
        assert(partnerName.length > 0, 'Partner name must be displayed');
        recordPass('Active chat header with ← Back button and partner info');

        // C. Sticky Composer & Dynamic Action Button (Mic vs Send)
        const sendBtn = page.locator('#composerSendBtn');
        const composerInput = page.locator('#messageComposerTextarea');

        // Empty state -> Microphone mode
        await composerInput.fill('');
        await page.waitForTimeout(100);
        let isMic = await sendBtn.evaluate(el => el.classList.contains('mode-mic'));
        assert(isMic, 'Composer button must be in microphone mode when input is empty');
        recordPass('Dynamic action button displays microphone icon (🎤) when empty');

        // Type text -> Send mode
        await composerInput.fill('Hello from Playwright mobile test! 👋');
        await page.waitForTimeout(100);
        let isSend = await sendBtn.evaluate(el => el.classList.contains('mode-send'));
        assert(isSend, 'Composer button must switch to send mode when text is typed');
        recordPass('Dynamic action button switches to send arrow (➤) when text entered');

        // Send message
        await sendBtn.click();
        await page.waitForTimeout(600);

        // After send, input is cleared and button returns to mic mode
        isMic = await sendBtn.evaluate(el => el.classList.contains('mode-mic'));
        assert(isMic, 'Composer button returns to microphone mode after message is sent');
        recordPass('Composer sends message and resets to microphone mode');

        // Check message stream contains the sent message bubble
        const lastBubble = page.locator('.message-row.sent').last();
        const bubbleText = await lastBubble.innerText();
        assert(bubbleText.includes('Hello from Playwright mobile test'), 'Sent message bubble must be in message stream');
        recordPass('Outgoing message bubble rendered in message stream');

        // D. Tap Back button -> Return to Chat List without reload
        await backBtn.click();
        await page.waitForTimeout(300);

        const panelVisibleAgain = await page.locator('#conversationPanel').evaluate(el => {
            return window.getComputedStyle(el).display !== 'none';
        });
        const bottomNavVisibleAgain = await page.locator('#mobileBottomNav').evaluate(el => {
            return window.getComputedStyle(el).display !== 'none';
        });
        const chatWindowClosed = await page.locator('#chatWindow').evaluate(el => {
            return window.getComputedStyle(el).display === 'none';
        });

        assert(panelVisibleAgain, 'Conversation list restored on Back button tap');
        assert(bottomNavVisibleAgain, 'Bottom navigation restored on Back button tap');
        assert(chatWindowClosed, 'Chat window hidden after Back button tap');
        recordPass('← Back button smoothly returns to Screen 1 Chat List without reload');
    } catch (e) {
        recordFail('Active conversation view & lifecycle', e);
    }

    // ----------------------------------------------------
    // TEST SUITE 3: SCREEN 3 - MOBILE SIDEBAR DRAWER
    // ----------------------------------------------------
    console.log('\n--- 3. MOBILE SIDEBAR DRAWER TESTS ---');

    try {
        // A. Tap Menu Button (⋮) -> Drawer slides in from left with overlay
        const openBtn = page.locator('#openSidebarBtn');
        await openBtn.click();
        await page.waitForTimeout(350);

        const sidebarOpen = await page.locator('#sidebar').evaluate(el => el.classList.contains('open'));
        const overlayShow = await page.locator('#mobileOverlay').evaluate(el => el.classList.contains('show'));
        assert(sidebarOpen, 'Sidebar drawer must have open class');
        assert(overlayShow, 'Mobile overlay backdrop must have show class');

        // Check drawer width is min(320px, 85vw)
        const sidebarBox = await page.locator('#sidebar').boundingBox();
        assert(sidebarBox.width <= 325, `Sidebar width should be <= 320px, got ${sidebarBox.width}px`);
        recordPass('Menu button (⋮) opens drawer with backdrop overlay');

        // B. Permanent 6-character FRANK ID & Copy button
        const frankIdText = await page.locator('#sidebarUserFrankId').innerText();
        const cleanFrankId = frankIdText.trim();
        assert.strictEqual(cleanFrankId.length, 6, `FRANK ID must be 6 characters, got "${cleanFrankId}"`);
        assert(/^[A-Z0-9]{6}$/.test(cleanFrankId), `FRANK ID must be 6 alphanumeric uppercase chars, got "${cleanFrankId}"`);

        // Click copy button
        const copyBtn = page.locator('#copySidebarFrankIdBtn');
        await copyBtn.click();
        await page.waitForTimeout(400);

        // Verify toast message "✓ FRANK ID copied"
        const toast = page.locator('.toast.toast-success').last();
        const toastText = await toast.innerText();
        assert(toastText.includes('FRANK ID copied'), `Toast should confirm copy, got "${toastText}"`);
        recordPass('Sidebar displays permanent 6-character FRANK ID and copy button shows toast');

        // C. Menu navigation items present
        const expectedItems = ['Profile', 'Chats', 'Groups', 'Contacts', 'Favorites', 'Archive', 'Settings', 'Privacy', 'Help & Support', 'Sign Out'];
        for (const item of expectedItems) {
            const hasItem = await page.evaluate(title => {
                const els = Array.from(document.querySelectorAll('#sidebar .nav-item, #sidebar .dropdown-item, #sidebar button, #sidebar a'));
                return els.some(el => el.innerText.toLowerCase().includes(title.toLowerCase()));
            }, item);
            assert(hasItem, `Sidebar must contain navigation item: ${item}`);
        }
        recordPass('All 10 required menu items present in drawer');

        // D. Tap backdrop overlay -> Drawer closes
        const overlay = page.locator('#mobileOverlay');
        await overlay.click({ position: { x: 350, y: 100 } });
        await page.waitForTimeout(300);

        const sidebarClosed = await page.locator('#sidebar').evaluate(el => !el.classList.contains('open'));
        assert(sidebarClosed, 'Drawer should close when backdrop overlay is tapped');
        recordPass('Tapping backdrop overlay closes drawer smoothly');

        // Reopen and test Escape key closes drawer
        await openBtn.click();
        await page.waitForTimeout(300);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);
        const closedByEsc = await page.locator('#sidebar').evaluate(el => !el.classList.contains('open'));
        assert(closedByEsc, 'Drawer should close on Escape key');
        recordPass('Pressing Escape key closes drawer');
    } catch (e) {
        recordFail('Mobile sidebar drawer behavior', e);
    }

    // ----------------------------------------------------
    // TEST SUITE 4: MULTI-VIEWPORT RESPONSIVENESS & ZERO OVERFLOW
    // ----------------------------------------------------
    console.log('\n--- 4. MULTI-VIEWPORT AUDIT (320px - 480px) ---');

    for (const vp of viewports) {
        try {
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.waitForTimeout(200);

            // Check horizontal overflow
            const overflow = await page.evaluate(() => {
                return {
                    scrollWidth: document.documentElement.scrollWidth,
                    clientWidth: document.documentElement.clientWidth,
                    hasOverflow: document.documentElement.scrollWidth > window.innerWidth + 1
                };
            });

            assert(!overflow.hasOverflow, `Overflow detected on ${vp.name}: scrollWidth=${overflow.scrollWidth}, clientWidth=${overflow.clientWidth}`);

            // Check header brand and search bar are within viewport
            const headerBox = await page.locator('.conversation-header').boundingBox();
            assert(headerBox.width <= vp.width + 1, `Header width ${headerBox.width} exceeds viewport ${vp.width}`);

            // Check tabs fit within width
            const tabsBox = await page.locator('#mobileTabsContainer').boundingBox();
            assert(tabsBox.width <= vp.width + 1, `Tabs width ${tabsBox.width} exceeds viewport ${vp.width}`);

            // Check bottom nav fits within width
            const navBox = await page.locator('#mobileBottomNav').boundingBox();
            assert(navBox.width <= vp.width + 1, `Bottom nav width ${navBox.width} exceeds viewport ${vp.width}`);

            recordPass(`Viewport ${vp.name} (${vp.width}x${vp.height}): Zero overflow & responsive alignment`);
        } catch (e) {
            recordFail(`Viewport ${vp.name} validation`, e);
        }
    }

    await browser.close();

    console.log('\n====================================================');
    console.log(`TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('====================================================');

    if (failedTests > 0) {
        process.exit(1);
    }
}

runMobileTestSuite().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});
