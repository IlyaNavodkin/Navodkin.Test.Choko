import { Alert, Badge, Button, Select, Textarea } from '@codaa/ui';
import { at } from './messages';
import type { UsePreviewAutomationResult } from './usePreviewAutomation';
import type { ImportFormat } from './types';
import styles from './AutomationWorkspace.module.css';

export function ImportPanel({ model: m }: { model: UsePreviewAutomationResult }) {
  const preview = m.importPreview;
  return <section className={styles.panel}>
    <h2>{at('import')}</h2><p className={styles.muted}>{at('importHint')}</p>
    <div className={styles.formRow}>
      <label>{at('importFormat')}<Select aria-label={at('importFormat')} value={m.importFormat} disabled={m.busy} options={([['playwright', 'Playwright JSON'], ['junit', 'JUnit XML'], ['testoritto', 'Testoritto report.json']] as const).map(([value, label]) => ({ value, label }))} onValueChange={(value) => m.setImportFormat(value as ImportFormat)} /></label>
      <div className={styles.rowActions}><Button disabled={m.busy} onClick={m.loadSample}>{at('sample')}</Button><Button variant="primary" loading={m.busy} disabled={m.busy || !m.importText.trim()} onClick={() => void m.parseImportText()}>{at('parse')}</Button></div>
    </div>
    <Textarea rows={10} aria-label={at('paste')} placeholder={at('paste')} value={m.importText} disabled={m.busy} onChange={(event) => m.setImportText(event.target.value)} />
    {preview && <>
      <div className={styles.summaryRow}>
        <Badge variant="brand">{preview.format}</Badge>
        <Badge variant="success">{`${at('matched')}: ${preview.rows.filter((row) => row.status === 'matched').length}`}</Badge>
        <Badge variant="warning">{`${at('duplicate')}: ${preview.rows.filter((row) => row.status === 'duplicate').length}`}</Badge>
        <Badge>{`${at('unmatched')}: ${preview.rows.filter((row) => row.status === 'unmatched').length}`}</Badge>
        <code>{preview.sourceHash.slice(0, 12)}</code>
      </div>
      {preview.metadataMissing && <Alert variant="info">{at('metadataMissing')}</Alert>}
      {preview.foreignRun && <Alert variant="warning">{at('foreignRun')}</Alert>}
      {preview.duplicateImport && <Alert variant="warning">{at('duplicateImport')}</Alert>}
      {preview.executionConflict && <Alert variant="danger">{at('executionConflict')}</Alert>}
      <table className={styles.artifacts}><thead><tr><th>#</th><th>{at('state')}</th><th>{at('outcome')}</th><th>{at('title')}</th><th>{at('case')}</th></tr></thead>
        <tbody>{preview.rows.map((row) => <tr key={row.index}>
          <td>{row.index + 1}</td>
          <td><Badge variant={row.status === 'matched' ? 'success' : row.status === 'duplicate' ? 'warning' : 'neutral'}>{at(row.status)}</Badge></td>
          <td>{row.outcome}</td>
          <td>{row.title}<small>{row.file}</small></td>
          <td>{row.identity ? `${row.identity.caseId} · ${row.identity.automationId} · ${row.identity.project}` : '—'}</td>
        </tr>)}</tbody></table>
      <div className={styles.rowActions}><Button variant="primary" disabled={m.blocked || m.busy || preview.duplicateImport || !preview.rows.some((row) => row.status === 'matched')} onClick={m.applyImport}>{at('applyMatched')}</Button></div>
    </>}
  </section>;
}
