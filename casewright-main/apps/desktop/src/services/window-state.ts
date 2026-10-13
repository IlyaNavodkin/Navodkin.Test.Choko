/**
 * Persist and restore the NW.js main-window geometry (size, position, monitor, and
 * maximized state) across launches. State lives in the OS data dir (next to recents),
 * not the repo. Everything no-ops gracefully outside NW.js (dev preview / tests).
 *
 * The window is created hidden (`show:false` in the manifest) so {@link restoreWindowState}
 * can place it before it ever appears — no jump from the default position on launch.
 */
import { node } from '@/lib/node';
import { appDataPath, screenWorkAreas, type NwWindow, type ScreenRect } from '@/lib/nwjs';
import { schedulePersist } from '@/services/persist';

const FILE = 'window-state.json';
const PERSIST_KEY = 'window-state';

// Sanity floor for a corrupt / absurdly small saved size on restore — NOT a usability
// minimum. The manifest no longer constrains `min_width` (the window can be dragged
// arbitrarily narrow while running), so this only guards against restoring a degenerate
// window. `min_height` still mirrors the manifest.
const MIN_WIDTH = 240;
const MIN_HEIGHT = 640;
// A saved window is only restored in place if at least this much of it lands on some
// monitor — otherwise a window left on a since-unplugged display would open off-screen.
const MIN_VISIBLE = 80;

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface WindowState extends WindowBounds {
  maximized: boolean;
}

function stateFile(): string | null {
  const dir = appDataPath();
  return dir ? node.path().join(dir, FILE) : null;
}

const isFiniteNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Validate + normalize a persisted blob into a WindowState, or null if malformed. */
export function parseWindowState(raw: unknown): WindowState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (![o.x, o.y, o.width, o.height].every(isFiniteNum)) return null;
  if ((o.width as number) <= 0 || (o.height as number) <= 0) return null;
  return {
    x: o.x as number,
    y: o.y as number,
    width: o.width as number,
    height: o.height as number,
    maximized: o.maximized === true,
  };
}

export async function loadWindowState(): Promise<WindowState | null> {
  const file = stateFile();
  if (!file) return null;
  try {
    return parseWindowState(JSON.parse(await node.fsp().readFile(file, 'utf8')));
  } catch {
    return null; // missing / unreadable / malformed — fall back to defaults
  }
}

async function writeAsync(state: WindowState): Promise<void> {
  const file = stateFile();
  if (!file) return;
  await node.fsp().mkdir(node.path().dirname(file), { recursive: true });
  await node.fsp().writeFile(file, JSON.stringify(state, null, 2) + '\n');
}

/** Synchronous twin of {@link writeAsync}, for the `beforeunload` flush (see below). */
function writeSync(state: WindowState): void {
  const file = stateFile();
  if (!file) return;
  const fs = node.fs();
  fs.mkdirSync(node.path().dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
}

/** Overlap extent (px) of a window rect with a monitor rect; negative when disjoint. */
function overlap(a: WindowBounds, m: ScreenRect): { w: number; h: number } {
  return {
    w: Math.min(a.x + a.width, m.x + m.width) - Math.max(a.x, m.x),
    h: Math.min(a.y + a.height, m.y + m.height) - Math.max(a.y, m.y),
  };
}

/** True when a usable chunk of the window falls within a single connected monitor. */
export function isVisibleOnScreens(bounds: WindowBounds, monitors: ScreenRect[]): boolean {
  if (monitors.length === 0) return true; // no Screen info — trust the saved value
  return monitors.some((m) => {
    const o = overlap(bounds, m);
    return o.w >= Math.min(MIN_VISIBLE, bounds.width) && o.h >= Math.min(MIN_VISIBLE, bounds.height);
  });
}

/**
 * Fit saved bounds to the connected monitors: enforce the minimum size and, if the
 * window would open off every screen (its monitor was unplugged / rearranged),
 * recenter it on the primary monitor's work area, shrinking to fit if needed.
 */
export function clampToScreens(bounds: WindowBounds, monitors: ScreenRect[]): WindowBounds {
  let { x, y } = bounds;
  let width = Math.max(bounds.width, MIN_WIDTH);
  let height = Math.max(bounds.height, MIN_HEIGHT);

  if (monitors.length === 0) return { x, y, width, height };
  if (isVisibleOnScreens({ x, y, width, height }, monitors)) return { x, y, width, height };

  const primary = monitors[0];
  width = Math.min(width, primary.width);
  height = Math.min(height, primary.height);
  x = Math.round(primary.x + (primary.width - width) / 2);
  y = Math.round(primary.y + (primary.height - height) / 2);
  return { x, y, width, height };
}

/* ---- live tracking (singleton main window) ---- */

let normal: WindowBounds = { x: 0, y: 0, width: MIN_WIDTH, height: MIN_HEIGHT };
let maximized = false;

/** Current maximized state, so the titlebar's glyph can initialize correctly after a restore. */
export function isWindowMaximized(): boolean {
  return maximized;
}

/**
 * Restore the saved geometry onto `win` *before it is shown*. Validates against the
 * monitors currently connected, so a window saved on a now-absent display reopens
 * centered on the primary one. Returns the applied state (for {@link trackWindowState}'s
 * seed), or null when there's nothing saved.
 */
export async function restoreWindowState(win: NwWindow): Promise<WindowState | null> {
  const saved = await loadWindowState();
  if (!saved) return null;
  const fitted = clampToScreens(saved, screenWorkAreas());
  win.resizeTo(fitted.width, fitted.height);
  win.moveTo(fitted.x, fitted.y);
  // Set the restore bounds first (above), then maximize — so un-maximizing returns
  // to the fitted size rather than a default.
  if (saved.maximized) win.maximize();
  return { ...fitted, maximized: saved.maximized };
}

/**
 * Persist `win`'s geometry as the user moves / resizes / maximizes it. Writes are
 * debounced (coalescing a drag into one write); the maximized flag tracks the
 * maximize / unmaximize events; and the final state is flushed *synchronously* on
 * page unload so even a resize-then-immediately-close still sticks.
 *
 * `initial` seeds the in-memory state from {@link restoreWindowState} so the maximized
 * flag and restore bounds are correct before the first move/resize event arrives.
 */
export function trackWindowState(win: NwWindow, initial: WindowState | null): void {
  normal = initial
    ? { x: initial.x, y: initial.y, width: initial.width, height: initial.height }
    : { x: win.x, y: win.y, width: win.width, height: win.height };
  maximized = initial?.maximized ?? false;

  // Read geometry at flush time (not when the event fires) so the maximize/unmaximize
  // flag has settled — avoids races where a resize event arrives before `maximize`
  // and would otherwise capture the maximized geometry as the "normal" bounds.
  const captureNormal = () => {
    if (!maximized) normal = { x: win.x, y: win.y, width: win.width, height: win.height };
  };
  const persist = () =>
    schedulePersist(PERSIST_KEY, () => {
      captureNormal();
      return writeAsync({ ...normal, maximized });
    });

  const onMaximize = () => {
    maximized = true;
    persist();
  };
  const onUnmaximize = () => {
    maximized = false;
    persist();
  };

  win.on('resize', persist);
  win.on('move', persist);
  win.on('maximize', onMaximize);
  win.on('unmaximize', onUnmaximize);

  // A NW.js 'close' listener would suppress the default close, so capture the final
  // state on the page's own unload instead. Synchronous — the process is exiting.
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      try {
        captureNormal();
        writeSync({ ...normal, maximized });
      } catch {
        /* best effort on the way out */
      }
    });
  }
}
