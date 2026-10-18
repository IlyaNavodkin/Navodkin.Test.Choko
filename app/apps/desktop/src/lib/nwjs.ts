/**
 * Thin, typed access to the NW.js window APIs, with graceful fallbacks so the
 * app still runs in a plain browser (dev preview, tests) where `nw` is absent.
 */
/** Options for NW.js's headless print-to-PDF (`win.print`). */
export interface NwPrintOptions {
  /** Destination path — when set, prints silently to this PDF instead of a printer. */
  pdf_path: string;
  headerFooterEnabled?: boolean;
  landscape?: boolean;
  /** 0 default · 1 none · 2 minimum. */
  marginsType?: 0 | 1 | 2;
  shouldPrintBackgrounds?: boolean;
  scaleFactor?: number;
}

export interface NwWindow {
  /** Window geometry in screen coordinates (read/write properties in NW.js). */
  x: number;
  y: number;
  width: number;
  height: number;
  minimize(): void;
  maximize(): void;
  unmaximize(): void;
  restore(): void;
  /** Reveal a window created with `show:false` (and bring it forward). */
  show(show?: boolean): void;
  focus(): void;
  moveTo(x: number, y: number): void;
  resizeTo(width: number, height: number): void;
  close(force?: boolean): void;
  reload(): void;
  showDevTools?(): void;
  print(options: NwPrintOptions): void;
  on(event: string, listener: () => void): void;
  /** Remove a single listener (so independent subscribers can coexist on one event). */
  removeListener(event: string, listener: () => void): void;
  removeAllListeners(event: string): void;
}

/** A rectangle in NW.js Screen coordinates (monitor `bounds` / `work_area`). */
export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NwScreenInfo {
  /** Full monitor rectangle. */
  bounds: ScreenRect;
  /** Usable area excluding the OS taskbar / dock. */
  work_area: ScreenRect;
}

interface NwScreen {
  /** Must be called once before reading `screens`. */
  Init(): void;
  screens: NwScreenInfo[];
}

interface NwWinOpenOptions {
  show?: boolean;
  focus?: boolean;
  new_instance?: boolean;
  width?: number;
  height?: number;
  title?: string;
  /** Where NW.js places the new window; `'center'` centers it on screen. */
  position?: 'center' | 'mouse' | null;
}

interface NwGlobal {
  Window: {
    get(): NwWindow;
    open(url: string, options: NwWinOpenOptions, cb: (win: NwWindow) => void): void;
  };
  App?: { dataPath: string; argv: string[]; quit?(): void };
  Shell?: { openExternal(uri: string): void };
  Screen?: NwScreen;
  require?: NodeRequire;
}

declare global {
  interface Window {
    nw?: NwGlobal;
  }
}

/** True when running inside NW.js (vs a plain browser). */
export const isNwjs = (): boolean => typeof window !== 'undefined' && !!window.nw;

/** The current NW.js window, or null when not running under NW.js. */
export function nwWindow(): NwWindow | null {
  return window.nw?.Window.get() ?? null;
}

/** The per-app data directory (NW.js `nw.App.dataPath`), for app-level state like recents. */
export function appDataPath(): string | null {
  return window.nw?.App?.dataPath ?? null;
}

let screenInited = false;

/**
 * Usable work areas (taskbar/dock excluded) of every connected monitor, in NW.js
 * Screen coordinates. Empty outside NW.js. Used to validate a restored window's
 * bounds against the displays currently attached.
 */
export function screenWorkAreas(): ScreenRect[] {
  const screen = window.nw?.Screen;
  if (!screen) return [];
  if (!screenInited) {
    // `Init` must run once before `screens`; it throws if called twice, so guard it.
    try {
      screen.Init();
    } catch {
      /* already initialized */
    }
    screenInited = true;
  }
  return (screen.screens ?? []).map((s) => s.work_area ?? s.bounds).filter(Boolean);
}

/**
 * Open a visible NW.js window at `url` (e.g. a local `file://` report preview) and resolve
 * with its handle, or `null` when not in NW.js or the open fails. The window shares the
 * app's `nw`/Node context (no `new_instance`), so the page it loads can use the NW.js APIs.
 */
export function openWindow(url: string, options: NwWinOpenOptions = {}): Promise<NwWindow | null> {
  return new Promise((resolve) => {
    const nw = window.nw;
    if (!nw) {
      resolve(null);
      return;
    }
    nw.Window.open(url, { show: true, focus: true, ...options }, (win) => resolve(win ?? null));
  });
}

/** Open a URL in the user's default browser (NW.js Shell), with a plain-browser fallback. */
export function openExternal(url: string): void {
  const shell = window.nw?.Shell;
  if (shell) shell.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}

/** Runtime versions exposed by NW.js (Node-integrated renderer); empty in a plain browser. */
export function runtimeVersions(): { nw?: string; chromium?: string; node?: string } {
  const v = (globalThis as { process?: { versions?: Record<string, string> } }).process?.versions;
  return { nw: v?.nw, chromium: v?.chromium ?? v?.chrome, node: v?.node };
}

/**
 * Quit the whole app — not just the window. Used by the updater so a Windows
 * installer can replace the running (locked) executable. Falls back to a forced
 * window close if `nw.App.quit` is unavailable.
 */
export function quitApp(): void {
  const app = window.nw?.App;
  if (app?.quit) app.quit();
  else nwWindow()?.close(true);
}

/** Absolute path of the running executable (Node global `process.execPath`); null in a plain browser. */
export function execPath(): string | null {
  return (globalThis as { process?: { execPath?: string } }).process?.execPath ?? null;
}

/**
 * Prompt the user to pick a directory via NW.js's `<input nwdirectory>`.
 * Resolves to the absolute path, or `null` if cancelled / not in NW.js.
 */
export function pickDirectory(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('nwdirectory', '');
    input.style.display = 'none';

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      input.remove();
      resolve(value);
    };
    // `<input type=file>` fires no event on cancel — detect it via window refocus.
    const onFocus = () => setTimeout(() => finish(input.files?.length ? pathOf(input) : null), 350);

    input.onchange = () => finish(pathOf(input));
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

function pathOf(input: HTMLInputElement): string | null {
  const file = input.files?.[0] as (File & { path?: string }) | undefined;
  return file?.path ?? (input.value || null);
}

/**
 * Prompt the user for a save destination via NW.js's `<input nwsaveas>`.
 * Resolves to the absolute path, or `null` if cancelled / not in NW.js.
 * Mirrors {@link pickDirectory}, including its focus-based cancel detection.
 */
export function saveFile(defaultName: string): Promise<string | null> {
  return new Promise((resolve) => {
    // Honor the documented contract: null when not in NW.js (dev preview / tests), rather
    // than opening a plain browser file input.
    if (typeof document === 'undefined' || !window.nw) {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('nwsaveas', defaultName);
    input.style.display = 'none';

    let settled = false;
    // The dialog blurs the window when it opens; only a refocus *after* that means it
    // closed. Without this gate, a spurious focus right after click() cancels the very
    // first export (the window's focus isn't yet "warm"), so it silently no-ops until
    // a second try.
    let armed = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
      input.remove();
      console.debug('[pdf] saveFile: resolved destination', value ?? '(cancelled)');
      resolve(value);
    };
    const onBlur = () => {
      armed = true;
    };
    // `<input type=file>` fires no event on cancel — detect it via the post-open refocus.
    const onFocus = () => {
      if (!armed) return;
      setTimeout(() => finish(input.files?.length ? pathOf(input) : null), 350);
    };

    input.onchange = () => finish(pathOf(input));
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Render `url` to a PDF at `pdfPath` using NW.js's native print-to-PDF: open a hidden
 * window, wait for it to finish loading, print it, then close. Resolves once the PDF is
 * written. Rejects (and still closes the window) on error or a 15s timeout.
 */
export function printToPdf(url: string, pdfPath: string, opts: Partial<NwPrintOptions> = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const nw = window.nw;
    if (!nw) {
      reject(new Error('Not in NW.js'));
      return;
    }
    console.debug('[pdf] printToPdf: opening hidden window', { url, pdfPath });
    // Guard the open() callback itself: if NW.js never invokes it (or invokes it with no
    // window), nothing downstream ever settles and the export hangs silently. This outer
    // timer is cleared as soon as the per-window `done`/timer takes over.
    let opened = false;
    const openTimer = setTimeout(() => {
      if (opened) return;
      console.error('[pdf] printToPdf: window.open callback never fired within 15s', { url });
      reject(new Error('PDF window did not open'));
    }, 15000);
    nw.Window.open(url, { show: false, focus: false }, (win) => {
      opened = true;
      clearTimeout(openTimer);
      if (!win) {
        console.error('[pdf] printToPdf: window.open callback gave no window', { url });
        reject(new Error('PDF window did not open'));
        return;
      }
      let settled = false;
      const done = (err?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (err) console.error('[pdf] printToPdf: failed', err);
        else console.debug('[pdf] printToPdf: done, PDF written to', pdfPath);
        try {
          win.close(true);
        } catch (e) {
          console.warn('[pdf] printToPdf: window close failed (already gone?)', e);
        }
        if (err) reject(err);
        else resolve();
      };
      // Guard against a window that never fires `loaded` (or a hung print).
      const timer = setTimeout(() => done(new Error('PDF render timed out')), 15000);
      // Print only after the document has fully loaded — printing earlier yields a blank page.
      win.on('loaded', () => {
        console.debug('[pdf] printToPdf: window loaded, printing');
        try {
          win.print({
            pdf_path: pdfPath,
            headerFooterEnabled: false,
            // 0 = Chromium's default margins. These repeat on every page (unlike a CSS
            // `@page` margin, which this print path ignores) so multi-page reports stay
            // padded. `1` (no margins) prints edge-to-edge.
            marginsType: 0,
            shouldPrintBackgrounds: true,
            ...opts,
          });
          // Give Chromium a beat to finish writing the file before we close + clean up.
          setTimeout(() => done(), 400);
        } catch (e) {
          done(e as Error);
        }
      });
    });
  });
}
