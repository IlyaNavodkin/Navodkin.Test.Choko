import { z } from 'zod';
import { ProfileSchema, BindingSchema, HashSchema, IdSchema, RelativePathSchema, KeySchema, TestRecordSchema, CatalogSchema, ErrorSchema, AttachmentSchema, LIMITS } from '@testoritto/playwright-automation';
export { ProfileSchema, BindingSchema, LIMITS };
export type { AutomationProfile, StableKey } from '@testoritto/playwright-automation';
const UuidSchema = z.string().uuid();
const StateSchema = z.enum(['running', 'completed', 'runner_error', 'interrupted', 'timed_out']);
const OperationSchema = z.enum(['discover', 'run']);
export const ExecutionSummarySchema = z.object({ executionId: UuidSchema, runId: RelativePathSchema, profileId: IdSchema, operation: OperationSchema, state: StateSchema, reason: z.string().max(4096).nullable(), createdAt: z.string().datetime({ offset: true }) }).strict();
export const ProfileViewSchema = z.object({ profile: ProfileSchema, revision: HashSchema, trusted: z.boolean(), nodePath: z.string().max(4096).nullable() }).strict();
export const AutomationViewSchema = z.object({ revision: HashSchema, profiles: z.array(ProfileViewSchema).max(100), bindings: z.array(BindingSchema).max(LIMITS.tests), history: z.array(ExecutionSummarySchema).max(LIMITS.tests) }).strict();
export const StartSchema = z.object({ profileId: IdSchema, profileRevision: HashSchema, runId: RelativePathSchema, operation: OperationSchema, catalogExecutionId: UuidSchema.nullable(), catalogRevision: HashSchema.nullable(), selection: z.array(KeySchema).max(LIMITS.tests), parentExecutionId: UuidSchema.nullable() }).strict();
export const OverviewSchema = z.object({
  state: StateSchema, startedAt: z.string().datetime({ offset: true }), finishedAt: z.string().datetime({ offset: true }),
  source: z.object({ commit: z.string().regex(/^[a-f0-9]{40,64}$/).nullable(), branch: z.string().max(1024).nullable(), dirty: z.boolean() }).strict(),
  reason: z.string().max(4096).nullable(), logs: z.object({ stdout: z.string().max(LIMITS.logBytes), stderr: z.string().max(LIMITS.logBytes), truncated: z.boolean() }).strict(),
  runnerErrors: z.array(ErrorSchema).max(100), attachments: z.array(AttachmentSchema).max(LIMITS.attachments),
  testCount: z.number().int().min(0).max(LIMITS.tests), detailsTruncated: z.boolean(),
}).strict();
export const PollSchema = z.object({ execution: ExecutionSummarySchema, cursor: z.number().int().min(0).max(LIMITS.tests), nextCursor: z.number().int().min(0).max(LIMITS.tests).nullable(), tests: z.array(TestRecordSchema).max(LIMITS.tests), catalog: CatalogSchema.nullable(), report: OverviewSchema.nullable(), detailsTruncated: z.boolean() }).strict().refine(v => new TextEncoder().encode(JSON.stringify(v)).length <= LIMITS.pollBytes, 'Oversized native page');
export const SessionRequestSchema = z.object({ protocolVersion: z.literal(1), sessionId: UuidSchema }).strict();
export const ProfileRequestSchema = SessionRequestSchema.extend({ expectedRevision: HashSchema, profile: ProfileSchema, nodePath: z.string().min(1).max(4096) }).strict();
export const BindingsRequestSchema = SessionRequestSchema.extend({ expectedRevision: HashSchema, bindings: z.array(BindingSchema).max(LIMITS.tests) }).strict();
export const TrustRequestSchema = SessionRequestSchema.extend({ profileId: IdSchema, expectedRevision: HashSchema, grant: z.boolean() }).strict();
export const StartRequestSchema = SessionRequestSchema.extend({ start: StartSchema }).strict();
export const PollRequestSchema = SessionRequestSchema.extend({ runId: RelativePathSchema, executionId: UuidSchema, cursor: z.number().int().min(0).max(LIMITS.tests) }).strict();
export const CancelRequestSchema = SessionRequestSchema.extend({ executionId: UuidSchema }).strict();
export type AutomationView = z.infer<typeof AutomationViewSchema>;
export type ProfileView = z.infer<typeof ProfileViewSchema>;
export type ExecutionSummary = z.infer<typeof ExecutionSummarySchema>;
export type AutomationStart = z.infer<typeof StartSchema>;
export type AutomationPoll = z.infer<typeof PollSchema>;
