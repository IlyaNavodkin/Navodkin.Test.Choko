import { z } from 'zod';

/** Case front matter (PRD §5.2). Tolerant: invalid `status` coerces to `draft`. */
export const CaseFrontMatterSchema = z.object({
  id: z.string().optional(),
  displayId: z.coerce.string().default(''),
  title: z.coerce.string().default(''),
  slug: z.coerce.string().optional(),
  status: z.enum(['draft', 'active', 'deprecated']).catch('draft'),
  tags: z.array(z.coerce.string()).catch([]).default([]),
});

export type CaseFrontMatter = z.infer<typeof CaseFrontMatterSchema>;
