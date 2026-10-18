import { Alert, Badge, Button, EmptyState, Input, LoadingState, Select } from '@codaa/ui';
import type { Catalog, StableKey, TestRecord } from '@testoritto/playwright-automation';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { RunsCatalog } from '../../../repository/api/contracts';
import { AutomationApiError, automationApi, type AutomationApi } from '../../api/automationApi';
import type { AutomationPoll, AutomationView, ExecutionSummary } from '../../api/contracts';
import { applicableTests, keyOf, mergeBindings, mergeCatalog, selectionFrom } from './automationPlan';
import styles from './AutomationPanel.module.css';

type AutomationPanelProps = {
  sessionId: string;
  runs: RunsCatalog | undefined;
  isRunsLoading: boolean;
  runsErrorCode: string | null;
  onRefreshRuns: () => void;
  blocked: boolean;
  api?: AutomationApi;
};

type Draft = {
  profileId: string;
  label: string;
  cwd: string;
  config: string;
  projects: string;
  nodePath: string;
  timeoutMs: string;
  retries: string;
  workers: string;
};

type Discovery = {
  execution: ExecutionSummary;
  catalog: Catalog;
  applicable: Catalog['tests'];
};

type RunResult = {
  execution: ExecutionSummary;
  tests: TestRecord[];
  report: AutomationPoll['report'];
};

class PollCancelled extends Error {}

const OUTCOME_VARIANT = {
  expected: 'success',
  unexpected: 'danger',
  flaky: 'warning',
  skipped: 'neutral',
  interrupted: 'warning',
} as const;

const STATE_VARIANT = {
  running: 'brand',
  completed: 'success',
  runner_error: 'danger',
  interrupted: 'warning',
  timed_out: 'warning',
} as const;

function defaultNodePath(): string {
  if (/Windows/i.test(navigator.userAgent)) return 'C:\\Program Files\\nodejs\\node.exe';
  if (/Mac/i.test(navigator.userAgent)) return '/usr/local/bin/node';
  return '/usr/bin/node';
}

function emptyDraft(): Draft {
  return {
    profileId: 'local',
    label: 'Локальный Playwright',
    cwd: '.',
    config: 'playwright.config.ts',
    projects: 'chromium',
    nodePath: defaultNodePath(),
    timeoutMs: '300000',
    retries: '0',
    workers: '1',
  };
}

function draftFromProfile(profile: import('@testoritto/playwright-automation').AutomationProfile, nodePath: string | null): Draft {
  return {
    profileId: profile.profileId,
    label: profile.label,
    cwd: profile.cwd,
    config: profile.config,
    projects: profile.projects.join(', '),
    nodePath: nodePath ?? defaultNodePath(),
    timeoutMs: String(profile.timeoutMs),
    retries: String(profile.retries),
    workers: String(profile.workers),
  };
}

function toProfile(draft: Draft): import('@testoritto/playwright-automation').AutomationProfile {
  return {
    schemaVersion: 1,
    profileId: draft.profileId.trim(),
    label: draft.label.trim(),
    cwd: draft.cwd.trim() || '.',
    config: draft.config.trim(),
    projects: draft.projects.split(',').map((value) => value.trim()).filter(Boolean),
    timeoutMs: Number(draft.timeoutMs),
    retries: Number(draft.retries),
    workers: Number(draft.workers),
  };
}

function validProfile(profile: import('@testoritto/playwright-automation').AutomationProfile, nodePath: string): boolean {
  return Boolean(
    profile.profileId &&
    profile.label &&
    profile.config &&
    profile.projects.length &&
    nodePath.trim() &&
    [profile.timeoutMs, profile.retries, profile.workers].every(Number.isInteger) &&
    profile.timeoutMs > 0 &&
    profile.retries >= 0 &&
    profile.workers > 0,
  );
}

export function AutomationPanel({ sessionId, runs, isRunsLoading, runsErrorCode, onRefreshRuns, blocked, api = automationApi }: AutomationPanelProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<AutomationView | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [runId, setRunId] = useState('');
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<ExecutionSummary | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const pollToken = useRef(0);

  useEffect(() => {
    const token = ++pollToken.current;
    setLoading(true);
    setError(null);
    setNotice(null);
    setDiscovery(null);
    setResult(null);
    setActive(null);
    void api.read(sessionId)
      .then((next) => {
        if (token !== pollToken.current) return;
        setView(next);
        const first = next.profiles[0];
        setDraft(first ? draftFromProfile(first.profile, first.nodePath) : emptyDraft());
      })
      .catch((cause: unknown) => {
        if (token === pollToken.current) setError(errorText(cause, t));
      })
      .finally(() => {
        if (token === pollToken.current) setLoading(false);
      });
    return () => { pollToken.current += 1; };
  }, [sessionId, api, t]);

  useEffect(() => {
    if (!runId && runs?.runs.length) setRunId(runs.runs[0].runId);
  }, [runs, runId]);

  const profileView = view?.profiles.find((item) => item.profile.profileId === draft.profileId) ?? null;
  const boundKeys = new Set((view?.bindings ?? []).filter((binding) => binding.profileId === draft.profileId).map(keyOf));
  const runOptions = (runs?.runs ?? []).map((run) => ({ value: run.runId, label: `${run.name} · ${run.testDate}` }));

  function update<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function saveProfile() {
    if (!view) return;
    const profile = toProfile(draft);
    if (!validProfile(profile, draft.nodePath)) {
      setError(t('automation.invalidProfile'));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await api.saveProfile(sessionId, view.revision, profile, draft.nodePath.trim());
      setView(next);
      const saved = next.profiles.find((item) => item.profile.profileId === profile.profileId);
      if (saved) setDraft(draftFromProfile(saved.profile, saved.nodePath));
      setNotice(t('automation.profileSaved'));
    } catch (cause: unknown) {
      setError(errorText(cause, t));
    } finally {
      setBusy(false);
    }
  }

  async function toggleTrust() {
    if (!profileView) {
      setError(t('automation.saveFirst'));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await api.setTrust(sessionId, profileView.profile.profileId, profileView.revision, !profileView.trusted);
      setView(next);
      setNotice(next.profiles.find((item) => item.profile.profileId === profileView.profile.profileId)?.trusted ? t('automation.trustedNotice') : t('automation.revokedNotice'));
    } catch (cause: unknown) {
      setError(errorText(cause, t));
    } finally {
      setBusy(false);
    }
  }

  async function pollUntilDone(summary: ExecutionSummary, token: number): Promise<{ execution: ExecutionSummary; tests: TestRecord[]; catalog: Catalog | null; report: AutomationPoll['report'] }> {
    let cursor = 0;
    let tests: TestRecord[] = [];
    let catalog: Catalog | null = null;
    let report: AutomationPoll['report'] = null;
    for (let attempt = 0; attempt < 1200; attempt += 1) {
      if (token !== pollToken.current) throw new PollCancelled();
      const page = await api.poll(sessionId, summary.runId, summary.executionId, cursor);
      setActive(page.execution);
      if (page.catalog) catalog = mergeCatalog(catalog, page.catalog);
      if (page.tests.length) tests = [...tests, ...page.tests];
      if (page.report) report = page.report;
      if (page.nextCursor !== null) {
        cursor = page.nextCursor;
        continue;
      }
      if (page.execution.state !== 'running') {
        return { execution: page.execution, tests, catalog, report };
      }
      await new Promise((resolve) => setTimeout(resolve, 700));
    }
    throw new Error(t('automation.timeout'));
  }

  async function discover() {
    if (!view || !profileView || !runId) return;
    if (!profileView.trusted) {
      setError(t('automation.untrusted'));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setDiscovery(null);
    setResult(null);
    setSelected(new Set());
    const token = ++pollToken.current;
    try {
      const summary = await api.discover(sessionId, {
        profileId: profileView.profile.profileId,
        profileRevision: profileView.revision,
        runId,
        operation: 'discover',
        catalogExecutionId: null,
        catalogRevision: null,
        selection: [],
        parentExecutionId: null,
      });
      setActive(summary);
      const done = await pollUntilDone(summary, token);
      if (token !== pollToken.current) return;
      if (!done.catalog) throw new Error(t('automation.noCatalog'));
      const run = runs?.runs.find((item) => item.runId === runId);
      const applicable = applicableTests(done.catalog, run?.cases.map((item) => item.caseId) ?? []);
      const missing = applicable.filter((test) => !boundKeys.has(keyOf(test)));
      if (missing.length) {
        const next = await api.saveBindings(sessionId, view.revision, mergeBindings(view.bindings, missing, profileView.profile.profileId));
        if (token !== pollToken.current) return;
        setView(next);
      }
      setDiscovery({ execution: done.execution, catalog: done.catalog, applicable });
      setSelected(new Set(applicable.map(keyOf)));
      setNotice(applicable.length ? t('automation.discovered', { count: applicable.length }) : t('automation.noTestCases'));
    } catch (cause: unknown) {
      if (token === pollToken.current && !(cause instanceof PollCancelled)) setError(errorText(cause, t));
    } finally {
      if (token === pollToken.current) setBusy(false);
    }
  }

  async function runSelected() {
    if (!discovery || !profileView) return;
    const runnable = discovery.catalog.tests.filter((test) => selected.has(keyOf(test)) && discovery.applicable.some((item) => keyOf(item) === keyOf(test)));
    if (!runnable.length) {
      setError(t('automation.selectOne'));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setResult(null);
    setCancelling(false);
    const token = ++pollToken.current;
    try {
      const summary = await api.start(sessionId, {
        profileId: profileView.profile.profileId,
        profileRevision: profileView.revision,
        runId,
        operation: 'run',
        catalogExecutionId: discovery.execution.executionId,
        catalogRevision: discovery.catalog.catalogRevision,
        selection: selectionFrom(runnable),
        parentExecutionId: null,
      });
      setActive(summary);
      const done = await pollUntilDone(summary, token);
      if (token !== pollToken.current) return;
      setResult({ execution: done.execution, tests: done.tests, report: done.report });
    } catch (cause: unknown) {
      if (token === pollToken.current && !(cause instanceof PollCancelled)) setError(errorText(cause, t));
    } finally {
      if (token === pollToken.current) setBusy(false);
    }
  }

  async function cancel() {
    if (!active || active.state !== 'running') return;
    setCancelling(true);
    setError(null);
    try {
      await api.cancel(sessionId, active.executionId);
      setNotice(t('automation.cancelling'));
    } catch (cause: unknown) {
      setError(errorText(cause, t));
    } finally {
      setCancelling(false);
    }
  }

  function toggle(test: StableKey) {
    setSelected((current) => {
      const next = new Set(current);
      const key = keyOf(test);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) return <LoadingState title={t('automation.loading')} />;

  return <section className={styles.panel} aria-label={t('automation.title')}>
    <div className={styles.heading}>
      <div><h2>{t('automation.title')}</h2><p>{t('automation.subtitle')}</p></div>
      {profileView ? <Badge variant={profileView.trusted ? 'success' : 'warning'}>{profileView.trusted ? t('automation.trusted') : t('automation.untrustedShort')}</Badge> : null}
    </div>

    {error ? <Alert variant="danger"><strong>{t('automation.error')}</strong><p>{error}</p></Alert> : null}
    {notice ? <Alert variant="info">{notice}</Alert> : null}
    {!view ? <Alert variant="warning">{t('automation.unavailable')}</Alert> : null}

    <section className={styles.card}>
      <h3>{t('automation.setup')}</h3>
      {!profileView ? <p className={styles.hint}>{t('automation.noProfile')}</p> : <p className={styles.hint}>{t('automation.profileRevision')}: <code>{profileView.revision.slice(0, 12)}…</code></p>}
      <div className={styles.grid}>
        <label>{t('automation.profileId')}<Input value={draft.profileId} onChange={(event) => update('profileId', event.target.value)} disabled={busy || blocked} /></label>
        <label>{t('automation.label')}<Input value={draft.label} onChange={(event) => update('label', event.target.value)} disabled={busy || blocked} /></label>
        <label>{t('automation.cwd')}<Input value={draft.cwd} onChange={(event) => update('cwd', event.target.value)} disabled={busy || blocked} /></label>
        <label>{t('automation.config')}<Input value={draft.config} onChange={(event) => update('config', event.target.value)} disabled={busy || blocked} /></label>
        <label>{t('automation.projects')}<Input value={draft.projects} onChange={(event) => update('projects', event.target.value)} disabled={busy || blocked} /></label>
        <label>{t('automation.nodePath')}<Input value={draft.nodePath} onChange={(event) => update('nodePath', event.target.value)} disabled={busy || blocked} /></label>
        <label>{t('automation.timeoutMs')}<Input type="number" value={draft.timeoutMs} onChange={(event) => update('timeoutMs', event.target.value)} disabled={busy || blocked} /></label>
        <label>{t('automation.retries')}<Input type="number" value={draft.retries} onChange={(event) => update('retries', event.target.value)} disabled={busy || blocked} /></label>
        <label>{t('automation.workers')}<Input type="number" value={draft.workers} onChange={(event) => update('workers', event.target.value)} disabled={busy || blocked} /></label>
      </div>
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => void saveProfile()} disabled={busy || blocked || !view}>{t('automation.save')}</Button>
        {profileView ? <Button onClick={() => void toggleTrust()} disabled={busy || blocked}>{profileView.trusted ? t('automation.revoke') : t('automation.trust')}</Button> : null}
      </div>
      {!profileView?.trusted ? <Alert variant="warning">{t('automation.trustHint')}</Alert> : null}
    </section>

    <section className={styles.card}>
      <h3>{t('automation.run')}</h3>
      <div className={styles.actions}>
        <Select aria-label={t('automation.selectRun')} value={runId} placeholder={t('automation.selectRun')} options={runOptions} onValueChange={setRunId} disabled={busy || blocked || isRunsLoading || !runOptions.length} />
        <Button size="sm" onClick={onRefreshRuns} disabled={busy || blocked || isRunsLoading}>{t('automation.refreshRuns')}</Button>
      </div>
      {isRunsLoading ? <LoadingState title={t('automation.loadingRuns')} /> : null}
      {runsErrorCode ? <Alert variant="danger">{t('automation.runsError')}</Alert> : null}
      {!isRunsLoading && !runsErrorCode && !runOptions.length ? <EmptyState title={t('automation.noRuns')} description={t('automation.noRunsHint')} /> : null}
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => void discover()} disabled={busy || blocked || !profileView?.trusted || !runId}>{busy ? t('automation.working') : t('automation.discover')}</Button>
        {active?.state === 'running' ? <Button variant="danger" onClick={() => void cancel()} disabled={cancelling}>{t('automation.cancel')}</Button> : null}
      </div>
      {active?.state === 'running' ? <LoadingState title={active.operation === 'discover' ? t('automation.discovering') : t('automation.running')} /> : null}
    </section>

    {discovery ? <section className={styles.card}>
      <div className={styles.heading}><h3>{t('automation.tests')}</h3><Badge>{t('automation.testCount', { count: discovery.catalog.tests.length })}</Badge></div>
      <p className={styles.hint}>{t('automation.runnableCount', { count: discovery.applicable.length })}</p>
      <ul className={styles.testList}>
        {discovery.catalog.tests.map((test) => {
          const key = keyOf(test);
          const runnable = boundKeys.has(key) && discovery.applicable.some((item) => keyOf(item) === key);
          return <li key={key} className={styles.testItem}>
            <label>
              <input type="checkbox" checked={selected.has(key)} disabled={!runnable || busy || blocked} onChange={() => toggle(test)} />
              <span><strong>{test.title}</strong><small>{test.caseId} · {test.automationId} · {test.project}/{test.variantId} · {test.file}</small></span>
            </label>
            <Badge variant={runnable ? 'success' : 'warning'}>{runnable ? t('automation.runnable') : t('automation.notInRun')}</Badge>
          </li>;
        })}
      </ul>
      <div className={styles.actions}>
        <Button variant="primary" onClick={() => void runSelected()} disabled={busy || blocked || !profileView?.trusted || selected.size === 0}>{t('automation.runSelected')}</Button>
        <Button onClick={() => setSelected(new Set(discovery.applicable.map(keyOf)))} disabled={busy || blocked || !discovery.applicable.length}>{t('automation.selectAll')}</Button>
      </div>
    </section> : null}

    {result ? <section className={styles.card}>
      <div className={styles.heading}><h3>{t('automation.results')}</h3><Badge variant={STATE_VARIANT[result.execution.state]}>{t(`automation.states.${result.execution.state}`)}</Badge></div>
      <p className={styles.hint}>{t('automation.testCount', { count: result.tests.length })}</p>
      {result.report?.reason ? <Alert variant="danger">{result.report.reason}</Alert> : null}
      {result.tests.length ? <ul className={styles.resultList}>
        {result.tests.map((test) => <li key={keyOf(test)} className={styles.resultItem}>
          <div className={styles.statusRow}><Badge variant={OUTCOME_VARIANT[test.outcome]}>{t(`automation.outcomes.${test.outcome}`)}</Badge><strong>{test.title}</strong><small>{test.caseId} · {test.automationId} · {test.project}/{test.variantId}</small></div>
          {test.attempts.map((attempt) => <details key={`${attempt.repeatEachIndex}:${attempt.retry}`} className={styles.attempt}>
            <summary>{t('automation.attempt', { retry: attempt.retry + 1 })} · {attempt.status} · {Math.round(attempt.durationMs)} ms</summary>
            {attempt.errors.map((item, index) => <pre key={index}>{item.message}</pre>)}
            {attempt.stdout ? <pre>{attempt.stdout}</pre> : null}
            {attempt.stderr ? <pre>{attempt.stderr}</pre> : null}
          </details>)}
        </li>)}
      </ul> : <EmptyState title={t('automation.noResults')} />}
      {result.report && (result.report.logs.stdout || result.report.logs.stderr) ? <details><summary>{t('automation.logs')}</summary><pre>{result.report.logs.stdout}{result.report.logs.stderr}</pre></details> : null}
    </section> : null}
  </section>;
}

function errorText(error: unknown, t: TFunction): string {
  if (error instanceof AutomationApiError) {
    switch (error.code) {
      case 'AUTOMATION_UNTRUSTED': return t('automation.errors.untrusted');
      case 'AUTOMATION_UNAVAILABLE': return t('automation.errors.unavailable');
      case 'STALE_PROFILE': return t('automation.errors.staleProfile');
      case 'BUSY': return t('automation.errors.busy');
      case 'CANCELLED': return t('automation.errors.cancelled');
      case 'INVALID_REPORT': return t('automation.errors.invalidReport');
      case 'INVALID_REQUEST': return t('automation.errors.invalidRequest');
      case 'INVALID_SESSION': return t('automation.errors.invalidSession');
      case 'STALE_RESOURCE': return t('automation.errors.staleResource');
      case 'IO': return t('automation.errors.io');
      default: return t('automation.errors.generic', { code: error.code });
    }
  }
  return error instanceof Error ? error.message : t('automation.errors.generic', { code: 'UNKNOWN' });
}
