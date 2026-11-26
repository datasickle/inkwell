// 从 public/images/icon-source.jpg 生成站点需要的各种图标尺寸。
// 跑法：node tools/make-icons.mjs
// 只在换图标时手动跑一次；产物是提交进仓库的静态文件，构建时不需要 sharp。

import sharp from "sharp";
import { mkdirSync } from "node:fs";

const SRC = "public/images/icon-source.jpg";
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

/** 方形裁切 + 纯白底（原图是 JPEG，没有透明通道，深色背景下白底更像贴纸） */
function square(size) {
  return sharp(SRC).resize(size, size, { fit: "cover", position: "centre" }).flatten({ background: WHITE }).png({ compressionLevel: 9 });
}

/**
 * 小尺寸（16/32）单独取头部特写：整张图在 16px 下只剩一团白和一粒黑，
 * 裁到眼睛+嘴+腮红才认得出是个脸。大尺寸仍用整张。
 */
const FACE = { left: 150, top: 190, width: 340, height: 340 };
function face(size) {
  return sharp(SRC).extract(FACE).resize(size, size, { fit: "cover" }).flatten({ background: WHITE }).png({ compressionLevel: 9 });
}

const jobs = [
  ["public/icon-16.png", 16],
  ["public/icon-32.png", 32],
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["public/apple-touch-icon.png", 180], // iOS 会自己加圆角，别自己画圆
  ["public/images/avatar.png", 256], // 关于页的圆形头像
];

mkdirSync("public", { recursive: true });

for (const [file, size] of jobs) {
  const out = size <= 32 ? face(size) : square(size);
  await out.toFile(file);
  console.log(`${file}  ${size}×${size}${size <= 32 ? "（头部特写）" : ""}`);
}

// maskable：留出安全区，四周补白，免得被 Android 的圆形遮罩切掉脑袋
const inner = Math.round(512 * 0.78);
const pad = Math.round((512 - inner) / 2);
await sharp(SRC)
  .resize(inner, inner, { fit: "cover", position: "centre" })
  .flatten({ background: WHITE })
  .extend({ top: pad, bottom: pad, left: pad, right: pad, background: WHITE })
  .png({ compressionLevel: 9 })
  .toFile("public/icon-maskable-512.png");
console.log(`public/icon-maskable-512.png  512×512（内图 ${inner}px + 安全边距）`);
