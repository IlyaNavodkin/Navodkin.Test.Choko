import { describe, expect, it, vi } from 'vitest';
import { createRepositoryApi as createApi, RepositoryApiError } from '../src/repository/api/repositoryApi';
import {
  GitCommitRequestSchema, GitCommitResultSchema, GitStatusSchema, GitDiffRequestSchema, CaseDocumentSchema, CatalogEntrySchema, OpenRepositorySchema, RecentRepositoriesSchema,
  RecentRepositoryRequestSchema, RunResourceSchema, WorkspaceRequestSchema,
  RunCreationSchema, CaseCreationSchema, RememberWorkspaceRequestSchema,
} from '../src/repository/api/contracts';
import { createNativeInvoke, NativeInvokeError } from '../src/shared/infrastructure/tauri/nativeInvoke';

function createRepositoryApi({ invoke }: Parameters<typeof createApi>[0]) {
  return createApi({ invoke: (command, args) => command === 'flush_repository' ? Promise.resolve(null) : invoke(command, args) });
}

const sessionId = '550e8400-e29b-41d4-a716-446655440000';
const resourceId = '550e8400-e29b-41d4-a716-446655440001';
const openDto = { sessionId, displayName: 'Demo', needsInitialization: false, workspaces: [{ path: '', name: 'Demo', displayIdPrefix: 'D', description: '' }], warnings: [] };
const recentId = '550e8400-e29b-41d4-a716-446655440002';
const recentDto = { recentId, displayName: 'Demo', lastOpenedAtMs: 1_797_000_000_000 };

describe('repository API contracts', () => {
  it('preserves typed commit diagnostics across the native wrapper', async () => {
    for (const code of ['GIT_COMMIT_BLOCKED', 'GIT_IDENTITY_MISSING', 'GIT_RECOVERY_REQUIRED'] as const) {
      const native = createNativeInvoke({ isNativeRuntime: true, invoke: vi.fn().mockRejectedValue({ code, message: 'safe diagnostic' }) });
      const api = createRepositoryApi({ invoke: native });
      await expect(api.gitCommit(sessionId, [resourceId], 'saved')).rejects.toMatchObject({ code });
    }
  });
  it('validates explicit commit selection and preserves recovery results', async () => {
    const request = { protocolVersion: 1, sessionId, fileIds: [resourceId], message: 'Сохранённые версии' };
    for (const invalid of [{ ...request, fileIds: [] }, { ...request, fileIds: [resourceId, resourceId] }, { ...request, message: ' ' }, { ...request, message: 'я'.repeat(2049) }, { ...request, path: '../private' }]) expect(GitCommitRequestSchema.safeParse(invalid).success).toBe(false);
    expect(GitCommitResultSchema.safeParse({ head: 'a'.repeat(40), indexPublished: true, recoveryIndex: 'testoritto-index-550e8400-e29b-41d4-a716-446655440000' }).success).toBe(false);
    const result = { head: 'a'.repeat(40), indexPublished: false, recoveryIndex: 'testoritto-index-550e8400-e29b-41d4-a716-446655440000' };
    const invoke = vi.fn().mockResolvedValue(result); const api = createRepositoryApi({ invoke });
    await expect(api.gitCommit(sessionId, [resourceId], request.message)).resolves.toEqual(result);
    expect(invoke).toHaveBeenCalledWith('git_commit', { request });
    await expect(api.gitCommit(sessionId, [], 'bad')).rejects.toThrow(); expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('validates Git status shapes and sends only opaque session/file IDs for diff', async () => {
    const status = { syncToken: null, abortToken: null, syncBlocked: false, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: null, ahead: null, behind: null, filtersDisabled: false, files: [{ fileId: resourceId, committable: true, path: 'case [one].md', originalPath: null, index: 'M', worktree: '.', unmerged: false, submodule: false }] };
    expect(GitStatusSchema.safeParse({ ...status, head: 'bad-hash' }).success).toBe(false);
    expect(GitStatusSchema.safeParse({ ...status, files: [{ ...status.files[0], index: 'reset' }] }).success).toBe(false);
    expect(GitDiffRequestSchema.safeParse({ protocolVersion: 1, sessionId, fileId: resourceId, committable: true, path: '../private' }).success).toBe(false);
    const diff = { path: 'case [one].md', staged: '+staged', workingTree: null, untrackedContent: null, binary: false, unmerged: false, filtersDisabled: false };
    const invoke = vi.fn().mockResolvedValueOnce(status).mockResolvedValueOnce(diff);
    const api = createRepositoryApi({ invoke });
    await expect(api.gitStatus(sessionId)).resolves.toEqual(status);
    await expect(api.gitDiff(sessionId, resourceId)).resolves.toEqual(diff);
    expect(invoke).toHaveBeenLastCalledWith('git_diff', { request: { protocolVersion: 1, sessionId, fileId: resourceId } });
  });
  it('rejects oversized Git diffs and malformed status responses', async () => {
    const invoke = vi.fn().mockResolvedValueOnce({ path: 'new.md', staged: 'x'.repeat(256 * 1024 + 1), workingTree: null, untrackedContent: null, binary: false, unmerged: false, filtersDisabled: false }).mockResolvedValueOnce({ branch: 'main' });
    const api = createRepositoryApi({ invoke });
    await expect(api.gitDiff(sessionId, resourceId)).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
    await expect(api.gitStatus(sessionId)).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
  });

  it('validates run details saves and refuses success responses without a revision', async () => {
    const edit = { status: 'closed' as const, summary: 'Done', notes: '${value}' };
    const document = { kind: 'details', document: { revision: 'b'.repeat(64), model: { name: 'Run', status: 'closed', created: '', testDate: '2026-10-15', scope: '', testerApproval: null, reviewerApproval: null, summary: 'Done', notes: '${value}' }, warnings: [] } };
    const invoke = vi.fn().mockResolvedValueOnce(document).mockResolvedValueOnce({ ...document, document: { ...document.document, revision: undefined } }).mockResolvedValueOnce({ ...document, kind: 'case' });
    const api = createRepositoryApi({ invoke });
    await expect(api.saveRunDetails(sessionId, resourceId, 'a'.repeat(64), edit)).resolves.toEqual(document);
    expect(invoke).toHaveBeenCalledWith('save_run_details', { request: { protocolVersion: 1, sessionId, resourceId, expectedRevision: 'a'.repeat(64), edit } });
    await expect(api.saveRunDetails(sessionId, resourceId, 'a'.repeat(64), edit)).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
    await expect(api.saveRunDetails(sessionId, resourceId, 'a'.repeat(64), edit)).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
  });
  it('validates snapshot run selection/date and rejects malformed native results', async () => {
    const creation = { workspacePath: '', name: 'Run', scope: '', testDate: '2026-10-14', cases: [{ resourceId, expectedRevision: 'a'.repeat(64) }] };
    expect(RunCreationSchema.safeParse({ ...creation, testDate: '2026-02-30' }).success).toBe(false);
    expect(RunCreationSchema.safeParse({ ...creation, cases: [...creation.cases, ...creation.cases] }).success).toBe(false);
    expect(RunCreationSchema.safeParse({ ...creation, cases: [] }).success).toBe(false);
    expect(RunCreationSchema.safeParse({ ...creation, cases: [{ ...creation.cases[0], path: '../outside' }] }).success).toBe(false);
    const runId = '.casewright/runs/2026-10-14-550e8400-e29b-41d4-a716-446655440000';
    const invoke = vi.fn().mockResolvedValueOnce({ runId }).mockResolvedValueOnce({ runId: '../outside' });
    const api = createRepositoryApi({ invoke });
    await expect(api.createRun(sessionId, creation)).resolves.toEqual({ runId });
    expect(invoke).toHaveBeenCalledWith('create_run', { request: { protocolVersion: 1, sessionId, creation } });
    await expect(api.createRun(sessionId, creation)).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
  });

  it('validates creation destination, refuses identity injection and checks the native response', async () => {
    const creation = { workspacePath: '', parentResourceId: null, title: 'New case', source: null };
    expect(CaseCreationSchema.safeParse({ ...creation, id: 'user-supplied-id' }).success).toBe(false);
    expect(CaseCreationSchema.safeParse({ ...creation, workspacePath: '../outside' }).success).toBe(false);
    expect(CaseCreationSchema.safeParse({ ...creation, source: { resourceId, expectedRevision: 'bad' } }).success).toBe(false);
    const invoke = vi.fn().mockResolvedValue({ path: 'suite/new.md' });
    const api = createRepositoryApi({ invoke });
    await expect(api.createCase(sessionId, creation)).resolves.toEqual({ path: 'suite/new.md' });
    expect(invoke).toHaveBeenCalledWith('create_case', { request: { protocolVersion: 1, sessionId, creation } });
    invoke.mockResolvedValueOnce({ path: '../outside.md' });
    await expect(api.createCase(sessionId, creation)).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
  });

  it('accepts Rust tagged folder/case DTOs and rejects shape drift', () => {
    expect(CatalogEntrySchema.parse({ kind: 'folder', metadata: { nodeId: resourceId, path: 'suite', parentPath: '', parentResourceId: null, order: 0, name: 'Suite', displayIdPrefix: 'S', description: '' } }).kind).toBe('folder');
    expect(CatalogEntrySchema.parse({ kind: 'case', metadata: { resourceId, path: 'suite/a.md', parentPath: 'suite', parentResourceId: null, order: 1, id: null, displayId: '', title: 'Title', status: 'draft', tags: [] } }).kind).toBe('case');
    expect(CatalogEntrySchema.safeParse({ kind: 'case', metadata: { resourceId, unexpected: true } }).success).toBe(false);
  });

  it('validates OpenRepository, model nesting, warnings and bounded workspace request', () => {
    expect(OpenRepositorySchema.parse(openDto).sessionId).toBe(sessionId);
    expect(OpenRepositorySchema.parse({ ...openDto, preferredWorkspacePath: '' }).preferredWorkspacePath).toBe('');
    expect(OpenRepositorySchema.parse({ ...openDto, preferredWorkspacePath: null }).preferredWorkspacePath).toBeNull();
    expect(OpenRepositorySchema.parse({ ...openDto, preferredWorkspacePath: undefined }).sessionId).toBe(sessionId);
    expect(OpenRepositorySchema.safeParse({ ...openDto, preferredWorkspacePath: 'not-declared' }).success).toBe(false);
    expect(OpenRepositorySchema.safeParse({ ...openDto, needsInitialization: true, preferredWorkspacePath: '' }).success).toBe(false);
    expect(OpenRepositorySchema.safeParse({
      ...openDto,
      warnings: [{ code: 'RECENT_HISTORY_UNAVAILABLE', message: 'History could not be updated.' }],
    }).success).toBe(true);
    expect(OpenRepositorySchema.safeParse({
      ...openDto,
      warnings: [{ code: 'PREFERRED_WORKSPACE_UNAVAILABLE', message: 'Fallback selected.' }],
    }).success).toBe(true);
    expect(WorkspaceRequestSchema.safeParse({ protocolVersion: 1, sessionId, workspacePath: 'x'.repeat(1025) }).success).toBe(false);
    expect(WorkspaceRequestSchema.safeParse({ protocolVersion: 1, sessionId, workspacePath: 'я'.repeat(513) }).success).toBe(false);
    expect(WorkspaceRequestSchema.safeParse({ protocolVersion: 1, sessionId, workspacePath: '../outside' }).success).toBe(true); // Rust checks the declared workspace membership.
    expect(RememberWorkspaceRequestSchema.safeParse({ protocolVersion: 1, sessionId, workspacePath: '' }).success).toBe(true);
    expect(RememberWorkspaceRequestSchema.safeParse({ protocolVersion: 1, sessionId, workspacePath: '../outside' }).success).toBe(false);
    expect(RememberWorkspaceRequestSchema.safeParse({ protocolVersion: 1, sessionId, workspacePath: 'areas/.git' }).success).toBe(false);
    expect(RememberWorkspaceRequestSchema.safeParse({ protocolVersion: 1, sessionId, workspacePath: 'areas\\escape' }).success).toBe(false);
    expect(RememberWorkspaceRequestSchema.safeParse({ protocolVersion: 1, sessionId, workspacePath: 'a\0b' }).success).toBe(false);
    expect(CaseDocumentSchema.safeParse({ model: { id: null, steps: [{ text: 'x', depth: 4 }] }, warnings: [] }).success).toBe(false);
    expect(RunResourceSchema.safeParse({ kind: 'details', document: { model: {}, warnings: [] } }).success).toBe(false);
  });

  it('invokes typed commands with protocol envelope and validates response', async () => {
    const invoke = vi.fn().mockResolvedValue(openDto);
    const api = createRepositoryApi({ invoke });
    await expect(api.open()).resolves.toEqual(openDto);
    expect(invoke).toHaveBeenCalledWith('pick_repository', { request: { protocolVersion: 1 } });
    invoke.mockResolvedValueOnce(null);
    await expect(api.open()).resolves.toBeNull();
    invoke.mockResolvedValueOnce({ sessionId: 'bad' });
    await expect(api.open()).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
  });

  it('maps native codes without exposing native messages and keeps request IDs strict', async () => {
    const api = createRepositoryApi({ invoke: vi.fn().mockRejectedValue(new NativeInvokeError('GIT_UNAVAILABLE')) });
    await expect(api.catalogRuns(sessionId)).rejects.toBeInstanceOf(RepositoryApiError);
    await expect(api.catalogRuns(sessionId)).rejects.toMatchObject({ code: 'GIT_UNAVAILABLE' });
    const invalid = createRepositoryApi({ invoke: vi.fn() });
    await expect(invalid.readCase(sessionId.toUpperCase(), resourceId)).rejects.toBeInstanceOf(Error);
  });

  it('validates recent DTOs and invokes list/open with strict protocol-only envelopes', async () => {
    expect(RecentRepositoriesSchema.parse([recentDto])).toEqual([recentDto]);
    expect(RecentRepositoriesSchema.safeParse([{ ...recentDto, canonicalPath: 'C:/secret' }]).success).toBe(false);
    expect(RecentRepositoriesSchema.safeParse([{ ...recentDto, lastOpenedAtMs: Number.MAX_SAFE_INTEGER + 1 }]).success).toBe(false);
    expect(RecentRepositoriesSchema.safeParse([{ ...recentDto, displayName: 'я'.repeat(257) }]).success).toBe(false);
    expect(RecentRepositoryRequestSchema.safeParse({ protocolVersion: 1, recentId, path: 'C:/secret' }).success).toBe(false);
    expect(RecentRepositoryRequestSchema.safeParse({ protocolVersion: 1, recentId: recentId.toUpperCase() }).success).toBe(false);

    const invoke = vi.fn().mockResolvedValueOnce([recentDto]);
    const api = createRepositoryApi({ invoke });
    await expect(api.listRecentRepositories()).resolves.toEqual([recentDto]);
    expect(invoke).toHaveBeenNthCalledWith(1, 'list_recent_repositories', { request: { protocolVersion: 1 } });
    const openedWithWarning = {
      ...openDto,
      warnings: [{ code: 'RECENT_HISTORY_UNAVAILABLE', message: 'History could not be updated.' }],
    };
    invoke.mockResolvedValueOnce(openedWithWarning);
    await expect(api.openRecentRepository(recentId)).resolves.toEqual(openedWithWarning);
    expect(invoke).toHaveBeenNthCalledWith(2, 'open_recent_repository', { request: { protocolVersion: 1, recentId } });
  });

  it('rejects malformed recent responses and maps recent errors to safe typed codes', async () => {
    const malformed = createRepositoryApi({ invoke: vi.fn().mockResolvedValue([{ ...recentDto, path: 'C:/private' }]) });
    await expect(malformed.listRecentRepositories()).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
    const unavailable = createRepositoryApi({ invoke: vi.fn().mockRejectedValue(new NativeInvokeError('RECENT_HISTORY_UNAVAILABLE')) });
    await expect(unavailable.openRecentRepository(recentId)).rejects.toMatchObject({ code: 'RECENT_HISTORY_UNAVAILABLE' });
  });

  it('persists only validated declared workspace payloads and validates unit response', async () => {
    const invoke = vi.fn().mockResolvedValue(null);
    const api = createRepositoryApi({ invoke });
    await expect(api.rememberWorkspace(sessionId, '')).resolves.toBeUndefined();
    expect(invoke).toHaveBeenCalledWith('remember_workspace', { request: { protocolVersion: 1, sessionId, workspacePath: '' } });
    await expect(api.rememberWorkspace(sessionId, '../escape')).rejects.toThrow();
    invoke.mockResolvedValueOnce({ ok: true });
    await expect(api.rememberWorkspace(sessionId, 'areas/QA')).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
  });
});
