import { Alert, Button, Input, Modal, Select } from '@codaa/ui';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { PortableNameSchema, UuidV4Schema, type CatalogEntry, type SuiteOperation, type SuiteRecovery } from '../../api/contracts';
import { useZodForm } from '../../../shared/forms/useZodForm';
import { useOrganizeSuite } from './useOrganizeSuite';
import styles from './OrganizeSuiteDialog.module.css';
export type SuiteMode = SuiteOperation['action']['kind'];
export function SuiteActionButtons({ disabled, onSelect }: { disabled: boolean; onSelect: (mode: SuiteMode) => void }) {
  const { t } = useTranslation();
  return <>{(['duplicate', 'rename', 'move', 'delete'] as const).map((mode) => <Button key={mode} size="sm" variant={mode === 'delete' ? 'danger' : 'secondary'} disabled={disabled} onClick={() => onSelect(mode)}>{t(`suiteOperations.${mode}`)}</Button>)}</>;
}
export function SuiteRecoveryNotice({ recovery }: { recovery: SuiteRecovery }) {
  const { t } = useTranslation();
  return <Alert variant="danger"><strong>{t('suiteOperations.recoveryTitle')}</strong><p>{t('suiteOperations.recoveryDescription')}</p><p>{t('suiteOperations.transaction')}: <code>{recovery.transactionPath}</code></p>{recovery.removedPaths.length ? <><strong>{t('suiteOperations.removed')}</strong><ul className={styles.paths}>{recovery.removedPaths.map((path) => <li key={path}><code>{path}</code></li>)}</ul></> : null}<strong>{t('suiteOperations.remaining')}</strong><ul className={styles.paths}>{recovery.remainingPaths.map((path) => <li key={path}><code>{path}</code></li>)}</ul></Alert>;
}
export type OrganizeSuiteDialogProps = { mode: SuiteMode; sessionId: string; workspacePath: string; resourceId: string; path: string; initialParent: string | null; folders: CatalogEntry[]; onCancel: () => void; onCompleted: (path: string | null) => void; onRecovery: (recovery: SuiteRecovery) => void; onPendingChange: (pending: boolean) => void };
export function OrganizeSuiteDialog({ mode, sessionId, workspacePath, resourceId, path, initialParent, folders, onCancel, onCompleted, onRecovery, onPendingChange }: OrganizeSuiteDialogProps) {
  const { t } = useTranslation();
  const name = path.split('/').at(-1) ?? '';
  const form = useZodForm({ initialValues: { name: mode === 'duplicate' ? `${name} — ${t('suiteCreation.copySuffix')}` : name, parentResourceId: initialParent }, schema: z.object({ name: mode === 'duplicate' || mode === 'rename' ? PortableNameSchema : z.string(), parentResourceId: UuidV4Schema.nullable() }).strict(), invalidMessage: t('suiteCreation.invalidName') });
  const operation = useOrganizeSuite({ sessionId, onCompleted: (path) => { onCompleted(path); onCancel(); }, onRecovery, onPendingChange });
  const prepare = () => {
    const values = form.validate();
    if (!values) return;
    const { parentResourceId } = values;
    const action: SuiteOperation['action'] = mode === 'duplicate' ? { kind: mode, name: form.values.name, parentResourceId } : mode === 'rename' ? { kind: mode, name: form.values.name } : mode === 'move' ? { kind: mode, parentResourceId } : { kind: mode };
    void operation.prepare({ workspacePath, resourceId, action });
  };
  const preview = operation.preview;
  return <Modal open title={t(`suiteOperations.${mode}`)} closeOnBackdrop={false} closable={!operation.isPending} onOpenChange={(open) => { if (!open && !operation.isPending) onCancel(); }} actions={<>
    <Button disabled={operation.isPending} onClick={onCancel}>{t(operation.recovery ? 'repository.close' : 'caseCreation.cancel')}</Button>
    {!operation.recovery ? preview ? <><Button disabled={operation.isPending} onClick={operation.resetPreview}>{t('suiteOperations.back')}</Button><Button variant={mode === 'delete' ? 'danger' : 'primary'} loading={operation.isPending} disabled={operation.isPending} onClick={() => void operation.apply()}>{t(mode === 'delete' ? 'suiteOperations.confirmDelete' : 'suiteOperations.confirm')}</Button></> : <Button variant="primary" loading={operation.isPending} disabled={operation.isPending || (mode === 'rename' && form.values.name === name) || (mode === 'move' && form.values.parentResourceId === initialParent)} onClick={prepare}>{t('suiteOperations.prepare')}</Button> : null}
  </>}>
    <div className={styles.form}>
      <code>{path}</code>{mode === 'rename' ? <p>{t('suiteOperations.diskName')}</p> : null}{!operation.recovery ? <p>{t(preview ? 'suiteOperations.preview' : 'suiteOperations.description')}</p> : null}
      {!preview && !operation.recovery && (mode === 'duplicate' || mode === 'rename') ? <><label htmlFor="suite-operation-name">{t('suiteCreation.name')}</label><Input id="suite-operation-name" autoFocus value={form.values.name} disabled={operation.isPending} aria-invalid={Boolean(form.errors.name)} onChange={(event) => form.setFieldValue('name', event.target.value)} />{form.errors.name ? <p role="alert">{form.errors.name}</p> : null}</> : null}
      {!preview && !operation.recovery && (mode === 'duplicate' || mode === 'move') ? <><label htmlFor="suite-operation-parent">{t('caseCreation.destination')}</label><Select id="suite-operation-parent" aria-label={t('caseCreation.destination')} value={form.values.parentResourceId ?? 'root'} disabled={operation.isPending} onValueChange={(parent) => form.setFieldValue('parentResourceId', parent === 'root' ? null : parent)} options={[{ value: 'root', label: t('caseCreation.workspaceRoot') }, ...folders.flatMap((entry) => entry.kind === 'folder' && entry.metadata.path !== path && !entry.metadata.path.startsWith(`${path}/`) ? [{ value: entry.metadata.nodeId, label: entry.metadata.path }] : [])]} /></> : null}
      {preview ? <><p>{t('caseOperations.newPath')}: <code>{preview.destinationPath ?? t('suiteOperations.delete')}</code></p>{preview.permanentDelete ? <Alert variant="warning">{t('suiteOperations.permanent')}</Alert> : null}<p>{t('suiteOperations.total', { count: preview.entries.length, bytes: preview.totalBytes })}</p><ul className={styles.paths} aria-label={t('suiteOperations.manifest')}>{preview.entries.map((entry) => <li key={entry.path}><code>{entry.path}</code> — {t(`suiteOperations.kinds.${entry.kind}`)} ({entry.size})</li>)}</ul></> : null}
      {operation.errorCode ? <Alert variant="danger">{t(`repository.errors.${operation.errorCode}`)}</Alert> : null}
      {operation.recovery ? <SuiteRecoveryNotice recovery={operation.recovery} /> : null}
    </div>
  </Modal>;
}
