const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function testFrankIdCopyButton() {
    console.log('====================================================');
    console.log('STARTING PLAYWRIGHT E2E TEST: FRANK ID COPY BUTTON');
    console.log('====================================================');

    const browser = await chromium.launch({
        headless: true
    });

    // Create context with clipboard permissions
    const context = await browser.newContext({
        permissions: ['clipboard-read', 'clipboard-write'],
        viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    page.on('console', msg => {
        if (msg.type() === 'error') {
            console.log('[BROWSER ERR]', msg.text());
        }
    });

    try {
        const uniqueSuffix = Date.now().toString(36);
        const regUser = `CopyUser_${uniqueSuffix}`;
        const regEmail = `CopyUser_${uniqueSuffix}@frankchat.test`;
        const regPass = 'Pass@Copy123!';

        // Step 1: Register test user
        console.log(`\n[STEP 1] Registering user: ${regUser}...`);
        await page.goto('http://127.0.0.1:8000/register.html');
        await page.waitForSelector('#regUsername', { timeout: 10000 });
        await page.fill('#regFullName', 'Copy Test User');
        await page.fill('#regUsername', regUser);
        await page.fill('#regEmail', regEmail);
        await page.fill('#regPassword', regPass);
        await page.fill('#regConfirmPassword', regPass);
        await page.check('#regTerms');
        await page.click('#registerSubmitBtn');

        await page.waitForURL('**/dashboard.html', { timeout: 10000 });
        console.log('  -> Registered and on dashboard');

        // Dismiss loading screen & welcome modal
        await page.evaluate(() => {
            const loader = document.getElementById('appLoadingScreen');
            if (loader) loader.remove();
            const modal = document.getElementById('welcomeOnboardingModal');
            if (modal) modal.classList.remove('active');
            localStorage.setItem('frank_onboarded', 'true');
        });

        // Retrieve user FRANK ID
        const frankId = await page.evaluate(() => {
            const u = (window.auth && window.auth.getUser()) || {};
            return u.frank_id;
        });
        console.log(`  -> Active user FRANK ID: ${frankId}`);
        if (!frankId || !/^[A-Z0-9]{6}$/.test(frankId)) {
            throw new Error(`Expected 6-char alphanumeric FRANK ID, got: '${frankId}'`);
        }
        console.log('  [PASS] FRANK ID matches regex ^[A-Z0-9]{6}$');

        // Step 2: Validate Sidebar Profile Card Copy Button
        console.log('\n[STEP 2] Testing Sidebar Profile Card Copy Button...');
        const sidebarCopyBtn = page.locator('#copySidebarFrankIdBtn');
        await sidebarCopyBtn.waitFor({ state: 'visible', timeout: 5000 });

        // Verify aria-label and title
        const ariaLabel = await sidebarCopyBtn.getAttribute('aria-label');
        if (ariaLabel !== 'Copy FRANK ID') {
            throw new Error(`Expected aria-label="Copy FRANK ID", got: "${ariaLabel}"`);
        }
        console.log('  [PASS] aria-label="Copy FRANK ID"');

        // Verify SVG outline icon (no emojis)
        const hasCopySvg = await sidebarCopyBtn.locator('svg.copy-icon').count();
        const hasCheckSvg = await sidebarCopyBtn.locator('svg.check-icon').count();
        if (hasCopySvg !== 1 || hasCheckSvg !== 1) {
            throw new Error('Expected 1 copy-icon and 1 check-icon SVG inside #copySidebarFrankIdBtn');
        }
        console.log('  [PASS] SVG outline icon present');

        // Clear clipboard first
        await page.evaluate(() => navigator.clipboard.writeText(''));

        // Click sidebar copy button
        await sidebarCopyBtn.click();
        await page.waitForTimeout(150);

        // Read clipboard
        const copiedClipboard = await page.evaluate(() => navigator.clipboard.readText());
        console.log(`  -> Clipboard content after click: "${copiedClipboard}"`);
        if (copiedClipboard !== frankId) {
            throw new Error(`Clipboard expected exact FRANK ID "${frankId}", but got: "${copiedClipboard}"`);
        }
        console.log('  [PASS] Clipboard contains ONLY the exact 6-character FRANK ID');

        // Verify temporary visual feedback (checkmark visible, copied class added)
        const isCopiedClass = await sidebarCopyBtn.evaluate(el => el.classList.contains('copied'));
        const checkIconDisplay = await page.evaluate(() => {
            const btn = document.getElementById('copySidebarFrankIdBtn');
            const check = btn.querySelector('.check-icon');
            return check ? window.getComputedStyle(check).display : 'none';
        });
        if (!isCopiedClass || checkIconDisplay === 'none') {
            throw new Error('Expected button to have .copied class and visible check-icon');
        }
        console.log('  [PASS] Visual feedback active (.copied class + check-icon visible)');

        // Verify toast notification
        const toastText = await page.locator('.toast').first().textContent({ timeout: 2000 });
        console.log(`  -> Toast notification: "${toastText.trim()}"`);
        if (!toastText.includes('FRANK ID copied')) {
            throw new Error(`Expected toast "FRANK ID copied", got: "${toastText}"`);
        }
        console.log('  [PASS] Toast notification "FRANK ID copied" verified');

        // Wait for visual feedback reset
        console.log('  -> Waiting 1.9s for feedback reset...');
        await page.waitForTimeout(1900);
        const isCopiedAfter = await sidebarCopyBtn.evaluate(el => el.classList.contains('copied'));
        if (isCopiedAfter) {
            throw new Error('Button still has .copied class after 1.8s timeout');
        }
        console.log('  [PASS] Visual feedback successfully reset after timeout');

        // Step 3: Validate Dropdown Menu Copy Button & Event Propagation
        console.log('\n[STEP 3] Testing User Menu Dropdown Header & Copy Button...');
        const userCard = page.locator('#sidebarUserCard');
        await userCard.click();
        await page.waitForTimeout(200);

        const dropdownMenu = page.locator('#sidebarUserMenu');
        const isMenuOpen = await dropdownMenu.evaluate(el => el.classList.contains('show'));
        if (!isMenuOpen) {
            throw new Error('Dropdown menu #sidebarUserMenu did not open on clicking user card');
        }
        console.log('  [PASS] Dropdown menu opened successfully');

        // Verify menu header displays FRANK ID
        const menuFid = await page.locator('#menuUserFrankId').textContent();
        if (menuFid.trim() !== frankId) {
            throw new Error(`Expected menu FRANK ID "${frankId}", got: "${menuFid.trim()}"`);
        }
        console.log(`  [PASS] Dropdown header shows FRANK ID: ${menuFid.trim()}`);

        // Click copy button inside dropdown
        const menuCopyBtn = page.locator('#copyMenuFrankIdBtn');
        await page.evaluate(() => navigator.clipboard.writeText(''));
        await menuCopyBtn.click();
        await page.waitForTimeout(150);

        // Verify dropdown DID NOT close on clicking copy (e.stopPropagation())
        const isMenuStillOpen = await dropdownMenu.evaluate(el => el.classList.contains('show'));
        if (!isMenuStillOpen) {
            throw new Error('Dropdown menu closed when clicking copy button! (e.stopPropagation failed)');
        }
        console.log('  [PASS] Dropdown menu remained open on copy click (stopPropagation verified)');

        // Verify clipboard from menu copy
        const menuClipboard = await page.evaluate(() => navigator.clipboard.readText());
        if (menuClipboard !== frankId) {
            throw new Error(`Expected clipboard "${frankId}", got: "${menuClipboard}"`);
        }
        console.log('  [PASS] Dropdown copy copied exact FRANK ID to clipboard');

        // Capture screenshot of open dropdown with copy button
        const dropdownScreenshotPath = path.join(__dirname, 'dropdown_frank_id_verified.png');
        await page.screenshot({ path: dropdownScreenshotPath });
        console.log(`  [PASS] Screenshot saved: ${dropdownScreenshotPath}`);

        // Step 4: Keyboard Accessibility
        console.log('\n[STEP 4] Testing Keyboard Accessibility (Enter / Space)...');
        await page.evaluate(() => navigator.clipboard.writeText(''));
        await sidebarCopyBtn.focus();
        await page.keyboard.press('Enter');
        await page.waitForTimeout(150);

        const keyClipboard = await page.evaluate(() => navigator.clipboard.readText());
        if (keyClipboard !== frankId) {
            throw new Error(`Keyboard Enter failed to copy FRANK ID. Got: "${keyClipboard}"`);
        }
        console.log('  [PASS] Keyboard Enter activated copy successfully');

        // Step 5: Profile Page Copy Button
        console.log('\n[STEP 5] Testing Profile Page Copy Button...');
        await page.goto('http://127.0.0.1:8000/profile.html');
        await page.waitForSelector('#profileFrankId', { timeout: 8000 });

        const profileFid = await page.locator('#profileFrankId').textContent();
        console.log(`  -> Profile page FRANK ID: ${profileFid.trim()}`);
        if (profileFid.trim() !== frankId) {
            throw new Error(`Profile FRANK ID "${profileFid}" does not match registered ID "${frankId}"`);
        }

        const profileCopyBtn = page.locator('#copyFrankIdBtn');
        await profileCopyBtn.waitFor({ state: 'visible' });

        await page.evaluate(() => navigator.clipboard.writeText(''));
        await profileCopyBtn.click();
        await page.waitForTimeout(150);

        const profileClipboard = await page.evaluate(() => navigator.clipboard.readText());
        if (profileClipboard !== frankId) {
            throw new Error(`Profile copy failed. Expected "${frankId}", got: "${profileClipboard}"`);
        }
        console.log('  [PASS] Profile page copy copied exact FRANK ID');

        // Step 6: Mobile Viewport Responsiveness
        console.log('\n[STEP 6] Testing Mobile Viewports (375px, 390px, 414px)...');
        const viewports = [
            { width: 375, height: 667, name: 'iPhone SE (375px)' },
            { width: 390, height: 844, name: 'iPhone 13/14 (390px)' },
            { width: 414, height: 896, name: 'iPhone XR (414px)' }
        ];

        for (const vp of viewports) {
            console.log(`  -> Testing ${vp.name}...`);
            await page.setViewportSize({ width: vp.width, height: vp.height });
            await page.goto('http://127.0.0.1:8000/dashboard.html');
            await page.waitForSelector('#openSidebarBtn', { state: 'visible', timeout: 5000 });

            // Check no horizontal document overflow
            const overflow = await page.evaluate(() => {
                return document.documentElement.scrollWidth > window.innerWidth;
            });
            if (overflow) {
                throw new Error(`Horizontal overflow detected at viewport ${vp.name}!`);
            }

            // Open mobile drawer
            await page.click('#openSidebarBtn');
            await page.waitForSelector('#sidebar.open', { state: 'visible', timeout: 3000 });

            // Verify touch target or button existence
            const sidebarBtn = page.locator('#copySidebarFrankIdBtn');
            await sidebarBtn.waitFor({ state: 'visible', timeout: 3000 });

            // Test copy click on mobile
            await page.evaluate(() => navigator.clipboard.writeText(''));
            await sidebarBtn.click();
            await page.waitForTimeout(150);
            const mobileClipboard = await page.evaluate(() => navigator.clipboard.readText());
            if (mobileClipboard !== frankId) {
                throw new Error(`Mobile copy failed at ${vp.name}. Expected "${frankId}", got: "${mobileClipboard}"`);
            }
            console.log(`  [PASS] ${vp.name} verified: No overflow and copy successful`);
        }

        console.log('\n====================================================');
        console.log('ALL E2E COPY FRANK ID TESTS PASSED PERFECTLY!');
        console.log('====================================================');

    } catch (err) {
        console.error('\n[TEST FAILED]', err);
        const errScreenshot = path.join(__dirname, 'copy_frank_id_err.png');
        await page.screenshot({ path: errScreenshot, fullPage: true }).catch(() => {});
        console.log(`Saved failure screenshot: ${errScreenshot}`);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

testFrankIdCopyButton();
