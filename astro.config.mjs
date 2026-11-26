import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkCjkFriendly from 'remark-cjk-friendly';
import headingAnchor from './tools/rehype-heading-anchor.mjs';
import optimizeImages from './tools/rehype-optimize-images.mjs';

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

/**
 * 代码块语言别名。
 * Shiki 只认规范的 lang 名，写 ```C# 会被当成纯文本：既没有高亮，
 * 也不会有 data-language，标签自然就不显示。这里在 markdown 阶段
 * 先把常见写法折成规范名。
 */
const LANG_ALIAS = new Map(
  Object.entries({
    'c#': 'csharp',
    csharp: 'csharp',
    cs: 'csharp',
    shell: 'bash',
    sh: 'bash',
    console: 'bash',
    zsh: 'bash',
    ps: 'powershell',
    ps1: 'powershell',
    py: 'python',
    yml: 'yaml',
    md: 'markdown',
    text: 'plaintext',
    txt: 'plaintext',
  })
);

function normalizeFenceLang() {
  return (tree) => {
    const walk = (node) => {
      if (node.type === 'code' && typeof node.lang === 'string') {
        const next = LANG_ALIAS.get(node.lang.trim().toLowerCase());
        if (next) node.lang = next;
      }
      if (Array.isArray(node.children)) node.children.forEach(walk);
    };
    walk(tree);
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
    remarkPlugins: [normalizeFenceLang, remarkCjkFriendly],
    // 标题锚点自己定 id（Astro 随后只补没 id 的），图片则换成构建期压好的 WebP
    rehypePlugins: [headingAnchor, optimizeImages],
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
