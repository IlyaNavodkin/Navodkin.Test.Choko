import { z } from 'zod';
import { invokeNative, NativeInvokeError, type NativeInvoke } from '../../shared/infrastructure/tauri/nativeInvoke';
import {
  PrepareSuiteRequestSchema, ApplySuiteRequestSchema, SuitePreviewSchema, SuiteApplyResultSchema, CreateSuiteRequestSchema, SuiteCreationResultSchema, GitSyncRequestSchema, GitSyncResultSchema, GitCommitRequestSchema, GitCommitResultSchema, GitStatusSchema, GitDiffSchema, GitDiffRequestSchema, SaveRunDetailsRequestSchema, SaveRunCaseRequestSchema, RunCreationResultSchema, CreateRunRequestSchema, CaseOperationResultSchema, OrganizeCaseRequestSchema, CaseCreationResultSchema, CreateCaseRequestSchema, CaseDocumentSchema, SaveCaseRequestSchema, IpcErrorSchema, OpenRepositorySchema, ProtocolRequestSchema, RecentRepositoriesSchema,
  RecentRepositoryRequestSchema, RememberWorkspaceRequestSchema, ResourceRequestSchema,
  RunResourceSchema, RunsCatalogSchema, SessionRequestSchema, WorkspaceCatalogSchema, WorkspaceRequestSchema,
  type CaseDocument, type OpenRepository, type RecentRepository, type RepositoryErrorCode,
  type RunResource, type RunsCatalog, type WorkspaceCatalog,
} from './contracts';

export type RepositoryApiErrorCode = RepositoryErrorCode | 'NATIVE_RUNTIME_UNAVAILABLE' | 'INVALID_NATIVE_RESPONSE' | 'NATIVE_COMMAND_FAILED';
export class RepositoryApiError extends Error {
  constructor(readonly code: RepositoryApiErrorCode) { super(code); this.name = 'RepositoryApiError'; }
}
export type RepositoryApi = ReturnType<typeof createRepositoryApi>;

type Options = { invoke: NativeInvoke };
export function createRepositoryApi({ invoke }: Options) {
  async function invokeChecked<T>(command: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    let raw: unknown;
    try { raw = await invoke(command, args); }
    catch (error: unknown) {
      if (error instanceof NativeInvokeError) {
        const code = z.union([IpcErrorSchema.shape.code, z.enum(['NATIVE_RUNTIME_UNAVAILABLE', 'INVALID_NATIVE_RESPONSE', 'NATIVE_COMMAND_FAILED'])]).safeParse(error.code);
        throw new RepositoryApiError(code.success ? code.data : 'NATIVE_COMMAND_FAILED');
      }
      throw new RepositoryApiError('NATIVE_COMMAND_FAILED');
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new RepositoryApiError('INVALID_NATIVE_RESPONSE');
    return parsed.data;
  }
  const mutations = new Set(['save_case', 'save_run_case', 'save_run_details', 'create_case', 'create_suite', 'apply_suite_operation', 'organize_case', 'create_run', 'initialize_repository']);
  const barriers = new Set(['git_commit', 'git_sync', 'close_repository', 'flush_repository']);
  const pending = new Map<string, Set<Promise<unknown>>>();
  function call<T>(command: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const request = SessionRequestSchema.passthrough().safeParse(args.request);
    const sessionId = request.success ? request.data.sessionId : undefined;
    const predecessors = sessionId ? [...(pending.get(sessionId) ?? [])] : [];
    const execute = async (): Promise<T> => {
      if (sessionId && barriers.has(command)) {
        const outcomes = await Promise.allSettled(predecessors);
        if (outcomes.some((outcome) => outcome.status === 'rejected')) throw new RepositoryApiError('WRITE_FLUSH_FAILED');
        if (command !== 'flush_repository') await invokeChecked('flush_repository', { request: SessionRequestSchema.parse({ protocolVersion: 1, sessionId }) }, z.null());
      }
      return invokeChecked(command, args, schema);
    };
    const result = execute();
    if (sessionId && mutations.has(command)) {
      const writes = pending.get(sessionId) ?? new Set<Promise<unknown>>();
      writes.add(result);
      pending.set(sessionId, writes);
      const release = () => { writes.delete(result); if (writes.size === 0) pending.delete(sessionId); };
      void result.then(release, release);
    }
    return result;
  }
  return {
    open: async (): Promise<OpenRepository | null> => {
      const request = ProtocolRequestSchema.parse({ protocolVersion: 1 });
      const schema = OpenRepositorySchema.nullable();
      return call('pick_repository', { request }, schema);
    },
    listRecentRepositories: async (): Promise<RecentRepository[]> => {
      const request = ProtocolRequestSchema.parse({ protocolVersion: 1 });
      return call('list_recent_repositories', { request }, RecentRepositoriesSchema);
    },
    openRecentRepository: async (recentId: string): Promise<OpenRepository> => {
      const request = RecentRepositoryRequestSchema.parse({ protocolVersion: 1, recentId });
      return call('open_recent_repository', { request }, OpenRepositorySchema);
    },
    refresh: async (sessionId: string): Promise<OpenRepository> => {
      const request = SessionRequestSchema.parse({ protocolVersion: 1, sessionId });
      const result = await call('refresh_repository', { request }, OpenRepositorySchema);
      if (result.sessionId !== sessionId) throw new RepositoryApiError('INVALID_NATIVE_RESPONSE');
      return result;
    },
    flush: async (sessionId: string): Promise<void> => {
      const request = SessionRequestSchema.parse({ protocolVersion: 1, sessionId });
      await call('flush_repository', { request }, z.null());
    },
    close: async (sessionId: string): Promise<void> => {
      const request = SessionRequestSchema.parse({ protocolVersion: 1, sessionId });
      await call('close_repository', { request }, z.null());
    },
    initializeRepository: async (sessionId: string): Promise<OpenRepository> => {
      const request = SessionRequestSchema.parse({ protocolVersion: 1, sessionId });
      return call('initialize_repository', { request }, OpenRepositorySchema);
    },
    catalogWorkspace: async (sessionId: string, workspacePath: string): Promise<WorkspaceCatalog> => {
      const request = WorkspaceRequestSchema.parse({ protocolVersion: 1, sessionId, workspacePath });
      return call('catalog_workspace', { request }, WorkspaceCatalogSchema);
    },
    rememberWorkspace: async (sessionId: string, workspacePath: string): Promise<void> => {
      const request = RememberWorkspaceRequestSchema.parse({ protocolVersion: 1, sessionId, workspacePath });
      await call('remember_workspace', { request }, z.null());
    },
    readCase: async (sessionId: string, resourceId: string): Promise<CaseDocument> => {
      const request = ResourceRequestSchema.parse({ protocolVersion: 1, sessionId, resourceId });
      return call('read_case', { request }, CaseDocumentSchema);
    },
    saveCase: async (sessionId: string, resourceId: string, expectedRevision: string, edit: import('./contracts').CaseEdit): Promise<CaseDocument> => {
      const request = SaveCaseRequestSchema.parse({ protocolVersion: 1, sessionId, resourceId, expectedRevision, edit });
      return call('save_case', { request }, CaseDocumentSchema.required({ revision: true }));
    },
    prepareSuiteOperation: async (sessionId: string, operation: import('./contracts').SuiteOperation): Promise<import('./contracts').SuitePreview> => {
      const request = PrepareSuiteRequestSchema.parse({ protocolVersion: 1, sessionId, operation });
      return call('prepare_suite_operation', { request }, SuitePreviewSchema);
    },
    applySuiteOperation: async (sessionId: string, confirmation: string): Promise<import('./contracts').SuiteApplyResult> => {
      const request = ApplySuiteRequestSchema.parse({ protocolVersion: 1, sessionId, confirmation });
      return call('apply_suite_operation', { request }, SuiteApplyResultSchema);
    },
    createSuite: async (sessionId: string, creation: import('./contracts').SuiteCreation): Promise<{ path: string }> => {
      const request = CreateSuiteRequestSchema.parse({ protocolVersion: 1, sessionId, creation });
      return call('create_suite', { request }, SuiteCreationResultSchema);
    },
    createCase: async (sessionId: string, creation: import('./contracts').CaseCreation): Promise<{ path: string }> => {
      const request = CreateCaseRequestSchema.parse({ protocolVersion: 1, sessionId, creation });
      return call('create_case', { request }, CaseCreationResultSchema);
    },
    organizeCase: async (sessionId: string, operation: import('./contracts').CaseOperation): Promise<{ path: string | null }> => {
      const request = OrganizeCaseRequestSchema.parse({ protocolVersion: 1, sessionId, operation });
      return call('organize_case', { request }, CaseOperationResultSchema);
    },
    saveRunDetails: async (sessionId: string, resourceId: string, expectedRevision: string, edit: import('./contracts').RunDetailsEdit): Promise<import('./contracts').RunDetailsResource> => {
      const request = SaveRunDetailsRequestSchema.parse({ protocolVersion: 1, sessionId, resourceId, expectedRevision, edit });
      const result = await call('save_run_details', { request }, RunResourceSchema);
      if (result.kind !== 'details' || !result.document.revision) throw new RepositoryApiError('INVALID_NATIVE_RESPONSE');
      return result;
    },
    saveRunCase: async (sessionId: string, resourceId: string, expectedRevision: string, edit: import('./contracts').RunCaseEdit): Promise<import('./contracts').RunCaseResource> => {
      const request = SaveRunCaseRequestSchema.parse({ protocolVersion: 1, sessionId, resourceId, expectedRevision, edit });
      const result = await call('save_run_case', { request }, RunResourceSchema);
      if (result.kind !== 'case' || !result.document.revision) throw new RepositoryApiError('INVALID_NATIVE_RESPONSE');
      return result;
    },
    createRun: async (sessionId: string, creation: import('./contracts').RunCreation): Promise<{ runId: string }> => {
      const request = CreateRunRequestSchema.parse({ protocolVersion: 1, sessionId, creation });
      return call('create_run', { request }, RunCreationResultSchema);
    },
    gitStatus: async (sessionId: string): Promise<import('./contracts').GitStatus> => {
      const request = SessionRequestSchema.parse({ protocolVersion: 1, sessionId });
      return call('git_status', { request }, GitStatusSchema);
    },
    gitSync: async (sessionId: string, confirmation: string, action: import('./contracts').GitSyncAction): Promise<import('./contracts').GitSyncResult> => {
      const request = GitSyncRequestSchema.parse({ protocolVersion: 1, sessionId, confirmation, action });
      const result = await call('git_sync', { request }, GitSyncResultSchema);
      if (result.repository && result.repository.sessionId !== sessionId) throw new RepositoryApiError('INVALID_NATIVE_RESPONSE');
      return result;
    },
    gitCommit: async (sessionId: string, fileIds: string[], message: string): Promise<import('./contracts').GitCommitResult> => {
      const request = GitCommitRequestSchema.parse({ protocolVersion: 1, sessionId, fileIds, message });
      return call('git_commit', { request }, GitCommitResultSchema);
    },
    gitDiff: async (sessionId: string, fileId: string): Promise<import('./contracts').GitDiff> => {
      const request = GitDiffRequestSchema.parse({ protocolVersion: 1, sessionId, fileId });
      return call('git_diff', { request }, GitDiffSchema);
    },
    catalogRuns: async (sessionId: string): Promise<RunsCatalog> => {
      const request = SessionRequestSchema.parse({ protocolVersion: 1, sessionId });
      return call('catalog_runs', { request }, RunsCatalogSchema);
    },
    readRun: async (sessionId: string, resourceId: string): Promise<RunResource> => {
      const request = ResourceRequestSchema.parse({ protocolVersion: 1, sessionId, resourceId });
      return call('read_run', { request }, RunResourceSchema);
    },
    errorCodeFrom: (error: unknown): RepositoryApiErrorCode => {
      if (error instanceof RepositoryApiError) return error.code;
      const parsed = IpcErrorSchema.safeParse(error);
      return parsed.success ? parsed.data.code : 'NATIVE_COMMAND_FAILED';
    },
  };
}

export const repositoryApi = createRepositoryApi({ invoke: invokeNative });
