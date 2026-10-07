const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function captureSmartArtifacts() {
    const browser = await chromium.launch({ headless: true });
    const artifactsDir = 'C:\\Users\\inbat\\.gemini\\antigravity-ide\\brain\\30c73d62-4094-4db7-9e1b-b934a8329339';

    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        await page.goto('http://127.0.0.1:8000/login.html');

        // Create test user or login
        const ts = Date.now().toString().slice(-6);
        const emailA = `smart_vis_${ts}@test.app`;
        const emailB = `smart_vis_b_${ts}@test.app`;

        // Register User A
        const regARes = await page.request.post('http://127.0.0.1:8000/api/auth/register', {
            data: { username: `u_a_${ts}`, email: emailA, password: 'Password123!', full_name: 'Alex Rivera' }
        });
        const userA = (await regARes.json()).user;

        // Register User B
        const regBRes = await page.request.post('http://127.0.0.1:8000/api/auth/register', {
            data: { username: `u_b_${ts}`, email: emailB, password: 'Password123!', full_name: 'Sarah Chen' }
        });
        const userB = (await regBRes.json()).user;

        // Login User A
        const loginRes = await page.request.post('http://127.0.0.1:8000/api/auth/login', {
            data: { email: emailA, password: 'Password123!' }
        });
        const tokenA = (await loginRes.json()).access_token;

        // Login User B to get token
        const loginBRes = await page.request.post('http://127.0.0.1:8000/api/auth/login', {
            data: { email: emailB, password: 'Password123!' }
        });
        const tokenB = (await loginBRes.json()).access_token;

        // Seed messages
        await page.request.post('http://127.0.0.1:8000/api/messages', {
            headers: { Authorization: `Bearer ${tokenA}` },
            data: { recipient_id: userB.id, content: 'Hey Sarah! We need to finalize the Q4 roadmap and database schema migration.' }
        });

        await page.request.post('http://127.0.0.1:8000/api/messages', {
            headers: { Authorization: `Bearer ${tokenB}` },
            data: { recipient_id: userA.id, content: 'Sounds great. Important update: Production deployment is locked for October 24.' }
        });

        await page.request.post('http://127.0.0.1:8000/api/messages', {
            headers: { Authorization: `Bearer ${tokenA}` },
            data: { recipient_id: userB.id, content: 'We decided: Let us go with PostgreSQL and Sandstone theme for the final release.' }
        });

        await page.request.post('http://127.0.0.1:8000/api/messages', {
            headers: { Authorization: `Bearer ${tokenB}` },
            data: { recipient_id: userA.id, content: 'Please complete the mobile responsive QA testing before Friday morning.' }
        });

        await page.request.post('http://127.0.0.1:8000/api/messages', {
            headers: { Authorization: `Bearer ${tokenA}` },
            data: { recipient_id: userB.id, content: 'Confirmed! Can you review the updated API endpoints today?' }
        });

        // Set token in localStorage and navigate to dashboard
        await page.evaluate(({ token, user }) => {
            localStorage.setItem('chatapp_token', token);
            localStorage.setItem('chatapp_user', JSON.stringify(user));
            localStorage.setItem('frank_onboarded', 'true');
        }, { token: tokenA, user: userA });

        await page.goto('http://127.0.0.1:8000/dashboard.html');
        await page.waitForSelector('#conversationPanel', { timeout: 8000 });

        // Open chat with User B
        await page.evaluate(partner => window.chatController.openDirectChat(partner), userB);
        await page.waitForTimeout(500);

        // Click Smart button
        await page.click('#chatSmartBtn');
        await page.waitForSelector('#smartConversationModal.active');
        await page.waitForSelector('.smart-summary-bullet', { timeout: 6000 });

        // Screenshot 1: Summary Tab
        await page.screenshot({ path: path.join(artifactsDir, 'smart_conversation_summary.png') });
        console.log('✓ Captured smart_conversation_summary.png');

        // Switch to What Did I Miss?
        await page.click('button[data-smart-tab="missed"]');
        await page.waitForSelector('.smart-stat-card', { timeout: 6000 });
        await page.screenshot({ path: path.join(artifactsDir, 'smart_what_did_i_miss.png') });
        console.log('✓ Captured smart_what_did_i_miss.png');

        // Switch to Important Messages
        await page.click('button[data-smart-tab="important"]');
        await page.waitForSelector('#smartImportantPanel .smart-item-card', { timeout: 6000 });
        await page.screenshot({ path: path.join(artifactsDir, 'smart_important_messages.png') });
        console.log('✓ Captured smart_important_messages.png');

        // Switch to Action Items
        await page.click('button[data-smart-tab="actions"]');
        await page.waitForSelector('#smartActionsList', { timeout: 6000 });
        // Add an action item
        await page.fill('#smartNewActionInput', 'Review database migration plan for Railway');
        await page.click('#smartCreateActionBtn');
        await page.waitForSelector('.smart-action-item');
        await page.screenshot({ path: path.join(artifactsDir, 'smart_action_items.png') });
        console.log('✓ Captured smart_action_items.png');

        // Switch to Decisions
        await page.click('button[data-smart-tab="decisions"]');
        await page.waitForSelector('#smartDecisionsPanel .smart-item-card', { timeout: 6000 });
        await page.screenshot({ path: path.join(artifactsDir, 'smart_decisions.png') });
        console.log('✓ Captured smart_decisions.png');

        // Switch to Dates & Deadlines
        await page.click('button[data-smart-tab="dates"]');
        await page.waitForSelector('#smartDatesPanel .smart-item-card', { timeout: 6000 });
        await page.screenshot({ path: path.join(artifactsDir, 'smart_dates_deadlines.png') });
        console.log('✓ Captured smart_dates_deadlines.png');

        // Switch to Files
        await page.click('button[data-smart-tab="files"]');
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(artifactsDir, 'smart_files_tab.png') });
        console.log('✓ Captured smart_files_tab.png');

        // Switch to Insights
        await page.click('button[data-smart-tab="insights"]');
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(artifactsDir, 'smart_insights_tab.png') });
        console.log('✓ Captured smart_insights_tab.png');

        // Desktop Docked 4th-Column Overview (1440x900)
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.click('button[data-smart-tab="summary"]');
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(artifactsDir, 'smart_desktop_docked_panel.png') });
        console.log('✓ Captured smart_desktop_docked_panel.png');

        // Mobile Viewport
        await page.setViewportSize({ width: 375, height: 750 });
        await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(artifactsDir, 'smart_mobile_375px.png') });
        console.log('✓ Captured smart_mobile_375px.png');

    } finally {
        await browser.close();
    }
}

captureSmartArtifacts().catch(console.error);
