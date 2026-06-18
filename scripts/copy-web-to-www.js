const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const www = path.join(root, 'www');

const itemsToCopy = ['index.html', 'assets', 'character'];

if (fs.existsSync(www)) {
    fs.rmSync(www, { recursive: true, force: true });
}
fs.mkdirSync(www, { recursive: true });

const copyRecursive = (src, dest) => {
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        for (const entry of fs.readdirSync(src)) {
            copyRecursive(path.join(src, entry), path.join(dest, entry));
        }
    } else {
        fs.copyFileSync(src, dest);
    }
};

for (const item of itemsToCopy) {
    const src = path.join(root, item);
    if (fs.existsSync(src)) {
        copyRecursive(src, path.join(www, item));
        console.log(`Copied: ${item}`);
    } else {
        console.warn(`Skip (not found): ${item}`);
    }
}

console.log('Web assets copied to www/');
