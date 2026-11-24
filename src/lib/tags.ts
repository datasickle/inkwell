import type { CollectionEntry } from "astro:content";

export type TagGroup = {
  tag: string;
  posts: CollectionEntry<"blog">[];
  anchor: string;
};

/**
 * 标签分组与锚点。
 * tags 页和文章页共用同一份排序，锚点才对得上 —— 不要在两处各写一遍。
 */
export function groupByTag(posts: CollectionEntry<"blog">[]) {
  const map = new Map<string, CollectionEntry<"blog">[]>();
  for (const post of posts) {
    for (const tag of post.data.tags) {
      const list = map.get(tag);
      if (list) list.push(post);
      else map.set(tag, [post]);
    }
  }

  const groups: TagGroup[] = [...map.entries()]
    .sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "zh-Hans-CN")
    )
    .map(([tag, list], i) => ({ tag, posts: list, anchor: `tag-${i}` }));

  const anchorOf: Record<string, string> = {};
  for (const g of groups) anchorOf[g.tag] = g.anchor;

  return { groups, anchorOf };
}
