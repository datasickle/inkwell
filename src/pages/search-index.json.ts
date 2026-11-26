import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { excerptOf } from "../lib/format";
import { sortNotes, noteTitle } from "../lib/notes";

// 构建时生成一份纯文本索引，前端搜索页拉取后在本地过滤。
// 不走 Pagefind 的原因：它对中文按字切分，召回噪声大；中文直接子串匹配更准。
export const GET: APIRoute = async () => {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(
    (a, b) =>
    b.data.date.valueOf() - a.data.date.valueOf() || a.id.localeCompare(b.id)
  );

  const notes = sortNotes(
    await getCollection("notes", ({ data }) => !data.draft)
  );

  const plain = (body: string | undefined) =>
    (body ?? "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[#>*_`~|]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 2000);

  const items = posts.map((post) => ({
    type: "post",
    id: post.id,
    href: `/${post.id}/`,
    title: post.data.title,
    date: post.data.date.getTime(),
    tags: post.data.tags,
    summary: post.data.summary || excerptOf(post.body, 160),
    text: plain(post.body),
  }));

  // 碎片没有标题：用正文第一句顶上，href 单独给，前端不用拼路径
  const noteItems = notes.map((note) => ({
    type: "note",
    id: note.id,
    href: `/notes/${note.id}/`,
    title: noteTitle(note.body, 40),
    date: note.data.date.getTime(),
    tags: note.data.tags,
    summary: excerptOf(note.body, 160),
    text: plain(note.body),
  }));

  const all = [...items, ...noteItems].sort((a, b) => b.date - a.date);

  return new Response(JSON.stringify(all), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
};
