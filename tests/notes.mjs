// 碎片的构建产物检查。
// 跑法：先 npm run build，再 node tests/notes.mjs
// （它查的是 dist/ 里的实际输出，不是源码——排版和字段最终都体现在这里）

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

if (!existsSync(join(DIST, 'notes', 'index.html'))) {
  console.log('  ! 没找到 dist/notes/index.html，先跑 npm run build');
  process.exit(1);
}

const list = readFileSync(join(DIST, 'notes', 'index.html'), 'utf8');
const cards = (list.match(/class="note-card"/g) ?? []).length;

console.log('\n列表页');
ok('导航里有碎片入口', list.includes('>碎片<'));
ok('标题是碎片', list.includes('<h1') && list.includes('碎片'));
ok(
  '空集合时给的是空状态，不是空墙',
  cards > 0 || list.includes('还没有碎片')
);

console.log('\n详情页与 RSS');
const rssPath = join(DIST, 'notes', 'rss.xml');
ok('生成了 /notes/rss.xml', existsSync(rssPath));

if (cards > 0) {
  const rss = readFileSync(rssPath, 'utf8');
  ok('RSS 有条目', rss.includes('<item>'));
  ok('RSS 带作者', rss.includes('<dc:creator>'));
  ok('RSS 是独立 feed（标题带碎片）', rss.includes('· 碎片'));
  ok('RSS 没有混进文章', !rss.includes('/20261125-blog/'));

  console.log('\n搜索索引');
  const idx = JSON.parse(readFileSync(join(DIST, 'search-index.json'), 'utf8'));
  const notes = idx.filter((x) => x.type === 'note');
  const posts = idx.filter((x) => x.type === 'post');
  ok('索引里有 note 类型', notes.length > 0);
  ok('索引里仍保留 post 类型', posts.length > 0);
  ok(
    'note 的 href 指向 /notes/',
    notes.every((n) => n.href.startsWith('/notes/'))
  );
  ok(
    'note 有标题（取正文第一句）',
    notes.every((n) => typeof n.title === 'string' && n.title.length > 0)
  );
  ok(
    '索引按时间倒序',
    idx.every((x, i) => i === 0 || idx[i - 1].date >= x.date)
  );
}

console.log(`\n${pass} 通过，${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
