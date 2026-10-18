import { Alert, Button, Checkbox, Input, Modal } from '@codaa/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CatalogEntry } from '../../api/contracts';
import { useCreateRun } from './useCreateRun';
import styles from './CreateRunDialog.module.css';
export type CreateRunDialogProps = { sessionId: string; workspacePath: string; entries: CatalogEntry[]; initialResourceId: string | null; onCancel: () => void; onCreated: (runId: string) => void; onPendingChange: (pending: boolean) => void };
export function CreateRunDialog({ sessionId, workspacePath, entries, initialResourceId, onCancel, onCreated, onPendingChange }: CreateRunDialogProps) {
  const { t } = useTranslation();
  const [candidates] = useState(() => entries.flatMap((entry) => entry.kind === 'case' && entry.metadata.id && entry.metadata.revision ? [{ ...entry.metadata, revision: entry.metadata.revision }] : []));
  const [visible, setVisible] = useState(50);
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const operation = useCreateRun({ sessionId, invalidMessage: t('runCreation.invalidField'),
    initialValues: { workspacePath, name: '', scope: '', testDate: date, cases: candidates.filter((item) => item.resourceId === initialResourceId).map((item) => ({ resourceId: item.resourceId, expectedRevision: item.revision })) },
    onCreated, onPendingChange });
  const { values, errors, setFieldValue } = operation.form;
  const setSelected = (resourceId: string, selected: boolean) => {
    const ids = new Set(values.cases.map((item) => item.resourceId));
    if (selected) ids.add(resourceId); else ids.delete(resourceId);
    setFieldValue('cases', candidates.filter((item) => ids.has(item.resourceId)).map((item) => ({ resourceId: item.resourceId, expectedRevision: item.revision })));
  };
  return <Modal open title={t('runCreation.create')} closeOnBackdrop={false} onOpenChange={(open) => { if (!open && !operation.isPending) onCancel(); }}
    actions={<><Button disabled={operation.isPending} onClick={onCancel}>{t('caseCreation.cancel')}</Button><Button variant="primary" loading={operation.isPending} disabled={operation.isPending} onClick={() => void operation.create()}>{t('runCreation.create')}</Button></>}>
    <p>{t('runCreation.description')}</p>
    <fieldset className={styles.form} disabled={operation.isPending}>
      <label htmlFor="run-name">{t('runCreation.name')}</label><Input id="run-name" autoFocus value={values.name} onChange={(event) => setFieldValue('name', event.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'run-name-error' : undefined} />
      {errors.name ? <p id="run-name-error" role="alert">{errors.name}</p> : null}
      <label htmlFor="run-date">{t('repository.testDate')}</label><Input id="run-date" type="date" value={values.testDate} onChange={(event) => setFieldValue('testDate', event.target.value)} aria-invalid={Boolean(errors.testDate)} />
      {errors.testDate ? <p role="alert">{errors.testDate}</p> : null}
      <label htmlFor="run-scope">{t('repository.scope')}</label><Input id="run-scope" value={values.scope} onChange={(event) => setFieldValue('scope', event.target.value)} aria-invalid={Boolean(errors.scope)} aria-describedby={errors.scope ? 'run-scope-error' : undefined} />
      {errors.scope ? <p id="run-scope-error" role="alert">{t('runCreation.scopeTooLong')}</p> : null}
      <p>{t('runCreation.selected', { count: values.cases.length })}</p>
      <p>{t('runCreation.limit')}</p>
      <div className={styles.actions}><Button size="sm" onClick={() => setFieldValue('cases', candidates.slice(0, 500).map((item) => ({ resourceId: item.resourceId, expectedRevision: item.revision })))}>{t('runCreation.selectAll')}</Button><Button size="sm" onClick={() => setFieldValue('cases', [])}>{t('runCreation.clear')}</Button></div>
      {errors.cases ? <p role="alert">{errors.cases}</p> : null}
      {!candidates.length ? <Alert variant="warning">{t('runCreation.noCases')}</Alert> : null}
      <div className={styles.cases}>{candidates.slice(0, visible).map((item) => <Checkbox key={item.resourceId} className={styles.case} checked={values.cases.some((selected) => selected.resourceId === item.resourceId)} onCheckedChange={(checked) => setSelected(item.resourceId, checked === true)}>
        <span><strong>{item.displayId} · {item.title}</strong><small>{item.path}</small></span>
      </Checkbox>)}</div>
      {visible < candidates.length ? <Button size="sm" onClick={() => setVisible((count) => count + 50)}>{t('repository.showMore')}</Button> : null}
    </fieldset>
    {operation.errorCode ? <Alert variant="danger">{t(operation.errorCode === 'SAVE_FAILED' ? 'runCreation.failed' : `repository.errors.${operation.errorCode}`)}</Alert> : null}
  </Modal>;
}
