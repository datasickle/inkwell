import fs from 'node:fs';
import { defineConfig } from 'astro/config';

const siteConfig = JSON.parse(
  fs.readFileSync(new URL('./site.json', import.meta.url), 'utf8')
);

export default defineConfig({
  site: siteConfig.url,
  build: {
    format: 'directory',
  },
  markdown: {
    shikiConfig: {
      themes: {
        light: 'rose-pine-dawn',
        dark: 'rose-pine-moon',
      },
      wrap: false,
    },
  },
});
