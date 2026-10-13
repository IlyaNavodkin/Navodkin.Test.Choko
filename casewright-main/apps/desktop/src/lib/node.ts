/**
 * The single runtime-`require` chokepoint for Node-only modules.
 *
 * In NW.js the renderer shares the Node context, so `globalThis.require` resolves
 * real Node builtins and npm modules. These libs are pulled in lazily via a runtime
 * string `require(...)` (invisible to Vite's static analysis) so they are never
 * bundled — they load from `node_modules` at runtime. In a plain browser (the dev
 * preview / Playwright) calling any getter throws `NotInNwjsError`.
 *
 * Tests (Vitest, plain Node) inject `globalThis.require` via a setup file, so the
 * same getters work there too.
 */
import type SimpleGitFactory from 'simple-git';
import type matterFn from 'gray-matter';
import type * as papa from 'papaparse';

type Fsp = typeof import('node:fs/promises');
type FsMod = typeof import('node:fs');
type PathMod = typeof import('node:path');
type OsMod = typeof import('node:os');
type UrlMod = typeof import('node:url');
type ChildProc = typeof import('node:child_process');

export class NotInNwjsError extends Error {
  constructor(mod?: string) {
    super(
      `Node module${mod ? ` "${mod}"` : ''} is unavailable — this needs the NW.js runtime (open the app, not a plain browser).`,
    );
    this.name = 'NotInNwjsError';
  }
}

let cachedRequire: NodeRequire | undefined;

function nodeRequire(): NodeRequire {
  if (cachedRequire) return cachedRequire;
  const g = globalThis as unknown as { require?: NodeRequire };
  const fromNw = typeof window !== 'undefined' ? window.nw?.require : undefined;
  const r = g.require ?? fromNw;
  if (typeof r !== 'function') throw new NotInNwjsError();
  cachedRequire = r;
  return r;
}

const moduleCache = new Map<string, unknown>();

function load<T>(name: string): T {
  if (!moduleCache.has(name)) {
    try {
      moduleCache.set(name, nodeRequire()(name));
    } catch (err) {
      if (err instanceof NotInNwjsError) throw new NotInNwjsError(name);
      throw err;
    }
  }
  return moduleCache.get(name) as T;
}

export const node = {
  fsp: () => load<Fsp>('node:fs/promises'),
  /** Synchronous fs — only for code that must complete before the page unloads (window-state save). */
  fs: () => load<FsMod>('node:fs'),
  path: () => load<PathMod>('node:path'),
  os: () => load<OsMod>('node:os'),
  url: () => load<UrlMod>('node:url'),
  childProcess: () => load<ChildProc>('node:child_process'),
  /** The `simpleGit` factory: `node.simpleGit()(repoPath)` → a SimpleGit instance. */
  simpleGit: () => load<typeof SimpleGitFactory>('simple-git'),
  /** gray-matter's callable parser/serializer. */
  matter: () => load<typeof matterFn>('gray-matter'),
  papa: () => load<typeof papa>('papaparse'),
};
