import { createRoot } from 'react-dom/client';

import '@/styles/app.css';

import { App } from '@/components/App';
import { nwWindow, type NwWindow } from '@/lib/nwjs';
import { startMainWindow } from '@/services/window-startup';

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root not found');

// The manifest creates the window hidden (`show:false`) so we can restore its last
// size/position/monitor before it ever appears — no jump from the default placement.
// Outside NW.js (dev preview / browser) `win` is null and this is just a render.
async function boot(win: NwWindow | null) {
  if (!win && import.meta.env.MODE === 'mockup') {
    const { initBrowserMockup } = await import('@/data/browser-mockup');
    initBrowserMockup();
  }
  const render = () => createRoot(container!).render(<App />);
  if (!win) { render(); return; }
  const background = import.meta.env.DEV && new URLSearchParams(window.location.search).get('automation') === '1';
  await startMainWindow(win, { background, render });
}

void boot(nwWindow());
