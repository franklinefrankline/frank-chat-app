const { chromium } = require('playwright');
const path = require('path');

async function renderScreenshots() {
    const browser = await chromium.launch({ headless: true });
    
    const rootDir = path.resolve(__dirname, '..');
    const fpUrl = 'file://' + path.join(rootDir, 'forgot-password.html').replace(/\\/g, '/');
    const otpUrl = 'file://' + path.join(rootDir, 'verify-otp.html').replace(/\\/g, '/');

    console.log('Rendering Forgot Password & Verify OTP screenshots...');

    // 1. Forgot Password Desktop
    {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.goto(fpUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(rootDir, 'forgot_password_desktop.png') });
        console.log('Saved forgot_password_desktop.png');
        await page.close();
    }

    // 2. Forgot Password Mobile
    {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
        await page.goto(fpUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(rootDir, 'forgot_password_mobile.png') });
        console.log('Saved forgot_password_mobile.png');
        await page.close();
    }

    // 3. Verify OTP Desktop
    {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.goto(otpUrl + '?email=alex.morgan%40example.com', { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(rootDir, 'verify_otp_desktop.png') });
        console.log('Saved verify_otp_desktop.png');
        await page.close();
    }

    // 4. Verify OTP Mobile
    {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
        await page.goto(otpUrl + '?email=alex.morgan%40example.com', { waitUntil: 'networkidle' });
        await page.waitForTimeout(600);
        await page.screenshot({ path: path.join(rootDir, 'verify_otp_mobile.png') });
        console.log('Saved verify_otp_mobile.png');
        await page.close();
    }

    await browser.close();
    console.log('All screenshots rendered successfully!');
}

renderScreenshots().catch(err => {
    console.error('Render error:', err);
    process.exit(1);
});
