import { createRoot } from 'react-dom/client';

import '@/styles/app.css';

import { App } from '@/components/App';
import { nwWindow, type NwWindow } from '@/lib/nwjs';
import { restoreWindowState, trackWindowState, type WindowState } from '@/services/window-state';

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root not found');

// The manifest creates the window hidden (`show:false`) so we can restore its last
// size/position/monitor before it ever appears — no jump from the default placement.
// Outside NW.js (dev preview / browser) `win` is null and this is just a render.
async function boot(win: NwWindow | null) {
  let restored: WindowState | null = null;
  if (win) {
    try {
      restored = await restoreWindowState(win);
    } catch (err) {
      console.error('[window-state] restore failed', err);
    }
  }
  try {
    createRoot(container!).render(<App />);
  } finally {
    // Always reveal the (now correctly-placed) window — in `finally` so a render
    // error can never leave it stuck hidden — then begin persisting future changes.
    if (win) {
      win.show();
      win.focus();
      trackWindowState(win, restored);
    }
  }
}

void boot(nwWindow());
