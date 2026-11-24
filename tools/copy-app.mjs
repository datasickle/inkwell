// 把写作台一起放进站点产物，部署后访问 /app/ 就能打开
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const from = path.join(ROOT, 'app');
const to = path.join(ROOT, 'dist', 'app');
const distRoot = path.join(ROOT, 'dist');

if (!fs.existsSync(distRoot)) {
  console.error('dist 不存在，先跑 astro build');
  process.exit(1);
}

fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log('写作台已复制到 dist/app');

// 兜底：访问 /app（漏掉结尾斜杠）时，浏览器会把 ./app.css 解析成 /app.css。
// 静态资源在站点根再放一份，带不带斜杠都能拿到样式和脚本。
for (const file of ['app.css', 'core.js']) {
  fs.copyFileSync(path.join(from, file), path.join(distRoot, file));
}
console.log('静态资源已兜底到 dist 根（兼容 /app 不带结尾斜杠）');
