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
  applyFormat,
  continueList,
  notesDirFor,
  noteSlug,
  notePath,
  noteTitle,
  buildNoteFile,
  parseNoteFile,
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

console.log('\n【格式工具条】');
{
  const run = (value, s, e, action) => applyFormat(value, s, e, action);
  const pick = (r) => [r.value, r.start, r.end];

  eq('粗体包裹', pick(run('hello world', 6, 11, 'bold')), ['hello **world**', 8, 13]);
  eq('粗体取消', pick(run('**bold**', 0, 8, 'bold')), ['bold', 0, 4]);
  eq('光标在粗体里再点一次', pick(run('**bold**', 4, 4, 'bold')), ['bold', 2, 2]);
  eq('斜体包裹', pick(run('abc', 0, 3, 'italic')), ['*abc*', 1, 4]);
  eq('删除线包裹', pick(run('abc', 0, 3, 'strike')), ['~~abc~~', 2, 5]);
  eq('行内代码取消', pick(run('用 `npm i` 装', 3, 8, 'code')), ['用 npm i 装', 2, 7]);
  eq('空选区放占位词', pick(run('', 0, 0, 'bold'))[0], '**粗体**');

  eq('链接包文字并选中网址', pick(run('看这里', 1, 3, 'link')), ['看[这里](url)', 6, 9]);
  eq('选中网址变链接', pick(run('https://a.com', 0, 13, 'link')), ['[](https://a.com)', 1, 1]);
  eq('链接取消', pick(run('[文字](url)', 0, 11, 'link')), ['文字', 0, 2]);

  eq('二级标题', pick(run('标题\n第二行', 0, 0, 'h2'))[0], '## 标题\n第二行');
  eq('二级标题取消', pick(run('## 标题', 0, 0, 'h2'))[0], '标题');
  eq('换级别', pick(run('## 标题', 0, 0, 'h3'))[0], '### 标题');

  eq('引用多行', pick(run('一\n二', 0, 3, 'quote'))[0], '> 一\n> 二');
  eq('引用取消', pick(run('> 一', 0, 0, 'quote'))[0], '一');
  eq('无序列表', pick(run('a\nb', 0, 3, 'ul'))[0], '- a\n- b');
  eq('无序转有序', pick(run('- a\n- b', 0, 7, 'ol'))[0], '1. a\n2. b');
  eq('列表取消', pick(run('- a\n- b', 0, 7, 'ul'))[0], 'a\nb');

  const table = run('前文', 2, 2, 'table');
  ok('表格插在空行后', table.value.startsWith('前文\n\n| 列一 | 列二 |'), table.value);
  ok('表格带分隔行', table.value.includes('| --- | --- |'));
  eq('表格选中首个表头', table.value.slice(table.start, table.end), '列一');

  eq('代码块包住选区', pick(run('npm i', 0, 5, 'codeblock'))[0], '```\nnpm i\n```');
  eq('空代码块放光标在中间', pick(run('', 0, 0, 'codeblock')), ['```\n\n```', 4, 4]);
  ok('分隔线', run('前文', 2, 2, 'hr').value.includes('\n\n---'));
  ok('图片占位选中说明', (() => {
    const r = run('', 0, 0, 'image');
    return r.value === '![图片说明](https://)' && r.value.slice(r.start, r.end) === '图片说明';
  })());
}

console.log('\n【列表自动续行】');
{
  eq('无序续行', continueList('- 一项', 4), { handled: true, value: '- 一项\n- ', caret: 7 });
  eq('有序续行递增', continueList('2. 一项', 5), { handled: true, value: '2. 一项\n3. ', caret: 9 });
  eq('缩进保留', continueList('  - 子项', 6), { handled: true, value: '  - 子项\n  - ', caret: 11 });
  eq('空条目退出列表', continueList('- ', 2), { handled: true, value: '', caret: 0 });
  eq('普通段落不动', continueList('一段话', 3).handled, false);
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

console.log('\n【碎片：目录、路径、标题】');
{
  eq('目录推导 blog→notes', notesDirFor('src/content/blog'), 'src/content/notes');
  eq('已经是 notes 就不动', notesDirFor('src/content/notes'), 'src/content/notes');
  eq('非 blog 目录末尾补 notes', notesDirFor('content/posts'), 'content/posts/notes');
  eq('空值回落默认', notesDirFor(''), 'src/content/notes');

  eq('文件名取时刻', noteSlug('2026-11-26T14:32:00+08:00'), '20261126-1432');
  eq('只有日期补 -0000', noteSlug('2026-11-26'), '20261126-0000');
  ok('文件名过 SAFE_SLUG', SAFE_SLUG.test(noteSlug('2026-11-26T09:04:00+08:00')));

  eq('路径拼接', notePath('20261126-1432', 'src/content/notes'), 'src/content/notes/20261126-1432.md');
  ok('非法路径被拒', (() => {
    try {
      notePath('Bad Slug');
      return false;
    } catch {
      return true;
    }
  })());

  eq('首句当标题', noteTitle('RAG 那篇只写了一半，索引还没验证。后面还有。'), 'RAG 那篇只写了一半，索引还没验证');
  eq('去掉图片与链接', noteTitle('![](/images/a.png) 看 [这里](https://x) 就行'), '看 这里 就行');
  eq('过长截断', noteTitle('一'.repeat(60)), `${'一'.repeat(40)}…`);
  eq('空正文兜底', noteTitle(''), '（没有正文）');
}

console.log('\n【碎片 frontmatter】');
{
  const raw = buildNoteFile({ date: '2026-11-26T14:32:00+08:00', tags: '随手, 运维', body: '今天记一条。\n第二段。' });
  ok('不写 title', !/^title:/m.test(raw));
  ok('date 带时区', raw.includes('date: 2026-11-26T14:32:00+08:00'));
  ok('tags 归一化', raw.includes('tags: 随手, 运维'));
  ok('发布时不写 draft', !/^draft:/m.test(raw));

  const back = parseNoteFile(raw, '20261126-1432');
  eq('date 往返', back.date, '2026-11-26T14:32:00+08:00');
  eq('tags 往返', back.tags, ['随手', '运维']);
  eq('body 往返', back.body, '今天记一条。\n第二段。');
  eq('标题来自正文', back.title, '今天记一条');

  const drafted = buildNoteFile({ date: '2026-11-26T14:32:00+08:00', body: '草稿', draft: true });
  ok('存草稿写 draft: true', /^draft: true/m.test(drafted));
  ok('没标签就不写 tags', !/^tags:/m.test(drafted));
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

  // 碎片走同一套接口，只是目录和 frontmatter 不同
  const noteText = buildNoteFile({ date: '2026-11-26T14:32:00+08:00', tags: '随手', body: '记一条。' });
  const noteCreated = await gh.putFile(notePath('20261126-1432', 'src/content/notes'), noteText, '新增碎片 11-26 14:32');
  ok('碎片新建返回 sha', !!noteCreated.sha);
  eq('碎片目录能列出', (await gh.listDir('src/content/notes')).length, 1);
  eq('碎片原文读回', (await gh.getFile('src/content/notes/20261126-1432.md')).text, noteText);
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
