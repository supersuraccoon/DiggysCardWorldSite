import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 开发日志：src/content/devlog/*.md，一篇一个文件
const devlog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/devlog' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    cover: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});
export const collections = { devlog };
