import { z } from 'zod';

export const resultSchema = z.enum(['not_run', 'in_progress', 'pass', 'fail', 'blocked', 'skipped']);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});
const summarySchema = z.object({ counts: z.object({ not_run: z.number().int().nonnegative(), in_progress: z.number().int().nonnegative(), pass: z.number().int().nonnegative(), fail: z.number().int().nonnegative(), blocked: z.number().int().nonnegative(), skipped: z.number().int().nonnegative() }), total: z.number().int().nonnegative(), passRate: z.number().min(0).max(1).nullable() });
const caseSchema = z.object({ id: z.string(), displayId: z.string(), title: z.string(), suite: z.string(), status: z.enum(['active', 'draft', 'deprecated']), tags: z.array(z.string()), systems: z.string().optional(), filename: z.string().optional(), objective: z.string(), setup: z.string(), steps: z.array(z.string()), expected: z.string(), result: resultSchema, tester: z.string(), checks: z.array(z.enum(['none', 'pass', 'fail'])), notes: z.string().optional(), failNotes: z.array(z.string()).optional() });
export const reportSchema = z.object({
  schemaVersion: z.literal(1), kind: z.enum(['run', 'weekly']), origin: z.enum(['demo', 'repository']), generatedAt: z.string().datetime(), repoName: z.string(),
  period: z.object({ start: dateSchema, end: dateSchema }), options: z.object({ includeNotes: z.boolean() }),
  runs: z.array(z.object({ id: z.string(), name: z.string(), date: dateSchema, closed: z.boolean(), summary: z.string(), notes: z.string().optional(), cases: z.array(caseSchema), totals: summarySchema })),
  summary: summarySchema, suites: z.array(z.object({ name: z.string(), summary: summarySchema })),
  matrix: z.array(z.object({ caseId: z.string(), displayId: z.string(), title: z.string(), results: z.array(z.object({ runId: z.string(), result: resultSchema.nullable() })) })),
});
