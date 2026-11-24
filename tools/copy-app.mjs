// 把写作台一起放进站点产物，部署后访问 /app/ 就能打开
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const from = path.join(ROOT, 'app');
const to = path.join(ROOT, 'dist', 'app');

if (!fs.existsSync(path.join(ROOT, 'dist'))) {
  console.error('dist 不存在，先跑 astro build');
  process.exit(1);
}

fs.rmSync(to, { recursive: true, force: true });
fs.cpSync(from, to, { recursive: true });
console.log('写作台已复制到 dist/app');
