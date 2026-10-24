const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function capture() {
    const authRes = await fetch('http://127.0.0.1:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: 'testuser', password: 'Password123!' })
    });
    const authData = await authRes.json();
    const token = authData.access_token;
    const userObj = authData.user || { id: 1, full_name: 'Frank Admin', username: 'admin' };

    const browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const context = await browser.newContext({
        viewport: { width: 1440, height: 820 },
        deviceScaleFactor: 1
    });
    const page = await context.newPage();

    await page.addInitScript(({ token, userObj }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(userObj));
        localStorage.setItem('frank_onboarded', 'true');
    }, { token, userObj });

    await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // Open existing or new document in word mode
    await page.evaluate(() => {
        window.frankOfficeWorkspace.openDocument(null, 'word', 'Project Report.docx', null);
    });
    await page.waitForTimeout(1000);

    // Open both Find and Replace card and Word Count card in the right drawer
    await page.evaluate(() => {
        const we = window.frankOfficeWorkspace.wordEngine;
        if (we) {
            we.openFindReplaceDrawer('find');
            const findInp = document.getElementById('wordFindInput');
            if (findInp) {
                findInp.value = 'document';
                const matchBadge = document.getElementById('wordMatchCount');
                if (matchBadge) matchBadge.textContent = '3 of 5 matches';
            }
            we.openWordCountDialog();
            we.updateStatusPageIndicator(1, 5);
            we.updatePagesThumbnails();
        }
    });
    await page.waitForTimeout(1000);

    const outPath = path.resolve(__dirname, 'current_word_workspace.png');
    await page.screenshot({ path: outPath, fullPage: false });
    console.log('Saved screenshot to:', outPath);

    await browser.close();
}

capture().catch(err => {
    console.error(err);
    process.exit(1);
});
