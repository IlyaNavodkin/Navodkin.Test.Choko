import { Button, Checkbox, Input, Modal } from '@codaa/ui';
import { rt } from './messages';
import { ReportPaper } from './ReportPaper';
import type { ReportSource } from './types';
import { useReportPreview } from './useReportPreview';
import styles from './ReportPreview.module.css';
export function ReportPreview({ source, onClose }: { source: ReportSource; onClose: () => void }) {
  const m = useReportPreview({ source });
  return <Modal open title={rt(source.kind)} maxWidth={1120} closable={!m.busy} onOpenChange={(open) => { if (!open && !m.busy) onClose(); }} actions={<><Button disabled={m.busy} onClick={onClose}>{rt('close')}</Button><Button disabled={m.busy || !m.report?.runs.length} onClick={() => void m.exportFile('json')}>{rt('json')}</Button><Button variant="primary" loading={m.busy} disabled={m.busy || !m.report?.runs.length} onClick={() => void m.exportFile('pdf')}>{rt('pdf')}</Button></>}>
    <div className={styles.body}><p className={styles.origin}>{rt('demo')}</p><div className={styles.options}>{source.kind === 'weekly' && <label className={styles.dateField}>{rt('date')}<Input type="date" value={m.date} aria-label={rt('date')} disabled={m.busy} onChange={(event) => m.setDate(event.target.value)} /></label>}<Checkbox checked={m.includeNotes} disabled={m.busy} onCheckedChange={m.setIncludeNotes}>{rt('notes')}</Checkbox></div>
      {m.notice && <p role={m.status === 'failed' ? 'alert' : 'status'} className={styles.notice}>{m.notice}</p>}
      {!m.report ? <p role="alert">{rt('invalid')}</p> : !m.report.runs.length ? <p role="status">{rt('empty')}</p> : <ReportPaper report={m.report} />}
    </div>
  </Modal>;
}
