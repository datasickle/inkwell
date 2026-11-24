// 本地试用服务器：静态托管写作台 + 内存里的假 GitHub
// 用法：node tools/dev-server.mjs  → http://localhost:4700/try
// 改动只存在内存，重启即恢复，不会碰任何真实仓库。

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const APP = path.resolve(import.meta.dirname, '..', 'app');
const PORT = Number(process.env.PORT || 4700);
const DIR = 'src/content/blog';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const demo = [
  {
    slug: `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-kai-zhang`,
    text: `---
title: 开张
date: ${new Date().toISOString().slice(0, 10)}
tags: 随笔, 建站
draft: false
---

这里是从今天开始写字的地方。

没有评论框，没有阅读数，只有按时间排下来的文章。

## 为什么用纯文本

因为十年后它还打得开。

| 方案 | 十年后 | 换个框架 |
| --- | --- | --- |
| 数据库 | 未必 | 要写迁移脚本 |
| Markdown | 能 | 直接搬 |

> 想清楚一件事，和以为自己想清楚了，是两码事。
`,
  },
  {
    slug: `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-bu-gai-zu-fu-wu-qi`,
    text: `---
title: 为什么个人博客不该租服务器
date: ${new Date().toISOString().slice(0, 10)}
tags: 随笔
draft: false
---

博客是静态站，不需要一台一直开着的机器。

- 静态托管免费
- 没有证书要续
- 没有补丁要打

写完推上去就完了。
`,
  },
];

const files = new Map();
let seq = 0;
const newSha = () => `m${(seq += 1).toString().padStart(4, '0')}`;

function seed() {
  files.clear();
  for (const d of demo) files.set(`${DIR}/${d.slug}.md`, { sha: newSha(), text: d.text });
}
seed();

function send(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function body(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const unb64 = (s) => Buffer.from(String(s).replace(/\s/g, ''), 'base64').toString('utf8');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/try') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html><meta charset="utf-8"><title>准备中…</title><script>
      localStorage.setItem('inkwell:cfg', JSON.stringify({
        owner:'demo', repo:'demo', branch:'main', dir:'${DIR}', token:'demo', apiBase: location.origin
      }));
      location.replace('/');
    </script>`);
    return;
  }

  const m = url.pathname.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);
  if (m) {
    const p = decodeURIComponent(m[3]).replace(/\/$/, '');
    const prefix = `${p}/`;

    if (req.method === 'GET') {
      const inDir = [...files.entries()].filter(([k]) => k.startsWith(prefix));
      if (inDir.length) {
        return send(
          res,
          200,
          inDir.map(([k, v]) => ({ type: 'file', name: k.slice(prefix.length), path: k, sha: v.sha, size: v.text.length }))
        );
      }
      const hit = files.get(p);
      if (!hit) return send(res, 404, { message: 'Not Found' });
      return send(res, 200, { type: 'file', path: p, sha: hit.sha, content: b64(hit.text) });
    }

    if (req.method === 'PUT') {
      const b = await body(req);
      const existing = files.get(p);
      if (existing && !b.sha) return send(res, 422, { message: 'Invalid request. "sha" wasn\'t supplied.' });
      if (existing && b.sha !== existing.sha) return send(res, 409, { message: 'sha does not match' });
      const sha = newSha();
      files.set(p, { sha, text: unb64(b.content) });
      console.log(`  [mock] ${existing ? '更新' : '新增'} ${p}`);
      return send(res, 200, { content: { sha, path: p }, commit: { sha: newSha(), html_url: '#' } });
    }

    if (req.method === 'DELETE') {
      const b = await body(req);
      const existing = files.get(p);
      if (!existing) return send(res, 404, { message: 'Not Found' });
      if (b.sha !== existing.sha) return send(res, 409, { message: 'sha does not match' });
      files.delete(p);
      console.log(`  [mock] 删除 ${p}`);
      return send(res, 200, { commit: { sha: newSha() } });
    }
  }

  if (req.method === 'POST' && url.pathname === '/__reset') {
    seed();
    return send(res, 200, { ok: true });
  }

  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(APP, rel);
  if (!file.startsWith(APP)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`本地试用：http://localhost:${PORT}/try`);
  console.log('数据在内存里，重启服务即恢复成两篇示例。');
});
