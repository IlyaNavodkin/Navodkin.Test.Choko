import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArgumentDefinitionSchema, ArgumentValuesSchema, AutomationCatalogSchema, EnvironmentEntrySchema, createInvocationSnapshot, parseImport, previewImport, validateInvocationPreview } from '@testoritto/playwright-automation';
import type { ArgumentDefinition, ArgumentResolutionIssue, ArgumentValue, Attempt, Autotest, CaseAutotestBinding, EnvironmentEntry, InvocationSnapshot, PrimitiveValue, StableKey, TestRecord } from '@testoritto/playwright-automation';
import type { GlossaryEntry } from '../manage-glossary/types';
import type { DemoCase, DemoFile } from '../explore-design/types';
import { attachmentNames, buildAttempts, buildRecord, demoSha, executionSummary, interruptedRecord, junitText, sampleJunitReport, samplePlaywrightReport, sha256Hex, tryBuildReport } from './execution';
import type { ReportInput } from './execution';
import { at } from './messages';
import { demoBindings, demoDiscovery, demoHash, demoProfile, demoRunId, demoScript, demoSource, demoAutotests } from './fixtures';
import type { ArgumentOverridesDraft, ArgumentRow, AttemptPlan, AutotestDraft, AutomationState, BindingDraft, DiscoveryCatalog, DemoExecution, ExecutionState, ImportFormat, ImportPreviewView, ReportArtifact } from './types';

export type UsePreviewAutomationArgs = {
  repository: number;
  blocked: boolean;
  state: AutomationState;
  cases: DemoCase[];
  environments: GlossaryEntry[];
  onFiles: (files: DemoFile[]) => void;
};
export type UsePreviewAutomationResult = ReturnType<typeof useAutomationState>;

const LAYERS = ['schema', 'autotest', 'binding', 'run'] as const;
const layerLabel = (layer: string): string => (layer === 'schema' ? 'значение по умолчанию' : layer === 'autotest' ? 'значения автотеста' : layer === 'binding' ? 'значения привязки' : 'значения запуска');
export const overrideLayers = LAYERS;
export const overrideLayerLabel = layerLabel;

export function emptyArgumentRow(): ArgumentRow {
  return { key: '', label: '', description: '', required: false, type: 'string', format: '', defaultValue: '', options: '', min: '', max: '' };
}
export function autotestDraft(test: Autotest): AutotestDraft {
  return {
    title: test.title, description: test.description, profileId: test.profileId,
    automationId: test.selector.automationId, project: test.selector.project, variantId: test.selector.variantId,
    rows: test.argumentDefinitions.map((definition) => ({
      key: definition.key, label: definition.label, description: definition.description, required: definition.required, type: definition.type,
      format: definition.type === 'string' ? definition.format ?? '' : '',
      defaultValue: definition.default === undefined ? '' : String(definition.default),
      options: definition.type === 'enum' ? definition.options.join(', ') : '',
      min: definition.type === 'number' && definition.min !== undefined ? String(definition.min) : '',
      max: definition.type === 'number' && definition.max !== undefined ? String(definition.max) : '',
    })),
  };
}
/** Builds real argument definitions from the editor rows; invalid rows stay reported per field. */
export function buildArgumentDefinitions(rows: ArgumentRow[]): { definitions: ArgumentDefinition[]; invalid: boolean } {
  const definitions: ArgumentDefinition[] = [];
  let invalid = false;
  for (const row of rows) {
    const base = { key: row.key.trim(), label: row.label.trim(), description: row.description, required: row.required };
    const literal = row.defaultValue.trim();
    const optionalDefault = <T,>(value: T | undefined) => (value === undefined ? {} : { default: value });
    const candidate = row.type === 'string'
      ? { ...base, type: 'string' as const, ...(row.format ? { format: row.format } : {}), ...optionalDefault(literal === '' ? undefined : literal) }
      : row.type === 'number'
        ? { ...base, type: 'number' as const, ...(row.min.trim() === '' ? {} : { min: Number(row.min) }), ...(row.max.trim() === '' ? {} : { max: Number(row.max) }), ...optionalDefault(literal === '' ? undefined : Number(literal)) }
        : row.type === 'boolean'
          ? { ...base, type: 'boolean' as const, ...optionalDefault(literal === '' ? undefined : literal === 'true') }
          : { ...base, type: 'enum' as const, options: row.options.split(',').map((value) => value.trim()).filter(Boolean), ...optionalDefault(literal === '' ? undefined : literal) };
    const parsed = ArgumentDefinitionSchema.safeParse(candidate);
    if (!parsed.success) invalid = true; else definitions.push(parsed.data);
  }
  return { definitions, invalid };
}
export function coerceLiteral(definition: ArgumentDefinition, text: string): { value?: PrimitiveValue; invalid: boolean } {
  if (definition.type === 'number') { const value = Number(text); return Number.isFinite(value) && text.trim() !== '' ? { value, invalid: false } : { invalid: true }; }
  if (definition.type === 'boolean') return text === 'true' || text === 'false' ? { value: text === 'true', invalid: false } : { invalid: true };
  return { value: text, invalid: false };
}
export function literalText(definition: ArgumentDefinition, value: ArgumentValue): string {
  if (value.kind === 'environment') return '';
  return typeof value.value === 'string' ? value.value : String(value.value);
}
export function overridesDraft(autotest: Autotest, stored: Record<string, ArgumentValue>): ArgumentOverridesDraft {
  const draft: ArgumentOverridesDraft = {};
  for (const definition of autotest.argumentDefinitions) {
    const value = stored[definition.key];
    draft[definition.key] = !value ? { source: 'inherit', literal: '', entryId: '', key: '' }
      : value.kind === 'environment' ? { source: 'environment', literal: '', entryId: value.entryId, key: value.key }
        : { source: 'literal', literal: literalText(definition, value), entryId: '', key: '' };
  }
  return draft;
}
/** Overrides must keep the layered reference semantics: an environment reference is not a literal copy. */
export function buildOverrides(autotest: Autotest, draft: ArgumentOverridesDraft): { overrides: Record<string, ArgumentValue>; invalid: boolean } {
  const overrides: Record<string, ArgumentValue> = Object.create(null) as Record<string, ArgumentValue>;
  let invalid = false;
  for (const definition of autotest.argumentDefinitions) {
    const row = draft[definition.key];
    if (!row || row.source === 'inherit') continue;
    if (row.source === 'environment') {
      if (!row.entryId || !row.key) { invalid = true; continue; }
      overrides[definition.key] = { kind: 'environment', entryId: row.entryId, key: row.key };
      continue;
    }
    const coerced = coerceLiteral(definition, row.literal);
    if (coerced.invalid || coerced.value === undefined) { invalid = true; continue; }
    overrides[definition.key] = { kind: 'literal', value: coerced.value };
  }
  if (!ArgumentValuesSchema.safeParse(overrides).success) invalid = true;
  return { overrides, invalid };
}
export function toEnvironmentEntries(entries: GlossaryEntry[]): EnvironmentEntry[] {
  const parsed: EnvironmentEntry[] = [];
  for (const entry of entries) {
    if (entry.kind !== 'environment') continue;
    const result = EnvironmentEntrySchema.safeParse({ id: entry.id, kind: 'environment', title: entry.title, description: entry.description, archived: entry.archived, revision: entry.revision, values: entry.values ?? {} });
    if (result.success) parsed.push(result.data);
  }
  return parsed;
}

function useAutomationState({ blocked, state, cases, environments, onFiles }: UsePreviewAutomationArgs) {
  const profileRevision = useRef(demoSha('profile:playwright-web'));
  const catalogRevision = useRef(demoSha('catalog:empty'));
  const [demoState, setDemoState] = useState<AutomationState>(state);
  const [profile, setProfile] = useState(() => ({ ...demoProfile }));
  const [trusted, setTrusted] = useState(state !== 'untrusted');
  const [autotests, setAutotests] = useState<Autotest[]>(() => demoAutotests());
  const [bindings, setBindings] = useState<CaseAutotestBinding[]>(() => demoBindings());
  const [discovery, setDiscovery] = useState<DiscoveryCatalog | null>(null);
  const [selectedBindings, setSelectedBindings] = useState<string[]>([]);
  const [runOverrides, setRunOverrides] = useState<Record<string, Record<string, ArgumentValue>>>({});
  const [preview, setPreview] = useState<{ bindingId: string; snapshot: InvocationSnapshot } | null>(null);
  const [active, setActive] = useState<DemoExecution | null>(null);
  const [history, setHistory] = useState<DemoExecution[]>([]);
  const [pendingParent, setPendingParent] = useState<string | null>(null);
  const [artifacts, setArtifacts] = useState<ReportArtifact[]>([]);
  const [reportText, setReportText] = useState<string | null>(null);
  const [importFormat, setImportFormat] = useState<ImportFormat>('playwright');
  const [importText, setImportText] = useState('');
  const [importPreview, setImportPreview] = useState<ImportPreviewView | null>(null);
  const [appliedHashes, setAppliedHashes] = useState<string[]>([]);
  const [resultsApplied, setResultsApplied] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const plan = useRef<{ key: StableKey; title: string; file: string; expectedStatus: 'passed' | 'failed' | 'skipped'; attempts: Attempt[]; attachmentIds: string[]; snapshot: InvocationSnapshot }[]>([]);

  const environmentEntries = useMemo(() => toEnvironmentEntries(environments), [environments]);
  const failSave = demoState === 'saveFailed';
  // The demo state switch is also the trust switch: leaving the untrusted state re-grants the demo profile.
  function chooseDemoState(value: AutomationState) { setDemoState(value); setTrusted(value !== 'untrusted'); setError(''); setNotice(''); }
  useEffect(() => { setDemoState(state); setTrusted(state !== 'untrusted'); }, [state]);

  const refreshArtifacts = useCallback(async (execution: DemoExecution) => {
    const report = execution.report;
    const prelude: { name: string; contentType: string; text: string }[] = [];
    if (report) prelude.push({ name: 'report.json', contentType: 'application/json', text: JSON.stringify(report, null, 2) }, { name: 'junit.xml', contentType: 'application/xml', text: junitText(report) });
    const stdout = execution.logs.stdout || 'пустой вывод';
    prelude.push({ name: 'stdout.log', contentType: 'text/plain', text: stdout }, { name: 'attachments.json', contentType: 'application/json', text: JSON.stringify({ attachments: attachmentNames(), note: 'HTML-вложения не открываются в приложении' }, null, 2) });
    const next: ReportArtifact[] = [];
    for (const item of prelude) next.push({ id: crypto.randomUUID(), name: item.name, relativePath: `.testoritto/automation/${execution.executionId}/${item.name}`, contentType: item.contentType, size: new TextEncoder().encode(item.text).length, sha256: await sha256Hex(item.text), saved: false });
    setArtifacts(next);
    setReportText(report ? JSON.stringify(report, null, 2) : null);
  }, []);

  const finish = useCallback(async (execution: DemoExecution, nextState: ExecutionState, reason: string | null) => {
    // Every attachment referenced by an attempt must exist in the report, otherwise the contract rejects it.
    const ids = [...new Set(plan.current.flatMap((item) => item.attachmentIds))];
    const attachments = ids.map((id, index) => index % 2 === 0
      ? { id, name: 'trace.zip', contentType: 'application/zip', path: `${execution.executionId}/trace-${index}.zip`, size: 184_320, unavailableReason: null }
      : { id, name: 'console.html', contentType: 'text/html', path: null, size: 4_096, unavailableReason: 'HTML-вложение не открывается в приложении' });
    const finished: DemoExecution = { ...execution, state: nextState, reason, finishedAt: new Date().toISOString(), logs: { stdout: execution.records.flatMap((record) => record.attempts.map((attempt) => attempt.stdout)).filter(Boolean).join('\n'), stderr: execution.records.flatMap((record) => record.attempts.map((attempt) => attempt.stderr)).filter(Boolean).join('\n'), truncated: false }, attachmentCount: attachments.length };
    const selectionKeys = plan.current.map((item) => `${item.key.caseId}:${item.key.automationId}:${item.key.project}:${item.key.variantId}`);
    const duplicateSelection = selectionKeys.length !== new Set(selectionKeys).size;
    const report = nextState === 'completed' && !duplicateSelection
      ? tryBuildReport({ executionId: finished.executionId, parentExecutionId: finished.parentExecutionId, runId: demoRunId, profileId: profile.profileId, profileRevision: profileRevision.current, catalogRevision: catalogRevision.current, createdAt: finished.createdAt, startedAt: finished.startedAt, finishedAt: finished.finishedAt ?? finished.startedAt, selection: finished.started, records: finished.records, logs: finished.logs, runnerErrors: finished.runnerErrors, attachments } satisfies ReportInput)
      : null;
    const withReport: DemoExecution = { ...finished, report, duplicateSelection };
    setActive(null);
    setHistory((previous) => [withReport, ...previous].slice(0, 12));
    await refreshArtifacts(withReport);
    setNotice(nextState !== 'completed' ? at('noValidReport') : duplicateSelection ? at('duplicateSelection') : at('resultsSaved'));
  }, [profile.profileId, refreshArtifacts]);

  // One simulated invocation per tick; the timer is re-armed by each state change and cleared on unmount.
  useEffect(() => {
    if (!active || active.state !== 'running') return;
    const pendingItem = plan.current[active.records.length];
    if (!pendingItem) return;
    const timer = window.setTimeout(() => {
      const record = buildRecord(pendingItem.key, pendingItem.title, pendingItem.file, pendingItem.expectedStatus, pendingItem.attempts);
      const records = [...active.records, record];
      if (records.length < plan.current.length) setActive({ ...active, records });
      else void finish({ ...active, records }, 'completed', null);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [active, finish]);

  const catalogValid = useMemo(() => AutomationCatalogSchema.safeParse({ schemaVersion: 2, autotests, bindings }).success, [autotests, bindings]);

  const invocations = useMemo(() => selectedBindings.map((bindingId) => {
    const binding = bindings.find((item) => item.id === bindingId);
    const autotest = binding ? autotests.find((item) => item.id === binding.autotestId) : undefined;
    if (!binding || !autotest) return { bindingId, title: '', issues: [{ code: 'UNAVAILABLE' as const, key: undefined }], snapshot: null, binding, autotest };
    const result = createInvocationSnapshot({
      invocationId: crypto.randomUUID(), createdAt: new Date().toISOString(), caseRevision: demoSha(`case:${binding.caseId}`),
      autotest, binding, runOverrides: runOverrides[binding.id] ?? {}, environments: environmentEntries,
    });
    return { bindingId, title: autotest.title, issues: result.ok ? [] : result.issues, snapshot: result.ok ? result.value : null, definition: autotest, binding, autotest };
  }), [selectedBindings, bindings, autotests, runOverrides, environmentEntries]);

  const stalePreview = preview !== null && invocations.some((item) => item.bindingId === preview.bindingId && item.snapshot !== null && !validateInvocationPreview(preview.snapshot, {
    invocationId: preview.snapshot.invocationId, createdAt: preview.snapshot.createdAt, caseRevision: preview.snapshot.caseRevision,
    autotest: item.autotest!, binding: item.binding!, runOverrides: runOverrides[preview.bindingId] ?? {}, environments: environmentEntries,
  }).ok);
  const readyCount = invocations.filter((item) => item.snapshot !== null).length;
  const canRun = !blocked && !active && trusted && state !== 'unsupportedVersion' && readyCount > 0 && readyCount === invocations.length && !stalePreview && catalogValid;

  // The results panel follows the latest execution of any terminal state; rerun needs a completed one.
  const latest = history[0] ?? null;
  const lastCompleted = history.find((item) => item.state === 'completed') ?? null;
  const summary = latest ? executionSummary(latest) : null;
  const selectedCount = selectedBindings.length;
  const duplicateSelection = invocations.length !== new Set(invocations.map((item) => item.snapshot ? `${item.snapshot.autotest.selector.automationId}:${item.binding?.caseId}:${item.snapshot.autotest.selector.project}:${item.snapshot.autotest.selector.variantId}` : item.bindingId)).size;

  function guard(): boolean {
    if (blocked || busy) { setNotice(at('blockedRunning')); return false; }
    return true;
  }
  function bindingDraftFor(bindingId: string): BindingDraft | null {
    const binding = bindings.find((item) => item.id === bindingId);
    const autotest = binding ? autotests.find((item) => item.id === binding.autotestId) : undefined;
    if (!binding || !autotest) return null;
    return { autotestId: autotest.id, enabled: binding.enabled, overrides: overridesDraft(autotest, binding.argumentOverrides) };
  }

  const api = {
    profile, profileRevision: profileRevision.current, catalogRevision: catalogRevision.current, trusted, failSave, busy, notice, error, catalogValid, blocked, state: demoState, setDemoState: chooseDemoState,
    autotests, bindings, discovery, environments: environmentEntries, cases,
    selectedBindings, invocations, readyCount, selectedCount, duplicateSelection, stalePreview, preview, canRun, active, history, latest, lastCompleted, summary, runOverrides,
    artifacts, reportText, importFormat, importText, importPreview, appliedHashes, resultsApplied,
    setProfile: <K extends keyof typeof demoProfile>(key: K, value: (typeof demoProfile)[K]) => { if (!guard()) return; setProfile((previous) => ({ ...previous, [key]: value })); setNotice(at('dirty')); },
    saveProfile: () => {
      if (!guard()) return;
      if (failSave) { setError(at('saveError')); return; }
      profileRevision.current = demoSha(`profile:${profile.profileId}:${profile.config}:${Date.now()}`);
      setTrusted(false); setNotice(`${at('saved')}. ${at('revoked')}`);
    },
    setTrust: (grant: boolean) => { if (!guard()) return; setTrusted(grant); setNotice(grant ? at('trustGranted') : at('trustMissing')); },
    discover: () => {
      if (!guard()) return;
      if (!trusted) { setError(at('blockedUntrusted')); return; }
      if (demoState === 'unsupportedVersion') { setError(at('blockedUnsupported')); return; }
      if (demoState === 'discoveryFailed') { setError(`${at('discoveryFailed')}: процесс discovery завершился с кодом 1`); setDiscovery(null); return; }
      const catalog = demoDiscovery(); catalogRevision.current = demoHash(catalog.catalogRevision);
      setDiscovery(catalog); setError(''); setNotice(`${at('discovered')}: ${catalog.tests.length}`);
    },
    saveAutotest: (id: string | null, draft: AutotestDraft): string | null => {
      if (!guard()) return null;
      const { definitions, invalid } = buildArgumentDefinitions(draft.rows);
      if (invalid || !draft.title.trim() || !draft.automationId.trim() || !draft.project.trim()) { setError(at('argumentsInvalid')); return null; }
      if (failSave) { setError(at('saveError')); return null; }
      const next: Autotest = {
        schemaVersion: 2, id: id ?? crypto.randomUUID(), title: draft.title.trim(), description: draft.description, archived: false,
        revision: `rev-${Date.now()}`, profileId: draft.profileId,
        selector: { automationId: draft.automationId.trim(), project: draft.project.trim(), variantId: draft.variantId.trim() || 'default' },
        argumentDefinitions: definitions, defaults: id ? autotests.find((item) => item.id === id)?.defaults ?? {} : {},
      };
      setAutotests((previous) => previous.some((item) => item.id === next.id) ? previous.map((item) => item.id === next.id ? next : item) : [...previous, next]);
      setError(''); setNotice(at('saved')); return next.id;
    },
    toggleArchive: (id: string) => {
      if (!guard()) return;
      setAutotests((previous) => previous.map((item) => item.id === id ? { ...item, archived: !item.archived, revision: `rev-${Date.now()}` } : item));
    },
    removeAutotest: (id: string) => { if (!guard()) return; setAutotests((previous) => previous.filter((item) => item.id !== id)); setBindings((previous) => previous.filter((item) => item.autotestId !== id)); },
    bindingDraftFor,
    saveBinding: (bindingId: string | null, caseId: string, draft: BindingDraft): boolean => {
      if (!guard()) return false;
      const autotest = autotests.find((item) => item.id === draft.autotestId);
      if (!autotest) { setError(at('bindingRequired')); return false; }
      const { overrides, invalid } = buildOverrides(autotest, draft.overrides);
      if (invalid) { setError(at('argumentsInvalid')); return false; }
      const key = JSON.stringify([caseId, autotest.id, Object.entries(overrides).sort(([a], [b]) => a.localeCompare(b))]);
      const duplicate = bindings.some((item) => item.id !== bindingId && JSON.stringify([item.caseId, item.autotestId, Object.entries(item.argumentOverrides).sort(([a], [b]) => a.localeCompare(b))]) === key);
      if (duplicate) { setError(at('duplicateBinding')); return false; }
      if (failSave) { setError(at('saveError')); return false; }
      const next: CaseAutotestBinding = { schemaVersion: 2, id: bindingId ?? crypto.randomUUID(), caseId, autotestId: autotest.id, revision: `rev-${Date.now()}`, enabled: draft.enabled, argumentOverrides: overrides };
      setBindings((previous) => previous.some((item) => item.id === next.id) ? previous.map((item) => item.id === next.id ? next : item) : [...previous, next]);
      setError(''); setNotice(at('saved')); return true;
    },
    removeBinding: (id: string) => {
      if (!guard()) return;
      setBindings((previous) => previous.filter((item) => item.id !== id));
      setSelectedBindings((previous) => previous.filter((item) => item !== id));
    },
    toggleEnabled: (id: string) => { if (!guard()) return; setBindings((previous) => previous.map((item) => item.id === id ? { ...item, enabled: !item.enabled } : item)); },
    toggleSelection: (id: string, selected: boolean) => {
      if (!guard()) return;
      setSelectedBindings((previous) => selected ? [...new Set([...previous, id])] : previous.filter((item) => item !== id));
    },
    clearSelection: () => { setSelectedBindings([]); setRunOverrides({}); setPreview(null); },
    selectAllReady: () => { setSelectedBindings(bindings.filter((item) => item.enabled && !autotests.find((test) => test.id === item.autotestId)?.archived).map((item) => item.id)); setRunOverrides({}); setPreview(null); },
    setRunOverride: (bindingId: string, definition: ArgumentDefinition, value: ArgumentValue | null) => {
      if (!guard()) return;
      setRunOverrides((previous) => {
        const current = { ...(previous[bindingId] ?? {}) };
        if (value === null) delete current[definition.key]; else current[definition.key] = value;
        return { ...previous, [bindingId]: current };
      });
    },
    previewSnapshot: (bindingId: string) => {
      const item = invocations.find((entry) => entry.bindingId === bindingId);
      if (!item?.snapshot) { setError(at('issues')); return; }
      setPreview({ bindingId, snapshot: item.snapshot }); setNotice(at('previewValid'));
    },
    clearPreview: () => setPreview(null),
    start: () => {
      if (!guard()) return;
      if (!trusted) { setError(at('blockedUntrusted')); return; }
      if (demoState === 'unsupportedVersion') { setError(at('blockedUnsupported')); return; }
      if (!canRun) { setError(stalePreview ? at('previewStale') : at('noSelection')); return; }
      const parentExecutionId = pendingParent;
      const creations = invocations.map((item) => {
        const binding = item.binding!; const autotest = item.autotest!; const snapshot = item.snapshot!;
        const planSteps = demoScript[`${autotest.selector.automationId}:${autotest.selector.variantId}`] ?? ['passed'];
        // В демо повтор упавших завершается успешно: исправление между запусками имитируется.
        const steps: AttemptPlan[] = parentExecutionId ? planSteps.map((step) => (step === 'failed' || step === 'timedOut' ? 'passed' : step)) : planSteps;
        const key: StableKey = { caseId: binding.caseId, automationId: autotest.selector.automationId, project: autotest.selector.project, variantId: autotest.selector.variantId };
        const attachmentIds = [crypto.randomUUID(), crypto.randomUUID()];
        return {
          key, title: autotest.title, file: `tests/${autotest.selector.automationId}.spec.ts`,
          expectedStatus: (demoDiscovery().tests.find((test) => test.key.automationId === autotest.selector.automationId)?.expectedStatus ?? 'passed') as 'passed' | 'failed' | 'skipped',
          attempts: buildAttempts(steps, profile.retries, new Date().toISOString(), attachmentIds),
          attachmentIds, snapshot,
        };
      });
      plan.current = creations;
      const started: DemoExecution = {
        executionId: crypto.randomUUID(), parentExecutionId, profileId: profile.profileId, state: 'running', reason: null,
        createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), finishedAt: null,
        started: creations.map((item) => item.key), snapshots: creations.map((item) => item.snapshot),
        records: [], logs: { stdout: '', stderr: '', truncated: false }, runnerErrors: [], attachmentCount: 0, report: null,
      };
      setError(''); setNotice(''); setPendingParent(null);
      if (demoState === 'runnerError') { void finish({ ...started, runnerErrors: [{ message: 'Process exited with code 1 before a final report', stack: null }] }, 'runner_error', 'runner_error'); return; }
      if (creations.length === 1 && creations[0].attempts[0]?.status === 'passed') { void finish(started, 'completed', null); return; }
      setActive(started);
    },
    stop: () => {
      if (!active) return;
      const remaining = plan.current.slice(active.records.length);
      const records = [...active.records, ...remaining.map((item) => interruptedRecord(item.key, item.title, item.file))];
      void finish({ ...active, records }, 'interrupted', 'execution отменён пользователем');
    },
    rerunFailed: () => {
      if (!lastCompleted) return;
      const failedBindings = lastCompleted.records.filter((record) => record.outcome === 'unexpected' || record.attempts.some((attempt) => attempt.status === 'timedOut'));
      const ids = failedBindings.map((record) => lastCompleted.snapshots.find((snapshot) => snapshot.binding.caseId === record.caseId && snapshot.autotest.selector.automationId === record.automationId)?.binding.id).filter(Boolean) as string[];
      setSelectedBindings(ids); setRunOverrides({}); setPreview(null); setPendingParent(lastCompleted.executionId);
      setNotice(`${at('rerunFailed')}: ${ids.length}`);
    },
    saveResults: () => {
      if (!latest) { setError(at('nothingToSave')); return; }
      setResultsApplied(latest.executionId);
      setNotice(at('resultsSaved'));
    },
    saveReports: () => {
      if (!latest) { setError(at('nothingToSave')); return; }
      onFiles(artifacts.map((artifact) => ({ path: artifact.relativePath, kind: 'untracked' as const, before: [], after: [`# ${artifact.name}`, `sha256: ${artifact.sha256 ?? 'unavailable'}`] })));
      setArtifacts((previous) => previous.map((artifact) => ({ ...artifact, saved: true })));
      setNotice(at('reportsSaved'));
    },
    setImportFormat: (format: ImportFormat) => { setImportFormat(format); setImportPreview(null); },
    setImportText: (text: string) => { setImportText(text); setImportPreview(null); },
    loadSample: () => {
      const tests = discovery?.tests ?? demoDiscovery().tests;
      setImportPreview(null);
      if (importFormat === 'junit') { setImportText(sampleJunitReport(tests)); return; }
      if (importFormat === 'playwright') { setImportText(samplePlaywrightReport(tests)); return; }
      setImportText(reportText ?? JSON.stringify({ note: 'сначала выполните запуск, чтобы получить настоящий report.json' }, null, 2));
    },
    parseImportText: async (): Promise<boolean> => {
      if (!importText.trim()) { setError(at('importInvalid')); return false; }
      setBusy(true);
      try {
        const parsed = parseImport(importText, importFormat);
        const sourceHash = await sha256Hex(importText);
        if (!sourceHash) { setError(at('importInvalid')); return false; }
        const catalogKeys = bindings.map((binding) => {
          const autotest = autotests.find((item) => item.id === binding.autotestId)!;
          return { caseId: binding.caseId, automationId: autotest.selector.automationId, project: autotest.selector.project, variantId: autotest.selector.variantId };
        });
        const previewResult = previewImport(parsed, { targetRunId: demoRunId, targetRevision: demoSha('run:release-2.8'), sourceHash, bindings: catalogKeys, importedHashes: appliedHashes, existingExecutions: Object.fromEntries(history.filter((item) => item.importSourceHash).map((item) => [item.executionId, item.importSourceHash!])) });
        setImportPreview({ format: importFormat, foreignRun: previewResult.foreignRun, metadataMissing: previewResult.metadataMissing, duplicateImport: previewResult.duplicateImport, executionConflict: previewResult.executionConflict, sourceHash, parsed, rows: previewResult.rows.map((row) => ({ index: row.index, status: row.status, outcome: row.outcome, title: row.test.title, file: row.test.file, identity: row.identity })) });
        setError(''); return true;
      } catch (cause) { setImportPreview(null); setError(`${at('importInvalid')}: ${cause instanceof Error ? cause.message : 'unknown'}`); return false; }
      finally { setBusy(false); }
    },
    applyImport: () => {
      if (!importPreview || importPreview.duplicateImport) { setError(at('duplicateImport')); return; }
      const parsedTests = (importPreview.parsed as { tests: { identity: StableKey | null; title: string; file: string; expectedStatus: 'passed' | 'failed' | 'skipped'; attempts: Attempt[] }[] }).tests;
      const records: TestRecord[] = [];
      const snapshots: InvocationSnapshot[] = [];
      for (const row of importPreview.rows) {
        if (row.status !== 'matched' || !row.identity) continue;
        const source = parsedTests[row.index];
        records.push(buildRecord(row.identity, source.title, source.file, source.expectedStatus, source.attempts));
        const binding = bindings.find((item) => item.caseId === row.identity!.caseId && autotests.find((test) => test.id === item.autotestId)?.selector.automationId === row.identity!.automationId);
        const autotest = binding ? autotests.find((item) => item.id === binding.autotestId) : undefined;
        if (binding && autotest) {
          const built = createInvocationSnapshot({ invocationId: crypto.randomUUID(), createdAt: new Date().toISOString(), caseRevision: demoSha(`case:${binding.caseId}`), autotest, binding, runOverrides: {}, environments: environmentEntries });
          if (built.ok) snapshots.push(built.value);
        }
      }
      const imported: DemoExecution = {
        executionId: crypto.randomUUID(), parentExecutionId: null, profileId: profile.profileId, state: 'completed', reason: `импорт ${importPreview.format}`,
        createdAt: new Date().toISOString(), startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
        started: records.map((record) => ({ caseId: record.caseId, automationId: record.automationId, project: record.project, variantId: record.variantId })),
        snapshots, records, logs: { stdout: '', stderr: '', truncated: false }, runnerErrors: [], attachmentCount: 0, report: null,
        importSourceHash: importPreview.sourceHash, importFormat: importPreview.format,
      };
      setHistory((previous) => [imported, ...previous].slice(0, 12));
      setAppliedHashes((previous) => [...previous, importPreview.sourceHash]);
      onFiles([{ path: `.testoritto/automation/${imported.executionId}/import-${importPreview.format}.json`, kind: 'untracked', before: [], after: [`# импортированный отчёт ${importPreview.format}`, `source sha256: ${importPreview.sourceHash}`] }]);
      setImportPreview(null); setImportText(''); setNotice(at('applied'));
    },
    dismissNotice: () => { setNotice(''); setError(''); },
    sourceLabel: demoSource.branch,
  };
  return api;
}
export function usePreviewAutomation(args: UsePreviewAutomationArgs): UsePreviewAutomationResult { return useAutomationState(args); }
