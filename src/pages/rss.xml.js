import { getCollection } from "astro:content";
import site from "../../site.json";

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

export async function GET(context) {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf()
  );

  const origin = context.site?.href.replace(/\/$/, "") ?? site.url;

  const items = posts
    .map((post) => {
      const url = `${origin}/${post.id}/`;
      return [
        "    <item>",
        `      <title>${xmlEscape(post.data.title)}</title>`,
        `      <link>${xmlEscape(url)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(url)}</guid>`,
        `      <pubDate>${post.data.date.toUTCString()}</pubDate>`,
        `      <description>${xmlEscape(post.data.summary ?? "")}</description>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
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
