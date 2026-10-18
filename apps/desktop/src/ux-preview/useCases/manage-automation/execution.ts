import { AttemptSchema, ReportSchema, TestRecordSchema, outcomeOf } from '@testoritto/playwright-automation';
import type { Attempt, AutomationReport, StableKey, TestRecord } from '@testoritto/playwright-automation';
import { demoAttachmentNames, demoHash, demoSource } from './fixtures';
import type { AttemptPlan, DemoExecution } from './types';

const ATTEMPTS: Record<AttemptPlan, { status: Attempt['status']; errors: string[]; stdout: string; stderr: string }> = {
  passed: { status: 'passed', errors: [], stdout: 'оплата подтверждена, номер заказа получен', stderr: '' },
  failed: { status: 'failed', errors: ['Error: ожидался переход на страницу успеха, получен статус 402'], stdout: 'шаг 3: вызван тестовый шлюз', stderr: 'payment declined' },
  timedOut: { status: 'timedOut', errors: ['TimeoutError: элемент ".refund-total" не появился за 15000ms'], stdout: '', stderr: '' },
  skipped: { status: 'skipped', errors: [], stdout: 'тест пропущен: стенд не поддерживает частичный возврат', stderr: '' },
};

/** Turns the scripted plan into real attempts; the profile allows one retry, which produces the flaky case. */
export function buildAttempts(plan: AttemptPlan[], retries: number, startedAt: string, attachmentIds: string[]): Attempt[] {
  const steps = plan.slice(0, retries + 1);
  return steps.map((step, index) => {
    const shape = ATTEMPTS[step];
    return AttemptSchema.parse({
      retry: index, repeatEachIndex: 0, status: shape.status,
      startedAt, durationMs: 900 + index * 700 + (shape.status === 'timedOut' ? 15_000 : 0),
      errors: shape.errors.map((message) => ({ message, stack: shape.status === 'failed' ? 'at tests/pay/card.spec.ts:42:11' : null })),
      stdout: shape.stdout, stderr: shape.stderr,
      attachments: shape.status === 'passed' ? attachmentIds.slice(0, 2) : attachmentIds.slice(1),
    });
  });
}
export function buildRecord(key: StableKey, title: string, file: string, expectedStatus: TestRecord['expectedStatus'], attempts: Attempt[]): TestRecord {
  return TestRecordSchema.parse({ ...key, title, file, expectedStatus, outcome: outcomeOf(expectedStatus, attempts), attempts });
}
export function interruptedRecord(key: StableKey, title: string, file: string): TestRecord {
  const attempt = AttemptSchema.parse({ retry: 0, repeatEachIndex: 0, status: 'interrupted', startedAt: null, durationMs: 0, errors: [], stdout: '', stderr: '', attachments: [] });
  return buildRecord(key, title, file, 'passed', [attempt]);
}

export type ReportInput = {
  executionId: string; parentExecutionId: string | null; runId: string; profileId: string; profileRevision: string;
  catalogRevision: string; createdAt: string; startedAt: string; finishedAt: string; selection: StableKey[]; records: TestRecord[];
  logs: { stdout: string; stderr: string; truncated: boolean }; runnerErrors: { message: string; stack: string | null }[];
  attachments: { id: string; name: string; contentType: string; path: string | null; size: number; unavailableReason: string | null }[];
};
/** A final report is accepted only when the whole contract holds: correlation, completeness, selection and limits. */
export function tryBuildReport(input: ReportInput): AutomationReport | null {
  const parsed = ReportSchema.safeParse({
    schemaVersion: 1, runId: input.runId, executionId: input.executionId, parentExecutionId: input.parentExecutionId,
    profileId: input.profileId, profileRevision: input.profileRevision, catalogRevision: input.catalogRevision,
    createdAt: input.createdAt, source: demoSource, selection: input.selection,
    state: 'completed', reason: null, startedAt: input.startedAt, finishedAt: input.finishedAt, complete: true,
    tests: input.records, runnerErrors: input.runnerErrors, logs: input.logs, attachments: input.attachments,
  });
  return parsed.success ? parsed.data : null;
}
export function junitText(report: AutomationReport): string {
  const escape = (value: string) => value.replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!);
  const cases = report.tests.map((test) => {
    const failures = test.attempts.flatMap((attempt) => attempt.errors).map((error) => `<failure message="${escape(error.message)}"/>`);
    const skipped = test.outcome === 'skipped' ? '<skipped/>' : '';
    const time = (test.attempts.reduce((total, attempt) => total + attempt.durationMs, 0) / 1000).toFixed(3);
    return `    <testcase classname="${escape(test.project)}" name="${escape(test.title)}" file="${escape(test.file)}" time="${time}">\n      <properties><property name="testoritto.project" value="${escape(test.project)}"/><property name="testoritto.caseId" value="${escape(test.caseId)}"/><property name="testoritto.automationId" value="${escape(test.automationId)}"/><property name="testoritto.variantId" value="${escape(test.variantId)}"/></properties>\n      ${failures.join('')}${skipped}\n    </testcase>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="testoritto" tests="${report.tests.length}">\n  <testsuite name="${escape(report.profileId)}" tests="${report.tests.length}">\n${cases.join('\n')}\n  </testsuite>\n</testsuites>\n`;
}
type SampleTest = { key: StableKey; title: string; file: string };
/** Playwright JSON sample with stable annotations; the last row deliberately has no identity. */
export function samplePlaywrightReport(tests: SampleTest[]): string {
  const specs = tests.map((test) => ({
    title: test.title, file: test.file,
    tests: [{
      projectName: test.key.project, expectedStatus: 'passed', repeatEachIndex: 0,
      annotations: [
        { type: 'testoritto.caseId', description: test.key.caseId },
        { type: 'testoritto.automationId', description: test.key.automationId },
        { type: 'testoritto.variantId', description: test.key.variantId },
      ],
      results: [{ retry: 0, status: 'passed', startTime: '2026-10-17T09:12:00.000Z', duration: 1200, errors: [], stdout: [{ text: 'ok' }], stderr: [] }],
    }],
  }));
  specs.push({ title: 'Чужой тест без аннотаций', file: 'tests/other/unrelated.spec.ts', tests: [{ projectName: 'chromium', expectedStatus: 'passed', repeatEachIndex: 0, annotations: [], results: [{ retry: 0, status: 'passed', startTime: '2026-10-17T09:12:05.000Z', duration: 300, errors: [], stdout: [], stderr: [] }] }] });
  return JSON.stringify({ config: { rootDir: '.' }, suites: [{ title: 'demo', specs }] }, null, 2);
}
export function sampleJunitReport(tests: SampleTest[], failed = 'PAY-043-auto'): string {
  const cases = tests.map((test) => {
    const failure = test.key.automationId === failed ? '<failure message="Недостаточно средств"/>' : '';
    return `    <testcase classname="${test.key.project}" name="${test.title}" file="${test.file}" time="1.200">\n      <properties><property name="testoritto.project" value="${test.key.project}"/><property name="testoritto.caseId" value="${test.key.caseId}"/><property name="testoritto.automationId" value="${test.key.automationId}"/></properties>\n      ${failure}\n    </testcase>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n  <testsuite name="chromium" tests="${tests.length}">\n${cases.join('\n')}\n  </testsuite>\n</testsuites>\n`;
}
export async function sha256Hex(text: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}
export function executionSummary(execution: DemoExecution): { total: number; unexpected: number; flaky: number; expected: number } {
  const counts = { total: execution.records.length, unexpected: 0, flaky: 0, expected: 0 };
  for (const record of execution.records) {
    if (record.outcome === 'unexpected') counts.unexpected += 1;
    else if (record.outcome === 'flaky') counts.flaky += 1;
    else if (record.outcome === 'expected') counts.expected += 1;
  }
  return counts;
}
export function demoSha(seed: string): string { return demoHash(seed); }
export function attachmentNames(): string[] { return [...demoAttachmentNames]; }
