// 把正文里 <img src="/images/x.png"> 换成构建期生成的 WebP 多尺寸版本，
// 并补上 width/height（避免图片加载时版面跳动）和懒加载。
//
// 尺寸清单由 tools/optimize-images.mjs 在 astro build 之前写好；
// 这里只读清单，不碰图片。清单不存在（比如没装 sharp）就原样放行，
// 宁可少优化，也不能让构建挂掉。

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const MANIFEST = path.join(ROOT, '.astro', 'images-manifest.json');

let cached = null;
function readManifest() {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  } catch {
    cached = {};
  }
  return cached;
}

export default function optimizeImages() {
  return (tree) => {
    const manifest = readManifest();
    if (Object.keys(manifest).length === 0) return;

    const walk = (node) => {
      if (node.type === 'element' && node.tagName === 'img') {
        const props = node.properties ?? {};
        const src = typeof props.src === 'string' ? props.src : '';
        const hit = manifest[src];

        if (hit) {
          const largest = hit.sources[hit.sources.length - 1];
          props.src = largest.src;
          props.srcSet = hit.sources.map((s) => `${s.src} ${s.w}w`).join(', ');
          // 正文栏最宽约 720px，比它更宽地取图没有意义
          props.sizes = '(max-width: 720px) 100vw, 720px';
          props.width = hit.width;
          props.height = hit.height;
          props.loading = 'lazy';
          props.decoding = 'async';
          node.properties = props;
        }
      }
      if (Array.isArray(node.children)) node.children.forEach(walk);
    };

    walk(tree);
  };
}
