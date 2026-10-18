import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRepositoryChanges } from '../src/repository/useCases/browse-repository/useRepositoryChanges';
import { RepositoryChangeSchema, type RepositoryChange } from '../src/repository/api/contracts';
import type { RepositoryChangeListener } from '../src/repository/api/repositoryEvents';

const session = '550e8400-e29b-41d4-a716-446655440000';
function fixture() {
  let receive: (event: RepositoryChange) => void = () => {};
  let invalid: () => void = () => {};
  const release = vi.fn();
  const subscribe: RepositoryChangeListener = vi.fn(async (next, fail) => { receive = next; invalid = fail; return release; });
  const refresh = vi.fn(async (_id: string, isCurrent: () => boolean) => { if (!isCurrent()) throw new Error('stale'); });
  const args = { sessionId: session, enabled: true, blocked: false, subscribe, refresh, errorCodeFrom: () => 'INVALID_CONFIG' as const };
  return { args, refresh, release, invalid: () => invalid(), emit: (epoch: number, id = session) => receive({ sessionId: id, epoch, kind: 'content', errorCode: null }) };
}
afterEach(cleanup);
describe('repository native change handling', () => {
  it('coalesces events and holds all reloads while a draft, save or confirmation blocks refresh', async () => {
    const f = fixture();
    const { result, rerender } = renderHook((props) => useRepositoryChanges(props), { initialProps: { ...f.args, blocked: true } });
    act(() => { for (let n = 1; n < 50; n += 1) f.emit(n); });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(f.refresh).not.toHaveBeenCalled();
    rerender(f.args);
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(f.refresh).toHaveBeenCalledTimes(1);
    expect(f.refresh.mock.calls[0]?.[0]).toBe(session);
  });
  it('reloads clean state, rejects other sessions and stale epochs, and releases the listener', async () => {
    const f = fixture();
    const { result, unmount } = renderHook(() => useRepositoryChanges(f.args));
    act(() => f.emit(1));
    await waitFor(() => expect(f.refresh).toHaveBeenCalledTimes(1));
    act(() => { f.emit(2); f.emit(1); f.emit(9, '550e8400-e29b-41d4-a716-446655440001'); });
    await waitFor(() => expect(f.refresh).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.pending).toBe(false));
    unmount(); expect(f.release).toHaveBeenCalledTimes(1);
    act(() => f.emit(3));
    expect(f.refresh).toHaveBeenCalledTimes(2);
  });
  it('retains pending updates on typed configuration failure and retries only on another action', async () => {
    const f = fixture(); f.refresh.mockRejectedValue(new Error('private native path'));
    const { result } = renderHook(() => useRepositoryChanges(f.args));
    act(() => f.emit(1));
    await waitFor(() => expect(result.current.errorCode).toBe('INVALID_CONFIG'));
    expect(result.current.pending).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(f.refresh).toHaveBeenCalledTimes(1);
    f.refresh.mockResolvedValue(undefined);
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.errorCode).toBeNull();
  });
  it('cleans up late registration and prevents an in-flight result from publishing after blocking', async () => {
    const f = fixture(); let finish: (() => void) | undefined;
    let canPublish: (() => boolean) | undefined;
    f.refresh.mockImplementation(async (_id, check) => { canPublish = check; await new Promise<void>((resolve) => { finish = resolve; }); });
    const { rerender, unmount } = renderHook((props) => useRepositoryChanges(props), { initialProps: f.args });
    act(() => f.emit(1));
    await waitFor(() => expect(f.refresh).toHaveBeenCalledOnce());
    rerender({ ...f.args, blocked: true });
    expect(canPublish?.()).toBe(false);
    await act(async () => finish?.());
    unmount(); expect(f.release).toHaveBeenCalledOnce();
    let register: ((release: () => void) => void) | undefined;
    const late = renderHook(() => useRepositoryChanges({ ...f.args, subscribe: () => new Promise((resolve) => { register = resolve; }) }));
    late.unmount();
    const release = vi.fn(); await act(async () => register?.(release)); expect(release).toHaveBeenCalledOnce();
  });
  it('reports sanitized listener health and rejects paths, unknown codes and malformed payloads', async () => {
    const f = fixture(); const { result } = renderHook(() => useRepositoryChanges(f.args));
    act(f.invalid); expect(result.current.healthFailed).toBe(true);
    for (const bad of [{ sessionId: session, epoch: 1, kind: 'content', errorCode: null, path: 'C:/secret' }, { sessionId: session, epoch: 0, kind: 'content', errorCode: null }, { sessionId: 'invalid', epoch: 1, kind: 'content', errorCode: null }, { sessionId: session, epoch: 1, kind: 'content', errorCode: 'native stderr' }]) expect(RepositoryChangeSchema.safeParse(bad).success).toBe(false);
  });
  it('runs one refresh at a time and coalesces changes received during a slow refresh', async () => {
    const f = fixture(); let finish: (() => void) | undefined;
    f.refresh.mockImplementationOnce(async () => new Promise<void>((resolve) => { finish = resolve; }));
    const { result } = renderHook(() => useRepositoryChanges(f.args));
    act(() => f.emit(1));
    await waitFor(() => expect(f.refresh).toHaveBeenCalledOnce());
    act(() => { f.emit(2); f.emit(3); f.emit(4); });
    await new Promise((resolve) => setTimeout(resolve, 180));
    expect(f.refresh).toHaveBeenCalledOnce();
    await act(async () => finish?.());
    await waitFor(() => expect(f.refresh).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.pending).toBe(false));
  });

});
