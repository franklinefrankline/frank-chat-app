const { chromium } = require('playwright');
const path = require('path');

const EXPECTED_CARDS = [
    {
        title: 'Smart Conversations',
        desc: 'Summarize conversations, identify key points, important information, action items, decisions, dates, and source references with AI-powered analysis.'
    },
    {
        title: 'Secure Authentication',
        desc: 'Cryptographically hashed credentials with PBKDF2 and HMAC-SHA256 JWT tokens safeguarding each API and socket request.'
    },
    {
        title: 'Document Open & Edit',
        desc: 'Open, view, and edit supported documents directly within FRANK Think, making it easy to manage your files in one place.'
    },
    {
        title: 'Message Scheduling',
        desc: 'Compose messages in advance and schedule them to be sent at a selected date and time for more flexible and organized communication.'
    },
    {
        title: 'AI Assistant',
        desc: 'Get intelligent assistance with questions, writing, summarization, and everyday tasks directly within FRANK Think.'
    },
    {
        title: 'Automatic Language Translation',
        desc: 'Communicate across languages. User A can send a message in English while User B receives it in Tamil. Each user sees messages in their preferred language, with the option to view the original message.'
    }
];

async function verifyEnterpriseCapabilities() {
    console.log('===============================================================');
    console.log('VERIFYING ENTERPRISE CAPABILITIES FEATURE CARDS');
    console.log('===============================================================');

    const browser = await chromium.launch({ headless: true });
    const localFile = 'file:///' + path.resolve(__dirname, '../backend/frontend/index.html').replace(/\\/g, '/');

    // 1. Desktop verification (1440x900)
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(localFile, { waitUntil: 'load' });
    await page.waitForTimeout(500);

    const section = page.locator('#features');
    await section.waitFor({ state: 'visible' });

    // Verify section heading
    const label = await section.locator('.section-label').innerText();
    console.log(`Section Label: "${label}"`);
    if (!label.toLowerCase().includes('enterprise capabilities')) {
        throw new Error(`Expected section label to include 'Enterprise Capabilities', got "${label}"`);
    }

    // Verify 6 cards exist
    const cards = section.locator('.feature-grid .feature-card');
    const cardCount = await cards.count();
    console.log(`Total Feature Cards: ${cardCount}`);
    if (cardCount !== 6) {
        throw new Error(`Expected exactly 6 feature cards, got ${cardCount}`);
    }

    // Verify each card in exact order
    for (let i = 0; i < EXPECTED_CARDS.length; i++) {
        const expected = EXPECTED_CARDS[i];
        const card = cards.nth(i);

        const title = (await card.locator('h3').innerText()).trim();
        const desc = (await card.locator('p').innerText()).trim();
        const svgCount = await card.locator('.feature-icon-wrap svg').count();

        console.log(`\nCard ${i + 1}:`);
        console.log(`  Title: "${title}"`);
        console.log(`  Desc:  "${desc.slice(0, 60)}..."`);
        console.log(`  SVG:   ${svgCount > 0 ? 'Present' : 'MISSING'}`);

        if (title !== expected.title) {
            throw new Error(`Card ${i + 1} Title mismatch! Expected "${expected.title}", got "${title}"`);
        }
        if (desc !== expected.desc) {
            throw new Error(`Card ${i + 1} Description mismatch! Expected "${expected.desc}", got "${desc}"`);
        }
        if (svgCount === 0) {
            throw new Error(`Card ${i + 1} is missing its icon SVG!`);
        }
    }

    // Verify absence of "Document Reading"
    const featuresSectionText = await section.innerText();
    if (featuresSectionText.toLowerCase().includes('document reading')) {
        throw new Error('FAIL: "Document Reading" text was found in the features section!');
    }
    console.log('\n[PASS] "Document Reading" is completely removed from the features section.');

    // Screenshot Desktop
    const artifactsDir = 'C:/Users/inbat/.gemini/antigravity-ide/brain/71968f7e-48f4-4f2f-82c5-505aafe27bd8';
    await section.screenshot({ path: path.join(artifactsDir, 'enterprise_capabilities_desktop.png') });
    console.log('Saved screenshot: enterprise_capabilities_desktop.png');

    // 2. Tablet Viewport (768x1024)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);
    const tabletBox = await section.boundingBox();
    console.log(`\nTablet Section Box: ${tabletBox.width}x${tabletBox.height}`);
    await section.screenshot({ path: path.join(artifactsDir, 'enterprise_capabilities_tablet.png') });
    console.log('Saved screenshot: enterprise_capabilities_tablet.png');

    // 3. Mobile Viewport (375x667)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    const mobileBox = await section.boundingBox();
    console.log(`Mobile Section Box: ${mobileBox.width}x${mobileBox.height}`);
    await section.screenshot({ path: path.join(artifactsDir, 'enterprise_capabilities_mobile.png') });
    console.log('Saved screenshot: enterprise_capabilities_mobile.png');

    // 4. Multi-language test (Tamil & Hindi)
    console.log('\n--- Testing Language Switching on Feature Cards ---');
    await page.setViewportSize({ width: 1440, height: 900 });

    // Switch to Tamil
    await page.evaluate(() => window.i18n && window.i18n.setLanguage('ta'));
    await page.waitForTimeout(300);
    const card1TitleTa = (await cards.nth(0).locator('h3').innerText()).trim();
    const card2TitleTa = (await cards.nth(1).locator('h3').innerText()).trim();
    console.log(`Tamil Card 1: "${card1TitleTa}"`);
    console.log(`Tamil Card 2: "${card2TitleTa}"`);
    if (card1TitleTa !== 'நுண்ணறிவு உரையாடல்கள்' || card2TitleTa !== 'பாதுகாப்பான அங்கீகாரம்') {
        throw new Error(`Tamil translation mismatch on feature cards!`);
    }

    // Switch to Hindi
    await page.evaluate(() => window.i18n && window.i18n.setLanguage('hi'));
    await page.waitForTimeout(300);
    const card1TitleHi = (await cards.nth(0).locator('h3').innerText()).trim();
    const card2TitleHi = (await cards.nth(1).locator('h3').innerText()).trim();
    console.log(`Hindi Card 1: "${card1TitleHi}"`);
    console.log(`Hindi Card 2: "${card2TitleHi}"`);
    if (card1TitleHi !== 'स्मार्ट वार्तालाप' || card2TitleHi !== 'सुरक्षित प्रमाणीकरण') {
        throw new Error(`Hindi translation mismatch on feature cards!`);
    }

    // Switch back to English
    await page.evaluate(() => window.i18n && window.i18n.setLanguage('en'));
    await page.waitForTimeout(300);
    const card1TitleEn = (await cards.nth(0).locator('h3').innerText()).trim();
    console.log(`English restored Card 1: "${card1TitleEn}"`);
    if (card1TitleEn !== 'Smart Conversations') {
        throw new Error(`English restoration failed!`);
    }

    await browser.close();
    console.log('\n===============================================================');
    console.log('ALL ENTERPRISE CAPABILITIES TESTS PASSED SUCCESSFULLY! [100%]');
    console.log('===============================================================');
}

verifyEnterpriseCapabilities().catch(err => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
});
