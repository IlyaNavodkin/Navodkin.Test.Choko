import { Alert, Badge, Button, Modal, Select, Textarea } from '@codaa/ui';
import { useImperativeHandle, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { RunDetailsResource } from '../../api/contracts';
import { useEditRunDetails } from './useEditRunDetails';
import styles from './RunEditor.module.css';
type Props = { document: RunDetailsResource; sessionId: string; resourceId: string; onBlockedChange: (value: boolean) => void; onSavingChange: (value: boolean) => void; onDocumentChange: (document: RunDetailsResource) => void; ref?: Ref<{ save: () => Promise<boolean> }>; children: ReactNode };
export function RunDetailsEditor(props: Props) {
  const { t } = useTranslation();
  const editor = useEditRunDetails({ ...props, invalidMessage: t('runDetailsEditor.invalidField') });
  useImperativeHandle(props.ref, () => ({ save: editor.save }), [editor.save]);
  const { values, errors, setFieldValue } = editor.form;
  if (!editor.canEdit) return props.children;
  return <section className={styles.editor} aria-label={t('runDetailsEditor.title')}>
    <div className={styles.toolbar}>{editor.isEditing ? <>
      <Badge variant={editor.dirty ? 'warning' : 'success'}>{t(editor.isSaving ? 'editor.saving' : editor.dirty ? 'editor.dirty' : editor.saved ? 'editor.saved' : 'editor.clean')}</Badge>
      <Button variant="primary" loading={editor.isSaving} disabled={!editor.dirty || Boolean(editor.externalDocument)} onClick={() => void editor.save()}>{t('runDetailsEditor.save')}</Button>
      <Button disabled={editor.isSaving || !editor.dirty} onClick={editor.askDiscard}>{t('editor.discard')}</Button>
      <Button disabled={editor.isSaving} onClick={editor.stopEditing}>{t('editor.preview')}</Button>
    </> : <Button onClick={editor.startEditing}>{t('runDetailsEditor.edit')}</Button>}</div>
    {editor.errorCode ? <Alert variant="danger">{t(`repository.errors.${editor.errorCode}`)}</Alert> : null}
    {editor.externalDocument || editor.errorCode === 'EXTERNAL_CHANGE' ? <Alert variant="warning"><p>{t('editor.external')}</p><Button disabled={editor.isSaving} onClick={editor.askDiscard}>{t('editor.reload')}</Button></Alert> : null}
    {editor.isEditing ? <form onSubmit={(event) => { event.preventDefault(); void editor.save(); }}><fieldset className={styles.fields} disabled={editor.isSaving}>
      <h2>{props.document.document.model.name}</h2>
      <label className={styles.field}><span>{t('repository.status')}</span><Select aria-label={t('repository.status')} value={values.status} options={(['open', 'closed'] as const).map((value) => ({ value, label: t(`repository.runStatus.${value}`) }))} onValueChange={(value) => { if (value === 'open' || value === 'closed') setFieldValue('status', value); }} />{errors.status ? <span role="alert">{errors.status}</span> : null}</label>
      {(['summary', 'notes'] as const).map((key) => <label className={styles.field} key={key}><span>{t(key === 'summary' ? 'runDetailsEditor.summary' : 'repository.notes')}</span><Textarea rows={5} aria-label={t(key === 'summary' ? 'runDetailsEditor.summary' : 'repository.notes')} value={values[key]} onChange={(event) => setFieldValue(key, event.target.value)} />{errors[key] ? <span role="alert">{errors[key]}</span> : null}</label>)}
      <p>{t('runDetailsEditor.preserved')}</p>
    </fieldset></form> : props.children}
    <Modal open={editor.discardOpen} onOpenChange={(open) => { if (!open) editor.cancelDiscard(); }} title={t('editor.discardTitle')} closeOnBackdrop={false} closable={!editor.isSaving} actions={<><Button disabled={editor.isSaving} onClick={editor.cancelDiscard}>{t('editor.keepEditing')}</Button><Button variant="danger" loading={editor.isSaving} onClick={() => void editor.discard()}>{t('editor.confirmDiscard')}</Button></>}><p>{t('editor.discardDescription')}</p></Modal>
  </section>;
}
