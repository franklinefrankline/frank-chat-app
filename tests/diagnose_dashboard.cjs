const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function diagnose() {
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

    const consoleLogs = [];
    page.on('console', msg => consoleLogs.push({ type: msg.type(), text: msg.text() }));
    page.on('pageerror', err => consoleLogs.push({ type: 'pageerror', text: err.message }));

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

    // 1. Inspect elements inventory
    const elementsReport = await page.evaluate(() => {
        function check(sel) {
            const el = document.querySelector(sel);
            if (!el) return { found: false };
            const r = el.getBoundingClientRect();
            const cs = window.getComputedStyle(el);
            return {
                found: true,
                id: el.id,
                className: el.className,
                rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
                visible: cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0' && r.width > 0 && r.height > 0
            };
        }

        return {
            // Topbar
            topbar: check('.topbar, .dashboard-header, header'),
            logo: check('.logo, .brand, #brandLogo'),
            proBadge: check('.pro-badge, .badge-pro'),
            globalSearch: check('#globalSearch, .global-search input, #globalSearchInput'),
            langDropdown: check('#languageSelector, #langDropdown, .lang-dropdown, [data-lang-selector]'),
            notificationBtn: check('#notificationBtn, .notifications-btn, [data-notifications]'),
            userAvatar: check('.user-avatar, #userAvatar, .profile-avatar'),
            userProfileMenu: check('#userProfileMenu, .user-menu-dropdown'),

            // Sidebar
            sidebar: check('.chat-sidebar, .sidebar, #chatSidebar'),
            chatsHeading: check('.sidebar-title, #chatsTitle, h2'),
            newChatBtn: check('#newChatBtn, .new-chat-btn, [data-new-chat]'),
            filterTabs: {
                all: check('#filterAll, [data-filter="all"]'),
                unread: check('#filterUnread, [data-filter="unread"]'),
                groups: check('#filterGroups, [data-filter="groups"]'),
                archive: check('#filterArchive, [data-filter="archive"]')
            },
            convSearch: check('#searchConversations, #conversationSearchInput, .chat-search input'),
            convList: check('#conversationsList, .conversations-list, #chatList'),
            activeConvItem: check('.conversation-item.active, .chat-item.active'),

            // Conversation Header
            chatHeader: check('.chat-header, #activeChatHeader'),
            contactAvatar: check('.chat-header-avatar, .header-avatar'),
            contactName: check('.chat-header-name, #headerContactName'),
            contactId: check('.chat-header-id, #headerContactId'),
            searchInChat: check('#searchInChatBtn, [data-action="search-chat"]'),
            callBtn: check('#startCallBtn, #videoCallBtn, [data-action="call"]'),
            chatInfoBtn: check('#chatInfoBtn, #groupInfoBtn, [data-action="info"]'),
            chatMenuBtn: check('#chatMenuBtn, .chat-menu-btn, [data-action="more"]'),

            // Messages area
            messagesContainer: check('#messagesContainer, .messages-container, #chatMessages'),
            messageBubbles: Array.from(document.querySelectorAll('.message-bubble, .message-card, .chat-message')).map(m => {
                const r = m.getBoundingClientRect();
                return {
                    class: m.className,
                    text: m.textContent.trim().slice(0, 30),
                    rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }
                };
            }),

            // Composer
            composer: check('.message-composer, .chat-input-container, #messageComposer'),
            attachBtn: check('#attachBtn, .attach-btn, [data-action="attach"]'),
            imageBtn: check('#imageBtn, .image-btn, [data-action="image"]'),
            emojiBtn: check('#emojiBtn, .emoji-btn, [data-action="emoji"]'),
            messageInput: check('#messageInput, .message-input textarea, .message-input input'),
            micBtn: check('#micBtn, .mic-btn, [data-action="mic"]'),
            sendBtn: check('#sendBtn, .send-btn, [data-action="send"]')
        };
    });

    console.log('ELEMENTS INVENTORY:');
    console.log(JSON.stringify(elementsReport, null, 2));

    await browser.close();
}

diagnose().catch(err => {
    console.error(err);
    process.exit(1);
});
