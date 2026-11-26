import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import site from "../../../site.json";
import { excerptOf } from "../../lib/format";
import { sortNotes, noteTitle } from "../../lib/notes";

/**
 * 碎片单独的 feed。
 *
 * 刻意不并进主 /rss.xml：订阅你文章的人，不该被一天三条的短内容刷屏。
 * 想追碎片的人自己订这一个。
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function xmlEscape(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

async function bodyHtml(note: { rendered?: { html?: string }; body?: string }) {
  const ready = note.rendered?.html;
  if (typeof ready === "string" && ready.trim()) return ready;
  try {
    const { createMarkdownProcessor } = await import("@astrojs/markdown-remark");
    const processor = await createMarkdownProcessor({});
    const result = await processor.render(note.body ?? "");
    return result.code ?? "";
  } catch {
    return "";
  }
}

function absolutize(html: string, origin: string): string {
  return html
    .replace(/\s+srcset="[^"]*"/g, "")
    .replace(/(src|href)="\/(?!\/)/g, `$1="${origin}/`);
}

export const GET: APIRoute = async (context) => {
  const notes = sortNotes(
    await getCollection("notes", ({ data }) => !data.draft)
  );
  const origin = context.site?.href.replace(/\/$/, "") ?? site.url;

  const items = (
    await Promise.all(
      notes.map(async (note) => {
        const url = `${origin}/notes/${note.id}/`;
        const html = absolutize(await bodyHtml(note), origin);
        const cdata = html.split("]]>").join("]]]]><![CDATA[>");

        return [
          "    <item>",
          `      <title>${xmlEscape(noteTitle(note.body, 60))}</title>`,
          `      <link>${xmlEscape(url)}</link>`,
          `      <guid isPermaLink="true">${xmlEscape(url)}</guid>`,
          `      <pubDate>${note.data.date.toUTCString()}</pubDate>`,
          `      <dc:creator>${xmlEscape(site.author)}</dc:creator>`,
          `      <description>${xmlEscape(excerptOf(note.body, 200))}</description>`,
          cdata.trim()
            ? `      <content:encoded><![CDATA[${cdata}]]></content:encoded>`
            : "",
          "    </item>",
        ]
          .filter(Boolean)
          .join("\n");
      })
    )
  ).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${xmlEscape(`${site.title} · ${site.notesLabel}`)}</title>
    <link>${xmlEscape(`${origin}/notes/`)}</link>
    <description>${xmlEscape(site.description)}</description>
    <language>zh-Hans</language>
    <atom:link href="${xmlEscape(`${origin}/notes/rss.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
};
