const { chromium } = require('playwright');
const assert = require('assert');

(async () => {
    console.log('[E2E TEST] Starting FRANK Think Registration UI E2E test...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Listen to console errors
    page.on('console', msg => {
        if (msg.type() === 'error') console.log(`[BROWSER ERROR] ${msg.text()}`);
    });

    await page.goto('http://127.0.0.1:8000/register.html', { waitUntil: 'networkidle' });
    console.log('[E2E TEST] Loaded registration page.');

    // 1. Initial State
    const submitBtn = page.locator('#registerSubmitBtn');
    await assert.strictEqual(await submitBtn.isEnabled(), true, 'Submit button should be enabled initially');
    const initialText = await submitBtn.locator('.btn-text').textContent();
    console.log(`[E2E TEST] Initial submit button text: "${initialText}"`);

    // 2. Empty Form Submission Validation
    await submitBtn.click();
    const hasNameError = await page.locator('#groupFullName.has-error').isVisible();
    const hasEmailError = await page.locator('#groupEmail.has-error').isVisible();
    assert.strictEqual(hasNameError, true, 'Full name should show error');
    assert.strictEqual(hasEmailError, true, 'Email should show error');
    console.log('[E2E TEST] Empty validation errors verified.');

    // 3. Test Failure State Button Restoration (Existing Email)
    await page.fill('#regFullName', 'Frank Test User');
    await page.fill('#regEmail', 'frankline30999112@gmail.com');
    await page.fill('#regPassword', 'Password123!');
    await page.fill('#regConfirmPassword', 'Password123!');
    await page.check('#regTerms');

    console.log('[E2E TEST] Submitting with duplicate email to verify error recovery...');
    await submitBtn.click();

    // Wait for error toast
    const errorToast = page.locator('.toast.toast-error, .toast');
    await errorToast.waitFor({ timeout: 5000 });
    console.log(`[E2E TEST] Received toast: "${await errorToast.textContent()}"`);

    // Verify submit button restored after failure
    await page.waitForFunction(() => {
        const btn = document.getElementById('registerSubmitBtn');
        return btn && !btn.disabled;
    }, { timeout: 3000 });
    const restoredText = (await submitBtn.locator('.btn-text').textContent()).trim();
    assert.strictEqual(await submitBtn.isEnabled(), true, 'Button must be re-enabled after failure');
    assert(['Create Account', 'Create an Account'].includes(restoredText), `Unexpected button text: ${restoredText}`);
    console.log('[E2E TEST] Submit button successfully restored to normal state after failure!');

    // 4. Test Success State & Transition to Step 2
    const testEmail = `frankline30999112+e2e${Date.now()}@gmail.com`;
    await page.fill('#regEmail', testEmail);
    console.log(`[E2E TEST] Submitting with new test email: ${testEmail}...`);

    await submitBtn.click();

    // Wait for Step 2 OTP screen to appear
    const otpStep = page.locator('#registerOtpStep');
    await otpStep.waitFor({ state: 'visible', timeout: 15000 });
    console.log('[E2E TEST] Transitioned to Step 2 (registerOtpStep is visible).');

    const stepFields = page.locator('#registerStepFields');
    assert.strictEqual(await stepFields.isVisible(), false, 'Step 1 fields must be hidden');

    const targetEmailText = await page.locator('#otpTargetEmail').textContent();
    assert.strictEqual(targetEmailText.trim(), testEmail, 'Displayed target email must match submitted email');
    console.log(`[E2E TEST] Displayed target email verified: ${targetEmailText}`);

    // Verify resend cooldown is active
    const resendBtn = page.locator('#resendOtpBtn');
    assert.strictEqual(await resendBtn.isEnabled(), false, 'Resend button must be disabled during cooldown');
    const resendText = await resendBtn.locator('.btn-text').textContent();
    console.log(`[E2E TEST] Resend cooldown active: "${resendText}"`);
    assert(resendText.includes('s'), 'Resend text must show remaining seconds');

    // 5. Test "← Edit details" back button
    console.log('[E2E TEST] Testing "← Edit details" back button...');
    const backBtn = page.locator('#backToRegisterBtn');
    await backBtn.click();

    await stepFields.waitFor({ state: 'visible', timeout: 3000 });
    assert.strictEqual(await otpStep.isVisible(), false, 'Step 2 must be hidden after clicking back');
    const backBtnText = (await submitBtn.locator('.btn-text').textContent()).trim();
    assert(['Create Account', 'Create an Account'].includes(backBtnText), `Unexpected submit button text: ${backBtnText}`);
    console.log('[E2E TEST] Back button successfully returned to Step 1 with enabled "Create Account" button!');

    // 6. Test OTP Verification Error Handling in Step 2
    console.log('[E2E TEST] Moving back to Step 2 to test OTP verification error handling...');
    await page.fill('#regEmail', `frankline30999112+e2eb${Date.now()}@gmail.com`);
    await submitBtn.click();
    await otpStep.waitFor({ state: 'visible', timeout: 15000 });

    const otpInput = page.locator('#regOtpCode');
    await otpInput.fill('112233');

    const verifyBtn = page.locator('#verifyOtpSubmitBtn');
    await verifyBtn.click();

    // Verify error toast
    const otpErrorToast = page.locator('.toast.toast-error, .toast');
    await otpErrorToast.waitFor({ timeout: 5000 });
    console.log(`[E2E TEST] Received OTP verification error toast: "${await otpErrorToast.textContent()}"`);

    // Verify button restored
    await page.waitForFunction(() => {
        const btn = document.getElementById('verifyOtpSubmitBtn');
        return btn && !btn.disabled;
    }, { timeout: 3000 });
    assert.strictEqual(await verifyBtn.isEnabled(), true, 'Verify OTP button must be re-enabled after incorrect code');
    console.log('[E2E TEST] Verify OTP button re-enabled after incorrect code.');

    await browser.close();
    console.log('[E2E TEST] ALL FRONTEND UI E2E TESTS PASSED WITH 100% SUCCESS!');
})().catch(err => {
    console.error('[E2E TEST FAILED]', err);
    process.exit(1);
});
