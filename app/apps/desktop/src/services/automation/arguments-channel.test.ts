import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { argEnvName, resolveArguments } from './arguments';
import { buildInvocation, startRunner, type InvocationSpec } from './runner';

// 2.3 — the argument channel is plain environment variables, so a test written for VS Code keeps
// working: it reads `process.env.TESTORITTO_ARG_<KEY>` and falls back to its own default.

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function mkRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'testoritto-args-'));
  cleanup.push(dir);
  await mkdir(join(dir, '.ch', 'autotests'), { recursive: true });
  return dir;
}

describe('argument env channel', () => {
  it('passes resolved values to a real child process, typed as declared', async () => {
    const repo = await mkRepo();
    const resolved = await resolveArguments({
      repoPath: repo,
      definitions: [
        { key: 'baseUrl', type: 'string', required: true },
        { key: 'retries', type: 'number', default: 1 },
        { key: 'headless', type: 'boolean', default: true },
        { key: 'empty', type: 'string', default: 'fallback' },
      ],
      runOverride: {
        baseUrl: { kind: 'literal', value: 'https://dev.example.com' },
        retries: { kind: 'literal', value: 0 },
        headless: { kind: 'literal', value: false },
        empty: { kind: 'literal', value: '' },
      },
    });
    expect(resolved.ok).toBe(true);

    const out = join(repo, 'seen.json');
    const cli = join(repo, 'cli.js');
    await writeFile(
      cli,
      [
        'const fs = require("node:fs");',
        'const keys = ["BASEURL", "RETRIES", "HEADLESS", "EMPTY"];',
        'const seen = Object.fromEntries(keys.map(k => [k, process.env["TESTORITTO_ARG_" + k] ?? null]));',
        `fs.writeFileSync(${JSON.stringify(out)}, JSON.stringify(seen));`,
        'fs.writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_NAME, JSON.stringify({ suites: [] }));',
      ].join('\n'),
    );

    const spec: InvocationSpec = {
      repoPath: repo,
      nodeCommand: process.execPath,
      cliPath: cli,
      executionDir: join(repo, 'exec'),
      env: resolved.env,
    };
    const built = buildInvocation(spec);
    // argv carries the values only as env — never as a shell string.
    expect(built.args.join(' ')).not.toContain('dev.example.com');
    expect(built.options.env).toMatchObject({
      [argEnvName('baseUrl')]: 'https://dev.example.com',
      [argEnvName('retries')]: '0',
      [argEnvName('headless')]: 'false',
      [argEnvName('empty')]: '',
    });

    await startRunner(built, spec, {}, () => {}).done;
    const seen = JSON.parse(await readFile(out, 'utf8'));
    expect(seen).toEqual({ BASEURL: 'https://dev.example.com', RETRIES: '0', HEADLESS: 'false', EMPTY: '' });
  });

  it('writes no argument file into the repository (env is the only channel)', async () => {
    const repo = await mkRepo();
    const resolved = await resolveArguments({
      repoPath: repo,
      definitions: [{ key: 'baseUrl', type: 'string', default: 'http://localhost:3000' }],
    });
    const cli = join(repo, 'cli.js');
    await writeFile(
      cli,
      'require("node:fs").writeFileSync(process.env.PLAYWRIGHT_JSON_OUTPUT_NAME, JSON.stringify({ suites: [] }));',
    );
    const spec: InvocationSpec = {
      repoPath: repo,
      nodeCommand: process.execPath,
      cliPath: cli,
      executionDir: join(repo, 'exec'),
      env: resolved.env,
    };
    await startRunner(buildInvocation(spec), spec, {}, () => {}).done;
    // Only the CLI script and the execution output exist; no args.json / .env was written.
    const { readdir } = await import('node:fs/promises');
    expect((await readdir(repo)).sort()).toEqual(['.ch', 'cli.js', 'exec']);
  });
});
