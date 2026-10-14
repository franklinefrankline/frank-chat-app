const { chromium } = require('playwright');
const { execSync } = require('child_process');

async function main() {
    const token = execSync('python -c "import sys; sys.path.append(\'backend\'); from security import create_access_token; print(create_access_token({\'sub\': \'franklinesamy2006\', \'id\': 274, \'user_id\': 274, \'email\': \'franklinesamy2006@gmail.com\', \'role\': \'user\'}))"').toString().trim();
    
    const userObj = {
        id: 274,
        username: 'franklinesamy2006',
        email: 'franklinesamy2006@gmail.com',
        full_name: 'Frank',
        frank_id: 'WTW28X',
        role: 'user',
        is_online: true
    };

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err));

    await page.addInitScript(({ token, userObj }) => {
        localStorage.setItem('chatapp_token', token);
        localStorage.setItem('chatapp_user', JSON.stringify(userObj));
    }, { token, userObj });

    await page.goto('http://127.0.0.1:8000/dashboard.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const berlinCard = await page.$('.conversation-card[data-id="23"]');
    console.log('Clicking Berlin card...');
    const startTime = Date.now();
    await berlinCard.click();

    // Check every 500ms for up to 8s
    for (let i = 0; i < 16; i++) {
        await page.waitForTimeout(500);
        const state = await page.evaluate(() => {
            const c = document.getElementById('messagesContainer');
            return {
                html: c ? c.innerHTML : '',
                childCount: c ? c.children.length : 0
            };
        });
        const elapsed = Date.now() - startTime;
        const isSpinner = state.html.includes('spinner');
        console.log(`[+${elapsed}ms] childCount: ${state.childCount}, isSpinner: ${isSpinner}`);
        if (!isSpinner) {
            console.log(`Rendered messages in ${elapsed}ms! First 200 chars:`, state.html.slice(0, 200));
            break;
        }
    }

    await browser.close();
}

main().catch(err => {
    console.error('Error in runner:', err);
    process.exit(1);
});
