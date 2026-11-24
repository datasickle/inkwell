// 墨井 · 写作台核心逻辑
// 纯逻辑，不碰 DOM，浏览器与 Node 都能 import（便于测试）。

export const POSTS_DIR = 'src/content/blog';

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC_MAP[c]);
}

function inline(s) {
  let t = esc(s);

  const codes = [];
  t = t.replace(/`([^`\n]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });

  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  t = t.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');

  t = t.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return t;
}

const HR = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const UL = /^ {0,3}[-*+] +/;
const OL = /^ {0,3}\d+[.)] +/;
const QUOTE = /^ {0,3}> ?/;
const HEADING = /^ {0,3}(#{1,6}) +(.*)$/;
const FENCE = /^ {0,3}```(\S*)\s*$/;
const TABLE_SEP = /^ {0,3}\|? *:?-{2,}:? *(?:\| *:?-{2,}:? *)*\|? *$/;

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

function isTableStart(lines, i) {
  return lines[i].includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes('-');
}

export function renderMarkdown(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^\s*$/.test(line)) {
      i += 1;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const lang = fence[1];
      const buf = [];
      i += 1;
      while (i < lines.length && !/^ {0,3}```\s*$/.test(lines[i])) {
        buf.push(lines[i]);
        i += 1;
      }
      i += 1;
      const cls = lang ? ` class="language-${esc(lang)}"` : '';
      out.push(`<pre><code${cls}>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }

    if (isTableStart(lines, i)) {
      const head = splitRow(lines[i]);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      const th = head.map((c) => `<th>${inline(c)}</th>`).join('');
      const tb = rows
        .map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] || '')}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table>`);
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      const level = heading[1].length;
      out.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (HR.test(line)) {
      out.push('<hr />');
      i += 1;
      continue;
    }

    if (QUOTE.test(line)) {
      const buf = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        buf.push(lines[i].replace(QUOTE, ''));
        i += 1;
      }
      out.push(`<blockquote>${renderMarkdown(buf.join('\n'))}</blockquote>`);
      continue;
    }

    if (UL.test(line)) {
      const items = [];
      while (i < lines.length && UL.test(lines[i])) {
        items.push(lines[i].replace(UL, '').trim());
        i += 1;
      }
      out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`);
      continue;
    }

    if (OL.test(line)) {
      const items = [];
      while (i < lines.length && OL.test(lines[i])) {
        items.push(lines[i].replace(OL, '').trim());
        i += 1;
      }
      out.push(`<ol>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`);
      continue;
    }

    const buf = [];
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !HR.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !UL.test(lines[i]) &&
      !OL.test(lines[i]) &&
      !isTableStart(lines, i)
    ) {
      buf.push(lines[i].trim());
      i += 1;
    }
    if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`);
  }

  return out.join('\n');
}

export function excerpt(text, len = 90) {
  const plain = String(text)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`_~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > len ? `${plain.slice(0, len)}…` : plain;
}

export function readingTime(text) {
  const cjk = (String(text).match(/[\u4e00-\u9fa5]/g) || []).length;
  const words = (String(text).replace(/[\u4e00-\u9fa5]/g, ' ').match(/[A-Za-z0-9]+/g) || []).length;
  return Math.max(1, Math.round(cjk / 400 + words / 220));
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

export function todayISO(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function hash36(str) {
  let h = 2166136261;
  for (let k = 0; k < str.length; k += 1) {
    h ^= str.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 4);
}

export function slugFor(title, date = todayISO()) {
  const stamp = String(date).replace(/-/g, '') || todayISO().replace(/-/g, '');
  const ascii = String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  const base = ascii ? `${stamp}-${ascii}` : `${stamp}-${hash36(String(title || stamp))}`;
  return base;
}

export const SAFE_SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export function assertSlug(slug) {
  if (!SAFE_SLUG.test(String(slug || ''))) {
    throw new Error('路径只能包含小写字母、数字与短横线');
  }
  return slug;
}

function toBinary(bytes) {
  let bin = '';
  for (let k = 0; k < bytes.length; k += 1) bin += String.fromCharCode(bytes[k]);
  return bin;
}

export function b64encode(str) {
  const bytes = new TextEncoder().encode(String(str));
  if (typeof btoa === 'function') return btoa(toBinary(bytes));
  return Buffer.from(bytes).toString('base64');
}

export function b64decode(b64) {
  const clean = String(b64).replace(/\s/g, '');
  const bin = typeof atob === 'function' ? atob(clean) : Buffer.from(clean, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let k = 0; k < bin.length; k += 1) bytes[k] = bin.charCodeAt(k);
  return new TextDecoder().decode(bytes);
}

export class GitHubError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.payload = payload;
  }
}

function friendly(status, payload) {
  const raw = (payload && payload.message) || '';
  if (status === 401) return 'Token 无效或已过期，请重新生成';
  if (status === 403) return raw.includes('rate limit') ? 'GitHub 接口限流，等一分钟再试' : 'Token 权限不足，需要 Contents 读写权限';
  if (status === 404) return '仓库或路径不存在，检查仓库名与分支是否正确，或 Token 没有该仓库的访问权';
  if (status === 409) return '远程文件已被改动，请先刷新再发布';
  if (status === 422) return '提交被拒绝：可能是文件路径非法或分支不存在';
  return raw || `GitHub 返回 ${status}`;
}

// 极简 GitHub Contents API 客户端。apiBase 可替换，方便用本地假服务测试。
export function createGitHub({ owner, repo, branch = 'main', token, apiBase = 'https://api.github.com', fetchImpl } = {}) {
  const doFetch = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!doFetch) throw new Error('当前环境没有 fetch');

  const root = `${apiBase.replace(/\/$/, '')}/repos/${owner}/${repo}/contents`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  async function call(url, init = {}) {
    const res = await doFetch(url, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
    }
    if (!res.ok) throw new GitHubError(friendly(res.status, data), res.status, data);
    return data;
  }

  return {
    owner,
    repo,
    branch,

    async listDir(dir = POSTS_DIR) {
      let data;
      try {
        data = await call(`${root}/${dir}?ref=${encodeURIComponent(branch)}`);
      } catch (err) {
        if (err.status === 404) return [];
        throw err;
      }
      if (!Array.isArray(data)) return [];
      return data
        .filter((f) => f.type === 'file' && f.name.endsWith('.md'))
        .map((f) => ({ name: f.name, path: f.path, sha: f.sha, size: f.size, slug: f.name.replace(/\.md$/, '') }));
    },

    async getFile(path) {
      const data = await call(`${root}/${path}?ref=${encodeURIComponent(branch)}`);
      if (Array.isArray(data)) throw new GitHubError('这是一个目录，不是文件', 400, data);
      return { sha: data.sha, text: b64decode(data.content || '') };
    },

    // 不传 sha 即新建；传 sha 即覆盖。返回 commit 信息。
    async putFile(path, text, message, sha) {
      const body = { message, content: b64encode(text), branch };
      if (sha) body.sha = sha;
      const data = await call(`${root}/${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return {
        sha: data?.content?.sha || null,
        commit: data?.commit?.sha || null,
        url: data?.commit?.html_url || null,
      };
    },

    async deleteFile(path, sha, message) {
      const data = await call(`${root}/${path}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sha, branch }),
      });
      return { commit: data?.commit?.sha || null };
    },
  };
}

export function postPath(slug) {
  assertSlug(slug);
  return `${POSTS_DIR}/${slug}.md`;
}

// 把编辑器字段拼成 md 全文
export function buildPostFile({ title, date, tags, draft, summary, body, slug }) {
  const meta = {
    title: String(title || slug || '未命名').trim(),
    date: String(date || todayISO()),
    tags: normalizeTags(tags).join(', '),
    draft: draft ? 'true' : 'false',
  };
  if (summary) meta.summary = String(summary).trim();
  return stringifyPost(meta, body || '');
}

// 把 md 全文拆回编辑器字段
export function parsePostFile(raw, slug) {
  const { meta, body } = parseFrontmatter(raw);
  return {
    slug,
    title: meta.title || '',
    date: meta.date || '',
    tags: normalizeTags(meta.tags),
    draft: String(meta.draft) === 'true',
    summary: meta.summary || '',
    body,
  };
}
