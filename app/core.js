// inkwell editor · 核心逻辑
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

/* ============ 编辑操作：把格式套到选区上 ============ */

function clampCaret(n, len) {
  const v = Number.isFinite(n) ? n : len;
  return Math.max(0, Math.min(v, len));
}

function normalizeRange(value, start, end) {
  const len = value.length;
  let s = clampCaret(start, len);
  let e = clampCaret(end, len);
  if (s > e) [s, e] = [e, s];
  return [s, e];
}

// 选区所处的整行范围（含首尾，不含换行符）
function blockRange(value, start, end) {
  const ls = value.lastIndexOf('\n', start - 1) + 1;
  let le = value.indexOf('\n', end);
  if (le === -1) le = value.length;
  return [ls, le];
}

const INLINE_STYLES = {
  bold: { mark: '**', placeholder: '粗体' },
  italic: { mark: '*', placeholder: '斜体' },
  strike: { mark: '~~', placeholder: '删除线' },
  code: { mark: '`', placeholder: '代码' },
};

// 找出包住选区的同一行内标记对。带两道保险，避免把正文里的星号当格式：
// 1) 标记内侧不能是空白；2) 单字符标记不能是 ** 的一半。
function enclosingPair(text, s, e, mark) {
  const ls = text.lastIndexOf('\n', s - 1) + 1;
  let le = text.indexOf('\n', e);
  if (le === -1) le = text.length;

  const open = text.lastIndexOf(mark, s - mark.length);
  if (open < ls) return null;
  const close = text.indexOf(mark, e);
  if (close === -1 || close + mark.length > le) return null;
  if (close < open + mark.length) return null;

  const afterOpen = text[open + mark.length];
  const beforeClose = text[close - 1];
  if (!afterOpen || /\s/.test(afterOpen)) return null;
  if (!beforeClose || /\s/.test(beforeClose)) return null;
  if (mark.length === 1 && (text[open - 1] === mark || text[close + 1] === mark)) return null;

  return { open, close };
}

// 行内样式：选中就包起来，再点一次拆掉（toggle）
export function formatInline(value, start, end, style) {
  const spec = INLINE_STYLES[style];
  if (!spec) throw new Error(`未知的行内样式：${style}`);
  const text = String(value);
  const [s, e] = normalizeRange(text, start, end);
  const { mark, placeholder } = spec;
  const inner = text.slice(s, e);

  // 1) 选区自己带着标记：**粗体** → 粗体
  if (inner.length >= mark.length * 2 && inner.startsWith(mark) && inner.endsWith(mark)) {
    const bare = inner.slice(mark.length, inner.length - mark.length);
    return { value: text.slice(0, s) + bare + text.slice(e), start: s, end: s + bare.length };
  }

  // 2) 选区或光标已经被同种标记包住：拆掉外面那对，不重复嵌套
  const pair = enclosingPair(text, s, e, mark);
  if (pair) {
    const { open, close } = pair;
    const body = text.slice(open + mark.length, close);
    const map = (n) => Math.min(body.length, Math.max(0, n - (open + mark.length)));
    return {
      value: text.slice(0, open) + body + text.slice(close + mark.length),
      start: open + map(s),
      end: open + map(e),
    };
  }

  // 3) 正常包裹；没选内容就放一段占位文字并选中，方便直接改写
  const body = inner || placeholder;
  const at = s + mark.length;
  return {
    value: text.slice(0, s) + mark + body + mark + text.slice(e),
    start: at,
    end: at + body.length,
  };
}

// 链接：选中文字 → [文字](url) 并选中 url；选中的是网址 → [](网址)
export function formatLink(value, start, end) {
  const text = String(value);
  const [s, e] = normalizeRange(text, start, end);
  const inner = text.slice(s, e);

  const existing = /^\[([^\]]*)\]\(([^)]*)\)$/.exec(inner);
  if (existing) {
    return { value: text.slice(0, s) + existing[1] + text.slice(e), start: s, end: s + existing[1].length };
  }

  if (/^(?:https?:\/\/|mailto:)\S+$/i.test(inner)) {
    const at = s + 1; // 光标落在 [] 中间
    return { value: `${text.slice(0, s)}[](${inner})${text.slice(e)}`, start: at, end: at };
  }

  const label = inner || '链接文字';
  const urlAt = s + label.length + 3; // [label]( 之后
  return {
    value: `${text.slice(0, s)}[${label}](url)${text.slice(e)}`,
    start: urlAt,
    end: urlAt + 3,
  };
}

function editLines(value, start, end, map) {
  const text = String(value);
  const [s, e] = normalizeRange(text, start, end);
  const [ls, le] = blockRange(text, s, e);
  const lines = text.slice(ls, le).split('\n');
  const next = lines.map(map).join('\n');
  return { value: text.slice(0, ls) + next + text.slice(le), start: ls, end: ls + next.length };
}

const H_PREFIX = /^ {0,3}#{1,6} +/;

// 标题：再点一次回到普通段落。正文里只给 H2 / H3，H1 留给文章标题
export function formatHeading(value, start, end, level = 2) {
  const text = String(value);
  const lv = Math.max(1, Math.min(6, level));
  const marker = `${'#'.repeat(lv)} `;
  const [s, e] = normalizeRange(text, start, end);
  const [ls, le] = blockRange(text, s, e);
  const lines = text.slice(ls, le).split('\n');
  const all = lines.every((l) => new RegExp(`^ {0,3}#{${lv}} `).test(l));
  return editLines(text, s, e, (line) => (all ? line.replace(H_PREFIX, '') : marker + line.replace(H_PREFIX, '')));
}

export function formatQuote(value, start, end) {
  const text = String(value);
  const [s, e] = normalizeRange(text, start, end);
  const [ls, le] = blockRange(text, s, e);
  const lines = text.slice(ls, le).split('\n');
  const all = lines.every((l) => /^ {0,3}>/.test(l));
  return editLines(text, s, e, (line) => (all ? line.replace(/^ {0,3}> ?/, '') : `> ${line.replace(/^ {0,3}> ?/, '')}`));
}

const STRIP_LIST = /^ {0,3}(?:[-*+]|\d+[.)]) +/;

// 列表：无序 ↔ 有序会互相替换；再点一次取消
export function formatList(value, start, end, ordered = false) {
  const text = String(value);
  const [s, e] = normalizeRange(text, start, end);
  const [ls, le] = blockRange(text, s, e);
  const lines = text.slice(ls, le).split('\n');
  const same = ordered ? /^ {0,3}\d+[.)] +/ : /^ {0,3}[-*+] +/;
  const all = lines.every((l) => same.test(l));
  let n = 0;
  return editLines(text, s, e, (line) => {
    const bare = line.replace(STRIP_LIST, '');
    if (all) return bare;
    if (!bare.trim() && lines.length > 1) return ''; // 空行不硬塞项目符号
    n += 1;
    return ordered ? `${n}. ${bare}` : `- ${bare}`;
  });
}

// 在选区处塞入一段块级内容，前后自动补空行
export function insertBlock(value, start, end, block) {
  const text = String(value);
  const [s, e] = normalizeRange(text, start, end);
  const before = text.slice(0, s);
  const after = text.slice(e);
  const pad = /(?:^|\n\n)$/.test(before) ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const tail = /^(?:\n\n|$)/.test(after) ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const at = before.length + pad.length;
  return { value: before + pad + block + tail + after, start: at, end: at + block.length };
}

export const TABLE_TEMPLATE = '| 列一 | 列二 |\n| --- | --- |\n| 内容 | 内容 |';
export const IMAGE_TEMPLATE = '![图片说明](https://)';

export function insertTable(value, start, end) {
  const r = insertBlock(value, start, end, TABLE_TEMPLATE);
  const at = r.start + TABLE_TEMPLATE.indexOf('列一');
  return { value: r.value, start: at, end: at + 2 };
}

export function insertImage(value, start, end) {
  const r = insertBlock(value, start, end, IMAGE_TEMPLATE);
  const at = r.start + IMAGE_TEMPLATE.indexOf('图片说明');
  return { value: r.value, start: at, end: at + 4 };
}

export function insertHr(value, start, end) {
  return insertBlock(value, start, end, '---');
}

// 代码块：有选中就包起来，没有就放假框并把光标放到中间
export function formatCodeBlock(value, start, end, lang = '') {
  const text = String(value);
  const [s, e] = normalizeRange(text, start, end);
  const inner = text.slice(s, e);
  const head = `\`\`\`${lang}`;
  if (!inner.trim()) {
    const r = insertBlock(text, s, e, `${head}\n\n\`\`\``);
    const at = r.start + head.length + 1;
    return { value: r.value, start: at, end: at };
  }
  const r = insertBlock(text, s, e, `${head}\n${inner}\n\`\`\``);
  const at = r.start + head.length + 1;
  return { value: r.value, start: at, end: at + inner.length };
}

// 工具栏按钮的统一入口：action 就是按钮上的 data-action
export function applyFormat(value, start, end, action) {
  switch (action) {
    case 'bold':
      return formatInline(value, start, end, 'bold');
    case 'italic':
      return formatInline(value, start, end, 'italic');
    case 'strike':
      return formatInline(value, start, end, 'strike');
    case 'code':
      return formatInline(value, start, end, 'code');
    case 'link':
      return formatLink(value, start, end);
    case 'h2':
      return formatHeading(value, start, end, 2);
    case 'h3':
      return formatHeading(value, start, end, 3);
    case 'quote':
      return formatQuote(value, start, end);
    case 'ul':
      return formatList(value, start, end, false);
    case 'ol':
      return formatList(value, start, end, true);
    case 'codeblock':
      return formatCodeBlock(value, start, end);
    case 'table':
      return insertTable(value, start, end);
    case 'image':
      return insertImage(value, start, end);
    case 'hr':
      return insertHr(value, start, end);
    default:
      return null;
  }
}

// 回车时自动续上一条列表；空条目回车则退出列表
export function continueList(value, caret) {
  const text = String(value);
  const at = clampCaret(caret, text.length);
  const ls = text.lastIndexOf('\n', at - 1) + 1;
  const line = text.slice(ls, at);

  const ul = /^(\s*)([-*+]) +(.*)$/.exec(line);
  if (ul) {
    if (!ul[3].trim()) return { handled: true, value: text.slice(0, ls) + text.slice(at), caret: ls };
    const ins = `\n${ul[1]}${ul[2]} `;
    return { handled: true, value: text.slice(0, at) + ins + text.slice(at), caret: at + ins.length };
  }

  const ol = /^(\s*)(\d+)([.)]) +(.*)$/.exec(line);
  if (ol) {
    if (!ol[4].trim()) return { handled: true, value: text.slice(0, ls) + text.slice(at), caret: ls };
    const ins = `\n${ol[1]}${Number(ol[2]) + 1}${ol[3]} `;
    return { handled: true, value: text.slice(0, at) + ins + text.slice(at), caret: at + ins.length };
  }

  return { handled: false, value: text, caret: at };
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

/** 只取日期部分。slug 和图片名不能带冒号，否则过不了 SAFE_SLUG */
export function datePart(value) {
  return String(value || '').slice(0, 10);
}

/** 本机时区偏移，形如 +08:00 */
export function localOffset(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const pad = (n) => String(n).padStart(2, '0');
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** 当前时刻，带时区偏移：2026-11-25T10:30:00+08:00 */
export function nowStamp(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${date}T${time}${localOffset(d)}`;
}

/**
 * 写进 frontmatter 前补上时区。
 * 不带偏移的时间在不同机器上会被解释成不同时刻——构建机在 UTC，
 * 本机在 +08:00，差八小时会让「凌晨发的文章」在首页换到前一天。
 * 纯日期（老文章）原样返回，不擅自改写成 00:00:00。
 */
export function withOffset(value) {
  const raw = String(value || '').trim();
  if (!raw) return raw;
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(raw)) return raw;
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?$/);
  if (!m) return raw;
  return `${m[1]}T${m[2]}${m[3] || ':00'}${localOffset()}`;
}

/** 把 frontmatter 里的时间转成 <input type="datetime-local"> 能吃的格式 */
export function toLocalInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2})(?::(\d{2}))?)?/);
  if (!m) return '';
  return `${m[1]}T${m[2] || '00:00'}:${m[3] || '00'}`;
}

/** 列表里显示的短时间：11-25 10:30 */
export function stampLabel(value) {
  const m = String(value || '').match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}))?/
  );
  if (!m) return String(value || '');
  return m[4] ? `${m[2]}-${m[3]} ${m[4]}` : `${m[2]}-${m[3]}`;
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
  const stamp = datePart(date).replace(/-/g, '') || todayISO().replace(/-/g, '');
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

/* ---------- 图片 ---------- */

// 图片落在 public/images/，构建时原样复制到站点根，所以文章里引用 /images/xxx.jpg
export const IMAGES_DIR = 'public/images';
export const IMAGE_URL_PREFIX = '/images';

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']);

/**
 * 图片是二进制，不能走 b64encode（那个先按 UTF-8 编码文本，图片会坏）。
 * 这里直接把字节转 base64，并按 32KB 分块，避免大图触发调用栈溢出。
 */
export function b64encodeBytes(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (typeof btoa !== 'function') return Buffer.from(u8).toString('base64');
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < u8.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

/** 生成不会撞车的文件名：20261124-3f9a1c.jpg */
export function imageName(ext, date = todayISO(), rand = Math.random) {
  const clean = String(ext || '').toLowerCase().replace(/^\./, '');
  const safe = IMAGE_EXT.has(clean) ? (clean === 'jpeg' ? 'jpg' : clean) : 'jpg';
  const day = datePart(date || todayISO()).replace(/[^0-9]/g, '');
  const alphabet = '0123456789abcdef';
  let tail = '';
  for (let i = 0; i < 6; i += 1) {
    const r = Math.min(0.999999, Math.max(0, Number(rand()) || 0));
    tail += alphabet[Math.floor(r * 16)];
  }
  return `${day}-${tail}.${safe}`;
}

/** 组装 Markdown 图片语法。alt 里的方括号会截断语法，直接去掉。 */
export function imageMarkdown(url, alt = '') {
  const href = String(url || '').trim();
  if (!href) throw new Error('图片地址不能为空');
  const text = String(alt || '')
    .replace(/[[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return `![${text}](${href.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29')})`;
}

/** 从文件名猜一个可读的 alt，手机相册的 IMG_2043 之类也能用 */
export function altFromFilename(name) {
  return String(name || '')
    .replace(/\.[a-z0-9]{1,5}$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .slice(0, 60);
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

    // 二进制文件（图片）：与 putFile 的唯一区别是不做 UTF-8 编码
    async putBinary(path, bytes, message) {
      const body = { message, content: b64encodeBytes(bytes), branch };
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
    date: withOffset(String(date || nowStamp())),
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
