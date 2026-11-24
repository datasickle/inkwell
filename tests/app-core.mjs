// 写作台核心逻辑测试：Markdown、frontmatter、slug，以及打本地假 GitHub 的完整发布链路
// 跑法：node tests/app-core.mjs

import http from 'node:http';
import {
  renderMarkdown,
  parseFrontmatter,
  stringifyPost,
  parsePostFile,
  buildPostFile,
  slugFor,
  assertSlug,
  normalizeTags,
  createGitHub,
  b64encode,
  b64decode,
  SAFE_SLUG,
} from '../app/core.js';

let pass = 0;
let fail = 0;

function ok(label, cond, extra = '') {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${label}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${label} ${extra}`);
  }
}

function eq(label, actual, expected) {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  ok(label, same, same ? '' : `\n      期望 ${JSON.stringify(expected)}\n      实际 ${JSON.stringify(actual)}`);
}

/* ============ 假 GitHub Contents API ============ */

const files = new Map();
let shaSeq = 0;
const nextSha = () => `sha${(shaSeq += 1).toString().padStart(4, '0')}`;

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });
}

const mock = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);

  if (req.headers.authorization !== 'Bearer good-token') {
    return json(res, 401, { message: 'Bad credentials' });
  }
  if (!m) return json(res, 404, { message: 'Not Found' });

  const path = decodeURIComponent(m[3]).replace(/\/$/, '');
  const dirPrefix = `${path}/`;

  if (req.method === 'GET') {
    const inDir = [...files.entries()].filter(([p]) => p.startsWith(dirPrefix));
    if (inDir.length) {
      return json(
        res,
        200,
        inDir.map(([p, v]) => ({
          type: 'file',
          name: p.slice(dirPrefix.length),
          path: p,
          sha: v.sha,
          size: v.text.length,
        }))
      );
    }
    const hit = files.get(path);
    if (!hit) return json(res, 404, { message: 'Not Found' });
    return json(res, 200, { type: 'file', path, sha: hit.sha, content: b64encode(hit.text) });
  }

  if (req.method === 'PUT') {
    const body = await readBody(req);
    const existing = files.get(path);
    if (existing && !body.sha) {
      return json(res, 422, { message: 'Invalid request.\n\n"sha" wasn\'t supplied.' });
    }
    if (existing && body.sha !== existing.sha) {
      return json(res, 409, { message: 'sha does not match' });
    }
    const sha = nextSha();
    files.set(path, { sha, text: b64decode(body.content) });
    return json(res, 200, { content: { sha, path }, commit: { sha: nextSha(), html_url: `https://github.com/x/y/commit/${sha}` } });
  }

  if (req.method === 'DELETE') {
    const body = await readBody(req);
    const existing = files.get(path);
    if (!existing) return json(res, 404, { message: 'Not Found' });
    if (body.sha !== existing.sha) return json(res, 409, { message: 'sha does not match' });
    files.delete(path);
    return json(res, 200, { commit: { sha: nextSha() } });
  }

  return json(res, 405, { message: 'Method Not Allowed' });
});

/* ============ 测试 ============ */

console.log('\n【Markdown 渲染】');
{
  const html = renderMarkdown('# 标题\n\n正文 **粗** 和 `代码`。\n\n- 一\n- 二\n\n> 引用\n');
  ok('h1', html.includes('<h1>标题</h1>'));
  ok('strong', html.includes('<strong>粗</strong>'));
  ok('inline code', html.includes('<code>代码</code>'));
  ok('ul', html.includes('<ul><li>一</li><li>二</li></ul>'));
  ok('blockquote', html.includes('<blockquote>'));

  const table = renderMarkdown('| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |\n');
  ok('表格首行', table.includes('<th>甲</th>'), table);
  ok('表格数据', table.includes('<td>2</td>'), table);

  const fence = renderMarkdown('```js\nconst a = 1;\n```\n');
  ok('代码块带语言', fence.includes('class="language-js"'));
  ok('代码块转义', renderMarkdown('```\n<b>x</b>\n```\n').includes('&lt;b&gt;'));

  ok('注入被转义', renderMarkdown('<img src=x onerror=alert(1)>').includes('&lt;img'));
}

console.log('\n【frontmatter 往返】');
{
  const raw = buildPostFile({ title: '测试', date: '2026-11-23', tags: '甲, 乙', body: '正文\n\n## 小标题' , slug: 'x' });
  ok('以 --- 开头', raw.startsWith('---\ntitle: 测试'));
  ok('包含 date', raw.includes('date: 2026-11-23'));
  ok('tag 归一化为逗号', raw.includes('tags: 甲, 乙'));

  const back = parsePostFile(raw, 'x');
  eq('title 往返', back.title, '测试');
  eq('tags 往返', back.tags, ['甲', '乙']);
  eq('body 往返', back.body, '正文\n\n## 小标题');
  eq('draft 默认 false', back.draft, false);

  eq('无 frontmatter 也能解析', parseFrontmatter('就是正文').body, '就是正文');
  eq('标签去重空格', normalizeTags(' a ,b，  c '), ['a', 'b', 'c']);
}

console.log('\n【slug 生成】');
{
  const en = slugFor('Hello World', '2026-11-23');
  eq('英文标题', en, '20261123-hello-world');

  const cn = slugFor('为什么不该租服务器', '2026-11-23');
  ok('中文标题回退到哈希', /^20261123-[a-z0-9]{2,4}$/.test(cn), cn);
  ok('中文 slug 合法', SAFE_SLUG.test(cn), cn);
  eq('同一标题稳定', slugFor('为什么不该租服务器', '2026-11-23'), cn);
  ok('不同标题不同 slug', slugFor('另一个标题', '2026-11-23') !== cn);

  ok('非法 slug 被拒', (() => {
    try {
      assertSlug('Bad Slug');
      return false;
    } catch {
      return true;
    }
  })());
}

console.log('\n【base64 中文不损坏】');
{
  const src = '标题：繁體中文與简体 😀 混排\n第二行';
  eq('往返一致', b64decode(b64encode(src)), src);
}

console.log('\n【GitHub 发布链路（假服务）】');
await new Promise((r) => mock.listen(0, r));
const base = `http://127.0.0.1:${mock.address().port}`;

{
  const gh = createGitHub({ owner: 'me', repo: 'blog', branch: 'main', token: 'good-token', apiBase: base });

  eq('空目录返回空数组', await gh.listDir('src/content/blog'), []);

  const text = buildPostFile({ title: '首篇', date: '2026-11-23', tags: '随笔', body: '你好', slug: 'p1' });
  const created = await gh.putFile('src/content/blog/p1.md', text, '新增《首篇》');
  ok('新建返回 sha', !!created.sha);
  ok('新建返回 commit', !!created.commit);

  const list = await gh.listDir('src/content/blog');
  eq('列表有一篇', list.length, 1);
  eq('文件名正确', list[0].name, 'p1.md');

  const got = await gh.getFile('src/content/blog/p1.md');
  eq('读回内容一致', got.text, text);
  eq('读回 sha 一致', got.sha, created.sha);

  const updated = await gh.putFile('src/content/blog/p1.md', `${text}\n追加`, '更新《首篇》', got.sha);
  ok('覆盖后 sha 变化', updated.sha !== created.sha);
  ok('覆盖后内容变长', (await gh.getFile('src/content/blog/p1.md')).text.endsWith('追加'));

  let conflict = null;
  try {
    await gh.putFile('src/content/blog/p1.md', text, '用旧 sha 覆盖', created.sha);
  } catch (err) {
    conflict = err;
  }
  eq('旧 sha 覆盖被拒为 409', conflict && conflict.status, 409);

  let needSha = null;
  try {
    await gh.putFile('src/content/blog/p1.md', text, '不给 sha');
  } catch (err) {
    needSha = err;
  }
  eq('已存在却不给 sha 报 422', needSha && needSha.status, 422);

  await gh.deleteFile('src/content/blog/p1.md', updated.sha, '删除《首篇》');
  eq('删除后列表为空', (await gh.listDir('src/content/blog')).length, 0);
}

console.log('\n【错误提示可读】');
{
  const bad = createGitHub({ owner: 'me', repo: 'blog', token: 'wrong', apiBase: base });
  let err = null;
  try {
    await bad.listDir('src/content/blog');
  } catch (e) {
    err = e;
  }
  eq('401 状态', err && err.status, 401);
  ok('401 提示是人话', err && err.message.includes('Token 无效'), err && err.message);
}

mock.close();

console.log(`\n结果：${pass} 通过，${fail} 失败\n`);
process.exit(fail === 0 ? 0 : 1);
