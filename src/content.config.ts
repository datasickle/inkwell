import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    tags: z.preprocess(
      (value) =>
        value == null || value === ''
          ? []
          : typeof value === 'string'
            ? value.split(/[,，、\s]+/).filter(Boolean)
            : value,
      z.array(z.string())
    ),
    draft: z.preprocess(
      (value) => value === true || String(value) === 'true',
      z.boolean()
    ),
    summary: z.string().optional(),
  }),
});

/**
 * 碎片：不成篇的短东西。
 *
 * 和 blog 的差别是刻意的——没有 title、没有 summary、不参与归档页的「共 N 篇」，
 * 也不混进主 RSS。它要的就是「打开就能写」：写个 date，然后直接写正文。
 */
const notes = defineCollection({
  loader: glob({ base: './src/content/notes', pattern: '**/*.md' }),
  schema: z.object({
    date: z.coerce.date(),
    tags: z.preprocess(
      (value) =>
        value == null || value === ''
          ? []
          : typeof value === 'string'
            ? value.split(/[,，、\s]+/).filter(Boolean)
            : value,
      z.array(z.string())
    ),
    draft: z.preprocess(
      (value) => value === true || String(value) === 'true',
      z.boolean()
    ),
  }),
});

export const collections = { blog, notes };
