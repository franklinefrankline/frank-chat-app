const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = 'http://127.0.0.1:8000';

async function verifyChatTranslationFlow() {
    console.log('================================================================');
    console.log('   FRANK THINK — RECIPIENT-SPECIFIC CHAT TRANSLATION TEST       ');
    console.log('================================================================\n');

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    try {
        // 1. Log in as Administrator / User A
        console.log('1. Logging in as Frankline (User A)...');
        await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'load' });
        await page.fill('#loginUsername', 'frankline30999112@gmail.com');
        await page.fill('#loginPassword', '#Frankline2006');
        await page.click('#loginSubmitBtn');
        await page.waitForURL('**/admin.html', { timeout: 10000 });
        console.log('[PASS] Logged in as User A');

        // Get User A auth token
        const tokenA = await page.evaluate(() => localStorage.getItem('frank_token') || localStorage.getItem('chatapp_token'));
        console.log('User A token acquired');

        // 2. Send message from User A to User B (Berline, ID 23) via API
        console.log('2. Sending message from User A to User B (ID 23)...');
        const sendRes = await page.evaluate(async (token) => {
            const resp = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    recipient_id: 23,
                    content: 'How are you?'
                })
            });
            return await resp.json();
        }, tokenA);

        console.log(`Message sent! ID: ${sendRes.id}, content: "${sendRes.content}"`);
        if (sendRes.content !== 'How are you?') {
            throw new Error(`Original content was altered! Expected 'How are you?', got '${sendRes.content}'`);
        }
        const messageId = sendRes.id;

        // 3. User A views messages (sender perspective)
        console.log('3. User A fetches conversation messages...');
        const userAMessages = await page.evaluate(async (token) => {
            const resp = await fetch('/api/messages/direct/23?target_language=en', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            return await resp.json();
        }, tokenA);

        const sentMsg = userAMessages.find(m => m.id === messageId);
        console.log('User A views message:', sentMsg.content, 'translated_content:', sentMsg.translated_content);
        if (sentMsg.content !== 'How are you?') {
            throw new Error('User A canonical message content was altered');
        }
        if (sentMsg.translated_content) {
            throw new Error('User A should see original message without translation override');
        }
        console.log('[PASS] User A continues seeing the original message unaltered.');

        // 4. Test Translation Engine for Recipient B (Tamil, target_language=ta)
        console.log('4. Testing translation retrieval for Recipient (Tamil - ta)...');
        const transResTa = await page.evaluate(async ({ mid, token }) => {
            const resp = await fetch(`/api/messages/${mid}/translate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ target_language: 'ta' })
            });
            return await resp.json();
        }, { mid: messageId, token: tokenA });

        console.log('Tamil translation result:', transResTa);
        if (!transResTa.translated_content) {
            throw new Error('Translation for target_language=ta failed to return translated_content');
        }
        console.log(`[PASS] Recipient translation generated in Tamil: "${transResTa.translated_content}"`);

        // 5. Test Recipient switching language to Hindi (target_language=hi)
        console.log('5. Testing translation retrieval for Recipient (Hindi - hi)...');
        const transResHi = await page.evaluate(async ({ mid, token }) => {
            const resp = await fetch(`/api/messages/${mid}/translate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ target_language: 'hi' })
            });
            return await resp.json();
        }, { mid: messageId, token: tokenA });

        console.log('Hindi translation result:', transResHi);
        if (!transResHi.translated_content) {
            throw new Error('Translation for target_language=hi failed to return translated_content');
        }
        console.log(`[PASS] Recipient translation generated in Hindi: "${transResHi.translated_content}"`);

        // 6. Test Frontend UI Message Row Rendering & Toggle functionality
        console.log('6. Testing UI Rendering of recipient translated message with toggle...');
        await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'load' });
        await page.waitForTimeout(1000);

        await page.evaluate(() => {
            const el = document.getElementById('appLoadingScreen');
            if (el) el.remove();
        });

        const toggleTestHtml = await page.evaluate((mid) => {
            const testMsg = {
                id: mid,
                sender_id: 1,
                content: 'How are you?',
                translated_content: 'நீங்கள் எப்படி இருக்கிறீர்கள்?',
                target_language: 'ta',
                source_language: 'en',
                created_at: new Date().toISOString(),
                sender: { id: 1, username: 'Frankline', full_name: 'Frankline' }
            };
            if (typeof messagesModule !== 'undefined') {
                return messagesModule.renderMessage(testMsg, 23); // rendered for recipient 23
            }
            return null;
        }, messageId);

        if (!toggleTestHtml) {
            throw new Error('messagesModule.renderMessage failed to generate message HTML');
        }

        await page.evaluate((html) => {
            const container = document.createElement('div');
            container.id = 'recipientMsgContainer';
            container.innerHTML = html;
            document.body.appendChild(container);
        }, toggleTestHtml);

        await page.waitForTimeout(300);

        // Check translation is visible, original is hidden
        const isTaVisible = await page.isVisible(`#msgTransText-${messageId}`);
        const isEnVisible = await page.isVisible(`#msgOrigText-${messageId}`);
        console.log(`Initial view: Translation visible: ${isTaVisible}, Original visible: ${isEnVisible}`);
        if (!isTaVisible || isEnVisible) {
            throw new Error('Default recipient view should show translation and hide original');
        }

        // Click toggle to view original
        console.log('Clicking toggle button to view original...');
        await page.click(`.btn-toggle-msg-translation[data-msg-id="${messageId}"]`);
        await page.waitForTimeout(300);

        const isEnNowVisible = await page.isVisible(`#msgOrigText-${messageId}`);
        const isTaNowVisible = await page.isVisible(`#msgTransText-${messageId}`);
        console.log(`After toggle: Original visible: ${isEnNowVisible}, Translation visible: ${isTaNowVisible}`);
        if (!isEnNowVisible || isTaNowVisible) {
            throw new Error('Toggle failed: original should now be visible and translation hidden');
        }

        // Click toggle again to switch back to translation
        console.log('Clicking toggle button again to switch back to translation...');
        await page.click(`.btn-toggle-msg-translation[data-msg-id="${messageId}"]`);
        await page.waitForTimeout(300);

        const isTaBackVisible = await page.isVisible(`#msgTransText-${messageId}`);
        const isEnBackHidden = !(await page.isVisible(`#msgOrigText-${messageId}`));
        console.log(`After second toggle: Translation visible: ${isTaBackVisible}, Original hidden: ${isEnBackHidden}`);
        if (!isTaBackVisible || !isEnBackHidden) {
            throw new Error('Second toggle failed: translation should be back and original hidden');
        }

        console.log('\n================================================================');
        console.log('   RECIPIENT-SPECIFIC CHAT TRANSLATION FULLY VERIFIED!          ');
        console.log('================================================================\n');

    } catch (err) {
        console.error('[TEST ERROR]', err);
        process.exitCode = 1;
    } finally {
        await browser.close();
    }
}

verifyChatTranslationFlow();
