import { Alert, Badge, Button, Checkbox, EmptyState, Progress, StatusPill } from '@codaa/ui';
import { OverridesEditor } from './ArgumentEditor';
import { at } from './messages';
import { buildOverrides, coerceLiteral } from './usePreviewAutomation';
import type { UsePreviewAutomationResult } from './usePreviewAutomation';
import type { ArgumentDefinition, ArgumentValue, InvocationSnapshot, StableKey, TestRecord } from './types';
import styles from './AutomationWorkspace.module.css';

const outcomeTone: Record<string, 'success' | 'danger' | 'warning' | 'neutral' | 'info'> = { expected: 'success', unexpected: 'danger', flaky: 'warning', skipped: 'neutral', interrupted: 'info' };

export function RunPanel({ model: m }: { model: UsePreviewAutomationResult }) {
  const disabled = m.blocked || m.busy;
  const ready = m.bindings.filter((binding) => binding.enabled && !m.autotests.find((item) => item.id === binding.autotestId)?.archived);
  const total = m.active ? m.active.started.length : 0;
  const done = m.active?.records.length ?? 0;
  return <section className={styles.panel}>
    <h2>{at('run')}</h2><p className={styles.muted}>{at('runHint')}</p>
    <div className={styles.selection}>
      <div className={styles.rowActions}><Button size="sm" disabled={disabled} onClick={m.selectAllReady}>{at('selectAll')}</Button><Button size="sm" variant="ghost" disabled={disabled} onClick={m.clearSelection}>{at('clearSelection')}</Button><Badge variant="brand">{`${at('selection')}: ${m.selectedCount}`}</Badge></div>
      <ul className={styles.selectionList}>{ready.map((binding) => {
        const autotest = m.autotests.find((item) => item.id === binding.autotestId)!;
        const caseRow = m.cases.find((item) => item.id === binding.caseId);
        return <li key={binding.id}><Checkbox checked={m.selectedBindings.includes(binding.id)} disabled={disabled || Boolean(m.active)} onCheckedChange={(checked) => m.toggleSelection(binding.id, checked)}><strong>{caseRow?.displayId ?? binding.caseId}</strong> · {autotest.title}<small>{`${autotest.selector.automationId} · ${autotest.selector.project}`}</small></Checkbox></li>;
      })}</ul>
    </div>

    <h3>{at('invocations')}</h3>
    {m.invocations.length ? <ul className={styles.invocationList}>{m.invocations.map((item) => {
      const snapshot: InvocationSnapshot | null = item.snapshot;
      const environment = snapshot?.environments ?? [];
      return <li key={item.bindingId}>
        <div className={styles.bindingHead}>
          <strong>{item.title}</strong>
          {snapshot ? <StatusPill tone={m.stalePreview && m.preview?.bindingId === item.bindingId ? 'danger' : 'info'} size="sm">{m.stalePreview && m.preview?.bindingId === item.bindingId ? at('previewStale') : at('previewValid')}</StatusPill> : <StatusPill tone="danger" size="sm">{at('UNAVAILABLE')}</StatusPill>}
          <Button size="sm" disabled={disabled || !snapshot} onClick={() => m.previewSnapshot(item.bindingId)}>{at('preview')}</Button>
        </div>
        {snapshot && <ul className={styles.resolvedList}>{snapshot.sources.map((source) => <li key={source.key}>
          <code>{source.key}</code><span>{String(snapshot.resolvedArguments[source.key])}</span>
          <small>{source.layer === 'schema' ? at('layerSchema') : source.layer === 'autotest' ? at('layerAutotest') : source.layer === 'binding' ? at('layerBinding') : at('layerRun')}{source.reference ? ` · ${at('environment')}: ${source.reference.key} · ${source.revision?.slice(0, 8) ?? ''}` : ''}</small>
        </li>)}</ul>}
        {item.issues.length > 0 && <Alert variant="warning">{item.issues.map((issue) => `${issue.key ? `${issue.key}: ` : ''}${at(issue.code)}`).join('; ')}</Alert>}
        {item.autotest && !m.active && <details className={styles.runOverride}><summary>{at('layerRun')}</summary>
          <OverridesEditor definitions={item.autotest.argumentDefinitions} environments={m.environments} disabled={disabled}
            draft={Object.fromEntries(item.autotest.argumentDefinitions.map((definition) => [definition.key, toRow(definition, m.runOverrides[item.bindingId]?.[definition.key])]))}
            onChange={(draft) => { const { overrides } = buildOverrides(item.autotest!, draft); for (const definition of item.autotest!.argumentDefinitions) m.setRunOverride(item.bindingId, definition, Object.hasOwn(overrides, definition.key) ? overrides[definition.key] : null); }} />
        </details>}
      </li>;
    })}</ul> : <p className={styles.muted}>{at('noSelection')}</p>}

    <div className={styles.rowActions}>
      {m.active ? <><Button variant="primary" onClick={m.stop}>{at('stop')}</Button><StatusPill tone="info" pulse>{at('running')}</StatusPill><Progress value={total ? done / total : 0} label={at('progress')} /></> : <Button variant="primary" disabled={!m.canRun} onClick={m.start}>{at('start')}</Button>}
      <Button disabled={disabled || !m.lastCompleted} onClick={m.rerunFailed}>{at('rerunFailed')}</Button>
      {m.stalePreview && <Badge variant="danger">{at('previewStale')}</Badge>}
      {m.duplicateSelection && <Badge variant="warning">{at('duplicateSelection')}</Badge>}
    </div>

    {m.active && <h3>{at('running')}</h3>}
    {m.active && <ul className={styles.recordList}>{planRows(m).map((row) => <li key={row.invocationId}>
      <div className={styles.bindingHead}><strong>{row.title}</strong>{row.record ? <StatusPill tone={outcomeTone[row.record.outcome] ?? 'neutral'} size="sm">{at(row.record.outcome === 'interrupted' ? 'interruptedOutcome' : row.record.outcome)}</StatusPill> : <Badge>{at('starting')}</Badge>}<small>{`${row.key.caseId} · ${row.key.project}`}</small></div>
      {row.record && <ul className={styles.attemptList}>{row.record.attempts.map((attempt) => <li key={`${attempt.repeatEachIndex}:${attempt.retry}`}>
        <Badge variant={attempt.status === 'passed' ? 'success' : attempt.status === 'skipped' ? 'neutral' : 'danger'}>{at(attempt.status)}</Badge>
        <small>{at('attempt')} {attempt.retry + 1} · {Math.round(attempt.durationMs)} ms</small>
        {attempt.errors.map((error) => <span className={styles.attemptError} key={error.message}>{error.message}</span>)}
        {attempt.stdout && <details><summary>{at('stdout')}</summary><pre>{attempt.stdout}</pre></details>}
        {attempt.stderr && <details><summary>{at('stderr')}</summary><pre>{attempt.stderr}</pre></details>}
        {attempt.attachments.length > 0 && <small>{at('attachments')}: {attempt.attachments.length}</small>}
      </li>)}</ul>}
    </li>)}</ul>}

    <h3>{at('history')}</h3>
    {m.history.length ? <ul className={styles.historyList}>{m.history.map((execution) => <li key={execution.executionId}>
      <StatusPill tone={execution.state === 'completed' ? 'success' : execution.state === 'interrupted' ? 'warning' : 'danger'} size="sm">{at(execution.state === 'running' ? 'running' : execution.state === 'completed' ? 'completedState' : execution.state === 'runner_error' ? 'runnerErrors' : execution.state === 'timed_out' ? 'timedOut' : 'interrupted')}</StatusPill>
      <code>{execution.executionId.slice(0, 8)}</code>
      <span>{execution.records.length} · {execution.state}</span>
      {execution.parentExecutionId && <small>{at('parent')}: {execution.parentExecutionId.slice(0, 8)}</small>}
      {execution.reason && <small>{at('reason')}: {execution.reason}</small>}
      {execution.runnerErrors[0] && <small>{execution.runnerErrors[0].message}</small>}
      {execution.importFormat && <Badge variant="brand">{`импорт · ${execution.importFormat}`}</Badge>}
      {!execution.report && <small>{at('noValidReport')}</small>}
    </li>)}</ul> : <EmptyState title={at('noHistory')} />}
  </section>;
}

type PlanRow = { invocationId: string; key: StableKey; title: string; record: TestRecord | null };
function planRows(m: UsePreviewAutomationResult): PlanRow[] {
  const active = m.active;
  if (!active) return [];
  return active.started.map((key, index) => {
    const snapshot = active.snapshots[index];
    return { invocationId: snapshot?.binding.id ?? `${key.caseId}:${key.automationId}`, key, title: snapshot?.autotest.title ?? key.automationId, record: active.records[index] ?? null };
  });
}
function toRow(definition: ArgumentDefinition, value: ArgumentValue | undefined) {
  if (!value) return { source: 'inherit' as const, literal: '', entryId: '', key: '' };
  if (value.kind === 'environment') return { source: 'environment' as const, literal: '', entryId: value.entryId, key: value.key };
  const coerced = coerceLiteral(definition, String(value.value));
  return { source: 'literal' as const, literal: coerced.value === undefined ? '' : String(coerced.value), entryId: '', key: '' };
}
