// 把正文里的 <img src="/images/x.png"> 换成清单里的 WebP + srcset。
// 同时给 width/height（避免布局跳动）。
//
// 第一张图是 LCP 候选：它不 lazy，还标 fetchpriority="high"。
// 后面的图照旧 lazy，滚到才下载。
//
// 注意：不能靠闭包里的计数器判断「第几张」——Astro 会复用同一个 transformer
// 处理多个文件，计数器会跨文件累加，导致每篇的首图都不被认成第一张。
// 所以每棵树先自己扫一遍找出第一张图，再统一改写。
//
// 依赖 tools/optimize-images.mjs 在 astro build 之前跑完；
// 清单读不到就静默跳过，图片保持原样。

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

    const nodes = [];
    const collect = (node) => {
      if (node.type === 'element' && node.tagName === 'img') nodes.push(node);
      if (Array.isArray(node.children)) node.children.forEach(collect);
    };
    collect(tree);

    nodes.forEach((node, index) => {
      const props = node.properties ?? {};
      const src = typeof props.src === 'string' ? props.src : '';
      const hit = manifest[src];
      if (!hit) return;

      const largest = hit.sources[hit.sources.length - 1];
      props.src = largest.src;
      props.srcSet = hit.sources.map((s) => `${s.src} ${s.w}w`).join(', ');
      // 正文列最宽 720px，窄屏满宽。
      props.sizes = '(max-width: 720px) 100vw, 720px';
      props.width = hit.width;
      props.height = hit.height;
      props.decoding = 'async';
      if (index === 0) {
        props.loading = 'eager';
        props.fetchpriority = 'high';
      } else {
        props.loading = 'lazy';
      }
      node.properties = props;
    });
  };
}
