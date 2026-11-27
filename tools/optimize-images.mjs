// 把 public/images 里的原图转成带多档宽度的 WebP，给 rehype 插件做 srcset。
// 不用 astro:assets，因为文章正文里写的是 ![](/images/x.png) 这种普通 Markdown 图片，
// 走不了 Astro 的 <Image>；在构建最前面统一转一次最省事。
//
// sharp 是 astro 的依赖，通常已经躺在 node_modules 里；装不上就跳过，构建照常。

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'public', 'images');
const OUT = path.join(SRC, 'opt');
// 清单放 .astro/ 下，不放在 public/ 里，免得被当成静态资源一起发出去。
const MANIFEST = path.join(ROOT, '.astro', 'images-manifest.json');

const WIDTHS = [720, 960, 1600];
const QUALITY = 70;
const EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);
// 图标和头像有各自的尺寸用途，不进正文管线，也免得在 opt/ 里多出两份副本。
const SKIP = /^(icon-|avatar)/i;

let sharp;
try {
  ({ default: sharp } = await import('sharp'));
} catch {
  console.warn('[images] 没装上 sharp，跳过图片优化');
  process.exit(0);
}

if (!fs.existsSync(SRC)) process.exit(0);
fs.mkdirSync(OUT, { recursive: true });

const files = fs
  .readdirSync(SRC, { withFileTypes: true })
  .filter((d) => d.isFile() && EXT.has(path.extname(d.name).toLowerCase()))
  .filter((d) => !SKIP.test(d.name))
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

    // 不放大：原图比目标窄就只保留原宽那一档。
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
        .webp({ quality: QUALITY, effort: 6 })
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

// 清掉没人引用的旧产物（改过宽度档或删过图之后会留下孤儿）。
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
