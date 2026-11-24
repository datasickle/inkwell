import fs from 'node:fs';
import { defineConfig } from 'astro/config';
import remarkCjkFriendly from 'remark-cjk-friendly';

const siteConfig = JSON.parse(
  fs.readFileSync(new URL('./site.json', import.meta.url), 'utf8')
);

export default defineConfig({
  site: siteConfig.url,
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
    },
  },
});
