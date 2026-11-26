import type { CollectionEntry } from "astro:content";

/**
 * 碎片的公共逻辑。
 *
 * 碎片没有 title 字段——那是它和文章最大的区别：写的时候不用先想标题。
 * 但 RSS、搜索、<title> 这些地方又必须要一个「名字」，
 * 所以统一从正文第一句里取，这个函数就是那唯一的取法。
 */

export type Note = CollectionEntry<"notes">;

/** 新的在上面。日期撞了用 id 兜底，保证每次构建顺序一致 */
export function sortNotes(list: Note[]): Note[] {
  return [...list].sort(
    (a, b) =>
      b.data.date.valueOf() - a.data.date.valueOf() ||
      a.id.localeCompare(b.id)
  );
}

/**
 * 取正文第一句当标题。
 * 中文句号、问号、感叹号都算断句；没有标点就按长度截。
 */
export function noteTitle(body: string | undefined, limit = 40): string {
  const text = (body ?? "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "（没有正文）";

  const first = (text.match(/^[^。！？!?]{1,120}/)?.[0] ?? text).trim();
  return first.length > limit ? `${first.slice(0, limit)}…` : first;
}
