import { Alert, Button, Input, Modal, Select } from '@codaa/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CaseCreationSchema, type CatalogEntry, type CaseCreation } from '../../api/contracts';
import { useZodForm } from '../../../shared/forms/useZodForm';
import { useCreateCase } from './useCreateCase';

const CreationFormSchema = CaseCreationSchema.pick({ title: true, parentResourceId: true });

export type CreateCaseDialogProps = {
  sessionId: string; workspacePath: string; folders: CatalogEntry[];
  initialParent: string | null; source: CaseCreation['source']; initialTitle: string;
  onCancel: () => void; onCreated: (path: string) => void; onPendingChange: (pending: boolean) => void;
};
export function CreateCaseDialog({ sessionId, workspacePath, folders, initialParent, source, initialTitle, onCancel, onCreated, onPendingChange }: CreateCaseDialogProps) {
  const { t } = useTranslation();
  const form = useZodForm<{ title: string; parentResourceId: string | null }>({ initialValues: { title: initialTitle, parentResourceId: initialParent }, schema: CreationFormSchema, invalidMessage: t('editor.invalidField') });
  const { title, parentResourceId } = form.values;
  const [confirmedSource] = useState(source);
  const operation = useCreateCase({ sessionId, onCreated, onPendingChange });
  const submit = async () => {
    const values = form.validate();
    if (values && await operation.create({ workspacePath, ...values, source: confirmedSource })) onCancel();
  };
  return <Modal open onOpenChange={(open) => { if (!open && !operation.isPending) onCancel(); }} title={t(source ? 'caseCreation.duplicate' : 'caseCreation.create')} closeOnBackdrop={false}
    actions={<><Button disabled={operation.isPending} onClick={onCancel}>{t('caseCreation.cancel')}</Button><Button variant="primary" loading={operation.isPending} disabled={operation.isPending || !title.trim()} onClick={() => void submit()}>{t(source ? 'caseCreation.duplicate' : 'caseCreation.create')}</Button></>}>
    <p>{t(source ? 'caseCreation.duplicateDescription' : 'caseCreation.description')}</p>
    <label htmlFor="new-case-title">{t('editor.caseTitle')}</label>
    <Input id="new-case-title" autoFocus value={title} aria-invalid={Boolean(form.errors.title)} aria-describedby={form.errors.title ? "new-case-title-error" : undefined} disabled={operation.isPending} onChange={(event) => form.setFieldValue('title', event.target.value)} />
    {form.errors.title ? <p id="new-case-title-error" role="alert">{form.errors.title}</p> : null}
    <label htmlFor="new-case-parent">{t('caseCreation.destination')}</label>
    <Select id="new-case-parent" aria-label={t('caseCreation.destination')} value={parentResourceId ?? 'root'} disabled={operation.isPending} onValueChange={(value) => form.setFieldValue('parentResourceId', value === 'root' ? null : value)}
      options={[{ value: 'root', label: t('caseCreation.workspaceRoot') }, ...folders.flatMap((entry) => entry.kind === 'folder' ? [{ value: entry.metadata.nodeId, label: entry.metadata.path }] : [])]} />
    {operation.errorCode ? <Alert variant="danger">{t(`repository.errors.${operation.errorCode}`)}</Alert> : null}
  </Modal>;
}
