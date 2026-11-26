import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const SRC = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwell-'));
const work = path.join(tmp, 'blog');
const bare = path.join(tmp, 'remote.git');

fs.cpSync(SRC, work, {
  recursive: true,
  filter: (from) => {
    const rel = path.relative(SRC, from);
    return !rel.startsWith('node_modules') && !rel.startsWith('dist') && !rel.startsWith('.astro') && !rel.startsWith('.git');
  },
});

// `git init -b` 要 git 2.28+，老版本会直接报 unknown switch b；
// 先普通初始化再改 HEAD 指向，2.14 也能跑
const git = (...args) => execFileSync('git', args, { cwd: work, encoding: 'utf8' }).trim();

const steps = [];
git('init', '-q');
git('symbolic-ref', 'HEAD', 'refs/heads/main');
steps.push(['git init', 'ok']);
git('config', 'user.name', 'Inkwell Test');
git('config', 'user.email', 'test@example.com');
git('add', '-A');
git('commit', '-q', '-m', 'init');
execFileSync('git', ['init', '--bare', '-q', bare]);
execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: bare });
git('remote', 'add', 'origin', bare);
git('push', '-q', '-u', 'origin', 'main');
steps.push(['初始推送', git('rev-parse', '--short', 'HEAD')]);

const child = spawn(process.execPath, ['writer/server.mjs'], {
  cwd: work,
  env: { ...process.env, PORT: '4401' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let log = '';
child.stdout.on('data', (d) => (log += d));
child.stderr.on('data', (d) => (log += d));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(1400);

const BASE = 'http://localhost:4401';

const created = await fetch(`${BASE}/api/new`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Push Test' }),
}).then((r) => r.json());

await fetch(`${BASE}/api/post/${created.slug}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: '一键推送验证',
    date: '2026-11-23',
    tags: '测试',
    body: '# 验证\n\n这一段用于确认提交与推送链路。',
  }),
});

const published = await fetch(`${BASE}/api/publish`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ message: 'post: 一键推送验证' }),
}).then((r) => r.json());

child.kill();
await sleep(200);

const remoteLog = execFileSync('git', ['log', '--oneline'], { cwd: bare, encoding: 'utf8' }).trim();
const remoteFiles = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD'], { cwd: bare, encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter((f) => f.includes('src/content/blog'));

console.log('临时目录：', tmp);
console.log('服务日志：', log.trim().split('\n')[0] || '(无)');
console.log('\n发布返回：');
console.log(`  ok=${published.ok}  hint=${published.hint ?? '(无)'}`);
for (const line of published.log ?? []) console.log(`  · ${line}`);
console.log('\n远程仓库提交历史：');
for (const line of remoteLog.split('\n')) console.log(`  ${line}`);
console.log('\n远程仓库中的文章文件：');
for (const f of remoteFiles) console.log(`  ${f}`);

const pass = published.ok === true && remoteFiles.some((f) => f.includes(created.slug));
console.log(`\n${pass ? 'PASS' : 'FAIL'}  一键推送链路（提交 + 推送 + 远程可见）`);

fs.rmSync(tmp, { recursive: true, force: true });
process.exit(pass ? 0 : 1);
