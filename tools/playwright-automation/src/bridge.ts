import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { realpath, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CatalogSchema, LIMITS, parseReport } from './contracts';
import type { AutomationReport, Manifest } from './contracts';
import { atomicJson, baseReport, consumeLog, descendant, errorRecord, readBounded, readManifest } from './node-common';

export interface BridgeResult { schemaVersion: 1; ok: boolean; operation: 'discover' | 'run'; executionId: string; state: string; exitCode: number | null; error: string | null }
export async function awaitStart(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let received = '';
    const timer = setTimeout(() => finish(new Error('START_TIMEOUT')), 30_000);
    const data = (chunk: Buffer) => { received += chunk.toString('utf8'); if (received === 'START\n') finish(); else if (received.length >= 6 || received.includes('\n')) finish(new Error('INVALID_START')); };
    const end = () => finish(new Error('START_EOF'));
    const finish = (error?: Error) => { clearTimeout(timer); process.stdin.off('data', data); process.stdin.off('end', end); process.stdin.pause(); if (error) reject(error); else resolve(); };
    process.stdin.on('data', data); process.stdin.on('end', end); process.stdin.resume();
  });
}
export async function runBridge(operation: string, manifestPath: string): Promise<BridgeResult> {
  const manifest = await readManifest(manifestPath);
  if (operation !== manifest.operation || !['discover', 'run'].includes(operation)) throw new Error('INVALID_OPERATION');
  const root = await realpath(process.cwd());
  const cwd = await descendant(root, path.resolve(root, manifest.profile.cwd));
  const config = await descendant(cwd, path.resolve(cwd, manifest.profile.config));
  const outputRoot = await realpath(manifest.outputRoot);
  if (!path.isAbsolute(manifest.outputRoot) || path.resolve(outputRoot) !== path.resolve(manifest.outputRoot)) throw new Error('INVALID_OUTPUT_ROOT');
  for (const file of ['report.json', 'catalog.json', 'events.ndjson']) {
    try { await access(path.join(outputRoot, file)); throw new Error('OUTPUT_EXISTS'); } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
  }
  const require = createRequire(path.join(cwd, 'package.json'));
  const packagePath = await realpath(require.resolve('@playwright/test/package.json'));
  const metadata: unknown = JSON.parse(await readBounded(packagePath, 64 * 1024));
  if (!metadata || typeof metadata !== 'object' || !('version' in metadata) || typeof metadata.version !== 'string' || !/^1\.(?:6[4-9]|[7-9]\d|\d{3,})\.\d+$/.test(metadata.version) || metadata.version === '1.64.0') throw new Error('UNSUPPORTED_VERSION: Playwright >=1.64.1 required');
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major! < 22 || (major === 22 && minor! < 12)) throw new Error('UNSUPPORTED_VERSION: Node >=22.12 required');
  const cli = await realpath(path.join(path.dirname(packagePath), 'cli.js'));
  const reporter = path.join(path.dirname(fileURLToPath(import.meta.url)), 'reporter.mjs');
  const args = [cli, 'test', '--config', config, '--reporter', reporter, '--forbid-only', '--workers', String(manifest.profile.workers), '--retries', String(manifest.profile.retries), '--global-timeout', String(operation === 'discover' ? Math.min(manifest.profile.timeoutMs, LIMITS.discoveryMs) : manifest.profile.timeoutMs)];
  for (const project of manifest.profile.projects) args.push(`--project=${project}`);
  if (operation === 'discover') args.push('--list');
  const diagnostic = baseReport(manifest), budget = { remaining: LIMITS.logBytes };
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, shell: false, windowsHide: true, env: { ...process.env, TESTORITTO_MANIFEST: path.resolve(manifestPath), FORCE_COLOR: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk: Buffer) => { diagnostic.logs.stdout += consumeLog(diagnostic, chunk.toString(), budget); });
    child.stderr.on('data', (chunk: Buffer) => { diagnostic.logs.stderr += consumeLog(diagnostic, chunk.toString(), budget); });
    child.on('error', reject); child.on('close', resolve);
  });
  try {
    if (operation === 'discover') {
      const catalog = CatalogSchema.parse(JSON.parse(await readBounded(path.join(outputRoot, 'catalog.json'))));
      if (exitCode !== 0 || catalog.executionId !== manifest.executionId || catalog.profileId !== manifest.profileId || catalog.profileRevision !== manifest.profileRevision) throw new Error('INVALID_CATALOG: exit/correlation');
      return { schemaVersion: 1, ok: true, operation, executionId: manifest.executionId, state: 'completed', exitCode, error: null };
    }
    const report = await readFinalReport(path.join(outputRoot, 'report.json'), manifest, exitCode);
    return { schemaVersion: 1, ok: report.state === 'completed', operation, executionId: manifest.executionId, state: report.state, exitCode, error: report.reason };
  } catch (error) {
    diagnostic.reason = `INVALID_REPORT: ${errorRecord(error).message}`.slice(0, 4096);
    diagnostic.runnerErrors = [errorRecord(new Error(diagnostic.reason))];
    diagnostic.finishedAt = new Date().toISOString();
    if (operation === 'run') await atomicJson(outputRoot, 'report.json', diagnostic);
    return { schemaVersion: 1, ok: false, operation, executionId: manifest.executionId, state: 'runner_error', exitCode, error: diagnostic.reason };
  }
}
export function validateExit(report: AutomationReport, exitCode: number | null): void {
  if (report.state !== 'completed') return;
  const assertionsFailed = report.tests.some(t => t.outcome === 'unexpected');
  if (exitCode !== (assertionsFailed ? 1 : 0)) throw new Error('INVALID_REPORT: process exit does not match assertions');
}
export async function readFinalReport(file: string, manifest: Manifest, exitCode: number | null): Promise<AutomationReport> {
  const report = parseReport(JSON.parse(await readBounded(file)), manifest);
  validateExit(report, exitCode);
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 3 && args[2] === '--await-start') { await awaitStart(); args.pop(); }
    if (args.length !== 2 || !path.isAbsolute(args[1]!)) throw new Error('Usage: node bridge.mjs <discover|run> <absolute-manifest.json> [--await-start]');
    const result = await runBridge(args[0]!, args[1]!);
    process.stdout.write(JSON.stringify(result) + '\n'); process.exitCode = result.ok ? 0 : 2;
  } catch (error) { process.stdout.write(JSON.stringify({ schemaVersion: 1, ok: false, state: 'runner_error', error: errorRecord(error).message.slice(0, 4096) }) + '\n'); process.exitCode = 2; }
}
