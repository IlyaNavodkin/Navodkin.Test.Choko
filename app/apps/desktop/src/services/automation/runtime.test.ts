import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AutomationRuntimeError,
  findNodeOnPath,
  nodeExecutableName,
  resolveNodeRuntime,
  resolveProjectPlaywright,
} from './runtime';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function mkRepo(prefix = 'testoritto-automation-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  cleanup.push(dir);
  return dir;
}

/** Create a minimal `node_modules/@playwright/test` inside `repo` with the given version. */
async function installFakePlaywright(repo: string, version: string): Promise<void> {
  const pkgDir = join(repo, 'node_modules', '@playwright', 'test');
  await mkdir(pkgDir, { recursive: true });
  await writeFile(join(repo, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
  await writeFile(join(pkgDir, 'package.json'), JSON.stringify({ name: '@playwright/test', version, bin: { playwright: 'cli.js' } }));
  await writeFile(join(pkgDir, 'cli.js'), '// fake CLI\n');
}

describe('nodeExecutableName / findNodeOnPath', () => {
  it('looks for node.exe on win32 and node elsewhere', async () => {
    expect(nodeExecutableName('win32')).toBe('node.exe');
    expect(nodeExecutableName('darwin')).toBe('node');
  });

  it('returns the first existing node on PATH and nothing when absent', async () => {
    const seen: string[] = [];
    const pathExists = async (p: string) => {
      seen.push(p);
      return p.replace(/\\/g, '/').endsWith('second/node.exe');
    };
    const found = await findNodeOnPath({
      env: { PATH: ['C:\\a\\first', 'C:\\a\\second'].join(';') },
      platform: 'win32',
      pathExists,
    });
    expect(found).toBe(join('C:\\a\\second', 'node.exe'));
    expect(seen[0]).toBe(join('C:\\a\\first', 'node.exe'));

    const none = await findNodeOnPath({ env: { PATH: '' }, platform: 'win32', pathExists });
    expect(none).toBeNull();
  });
});

describe('resolveNodeRuntime', () => {
  it('uses an explicit configured path and verifies its version', async () => {
    let probed = '';
    const rt = await resolveNodeRuntime({
      configuredPath: 'C:\\nodejs\\node.exe',
      probe: async (cmd) => {
        probed = cmd;
        return 'v22.23.1';
      },
    });
    expect(probed).toBe('C:\\nodejs\\node.exe');
    expect(rt).toEqual({ command: 'C:\\nodejs\\node.exe', version: 'v22.23.1' });
  });

  it('falls back to PATH when nothing is configured', async () => {
    const rt = await resolveNodeRuntime({
      env: { PATH: '/usr/local/bin' },
      platform: 'linux',
      pathExists: async (p) => p === join('/usr/local/bin', 'node'),
      probe: async () => 'v23.0.0',
    });
    expect(rt.command).toBe(join('/usr/local/bin', 'node'));
  });

  it('reports a missing Node clearly', async () => {
    await expect(
      resolveNodeRuntime({ env: { PATH: '' }, platform: 'win32', pathExists: async () => false }),
    ).rejects.toMatchObject({ code: 'no-node' });
  });

  it('rejects a Node older than the supported major', async () => {
    await expect(
      resolveNodeRuntime({ configuredPath: 'node', probe: async () => 'v18.19.0' }),
    ).rejects.toMatchObject({ code: 'bad-node-version' });
  });

  it('turns a probe failure into a no-node diagnostic', async () => {
    await expect(
      resolveNodeRuntime({
        configuredPath: 'node',
        probe: async () => {
          throw new Error('ENOENT');
        },
      }),
    ).rejects.toBeInstanceOf(AutomationRuntimeError);
  });
});

describe('resolveProjectPlaywright', () => {
  it('resolves the repository CLI and reads its version', async () => {
    const repo = await mkRepo();
    await installFakePlaywright(repo, '1.44.1');
    const pw = await resolveProjectPlaywright(repo);
    expect(pw.version).toBe('1.44.1');
    expect(pw.cliPath.replace(/\\/g, '/')).toMatch(/node_modules\/@playwright\/test\/cli\.js$/);
  });

  it('diagnoses a repository without Playwright', async () => {
    const repo = await mkRepo();
    await expect(resolveProjectPlaywright(repo)).rejects.toMatchObject({ code: 'no-cli' });
  });

  it('refuses an unsupported Playwright report format', async () => {
    const repo = await mkRepo();
    await installFakePlaywright(repo, '1.4.0');
    await expect(resolveProjectPlaywright(repo)).rejects.toMatchObject({ code: 'unsupported-version' });
  });
});
