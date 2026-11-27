// 分享卡片：在浏览器里用 canvas 画一张竖版图，给「链接点不开」的地方用（微信、朋友圈等）。
//
// 为什么放客户端：构建机没有中文字体，服务端画中文得把字体文件塞进仓库；
// 浏览器自带系统中文字体，随用随画，也不拖慢构建。
//
// @ts-expect-error uqr 是纯 JS 的 ESM 包，没有类型声明
import { encode } from "./vendor/uqr.mjs";

const FONT = `"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", system-ui, -apple-system, sans-serif`;

const BG = "#fafafa";
const INK = "#1b1b1b";
const MUTED = "#6f6f6f";
const FAINT = "#9a9a9a";
const LINE = "#e4e4e4";
const ACCENT = "#9c4a2f";

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;

export interface ShareCardData {
  title: string;
  summary: string;
  date: string;
  tags: string[];
  url: string;
  site: string;
  author: string;
  domain: string;
  image?: string | null;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/**
 * 按像素宽度折行。中文按字断行，英文/数字尽量不拆词。
 * 折到 maxLines 还没完就截断并补「…」。
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  const lines: string[] = [];
  let line = "";

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    if (ctx.measureText(line + ch).width <= maxWidth || line === "") {
      line += ch;
      continue;
    }

    // 正在排英文/数字，且这一行里有空格：退到空格处换行，别把单词劈开
    if (/[A-Za-z0-9]/.test(ch) && /[A-Za-z0-9]$/.test(line)) {
      const space = line.lastIndexOf(" ");
      if (space > 0 && line.length - space <= 20) {
        const carry = line.slice(space + 1);
        lines.push(line.slice(0, space));
        line = carry + ch;
        if (lines.length === maxLines) break;
        continue;
      }
    }

    lines.push(line.replace(/\s+$/, ""));
    line = ch === " " ? "" : ch;
    if (lines.length === maxLines) break;
  }

  if (line.trim()) {
    if (lines.length >= maxLines) {
      // 还有内容没排下，最后一行收尾加省略号
      let last = lines[maxLines - 1] ?? "";
      while (last && ctx.measureText(last + "…").width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = last.replace(/[\s，。、,.]+$/, "") + "…";
    } else {
      lines.push(line.trim());
    }
  }

  return lines;
}

function drawQr(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number
) {
  // 白底卡片，让二维码在深色信息流里也能扫
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, x, y, size, size, 24);
  ctx.fill();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.stroke();

  const qr = encode(text, { ecc: "M", border: 2 });
  const pad = 20;
  const inner = size - pad * 2;
  const cell = inner / qr.size;
  // 取整并向上取一格，避免半像素边导致二维码发虚
  const step = Math.max(1, Math.floor(cell * 2) / 2);

  ctx.fillStyle = "#111111";
  for (let row = 0; row < qr.size; row += 1) {
    for (let col = 0; col < qr.size; col += 1) {
      if (!qr.data[row][col]) continue;
      const mx = x + pad + (inner - step * qr.size) / 2 + col * step;
      const my = y + pad + (inner - step * qr.size) / 2 + row * step;
      ctx.fillRect(mx, my, step + 0.3, step + 0.3);
    }
  }
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number
) {
  // 整张塞进去而不是裁切：文章里的图多是截图/示意图，裁掉一半反而看不懂
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;

  ctx.save();
  roundRect(ctx, dx, dy, dw, dh, radius);
  ctx.clip();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(dx, dy, dw, dh);
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();

  // 浅色截图和浅色底会糊在一起，补一道描边
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  roundRect(ctx, dx + 0.5, dy + 0.5, dw - 1, dh - 1, radius);
  ctx.stroke();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(null), 3500);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

export async function createShareCard(data: ShareCardData): Promise<HTMLCanvasElement> {
  const dpr = 2;
  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH * dpr;
  canvas.height = CARD_HEIGHT * dpr;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("这个浏览器不支持 canvas");
  ctx.scale(dpr, dpr);
  ctx.textBaseline = "top";

  const PAD = 88;
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;

  // 背景
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // 页眉：站名 + 域名
  ctx.fillStyle = INK;
  ctx.font = `600 30px ${FONT}`;
  ctx.fillText(data.site, PAD, 88);

  ctx.fillStyle = FAINT;
  ctx.font = `400 22px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(data.domain, W - PAD, 94);
  ctx.textAlign = "left";

  // 细分隔线
  ctx.fillStyle = LINE;
  ctx.fillRect(PAD, 146, W - PAD * 2, 1);

  // 标题上方的强调短线
  ctx.fillStyle = ACCENT;
  ctx.fillRect(PAD, 208, 56, 6);

  // 标题
  // 没有配图的卡片内容更少，字号放大一档，免得中间空一大块
  const hasImage = Boolean(data.image);
  const tagTop = H - PAD - 190;
  const titleTop = 250;
  ctx.fillStyle = INK;
  ctx.font = `700 ${hasImage ? 60 : 72}px ${FONT}`;
  const titleLines = wrapText(ctx, data.title, W - PAD * 2, 3);
  const titleLineHeight = hasImage ? 84 : 100;

  // 摘要
  const summaryLineHeight = hasImage ? 52 : 60;
  ctx.font = `400 ${hasImage ? 30 : 34}px ${FONT}`;
  const summaryLines = data.summary ? wrapText(ctx, data.summary, W - PAD * 2, hasImage ? 5 : 7) : [];

  // 短文（尤其是碎片）整块内容很少，贴着顶部会显得头重脚轻，
  // 就把「标题 + 摘要」整块在可用高度里往下挪一点
  const blockHeight =
    titleLines.length * titleLineHeight + 40 + summaryLines.length * summaryLineHeight;
  const available = tagTop - titleTop - 60;
  const shift = hasImage ? 0 : Math.max(0, Math.min((available - blockHeight) / 2, 260));

  ctx.fillStyle = INK;
  ctx.font = `700 ${hasImage ? 60 : 72}px ${FONT}`;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, PAD, titleTop + shift + i * titleLineHeight);
  });

  const summaryTop = titleTop + shift + titleLines.length * titleLineHeight + 40;
  ctx.fillStyle = MUTED;
  ctx.font = `400 ${hasImage ? 30 : 34}px ${FONT}`;
  summaryLines.forEach((line, i) => {
    ctx.fillText(line, PAD, summaryTop + i * summaryLineHeight);
  });

  // 正文里有站内首图就垫一张，把中间的空白填掉；没有就留白
  const imageTop = summaryTop + summaryLines.length * summaryLineHeight + 44;
  const imageBottom = H - PAD - 300;
  if (data.image && imageBottom - imageTop >= 220) {
    const img = await loadImage(data.image);
    if (img) {
      // 图放在整条空白带的中间，上下留白均匀
      const boxHeight = Math.min(560, imageBottom - imageTop);
      const bandTop = imageTop + ((imageBottom - imageTop) - boxHeight) / 2;
      drawContain(ctx, img, PAD, bandTop, W - PAD * 2, boxHeight, 12);
    }
  }

  // 底部：左边标签/日期/作者，右边二维码
  const qrSize = 236;
  const qrX = W - PAD - qrSize;
  const qrY = H - PAD - qrSize - 34;
  drawQr(ctx, data.url, qrX, qrY, qrSize);

  ctx.fillStyle = FAINT;
  ctx.font = `400 22px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("扫码阅读全文", qrX + qrSize / 2, qrY + qrSize + 8);
  ctx.textAlign = "left";

  // 标签胶囊
  ctx.font = `400 22px ${FONT}`;
  let tagX = PAD;
  for (const tag of data.tags.slice(0, 4)) {
    const textWidth = ctx.measureText(tag).width;
    const pillWidth = textWidth + 36;
    if (tagX + pillWidth > qrX - 40) break;
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1;
    roundRect(ctx, tagX, tagTop, pillWidth, 46, 23);
    ctx.stroke();
    ctx.fillStyle = MUTED;
    ctx.fillText(tag, tagX + 18, tagTop + 12);
    tagX += pillWidth + 12;
  }

  // 日期 + 作者
  ctx.fillStyle = MUTED;
  ctx.font = `400 26px ${FONT}`;
  ctx.fillText(data.date, PAD, H - PAD - 120);

  ctx.fillStyle = FAINT;
  ctx.font = `400 22px ${FONT}`;
  ctx.fillText(`${data.author} · 内容 CC BY-NC-SA 4.0`, PAD, H - PAD - 76);

  return canvas;
}

export function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("生成图片失败"));
    }, "image/png");
  });
}

/** 文件名里去掉路径与非法字符，中文保留 */
export function cardFileName(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|\n\r]+/g, " ").replace(/\s+/g, " ").trim();
  return `${safe || "share"}-分享卡.png`;
}
