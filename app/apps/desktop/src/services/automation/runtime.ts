import { node } from '@/lib/node';
import { isSupportedPlaywrightVersion, parseSemver, PLAYWRIGHT_SUPPORTED } from '@/schemas/automation';

// ---------------------------------------------------------------------------
// Resolving the *external* Node and the project's Playwright CLI (design §Решение по запуску).
//
// The app never ships Node and never installs anything: `process.execPath` under NW.js is the
// NW.js binary, so a real system `node` is required. The CLI is located *inside the repository's
// own dependency tree* (`createRequire(<repo>/package.json).resolve(...)`), so Playwright — and
// its browser provisioning — stay the project's responsibility. Nothing here spawns a shell.
// ---------------------------------------------------------------------------

/** Thrown when the external Node or the project's Playwright cannot be resolved/used. */
export class AutomationRuntimeError extends Error {
  readonly code: 'no-node' | 'bad-node-version' | 'no-cli' | 'unsupported-version' | 'no-package';
  constructor(code: AutomationRuntimeError['code'], message: string) {
    super(message);
    this.name = 'AutomationRuntimeError';
    this.code = code;
  }
}

/** The external interpreter we will spawn (design: it is *not* `process.execPath`). */
export interface NodeRuntime {
  /** Absolute or PATH-resolved command to spawn. */
  command: string;
  /** Reported `node --version` (e.g. `v22.23.1`). */
  version: string;
}

/** The project-installed Playwright CLI and its version. */
export interface ProjectPlaywright {
  /** Absolute path to `@playwright/test/cli` (a JS file run by {@link NodeRuntime.command}). */
  cliPath: string;
  /** `@playwright/test` version, e.g. `1.44.1`. */
  version: string;
}

/** Minimum Node the runner supports (design/proposal: external Node ≥ 22). */
export const MIN_NODE_MAJOR = 22;

/** Runs `command --version` and returns stdout. Injectable so tests never spawn a process. */
export type VersionProbe = (command: string) => Promise<string>;

/** Default probe: spawn `command --version` directly (no shell), capture stdout. */
export const spawnVersionProbe: VersionProbe = (command) =>
  new Promise<string>((resolve, reject) => {
    let child;
    try {
      child = node
        .childProcess()
        .spawn(command, ['--version'], { shell: false, windowsHide: true });
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    let out = '';
    let err = '';
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.stderr?.on('data', (d) => (err += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.trim() || `${command} --version exited with ${code}`));
    });
  });

export const nodeExecutableName = (platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32' ? 'node.exe' : 'node';

export interface NodeLookupDeps {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  pathExists?: (p: string) => Promise<boolean>;
  delimiter?: string;
}

const defaultPathExists = async (p: string): Promise<boolean> => {
  try {
    const st = await node.fsp().stat(p);
    return st.isFile();
  } catch {
    return false;
  }
};

/**
 * The first `node` executable on `PATH`, or `null`. Pure path math + existence checks — this never
 * spawns anything, so it is safe to call speculatively.
 */
export async function findNodeOnPath(deps: NodeLookupDeps = {}): Promise<string | null> {
  const path = node.path();
  const env = deps.env ?? process.env;
  const platform = deps.platform ?? process.platform;
  const exists = deps.pathExists ?? defaultPathExists;
  const delimiter = deps.delimiter ?? (platform === 'win32' ? ';' : ':');
  const exe = nodeExecutableName(platform);
  const dirs = (env.PATH ?? env.Path ?? '').split(delimiter).filter(Boolean);
  for (const dir of dirs) {
    const candidate = path.join(dir.replace(/^"|"$/g, ''), exe);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

export interface ResolveNodeOptions extends NodeLookupDeps {
  /** Explicit interpreter path from app settings; used before falling back to `PATH`. */
  configuredPath?: string;
  probe?: VersionProbe;
}

/**
 * Resolve a usable external Node: an explicit configured path wins, otherwise the first on `PATH`.
 * Verifies the major version and reports a clear diagnostic when Node is missing or too old.
 */
export async function resolveNodeRuntime(opts: ResolveNodeOptions = {}): Promise<NodeRuntime> {
  const probe = opts.probe ?? spawnVersionProbe;
  const command = opts.configuredPath?.trim() || (await findNodeOnPath(opts));
  if (!command) {
    throw new AutomationRuntimeError(
      'no-node',
      `External Node.js ${MIN_NODE_MAJOR}+ was not found on PATH. Install Node, or set its path in settings, then try again.`,
    );
  }
  let version: string;
  try {
    version = await probe(command);
  } catch (e) {
    throw new AutomationRuntimeError('no-node', `Could not run "${command} --version": ${errText(e)}`);
  }
  const parsed = parseSemver(version);
  if (!parsed || parsed.major < MIN_NODE_MAJOR) {
    throw new AutomationRuntimeError(
      'bad-node-version',
      `Node.js ${MIN_NODE_MAJOR}+ is required but "${command}" reports ${version || 'an unknown version'}.`,
    );
  }
  return { command, version };
}

/**
 * Locate the repository's own `@playwright/test` CLI and read its version. Throws a clear
 * diagnostic when the package is not installed there (we never install it for the user).
 */
export async function resolveProjectPlaywright(repoPath: string): Promise<ProjectPlaywright> {
  const path = node.path();
  let require_from_repo: NodeRequire;
  try {
    require_from_repo = node.module().createRequire(path.join(repoPath, 'package.json'));
  } catch (e) {
    throw new AutomationRuntimeError('no-package', `Could not read ${path.join(repoPath, 'package.json')}: ${errText(e)}`);
  }
  let cliPath: string;
  try {
    cliPath = require_from_repo.resolve('@playwright/test/cli');
  } catch {
    throw new AutomationRuntimeError(
      'no-cli',
      'Playwright is not installed in this repository. Run "npm install -D @playwright/test" (or pnpm/yarn) in the project, then try again.',
    );
  }
  let version = '';
  try {
    const pkgPath = require_from_repo.resolve('@playwright/test/package.json');
    version = JSON.parse(await node.fsp().readFile(pkgPath, 'utf8')).version ?? '';
  } catch {
    version = '';
  }
  if (!isSupportedPlaywrightVersion(version)) {
    throw new AutomationRuntimeError(
      'unsupported-version',
      `This app understands Playwright ${PLAYWRIGHT_SUPPORTED.minMajor}.${PLAYWRIGHT_SUPPORTED.minMinor}+ report format, but the repository has ${
        version || 'an unknown version'
      }. Update @playwright/test in the project.`,
    );
  }
  return { cliPath, version };
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
