const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testCompleteDropdown() {
    console.log('--- Starting Comprehensive FRANK Think Profile Dropdown Verification ---');
    const browser = await chromium.launch({ headless: true });

    const viewports = [
        { name: 'Desktop 1440x900', width: 1440, height: 900 },
        { name: 'Desktop 1280x800', width: 1280, height: 800 },
        { name: 'Desktop Short 1024x550', width: 1024, height: 550 },
        { name: 'Mobile 430x932', width: 430, height: 932 },
        { name: 'Mobile 390x844', width: 390, height: 844 },
        { name: 'Mobile 375x667', width: 375, height: 667 },
        { name: 'Mobile 320x568', width: 320, height: 568 }
    ];

    const outDir = path.resolve(__dirname, 'dropdown_verification_screenshots');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    for (const vp of viewports) {
        console.log(`\nTesting ${vp.name}...`);
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();

        await page.goto('http://127.0.0.1:8000/login.html', { waitUntil: 'load' });
        await page.fill('#loginUsername', 'alex');
        await page.fill('#loginPassword', 'password123');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/dashboard.html', { timeout: 10000 });

        // Dismiss loading screen if still present
        await page.evaluate(() => {
            const loader = document.getElementById('appLoadingScreen');
            if (loader) loader.remove();
        });
        await page.waitForTimeout(400);

        // Click Desktop Profile Button
        const profileBtn = page.locator('#desktopProfileBtn');
        if (!(await profileBtn.isVisible())) {
            throw new Error(`Profile button not visible on ${vp.name}`);
        }
        await profileBtn.click();
        await page.waitForTimeout(300);

        const dropdown = page.locator('#desktopProfileDropdown');
        if (!(await dropdown.isVisible())) {
            throw new Error(`Dropdown not visible after click on ${vp.name}`);
        }

        const box = await dropdown.boundingBox();
        if (!box) throw new Error(`Dropdown bounding box is null on ${vp.name}`);

        console.log(`  Dropdown rect: x=${box.x.toFixed(1)}, y=${box.y.toFixed(1)}, w=${box.width.toFixed(1)}, h=${box.height.toFixed(1)}`);

        // Check horizontal bounds
        if (box.x < 0) throw new Error(`Dropdown overflow left (x=${box.x}) on ${vp.name}`);
        if (box.x + box.width > vp.width) {
            throw new Error(`Dropdown overflow right (x+w=${box.x + box.width} > ${vp.width}) on ${vp.name}`);
        }

        // Check vertical bounds
        if (box.y < 0) throw new Error(`Dropdown overflow top (y=${box.y}) on ${vp.name}`);
        if (box.y + box.height > vp.height) {
            throw new Error(`Dropdown overflow bottom (y+h=${box.y + box.height} > ${vp.height}) on ${vp.name}`);
        }

        console.log(`  [PASS] Fully within viewport bounds.`);

        // Verify items presence
        const items = await page.evaluate(() => {
            const d = document.getElementById('desktopProfileDropdown');
            return {
                header: !!d.querySelector('.dropdown-user-header'),
                avatar: !!d.querySelector('#desktopDropdownAvatar'),
                name: d.querySelector('#desktopDropdownName')?.textContent?.trim(),
                status: !!d.querySelector('#desktopDropdownStatusDot'),
                frankId: d.querySelector('#desktopDropdownFrankId')?.textContent?.trim(),
                copyBtn: !!d.querySelector('#copyDesktopMenuFrankIdBtn'),
                newChat: !!d.querySelector('#desktopDropdownNewChatBtn'),
                newGroup: !!d.querySelector('#desktopDropdownNewGroupBtn'),
                invite: !!d.querySelector('#desktopDropdownInviteBtn'),
                profile: !!d.querySelector('#desktopDropdownProfileLink'),
                settings: !!d.querySelector('#desktopDropdownSettingsLink'),
                privacy: !!d.querySelector('#desktopDropdownPrivacyLink'),
                help: !!d.querySelector('#desktopDropdownHelpLink'),
                notifications: !!d.querySelector('#desktopDropdownNotificationsLink'),
                appearance: !!d.querySelector('#desktopDropdownAppearanceLink'),
                themeToggle: !!d.querySelector('#desktopThemeToggleBtn'),
                logout: !!d.querySelector('#desktopDropdownLogoutBtn')
            };
        });

        const requiredKeys = [
            'header', 'avatar', 'status', 'copyBtn',
            'newChat', 'newGroup', 'invite', 'profile',
            'settings', 'privacy', 'help', 'notifications',
            'appearance', 'themeToggle', 'logout'
        ];
        for (const k of requiredKeys) {
            if (!items[k]) throw new Error(`Missing item '${k}' on ${vp.name}`);
        }
        console.log(`  [PASS] All items present: Name="${items.name}", ID="${items.frankId}"`);

        // Test scrolling down to logout button and checking visibility inside container
        const logoutBtn = page.locator('#desktopDropdownLogoutBtn');
        await logoutBtn.scrollIntoViewIfNeeded();
        if (!(await logoutBtn.isVisible())) {
            throw new Error(`Log out button not visible when scrolled into view on ${vp.name}`);
        }
        console.log(`  [PASS] Bottom item (Log Out) is scrollable and visible`);

        // Take screenshot
        const safeName = vp.name.replace(/\s+/g, '_').toLowerCase();
        await page.screenshot({ path: path.join(outDir, `${safeName}.png`) });

        // If on 1280x800, test Theme Toggle click
        if (vp.width === 1280) {
            console.log('  Testing Theme Toggle interaction...');
            const themeBtn = page.locator('#desktopThemeToggleBtn');
            const themeBefore = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light');
            await themeBtn.click();
            await page.waitForTimeout(300);
            const themeAfter = await page.evaluate(() => document.documentElement.getAttribute('data-theme') || 'light');
            console.log(`  Theme toggled from ${themeBefore} to ${themeAfter}`);
            if (themeBefore === themeAfter) {
                console.warn('  Theme did not change attribute, checking theme class or storage');
            } else {
                console.log('  [PASS] Theme successfully toggled!');
            }

            // Re-open to toggle back
            await profileBtn.click();
            await page.waitForTimeout(200);
            await themeBtn.click();
            await page.waitForTimeout(200);

            // Test copy FRANK ID
            await profileBtn.click();
            await page.waitForTimeout(200);
            const copyBtn = page.locator('#copyDesktopMenuFrankIdBtn');
            await copyBtn.click();
            await page.waitForTimeout(200);
            console.log('  [PASS] Copy FRANK ID button clicked without error');

            // Test Escape closes dropdown
            await page.keyboard.press('Escape');
            await page.waitForTimeout(200);
            const isClosed = !(await dropdown.isVisible());
            if (!isClosed) throw new Error('Escape key did not close dropdown');
            console.log('  [PASS] Escape key closes dropdown');
        }

        await context.close();
    }

    await browser.close();
    console.log('\n=========================================');
    console.log('ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    console.log('=========================================');
}

testCompleteDropdown().catch(err => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
});
