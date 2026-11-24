import { spawn } from 'node:child_process';

const child = spawn(process.execPath, ['writer/server.mjs'], {
  cwd: process.cwd(),
  stdio: ['ignore', 'pipe', 'pipe'],
});

let bootLog = '';
child.stdout.on('data', (d) => (bootLog += d));
child.stderr.on('data', (d) => (bootLog += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1400);

const BASE = 'http://localhost:4400';
const results = [];

async function call(label, path, options = {}) {
  try {
    const res = await fetch(BASE + path, options);
    const type = res.headers.get('content-type') || '';
    const data = type.includes('json') ? await res.json() : await res.text();
    results.push({ label, status: res.status, ok: res.ok, data });
    return data;
  } catch (error) {
    results.push({ label, status: 0, ok: false, data: error.message });
    return null;
  }
}

const html = await call('首页 HTML', '/');
await call('仓库状态', '/api/status');
const posts = await call('文章列表', '/api/posts');
const rendered = await call('Markdown 渲染', '/api/render', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ body: '# 标题\n\n**加粗** 与 `代码`\n\n- 一\n- 二' }),
});
const created = await call('新建文章', '/api/new', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: '自测临时文章' }),
});
const slug = created?.slug;
if (slug) {
  await call('保存文章', `/api/post/${slug}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '自测临时文章',
      date: '2026-11-23',
      tags: '测试, 临时',
      body: '正文一句话。',
    }),
  });
  await call('读取文章', `/api/post/${slug}`);
  const renamed = await call('改路径', '/api/rename', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: slug, to: `${slug}-test` }),
  });
  const target = renamed?.slug || slug;
  await call('读取改名后', `/api/post/${target}`);
  await call('删除文章', `/api/post/${target}`, { method: 'DELETE' });
}
await call('尝试发布', '/api/publish', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'test' }),
});

child.kill();

console.log('启动日志：');
console.log(bootLog.trim().split('\n').filter(Boolean).join('\n'));
console.log('\n测试结果：');
for (const r of results) {
  let summary = '';
  if (r.label === '首页 HTML') summary = String(r.data).includes('写作台') ? '含「写作台」标题' : '缺少标题';
  else if (r.label === '仓库状态') summary = `repo=${r.data?.repo} remote=${r.data?.remote}`;
  else if (r.label === '文章列表') summary = `${r.data?.posts?.length} 篇`;
  else if (r.label === 'Markdown 渲染')
    summary = ['<h1', '<strong>', '<code>', '<ul>', '<li>']
      .map((tag) => `${tag}${String(r.data?.html).includes(tag) ? '✓' : '✗'}`)
      .join(' ');
  else if (r.label === '新建文章') summary = `slug=${r.data?.slug}`;
  else if (r.label === '保存文章') summary = `ok=${r.data?.ok}`;
  else if (r.label === '读取文章') summary = `title=${r.data?.title} tags=${JSON.stringify(r.data?.tags)}`;
  else if (r.label === '改路径') summary = `slug=${r.data?.slug}`;
  else if (r.label === '读取改名后') summary = r.data?.title ? `title=${r.data.title}` : '读取失败';
  else if (r.label === '删除文章') summary = `deleted=${r.data?.deleted}`;
  else if (r.label === '尝试发布') summary = `ok=${r.data?.ok} hint=${r.data?.hint}`;
  console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.label.padEnd(14, ' ')} ${r.status}  ${summary}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
