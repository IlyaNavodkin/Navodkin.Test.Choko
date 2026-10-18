import { z } from 'zod';
export const caseSchema = z.object({ title: z.string().trim().min(1), status: z.enum(['active', 'draft', 'deprecated']), tags: z.array(z.string()), systems: z.string(), objective: z.string(), setup: z.string(), steps: z.array(z.string().trim().min(1)).min(1), expected: z.string() });
