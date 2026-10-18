import { z } from 'zod';
import {
  AutotestSchema, CaseAutotestBindingSchema, DiscoveryV2Schema, EnvironmentEntrySchema, HashSchema, IdSchema, InvocationTestSchema,
  LIMITS, ProfileSchema, RelativePathSchema, RunnerInvocationSchema,
} from '@testoritto/playwright-automation';
export { AutotestSchema, CaseAutotestBindingSchema, EnvironmentEntrySchema, LIMITS, ProfileSchema };
export type { Autotest, CaseAutotestBinding, EnvironmentEntry } from '@testoritto/playwright-automation';

const UuidSchema = z.string().uuid();
const StateSchema = z.enum(['running', 'completed', 'runner_error', 'interrupted', 'timed_out']);
const OperationSchema = z.enum(['discover', 'run']);
const IssueSchema = z.object({ bindingId: UuidSchema, code: z.enum(['INVALID_INPUT', 'UNAVAILABLE', 'UNKNOWN_ARGUMENT', 'REQUIRED', 'INVALID_VALUE', 'ENVIRONMENT_UNAVAILABLE', 'PAYLOAD_LIMIT', 'STALE']), key: z.string().max(64).nullable() }).strict();
export const ExecutionSummarySchema = z.object({ executionId: UuidSchema, runId: RelativePathSchema, profileId: IdSchema, operation: OperationSchema, state: StateSchema, reason: z.string().max(4096).nullable(), createdAt: z.string().datetime({ offset: true }) }).strict();
export const ProfileViewSchema = z.object({ profile: ProfileSchema, revision: HashSchema, trusted: z.boolean(), nodePath: z.string().max(4096).nullable() }).strict();
export const AutomationViewSchema = z.object({
  revision: HashSchema, profiles: z.array(ProfileViewSchema).max(100), autotests: z.array(AutotestSchema).max(LIMITS.tests),
  bindings: z.array(CaseAutotestBindingSchema).max(LIMITS.tests), environments: z.array(EnvironmentEntrySchema).max(100), history: z.array(ExecutionSummarySchema).max(LIMITS.tests),
}).strict();
export const OverviewSchema = z.object({
  state: StateSchema, startedAt: z.string().datetime({ offset: true }), finishedAt: z.string().datetime({ offset: true }),
  source: z.object({ commit: z.string().regex(/^[a-f0-9]{40,64}$/).nullable(), branch: z.string().max(1024).nullable(), dirty: z.boolean() }).strict(),
  reason: z.string().max(4096).nullable(), logs: z.object({ stdout: z.string().max(LIMITS.logBytes), stderr: z.string().max(LIMITS.logBytes), truncated: z.boolean() }).strict(),
  runnerErrors: z.array(z.object({ message: z.string().max(16_384), stack: z.string().max(32_768).nullable() }).strict()).max(100),
  attachments: z.array(z.object({ id: UuidSchema, name: z.string().max(256), contentType: z.string().max(100), path: RelativePathSchema.nullable(), size: z.number().int().min(0).max(LIMITS.attachmentBytes), unavailableReason: z.string().max(256).nullable() }).strict()).max(LIMITS.attachments),
  testCount: z.number().int().min(0).max(LIMITS.tests), detailsTruncated: z.boolean(),
}).strict();
export const PollSchema = z.object({
  execution: ExecutionSummarySchema, cursor: z.number().int().min(0).max(LIMITS.tests), nextCursor: z.number().int().min(0).max(LIMITS.tests).nullable(),
  tests: z.array(InvocationTestSchema).max(LIMITS.tests), invocations: z.array(RunnerInvocationSchema).max(LIMITS.tests),
  catalog: DiscoveryV2Schema.nullable(), report: OverviewSchema.nullable(), detailsTruncated: z.boolean(),
}).strict().refine(v => new TextEncoder().encode(JSON.stringify(v)).length <= LIMITS.pollBytes, 'Oversized native page');
export const PreviewSchema = z.object({ snapshots: z.array(RunnerInvocationSchema).max(LIMITS.tests), issues: z.array(IssueSchema).max(LIMITS.tests * 8) }).strict();
export const SavedReportSchema = z.object({ name: z.string().min(1).max(64), relativePath: RelativePathSchema, size: z.number().int().min(0).max(LIMITS.reportBytes), sha256: HashSchema }).strict();
export const ImportPreviewSchema = z.object({
  sourceHash: HashSchema, schemaVersion: z.number().int().min(1).max(2), sourceRunId: RelativePathSchema.nullable(), foreignRun: z.boolean(), duplicateImport: z.boolean(), matched: z.number().int().min(0).max(LIMITS.tests),
  rows: z.array(z.object({ index: z.number().int().min(0).max(LIMITS.tests), status: z.enum(['matched', 'duplicate', 'unmatched']), outcome: z.enum(['expected', 'unexpected', 'flaky', 'skipped', 'interrupted']), caseId: IdSchema, automationId: IdSchema, project: IdSchema, variantId: IdSchema, title: z.string().max(4096), file: z.string().max(1024) }).strict()).max(LIMITS.tests),
}).strict();

export const SessionRequestSchema = z.object({ protocolVersion: z.literal(1), sessionId: UuidSchema }).strict();
const InvocationRequestSchema = z.object({ bindingId: UuidSchema, runOverrides: z.record(z.unknown()).optional() }).strict();
export const ProfileRequestSchema = SessionRequestSchema.extend({ expectedRevision: HashSchema, profile: ProfileSchema, nodePath: z.string().min(1).max(4096) }).strict();
export const AutotestRequestSchema = SessionRequestSchema.extend({ expectedRevision: HashSchema, revision: z.string().min(1).max(128), autotest: AutotestSchema }).strict();
export const ArchiveAutotestRequestSchema = SessionRequestSchema.extend({ expectedRevision: HashSchema, revision: z.string().min(1).max(128), autotestId: UuidSchema, archived: z.boolean() }).strict();
export const DeleteAutotestRequestSchema = SessionRequestSchema.extend({ expectedRevision: HashSchema, autotestId: UuidSchema }).strict();
export const BindingRequestSchema = SessionRequestSchema.extend({ expectedRevision: HashSchema, revision: z.string().min(1).max(128), binding: CaseAutotestBindingSchema }).strict();
export const RemoveBindingRequestSchema = SessionRequestSchema.extend({ expectedRevision: HashSchema, bindingId: UuidSchema }).strict();
export const EnvironmentsRequestSchema = SessionRequestSchema.extend({ expectedRevision: HashSchema, environments: z.array(EnvironmentEntrySchema).max(100) }).strict();
export const TrustRequestSchema = SessionRequestSchema.extend({ profileId: IdSchema, expectedRevision: HashSchema, grant: z.boolean() }).strict();
export const PreviewRequestSchema = SessionRequestSchema.extend({ runId: RelativePathSchema, invocations: z.array(InvocationRequestSchema).max(LIMITS.tests) }).strict();
export const StartRequestSchema = SessionRequestSchema.extend({
  start: z.object({
    profileId: IdSchema, profileRevision: HashSchema, runId: RelativePathSchema, operation: OperationSchema,
    catalogExecutionId: UuidSchema.nullable(), catalogRevision: HashSchema.nullable(), invocations: z.array(InvocationRequestSchema).max(LIMITS.tests),
    parentExecutionId: UuidSchema.nullable(), preview: z.array(RunnerInvocationSchema).max(LIMITS.tests).optional(),
  }).strict(),
}).strict();
export const PollRequestSchema = SessionRequestSchema.extend({ runId: RelativePathSchema, executionId: UuidSchema, cursor: z.number().int().min(0).max(LIMITS.tests) }).strict();
export const CancelRequestSchema = SessionRequestSchema.extend({ executionId: UuidSchema }).strict();
export const ReportsRequestSchema = SessionRequestSchema.extend({ runId: RelativePathSchema, executionId: UuidSchema }).strict();
export const ImportRequestSchema = SessionRequestSchema.extend({ runId: RelativePathSchema, source: z.string().min(1).max(LIMITS.reportBytes) }).strict();
export const ApplyImportRequestSchema = ImportRequestSchema.extend({ expectedRevision: HashSchema }).strict();
export type AutomationView = z.infer<typeof AutomationViewSchema>;
export type ProfileView = z.infer<typeof ProfileViewSchema>;
export type ExecutionSummary = z.infer<typeof ExecutionSummarySchema>;
export type AutomationPreview = z.infer<typeof PreviewSchema>;
export type AutomationPoll = z.infer<typeof PollSchema>;
export type SavedReport = z.infer<typeof SavedReportSchema>;
export type ImportPreview = z.infer<typeof ImportPreviewSchema>;
export type AutomationStart = z.infer<typeof StartRequestSchema>['start'];
export type InvocationRequest = z.infer<typeof InvocationRequestSchema>;
