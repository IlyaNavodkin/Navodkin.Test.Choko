import { z } from 'zod';
import {
  ARGUMENT_LIMITS, ArgumentKeySchema, ArgumentValueSchema, ArgumentValuesSchema, AutotestSchema,
  CaseAutotestBindingSchema, EnvironmentEntrySchema, EnvironmentValuesSchema, RevisionSchema,
} from './catalog';
import {
  AttemptSchema, AttachmentSchema, CatalogTestSchema, DateSchema, ErrorSchema, ExpectedStatusSchema,
  HashSchema, IdSchema, KeySchema, LIMITS, OutcomeSchema, ProfileSchema, RelativePathSchema,
  SourceSchema, outcomeOf, stableKey,
} from './contracts';

// Version 2: invocation-снимки, manifest и report с аргументами и окружениями.
// Отдельный модуль, потому что catalog.ts зависит от contracts.ts и обратный импорт даёт цикл.
const correlation = {
  schemaVersion: z.literal(2), runId: RelativePathSchema, executionId: z.string().uuid(), parentExecutionId: z.string().uuid().nullable(),
  profileId: IdSchema, profileRevision: HashSchema, catalogRevision: HashSchema.nullable(), createdAt: DateSchema, source: SourceSchema,
};
export const ArgumentSourceSchema = z.object({ key: ArgumentKeySchema, layer: z.enum(['schema', 'autotest', 'binding', 'run']), reference: ArgumentValueSchema.nullable(), revision: RevisionSchema.nullable() }).strict();
export const RunnerInvocationSchema = z.object({
  schemaVersion: z.literal(2), invocationId: z.string().uuid(), createdAt: z.string().datetime(), caseRevision: RevisionSchema,
  autotest: AutotestSchema, binding: CaseAutotestBindingSchema, runOverrides: ArgumentValuesSchema,
  environments: z.array(EnvironmentEntrySchema).max(100), resolvedArguments: EnvironmentValuesSchema, sources: z.array(ArgumentSourceSchema).max(ARGUMENT_LIMITS.count),
}).strict();
export const ManifestV2Schema = z.object({
  ...correlation, invocations: z.array(RunnerInvocationSchema).max(LIMITS.tests), operation: z.enum(['discover', 'run']), profile: ProfileSchema,
  outputRoot: z.string().min(1).max(4096), sourceKind: z.enum(['run', 'import']).optional(),
}).strict();
export const InvocationTestSchema = KeySchema.extend({ invocationId: z.string().uuid(), title: z.string().max(4096), file: z.string().max(1024), expectedStatus: ExpectedStatusSchema, outcome: OutcomeSchema, attempts: z.array(AttemptSchema).max(LIMITS.attempts) }).strict().superRefine((v, ctx) => {
  if (v.outcome !== outcomeOf(v.expectedStatus, v.attempts) || new Set(v.attempts.map(a => `${a.repeatEachIndex}:${a.retry}`)).size !== v.attempts.length) ctx.addIssue({ code: 'custom', message: 'Invalid outcome or duplicate attempt' });
});
export const ReportV2Schema = z.object({
  ...correlation, state: z.enum(['completed', 'runner_error', 'interrupted', 'timed_out']), reason: z.string().max(4096).nullable(),
  startedAt: DateSchema, finishedAt: DateSchema, complete: z.literal(true), tests: z.array(InvocationTestSchema).max(LIMITS.tests),
  runnerErrors: z.array(ErrorSchema).max(100), logs: z.object({ stdout: z.string().max(LIMITS.logBytes), stderr: z.string().max(LIMITS.logBytes), truncated: z.boolean() }).strict(),
  attachments: z.array(AttachmentSchema).max(LIMITS.attachments),
}).strict().superRefine((v, ctx) => {
  const ids = new Set(v.attachments.map(a => a.id));
  if (new Set(v.tests.map(t => t.invocationId)).size !== v.tests.length) ctx.addIssue({ code: 'custom', message: 'Duplicate invocation' });
  for (const t of v.tests) for (const a of t.attempts) if (a.attachments.some(id => !ids.has(id))) ctx.addIssue({ code: 'custom', message: 'Unknown attachment reference' });
});
export const DiscoveryV2Schema = z.object({
  schemaVersion: z.literal(2), executionId: z.string().uuid(), profileId: IdSchema, profileRevision: HashSchema, catalogRevision: HashSchema,
  tests: z.array(CatalogTestSchema).max(LIMITS.tests), dependencies: z.array(z.string()).max(100),
}).strict().refine(v => new Set(v.tests.map(stableKey)).size === v.tests.length, 'Duplicate catalog identity');
export type RunnerInvocation = z.infer<typeof RunnerInvocationSchema>;
export type ManifestV2 = z.infer<typeof ManifestV2Schema>;
export type ReportV2 = z.infer<typeof ReportV2Schema>;
export type InvocationTest = z.infer<typeof InvocationTestSchema>;
export type DiscoveryV2 = z.infer<typeof DiscoveryV2Schema>;
export type ArgumentSource = z.infer<typeof ArgumentSourceSchema>;
