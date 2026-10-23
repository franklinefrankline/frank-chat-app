const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function render() {
    const browser = await chromium.launch();
    const page = await browser.newPage({ deviceScaleFactor: 2 });
    
    // Render frank-icon.svg
    const svgIconPath = path.resolve('assets/brand/frank-icon.svg');
    const svgIconContent = fs.readFileSync(svgIconPath, 'utf8');
    
    await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;">${svgIconContent}</body></html>`);
    const iconElement = await page.$('svg');
    const iconBuffer = await iconElement.screenshot({ omitBackground: true });
    
    fs.writeFileSync('assets/brand/frank-icon.png', iconBuffer);
    fs.writeFileSync('frontend/assets/brand/frank-icon.png', iconBuffer);
    console.log('Successfully saved frank-icon.png');

    // Render frank-logo.svg
    const svgLogoPath = path.resolve('assets/brand/frank-logo.svg');
    const svgLogoContent = fs.readFileSync(svgLogoPath, 'utf8');
    
    await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;">${svgLogoContent}</body></html>`);
    const logoElement = await page.$('svg');
    const logoBuffer = await logoElement.screenshot({ omitBackground: true });
    
    fs.writeFileSync('assets/brand/frank-logo.png', logoBuffer);
    fs.writeFileSync('frontend/assets/brand/frank-logo.png', logoBuffer);
    console.log('Successfully saved frank-logo.png');

    await browser.close();
}

render().catch(err => {
    console.error(err);
    process.exit(1);
});
