import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import fs from 'node:fs/promises';
import { firstLocalImage } from '../../lib/format';

// 每篇文章一张分享卡：拿正文里的第一张图，模糊放大做底、原图居中压在上面。
//
// 为什么不在卡上画标题：这台构建机是 Linux（Cloudflare Pages），系统里没有中文字体，
// 用到的字体文件都得从仓库里带，十几 MB 不值当。已有的那张全站 og.png 同样是在本地
// 用 Windows 字体生成的，见 tools/make-og.py。没有配图的文章继续用那张全站卡。

const W = 1200;
const H = 630;
const PAD = 64;

export async function getStaticPaths() {
  const posts = await getCollection('blog', ({ data }) => !data.draft);
  return posts
    .filter((post) => firstLocalImage(post.body))
    .map((post) => ({ params: { id: post.id }, props: { post } }));
}

export const GET: APIRoute = async ({ props }) => {
  const { post } = props as { post: { body?: string } };
  const src = firstLocalImage(post.body);
  if (!src) return new Response('Not Found', { status: 404 });

  const file = new URL(`../../../public${src}`, import.meta.url);
  const buf = await fs.readFile(file);

  const sharp = (await import('sharp')).default;

  const bg = await sharp(buf)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .blur(28)
    .modulate({ brightness: 0.75 })
    .png()
    .toBuffer();

  const fg = await sharp(buf)
    .resize(W - PAD * 2, H - PAD * 2, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  const fgMeta = await sharp(fg).metadata();
  const left = Math.round((W - (fgMeta.width ?? W)) / 2);
  const top = Math.round((H - (fgMeta.height ?? H)) / 2);

  const png = await sharp(bg)
    .composite([{ input: fg, left, top }])
    .png({ compressionLevel: 9 })
    .toBuffer();

  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
};
