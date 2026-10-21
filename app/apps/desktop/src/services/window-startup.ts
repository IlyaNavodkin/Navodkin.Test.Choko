import type { NwWindow } from '@/lib/nwjs';
import { restoreWindowState, trackWindowState, type WindowState } from './window-state';

/** Background checks never restore/show/focus or save a main-window geometry. */
export async function startMainWindow(win: NwWindow, { background, render }: { background: boolean; render: () => void }): Promise<void> {
  if (background) {
    win.show(false);
    render();
    return;
  }
  let restored: WindowState | null = null;
  try {
    restored = await restoreWindowState(win);
  } catch (error) {
    console.error('[window-state] restore failed', error);
  }
  trackWindowState(win, restored);
  try {
    render();
  } finally {
    win.show();
    // Maximizing a hidden NW.js window can reveal it; show it deliberately first.
    if (restored?.maximized) win.maximize();
    win.focus();
  }
}
