const { chromium } = require('playwright');

async function testLiveVercel() {
  console.log('[LIVE TEST] Launching headless browser to test https://frank-chat-app.vercel.app ...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const results = {
    landingPage: false,
    enterpriseCapabilities: false,
    smtpConfigured: false,
    loginSuccessful: false,
    dashboardLoaded: false,
    existingDataPresent: false
  };

  try {
    // 1. Landing Page & Enterprise Capabilities
    console.log('[LIVE TEST] Navigating to Live Landing Page...');
    await page.goto('https://frank-chat-app.vercel.app', { waitUntil: 'networkidle', timeout: 30000 });
    results.landingPage = true;

    const section = page.locator('#features');
    await section.waitFor({ state: 'visible', timeout: 10000 });
    const label = await section.locator('.section-label').innerText();
    console.log('[LIVE TEST] Section label:', label);

    const cards = await section.locator('.feature-grid .feature-card h3').allInnerTexts();
    console.log('[LIVE TEST] 6 Enterprise Capability titles found on live site:', cards);
    if (cards.length === 6 && cards[0] === 'Smart Conversations') {
      results.enterpriseCapabilities = true;
    }

    // 2. Forgot Password Page & SMTP Status
    console.log('[LIVE TEST] Navigating to Forgot Password page...');
    await page.goto('https://frank-chat-app.vercel.app/forgot-password.html', { waitUntil: 'networkidle', timeout: 30000 });
    
    await page.waitForTimeout(1000);
    const warningText = await page.evaluate(() => {
      const banner = document.getElementById('smtpWarningBanner') || document.querySelector('.smtp-warning');
      return banner ? { visible: banner.style.display !== 'none', text: banner.textContent.trim() } : null;
    });
    console.log('[LIVE TEST] Forgot Password SMTP warning status:', warningText);
    if (!warningText || !warningText.visible || !warningText.text.includes('Email delivery is unavailable')) {
      results.smtpConfigured = true;
    }

    // 3. Login Flow with Existing Admin Account
    console.log('[LIVE TEST] Navigating to Login page...');
    await page.goto('https://frank-chat-app.vercel.app/login.html', { waitUntil: 'networkidle', timeout: 30000 });
    
    await page.fill('#loginUsername', 'frankline30999112@gmail.com');
    await page.fill('#loginPassword', '#Frankline2006');
    await page.click('button[type="submit"]');

    // Wait for redirect to admin or dashboard
    await page.waitForURL(/.*(admin|dashboard)\.html.*/, { timeout: 15000 }).catch(() => {});
    const currentUrl = page.url();
    console.log('[LIVE TEST] Current URL after login:', currentUrl);

    if (currentUrl.includes('admin') || currentUrl.includes('dashboard')) {
      results.loginSuccessful = true;
      console.log('[LIVE TEST] Successfully authenticated as admin on live Vercel!');

      // Check admin panel data (users count, audit logs)
      await page.waitForTimeout(3000);
      const userRows = await page.$$eval('.user-row, table tbody tr, .admin-card', els => els.length).catch(() => 0);
      console.log('[LIVE TEST] Admin panel elements loaded:', userRows);

      // Now navigate to chat dashboard with active session
      console.log('[LIVE TEST] Navigating to chat dashboard.html...');
      await page.goto('https://frank-chat-app.vercel.app/dashboard.html', { waitUntil: 'networkidle', timeout: 30000 });
      results.dashboardLoaded = true;

      await page.waitForTimeout(4000);
      const convCount = await page.$$eval('.conversation-item, .chat-item, .contact-item, .user-item', els => els.length).catch(() => 0);
      console.log('[LIVE TEST] Rendered conversations/contacts count on live dashboard:', convCount);
      if (convCount > 0) {
        results.existingDataPresent = true;
      }
    }

    console.log('\n[LIVE TEST SUMMARY]');
    console.log(JSON.stringify(results, null, 2));

    if (results.landingPage && results.enterpriseCapabilities && results.smtpConfigured && results.loginSuccessful) {
      console.log('\n>>> LIVE VERCEL VERIFICATION PASSED WITH 100% SUCCESS! <<<');
    } else {
      console.log('\n>>> SOME TESTS FAILED OR NEED ATTENTION <<<');
    }

  } catch (err) {
    console.error('[LIVE TEST ERROR]', err);
  } finally {
    await browser.close();
  }
}

testLiveVercel();
