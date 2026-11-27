import { fmtDate, fmtMonthDay } from "./datetime";

// 这两个都按东八区折算，别改成 date.getMonth()：
// 构建机在 UTC，凌晨发布会被算成前一天
export function formatDate(date: Date): string {
  return fmtDate(date);
}

export function formatDay(date: Date): string {
  return fmtMonthDay(date);
}

export function readingTime(body: string | undefined): number {
  const text = body ?? "";
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  const latin = (text.replace(/[\u4e00-\u9fa5]/g, " ").match(/[A-Za-z0-9]+/g) ?? []).length;
  return Math.max(1, Math.round(cjk / 400 + latin / 220));
}

export function excerptOf(body: string | undefined, limit = 110): string {
  const plain = (body ?? "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[#>*\-+]+\s*/gm, "")
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > limit ? `${plain.slice(0, limit)}…` : plain;
}

/**
 * 正文里第一张站内图片的地址（`/images/x.png`）。外链图不算：
 * 分享卡要读本地文件裁切，外链读不到。
 */
export function firstLocalImage(body: string | undefined): string | null {
  const re = /!\[[^\]]*\]\(([^)\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body ?? ""))) {
    if (m[1].startsWith("/")) return m[1];
  }
  return null;
}
