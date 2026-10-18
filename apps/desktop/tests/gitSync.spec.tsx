import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useSyncGit } from '../src/repository/useCases/inspect-git/useSyncGit';
import { createRepositoryApi as createApi } from '../src/repository/api/repositoryApi';
import { createNativeInvoke } from '../src/shared/infrastructure/tauri/nativeInvoke';
import { GitSyncRequestSchema, GitSyncResultSchema, type GitStatus } from '../src/repository/api/contracts';
function createRepositoryApi({ invoke }: Parameters<typeof createApi>[0]) {
  return createApi({ invoke: (command, args) => command === 'flush_repository' ? Promise.resolve(null) : invoke(command, args) });
}

const sessionId = '550e8400-e29b-41d4-a716-446655440000';
const token = '550e8400-e29b-41d4-a716-446655440001';
const abortToken = '550e8400-e29b-41d4-a716-446655440002';
const repository = { sessionId, displayName: 'Repo', needsInitialization: false, workspaces: [], warnings: [] };
const status: GitStatus = { syncToken: token, abortToken: null, syncBlocked: false, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: 'origin/main', ahead: 1, behind: 0, filtersDisabled: false, files: [] };
const conflict = { outcome: 'conflict', abortToken, unmergedPaths: ['case.md'], repository: null, reloadRequired: false };
describe('explicit Git synchronization', () => {
  it('validates opaque confirmations and complete applied states', async () => {
    const request = { protocolVersion: 1, sessionId, confirmation: token, action: 'push' };
    for (const invalid of [{ ...request, action: 'force' }, { ...request, confirmation: '../path' }, { ...request, remote: 'other' }]) expect(GitSyncRequestSchema.safeParse(invalid).success).toBe(false);
    for (const invalid of [{ ...conflict, abortToken: null }, { ...conflict, outcome: 'pushed' }, { outcome: 'pulled', abortToken: null, unmergedPaths: [], repository: null, reloadRequired: false }]) expect(GitSyncResultSchema.safeParse(invalid).success).toBe(false);
    const api = createRepositoryApi({ invoke: vi.fn().mockResolvedValue({ outcome: 'pulled', abortToken: null, unmergedPaths: [], repository: { ...repository, sessionId: token }, reloadRequired: false }) });
    await expect(api.gitSync(sessionId, token, 'pull')).rejects.toMatchObject({ code: 'INVALID_NATIVE_RESPONSE' });
    for (const code of ['GIT_SYNC_BLOCKED', 'GIT_DIRTY', 'GIT_NO_UPSTREAM', 'GIT_AUTH_FAILED', 'GIT_REMOTE_FAILED', 'GIT_NETWORK_FAILED', 'GIT_PUSH_REJECTED', 'GIT_ABORT_FAILED'] as const) {
      const native = createNativeInvoke({ isNativeRuntime: true, invoke: vi.fn().mockRejectedValue({ code, message: 'safe' }) });
      await expect(createRepositoryApi({ invoke: native }).gitSync(sessionId, token, 'push')).rejects.toMatchObject({ code });
    }
  });
  it('cancels without mutation and single-flights a confirmed push', async () => {
    let resolve: ((value: unknown) => void) | undefined;
    const invoke = vi.fn().mockImplementation(() => new Promise<unknown>((done) => { resolve = done; }));
    const refresh = vi.fn(); const onApplied = vi.fn(); const api = createRepositoryApi({ invoke });
    const { result } = renderHook(() => useSyncGit({ sessionId, status, blocked: false, onApplied, refresh, api }));
    act(() => result.current.prepare('pull')); act(() => result.current.cancel()); expect(invoke).not.toHaveBeenCalled();
    act(() => result.current.prepare('push')); let pending: Promise<void> | undefined;
    await act(async () => { pending = result.current.execute(); void result.current.execute(); }); expect(invoke).toHaveBeenCalledTimes(1);
    await act(async () => { resolve?.({ outcome: 'pushed', abortToken: null, unmergedPaths: [], repository: null, reloadRequired: false }); await pending; });
    expect(invoke).toHaveBeenCalledWith('git_sync', { request: { protocolVersion: 1, sessionId, confirmation: token, action: 'push' } });
    expect(refresh).toHaveBeenCalledOnce(); expect(onApplied).not.toHaveBeenCalled();
  });
  it('reports owned conflict, confirms abort and applies refreshed metadata', async () => {
    const aborted = { outcome: 'aborted', abortToken: null, unmergedPaths: [], repository, reloadRequired: false };
    const invoke = vi.fn().mockResolvedValueOnce(conflict).mockResolvedValueOnce(aborted); const api = createRepositoryApi({ invoke }); const onApplied = vi.fn();
    const { result } = renderHook(() => useSyncGit({ sessionId, status, blocked: false, onApplied, refresh: vi.fn(), api }));
    act(() => result.current.prepare('pull')); await act(() => result.current.execute()); expect(result.current.conflict).toBe(true); expect(result.current.canSync).toBe(false);
    act(() => result.current.prepare('abort')); await act(() => result.current.execute());
    expect(invoke.mock.calls[1]?.[1]).toEqual({ request: { protocolVersion: 1, sessionId, confirmation: abortToken, action: 'abort' } });
    expect(onApplied).toHaveBeenCalledWith(aborted); expect(result.current.conflict).toBe(false);
  });
  it('allows retry of preflight errors but blocks failed abort', async () => {
    const invoke = vi.fn().mockRejectedValueOnce({ code: 'GIT_SYNC_BLOCKED', message: 'safe' }).mockResolvedValueOnce(conflict).mockRejectedValueOnce({ code: 'GIT_ABORT_FAILED', message: 'safe' });
    const api = createRepositoryApi({ invoke: createNativeInvoke({ isNativeRuntime: true, invoke }) });
    const { result } = renderHook(() => useSyncGit({ sessionId, status, blocked: false, onApplied: vi.fn(), refresh: vi.fn(), api }));
    act(() => result.current.prepare('pull')); await act(() => result.current.execute()); expect(result.current.recovery).toBe(false);
    act(() => result.current.prepare('pull')); await act(() => result.current.execute()); act(() => result.current.prepare('abort')); await act(() => result.current.execute());
    expect(result.current.recovery).toBe(true); act(() => result.current.prepare('abort')); expect(result.current.confirming).toBeNull(); expect(invoke).toHaveBeenCalledTimes(3);
  });
});
