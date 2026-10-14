const fs = require('fs');

const html = fs.readFileSync('frontend/dashboard.html', 'utf8');
const idRegex = /id=["']([^"']+)["']/g;
let match;
const ids = [];
while ((match = idRegex.exec(html)) !== null) {
    if (match[1].match(/chat|msg|message|view|stream|pane|container/i)) {
        ids.push(match[1]);
    }
}
console.log('Matching IDs in dashboard.html:', ids);
