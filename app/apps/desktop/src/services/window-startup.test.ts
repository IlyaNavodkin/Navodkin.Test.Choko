import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NwWindow } from '@/lib/nwjs';
import { restoreWindowState, trackWindowState } from './window-state';
import { startMainWindow } from './window-startup';

vi.mock('./window-state', () => ({ restoreWindowState: vi.fn(), trackWindowState: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const fakeWindow = () => ({ show: vi.fn(), maximize: vi.fn(), focus: vi.fn() }) as unknown as NwWindow;

describe('main window startup', () => {
  it('keeps background automation hidden without restoring, maximizing, focusing, or persisting it', async () => {
    const win = fakeWindow();
    const render = vi.fn();
    await startMainWindow(win, { background: true, render });
    expect(win.show).toHaveBeenCalledExactlyOnceWith(false);
    expect(render).toHaveBeenCalledOnce();
    expect(restoreWindowState).not.toHaveBeenCalled();
    expect(trackWindowState).not.toHaveBeenCalled();
    expect(win.maximize).not.toHaveBeenCalled();
    expect(win.focus).not.toHaveBeenCalled();
  });
  it('shows the working window before restoring maximization, with tracking installed first', async () => {
    const win = fakeWindow();
    const calls: string[] = [];
    const state = { x: 400, y: 300, width: 1480, height: 940, maximized: true };
    vi.mocked(restoreWindowState).mockImplementation(async () => { calls.push('restore'); return state; });
    vi.mocked(trackWindowState).mockImplementation(() => { calls.push('track'); });
    vi.mocked(win.show).mockImplementation(() => { calls.push('show'); });
    vi.mocked(win.maximize).mockImplementation(() => { calls.push('maximize'); });
    vi.mocked(win.focus).mockImplementation(() => { calls.push('focus'); });
    await startMainWindow(win, { background: false, render: () => { calls.push('render'); } });
    expect(calls).toEqual(['restore', 'track', 'render', 'show', 'maximize', 'focus']);
  });
  it('still reveals the working window if rendering fails', async () => {
    const win = fakeWindow();
    vi.mocked(restoreWindowState).mockResolvedValue(null);
    await expect(startMainWindow(win, { background: false, render: () => { throw new Error('render failed'); } })).rejects.toThrow('render failed');
    expect(win.show).toHaveBeenCalledOnce();
  });
});
