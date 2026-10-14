const fs = require('fs');
const path = require('path');

const baseDir = path.resolve(__dirname, '..');
const frontendDir = path.join(baseDir, 'frontend');
const targets = [
    baseDir,
    path.join(baseDir, 'backend', 'frontend'),
    path.join(baseDir, 'api', '_backend', 'frontend')
];

function copyRecursive(src, dest) {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        for (const item of fs.readdirSync(src)) {
            copyRecursive(path.join(src, item), path.join(dest, item));
        }
    } else {
        const destDir = path.dirname(dest);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(src, dest);
    }
}

function syncFile(relPath) {
    const src = path.join(frontendDir, relPath);
    if (!fs.existsSync(src)) {
        console.warn('Source does not exist:', src);
        return;
    }
    for (const target of targets) {
        const dest = path.join(target, relPath);
        copyRecursive(src, dest);
        console.log(`Synced ${relPath} -> ${path.relative(baseDir, dest)}`);
    }
}

// Sync specified files or all frontend files
const filesToSync = process.argv.slice(2);
if (filesToSync.length > 0) {
    filesToSync.forEach(syncFile);
} else {
    // Sync all frontend items except node_modules
    for (const item of fs.readdirSync(frontendDir)) {
        if (item === 'node_modules') continue;
        syncFile(item);
    }
}
console.log('Frontend sync complete!');
