// 把写作台一起放进站点产物，部署后访问 /app/ 就能打开
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

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

// 样式和脚本的文件名不带指纹，EdgeOne 与浏览器会按 URL 缓存。
// 改了 CSS 之后，拿到新 HTML 的用户可能还在用旧样式，工具条会整排散开。
// 这里按内容算一个短哈希挂到 query 上，内容一变 URL 就变，缓存自然失效。
const assets = ['app.css', 'core.js'];
const h = crypto.createHash('sha1');
for (const file of assets) h.update(fs.readFileSync(path.join(from, file)));
const ver = h.digest('hex').slice(0, 8);

const indexPath = path.join(to, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
html = html.replace('./app.css"', `./app.css?v=${ver}"`);
html = html.replace("'./core.js'", `'./core.js?v=${ver}'`);
fs.writeFileSync(indexPath, html);
console.log(`静态资源版本号 ${ver}`);

// 兜底：访问 /app（漏掉结尾斜杠）时，浏览器会把 ./app.css 解析成 /app.css。
// 静态资源在站点根再放一份，带不带斜杠都能拿到样式和脚本。
for (const file of assets) {
  fs.copyFileSync(path.join(from, file), path.join(distRoot, file));
}
console.log('静态资源已兜底到 dist 根（兼容 /app 不带结尾斜杠）');
