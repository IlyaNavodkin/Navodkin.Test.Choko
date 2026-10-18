import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdir, realpath, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CatalogSchema, LIMITS, parseReport } from './contracts';
import { DiscoveryV2Schema, ManifestV2Schema, ReportV2Schema } from './runner-contracts';
import type { AutomationReport, Manifest, StableKey } from './contracts';
import type { ManifestV2, ReportV2 } from './runner-contracts';
import { atomicJson, atomicText, baseReport, descendant, errorRecord, readBounded, readManifest } from './node-common';

export interface BridgeResult { schemaVersion: 1 | 2; ok: boolean; operation: 'discover' | 'run'; executionId: string; state: string; exitCode: number | null; error: string | null }
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
interface Prepared { cwd: string; config: string; cli: string; reporter: string; outputRoot: string }
async function prepare(manifest: Manifest | ManifestV2): Promise<Prepared> {
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
  return { cwd, config, cli, reporter, outputRoot };
}
function baseArgs(prepared: Prepared, manifest: Manifest | ManifestV2, operation: 'discover' | 'run', globalTimeout: number): string[] {
  const args = [prepared.cli, 'test', '--config', prepared.config, '--reporter', prepared.reporter, '--forbid-only', '--workers', String(manifest.profile.workers), '--retries', String(manifest.profile.retries), '--global-timeout', String(globalTimeout)];
  for (const project of manifest.profile.projects) args.push(`--project=${project}`);
  if (operation === 'discover') args.push('--list');
  return args;
}
function clipChunk(text: string, budget: { remaining: number }): string {
  const bytes = Buffer.from(text), clipped = bytes.subarray(0, Math.max(0, budget.remaining));
  budget.remaining -= clipped.length;
  return new TextDecoder('utf-8', { fatal: false }).decode(clipped, { stream: true });
}
async function spawnPlaywright(cwd: string, args: string[], env: NodeJS.ProcessEnv, log: { stdout: string; stderr: string }, budget: { remaining: number }): Promise<number | null> {
  return new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, shell: false, windowsHide: true, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk: Buffer) => { log.stdout += clipChunk(chunk.toString(), budget); });
    child.stderr.on('data', (chunk: Buffer) => { log.stderr += clipChunk(chunk.toString(), budget); });
    child.on('error', reject); child.on('close', resolve);
  });
}
export async function runBridge(operation: string, manifestPath: string): Promise<BridgeResult> {
  const raw: unknown = JSON.parse(await readBounded(manifestPath));
  if (raw && typeof raw === 'object' && (raw as { schemaVersion?: unknown }).schemaVersion === 2) return runBridgeV2(operation, raw);
  const manifest = await readManifest(manifestPath);
  if (operation !== manifest.operation || !['discover', 'run'].includes(operation)) throw new Error('INVALID_OPERATION');
  const prepared = await prepare(manifest);
  const args = baseArgs(prepared, manifest, operation as 'discover' | 'run', operation === 'discover' ? Math.min(manifest.profile.timeoutMs, LIMITS.discoveryMs) : manifest.profile.timeoutMs);
  const diagnostic = baseReport(manifest), budget = { remaining: LIMITS.logBytes }, log = { stdout: '', stderr: '' };
  const exitCode = await spawnPlaywright(prepared.cwd, args, { ...process.env, TESTORITTO_MANIFEST: path.resolve(manifestPath), FORCE_COLOR: '0' }, log, budget);
  diagnostic.logs.stdout = log.stdout; diagnostic.logs.stderr = log.stderr;
  try {
    if (operation === 'discover') {
      const catalog = CatalogSchema.parse(JSON.parse(await readBounded(path.join(prepared.outputRoot, 'catalog.json'))));
      if (exitCode !== 0 || catalog.executionId !== manifest.executionId || catalog.profileId !== manifest.profileId || catalog.profileRevision !== manifest.profileRevision) throw new Error('INVALID_CATALOG: exit/correlation');
      return { schemaVersion: 1, ok: true, operation, executionId: manifest.executionId, state: 'completed', exitCode, error: null };
    }
    const report = await readFinalReport(path.join(prepared.outputRoot, 'report.json'), manifest, exitCode);
    return { schemaVersion: 1, ok: report.state === 'completed', operation, executionId: manifest.executionId, state: report.state, exitCode, error: report.reason };
  } catch (error) {
    diagnostic.reason = `INVALID_REPORT: ${errorRecord(error).message}`.slice(0, 4096);
    diagnostic.runnerErrors = [errorRecord(new Error(diagnostic.reason))];
    diagnostic.finishedAt = new Date().toISOString();
    if (operation === 'run') await atomicJson(prepared.outputRoot, 'report.json', diagnostic);
    return { schemaVersion: 1, ok: false, operation, executionId: manifest.executionId, state: 'runner_error', exitCode, error: diagnostic.reason };
  }
}
interface Fragment { invocationId: string; state: ReportV2['state']; reason: string | null; startedAt: string; finishedAt: string; tests: ReportV2['tests']; runnerErrors: ReportV2['runnerErrors']; logs: ReportV2['logs']; attachments: ReportV2['attachments'] }
/** Version 2: последовательные процессы по одному invocation с аргументами в окружении. */
async function runBridgeV2(operation: string, raw: unknown): Promise<BridgeResult> {
  const manifest = ManifestV2Schema.parse(raw);
  if (operation !== manifest.operation || !['discover', 'run'].includes(operation)) throw new Error('INVALID_OPERATION');
  const prepared = await prepare(manifest);
  const budget = { remaining: LIMITS.logBytes }, log = { stdout: '', stderr: '' };
  const output = prepared.outputRoot;
  if (operation === 'discover') {
    const args = baseArgs(prepared, manifest, 'discover', Math.min(manifest.profile.timeoutMs, LIMITS.discoveryMs));
    const exitCode = await spawnPlaywright(prepared.cwd, args, { ...process.env, TESTORITTO_MANIFEST: path.resolve(manifest.outputRoot, 'manifest.json'), FORCE_COLOR: '0' }, log, budget);
    const catalog = DiscoveryV2Schema.parse(JSON.parse(await readBounded(path.join(output, 'catalog.json'))));
    if (exitCode !== 0 || catalog.executionId !== manifest.executionId || catalog.profileId !== manifest.profileId || catalog.profileRevision !== manifest.profileRevision) throw new Error('INVALID_CATALOG: exit/correlation');
    return { schemaVersion: 2, ok: true, operation, executionId: manifest.executionId, state: 'completed', exitCode, error: null };
  }
  await mkdir(path.join(output, 'fragments'), { recursive: true });
  const deadline = Date.now() + manifest.profile.timeoutMs;
  const fragments: Fragment[] = [];
  const runnerErrors: ReportV2['runnerErrors'] = [];
  let state: ReportV2['state'] = 'completed';
  let reason: string | null = null;
  let exitCode: number | null = 0;
  let startedAt = new Date().toISOString();
  for (const [index, invocation] of manifest.invocations.entries()) {
    const remaining = deadline - Date.now();
    if (remaining <= 1000) { state = 'timed_out'; reason = 'Лимит времени прогона исчерпан.'; break; }
    const key: StableKey = { caseId: invocation.binding.caseId, automationId: invocation.autotest.selector.automationId, project: invocation.autotest.selector.project, variantId: invocation.autotest.selector.variantId };
    const args = baseArgs(prepared, manifest, 'run', remaining);
    exitCode = await spawnPlaywright(prepared.cwd, args, {
      ...process.env, FORCE_COLOR: '0', TESTORITTO_MANIFEST: path.resolve(output, 'manifest.json'),
      TESTORITTO_INVOCATION_ID: invocation.invocationId, TESTORITTO_INVOCATION_ARGUMENTS: JSON.stringify(invocation.resolvedArguments), TESTORITTO_SELECTION: JSON.stringify(key),
    }, log, budget);
    let fragment: Fragment | null = null;
    try { fragment = JSON.parse(await readBounded(path.join(output, 'fragments', `${invocation.invocationId}.json`))) as Fragment; } catch { fragment = null; }
    if (!fragment) {
      state = 'runner_error'; reason = 'Invocation не предоставил фрагмент отчёта.';
      runnerErrors.push(errorRecord(new Error(`${reason} invocation=${invocation.invocationId}`)));
      break;
    }
    if (index === 0) startedAt = fragment.startedAt;
    fragments.push(fragment);
    if (fragment.state !== 'completed') { state = fragment.state; reason = fragment.reason; runnerErrors.push(...fragment.runnerErrors); break; }
  }
  const attachments = new Map<string, ReportV2['attachments'][number]>();
  const tests: ReportV2['tests'] = [];
  for (const fragment of fragments) for (const test of fragment.tests) tests.push(test);
  for (const fragment of fragments) for (const attachment of fragment.attachments) if (!attachments.has(attachment.id)) attachments.set(attachment.id, attachment);
  if (state === 'completed' && (tests.length !== manifest.invocations.length || tests.some(test => !test.attempts.length || test.outcome === 'interrupted'))) {
    state = 'runner_error'; reason = 'Не каждый invocation предоставил полный результат.';
  }
  const report = ReportV2Schema.parse({
    schemaVersion: 2, runId: manifest.runId, executionId: manifest.executionId, parentExecutionId: manifest.parentExecutionId,
    profileId: manifest.profileId, profileRevision: manifest.profileRevision, catalogRevision: manifest.catalogRevision, createdAt: manifest.createdAt,
    source: manifest.source, state, reason, startedAt, finishedAt: new Date().toISOString(), complete: true, tests,
    runnerErrors: runnerErrors.slice(0, 100), logs: { stdout: log.stdout, stderr: log.stderr, truncated: budget.remaining <= 0 }, attachments: [...attachments.values()],
  });
  await atomicJson(output, 'report.json', report);
  await atomicText(output, 'junit.xml', junitText(report));
  return { schemaVersion: 2, ok: report.state === 'completed', operation, executionId: manifest.executionId, state: report.state, exitCode, error: report.reason };
}
function escapeXml(value: string): string {
  return value.replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
}
export function junitText(report: ReportV2): string {
  const cases = report.tests.map((test) => {
    const failures = test.attempts.flatMap((attempt) => attempt.errors).map((error) => `<failure message="${escapeXml(error.message)}"/>`).join('');
    const skipped = test.outcome === 'skipped' ? '<skipped/>' : '';
    const seconds = (test.attempts.reduce((total, attempt) => total + attempt.durationMs, 0) / 1000).toFixed(3);
    return `    <testcase classname="${escapeXml(test.project)}" name="${escapeXml(test.title)}" file="${escapeXml(test.file)}" time="${seconds}">\n      <properties><property name="testoritto.project" value="${escapeXml(test.project)}"/><property name="testoritto.caseId" value="${escapeXml(test.caseId)}"/><property name="testoritto.automationId" value="${escapeXml(test.automationId)}"/><property name="testoritto.variantId" value="${escapeXml(test.variantId)}"/><property name="testoritto.invocationId" value="${escapeXml(test.invocationId)}"/></properties>\n      ${failures}${skipped}\n    </testcase>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="testoritto" tests="${report.tests.length}">\n  <testsuite name="${escapeXml(report.profileId)}" tests="${report.tests.length}">\n${cases.join('\n')}\n  </testsuite>\n</testsuites>\n`;
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
