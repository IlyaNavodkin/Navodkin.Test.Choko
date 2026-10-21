import { isNwjs, pickFile } from '@/lib/nwjs';
import type { AutomationArgDefinition, DiscoveredTest, ExecutionState, ResolvedAutomationArg } from '@/schemas/automation';
import type { AutomationBinding, AutomationProfile, CatalogEntry } from '@/schemas/automation-store';
import { bindingKey } from '@/schemas/automation-store';
import { loadBindings, loadCatalog, loadProfiles, saveBindings, saveCatalog, saveProfiles } from '@/services/automation/catalog';
import { discoverTests } from '@/services/automation/discovery';
import { AutomationRuntimeError, resolveNodeRuntime, resolveProjectPlaywright } from '@/services/automation/runtime';
import { resolveArguments } from '@/services/automation/arguments';
import { planSelection, selectionArgs } from '@/services/automation/selection';
import { planRunAutomation, type RunAutomationCandidate } from '@/services/automation/run-plan';
import { startExecution, newExecutionId, type ExecutionHandle } from '@/services/automation/execute';
import { saveExecutionToRun, mapReportToRun, planApplyToSummary, applyableChanges, loadRunAutomation as loadRunResults, loadRunAutomationExecutions, serializeAutomationResults, summarizeExecutions, saveImportToRun } from '@/services/automation/run-results';
import { parsePlaywrightReport } from '@/services/automation/report';
import { importedResults, previewImport } from '@/services/automation/import';
import { executionRel } from '@/services/automation/storage';
import { ProgressTracker } from '@/services/automation/progress';
import { validateArgDefinitions } from '@/schemas/automation-store';
import { node } from '@/lib/node';
import { loadGlossary } from '@/services/reference-book';
import type { RunAutomationView } from '@/types';
import { randomUuid } from '@/utils/ids';
import { assignAutomationCase as assignCaseBindings, automationEntryKey, latestAutomationResults, planReferenceArguments } from '@/utils/automation-workflow';
import type { AppState, StoreGet, StoreSet } from '../app-store';

// ---------------------------------------------------------------------------
// Automation section state: the catalog, bindings, the trusted profile, and discovery.
//
// Nothing here runs on open. Discovery (which executes the project's Playwright config) happens only
// when the user asks for it, and it requires an explicit trust acknowledgement first. Loading the
// three JSON stores is read-only and tolerates anything on disk.
// ---------------------------------------------------------------------------

type AutomationSlice = Pick<
  AppState,
  | 'automationCatalog'
  | 'automationBindings'
  | 'automationProfiles'
  | 'automationIssues'
  | 'automationQuery'
  | 'automationFilter'
  | 'automationProjectFilter'
  | 'automationSelId'
  | 'automationBusy'
  | 'automationDiscoverError'
  | 'automationTrusted'
  | 'runAutomation'
  | 'openAutomationSection'
  | 'loadAutomation'
  | 'setAutomationQuery'
  | 'setAutomationFilter'
  | 'setAutomationProjectFilter'
  | 'selectAutomationEntry'
  | 'setAutomationArchived'
  | 'setAutomationArgs'
  | 'setAutomationTrusted'
  | 'discoverAutomation'
  | 'addAutomationBinding'
  | 'assignAutomationCase'
  | 'setAutomationArgumentSet'
  | 'removeAutomationBinding'
  | 'setAutomationBindingEnabled'
  | 'saveAutomationProfile'
  | 'loadRunAutomation'
  | 'previewRunAutomation'
  | 'startRunAutomation'
  | 'rerunFailedAutomation'
  | 'stopRunAutomation'
  | 'saveAutomationExecution'
  | 'applyAutomationExecution'
  | 'importAutomationReport'
  | 'applyAutomationImport'
>;

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Declared arguments keyed by automationId (carried across a catalog refresh). */
const argsByAutomation = (entries: readonly CatalogEntry[]): Record<string, AutomationArgDefinition[]> =>
  Object.fromEntries(entries.filter((e) => e.arguments.length > 0).map((e) => [e.automationId, e.arguments]));

/** Archived ids (carried across a catalog refresh). */
const archivedIds = (entries: readonly CatalogEntry[]): Set<string> =>
  new Set(entries.filter((e) => e.archived).map((e) => e.automationId));

export function createAutomationSlice(set: StoreSet, get: StoreGet): AutomationSlice {
  /** Load the three stores for the open repository (read-only). */
  const load = async (): Promise<void> => {
    const repoPath = get().repoPath;
    if (!repoPath) {
      set({ automationCatalog: [], automationBindings: [], automationProfiles: [], automationIssues: [] });
      return;
    }
    const [catalog, bindings, profiles] = await Promise.all([loadCatalog(repoPath), loadBindings(repoPath), loadProfiles(repoPath)]);
    set((s) => ({
      automationCatalog: catalog.file.entries,
      automationBindings: bindings.file.bindings,
      automationProfiles: profiles.file.profiles,
      automationIssues: [...catalog.issues, ...bindings.issues, ...profiles.issues],
      automationSelId: catalog.file.entries.some((e) => automationEntryKey(e) === s.automationSelId || e.automationId === s.automationSelId) ? s.automationSelId : null,
    }));
  };

  return {
    automationCatalog: [],
    automationBindings: [],
    automationProfiles: [],
    automationIssues: [],
    automationQuery: '',
    automationFilter: 'all',
    automationProjectFilter: '',
    automationSelId: null,
    automationBusy: false,
    automationDiscoverError: null,
    automationTrusted: false,
    runAutomation: {},

    openAutomationSection: () => {
      set({ view: 'automation' });
      void get().loadAutomation();
    },

    loadAutomation: async () => {
      try {
        await load();
      } catch (e) {
        set({ automationIssues: [{ code: 'automation-read', message: errText(e) }] });
      }
    },

    setAutomationQuery: (q) => set({ automationQuery: q }),
    setAutomationFilter: (f) => set({ automationFilter: f }),
    setAutomationProjectFilter: (p) => set({ automationProjectFilter: p }),
    selectAutomationEntry: (id) => set({ automationSelId: id }),

    /** Archive/restore one catalog entry (never deletes history or bindings). */
    setAutomationArchived: async (automationId, archived) => {
      const repoPath = get().repoPath;
      const next = get().automationCatalog.map((e) => (e.automationId === automationId ? { ...e, archived } : e));
      set({ automationCatalog: next });
      if (!repoPath) return;
      try {
        const saved = await saveCatalog(repoPath, next.map(catalogEntryToDiscovered), {
          playwrightVersion: get().automationCatalog[0]?.revision ? '' : '',
          extraArguments: argsByAutomation(next),
          archived: archivedIds(next),
        });
        set({ automationCatalog: saved.file.entries });
      } catch (e) {
        set({ automationIssues: [{ code: 'automation-write', message: errText(e) }] });
        await load();
      }
    },

    /** Replace the declared arguments of one entry. */
    setAutomationArgs: async (automationId, args) => {
      const repoPath = get().repoPath;
      if (!repoPath) return;
      const next = get().automationCatalog.map((e) => (e.automationId === automationId ? { ...e, arguments: args } : e));
      set({ automationCatalog: next });
      try {
        const saved = await saveCatalog(repoPath, next.map(catalogEntryToDiscovered), {
          playwrightVersion: '',
          extraArguments: argsByAutomation(next),
          archived: archivedIds(next),
        });
        set({ automationCatalog: saved.file.entries });
      } catch (e) {
        set({ automationIssues: [{ code: 'automation-write', message: errText(e) }] });
        await load();
      }
    },

    setAutomationTrusted: (trusted) => set({ automationTrusted: trusted }),

    /**
     * Run discovery (the only path that executes the project's config). Requires the explicit trust
     * flag; resolves the external Node and the repository's Playwright first.
     */
    discoverAutomation: async () => {
      const repoPath = get().repoPath;
      if (!repoPath || !isNwjs()) {
        set({ automationDiscoverError: 'Discovery needs the desktop app and an open repository.' });
        return;
      }
      if (!get().automationTrusted) {
        set({ automationDiscoverError: 'Confirm that you trust this project first — discovery runs its Playwright config.' });
        return;
      }
      set({ automationBusy: true, automationDiscoverError: null });
      try {
        const [nodeRt, playwright] = await Promise.all([resolveNodeRuntime(), resolveProjectPlaywright(repoPath)]);
        const result = await discoverTests({ repoPath, node: nodeRt, playwright });
        if (!result.ok) {
          set({ automationDiscoverError: result.problems.map((p) => p.message).join('\n') });
          return;
        }
        const saved = await saveCatalog(repoPath, result.tests, {
          playwrightVersion: playwright.version,
          extraArguments: argsByAutomation(get().automationCatalog),
          archived: archivedIds(get().automationCatalog),
        });
        set({
          automationCatalog: saved.file.entries,
          automationIssues: saved.issues,
          automationDiscoverError: result.problems.length ? result.problems.map((p) => p.message).join('\n') : null,
        });
      } catch (e) {
        const message = e instanceof AutomationRuntimeError ? e.message : errText(e);
        set({ automationDiscoverError: message });
      } finally {
        set({ automationBusy: false });
      }
    },

    addAutomationBinding: async (entry, caseId) => {
      const repoPath = get().repoPath;
      if (!repoPath) return;
      const binding: AutomationBinding = {
        id: randomUuid(),
        caseId,
        automationId: entry.automationId,
        project: entry.project,
        variantId: entry.variantId ?? 'default',
        enabled: true,
        arguments: {},
        archived: false,
      };
      const next = [...get().automationBindings.filter((b) => bindingKey(b) !== bindingKey(binding)), binding];
      try {
        const saved = await saveBindings(repoPath, next);
        set({ automationBindings: saved.file.bindings });
      } catch (e) {
        set({ automationIssues: [{ code: 'automation-write', message: errText(e) }] });
      }
    },

    assignAutomationCase: async (entry, caseId) => {
      if (caseId && !get().cases.some((c) => c.id === caseId)) return;
      try {
        const id = get().repoPath ? randomUuid() : globalThis.crypto.randomUUID();
        const next = assignCaseBindings(get().automationBindings, entry, caseId, id);
        const saved = get().repoPath ? (await saveBindings(get().repoPath, next)).file.bindings : next;
        set({ automationBindings: saved, automationIssues: [] });
      } catch (e) {
        set({ automationIssues: [{ code: 'automation-write', message: errText(e) }] });
      }
    },

    setAutomationArgumentSet: async (entry, referenceId) => {
      const target = (b: AutomationBinding) => automationEntryKey(b) === automationEntryKey(entry);
      if (!get().automationBindings.some(target)) return;
      const doc = referenceId ? get().refs.find((d) => d.id === referenceId) : null;
      if (referenceId && !doc) return;
      const plan = doc ? planReferenceArguments(entry, doc) : { definitions: entry.arguments, values: {}, problems: [] };
      if (plan.problems.length) {
        set({ automationIssues: plan.problems.map((message) => ({ code: 'automation-arguments', message })) });
        return;
      }
      const bindings = get().automationBindings.map((b) => target(b) ? { ...b, arguments: plan.values } : b);
      const catalog = get().automationCatalog.map((e) => e.automationId === entry.automationId ? { ...e, arguments: plan.definitions } : e);
      try {
        if (get().repoPath) {
          await saveCatalog(get().repoPath, catalog.map(catalogEntryToDiscovered), {
            playwrightVersion: '', extraArguments: argsByAutomation(catalog), archived: archivedIds(catalog),
          });
          await saveBindings(get().repoPath, bindings);
        }
        set({ automationCatalog: catalog, automationBindings: bindings, automationIssues: [] });
      } catch (e) {
        set({ automationIssues: [{ code: 'automation-write', message: errText(e) }] });
      }
    },

    removeAutomationBinding: async (bindingId) => {
      const repoPath = get().repoPath;
      if (!repoPath) return;
      const next = get().automationBindings.filter((b) => b.id !== bindingId);
      try {
        const saved = await saveBindings(repoPath, next);
        set({ automationBindings: saved.file.bindings });
      } catch (e) {
        set({ automationIssues: [{ code: 'automation-write', message: errText(e) }] });
      }
    },

    setAutomationBindingEnabled: async (bindingId, enabled) => {
      const repoPath = get().repoPath;
      if (!repoPath) return;
      const next = get().automationBindings.map((b) => (b.id === bindingId ? { ...b, enabled } : b));
      try {
        const saved = await saveBindings(repoPath, next);
        set({ automationBindings: saved.file.bindings });
      } catch (e) {
        set({ automationIssues: [{ code: 'automation-write', message: errText(e) }] });
      }
    },

    saveAutomationProfile: async (profile) => {
      const repoPath = get().repoPath;
      if (!repoPath) return;
      const next = [...get().automationProfiles.filter((p) => p.id !== profile.id), profile];
      try {
        const saved = await saveProfiles(repoPath, next);
        set({ automationProfiles: saved.file.profiles });
      } catch (e) {
        set({ automationIssues: [{ code: 'automation-write', message: errText(e) }] });
      }
    },

    /* ---- results inside a run ---- */

    loadRunAutomation: async (runId) => {
      const repoPath = get().repoPath;
      const run = get().runs.find((r) => r.id === runId);
      if (!repoPath || !run) return;
      try {
        const [loaded, saved] = await Promise.all([
          loadRunResults(repoPath, run),
          loadRunAutomationExecutions(repoPath, run),
        ]);
        set((s) => {
          const live = s.runAutomation[runId]?.executions ?? [];
          const known = new Set(live.map((e) => e.executionId));
          // Saved executions stay visible after a restart; live ones are kept so "Save to run"
          // still works for a run that just finished.
          const restored = saved.executions
            .filter((e) => !known.has(e.executionId))
            .map((e) => ({
              executionId: e.executionId,
              project: e.project,
              state: e.state,
              completed: e.results.length,
              total: e.results.length,
              currentLine: null,
              logTail: '',
              error: e.error ?? null,
              startedAt: e.createdAt,
              arguments: e.arguments,
            }));
          return {
            runAutomation: {
              ...s.runAutomation,
              [runId]: {
                ...s.runAutomation[runId],
                executions: [...live, ...restored],
                results: [...loaded.results, ...(s.runAutomation[runId]?.results ?? []).filter((r) => !loaded.results.some((saved) => saved.executionId === r.executionId && saved.automationId === r.automationId && saved.project === r.project))],
                issues: loaded.issues,
                busy: s.runAutomation[runId]?.busy ?? false,
              },
            },
          };
        });
      } catch (e) {
        set((s) => ({
          runAutomation: { ...s.runAutomation, [runId]: { ...(s.runAutomation[runId] ?? { executions: [], results: [], busy: false }), issues: [errText(e)] } },
        }));
      }
    },

    previewRunAutomation: async (runId) => {
      const repoPath = get().repoPath;
      const run = get().runs.find((r) => r.id === runId);
      if (!repoPath || !run) return;
      const runCaseIds = new Set(run.rows.map((r) => r.case_id));
      const preview: ResolvedAutomationArg[] = [];
      const problems: string[] = [];
      for (const binding of get().automationBindings) {
        if (!binding.enabled || binding.archived || !runCaseIds.has(binding.caseId)) continue;
        const entry = get().automationCatalog.find((e) => automationEntryKey(e) === automationEntryKey(binding));
        if (!entry) {
          problems.push(`"${binding.automationId}" (${binding.caseId}) is no longer in the catalog.`);
          continue;
        }
        const resolved = await resolveArguments({ repoPath, definitions: entry.arguments, binding: binding.arguments });
        if (!resolved.ok) problems.push(...resolved.problems.map((p) => `${binding.automationId}: ${p}`));
        else preview.push(...resolved.values.map((v) => ({ ...v, key: `${binding.automationId}.${v.key}` })));
      }
      set((s) => ({
        runAutomation: {
          ...s.runAutomation,
          [runId]: { ...(s.runAutomation[runId] ?? { executions: [], results: [], issues: [], busy: false }), preview, previewProblems: problems },
        },
      }));
    },

    startRunAutomation: async (runId, opts) => {
      const repoPath = get().repoPath;
      const run = get().runs.find((r) => r.id === runId);
      if (!repoPath || !run) return;
      if (get().runAutomation[runId]?.busy) return;
      if (!get().automationTrusted) {
        set((s) => ({ runAutomation: { ...s.runAutomation, [runId]: { executions: [], results: s.runAutomation[runId]?.results ?? [], busy: false, issues: ['Confirm that you trust this project before running its tests.'] } } }));
        return;
      }
      const only = opts?.onlyAutomationIds ? new Set(opts.onlyAutomationIds) : null;
      const activeBindingIds = get().automationBindings.filter((b) => b.enabled && !b.archived && run.rows.some((r) => r.case_id === b.caseId) && (!only || only.has(b.automationId)) && (!opts?.onlyBindingIds || opts.onlyBindingIds.includes(b.id))).map((b) => b.id);
      const view: RunAutomationView = { executions: get().runAutomation[runId]?.executions ?? [], results: get().runAutomation[runId]?.results ?? [], issues: [], busy: true, activeBindingIds };
      set((s) => ({ runAutomation: { ...s.runAutomation, [runId]: view } }));

      try {
        const [nodeRt, playwright] = await Promise.all([resolveNodeRuntime(), resolveProjectPlaywright(repoPath)]);
        const runCaseIds = run.rows.map((r) => r.case_id);
        const candidates: RunAutomationCandidate[] = [];
        const problems: string[] = [];
        for (const binding of get().automationBindings) {
          if (!binding.enabled || binding.archived) continue;
          if (!runCaseIds.includes(binding.caseId)) continue;
          if (only && !only.has(binding.automationId)) continue;
          if (opts?.onlyBindingIds && !opts.onlyBindingIds.includes(binding.id)) continue;
          const entry = get().automationCatalog.find((e) => automationEntryKey(e) === automationEntryKey(binding));
          if (!entry) {
            problems.push(`"${binding.automationId}" is bound to ${binding.caseId} but is no longer in the catalog.`);
            continue;
          }
          const resolved = await resolveArguments({
            repoPath,
            definitions: entry.arguments,
            binding: binding.arguments,
          });
          if (!resolved.ok) {
            problems.push(...resolved.problems);
            continue;
          }
          candidates.push({
            binding,
            entry,
            args: resolved.values,
            selection: {
              automationId: entry.automationId,
              caseId: binding.caseId,
              variantId: entry.variantId,
              title: entry.title,
              titlePath: entry.titlePath,
              project: entry.project,
              file: entry.file,
              line: entry.line,
              tags: entry.tags,
            },
          });
        }
        const plan = planRunAutomation(candidates, runCaseIds);
        if (!plan.ok) problems.push(...plan.problems);
        if (plan.groups.length === 0) {
          set((s) => ({ runAutomation: { ...s.runAutomation, [runId]: { ...view, busy: false, issues: problems.length ? problems : ['No enabled autotests are bound to this run.'] } } }));
          return;
        }
        const handles: ExecutionHandle[] = [];
        for (const group of plan.groups) {
          const targets = group.candidates.map((c) => {
            const discovered = catalogEntryToDiscovered(c.entry);
            return { test: { ...discovered, project: c.selection.project }, project: c.selection.project, variantId: c.selection.variantId ?? 'default' };
          });
          const selection = planSelection(
            targets,
            { version: playwright.version },
            get().automationCatalog.map(catalogEntryToDiscovered),
          );
          if (!selection.ok) {
            problems.push(...selection.problems);
            continue;
          }
          const executionId = newExecutionId();
          let args = selection.args;
          if (selection.testList) {
            const dir = node.path().join(repoPath, executionRel(executionId));
            await node.fsp().mkdir(dir, { recursive: true });
            const listPath = node.path().join(dir, 'test-list.txt');
            await node.fsp().writeFile(listPath, selection.testList.content);
            args = selectionArgs(selection, listPath);
          }
          const tests = group.candidates.map((c) => ({
            caseId: c.selection.caseId,
            automationId: c.selection.automationId,
            project: c.selection.project,
            variantId: c.selection.variantId ?? 'default',
            title: c.selection.title,
            file: c.selection.file,
            line: c.selection.line,
          }));
          const env: Record<string, string> = {};
          for (const c of group.candidates) for (const [k, v] of Object.entries((await resolveArguments({ repoPath, definitions: c.entry.arguments, binding: c.binding.arguments })).env)) env[k] = v;

          const handle = startExecution(
            {
              repoPath,
              runId,
              project: group.project,
              args,
              env,
              selectionKeys: group.candidates.map((c) => `${c.selection.caseId ?? ''}::${c.selection.automationId}::${c.selection.project}::${c.selection.variantId ?? 'default'}`),
              tests,
              argsSnapshot: group.args,
              node: nodeRt,
              playwright,
              executionId,
              ...(opts?.parentExecutionId ? { parentExecutionId: opts.parentExecutionId } : {}),
            },
            {
              onEvent: (e) => {
                if (e.type === 'state') {
                  set((s) => patchRunExecution(s, runId, executionId, { state: e.state, error: e.detail ?? null }));
                } else if (e.type === 'output') {
                  const tracker = trackers.get(executionId) ?? new ProgressTracker();
                  trackers.set(executionId, tracker);
                  tracker.push(e.chunk);
                  const snap = tracker.snapshot();
                  set((s) =>
                    patchRunExecution(s, runId, executionId, {
                      logTail: tracker.logTail.text.slice(-4000),
                      completed: snap.completed,
                      total: snap.total,
                      currentLine: snap.currentLine,
                    }),
                  );
                }
              },
            },
          );
          handles.push(handle);
          set((s) =>
            patchRunExecution(s, runId, executionId, { state: 'starting', project: group.project, startedAt: handle.manifest.createdAt, arguments: group.args }),
          );
        }
        liveHandles.set(runId, handles);
        set((s) => ({ runAutomation: { ...s.runAutomation, [runId]: { ...s.runAutomation[runId], busy: true, issues: problems } } }));

        const completed = await Promise.all(handles.map((h) => h.done));
        for (const manifest of completed) {
          try {
            const raw = await node.fsp().readFile(node.path().join(repoPath, executionRel(manifest.executionId), 'report.json'), 'utf8');
            const report = parsePlaywrightReport(raw);
            if (report.ok) set((s) => ({ runAutomation: { ...s.runAutomation, [runId]: { ...s.runAutomation[runId], results: [...s.runAutomation[runId].results, ...mapReportToRun(run, manifest, report.report)] } } }));
          } catch {
            // Runner errors/cancellation can finish without a report; the execution shows why.
          }
        }
        liveHandles.delete(runId);
        await get().loadRunAutomation(runId);
        set((s) => ({ runAutomation: { ...s.runAutomation, [runId]: { ...s.runAutomation[runId], busy: false } } }));
        const view = get().runAutomation[runId];
        const summary = summarizeExecutions(view?.executions ?? []);
        get().toast?.(summary);
      } catch (e) {
        const message = e instanceof AutomationRuntimeError ? e.message : errText(e);
        set((s) => ({ runAutomation: { ...s.runAutomation, [runId]: { ...(s.runAutomation[runId] ?? view), busy: false, issues: [message] } } }));
      }
    },

    rerunFailedAutomation: async (runId) => {
      const results = get().runAutomation[runId]?.results ?? [];
      const failed = latestAutomationResults(results).filter((r) => r.status === 'failed' || r.status === 'timedOut');
      if (failed.length === 0) {
        get().toast?.('There are no failed automated results to rerun.');
        return;
      }
      const parentExecutionId = failed[0].executionId;
      const onlyAutomationIds = [...new Set(failed.map((r) => r.automationId))];
      const onlyBindingIds = get().automationBindings.filter((b) => failed.some((r) => r.automationId === b.automationId && (!r.project || r.project === b.project))).map((b) => b.id);
      get().toast?.(`Rerunning ${onlyAutomationIds.length} failed autotest${onlyAutomationIds.length === 1 ? '' : 's'}…`);
      await get().startRunAutomation(runId, { onlyAutomationIds, onlyBindingIds, parentExecutionId });
    },

    importAutomationReport: async (runId) => {
      const repoPath = get().repoPath;
      const run = get().runs.find((r) => r.id === runId);
      if (!repoPath || !run) return;
      if (!isNwjs()) {
        get().toast?.('Report import needs the desktop app');
        return;
      }
      const abs = await pickFile('*.json,*.xml');
      if (!abs) return;
      let payload: string;
      try {
        payload = await node.fsp().readFile(abs, 'utf8');
      } catch (e) {
        get().toast?.(`Could not read the report: ${errText(e)}`);
        return;
      }
      const format = /\.xml$/i.test(abs) ? 'junit' : 'playwright-json';
      const preview = previewImport(payload, format, run, get().automationBindings);
      set((s) => ({
        runAutomation: {
          ...s.runAutomation,
          [runId]: { ...(s.runAutomation[runId] ?? { executions: [], results: [], issues: [], busy: false }), importPreview: preview, issues: preview.problems },
        },
      }));
    },

    applyAutomationImport: async (runId) => {
      const repoPath = get().repoPath;
      const run = get().runs.find((r) => r.id === runId);
      const preview = get().runAutomation[runId]?.importPreview;
      if (!repoPath || !run || !preview) return;
      if (!preview.ok) {
        get().toast?.(preview.problems[0] ?? 'This report cannot be imported.');
        return;
      }
      try {
        const results = importedResults(preview, run, `import:${preview.importId}`);
        await saveImportToRun(repoPath, run, preview.importId, preview.format, results);
        get().toast?.(`Imported ${preview.matched.length} result${preview.matched.length === 1 ? '' : 's'}${preview.unmatched.length ? `, ${preview.unmatched.length} unmatched` : ''}`);
        set((s) => ({
          runAutomation: { ...s.runAutomation, [runId]: { ...s.runAutomation[runId], importPreview: undefined, issues: [] } },
        }));
        await get().loadRunAutomation(runId);
      } catch (e) {
        set((s) => ({ runAutomation: { ...s.runAutomation, [runId]: { ...s.runAutomation[runId], issues: [errText(e)] } } }));
      }
    },

    stopRunAutomation: (runId) => {
      for (const h of liveHandles.get(runId) ?? []) h.stop();
    },

    saveAutomationExecution: async (runId, executionId) => {
      const repoPath = get().repoPath;
      const run = get().runs.find((r) => r.id === runId);
      if (!repoPath || !run) return;
      try {
        await saveExecutionToRun(repoPath, run.file, executionId);
        get().toast?.('Automation results saved to the run');
        await get().loadRunAutomation(runId);
      } catch (e) {
        set((s) => ({ runAutomation: { ...s.runAutomation, [runId]: { ...s.runAutomation[runId], issues: [errText(e)] } } }));
      }
    },

    applyAutomationExecution: async (runId, executionId) => {
      const run = get().runs.find((r) => r.id === runId);
      if (!run) return;
      const results = (get().runAutomation[runId]?.results ?? []).filter((r) => r.executionId === executionId);
      const plan = planApplyToSummary(run, results);
      if (!plan.ok) {
        set((s) => ({ runAutomation: { ...s.runAutomation, [runId]: { ...s.runAutomation[runId], issues: plan.problems } } }));
        return;
      }
      // Manual results are authoritative: only rows that were never recorded can take an
      // automated status. This keeps autotests a second signal, not a silent overwrite.
      const changes = applyableChanges(run, plan.changes);
      const kept = plan.changes.length - changes.length;
      if (changes.length === 0) {
        get().toast?.(
          kept
            ? `${kept} row${kept === 1 ? '' : 's'} already have a manual result; automation was not applied.`
            : 'This execution has no row changes to apply.',
        );
        return;
      }
      const ok = await get().confirm({
        title: 'Apply automated results to the summary?',
        message: `${changes.length} unrecorded row${changes.length === 1 ? '' : 's'} will take the automated status${
          kept ? `; ${kept} manually recorded row${kept === 1 ? '' : 's'} will keep its result` : ''
        }. Manual notes and checks are always kept.`,
        confirmLabel: 'Apply',
      });
      if (!ok) return;
      for (const change of changes) get().updateRunRow(runId, change.rowIndex, { result: change.to });
      await get().rewriteRunDetails(runId);
      get().toast?.(
        `Applied ${changes.length} automated result${changes.length === 1 ? '' : 's'}${
          kept ? `; kept ${kept} manual result${kept === 1 ? '' : 's'}` : ''
        }`,
      );
    },
  };
}

/** Module-level live handles (not store state — they are not serializable and never rendered). */
const liveHandles = new Map<string, ExecutionHandle[]>();
/** Per-execution display progress trackers (reset with the run). */
const trackers = new Map<string, ProgressTracker>();

/** Merge one execution's view fields into the run's automation panel. */
function patchRunExecution(state: AppState, runId: string, executionId: string, patch: Partial<RunAutomationView['executions'][number]>): Partial<AppState> {
  const current = state.runAutomation[runId] ?? { executions: [], results: [], issues: [], busy: false };
  const existing = current.executions.find((e) => e.executionId === executionId);
  const next = existing
    ? current.executions.map((e) => (e.executionId === executionId ? { ...e, ...patch } : e))
    : [
        ...current.executions,
        {
          executionId,
          project: patch.project ?? '',
          state: (patch.state ?? 'starting') as ExecutionState,
          completed: 0,
          total: null,
          currentLine: null,
          logTail: '',
          error: null,
          startedAt: patch.startedAt ?? new Date().toISOString(),
          ...patch,
        },
      ];
  return { runAutomation: { ...state.runAutomation, [runId]: { ...current, executions: next } } };
}

/** Project a stored catalog entry back to the discovery shape (for a re-save). */
export function catalogEntryToDiscovered(e: CatalogEntry): DiscoveredTest & { automationId: string } {
  return {
    automationId: e.automationId,
    caseId: e.caseId,
    variantId: e.variantId,
    title: e.title,
    titlePath: e.titlePath,
    project: e.project,
    file: e.file,
    line: e.line,
    expectedStatus: e.expectedStatus,
    tags: e.tags,
  };
}

/** The glossary's `arguments` records, for binding values by reference. */
export async function loadArgumentRecords(repoPath: string): Promise<{ id: string; title: string; revision: string }[]> {
  const { docs } = await loadGlossary(repoPath);
  return docs
    .filter((d) => d.entry.kind === 'arguments' && !d.entry.archived && !d.readonly)
    .map((d) => ({ id: d.id, title: d.entry.title || d.id, revision: d.revision }));
}

export type { AutomationProfile, AutomationBinding, CatalogEntry, ResolvedAutomationArg };
