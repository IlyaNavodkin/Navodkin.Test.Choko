import { z } from 'zod';

/** Optional `_suite.md` front matter — a friendlier display name + notes (PRD §5.3). */
export const SuiteFrontMatterSchema = z.object({
  title: z.coerce.string().optional(),
  description: z.coerce.string().optional(),
});

export type SuiteFrontMatter = z.infer<typeof SuiteFrontMatterSchema>;
