import { z } from 'zod';
import { SaxesParser } from 'saxes';
import { AttemptSchema, ExpectedStatusSchema, KeySchema, LIMITS, ReportSchema, RelativePathSchema, HashSchema, outcomeOf, stableKey } from './contracts';
import type { Attempt, StableKey } from './contracts';

export interface ImportRow { identity: StableKey | null; title: string; file: string; expectedStatus: 'passed' | 'failed' | 'skipped'; attempts: Attempt[] }
export interface ParsedImport { format: 'testoritto' | 'playwright' | 'junit'; runId: string | null; executionId: string | null; source: unknown | null; tests: ImportRow[] }
const annotationSchema = z.array(z.object({ type: z.string(), description: z.string().optional() })).max(1000);
export function identityFromAnnotations(annotations: unknown, project: string, required = false): StableKey | null {
  const values = annotationSchema.parse(annotations);
  const take = (name: string): string | undefined => {
    const entries = values.filter(a => a.type === `testoritto.${name}`);
    if (entries.length > 1) throw new Error(`DUPLICATE_IDENTITY: ${name}`);
    return entries[0]?.description;
  };
  const caseId = take('caseId'), automationId = take('automationId'), variantId = take('variantId') ?? 'default';
  if (!caseId || !automationId || !project) { if (required) throw new Error('MISSING_IDENTITY'); return null; }
  return KeySchema.parse({ caseId, automationId, project, variantId });
}
const blankAttempt = (status: Attempt['status'], durationMs = 0): Attempt => ({ retry: 0, repeatEachIndex: 0, status, startedAt: null, durationMs, errors: [], stdout: '', stderr: '', attachments: [] });
const errorShape = z.object({ message: z.string().max(16_384).optional(), stack: z.string().max(32_768).optional() });
const pwResult = z.object({ retry: z.number().int().min(0).max(99), status: z.enum(['passed', 'failed', 'timedOut', 'skipped', 'interrupted']), startTime: z.string().datetime(), duration: z.number().finite().min(0), errors: z.array(errorShape).max(100).optional(), stdout: z.array(z.object({ text: z.string().optional(), buffer: z.string().optional() })).optional(), stderr: z.array(z.object({ text: z.string().optional(), buffer: z.string().optional() })).optional() });
const pwTest = z.object({ projectName: z.string(), expectedStatus: ExpectedStatusSchema, annotations: annotationSchema.optional(), repeatEachIndex: z.number().int().min(0).max(99).optional(), results: z.array(pwResult).max(LIMITS.attempts) });
const pwSpec = z.object({ title: z.string().max(4096), file: z.string().max(1024), tests: z.array(pwTest).max(LIMITS.tests) });
interface PwSuite { suites?: PwSuite[]; specs?: z.infer<typeof pwSpec>[] }
const pwSuite: z.ZodType<PwSuite> = z.lazy(() => z.object({ suites: z.array(pwSuite).optional(), specs: z.array(pwSpec).max(LIMITS.tests).optional() }));
function playwright(input: unknown): ImportRow[] {
  const root = z.object({ suites: z.array(pwSuite) }).parse(input);
  const rows: ImportRow[] = [];
  const walk = (suites: PwSuite[], depth: number) => {
    if (depth > 64) throw new Error('INVALID_REPORT: nesting limit');
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) for (const t of spec.tests) {
        rows.push({ identity: identityFromAnnotations(t.annotations ?? [], t.projectName), title: spec.title, file: spec.file, expectedStatus: t.expectedStatus,
          attempts: t.results.map(a => ({ retry: a.retry, repeatEachIndex: t.repeatEachIndex ?? 0, status: a.status, startedAt: a.startTime, durationMs: a.duration, errors: (a.errors ?? []).map(e => ({ message: e.message ?? '', stack: e.stack ?? null })), stdout: (a.stdout ?? []).map(s => s.text ?? '[binary output omitted]').join(''), stderr: (a.stderr ?? []).map(s => s.text ?? '[binary output omitted]').join(''), attachments: [] })) });
        if (rows.length > LIMITS.tests) throw new Error('INVALID_REPORT: test limit');
      }
      walk(suite.suites ?? [], depth + 1);
    }
  };
  walk(root.suites, 0);
  return rows;
}
function junit(text: string): ImportRow[] {
  const parser = new SaxesParser({ xmlns: false });
  const rows: ImportRow[] = [], stack: string[] = [];
  let row: ImportRow | null = null, properties: { type: string; description: string }[] = [], project = '', errorText = '';
  parser.on('doctype', () => { throw new Error('INVALID_XML: DTD forbidden'); });
  parser.on('error', e => { throw new Error(`INVALID_XML: ${e.message}`); });
  parser.on('opentag', tag => {
    const parent = stack.at(-1);
    stack.push(tag.name);
    if (stack.length > 64) throw new Error('INVALID_XML: nesting limit');
    if (stack.length === 1 && !['testsuites', 'testsuite'].includes(tag.name)) throw new Error('INVALID_XML: expected JUnit root');
    if (tag.name === 'testcase') {
      if (row || parent !== 'testsuite') throw new Error('INVALID_XML: testcase nesting');
      const seconds = tag.attributes.time === undefined ? 0 : Number(tag.attributes.time);
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error('INVALID_XML: duration');
      row = { identity: null, title: String(tag.attributes.name ?? ''), file: String(tag.attributes.file ?? ''), expectedStatus: 'passed', attempts: [blankAttempt('passed', seconds * 1000)] };
      properties = []; project = ''; errorText = '';
    }
    if (!row) return;
    if (tag.name === 'property' && parent === 'properties') {
      const name = String(tag.attributes.name ?? ''), value = String(tag.attributes.value ?? '');
      if (name === 'testoritto.project') { if (project) throw new Error('DUPLICATE_IDENTITY: project'); project = value; }
      else if (name.startsWith('testoritto.')) properties.push({ type: name, description: value });
    }
    if (['failure', 'error', 'skipped'].includes(tag.name) && parent === 'testcase') { row.attempts[0]!.status = tag.name === 'skipped' ? 'skipped' : 'failed'; errorText = String(tag.attributes.message ?? ''); }
  });
  parser.on('text', value => {
    if (!row) return;
    const current = stack.at(-1), attempt = row.attempts[0]!;
    if (current === 'system-out') attempt.stdout += value;
    if (current === 'system-err') attempt.stderr += value;
    if (current === 'failure' || current === 'error') errorText += value;
  });
  parser.on('closetag', tag => {
    if (row && ['failure', 'error'].includes(tag.name)) row.attempts[0]!.errors.push({ message: errorText, stack: null });
    if (tag.name === 'testcase' && row) {
      row.identity = identityFromAnnotations(properties, project);
      rows.push(row); row = null;
      if (rows.length > LIMITS.tests) throw new Error('INVALID_REPORT: test limit');
    }
    stack.pop();
  });
  parser.write(text).close();
  return rows;
}
export function parseImport(text: string, format: ParsedImport['format']): ParsedImport {
  if (text.length > LIMITS.reportBytes || new TextEncoder().encode(text).length > LIMITS.reportBytes) throw new Error('INVALID_REPORT: size limit');
  let parsed: ParsedImport;
  if (format === 'junit') parsed = { format, runId: null, executionId: null, source: null, tests: junit(text) };
  else {
    const data: unknown = JSON.parse(text);
    if (format === 'testoritto') { const report = ReportSchema.parse(data); parsed = { format, runId: report.runId, executionId: report.executionId, source: report.source, tests: report.tests.map(t => ({ identity: { caseId: t.caseId, automationId: t.automationId, project: t.project, variantId: t.variantId }, title: t.title, file: t.file, expectedStatus: t.expectedStatus, attempts: t.attempts })) }; }
    else if (format === 'playwright') parsed = { format, runId: null, executionId: null, source: null, tests: playwright(data) };
    else throw new Error('INVALID_REPORT: format');
  }
  let bytes = 0;
  for (const row of parsed.tests) for (const a of row.attempts) { AttemptSchema.parse(a); bytes += new TextEncoder().encode(a.stdout + a.stderr).length; }
  if (bytes > LIMITS.logBytes) throw new Error('INVALID_REPORT: log limit');
  return parsed;
}
export interface PreviewOptions { targetRunId: string; targetRevision: string; sourceHash: string; bindings: StableKey[]; importedHashes: string[]; mapping?: Record<string, StableKey>; existingExecutions?: Record<string, string> }
export function previewImport(parsed: ParsedImport, options: PreviewOptions) {
  RelativePathSchema.parse(options.targetRunId); HashSchema.parse(options.targetRevision); HashSchema.parse(options.sourceHash);
  const bindings = options.bindings.map(k => KeySchema.parse(k)), bindingCounts = new Map<string, number>(), rowCounts = new Map<string, number>();
  for (const k of bindings) bindingCounts.set(stableKey(k), (bindingCounts.get(stableKey(k)) ?? 0) + 1);
  const identities = parsed.tests.map((t, i) => options.mapping?.[String(i)] ? KeySchema.parse(options.mapping[String(i)]) : t.identity);
  for (const k of identities) if (k) rowCounts.set(stableKey(k), (rowCounts.get(stableKey(k)) ?? 0) + 1);
  return { normalizerVersion: 1 as const, targetRunId: options.targetRunId, targetRevision: options.targetRevision, sourceHash: options.sourceHash, foreignRun: parsed.runId !== null && parsed.runId !== options.targetRunId, metadataMissing: parsed.runId === null, duplicateImport: options.importedHashes.includes(options.sourceHash), executionConflict: parsed.executionId !== null && options.existingExecutions?.[parsed.executionId] !== undefined && options.existingExecutions[parsed.executionId] !== options.sourceHash,
    rows: parsed.tests.map((t, i) => { const identity = identities[i] ?? null, key = identity ? stableKey(identity) : null; return { index: i, identity, status: key && ((rowCounts.get(key) ?? 0) > 1 || (bindingCounts.get(key) ?? 0) > 1) ? 'duplicate' as const : key && bindingCounts.get(key) === 1 ? 'matched' as const : 'unmatched' as const, outcome: outcomeOf(t.expectedStatus, t.attempts), test: t }; }) };
}
