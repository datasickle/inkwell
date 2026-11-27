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

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
