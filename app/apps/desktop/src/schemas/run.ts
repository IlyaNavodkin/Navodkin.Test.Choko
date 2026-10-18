import { z } from 'zod';

/** Tri-state checklist mark in a per-case run sidecar (`[ ]`/`[x]`/`[-]`). */
export const CheckStateSchema = z.enum(['none', 'pass', 'fail']).catch('none');

/** A run approval (tester or reviewer): who, and when. Absent → `null`. */
export const ApprovalSchema = z
  .object({
    name: z.coerce.string().default(''),
    at: z.coerce.string().default(''),
  })
  .nullable();

/** Run-details sidecar (`<run>/_run.md`) front matter. Tolerant: bad values coerce. */
export const RunDetailsFrontSchema = z.object({
  name: z.coerce.string().optional(),
  status: z.enum(['open', 'closed']).catch('open'),
  created: z.coerce.string().default(''),
  scope: z.coerce.string().default(''),
  /** The run's default test date (ISO) for `{{today}}` resolution. */
  test_date: z.coerce.string().default(''),
  tester_approval: ApprovalSchema.catch(null).default(null),
  reviewer_approval: ApprovalSchema.catch(null).default(null),
});

export type RunDetailsFront = z.infer<typeof RunDetailsFrontSchema>;

/** Per-case run sidecar (`<run>/NNN-<id>.md`) front matter. */
export const RunCaseFrontSchema = z.object({
  case_id: z.coerce.string().default(''),
  display_id: z.coerce.string().default(''),
  title: z.coerce.string().default(''),
  result: z.enum(['not_run', 'pass', 'fail', 'blocked', 'in_progress', 'skipped']).catch('not_run'),
  tester: z.coerce.string().default(''),
  executed_at: z.coerce.string().default(''),
  /** Per-case test-date override (ISO); absent/null = inherit the run's. */
  test_date: z.coerce.string().nullish(),
});

export type RunCaseFront = z.infer<typeof RunCaseFrontSchema>;
