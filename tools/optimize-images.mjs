// 构建前把 public/images 里的原图转成 WebP 多尺寸，并写一份清单给 rehype 用。
//
// 为什么放在构建前、而不是走 astro:assets：正文里的图片是 ![](/images/x.png)
// 这种绝对路径（写作台就是这么插的），Astro 的图片组件管不到它。
// 在这里统一转一次，源码里 Markdown 的写法一个字都不用改。
//
// sharp 是 astro 的依赖，正常情况下都在；万一没装就跳过，让构建继续。

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'public', 'images');
const OUT = path.join(SRC, 'opt');
// 清单放在 .astro/ 里：它是构建中间产物，不该跟着 public/ 被发布出去
const MANIFEST = path.join(ROOT, '.astro', 'images-manifest.json');

const WIDTHS = [960, 1600];
const QUALITY = 80;
const EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.warn('[images] 没有可用的 sharp，跳过图片优化');
  process.exit(0);
}

if (!fs.existsSync(SRC)) process.exit(0);
fs.mkdirSync(OUT, { recursive: true });

const files = fs
  .readdirSync(SRC, { withFileTypes: true })
  .filter((d) => d.isFile() && EXT.has(path.extname(d.name).toLowerCase()))
  .map((d) => d.name)
  .sort();

const manifest = {};
let made = 0;
let skipped = 0;
let failed = 0;

for (const name of files) {
  const srcFile = path.join(SRC, name);
  const srcStat = fs.statSync(srcFile);

  try {
    const meta = await sharp(srcFile).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) continue;

    // 只生成不超过原图宽度的尺寸，避免把小图放大糊掉
    const widths = [...new Set(WIDTHS.map((w) => Math.min(w, width)))].sort((a, b) => a - b);
    const sources = [];

    for (const w of widths) {
      const outName = `${path.parse(name).name}-${w}.webp`;
      const outFile = path.join(OUT, outName);

      if (fs.existsSync(outFile) && fs.statSync(outFile).mtimeMs >= srcStat.mtimeMs) {
        const m = await sharp(outFile).metadata();
        sources.push({ w, h: m.height ?? Math.round((height * w) / width), src: `/images/opt/${outName}` });
        skipped += 1;
        continue;
      }

      const info = await sharp(srcFile)
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: QUALITY, effort: 4 })
        .toFile(outFile);

      sources.push({ w: info.width, h: info.height, src: `/images/opt/${outName}` });
      made += 1;
    }

    if (!sources.length) continue;
    const largest = sources[sources.length - 1];
    manifest[`/images/${name}`] = { width: largest.w, height: largest.h, sources };
  } catch (err) {
    failed += 1;
    console.warn(`[images] ${name} 处理失败：${err.message}`);
  }
}

fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

// 清掉不再被引用的旧产物（改图或删图之后会留下孤儿文件）
const keep = new Set(Object.values(manifest).flatMap((e) => e.sources.map((s) => path.basename(s.src))));
for (const name of fs.readdirSync(OUT)) {
  if (name === 'manifest.json') continue;
  if (!keep.has(name)) {
    fs.rmSync(path.join(OUT, name), { force: true });
  }
}

console.log(
  `[images] ${Object.keys(manifest).length} 张原图 → WebP：新生成 ${made}，复用 ${skipped}` +
    (failed ? `，失败 ${failed}` : '')
);
