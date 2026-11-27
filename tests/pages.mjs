// 首页 / 全部文章 / 归档 三页的分工检查。
// 跑法：先 npm run build，再 node tests/pages.mjs
// 查的是 dist 的实际输出：卡片数量、入口指向、sitemap 收录。

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
let pass = 0;
let fail = 0;

function ok(label, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  }
}

const CARD = /class="relative group flex flex-nowrap/g;
const countCards = (html) => (html.match(CARD) ?? []).length;

if (!existsSync(join(DIST, 'index.html'))) {
  console.log('  ! 没找到 dist/index.html，先跑 npm run build');
  process.exit(1);
}

const idx = JSON.parse(readFileSync(join(DIST, 'search-index.json'), 'utf8'));
const total = idx.filter((x) => x.type === 'post').length;

const home = readFileSync(join(DIST, 'index.html'), 'utf8');
const all = readFileSync(join(DIST, 'posts', 'index.html'), 'utf8');

console.log('\n首页');
ok('只列最近三条', countCards(home) === Math.min(3, total), `实际 ${countCards(home)} 张，文章共 ${total} 篇`);
ok('入口指向 /posts/ 而不是归档', home.includes('href="/posts/"'));
ok('入口行带总数', home.includes(`共 ${total} 篇`));

console.log('\n全部文章');
ok('页面存在', existsSync(join(DIST, 'posts', 'index.html')));
ok('卡片数量等于文章总数', countCards(all) === total, `实际 ${countCards(all)} 张，文章共 ${total} 篇`);
ok('标题是「全部文章」', all.includes('全部文章'));
ok('有总数', all.includes(`共 ${total} 篇`));

console.log('\n归档没被顶掉');
ok('归档页还在', existsSync(join(DIST, 'archive', 'index.html')));

console.log('\nsitemap');
const sitemap = readFileSync(join(DIST, 'sitemap-0.xml'), 'utf8');
ok('sitemap 收了 /posts/', sitemap.includes('/posts/'));
ok('sitemap 没收 /app', !sitemap.includes('/app/'));

console.log('\n正文图片');
// 有配图的文章：首图 eager + 提前 preload，其余 lazy
const withImage = idx.filter((x) => x.type === 'post' && x.id === '20261125-blog')[0];
if (withImage) {
  const page = readFileSync(join(DIST, withImage.id, 'index.html'), 'utf8');
  const imgs = [...page.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
  ok('文章页有图片', imgs.length > 0, `实际 ${imgs.length} 张`);
  ok('首图不是 lazy', imgs[0] && !imgs[0].includes('loading="lazy"'));
  ok('首图标了 high 优先级', imgs[0] && imgs[0].includes('fetchpriority="high"'));
  ok('其余图片仍 lazy', imgs.slice(1).every((tag) => tag.includes('loading="lazy"')), `${imgs.slice(1).length} 张`);
  ok('head 里有首图 preload', /<link rel="preload" as="image"[^>]*imagesrcset=/.test(page));
  ok('图片都带 width/height', imgs.every((tag) => /\swidth="\d+"/.test(tag) && /\sheight="\d+"/.test(tag)));
}

console.log('\n部署探针');
const versionFile = join(DIST, 'version.json');
ok('生成了 /version.json', existsSync(versionFile));
if (existsSync(versionFile)) {
  const v = JSON.parse(readFileSync(versionFile, 'utf8'));
  ok('带 commit', typeof v.commit === 'string' && v.commit.length > 0);
  ok('带构建时间', !Number.isNaN(Date.parse(v.builtAt)));
  ok('文章数对得上', v.posts === idx.filter((x) => x.type === 'post').length, `实际 ${v.posts}`);
}

console.log('\n许可声明');
ok('/license/ 页存在', existsSync(join(DIST, 'license', 'index.html')));
const homeHtml = readFileSync(join(DIST, 'index.html'), 'utf8');
ok('页脚有内容许可', homeHtml.includes('CC BY-NC-SA 4.0'));
ok('页脚链到 /license/', homeHtml.includes('href="/license/"'));
if (withImage) {
  const article = readFileSync(join(DIST, withImage.id, 'index.html'), 'utf8');
  ok('文章页有许可说明', article.includes('CC BY-NC-SA 4.0'));
  ok('head 里有 rel=license', article.includes('rel="license"'));
}
const rssXml = readFileSync(join(DIST, 'rss.xml'), 'utf8');
ok('feed 里带 copyright', rssXml.includes('<copyright>'));

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
