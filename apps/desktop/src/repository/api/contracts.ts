import { z } from 'zod';
export const RevisionSchema = z.string().regex(/^[0-9a-f]{64}$/);


export const UuidV4Schema = z.string().length(36).regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const warningCodeSchema = z.enum([
  'DUPLICATE_WORKSPACE', 'MISSING_WORKSPACE', 'INVALID_WORKSPACE_PATH', 'LEGACY_FORMAT',
  'INVALID_ENTRY', 'INVALID_CASE', 'DUPLICATE_CASE_ID', 'INVALID_ORDER', 'CATALOG_LIMIT',
  'RECENT_HISTORY_UNAVAILABLE', 'PREFERRED_WORKSPACE_UNAVAILABLE', 'WATCHER_UNAVAILABLE', 'SUITE_RECOVERY_REQUIRED',
]);
const warningSchema = z.object({ code: warningCodeSchema, message: z.string(), path: z.string().optional(), resourceId: UuidV4Schema.optional() }).strict();
const caseWarningSchema = z.object({
  code: z.enum(['missing-id', 'invalid-id', 'invalid-tags', 'invalid-status', 'extra-content', 'duplicate-section']),
  message: z.string(), line: z.number().int().positive().nullable(),
}).strict();
const runWarningSchema = z.object({
  code: z.enum(['invalid-frontmatter', 'missing-case-id', 'invalid-case-id', 'invalid-approval', 'invalid-checklist-mark', 'extra-content', 'duplicate-section']),
  message: z.string(), line: z.number().int().positive().nullable(),
}).strict();

export const ProtocolRequestSchema = z.object({ protocolVersion: z.literal(1) }).strict();
export const RecentRepositoryRequestSchema = ProtocolRequestSchema.extend({ recentId: UuidV4Schema }).strict();
export const SessionRequestSchema = ProtocolRequestSchema.extend({ sessionId: UuidV4Schema }).strict();
export const WorkspaceRequestSchema = SessionRequestSchema.extend({
  workspacePath: z.string().max(1024).refine((value) => new TextEncoder().encode(value).byteLength <= 1024 && !value.includes('\\') && !value.includes('\0')),
}).strict();
const normalizedRelativeWorkspacePathSchema = z.string().max(1024)
    .refine((value) => new TextEncoder().encode(value).byteLength <= 1024)
    .refine((value) => !value.includes('\\') && !value.includes('\0') && !value.includes(':'))
    .refine((value) => value === '' || (!value.startsWith('/') && value.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..' && part.toLowerCase() !== '.git')));
export const RememberWorkspaceRequestSchema = SessionRequestSchema.extend({
  workspacePath: normalizedRelativeWorkspacePathSchema,
}).strict();
export const ResourceRequestSchema = SessionRequestSchema.extend({ resourceId: UuidV4Schema }).strict();

export const WorkspaceSchema = z.object({ path: z.string(), name: z.string(), displayIdPrefix: z.string(), description: z.string() }).strict();
const openWarningSchema = z.object({ code: warningCodeSchema, message: z.string() }).strict();
export const OpenRepositorySchema = z.object({
  sessionId: UuidV4Schema, displayName: z.string(), needsInitialization: z.boolean(),
  workspaces: z.array(WorkspaceSchema).max(20_000), warnings: z.array(openWarningSchema),
  preferredWorkspacePath: normalizedRelativeWorkspacePathSchema.nullable().optional(),
}).strict().superRefine((opened, context) => {
  if (opened.preferredWorkspacePath != null &&
      (opened.needsInitialization || !opened.workspaces.some((workspace) => workspace.path === opened.preferredWorkspacePath))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['preferredWorkspacePath'], message: 'Preferred workspace must be currently declared.' });
  }
});
export const RecentRepositorySchema = z.object({
  recentId: UuidV4Schema,
  displayName: z.string().min(1).refine((value) => new TextEncoder().encode(value).byteLength <= 512),
  lastOpenedAtMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
}).strict();
export const RecentRepositoriesSchema = z.array(RecentRepositorySchema).max(20);
export const CatalogEntrySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('folder'), metadata: z.object({
    nodeId: UuidV4Schema, path: z.string(), parentPath: z.string(), parentResourceId: UuidV4Schema.nullable(),
    order: z.number().int().nonnegative(), name: z.string(), displayIdPrefix: z.string(), description: z.string(),
  }).strict() }).strict(),
  z.object({ kind: z.literal('case'), metadata: z.object({
    resourceId: UuidV4Schema, path: z.string(), parentPath: z.string(), parentResourceId: UuidV4Schema.nullable(),
    order: z.number().int().nonnegative(), id: z.string().nullable(), displayId: z.string(), title: z.string(),
    status: z.enum(['draft', 'active', 'deprecated']), tags: z.array(z.string()), revision: RevisionSchema.optional(),
  }).strict() }).strict(),
]);
export const WorkspaceCatalogSchema = z.object({ workspacePath: z.string(), entries: z.array(CatalogEntrySchema).max(20_000), warnings: z.array(warningSchema) }).strict();

const caseModelSchema = z.object({
  id: z.string().nullable(), displayId: z.string(), title: z.string(), slug: z.string().nullable(),
  status: z.enum(['draft', 'active', 'deprecated']), tags: z.array(z.string()), objective: z.string(), systems: z.array(z.string()),
  setup: z.array(z.object({ name: z.string(), body: z.string() }).strict()),
  steps: z.array(z.object({ text: z.string(), depth: z.number().int().min(0).max(3) }).strict()), acceptanceCriteria: z.array(z.string()),
}).strict();
export const CaseDocumentSchema = z.object({ model: caseModelSchema, warnings: z.array(caseWarningSchema), revision: RevisionSchema.optional() }).strict();
const singleLine = z.string().refine((value) => !value.includes('\n') && !value.includes('\r'));
const nonemptyLine = singleLine.refine((value) => value.trim().length > 0);
const byteString = (limit: number) => z.string().max(limit).refine((value) => new TextEncoder().encode(value).byteLength <= limit);
export const CaseEditSchema = caseModelSchema.omit({ id: true }).extend({
  title: byteString(4096).refine((value) => value.trim().length > 0),
  displayId: byteString(512), slug: byteString(4096).nullable(),
  tags: z.array(nonemptyLine).max(1000), systems: z.array(nonemptyLine).max(1000), acceptanceCriteria: z.array(nonemptyLine).max(2000),
  setup: z.array(z.object({ name: singleLine, body: z.string() }).strict()).max(1000),
  steps: z.array(z.object({ text: nonemptyLine, depth: z.number().int().min(0).max(3) }).strict()).max(2000),
}).strict().superRefine((edit, context) => {
  if (edit.steps.some((step, index) => step.depth > (index === 0 ? 0 : edit.steps[index - 1]!.depth + 1))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['steps'], message: 'Invalid step nesting.' });
  if (new TextEncoder().encode(JSON.stringify(edit)).byteLength > 2 * 1024 * 1024) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Case too large.' });
});
export const SaveCaseRequestSchema = ResourceRequestSchema.extend({ expectedRevision: RevisionSchema, edit: CaseEditSchema }).strict();

const runResultSchema = z.enum(['not_run', 'pass', 'fail', 'blocked', 'in_progress', 'skipped']);
const runStatusSchema = z.enum(['open', 'closed']);
const approvalSchema = z.object({ name: z.string(), at: z.string() }).strict();
const runChecklistSchema = z.object({ key: z.string(), text: z.string(), state: z.enum(['none', 'pass', 'fail']), failNote: z.string() }).strict();
const runDetailsModelSchema = z.object({ name: z.string(), status: runStatusSchema, created: z.string(), testDate: z.string(), scope: z.string(), testerApproval: approvalSchema.nullable(), reviewerApproval: approvalSchema.nullable(), summary: z.string(), notes: z.string() }).strict();
const runCaseModelSchema = z.object({ caseId: z.string(), displayId: z.string(), title: z.string(), result: runResultSchema, tester: z.string(), executedAt: z.string(), testDate: z.string().nullable(), notes: z.string(), setup: z.array(runChecklistSchema), steps: z.array(runChecklistSchema), accept: z.array(runChecklistSchema) }).strict();
export const RunResourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('details'), document: z.object({ model: runDetailsModelSchema, warnings: z.array(runWarningSchema), revision: RevisionSchema.optional() }).strict() }).strict(),
  z.object({ kind: z.literal('case'), document: z.object({ model: runCaseModelSchema, warnings: z.array(runWarningSchema), snapshot: CaseDocumentSchema.optional(), revision: RevisionSchema.optional() }).strict() }).strict(),
]);
const runCaseCatalogSchema = z.object({ resourceId: UuidV4Schema, path: z.string(), caseId: z.string(), displayId: z.string(), title: z.string(), result: runResultSchema }).strict();
export const RunsCatalogSchema = z.object({ runs: z.array(z.object({ runId: z.string(), name: z.string(), created: z.string(), testDate: z.string(), status: runStatusSchema, scope: z.string(), detailsResourceId: UuidV4Schema.nullable(), cases: z.array(runCaseCatalogSchema) }).strict()).max(20_000), warnings: z.array(warningSchema) }).superRefine((catalog, context) => {
  const resources = catalog.runs.reduce((count, run) => count + 1 + run.cases.length, 0);
  if (resources > 20_000) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Run catalog exceeds resource limit.' });
});

export const IpcErrorSchema = z.object({ code: z.enum([
  'INITIALIZATION_UNAVAILABLE', 'INITIALIZATION_FAILED',
  'INVALID_SUITE_OPERATION', 'SUITE_RECOVERY_REQUIRED', 'INVALID_SUITE_CREATION', 'INVALID_RUN_EDIT', 'INVALID_RUN_CREATION', 'INVALID_CASE_EDIT', 'READ_ONLY_CASE', 'EXTERNAL_CHANGE', 'SAVE_FAILED', 'WRITE_QUEUE_FULL', 'WRITE_FLUSH_FAILED',
  'INVALID_REQUEST', 'UNAUTHORIZED_WEBVIEW', 'INVALID_SESSION', 'INVALID_RESOURCE', 'STALE_RESOURCE',
  'NOT_GIT_REPOSITORY', 'BARE_REPOSITORY', 'SELECTED_SUBDIRECTORY', 'INVALID_REPOSITORY',
  'UNSUPPORTED_VERSION', 'INVALID_CONFIG', 'UNSUPPORTED_LEGACY_FORMAT', 'GIT_FAILED', 'GIT_COMMIT_BLOCKED', 'GIT_SYNC_BLOCKED', 'GIT_DIRTY', 'GIT_NO_UPSTREAM', 'GIT_AUTH_FAILED', 'GIT_REMOTE_FAILED', 'GIT_NETWORK_FAILED', 'GIT_PUSH_REJECTED', 'GIT_ABORT_FAILED', 'GIT_RECOVERY_REQUIRED', 'GIT_IDENTITY_MISSING', 'GIT_OUTPUT_TOO_LARGE', 'GIT_UNAVAILABLE', 'GIT_TIMED_OUT',
  'INVALID_DOCUMENT', 'FILE_TOO_LARGE', 'INVALID_UTF8', 'PICKER_BUSY', 'PICKER_FAILED',
  'RECENT_HISTORY_UNAVAILABLE', 'RECENT_NOT_FOUND', 'RECENT_REPOSITORY_MISSING', 'REPOSITORY_IO', 'INTERNAL',
]), message: z.string().min(1).max(240) }).strict();

export type OpenRepository = z.infer<typeof OpenRepositorySchema>;
export type WorkspaceCatalog = z.infer<typeof WorkspaceCatalogSchema>;
export type CatalogEntry = z.infer<typeof CatalogEntrySchema>;
export type CaseDocument = z.infer<typeof CaseDocumentSchema>;
export type CaseEdit = z.infer<typeof CaseEditSchema>;
export type RunsCatalog = z.infer<typeof RunsCatalogSchema>;
export type RunResource = z.infer<typeof RunResourceSchema>;
export type RecentRepository = z.infer<typeof RecentRepositorySchema>;
export type RepositoryErrorCode = z.infer<typeof IpcErrorSchema>['code'];

export const CaseCreationSchema = z.object({
  workspacePath: normalizedRelativeWorkspacePathSchema,
  parentResourceId: UuidV4Schema.nullable(),
  title: z.string().trim().min(1).refine((value) => new TextEncoder().encode(value).byteLength <= 4096),
  source: z.object({ resourceId: UuidV4Schema, expectedRevision: RevisionSchema }).strict().nullable(),
}).strict();
export const CreateCaseRequestSchema = SessionRequestSchema.extend({ creation: CaseCreationSchema }).strict();
export const CaseCreationResultSchema = z.object({ path: normalizedRelativeWorkspacePathSchema.refine((path) => path.endsWith('.md')) }).strict();
export type CaseCreation = z.infer<typeof CaseCreationSchema>;

// Match native names.rs: one portable component, UTF-8 bounded, no hidden or device names.
export const PortableNameSchema = z.string().min(1).refine((value) => {
  if (new TextEncoder().encode(value).byteLength > 180 || value.trim() !== value || value.startsWith('.') || value.endsWith('.') || /[\x00-\x1f\x7f-\x9f/\\:<>"|?*]/.test(value)) return false;
  const stem = value.split('.')[0]?.trimEnd().toUpperCase() ?? '';
  return !/^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])$/.test(stem);
});
export const CaseFilenameSchema = PortableNameSchema.refine((value) => value.endsWith('.md') && PortableNameSchema.safeParse(value.slice(0, -3)).success && !['_suite.md', '_run.md'].includes(value.toLowerCase()));
export const SuiteCreationSchema = z.object({ workspacePath: normalizedRelativeWorkspacePathSchema, parentResourceId: UuidV4Schema.nullable(), name: PortableNameSchema }).strict();
export const CreateSuiteRequestSchema = SessionRequestSchema.extend({ creation: SuiteCreationSchema }).strict();
export const SuiteCreationResultSchema = z.object({ path: normalizedRelativeWorkspacePathSchema.refine((value) => value.length > 0) }).strict();
export type SuiteCreation = z.infer<typeof SuiteCreationSchema>;

export const CaseOperationSchema = z.object({ workspacePath: normalizedRelativeWorkspacePathSchema, resourceId: UuidV4Schema, expectedRevision: RevisionSchema,
  action: z.discriminatedUnion('kind', [z.object({ kind: z.literal('move'), parentResourceId: UuidV4Schema.nullable() }).strict(), z.object({ kind: z.literal('delete') }).strict(), z.object({ kind: z.literal('rename'), filename: CaseFilenameSchema }).strict()]),
}).strict();
export const OrganizeCaseRequestSchema = SessionRequestSchema.extend({ operation: CaseOperationSchema }).strict();
export const CaseOperationResultSchema = z.object({ path: normalizedRelativeWorkspacePathSchema.refine((path) => path.endsWith('.md')).nullable() }).strict();
export type CaseOperation = z.infer<typeof CaseOperationSchema>;

const RunDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
export const RunCreationSchema = z.object({ workspacePath: normalizedRelativeWorkspacePathSchema,
  name: z.string().trim().min(1).refine((value) => new TextEncoder().encode(value).byteLength <= 4096),
  scope: z.string().refine((value) => new TextEncoder().encode(value).byteLength <= 4096), testDate: RunDateSchema,
  cases: z.array(z.object({ resourceId: UuidV4Schema, expectedRevision: RevisionSchema }).strict()).min(1).max(500),
}).strict().superRefine((value, context) => {
  if (new Set(value.cases.map((item) => item.resourceId)).size !== value.cases.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ['cases'], message: 'Duplicate case resource.' });
});
export const CreateRunRequestSchema = SessionRequestSchema.extend({ creation: RunCreationSchema }).strict();
export const RunCreationResultSchema = z.object({ runId: z.string().regex(/^\.casewright\/runs\/\d{4}-\d{2}-\d{2}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/) }).strict();
export type RunCreation = z.infer<typeof RunCreationSchema>;

const runCheckEditSchema = runChecklistSchema.omit({ text: true }).extend({ key: z.string().max(64), failNote: singleLine.refine((value) => new TextEncoder().encode(value).byteLength <= 4096) }).strict();
export const RunCaseEditSchema = runCaseModelSchema.omit({ caseId: true, displayId: true, title: true }).extend({
  tester: z.string().refine((value) => new TextEncoder().encode(value).byteLength <= 4096),
  executedAt: z.string().refine((value) => new TextEncoder().encode(value).byteLength <= 4096),
  testDate: z.string().refine((value) => new TextEncoder().encode(value).byteLength <= 4096).nullable(),
  setup: z.array(runCheckEditSchema).max(2000), steps: z.array(runCheckEditSchema).max(2000), accept: z.array(runCheckEditSchema).max(2000),
}).strict().refine((edit) => new TextEncoder().encode(JSON.stringify(edit)).byteLength <= 2 * 1024 * 1024);
export const SaveRunCaseRequestSchema = ResourceRequestSchema.extend({ expectedRevision: RevisionSchema, edit: RunCaseEditSchema }).strict();
export type RunCaseResource = Extract<RunResource, { kind: 'case' }>;
export type RunCaseEdit = z.infer<typeof RunCaseEditSchema>;

export type RunDetailsResource = Extract<RunResource, { kind: 'details' }>;
export const RunDetailsEditSchema = runDetailsModelSchema.pick({ status: true, summary: true, notes: true }).strict().refine((edit) => new TextEncoder().encode(JSON.stringify(edit)).byteLength <= 1024 * 1024);
export type RunDetailsEdit = z.infer<typeof RunDetailsEditSchema>;
export const SaveRunDetailsRequestSchema = ResourceRequestSchema.extend({ expectedRevision: RevisionSchema, edit: RunDetailsEditSchema }).strict();

const gitPathSchema = z.string().min(1).max(65536).refine((value) => !value.includes('\0'));
const gitPatchSchema = z.string().refine((value) => new TextEncoder().encode(value).byteLength <= 256 * 1024).nullable();
export const GitFileSchema = z.object({ fileId: UuidV4Schema, committable: z.boolean(), path: gitPathSchema, originalPath: gitPathSchema.nullable(), index: z.string().regex(/^[.MADRCUT?]$/), worktree: z.string().regex(/^[.MADRCUT?]$/), unmerged: z.boolean(), submodule: z.boolean() }).strict();
export const GitStatusSchema = z.object({ syncToken: UuidV4Schema.nullable(), abortToken: UuidV4Schema.nullable(), syncBlocked: z.boolean(), branch: z.string().nullable(), head: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/).nullable(), unborn: z.boolean(), detached: z.boolean(), upstream: z.string().nullable(), ahead: z.number().int().nonnegative().safe().nullable(), behind: z.number().int().nonnegative().safe().nullable(), filtersDisabled: z.boolean(), files: z.array(GitFileSchema).max(20_000) }).strict();
export const GitDiffSchema = z.object({ path: gitPathSchema, staged: gitPatchSchema, workingTree: gitPatchSchema, untrackedContent: gitPatchSchema, binary: z.boolean(), unmerged: z.boolean(), filtersDisabled: z.boolean() }).strict();
export const GitDiffRequestSchema = SessionRequestSchema.extend({ fileId: UuidV4Schema }).strict();
export type GitStatus = z.infer<typeof GitStatusSchema>;
export type GitFile = z.infer<typeof GitFileSchema>;
export type GitDiff = z.infer<typeof GitDiffSchema>;

export const GitCommitRequestSchema = SessionRequestSchema.extend({ fileIds: z.array(UuidV4Schema).min(1).max(200).refine((ids) => new Set(ids).size === ids.length), message: z.string().refine((message) => message.trim().length > 0 && !message.includes('\0') && new TextEncoder().encode(message).byteLength <= 4096) }).strict();
export const GitCommitResultSchema = z.object({ head: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/), indexPublished: z.boolean(), recoveryIndex: z.string().regex(/^testoritto-index-[0-9a-f-]{36}$/).nullable() }).strict().refine((result) => result.indexPublished === (result.recoveryIndex === null));
export type GitCommitResult = z.infer<typeof GitCommitResultSchema>;

export const GitSyncRequestSchema = SessionRequestSchema.extend({ confirmation: UuidV4Schema, action: z.enum(['pull', 'push', 'abort']) }).strict();
export const GitSyncResultSchema = z.object({ outcome: z.enum(['pulled', 'pushed', 'conflict', 'aborted']), abortToken: UuidV4Schema.nullable(), unmergedPaths: z.array(gitPathSchema).max(20_000), repository: OpenRepositorySchema.nullable(), reloadRequired: z.boolean() }).strict().superRefine((result, context) => {
  const valid = result.outcome === 'conflict'
    ? result.abortToken !== null && result.unmergedPaths.length > 0 && result.repository === null && !result.reloadRequired
    : result.abortToken === null && result.unmergedPaths.length === 0 && (result.outcome === 'pushed'
      ? result.repository === null && !result.reloadRequired
      : result.reloadRequired === (result.repository === null));
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid synchronization state.' });
});
export type GitSyncResult = z.infer<typeof GitSyncResultSchema>;
export type GitSyncAction = z.infer<typeof GitSyncRequestSchema>['action'];

export const RepositoryChangeSchema = z.object({
  sessionId: UuidV4Schema, epoch: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  kind: z.enum(['content', 'metadata', 'git', 'rescan']), errorCode: z.enum(['WATCHER_UNAVAILABLE']).nullable(),
}).strict();
export type RepositoryChange = z.infer<typeof RepositoryChangeSchema>;

const ProductPathSchema = normalizedRelativeWorkspacePathSchema.refine((value) => value.length > 0 && !value.split('/').some((part) => part.toLowerCase() === '.casewright'));
export const SuiteActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('duplicate'), parentResourceId: UuidV4Schema.nullable(), name: PortableNameSchema }).strict(),
  z.object({ kind: z.literal('move'), parentResourceId: UuidV4Schema.nullable() }).strict(),
  z.object({ kind: z.literal('rename'), name: PortableNameSchema }).strict(), z.object({ kind: z.literal('delete') }).strict(),
]);
export const SuiteOperationSchema = z.object({ workspacePath: normalizedRelativeWorkspacePathSchema, resourceId: UuidV4Schema, action: SuiteActionSchema }).strict();
export const PrepareSuiteRequestSchema = SessionRequestSchema.extend({ operation: SuiteOperationSchema }).strict();
export const ApplySuiteRequestSchema = SessionRequestSchema.extend({ confirmation: UuidV4Schema }).strict();
const SuiteManifestEntrySchema = z.object({ path: ProductPathSchema, kind: z.enum(['directory', 'case', 'note', 'order', 'unknown']), revision: RevisionSchema, size: z.number().int().nonnegative().max(2 * 1024 * 1024) }).strict();
export const SuitePreviewSchema = z.object({ confirmation: UuidV4Schema, sourcePath: ProductPathSchema, destinationPath: ProductPathSchema.nullable(), entries: z.array(SuiteManifestEntrySchema).min(1).max(1000), totalBytes: z.number().int().nonnegative().max(32 * 1024 * 1024), permanentDelete: z.boolean() }).strict().superRefine((preview, context) => {
  if (!preview.entries.some((entry) => entry.path === preview.sourcePath && entry.kind === 'directory') || new Set(preview.entries.map((entry) => entry.path)).size !== preview.entries.length || preview.entries.some((entry) => entry.path !== preview.sourcePath && !entry.path.startsWith(`${preview.sourcePath}/`) && !(entry.path === `${preview.sourcePath}.md` && entry.kind === 'note')) || preview.entries.reduce((total, entry) => total + entry.size, 0) !== preview.totalBytes || preview.permanentDelete !== (preview.destinationPath === null)) context.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid suite manifest.' });
});
export const SuiteRecoverySchema = z.object({ transactionPath: z.string().regex(/^\.testoritto-suite-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/), removedPaths: z.array(ProductPathSchema).max(1000), remainingPaths: z.array(ProductPathSchema).max(3003) }).strict();
export const SuiteApplyResultSchema = z.discriminatedUnion('outcome', [
  z.object({ outcome: z.literal('applied'), path: ProductPathSchema.nullable(), recovery: z.null() }).strict(),
  z.object({ outcome: z.literal('recoveryRequired'), path: z.null(), recovery: SuiteRecoverySchema }).strict(),
]);
export type SuiteOperation = z.infer<typeof SuiteOperationSchema>;
export type SuitePreview = z.infer<typeof SuitePreviewSchema>;
export type SuiteRecovery = z.infer<typeof SuiteRecoverySchema>;
export type SuiteApplyResult = z.infer<typeof SuiteApplyResultSchema>;
