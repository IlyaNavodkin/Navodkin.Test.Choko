import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult, TestRun, TestError } from '@playwright/test/reporter';
import path from 'node:path';
import { appendFileSync, existsSync } from 'node:fs';
import { mkdir, realpath, stat, copyFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { CatalogSchema, ExpectedStatusSchema, LIMITS, ReportSchema, outcomeOf, stableKey } from './contracts';
import type { AutomationReport, Catalog, Manifest, TestRecord } from './contracts';
import { identityFromAnnotations } from './imports';
import { atomicJson, baseReport, consumeLog, descendant, digest, errorRecord, fileDigest, readManifest } from './node-common';

export default class TestorittoReporter implements Reporter {
  private manifest!: Manifest;
  private report!: AutomationReport;
  private catalog?: Catalog;
  private records = new Map<string, TestRecord>();
  private fatal: string | null = null;
  private budget = { remaining: LIMITS.logBytes };
  private eventBytes = 0;
  private artifactBytes = 0;
  private sourceRoot = '';
  private attemptLogs = new WeakMap<TestResult, { stdout: string; stderr: string }>();
  printsToStdio(): boolean { return true; }
  private event(type: string, data: object = {}) {
    const line = JSON.stringify({ schemaVersion: 1, executionId: this.manifest.executionId, type, ...data }) + '\n';
    this.eventBytes += Buffer.byteLength(line);
    if (this.eventBytes <= LIMITS.reportBytes) appendFileSync(path.join(this.manifest.outputRoot, 'events.ndjson'), line, { mode: 0o600 });
    else this.report.logs.truncated = true;
  }
  async preprocess({ config, suite, testRun }: { config: FullConfig; suite: Suite; testRun: TestRun }): Promise<void> {
    this.manifest = await readManifest(process.env.TESTORITTO_MANIFEST!);
    this.report = baseReport(this.manifest);
    const tests = suite.allTests();
    try {
      if (!testRun || typeof testRun.exclude !== 'function') throw new Error('UNSUPPORTED_VERSION: preprocess required');
      if (config.projects.some(p => p.dependencies.length > 0 || p.teardown)) throw new Error('UNSUPPORTED_DEPENDENCIES');
      this.sourceRoot = await realpath(process.cwd());
      const catalogTests: Catalog['tests'] = [], seen = new Set<string>(), sourceFiles = new Set<string>();
      for (const t of tests) {
        const project = t.parent.project()!.name;
        const key = identityFromAnnotations(t.annotations, project, true)!;
        if (!this.manifest.profile.projects.includes(project)) throw new Error('INVALID_PROJECT');
        const identity = stableKey(key);
        if (t.repeatEachIndex === 0) {
          if (seen.has(identity)) throw new Error('DUPLICATE_IDENTITY');
          seen.add(identity);
          catalogTests.push({ ...key, title: t.titlePath().slice(1).join(' › '), file: path.relative(this.sourceRoot, t.location.file).split(path.sep).join('/'), expectedStatus: ExpectedStatusSchema.parse(t.expectedStatus) });
        }
        sourceFiles.add(await descendant(this.sourceRoot, t.location.file));
      }
      const sources: [string, string][] = [];
      for (const file of [...sourceFiles].sort()) sources.push([path.relative(this.sourceRoot, file), await fileDigest(file)]);
      const configPath = await descendant(this.sourceRoot, path.resolve(this.sourceRoot, this.manifest.profile.config));
      sources.push([this.manifest.profile.config, await fileDigest(configPath)]);
      for (const file of ['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'package.json']) if (existsSync(path.join(this.sourceRoot, file))) sources.push([file, await fileDigest(path.join(this.sourceRoot, file))]);
      catalogTests.sort((a, b) => stableKey(a).localeCompare(stableKey(b), 'en'));
      const catalogRevision = digest(JSON.stringify({ profileRevision: this.manifest.profileRevision, tests: catalogTests, sources }));
      this.catalog = CatalogSchema.parse({ schemaVersion: 1, executionId: this.manifest.executionId, profileId: this.manifest.profileId, profileRevision: this.manifest.profileRevision, catalogRevision, tests: catalogTests, dependencies: [] });
      if (this.manifest.operation === 'run') {
        if (catalogRevision !== this.manifest.catalogRevision) throw new Error('STALE_CATALOG');
        const selected = new Set(this.manifest.selection.map(stableKey));
        if ([...selected].some(k => !seen.has(k))) throw new Error('MISSING_SELECTION');
        for (const t of tests) if (!selected.has(stableKey(identityFromAnnotations(t.annotations, t.parent.project()!.name, true)!))) testRun.exclude(t);
      }
      this.event('catalog', { catalogRevision, count: catalogTests.length });
    } catch (error) {
      // Reporter exceptions may be swallowed by Playwright. Exclude every body first and
      // persist an explicit failure so neither a swallowed error nor exit 0 is success.
      for (const t of tests) testRun.exclude(t);
      this.fatal = errorRecord(error).message;
      this.report.runnerErrors.push(errorRecord(error));
      this.event('runner_error', { message: this.fatal });
    }
  }
  onBegin(): void { if (this.report) this.event('begin'); }
  onTestBegin(test: TestCase, result: TestResult): void { this.event('test_begin', { testId: test.id, retry: result.retry, repeatEachIndex: test.repeatEachIndex }); }
  private log(stream: 'stdout' | 'stderr', chunk: string | Buffer, result?: TestResult): void {
    if (!this.report) return;
    const text = consumeLog(this.report, chunk.toString(), this.budget);
    if (!result) this.report.logs[stream] += text;
    else {
      const logs = this.attemptLogs.get(result) ?? { stdout: '', stderr: '' };
      logs[stream] += text; this.attemptLogs.set(result, logs);
    }
  }
  onStdOut(chunk: string | Buffer, _test?: TestCase, result?: TestResult): void { this.log('stdout', chunk, result); }
  onStdErr(chunk: string | Buffer, _test?: TestCase, result?: TestResult): void { this.log('stderr', chunk, result); }
  onError(error: TestError): void {
    if (this.report && this.report.runnerErrors.length < 100) this.report.runnerErrors.push({ message: (error.message ?? error.value ?? 'Runner error').slice(0, 16_384), stack: error.stack?.slice(0, 32_768) ?? null });
  }
  async onTestEnd(test: TestCase, result: TestResult): Promise<void> {
    const key = identityFromAnnotations(test.annotations, test.parent.project()!.name, true)!;
    const id = stableKey(key);
    let record = this.records.get(id);
    if (!record) { record = { ...key, title: test.titlePath().slice(1).join(' › '), file: path.relative(this.sourceRoot, test.location.file).split(path.sep).join('/'), expectedStatus: ExpectedStatusSchema.parse(test.expectedStatus), outcome: 'interrupted', attempts: [] }; this.records.set(id, record); }
    if (record.attempts.length >= LIMITS.attempts) { this.fatal = 'LIMIT_EXCEEDED: attempts'; return; }
    record.expectedStatus = ExpectedStatusSchema.parse(test.expectedStatus);
    const attachments: string[] = [];
    for (const a of result.attachments) {
      if (this.report.attachments.length >= LIMITS.attachments) { this.report.logs.truncated = true; break; }
      const artifact = { id: randomUUID(), name: a.name.slice(0, 256), contentType: a.contentType.slice(0, 100), path: null as string | null, size: 0, unavailableReason: null as string | null };
      try {
        if (!['image/png', 'image/jpeg', 'text/plain', 'application/json', 'application/zip', 'video/webm'].includes(a.contentType)) throw new Error('Unsupported content type');
        const source = a.path ? await descendant(this.sourceRoot, a.path) : null;
        const size = source ? (await stat(source)).size : a.body?.length ?? 0;
        if (size > LIMITS.attachmentBytes || this.artifactBytes + size > LIMITS.artifactBytes) throw new Error('Attachment size limit');
        const directory = path.join(this.manifest.outputRoot, 'artifacts');
        await mkdir(directory, { recursive: true });
        await descendant(this.manifest.outputRoot, directory);
        artifact.path = `artifacts/${artifact.id}`;
        const target = path.join(this.manifest.outputRoot, artifact.path);
        if (source) await copyFile(source, target, 1); else await writeFile(target, a.body ?? Buffer.alloc(0), { flag: 'wx', mode: 0o600 });
        artifact.size = size; this.artifactBytes += size;
      } catch (error) { artifact.path = null; artifact.unavailableReason = errorRecord(error).message.slice(0, 256); }
      this.report.attachments.push(artifact); attachments.push(artifact.id);
    }
    const logs = this.attemptLogs.get(result) ?? { stdout: '', stderr: '' };
    record.attempts.push({ retry: result.retry, repeatEachIndex: test.repeatEachIndex, status: result.status, startedAt: result.startTime.toISOString(), durationMs: result.duration, errors: result.errors.slice(0, 100).map(e => ({ message: (e.message ?? e.value ?? '').slice(0, 16_384), stack: e.stack?.slice(0, 32_768) ?? null })), ...logs, attachments });
    record.outcome = outcomeOf(record.expectedStatus, record.attempts);
    this.event('test_end', { key, retry: result.retry, repeatEachIndex: test.repeatEachIndex, status: result.status });
  }
  async onEnd(result: FullResult): Promise<void> {
    if (!this.manifest) return;
    this.report.finishedAt = new Date().toISOString();
    this.report.tests = [...this.records.values()];
    this.report.state = this.fatal || this.report.runnerErrors.length ? 'runner_error' : result.status === 'interrupted' ? 'interrupted' : result.status === 'timedout' ? 'timed_out' : 'completed';
    this.report.reason = this.fatal;
    if (this.manifest.operation === 'discover') {
      if (this.fatal || !this.catalog || result.status !== 'passed') return;
      await atomicJson(this.manifest.outputRoot, 'catalog.json', this.catalog);
    } else await atomicJson(this.manifest.outputRoot, 'report.json', ReportSchema.parse(this.report));
    this.event('complete', { state: this.report.state });
  }
}
