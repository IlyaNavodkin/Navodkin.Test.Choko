import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppStore } from '../app-store';
import { cases, runs } from '@/data/sample';
import type { CatalogEntry, AutomationBinding } from '@/schemas/automation-store';
import { loadBindings, loadCatalog } from '@/services/automation/catalog';
import { serializeReferenceEntry } from '@/services/format/reference-book';
import { readGlossaryEntry } from '@/services/reference-book';
import { resolveArguments } from '@/services/automation/arguments';

let repo = '';
const entry: CatalogEntry = { automationId: 'count', title: 'Count values', project: 'chromium', variantId: null,
  caseId: null, file: 'tests/count.spec.ts', line: 4, titlePath: ['Count values'], tags: ['@tt:count'],
  expectedStatus: 'passed', arguments: [], archived: false, revision: 'r1' };
const store = () => useAppStore.getState();
beforeEach(async () => {
  repo = await mkdtemp(join(tmpdir(), 'casewright-automation-ui-'));
  useAppStore.setState({ repoPath: repo, cases: structuredClone(cases), runs: structuredClone(runs),
    automationCatalog: [structuredClone(entry)], automationBindings: [], automationIssues: [], runAutomation: {}, refs: [] });
});
afterEach(async () => { await rm(repo, { recursive: true, force: true }); });

describe('automation workflow persistence', () => {
  it('persists a new Case selection and replaces only the selected test’s legacy links', async () => {
    await store().assignAutomationCase(entry, cases[0].id);
    const first = store().automationBindings[0];
    useAppStore.setState({ automationBindings: [first, { ...first, id: 'legacy', caseId: cases[1].id }, { ...first, id: 'other', automationId: 'other' }] });
    await store().assignAutomationCase(entry, cases[2].id);
    const saved = await loadBindings(repo);
    expect(saved.file.bindings).toHaveLength(2);
    expect(saved.file.bindings.find((b) => b.automationId === 'count')?.caseId).toBe(cases[2].id);
    expect(saved.file.bindings.find((b) => b.automationId === 'other')?.caseId).toBe(cases[0].id);
  });

  it('persists typed reference pointers, resolves false/zero, and retains them after rebinding', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    await mkdir(join(repo, '.casewright', 'glossary'), { recursive: true });
    await writeFile(join(repo, '.casewright', 'glossary', `${id}.md`), serializeReferenceEntry({ id, kind: 'arguments', title: 'Stage', aliases: [], archived: false, description: '', values: [{ key: 'retries', type: 'number', value: 0 }, { key: 'headless', type: 'boolean', value: false }] }));
    const doc = (await readGlossaryEntry(repo, id))!;
    useAppStore.setState({ refs: [doc] });
    await store().assignAutomationCase(entry, cases[0].id);
    await store().setAutomationArgumentSet(entry, id);
    const binding = (await loadBindings(repo)).file.bindings[0];
    const catalog = (await loadCatalog(repo)).file.entries[0];
    expect(binding.arguments.retries).toMatchObject({ kind: 'reference', entryId: id, revision: doc.revision });
    expect(JSON.stringify(binding.arguments)).not.toContain('false');
    const resolved = await resolveArguments({ repoPath: repo, definitions: catalog.arguments, binding: binding.arguments });
    expect(resolved.ok).toBe(true);
    expect(resolved.values.map((v) => v.value)).toEqual([0, false]);
    await store().assignAutomationCase(catalog, cases[1].id);
    expect(store().automationBindings[0].arguments).toEqual(binding.arguments);
  });

  it('reruns only the failed project’s binding, excluding a recovered historical failure', async () => {
    const base = { executionId: '2026-10-20T10', automationId: 'count', caseId: cases[0].id, caseRowIndex: 0, flaky: false, attempts: 1, duration: 10 };
    const binding: AutomationBinding = { id: 'chrome', caseId: cases[0].id, automationId: 'count', project: 'chromium', variantId: 'default', enabled: true, archived: false, arguments: {} };
    const start = vi.fn(async () => {});
    const originalStart = store().startRunAutomation;
    const originalToast = store().toast;
    useAppStore.setState({ startRunAutomation: start, toast: () => {}, automationBindings: [binding, { ...binding, id: 'firefox', project: 'firefox' }], runAutomation: { [runs[0].id]: { busy: false, issues: [], executions: [], results: [
      { ...base, project: 'chromium', status: 'failed' }, { ...base, executionId: '2026-10-20T12', project: 'chromium', status: 'passed' }, { ...base, project: 'firefox', status: 'failed' },
    ] } } });
    try {
      await store().rerunFailedAutomation(runs[0].id);
      expect(start).toHaveBeenCalledWith(runs[0].id, expect.objectContaining({ onlyBindingIds: ['firefox'] }));
    } finally { useAppStore.setState({ startRunAutomation: originalStart, toast: originalToast }); }
  });
});
