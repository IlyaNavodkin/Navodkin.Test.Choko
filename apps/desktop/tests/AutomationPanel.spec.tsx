import { I18nProvider } from '@codaa/ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import '../src/shared/i18n/i18n';
import { createAutomationApi } from '../src/automation/api/automationApi';
import { AutomationPanel } from '../src/automation/useCases/manage-automation/AutomationPanel';

const sessionId = 'a0000000-0000-4000-8000-000000000001';
const executionId = 'a0000000-0000-4000-8000-000000000002';
const profileRevision = 'c'.repeat(64);
const settingsRevision = 'a'.repeat(64);
const catalogRevision = 'd'.repeat(64);
const createdAt = '2026-10-17T12:00:00.000Z';
const key = { caseId: 'C1', automationId: 'A1', project: 'unit', variantId: 'default' };
const profile = { schemaVersion: 1 as const, profileId: 'local', label: 'Local', cwd: '.', config: 'playwright.config.ts', projects: ['unit'], timeoutMs: 300_000, retries: 0, workers: 1 };
const runs = {
  runs: [{ runId: 'run-dir', name: 'Release check', created: '2026-10-17', testDate: '2026-10-17', status: 'open' as const, scope: 'Web', detailsResourceId: null, cases: [{ resourceId: 'b0000000-0000-4000-8000-000000000001', path: 'run/case.md', caseId: 'C1', displayId: 'T-1', title: 'Login', result: 'not_run' as const }] }],
  warnings: [],
};
const summary = { executionId, runId: 'run-dir', profileId: 'local', operation: 'discover' as const, state: 'completed' as const, reason: null, createdAt };
const catalog = { schemaVersion: 2 as const, executionId, profileId: 'local', profileRevision, catalogRevision, tests: [{ ...key, title: 'Login flow', file: 'case.spec.ts', expectedStatus: 'passed' as const }], dependencies: [] };
const autotest = { schemaVersion: 2 as const, id: '11111111-1111-4111-8111-000000000001', title: 'Login flow', description: 'case.spec.ts', archived: false, revision: 'rev-1', profileId: 'local', selector: { automationId: key.automationId, project: key.project, variantId: key.variantId }, argumentDefinitions: [], defaults: {} };
const binding = { schemaVersion: 2 as const, id: '22222222-2222-4222-8222-000000000001', caseId: key.caseId, autotestId: autotest.id, revision: 'rev-1', enabled: true, argumentOverrides: {} };
const snapshot = { schemaVersion: 2 as const, invocationId: 'c0000000-0000-4000-8000-000000000001', createdAt, caseRevision: 'case-rev-1', autotest, binding, runOverrides: {}, environments: [], resolvedArguments: {}, sources: [] };
const record = { ...key, invocationId: snapshot.invocationId, title: 'Login flow', file: 'case.spec.ts', expectedStatus: 'passed' as const, outcome: 'expected' as const, attempts: [{ retry: 0, repeatEachIndex: 0, status: 'passed' as const, startedAt: createdAt, durationMs: 12, errors: [], stdout: '', stderr: '', attachments: [] }] };
const report = { state: 'completed' as const, startedAt: createdAt, finishedAt: createdAt, source: { commit: null, branch: 'main', dirty: false }, reason: null, logs: { stdout: '', stderr: '', truncated: false }, runnerErrors: [], attachments: [], testCount: 1, detailsTruncated: false };
const view = (autotests: unknown[] = [], bindings: unknown[] = []) => ({ revision: settingsRevision, profiles: [{ profile, revision: profileRevision, trusted: true, nodePath: '/usr/bin/node' }], autotests, bindings, environments: [], history: [] });

function fakeApi() {
  let mode: 'discover' | 'run' = 'discover';
  // Каталог панели хранит те же id, что она отправила: привязка ссылается на её автотест.
  let savedAutotests: unknown[] = [];
  let savedBindings: unknown[] = [];
  return createAutomationApi({
    invoke: async (command, raw) => {
      const request = (raw as { request: Record<string, unknown> }).request;
      switch (command) {
        case 'read_automation': return view();
        case 'save_automation_autotest': savedAutotests = [request.autotest as unknown]; return view(savedAutotests, savedBindings);
        case 'save_automation_binding': savedBindings = [request.binding as unknown]; return view(savedAutotests, savedBindings);
        case 'preview_automation_invocations': return { snapshots: [snapshot], issues: [] };
        case 'discover_automation': mode = 'discover'; return { ...summary, operation: 'discover' as const, state: 'running' as const };
        case 'start_automation': mode = 'run'; return { ...summary, operation: 'run' as const, state: 'running' as const };
        case 'poll_automation': {
          const cursor = request.cursor as number;
          if (mode === 'run') return { execution: { ...summary, operation: 'run' }, cursor, nextCursor: null, tests: [record], invocations: [snapshot], catalog: null, report, detailsTruncated: false };
          return { execution: summary, cursor, nextCursor: null, tests: [], invocations: [], catalog, report: null, detailsTruncated: false };
        }
        case 'cancel_automation': return null;
        default: throw new Error(`Unexpected command ${command}`);
      }
    },
  });
}

function renderPanel() {
  return render(<I18nProvider language="ru"><AutomationPanel sessionId={sessionId} runs={runs} isRunsLoading={false} runsErrorCode={null} onRefreshRuns={vi.fn()} blocked={false} api={fakeApi()} /></I18nProvider>);
}

describe('automation panel', () => {
  beforeAll(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn();
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as typeof ResizeObserver;
  });
  afterEach(cleanup);

  it('discovery связывает найденный тест с кейсом, запускает его и показывает результат', async () => {
    renderPanel();
    await screen.findByRole('heading', { name: 'Автотесты' });
    fireEvent.click(screen.getByRole('button', { name: 'Найти тесты' }));
    const checkbox = await screen.findByRole('checkbox');
    expect(screen.getByText('Login flow')).toBeTruthy();
    expect((checkbox as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Запустить выбранные' }));
    await waitFor(() => expect(screen.getByText('Ожидаемо')).toBeTruthy());
    expect(screen.getByText('Завершено')).toBeTruthy();
    expect(screen.getAllByText('Login flow').length).toBeGreaterThan(0);
  });
});
