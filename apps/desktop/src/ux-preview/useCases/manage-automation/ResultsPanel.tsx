import { Alert, Badge, Button, EmptyState, StatusPill } from '@codaa/ui';
import { at } from './messages';
import type { UsePreviewAutomationResult } from './usePreviewAutomation';
import styles from './AutomationWorkspace.module.css';

export function ResultsPanel({ model: m }: { model: UsePreviewAutomationResult }) {
  const execution = m.latest;
  if (!execution) return <EmptyState title={at('noHistory')} description={at('resultsHint')} />;
  return <section className={styles.panel}>
    <h2>{at('results')}</h2><p className={styles.muted}>{at('resultsHint')}</p>
    <div className={styles.summaryRow}>
      <StatusPill tone={execution.state === 'completed' ? 'success' : 'danger'} size="sm">{at(execution.state === 'completed' ? 'completedState' : execution.state === 'runner_error' ? 'runnerErrors' : execution.state === 'timed_out' ? 'timedOut' : 'interrupted')}</StatusPill>
      <Badge variant="brand">{`${at('invocations')}: ${execution.records.length}`}</Badge>
      {m.summary && <><Badge variant="success">{`${at('expected')}: ${m.summary.expected}`}</Badge><Badge variant="danger">{`${at('unexpected')}: ${m.summary.unexpected}`}</Badge><Badge variant="warning">{`${at('flaky')}: ${m.summary.flaky}`}</Badge></>}
      <code>{execution.executionId}</code>
      <Button size="sm" variant="primary" disabled={m.blocked || m.busy} onClick={m.saveResults}>{at('saveResults')}</Button>
      {m.resultsApplied === execution.executionId && <Badge variant="success">{at('resultsSaved')}</Badge>}
    </div>
    <ul className={styles.resultList}>{execution.records.map((record, index) => {
      const snapshot = execution.snapshots[index];
      return <li key={snapshot?.binding.id ?? `${record.caseId}:${record.automationId}:${record.project}:${record.variantId}`}>
        <div className={styles.bindingHead}>
          <strong>{snapshot?.autotest.title ?? record.automationId}</strong>
          <StatusPill tone={record.outcome === 'expected' ? 'success' : record.outcome === 'unexpected' ? 'danger' : record.outcome === 'flaky' ? 'warning' : record.outcome === 'skipped' ? 'neutral' : 'info'} size="sm">{at(record.outcome === 'interrupted' ? 'interruptedOutcome' : record.outcome)}</StatusPill>
          <small>{`${record.caseId} · ${record.project} · ${at('expectedStatus')}: ${at(record.expectedStatus)}`}</small>
          <Badge>{`${at('attempt')}: ${record.attempts.length}`}</Badge>
        </div>
        {snapshot && <ul className={styles.resolvedList}>{snapshot.sources.map((source) => <li key={source.key}><code>{source.key}</code><span>{String(snapshot.resolvedArguments[source.key])}</span><small>{source.reference ? `${at('environment')}: ${source.reference.entryId.slice(0, 13)}… · ${source.reference.key} · ${source.revision?.slice(0, 8)}` : at(source.layer === 'schema' ? 'layerSchema' : source.layer === 'autotest' ? 'layerAutotest' : source.layer === 'binding' ? 'layerBinding' : 'layerRun')}</small></li>)}</ul>}
      </li>;
    })}</ul>
    {execution.runnerErrors.length > 0 && <Alert variant="danger">{execution.runnerErrors.map((error) => error.message).join('; ')}</Alert>}
    {execution.logs.stdout && <details><summary>{at('stdout')}</summary><pre>{execution.logs.stdout}</pre></details>}
    {execution.logs.stderr && <details><summary>{at('stderr')}</summary><pre>{execution.logs.stderr}</pre></details>}

    <h3>{at('reports')}</h3>
    {!execution.report && <Alert variant="warning">{at(execution.duplicateSelection ? 'duplicateSelection' : 'noValidReport')}</Alert>}
    {m.artifacts.length ? <>
      <table className={styles.artifacts}><thead><tr><th>{at('fileName')}</th><th>{at('size')}</th><th>{at('hash')}</th><th>{at('availability')}</th></tr></thead>
        <tbody>{m.artifacts.map((artifact) => <tr key={artifact.id}>
          <td><code>{artifact.relativePath}</code><small>{artifact.contentType}</small></td>
          <td>{artifact.size} B</td>
          <td><code>{artifact.sha256 ? artifact.sha256.slice(0, 12) : at('missing')}</code></td>
          <td>{artifact.saved ? <Badge variant="success">{at('savedLabel')}</Badge> : <Badge>{at('available')}</Badge>}</td>
        </tr>)}</tbody></table>
      <div className={styles.rowActions}><Button size="sm" variant="primary" disabled={m.blocked || m.busy} onClick={m.saveReports}>{at('saveReports')}</Button><small>{at('reportsSaved')}</small></div>
    </> : <p className={styles.muted}>{at('attachmentsNote')}</p>}
    <Alert variant="info">{execution.attachmentCount ? `${at('attachments')}: ${execution.attachmentCount} · ${at('attachmentBlocked')}` : at('attachmentsNote')}</Alert>
  </section>;
}
