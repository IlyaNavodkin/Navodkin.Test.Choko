import { Alert, Button, Input, Modal, Select } from '@codaa/ui';
import { useTranslation } from 'react-i18next';
import type { CatalogEntry } from '../../api/contracts';
import { useCreateSuite } from './useCreateSuite';
import styles from './CreateSuiteDialog.module.css';
export type CreateSuiteDialogProps = { sessionId: string; workspacePath: string; folders: CatalogEntry[]; initialParent: string | null; onCancel: () => void; onCreated: (path: string) => void; onPendingChange: (pending: boolean) => void };
export function CreateSuiteDialog({ sessionId, workspacePath, folders, initialParent, onCancel, onCreated, onPendingChange }: CreateSuiteDialogProps) {
  const { t } = useTranslation();
  const operation = useCreateSuite({ sessionId, initialParent, invalidMessage: t('suiteCreation.invalidName'), onCreated, onPendingChange });
  const { form, isPending } = operation;
  const submit = async () => { if (await operation.create(workspacePath)) onCancel(); };
  return <Modal open title={t('suiteCreation.create')} closeOnBackdrop={false} closable={!isPending} onOpenChange={(open) => { if (!open && !isPending) onCancel(); }}
    actions={<><Button disabled={isPending} onClick={onCancel}>{t('caseCreation.cancel')}</Button><Button variant="primary" loading={isPending} disabled={isPending || !form.values.name} onClick={() => void submit()}>{t('suiteCreation.create')}</Button></>}>
    <div className={styles.form}>
      <p>{t('suiteCreation.description')}</p><p className={styles.hint}>{t('suiteCreation.gitEmpty')}</p>
      <label htmlFor="new-suite-name">{t('suiteCreation.name')}</label>
      <Input id="new-suite-name" autoFocus value={form.values.name} disabled={isPending} aria-invalid={Boolean(form.errors.name)} aria-describedby={form.errors.name ? 'new-suite-name-error' : undefined} onChange={(event) => form.setFieldValue('name', event.target.value)} />
      {form.errors.name ? <p role="alert" id="new-suite-name-error">{form.errors.name}</p> : null}
      <label htmlFor="new-suite-parent">{t('caseCreation.destination')}</label>
      <Select id="new-suite-parent" aria-label={t('caseCreation.destination')} value={form.values.parentResourceId ?? 'root'} disabled={isPending} onValueChange={(value) => form.setFieldValue('parentResourceId', value === 'root' ? null : value)} options={[{ value: 'root', label: t('caseCreation.workspaceRoot') }, ...folders.flatMap((entry) => entry.kind === 'folder' ? [{ value: entry.metadata.nodeId, label: entry.metadata.path }] : [])]} />
      {operation.errorCode ? <Alert variant="danger">{t(`repository.errors.${operation.errorCode}`)}</Alert> : null}
    </div>
  </Modal>;
}
