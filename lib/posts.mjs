import fs from 'node:fs';
import path from 'node:path';
import { excerpt, readingTime } from './markdown.mjs';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const POSTS_DIR = path.join(ROOT, 'src', 'content', 'blog');

const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export function assertSlug(slug) {
  if (!SAFE_SLUG.test(String(slug || ''))) {
    const err = new Error('slug 只能包含小写字母、数字与短横线');
    err.status = 400;
    throw err;
  }
  return slug;
}

export function postPath(slug) {
  return path.join(POSTS_DIR, `${assertSlug(slug)}.md`);
}

export function parseFrontmatter(raw) {
  const text = String(raw).replace(/\r\n?/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: text };

  const meta = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    meta[key] = value;
  }
  return { meta, body: text.slice(m[0].length).replace(/^\n+/, '') };
}

const FIELD_ORDER = ['title', 'date', 'tags', 'draft', 'summary'];

export function stringifyPost(meta, body) {
  const keys = [
    ...FIELD_ORDER.filter((k) => meta[k] !== undefined && meta[k] !== ''),
    ...Object.keys(meta).filter((k) => !FIELD_ORDER.includes(k) && meta[k] !== undefined && meta[k] !== ''),
  ];
  const head = keys.map((k) => `${k}: ${meta[k]}`).join('\n');
  return `---\n${head}\n---\n\n${String(body).replace(/^\n+/, '')}`;
}

export function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.map((t) => String(t).trim()).filter(Boolean);
  return String(tags || '')
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function listPosts() {
  if (!fs.existsSync(POSTS_DIR)) return [];
  return fs
    .readdirSync(POSTS_DIR)
    .filter((f) => f.endsWith('.md'))
    .map((file) => {
      const slug = file.replace(/\.md$/, '');
      const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
      const { meta, body } = parseFrontmatter(raw);
      const stat = fs.statSync(path.join(POSTS_DIR, file));
      return {
        slug,
        title: meta.title || slug,
        date: meta.date || stat.mtime.toISOString().slice(0, 10),
        tags: normalizeTags(meta.tags),
        draft: String(meta.draft) === 'true',
        summary: meta.summary || excerpt(body),
        minutes: readingTime(body),
        words: body.replace(/\s/g, '').length,
        mtime: stat.mtimeMs,
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.mtime - a.mtime));
}

export function readPost(slug) {
  const file = postPath(slug);
  if (!fs.existsSync(file)) {
    const err = new Error('文章不存在');
    err.status = 404;
    throw err;
  }
  const raw = fs.readFileSync(file, 'utf8');
  const { meta, body } = parseFrontmatter(raw);
  return {
    slug,
    title: meta.title || slug,
    date: meta.date || '',
    tags: normalizeTags(meta.tags),
    draft: String(meta.draft) === 'true',
    summary: meta.summary || '',
    body,
    raw,
  };
}

export function writePost(slug, { title, date, tags, draft, summary, body }) {
  assertSlug(slug);
  fs.mkdirSync(POSTS_DIR, { recursive: true });
  const meta = {
    title: String(title || slug).trim(),
    date: String(date || new Date().toISOString().slice(0, 10)),
    tags: normalizeTags(tags).join(', '),
    draft: draft ? 'true' : 'false',
  };
  if (summary) meta.summary = String(summary).trim();
  const content = stringifyPost(meta, body || '');
  fs.writeFileSync(postPath(slug), content, 'utf8');
  return { slug, bytes: Buffer.byteLength(content, 'utf8') };
}

export function deletePost(slug) {
  const file = postPath(slug);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { slug, deleted: true };
}

export function renamePost(from, to) {
  const source = postPath(from);
  const target = postPath(to);
  if (!fs.existsSync(source)) {
    const err = new Error('原文章不存在');
    err.status = 404;
    throw err;
  }
  if (source === target) return { slug: to, unchanged: true };
  if (fs.existsSync(target)) {
    const err = new Error('这个路径已被占用');
    err.status = 409;
    throw err;
  }
  fs.renameSync(source, target);
  return { slug: to, renamed: true };
}

export function newSlug(title = '') {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;
  const ascii = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const base = ascii ? `${stamp}-${ascii}` : stamp;
  let slug = base;
  let n = 2;
  while (fs.existsSync(postPath(slug))) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}
