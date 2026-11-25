import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkCjkFriendly from 'remark-cjk-friendly';

const siteConfig = JSON.parse(
  fs.readFileSync(new URL('./site.json', import.meta.url), 'utf8')
);

/**
 * 把 ```js {2,5-7} 这种行号提示解析成「要加亮的行」。
 * 用的是 markdown fence 的 meta 部分，Shiki 会把它原样传给 transformer。
 */
function parseLines(spec) {
  const hit = new Set();
  for (const chunk of spec.split(',')) {
    const part = chunk.trim();
    if (!part) continue;
    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      for (let n = Math.min(from, to); n <= Math.max(from, to); n += 1) hit.add(n);
    } else if (/^\d+$/.test(part)) {
      hit.add(Number(part));
    }
  }
  return hit;
}

function lineHighlight() {
  return {
    name: 'line-highlight',
    line(node, line) {
      const raw = this.options?.meta?.__raw ?? '';
      const spec = raw.match(/\{([\d,\s-]+)\}/);
      if (!spec) return;
      if (!parseLines(spec[1]).has(line)) return;
      const cls = node.properties.class ?? '';
      node.properties.class = `${cls} highlighted`.trim();
    },
  };
}

export default defineConfig({
  site: siteConfig.url,
  integrations: [
    // 写作台 /app 与搜索索引不参与搜索收录
    sitemap({
      filter: (page) =>
        !page.includes('/app') && !page.includes('search-index'),
    }),
  ],
  build: {
    format: 'directory',
  },
  markdown: {
    // 修复中文标点紧贴 ** 时粗体不生效（CommonMark 定界符规则）
    remarkPlugins: [remarkCjkFriendly],
    shikiConfig: {
      themes: {
        light: 'rose-pine-dawn',
        dark: 'rose-pine-moon',
      },
      wrap: false,
      transformers: [lineHighlight()],
    },
  },
});
