const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const www = path.join(root, 'www');
const dist = path.join(root, 'frontend', 'dist');

// 清理 www 目录
if (fs.existsSync(www)) {
    fs.rmSync(www, { recursive: true, force: true });
}
fs.mkdirSync(www, { recursive: true });

// 检查 frontend/dist 是否存在
if (!fs.existsSync(dist)) {
    console.error('错误: frontend/dist 目录不存在，请先在 frontend/ 目录下运行 npm run build');
    console.error(`期望路径: ${dist}`);
    process.exit(1);
}

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

// 将 frontend/dist 的所有内容复制到 www/
const entries = fs.readdirSync(dist);
for (const entry of entries) {
    copyRecursive(path.join(dist, entry), path.join(www, entry));
}

console.log(`已从 frontend/dist 复制 ${entries.length} 个条目到 www/`);
console.log('Web assets copied to www/');
