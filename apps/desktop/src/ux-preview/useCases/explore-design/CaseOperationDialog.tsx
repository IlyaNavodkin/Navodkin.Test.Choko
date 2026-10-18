import actionStyles from './PrimaryAction.module.css';
import { Button, Icon, IconNames, Input, Modal, Select, type IconName } from '@codaa/ui';
import { DialogHeading, DialogNotice } from './DialogVisuals';
import { suiteOperations } from './caseOperations';
import { t } from './messages';
import type { UseCaseOperationsResult } from './useCaseOperations';
import styles from './Dialogs.module.css';
export function PathList({ paths }: { paths: string[] }) { return <ul className={styles.paths}>{paths.map((path, i) => <li key={`${path}-${i}`}><Icon name={IconNames.fileText} /><code>{path}</code></li>)}</ul>; }
export function CaseOperationDialog({ model: m, folders }: { model: UseCaseOperationsResult; folders: string[] }) {
  if (!m.operation) return null;
  const isDelete = m.operation === 'deleteCase' || m.operation === 'deleteSuite';
  const needsName = ['newCase', 'duplicateCase', 'newFolder', 'renameCase', 'renameSuite', 'duplicateSuite'].includes(m.operation);
  const needsDestination = ['newCase', 'duplicateCase', 'newFolder', 'moveCase', 'moveSuite', 'duplicateSuite'].includes(m.operation);
  const title = m.phase === 'partial' ? t('partialTitle') : m.phase === 'stale' ? t('staleTitle') : m.phase === 'preview' ? t('manifestTitle') : t(m.operation);
  const icon: IconName = m.phase === 'partial' || m.phase === 'stale' ? IconNames.triangleAlert : isDelete ? IconNames.trash : m.operation.includes('Folder') || m.operation.includes('Suite') ? IconNames.folderOpen : IconNames.fileText;
  return <Modal open title={<DialogHeading title={title} icon={icon} tone={isDelete || m.phase === 'partial' ? 'danger' : m.phase === 'stale' ? 'warning' : 'info'} />} maxWidth={680} closable={!m.busy} onOpenChange={(open) => { if (!open) m.close(); }} actions={<>
    {m.phase === 'partial' ? <Button className={actionStyles.primaryAction} variant="primary" onClick={m.close}>{t('acknowledge')}</Button> : <><Button disabled={m.busy} onClick={m.close}>{t('cancel')}</Button>
      {m.phase === 'preview' && <Button disabled={m.busy} onClick={m.back}>{t('back')}</Button>}
      <Button className={isDelete && m.phase === 'preview' ? undefined : actionStyles.primaryAction} variant={isDelete && m.phase === 'preview' ? 'danger' : 'primary'} loading={m.busy} onClick={m.phase === 'preview' ? m.confirm : m.prepare}>{m.phase === 'stale' ? t('retry') : m.phase === 'preview' ? isDelete ? t('deleteListed') : t('confirm') : t('reviewManifest')}</Button></>}
  </>}><div className={styles.form}>
    {m.phase === 'partial' && m.report ? <><DialogNotice tone="danger">{t('partialHint')}</DialogNotice><h3>{t('removed')} ({m.report.removed.length})</h3><PathList paths={m.report.removed} /><h3>{t('remaining')} ({m.report.remaining.length})</h3><PathList paths={m.report.remaining} /><label>{t('journal')}<Input readOnly size="sm" value={m.report.journal} /></label></> : <>
      {m.source && m.operation !== 'newCase' && m.operation !== 'newFolder' && <label>{t('currentPath')}<Input readOnly size="sm" value={m.source} /></label>}
      {m.phase === 'parameters' && <>{needsName && <label>{m.operation === 'renameCase' ? t('filename') : t('name')}<Input aria-label={t('name')} value={m.values.name} onChange={(event) => m.update('name', event.target.value)} /></label>}
        {needsDestination && <label>{t('destination')}<Select aria-label={t('destination')} value={m.values.destination} options={[{ value: '', label: 'Платежи /' }, ...folders.map((value) => ({ value, label: value }))]} onValueChange={(value) => m.update('destination', value)} /></label>}
        <DialogNotice tone={isDelete ? 'warning' : 'info'}>{t(m.operation === 'newFolder' ? 'emptyFolderHint' : m.operation === 'renameCase' ? 'filenameHint' : isDelete ? 'deleteWarning' : suiteOperations.includes(m.operation) ? 'manifestHint' : 'newId')}</DialogNotice></>}
      {m.phase === 'preview' && <><DialogNotice tone={isDelete ? 'warning' : 'info'}>{t(isDelete ? 'deleteWarning' : 'manifestHint')}</DialogNotice><PathList paths={m.plan?.entries.map((entry) => entry.from && entry.to ? `${entry.from} → ${entry.to}` : entry.from ?? entry.to ?? '') ?? []} /></>}
      {m.phase === 'stale' && <DialogNotice tone="danger">{t('staleHint')}</DialogNotice>}
      {m.error && <DialogNotice tone="danger" alert>{m.error}</DialogNotice>}
    </>}
  </div></Modal>;
}
