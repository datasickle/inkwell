// 读构建期生成的图片清单（.astro/images-manifest.json）。
// 只给「首图预加载」用：rehype 已经改写了正文里的 <img>，但 <head> 需要同一份
// srcset 才能提前取图，否则浏览器要等解析到 <img> 才知道下什么。

import fs from "node:fs";
import path from "node:path";

export type ImageSource = { w: number; h: number; src: string };
export type ImageEntry = { width: number; height: number; sources: ImageSource[] };

let cache: Record<string, ImageEntry> | null = null;

function manifest(): Record<string, ImageEntry> {
  if (cache) return cache;
  try {
    const file = path.resolve(process.cwd(), ".astro", "images-manifest.json");
    cache = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, ImageEntry>;
  } catch {
    cache = {};
  }
  return cache;
}

/** 正文第一张站内图对应的预加载信息；没有就返回 null。 */
export function heroImage(src: string | null): { src: string; srcSet: string; sizes: string } | null {
  if (!src) return null;
  const hit = manifest()[src];
  if (!hit || !hit.sources.length) return null;
  const largest = hit.sources[hit.sources.length - 1];
  return {
    src: largest.src,
    srcSet: hit.sources.map((s) => `${s.src} ${s.w}w`).join(", "),
    sizes: "(max-width: 720px) 100vw, 720px",
  };
}
