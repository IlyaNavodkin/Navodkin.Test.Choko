import { describe, expect, it, vi } from 'vitest';
import type { NwWindow } from '@/lib/nwjs';
import { isWindowMaximized, trackWindowState } from './window-state';

vi.mock('@/services/persist', () => ({ schedulePersist: vi.fn() }));

function tracked(maximized: boolean) {
  const events = new Map<string, () => void>();
  const bounds = { x: 400, y: 300, width: 1480, height: 940 };
  const win = { ...bounds, on: (event: string, listener: () => void) => events.set(event, listener) } as unknown as NwWindow;
  trackWindowState(win, { ...bounds, maximized });
  return (event: string) => events.get(event)?.();
}

describe('native window state events', () => {
  it('records modern NW.js restore events when leaving maximized mode', () => {
    const emit = tracked(true);
    emit('restore');
    expect(isWindowMaximized()).toBe(false);
  });
  it('retains maximization when a maximized window returns from the taskbar', () => {
    const emit = tracked(true);
    emit('minimize');
    emit('restore');
    expect(isWindowMaximized()).toBe(true);
  });
  it('keeps a normal window normal when it returns from the taskbar', () => {
    const emit = tracked(false);
    emit('minimize');
    emit('restore');
    expect(isWindowMaximized()).toBe(false);
    emit('maximize');
    expect(isWindowMaximized()).toBe(true);
  });
});
