import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import {
  ROOT,
  listPosts,
  readPost,
  writePost,
  deletePost,
  renamePost,
  newSlug,
} from '../lib/posts.mjs';
import { renderMarkdown } from '../lib/markdown.mjs';

const PORT = Number(process.env.PORT || 4400);
const WRITER_DIR = path.join(ROOT, 'writer');

function send(res, status, payload, type = 'application/json; charset=utf-8') {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) {
        reject(Object.assign(new Error('内容过大'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('请求体不是合法 JSON'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function git(args) {
  return new Promise((resolve) => {
    execFile('git', args, { cwd: ROOT, windowsHide: true }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error ? error.code ?? 1 : 0,
        out: String(stdout || '').trim(),
        err: String(stderr || '').trim(),
      });
    });
  });
}

async function gitStatus() {
  const inRepo = await git(['rev-parse', '--is-inside-work-tree']);
  if (!inRepo.ok || inRepo.out !== 'true') {
    return { repo: false, remote: null, branch: null, dirty: false };
  }
  const remote = await git(['remote', 'get-url', 'origin']);
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const dirty = await git(['status', '--porcelain']);
  return {
    repo: true,
    remote: remote.ok ? remote.out : null,
    branch: branch.ok ? branch.out : null,
    dirty: Boolean(dirty.out),
  };
}

async function publish(message) {
  const log = [];
  const status = await gitStatus();

  if (!status.repo) {
    return {
      ok: false,
      log: ['这里还不是 git 仓库。先在项目根目录执行 git init。'],
      hint: 'no-repo',
    };
  }

  log.push(`分支 ${status.branch || '(未知)'}`);

  const add = await git(['add', '-A']);
  if (!add.ok) return { ok: false, log: [...log, `git add 失败：${add.err}`] };

  const staged = await git(['diff', '--cached', '--name-only']);
  if (!staged.out) {
    return { ok: true, log: [...log, '没有需要提交的改动。'], skipped: true };
  }

  const files = staged.out.split('\n').filter(Boolean);
  log.push(`暂存 ${files.length} 个文件`);

  const commit = await git(['commit', '-m', message]);
  if (!commit.ok) {
    return {
      ok: false,
      log: [...log, `提交失败：${commit.err || commit.out}`],
      hint: 'commit-failed',
    };
  }
  log.push('已提交');

  if (!status.remote) {
    return {
      ok: false,
      log: [...log, '没有配置远程仓库，提交留在本地了。', '执行 git remote add origin <你的仓库地址> 后再推送。'],
      hint: 'no-remote',
    };
  }

  const push = await git(['push']);
  if (!push.ok) {
    return {
      ok: false,
      log: [...log, `推送失败：${push.err || push.out}`],
      hint: 'push-failed',
    };
  }
  log.push('已推送到远程，云端会开始构建');

  return { ok: true, log, files: files.length };
}

function serveStatic(res, urlPath) {
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  const file = path.join(WRITER_DIR, relative);
  if (!file.startsWith(WRITER_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return false;
  }
  const ext = path.extname(file).toLowerCase();
  const type =
    ext === '.html'
      ? 'text/html; charset=utf-8'
      : ext === '.css'
        ? 'text/css; charset=utf-8'
        : ext === '.js'
          ? 'text/javascript; charset=utf-8'
          : 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(file));
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const route = url.pathname;
  const method = req.method || 'GET';

  try {
    if (method === 'GET' && serveStatic(res, route)) return;

    if (route === '/api/posts' && method === 'GET') {
      return send(res, 200, { posts: listPosts() });
    }

    if (route === '/api/status' && method === 'GET') {
      return send(res, 200, await gitStatus());
    }

    if (route === '/api/render' && method === 'POST') {
      const { body } = await readBody(req);
      return send(res, 200, { html: renderMarkdown(body || '') });
    }

    if (route === '/api/new' && method === 'POST') {
      const { title } = await readBody(req);
      const slug = newSlug(title || '');
      writePost(slug, {
        title: title || '未命名',
        date: new Date().toISOString().slice(0, 10),
        tags: [],
        draft: false,
        body: '',
      });
      return send(res, 200, { slug, post: readPost(slug) });
    }

    if (route === '/api/publish' && method === 'POST') {
      const { message } = await readBody(req);
      const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
      return send(res, 200, await publish(message || `更新文章 ${stamp}`));
    }

    if (route === '/api/rename' && method === 'POST') {
      const { from, to } = await readBody(req);
      const result = renamePost(from, to);
      return send(res, 200, result);
    }

    const match = route.match(/^\/api\/post\/([a-z0-9-]+)$/);

    if (match) {
      const slug = match[1];

      if (method === 'GET') return send(res, 200, readPost(slug));

      if (method === 'PUT' || method === 'POST') {
        const payload = await readBody(req);
        writePost(slug, payload);
        return send(res, 200, { ok: true, slug, post: readPost(slug) });
      }

      if (method === 'DELETE') {
        return send(res, 200, deletePost(slug));
      }
    }

    return send(res, 404, { error: '没有这个接口' });
  } catch (error) {
    const status = error.status || 500;
    return send(res, status, { error: error.message || '服务器内部错误' });
  }
});

server.listen(PORT, () => {
  const line = `写作台已启动  →  http://localhost:${PORT}`;
  console.log('');
  console.log(`  ${line}`);
  console.log(`  文章目录：${path.relative(ROOT, path.join(ROOT, 'src', 'content', 'blog'))}`);
  console.log('  Ctrl+C 退出');
  console.log('');
});
