import { Alert, Button, Input, Modal, Select } from '@codaa/ui';
import { useState } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { CatalogEntry } from '../../api/contracts';
import { useOrganizeCase } from './useOrganizeCase';
import { CaseFilenameSchema, type CaseOperation } from '../../api/contracts';
import { useZodForm } from '../../../shared/forms/useZodForm';
export type OrganizeCaseDialogProps = {
  sessionId: string; workspacePath: string; resourceId: string; revision: string; path: string;
  mode: 'move' | 'delete' | 'rename'; initialParent: string | null; folders: CatalogEntry[];
  onCancel: () => void; onCompleted: (path: string | null) => void; onPendingChange: (pending: boolean) => void;
};
export function OrganizeCaseDialog({ sessionId, workspacePath, resourceId, revision, path, mode, initialParent, folders, onCancel, onCompleted, onPendingChange }: OrganizeCaseDialogProps) {
  const { t } = useTranslation();
  const [confirmedRevision] = useState(revision);
  const [parent, setParent] = useState(initialParent ?? 'root');
  const filename = useZodForm({ initialValues: { filename: path.split('/').at(-1) ?? '' }, schema: z.object({ filename: CaseFilenameSchema }), invalidMessage: t('caseOperations.renameInvalid') });
  const operation = useOrganizeCase({ sessionId, onCompleted, onPendingChange });
  const actionKey = mode === 'delete' ? 'caseOperations.delete' : mode === 'rename' ? 'caseOperations.rename' : 'caseOperations.move';
  const nextPath = [...path.split('/').slice(0, -1), filename.values.filename].join('/');
  const submit = async () => {
    const values = mode === 'rename' ? filename.validate() : null;
    if (mode === 'rename' && !values) return;
    const action: CaseOperation['action'] = mode === 'delete' ? { kind: 'delete' } : mode === 'rename' && values ? { kind: 'rename', filename: values.filename } : { kind: 'move', parentResourceId: parent === 'root' ? null : parent };
    if (await operation.organize({ workspacePath, resourceId, expectedRevision: confirmedRevision, action })) onCancel();
  };
  return <Modal open title={t(actionKey)} closeOnBackdrop={false} closable={!operation.isPending} onOpenChange={(open) => { if (!open && !operation.isPending) onCancel(); }}
    actions={<><Button disabled={operation.isPending} onClick={onCancel}>{t('caseCreation.cancel')}</Button><Button variant={mode === 'delete' ? 'danger' : 'primary'} loading={operation.isPending} disabled={operation.isPending || (mode === 'move' && parent === (initialParent ?? 'root')) || (mode === 'rename' && nextPath === path)} onClick={() => void submit()}>{t(mode === 'delete' ? 'caseOperations.confirmDelete' : actionKey)}</Button></>}>
    <p>{t(mode === 'delete' ? 'caseOperations.deleteDescription' : mode === 'rename' ? 'caseOperations.renameDescription' : 'caseOperations.moveDescription')}</p><code>{path}</code>
    {mode === 'rename' ? <><label htmlFor="rename-case-file">{t('caseOperations.filename')}</label><Input id="rename-case-file" autoFocus value={filename.values.filename} disabled={operation.isPending} aria-invalid={Boolean(filename.errors.filename)} aria-describedby={filename.errors.filename ? 'rename-case-error' : undefined} onChange={(event) => filename.setFieldValue('filename', event.target.value)} />{filename.errors.filename ? <p role="alert" id="rename-case-error">{filename.errors.filename}</p> : null}<p>{t('caseOperations.newPath')}: <code>{nextPath}</code></p></> : null}
    {mode === 'move' ? <><label htmlFor="move-case-parent">{t('caseCreation.destination')}</label><Select id="move-case-parent" aria-label={t('caseCreation.destination')} value={parent} disabled={operation.isPending} onValueChange={setParent}
      options={[{ value: 'root', label: t('caseCreation.workspaceRoot') }, ...folders.flatMap((entry) => entry.kind === 'folder' ? [{ value: entry.metadata.nodeId, label: entry.metadata.path }] : [])]} /></> : null}
    {operation.errorCode ? <Alert variant="danger">{t(operation.errorCode === 'SAVE_FAILED' ? 'caseOperations.failure' : `repository.errors.${operation.errorCode}`)}</Alert> : null}
  </Modal>;
}
