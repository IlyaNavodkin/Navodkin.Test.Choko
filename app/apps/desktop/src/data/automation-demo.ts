import type { CatalogEntry, AutomationBinding } from '@/schemas/automation-store';
import type { ResolvedAutomationArg } from '@/schemas/automation';
import type { ReferenceDoc } from '@/services/reference-book';
import type { RunAutomationResult } from '@/services/automation/run-results';
import { useAppStore } from '@/store/app-store';
import { resolveArguments } from '@/services/automation/arguments';
import { automationEntryKey, planReferenceArguments, runAutomationEntries } from '@/utils/automation-workflow';

/** Disposable browser fixtures. Simulated launches never execute project code. */
export function installAutomationDemo(): void {
  const state = useAppStore.getState();
  const docs: ReferenceDoc[] = ['Development', 'Staging'].map((title, i) => ({
    id: `00000000-0000-4000-8000-00000000000${i + 1}`, rel: `.ch/glossary/environment-${i}.md`,
    revision: `demo-environment-${i}`, readonly: false, issues: [], extra: {}, eol: '\n',
    entry: { id: `00000000-0000-4000-8000-00000000000${i + 1}`, title, kind: 'arguments', archived: false,
      aliases: [i ? 'stage' : 'dev'], description: i ? 'Проверки в тестовом окружении перед релизом.' : 'Локальная разработка и отладка тестов.',
      values: [{ key: 'baseUrl', type: 'url', value: 'https://www.random.org' }, { key: 'timeout', type: 'number', value: i ? 20000 : 10000 }, { key: 'headless', type: 'boolean', value: !!i }],
    },
  }));
  const specifications = [
    ['integer-count', 'Возвращает заданное количество чисел', 'tests/generators/integers/count.spec.ts', 'RND-0001'],
    ['integer-range', 'Все числа находятся в заданном диапазоне', 'tests/generators/integers/range.spec.ts', 'RND-0001'],
    ['integer-invalid-range', 'Отклоняет некорректный диапазон', 'tests/generators/integers/range.spec.ts', 'RND-0001'],
    ['dice-six-sides', 'Значение кубика от 1 до 6', 'tests/games/dice/roll.spec.ts', 'RND-0010'],
    ['dice-multiple', 'Возвращает результат для каждого кубика', 'tests/games/dice/roll.spec.ts', 'RND-0010'],
    ['cards-unique', 'В руке нет повторяющихся карт', 'tests/games/cards/deal.spec.ts', 'RND-0011'],
    ['cards-count', 'Размер руки соответствует запросу', 'tests/games/cards/deal.spec.ts', 'RND-0011'],
    ['quota-limit', 'Исчерпанная квота блокирует запрос', 'tests/generators/quota/limit.spec.ts', ''],
  ];
  const catalog: CatalogEntry[] = specifications.map(([automationId, title, file, displayId], i) => ({
    automationId, title, file, line: 8 + i * 6, titlePath: [title], caseId: null, variantId: null,
    project: 'chromium', tags: [`@tt:${automationId}`], expectedStatus: 'passed',
    archived: false, revision: 'demo-catalog', arguments: [],
  }));
  const bindings: AutomationBinding[] = catalog.flatMap((entry, i) => {
    const kase = state.cases.find((c) => c.displayId === specifications[i][3]);
    if (!kase) return [];
    const plan = planReferenceArguments(entry, docs[1]);
    entry.arguments = plan.definitions;
    return [{ id: `demo-binding-${i}`, caseId: kase.id, automationId: entry.automationId, project: entry.project,
      variantId: 'default', enabled: true, archived: false, arguments: plan.values }];
  });
  const runAutomation = Object.fromEntries(state.runs.map((run) => {
    const entries = runAutomationEntries(catalog, bindings, run.rows.map((r) => r.case_id));
    const results: RunAutomationResult[] = entries.slice(0, 5).map((entry, i) => {
      const binding = bindings.find((b) => automationEntryKey(b) === automationEntryKey(entry))!;
      return { executionId: '2026-10-20T10-00-00-000-demo', recordedAt: '2026-10-20T10:00:00.000Z',
        automationId: entry.automationId, project: entry.project, caseId: binding.caseId,
        caseRowIndex: run.rows.findIndex((r) => r.case_id === binding.caseId), status: i === 1 ? 'failed' : 'passed',
        flaky: false, attempts: 1, duration: 680 + i * 230,
        ...(i === 1 ? { error: 'Expected every value to be <= 100. Received: [12, 57, 101].\nrange.spec.ts:20' } : {}),
      };
    });
    return [run.id, { executions: [], results, busy: false, issues: [] }];
  }));
  const tokens = new Map<string, object>();
  useAppStore.setState({
    refs: docs, automationCatalog: catalog, automationBindings: bindings, runAutomation,
    automationSelId: automationEntryKey(catalog[0]), automationTrusted: true,
    loadAutomation: async () => {}, loadRefs: async () => {}, loadRunAutomation: async () => {},
    discoverAutomation: async () => useAppStore.getState().toast('Demo project refreshed. No project code was executed.'),
    importAutomationReport: async () => useAppStore.getState().toast('External JSON/JUnit report import is available in the desktop app.'),
    previewRunAutomation: async (runId) => {
      const current = useAppStore.getState();
      const run = current.runs.find((r) => r.id === runId);
      if (!run) return;
      const preview: ResolvedAutomationArg[] = [];
      const problems: string[] = [];
      for (const binding of current.automationBindings) {
        if (!binding.enabled || binding.archived || !run.rows.some((r) => r.case_id === binding.caseId)) continue;
        const entry = current.automationCatalog.find((e) => automationEntryKey(e) === automationEntryKey(binding));
        if (!entry) continue;
        const resolved = await resolveArguments({ repoPath: '', definitions: entry.arguments, binding: binding.arguments }, { readEntry: async (_path, id) => current.refs.find((d) => d.id === id) ?? null });
        preview.push(...resolved.values.map((v) => ({ ...v, key: `${entry.automationId}.${v.key}` })));
        problems.push(...resolved.problems);
      }
      useAppStore.setState((s) => ({ runAutomation: { ...s.runAutomation, [runId]: { ...s.runAutomation[runId], preview, previewProblems: problems } } }));
    },
    startRunAutomation: async (runId, opts) => {
      const current = useAppStore.getState();
      const run = current.runs.find((r) => r.id === runId);
      if (!run || current.runAutomation[runId]?.busy) return;
      const bindings = current.automationBindings.filter((b) => b.enabled && !b.archived && run.rows.some((r) => r.case_id === b.caseId) && (!opts?.onlyBindingIds || opts.onlyBindingIds.includes(b.id)) && (!opts?.onlyAutomationIds || opts.onlyAutomationIds.includes(b.automationId)));
      if (!bindings.length) return;
      const token = {};
      tokens.set(runId, token);
      const startedAt = new Date().toISOString();
      const executionId = startedAt.replace(/[:.]/g, '-') + '-demo';
      await current.previewRunAutomation(runId);
      const problems = useAppStore.getState().runAutomation[runId]?.previewProblems ?? [];
      if (problems.length) return;
      useAppStore.setState((s) => ({ runAutomation: { ...s.runAutomation, [runId]: {
        ...s.runAutomation[runId], busy: true, activeBindingIds: bindings.map((b) => b.id),
        executions: [{ executionId, project: 'chromium', state: 'running', completed: 0, total: bindings.length,
          currentLine: 'Simulated browser preview', logTail: 'DEMO: no Playwright process is started.', error: null, startedAt,
          arguments: s.runAutomation[runId].preview?.filter((a) => bindings.some((b) => a.key.startsWith(b.automationId + '.'))),
        }, ...s.runAutomation[runId].executions],
      } } }));
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (tokens.get(runId) !== token) return;
      const results: RunAutomationResult[] = bindings.map((b) => ({
        executionId, recordedAt: startedAt, automationId: b.automationId, project: b.project, caseId: b.caseId,
        caseRowIndex: run.rows.findIndex((r) => r.case_id === b.caseId), status: 'passed', flaky: false, attempts: 1, duration: 700,
      }));
      useAppStore.setState((s) => ({ runAutomation: { ...s.runAutomation, [runId]: {
        ...s.runAutomation[runId], busy: false, results: [...s.runAutomation[runId].results, ...results],
        executions: s.runAutomation[runId].executions.map((e) => e.executionId === executionId ? { ...e, state: 'completed', completed: bindings.length } : e),
      } } }));
      current.toast(`Demo: ${bindings.length} simulated test(s) passed`);
    },
    stopRunAutomation: (runId) => {
      tokens.delete(runId);
      useAppStore.setState((s) => ({ runAutomation: { ...s.runAutomation, [runId]: { ...s.runAutomation[runId], busy: false, executions: s.runAutomation[runId].executions.map((e) => e.state === 'running' ? { ...e, state: 'cancelled' } : e) } } }));
    },
    saveAutomationExecution: async () => useAppStore.getState().toast('Demo results live in memory and reset on reload.'),
  });
}
