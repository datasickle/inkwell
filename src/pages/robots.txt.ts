import type { APIRoute } from "astro";

// 从 astro.config 的 site 取值，改 site.json 时这里自动跟着变
export const GET: APIRoute = ({ site }) => {
  const base = site?.href.replace(/\/$/, "") ?? "";
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /app/",
    "",
    `Sitemap: ${base}/sitemap-index.xml`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
