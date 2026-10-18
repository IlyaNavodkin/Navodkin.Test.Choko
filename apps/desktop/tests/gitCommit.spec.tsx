import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCommitGit } from '../src/repository/useCases/inspect-git/useCommitGit';
import { createRepositoryApi as createApi } from '../src/repository/api/repositoryApi';
import type { GitStatus } from '../src/repository/api/contracts';
function createRepositoryApi({ invoke }: Parameters<typeof createApi>[0]) {
  return createApi({ invoke: (command, args) => command === 'flush_repository' ? Promise.resolve(null) : invoke(command, args) });
}

const sessionId = '550e8400-e29b-41d4-a716-446655440000';
const fileId = '550e8400-e29b-41d4-a716-446655440001';
const foreignId = '550e8400-e29b-41d4-a716-446655440002';
const status: GitStatus = { syncToken: null, abortToken: null, syncBlocked: false, branch: 'main', head: 'a'.repeat(40), unborn: false, detached: false, upstream: null, ahead: null, behind: null, filtersDisabled: false, files: [{ fileId, committable: true, path: 'case.md', originalPath: null, index: 'M', worktree: 'M', unmerged: false, submodule: false }, { fileId: foreignId, committable: false, path: 'foreign.txt', originalPath: null, index: 'M', worktree: '.', unmerged: false, submodule: false }] };
describe('explicit Git commit', () => {
  it('requires valid selection and confirmation; cancel makes no native call', () => {
    const invoke = vi.fn(); const api = createRepositoryApi({ invoke }); const refresh = vi.fn();
    const { result } = renderHook(() => useCommitGit({ sessionId, status, blocked: false, invalidMessage: 'invalid', onBusyChange: vi.fn(), onPendingChange: vi.fn(), refresh, api }));
    act(() => result.current.prepare()); expect(result.current.confirming).toBe(false);
    act(() => result.current.select(foreignId, true)); expect(result.current.form.values.fileIds).toEqual([]);
    act(() => { result.current.select(fileId, true); result.current.form.setFieldValue('message', 'saved versions'); }); act(() => result.current.prepare()); expect(result.current.confirming).toBe(true);
    act(() => result.current.cancel()); expect(result.current.confirming).toBe(false); expect(invoke).not.toHaveBeenCalled();
  });
  it('single-flights commit, retains failed values, and blocks recovery retries', async () => {
    let resolve: ((value: unknown) => void) | undefined;
    const invoke = vi.fn().mockImplementation(() => new Promise<unknown>((done) => { resolve = done; })); const refresh = vi.fn(); const api = createRepositoryApi({ invoke }); const onBusyChange = vi.fn(); const onPendingChange = vi.fn();
    const { result } = renderHook(() => useCommitGit({ sessionId, status, blocked: false, invalidMessage: 'invalid', onBusyChange, onPendingChange, refresh, api }));
    act(() => { result.current.select(fileId, true); result.current.form.setFieldValue('message', 'saved'); }); act(() => result.current.prepare());
    let first: Promise<void> | undefined;
    await act(async () => { first = result.current.commit(); void result.current.commit(); }); expect(invoke).toHaveBeenCalledTimes(1); expect(onPendingChange).toHaveBeenCalledWith(true);
    await act(async () => { resolve?.({ head: 'b'.repeat(40), indexPublished: false, recoveryIndex: 'testoritto-index-550e8400-e29b-41d4-a716-446655440000' }); await first; });
    expect(result.current.recovery).toBe(true); expect(result.current.canCommit).toBe(false); expect(refresh).not.toHaveBeenCalled(); await act(() => result.current.commit()); expect(invoke).toHaveBeenCalledTimes(1);
  });
});
