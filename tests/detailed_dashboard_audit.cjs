const { chromium } = require('playwright');

async function audit() {
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

    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', err => errors.push(err.message));

    await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const report = await page.evaluate(() => {
        function getBox(el) {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const cs = window.getComputedStyle(el);
            return {
                tag: el.tagName,
                id: el.id,
                className: el.className,
                x: Math.round(r.x),
                y: Math.round(r.y),
                width: Math.round(r.width),
                height: Math.round(r.height),
                display: cs.display,
                position: cs.position,
                zIndex: cs.zIndex,
                overflow: cs.overflow,
                overflowY: cs.overflowY
            };
        }

        const topHeader = getBox(document.getElementById('appTopHeader'));
        const topHeaderLeft = getBox(document.querySelector('.top-header-left'));
        const topHeaderCenter = getBox(document.querySelector('.top-header-center'));
        const topHeaderRight = getBox(document.querySelector('.top-header-right'));
        const searchInput = getBox(document.getElementById('topHeaderSearchInput'));

        const convHeader = getBox(document.querySelector('.conversation-header'));
        const chatsTitle = getBox(document.getElementById('desktopHeaderTitle'));
        const editDocBtn = getBox(document.getElementById('chatsHeaderEditDocBtn'));
        const newChatBtn = getBox(document.getElementById('chatsHeaderNewBtn'));
        const filterBtn = getBox(document.getElementById('chatsHeaderFilterBtn'));

        const filterChips = Array.from(document.querySelectorAll('.conversation-filters .filter-chip')).map(getBox);

        const convItems = Array.from(document.querySelectorAll('.conversation-card')).map(el => ({
            id: el.dataset.id,
            type: el.dataset.type,
            box: getBox(el),
            name: el.querySelector('.conversation-name')?.textContent,
            time: el.querySelector('.conversation-time')?.textContent,
            snippet: el.querySelector('.conversation-snippet')?.textContent
        }));

        const chatHeader = getBox(document.querySelector('.chat-header'));
        const partnerAvatar = getBox(document.getElementById('chatPartnerAvatar'));
        const partnerStatusDot = getBox(document.getElementById('chatPartnerStatusDot'));
        const partnerName = getBox(document.getElementById('chatPartnerName'));
        const fidWrap = getBox(document.getElementById('chatHeaderFrankIdWrap'));
        const presence = getBox(document.getElementById('chatPartnerPresenceText'));

        const headerActions = Array.from(document.querySelectorAll('.chat-header-actions button')).map(getBox);

        const messagesContainer = getBox(document.getElementById('messagesContainer'));
        const messageRows = Array.from(document.querySelectorAll('.message-row')).map(el => ({
            id: el.id,
            box: getBox(el),
            bubble: getBox(el.querySelector('.message-bubble'))
        }));

        const composer = getBox(document.querySelector('.chat-composer'));
        const attachBtn = getBox(document.getElementById('attachmentBtn'));
        const photoBtn = getBox(document.getElementById('desktopQuickPhotoBtn'));
        const emojiBtn = getBox(document.getElementById('emojiBtn'));
        const textarea = getBox(document.getElementById('messageComposerTextarea'));
        const sendBtn = getBox(document.getElementById('composerSendBtn'));

        return {
            topHeader,
            topHeaderLeft,
            topHeaderCenter,
            topHeaderRight,
            searchInput,
            convHeader,
            chatsTitle,
            editDocBtn,
            newChatBtn,
            filterBtn,
            filterChips,
            convItems,
            chatHeader,
            partnerAvatar,
            partnerStatusDot,
            partnerName,
            fidWrap,
            presence,
            headerActions,
            messagesContainer,
            messageRowsCount: messageRows.length,
            messageRowsBounds: messageRows.slice(0, 3).concat(messageRows.slice(-2)),
            composer,
            attachBtn,
            photoBtn,
            emojiBtn,
            textarea,
            sendBtn
        };
    });

    console.log('AUDIT REPORT:');
    console.log(JSON.stringify({ report, errors }, null, 2));

    await browser.close();
}

audit().catch(console.error);
