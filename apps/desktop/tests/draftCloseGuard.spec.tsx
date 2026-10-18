import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ handler: vi.fn(), destroy: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ destroy: native.destroy, onCloseRequested: async (handler: () => void) => { native.handler.mockImplementation(handler); return () => {}; } }) }));
import { useDraftCloseGuard } from '../src/repository/useCases/edit-case/useDraftCloseGuard';
function deferred() { let resolve!: () => void; const promise = new Promise<void>((yes) => { resolve = yes; }); return { promise, resolve }; }
describe('native close write barrier', () => {
  beforeEach(() => vi.resetAllMocks());
  it('waits for clean-session flush and retains the window on failure', async () => {
    const flush = vi.fn().mockRejectedValueOnce(new Error('failed')).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDraftCloseGuard({ blocked: false, flush }));
    await act(async () => { native.handler({ preventDefault: vi.fn() }); });
    expect(native.destroy).not.toHaveBeenCalled(); expect(result.current.exitFailed).toBe(true);
    await act(() => result.current.confirmExit());
    expect(native.destroy).toHaveBeenCalledOnce(); expect(flush).toHaveBeenCalledTimes(2);
  });
  it('rechecks dirty state created during automatic flush', async () => {
    const pending = deferred();
    const { result, rerender } = renderHook(({ blocked }) => useDraftCloseGuard({ blocked, flush: () => pending.promise }), { initialProps: { blocked: false } });
    act(() => native.handler({ preventDefault: vi.fn() }));
    rerender({ blocked: true });
    await act(async () => pending.resolve());
    expect(native.destroy).not.toHaveBeenCalled(); expect(result.current.closeAttempted).toBe(true);
  });
  it('cannot dismiss explicit close while its flush is pending', async () => {
    const pending = deferred();
    const { result } = renderHook(() => useDraftCloseGuard({ blocked: true, flush: () => pending.promise }));
    act(() => native.handler({ preventDefault: vi.fn() }));
    let exit!: Promise<void>;
    act(() => { exit = result.current.confirmExit(); });
    expect(result.current.isExiting).toBe(true);
    act(() => result.current.cancelClose()); expect(result.current.closeAttempted).toBe(true);
    await act(async () => { pending.resolve(); await exit; });
    await waitFor(() => expect(native.destroy).toHaveBeenCalledOnce());
  });
});
