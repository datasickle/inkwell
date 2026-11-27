// 内容体检：在 dist 上验证正文里的链接和图片没有硬伤。
// 跑法：node tools/check-content.mjs       （需要先 build）
// 查三件事：
//   1. 图片有没有 alt（空 alt 允许，写 [](…) 或 ![](…) 都算缺失）
//   2. 站内链接指向的页面在 dist 里存在
//   3. 站内图片文件存在

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const CONTENT = [
  path.join(ROOT, 'src', 'content', 'blog'),
  path.join(ROOT, 'src', 'content', 'notes'),
];

if (!fs.existsSync(DIST)) {
  console.error('[check] 没有 dist/，先跑 npm run build');
  process.exit(1);
}

const problems = [];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.md$/i.test(entry.name)) out.push(full);
  }
  return out;
}

/** dist 里有没有这个站内路径（页面目录或静态文件） */
function distHas(urlPath) {
  const clean = urlPath.split('#')[0].split('?')[0];
  if (!clean.startsWith('/')) return true; // 站外链接、锚点
  const rel = decodeURIComponent(clean).replace(/^\/+/, '');
  const target = path.join(DIST, rel);
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return true;
  const asDir = path.join(target, 'index.html');
  if (fs.existsSync(asDir)) return true;
  return false;
}

for (const file of CONTENT.flatMap((dir) => walk(dir))) {
  const text = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const lineOf = (index) => text.slice(0, index).split('\n').length;

  // 图片：![alt](src)
  for (const m of text.matchAll(/!\[([^\]]*)\]\(([^)\s]+)/g)) {
    const [, alt, src] = m;
    const where = `${rel}:${lineOf(m.index)}`;
    if (!alt.trim()) problems.push(`${where} 图片没有 alt（${src}）`);
    if (src.startsWith('/')) {
      if (!distHas(src)) problems.push(`${where} 图片不存在（${src}）`);
    }
  }

  // 正文链接：[text](href)，跳过代码块里的
  const withoutCode = text.replace(/```[\s\S]*?```/g, (block) => block.replace(/[^\n]/g, ' '));
  for (const m of withoutCode.matchAll(/(?<!\!)\[([^\]]+)\]\(([^)\s]+)/g)) {
    const [, label, href] = m;
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    const where = `${rel}:${lineOf(m.index)}`;
    if (!distHas(href)) problems.push(`${where} 链接指向的页面不存在（${label} → ${href}）`);
  }
}

if (problems.length) {
  console.error(`[check] 发现 ${problems.length} 个问题：`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}

console.log('[check] 正文链接与图片 alt 都没问题');
