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

export const collections = { blog };
