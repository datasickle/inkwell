import { getCollection } from "astro:content";
import site from "../../site.json";
import { excerptOf } from "../lib/format";

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function xmlEscape(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

/**
 * 取正文 HTML 给 content:encoded。
 * 优先用 Astro 已经渲染好的结果（跟页面上的完全一致）；
 * 万一取不到（渲染顺序原因），退回到自己跑一遍 markdown 处理器。
 */
async function bodyHtml(post) {
  const ready = post.rendered?.html;
  if (typeof ready === "string" && ready.trim()) return ready;

  try {
    const { createMarkdownProcessor } = await import("@astrojs/markdown-remark");
    const processor = await createMarkdownProcessor({});
    const result = await processor.render(post.body ?? "");
    return result.code ?? "";
  } catch {
    return "";
  }
}

/** 站内相对地址在阅读器里打不开，统一补成绝对地址。 */
function absolutize(html, origin) {
  return html
    .replace(/\s+srcset="[^"]*"/g, "")
    .replace(/(src|href)="\/(?!\/)/g, `$1="${origin}/`);
}

export async function GET(context) {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(
    (a, b) =>
      b.data.date.valueOf() - a.data.date.valueOf() || a.id.localeCompare(b.id)
  );

  const origin = context.site?.href.replace(/\/$/, "") ?? site.url;

  const items = (
    await Promise.all(
      posts.map(async (post) => {
        const url = `${origin}/${post.id}/`;
        const html = absolutize(await bodyHtml(post), origin);
        const cdata = html.split("]]>").join("]]]]><![CDATA[>");

        return [
          "    <item>",
          `      <title>${xmlEscape(post.data.title)}</title>`,
          `      <link>${xmlEscape(url)}</link>`,
          `      <guid isPermaLink="true">${xmlEscape(url)}</guid>`,
          `      <pubDate>${post.data.date.toUTCString()}</pubDate>`,
          // 作者名：RSS 2.0 的 <author> 必须是「邮箱 (名字)」，没邮箱就别硬编；
          // dc:creator 就是纯名字，Feedly / Inoreader / NetNewsWire 都认这个
          `      <dc:creator>${xmlEscape(site.author)}</dc:creator>`,
          `      <description>${xmlEscape(
            // 没写 summary 就用正文前 200 字，别让描述长到把列表撑爆
            post.data.summary || excerptOf(post.body, 200)
          )}</description>`,
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
    <title>${xmlEscape(site.title)}</title>
    <link>${xmlEscape(origin)}</link>
    <description>${xmlEscape(site.description)}</description>
    <language>zh-Hans</language>
    <atom:link href="${xmlEscape(`${origin}/rss.xml`)}" rel="self" type="application/rss+xml" />
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
