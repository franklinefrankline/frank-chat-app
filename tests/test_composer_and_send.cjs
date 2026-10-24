const { chromium } = require('playwright');

async function testComposer() {
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

    await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    console.log('Testing Composer Transitions:');

    // 1. Initial State (no text): should be mode-mic
    const initialMode = await page.$eval('#composerSendBtn', el => ({
        className: el.className,
        isMicVisible: window.getComputedStyle(el.querySelector('.icon-mic')).display !== 'none',
        isSendVisible: window.getComputedStyle(el.querySelector('.icon-send')).display !== 'none'
    }));
    console.log('1. Initial mode:', initialMode);

    // 2. Type text -> should switch to mode-send
    await page.fill('#messageComposerTextarea', 'Hello from automated test!');
    await page.dispatchEvent('#messageComposerTextarea', 'input');
    await page.waitForTimeout(300);

    const typedMode = await page.$eval('#composerSendBtn', el => ({
        className: el.className,
        isMicVisible: window.getComputedStyle(el.querySelector('.icon-mic')).display !== 'none',
        isSendVisible: window.getComputedStyle(el.querySelector('.icon-send')).display !== 'none'
    }));
    console.log('2. Typed text mode:', typedMode);

    // 3. Test Shift+Enter (multiline expansion)
    const height1 = await page.$eval('#messageComposerTextarea', el => el.clientHeight);
    await page.keyboard.down('Shift');
    await page.keyboard.press('Enter');
    await page.keyboard.up('Shift');
    await page.keyboard.type('Second line of text');
    await page.dispatchEvent('#messageComposerTextarea', 'input');
    await page.waitForTimeout(300);

    const height2 = await page.$eval('#messageComposerTextarea', el => el.clientHeight);
    console.log(`3. Multiline expansion: height changed from ${height1}px to ${height2}px`);

    // 4. Test Emoji insertion
    await page.click('#emojiBtn');
    await page.waitForTimeout(300);
    const isEmojiOpen = await page.$eval('#emojiPickerPopover', el => el.classList.contains('show'));
    console.log('4. Emoji picker open:', isEmojiOpen);

    // Click an emoji inside grid
    await page.click('.emoji-item-btn[data-emoji="🚀"]');
    await page.waitForTimeout(300);
    const textareaVal = await page.$eval('#messageComposerTextarea', el => el.value);
    console.log('4b. Textarea value after emoji:', textareaVal.includes('🚀'));

    // 5. Test Sending message
    const initialMsgCount = await page.$$eval('.message-row', rows => rows.length);
    console.log(`5. Initial message count: ${initialMsgCount}`);

    await page.click('#composerSendBtn');
    await page.waitForTimeout(1500);

    const newMsgCount = await page.$$eval('.message-row', rows => rows.length);
    const clearedInput = await page.$eval('#messageComposerTextarea', el => el.value);
    const postSendMode = await page.$eval('#composerSendBtn', el => el.className);

    console.log(`5b. Post send message count: ${newMsgCount} (clearedInput: "${clearedInput}", mode: "${postSendMode}")`);

    // 6. Test duplicate clicks prevention
    await page.fill('#messageComposerTextarea', 'Single send test');
    await page.dispatchEvent('#messageComposerTextarea', 'input');
    const sendBtnEl = await page.$('#composerSendBtn');
    // Click twice rapidly
    await Promise.all([
        sendBtnEl.click(),
        sendBtnEl.click()
    ]);
    await page.waitForTimeout(1500);
    const postDoubleSendCount = await page.$$eval('.message-row', rows => rows.length);
    console.log(`6. Post rapid double-click message count: ${postDoubleSendCount} (expected ${newMsgCount + 1})`);

    await browser.close();
}

testComposer().catch(console.error);
