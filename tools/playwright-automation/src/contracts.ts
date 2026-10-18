import { z } from 'zod';

export const LIMITS = Object.freeze({ reportBytes: 16 * 1024 * 1024, tests: 10_000, attempts: 100, logBytes: 1024 * 1024, attachments: 100, attachmentBytes: 25 * 1024 * 1024, artifactBytes: 100 * 1024 * 1024, runtimeMs: 30 * 60_000, discoveryMs: 60_000, pollBytes: 256 * 1024 });
export const IdSchema = z.string().min(1).max(256).regex(/^[^\x00-\x1f\x7f]+$/u);
export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const RelativePathSchema = z.string().min(1).max(1024).refine(p => !/[\x00-\x1f\x7f\\:]/u.test(p) && !p.startsWith('/') && p.split('/').every(v => v !== '..' && v !== '.' && v !== ''), 'Expected safe relative path');
export const DateSchema = z.string().datetime();
export const KeySchema = z.object({ caseId: IdSchema, automationId: IdSchema, project: IdSchema, variantId: IdSchema }).strict();
export type StableKey = z.infer<typeof KeySchema>;
export const stableKey = (key: StableKey): string => JSON.stringify([key.caseId, key.automationId, key.project, key.variantId]);
export const ProfileSchema = z.object({ schemaVersion: z.literal(1), profileId: IdSchema, label: z.string().min(1).max(200), cwd: z.union([z.literal('.'), RelativePathSchema]), config: RelativePathSchema, projects: z.array(IdSchema).min(1).max(100).refine(v => new Set(v).size === v.length), timeoutMs: z.number().int().min(1).max(LIMITS.runtimeMs), retries: z.number().int().min(0).max(10), workers: z.number().int().min(1).max(32) }).strict();
export type AutomationProfile = z.infer<typeof ProfileSchema>;
export const BindingSchema = KeySchema.extend({ profileId: IdSchema }).strict();
export const SourceSchema = z.object({ commit: z.string().regex(/^[a-f0-9]{40,64}$/).nullable(), branch: z.string().max(1024).nullable(), dirty: z.boolean() }).strict();
export const correlation = { schemaVersion: z.literal(1), runId: RelativePathSchema, executionId: z.string().uuid(), parentExecutionId: z.string().uuid().nullable(), profileId: IdSchema, profileRevision: HashSchema, catalogRevision: HashSchema.nullable(), createdAt: DateSchema, source: SourceSchema, selection: z.array(KeySchema).max(LIMITS.tests) };
const uniqueSelection = (v: { selection: StableKey[] }) => new Set(v.selection.map(stableKey)).size === v.selection.length;
export const ManifestSchema = z.object({ ...correlation, operation: z.enum(['discover', 'run']), profile: ProfileSchema, outputRoot: z.string().min(1).max(4096) }).strict().superRefine((v, ctx) => {
  if (!uniqueSelection(v) || v.profileId !== v.profile.profileId || v.parentExecutionId === v.executionId || v.selection.some(k => !v.profile.projects.includes(k.project)) || (v.operation === 'run' && (!v.catalogRevision || !v.selection.length)) || (v.operation === 'discover' && v.selection.length !== 0)) ctx.addIssue({ code: 'custom', message: 'Invalid selection/correlation' });
});
export type Manifest = z.infer<typeof ManifestSchema>;
export const StatusSchema = z.enum(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']);
export const ExpectedStatusSchema = z.enum(['passed', 'failed', 'skipped']);
export const OutcomeSchema = z.enum(['expected', 'unexpected', 'flaky', 'skipped', 'interrupted']);
export type Outcome = z.infer<typeof OutcomeSchema>;
export const ErrorSchema = z.object({ message: z.string().max(16_384), stack: z.string().max(32_768).nullable() }).strict();
export const AttachmentSchema = z.object({ id: z.string().uuid(), name: z.string().max(256), contentType: z.string().max(100), path: RelativePathSchema.nullable(), size: z.number().int().min(0).max(LIMITS.attachmentBytes), unavailableReason: z.string().max(256).nullable() }).strict().refine(v => v.path !== null || v.unavailableReason !== null, 'Unavailable attachment needs reason');
export const AttemptSchema = z.object({ retry: z.number().int().min(0).max(99), repeatEachIndex: z.number().int().min(0).max(99), status: StatusSchema, startedAt: DateSchema.nullable(), durationMs: z.number().finite().min(0), errors: z.array(ErrorSchema).max(100), stdout: z.string().max(LIMITS.logBytes), stderr: z.string().max(LIMITS.logBytes), attachments: z.array(z.string().uuid()).max(LIMITS.attachments) }).strict();
export type Attempt = z.infer<typeof AttemptSchema>;
export function outcomeOf(expectedStatus: z.infer<typeof ExpectedStatusSchema>, attempts: Attempt[]): Outcome {
  if (!attempts.length || attempts.some(a => a.status === 'interrupted')) return 'interrupted';
  if (attempts.every(a => a.status === 'skipped')) return 'skipped';
  const repeats = new Map<number, Attempt[]>();
  for (const a of attempts) repeats.set(a.repeatEachIndex, [...(repeats.get(a.repeatEachIndex) ?? []), a]);
  let flaky = false;
  for (const group of repeats.values()) {
    const sorted = [...group].sort((a, b) => a.retry - b.retry);
    if (sorted.at(-1)!.status !== expectedStatus) return 'unexpected';
    if (sorted.some(a => a.status !== expectedStatus && a.status !== 'skipped')) flaky = true;
  }
  return flaky ? 'flaky' : 'expected';
}
export const TestRecordSchema = KeySchema.extend({ title: z.string().max(4096), file: z.string().max(1024), expectedStatus: ExpectedStatusSchema, outcome: OutcomeSchema, attempts: z.array(AttemptSchema).max(LIMITS.attempts) }).strict().superRefine((v, ctx) => {
  if (v.outcome !== outcomeOf(v.expectedStatus, v.attempts) || new Set(v.attempts.map(a => `${a.repeatEachIndex}:${a.retry}`)).size !== v.attempts.length) ctx.addIssue({ code: 'custom', message: 'Invalid outcome or duplicate attempt' });
});
export type TestRecord = z.infer<typeof TestRecordSchema>;
export const ReportSchema = z.object({ ...correlation, state: z.enum(['completed', 'runner_error', 'interrupted', 'timed_out']), reason: z.string().max(4096).nullable(), startedAt: DateSchema, finishedAt: DateSchema, complete: z.literal(true), tests: z.array(TestRecordSchema).max(LIMITS.tests), runnerErrors: z.array(ErrorSchema).max(100), logs: z.object({ stdout: z.string().max(LIMITS.logBytes), stderr: z.string().max(LIMITS.logBytes), truncated: z.boolean() }).strict(), attachments: z.array(AttachmentSchema).max(LIMITS.attachments) }).strict().superRefine((v, ctx) => {
  const ids = new Set(v.attachments.map(a => a.id));
  const selected = new Set(v.selection.map(stableKey));
  let logBytes = new TextEncoder().encode(v.logs.stdout + v.logs.stderr).length;
  for (const t of v.tests) for (const a of t.attempts) { logBytes += new TextEncoder().encode(a.stdout + a.stderr).length; if (a.attachments.some(id => !ids.has(id))) ctx.addIssue({ code: 'custom', message: 'Unknown attachment reference' }); }
  if (logBytes > LIMITS.logBytes || v.attachments.reduce((n, a) => n + a.size, 0) > LIMITS.artifactBytes || ids.size !== v.attachments.length || !uniqueSelection(v) || new Set(v.tests.map(stableKey)).size !== v.tests.length || v.tests.some(t => !selected.has(stableKey(t))) || (v.state === 'completed' && (v.runnerErrors.length > 0 || v.tests.length !== v.selection.length || v.tests.some(t => !t.attempts.length || t.outcome === 'interrupted')))) ctx.addIssue({ code: 'custom', message: 'Report limits/completeness/selection violation' });
});
export type AutomationReport = z.infer<typeof ReportSchema>;
export const CatalogTestSchema = KeySchema.extend({ title: z.string().max(4096), file: z.string().max(1024), expectedStatus: ExpectedStatusSchema }).strict();
export const CatalogSchema = z.object({ schemaVersion: z.literal(1), executionId: z.string().uuid(), profileId: IdSchema, profileRevision: HashSchema, catalogRevision: HashSchema, tests: z.array(CatalogTestSchema).max(LIMITS.tests), dependencies: z.array(z.string()).max(100) }).strict().refine(v => new Set(v.tests.map(stableKey)).size === v.tests.length, 'Duplicate catalog identity');
export type Catalog = z.infer<typeof CatalogSchema>;
export function parseReport(input: unknown, manifest?: Manifest): AutomationReport {
  const report = ReportSchema.parse(input);
  if (manifest) for (const field of Object.keys(correlation) as (keyof typeof correlation)[]) if (JSON.stringify(report[field]) !== JSON.stringify(manifest[field])) throw new Error(`INVALID_REPORT: correlation ${field}`);
  return report;
}

