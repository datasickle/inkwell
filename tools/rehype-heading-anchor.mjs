// 给正文的 h2/h3/h4 定 id，并在标题尾部挂一个可点的 # 锚点。
//
// 为什么要自己定 id：Astro 的 rehypeHeadingIds 在我们之后跑，但只在
// 「还没有 id」时才生成 slug（见 @astrojs/markdown-remark/dist/rehype-collect-headings.js），
// 所以这里先定下来，目录（headings）拿到的 slug 和我们写的锚点必然一致。
//
// # 号本身用 CSS 的 ::after 画，节点里不留文字：否则 Astro 提取目录文字时
// 会把 # 拼进标题里。

const PUNCT_AND_SPACE = /[^\p{L}\p{N}\s_-]+/gu;

/** 生成 slug：保留中英文与数字，标点折叠成连字符，连续空白合并。 */
export function slugify(text) {
  const base = String(text)
    .trim()
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(PUNCT_AND_SPACE, ' ')
    .trim()
    .replace(/[\s_-]+/g, '-');
  return base || 'section';
}

function textOf(node) {
  let out = '';
  const walk = (n) => {
    if (n.type === 'text' || n.type === 'raw') out += n.value ?? '';
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(node);
  return out;
}

function elements(tree, fn) {
  const walk = (node) => {
    if (node.type === 'element') fn(node);
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  walk(tree);
}

export default function headingAnchor() {
  return (tree) => {
    const seen = new Map();

    elements(tree, (node) => {
      if (!/^h[234]$/.test(node.tagName ?? '')) return;

      const text = textOf(node).trim();
      if (!text) return;

      let id = typeof node.properties?.id === 'string' ? node.properties.id : slugify(text);
      const hit = seen.get(id) ?? 0;
      seen.set(id, hit + 1);
      // 同名标题按 github-slugger 的习惯加后缀：slug、slug-1、slug-2
      if (hit > 0) id = `${id}-${hit}`;

      node.properties = node.properties ?? {};
      node.properties.id = id;

      const children = node.children ?? [];
      // 已经有锚点就不重复挂（同一棵树被处理两次的情况）
      if (children.some((c) => c.type === 'element' && c.properties?.className?.includes?.('heading-anchor'))) {
        return;
      }

      children.push({
        type: 'element',
        tagName: 'a',
        properties: {
          className: ['heading-anchor'],
          href: `#${id}`,
          ariaHidden: 'true',
          tabIndex: -1,
        },
        children: [],
      });
      node.children = children;
    });
  };
}
