import { Alert, Badge, Button, Input, Modal, Select, Textarea } from '@codaa/ui';
import { useTranslation } from 'react-i18next';
import { useImperativeHandle, type ReactNode, type Ref } from 'react';
import type { CaseDocument, CaseEdit } from '../../api/contracts';
import { useEditCase } from './useEditCase';
import styles from './CaseEditor.module.css';
export type CaseEditorHandle = { save: () => Promise<boolean> };
export type CaseEditorProps = { document: CaseDocument; sessionId: string; resourceId: string; onBlockedChange: (blocked: boolean) => void; onSavingChange?: (saving: boolean) => void; onDocumentChange: (document: CaseDocument) => void; ref?: Ref<CaseEditorHandle>; children?: ReactNode };
export function CaseEditor(props: CaseEditorProps) {
  const { t } = useTranslation(); const editor = useEditCase({ ...props, invalidMessage: t('editor.invalidField') });
  useImperativeHandle(props.ref, () => ({ save: editor.save }), [editor.save]);
  const { values, errors, setFieldValue } = editor.form;
  if (!editor.canEdit) return props.children ?? null;
  return <section className={styles.editor} aria-label={t('editor.title')}>
    <div className={styles.toolbar}>{editor.isEditing ? <>
      <Badge variant={editor.dirty ? 'warning' : 'success'}>{t(editor.isSaving ? 'editor.saving' : editor.dirty ? 'editor.dirty' : editor.saved ? 'editor.saved' : 'editor.clean')}</Badge>
      <Button variant="primary" onClick={() => void editor.save()} loading={editor.isSaving} disabled={!editor.dirty || Boolean(editor.externalDocument)}>{t('editor.save')}</Button>
      <Button onClick={editor.askDiscard} disabled={editor.isSaving || !editor.dirty}>{t('editor.discard')}</Button>
      <Button onClick={editor.stopEditing} disabled={editor.isSaving}>{t('editor.preview')}</Button>
    </> : <Button onClick={editor.startEditing}>{t('editor.edit')}</Button>}</div>
    {editor.errorCode ? <Alert variant="danger">{t(`repository.errors.${editor.errorCode}`)}</Alert> : null}
    {editor.externalDocument || editor.errorCode === 'EXTERNAL_CHANGE' ? <Alert variant="warning"><p>{t('editor.external')}</p><Button onClick={editor.askDiscard} disabled={editor.isSaving}>{t('editor.reload')}</Button></Alert> : null}
    {editor.isEditing ? <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void editor.save(); }}><fieldset disabled={editor.isSaving} className={styles.fields}>
      <p>{t('repository.stableId')}: <code>{props.document.model.id}</code></p>
      <Field label={t('editor.caseTitle')} error={errors.title}><Input aria-label={t('editor.caseTitle')} value={values.title} onChange={(event) => setFieldValue('title', event.target.value)} /></Field>
      <Field label={t('repository.displayId')} error={errors.displayId}><Input aria-label={t('repository.displayId')} value={values.displayId} onChange={(event) => setFieldValue('displayId', event.target.value)} /></Field>
      <Field label={t('editor.slug')} error={errors.slug}><Input aria-label={t('editor.slug')} value={values.slug ?? ''} onChange={(event) => setFieldValue('slug', event.target.value || null)} /></Field>
      <Field label={t('repository.status')} error={errors.status}><Select aria-label={t('repository.status')} value={values.status} options={(['draft', 'active', 'deprecated'] as const).map((value) => ({ value, label: t(`repository.caseStatus.${value}`) }))} onValueChange={(value) => { if (value === 'draft' || value === 'active' || value === 'deprecated') setFieldValue('status', value); }} /></Field>
      <Field label={t('repository.objective')} error={errors.objective}><Textarea rows={3} aria-label={t('repository.objective')} value={values.objective} onChange={(event) => setFieldValue('objective', event.target.value)} /></Field>
      {(['tags', 'systems', 'acceptanceCriteria'] as const).map((key) => <StringList key={key} label={t(key === 'tags' ? 'repository.tags' : key === 'systems' ? 'repository.systems' : 'repository.acceptance')} values={values[key]} error={errors[key]} onChange={(next) => setFieldValue(key, next)} addLabel={t('editor.add')} removeLabel={t('editor.remove')} />)}
      <Field label={t('repository.setup')} error={errors.setup}>{values.setup.map((item, index) => <div className={styles.rowBlock} key={index}>
        <Input aria-label={`${t('editor.setupName')} ${index + 1}`} value={item.name} onChange={(event) => setFieldValue('setup', values.setup.map((entry, i) => i === index ? { ...entry, name: event.target.value } : entry))} />
        <Textarea aria-label={`${t('editor.setupBody')} ${index + 1}`} rows={2} value={item.body} onChange={(event) => setFieldValue('setup', values.setup.map((entry, i) => i === index ? { ...entry, body: event.target.value } : entry))} />
        <Button type="button" size="sm" onClick={() => setFieldValue('setup', values.setup.filter((_, i) => i !== index))}>{t('editor.remove')}</Button>
      </div>)}<Button type="button" size="sm" onClick={() => setFieldValue('setup', [...values.setup, { name: '', body: '' }])}>{t('editor.addSetup')}</Button></Field>
      <Field label={t('repository.steps')} error={errors.steps}>{values.steps.map((step, index) => <StepRow key={index} step={step} index={index} onChange={(next) => setFieldValue('steps', values.steps.map((entry, i) => i === index ? next : entry))} onRemove={() => setFieldValue('steps', values.steps.filter((_, i) => i !== index))} />)}<Button type="button" size="sm" onClick={() => setFieldValue('steps', [...values.steps, { text: '', depth: 0 }])}>{t('editor.addStep')}</Button></Field>
    </fieldset></form> : props.children}
    <Modal open={editor.discardOpen} onOpenChange={(open) => { if (!open) editor.cancelDiscard(); }} title={t('editor.discardTitle')} closeOnBackdrop={false} closable={!editor.isSaving}
      actions={<><Button onClick={editor.cancelDiscard} disabled={editor.isSaving}>{t('editor.keepEditing')}</Button><Button variant="danger" onClick={() => void editor.discard()} loading={editor.isSaving}>{t('editor.confirmDiscard')}</Button></>}>
      <p>{t('editor.discardDescription')}</p><p>{props.document.model.displayId} · {props.document.model.title}</p>
    </Modal>
  </section>;
}
function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) { return <div className={styles.field}><span>{label}</span>{children}{error ? <span role="alert" className={styles.fieldError}>{error}</span> : null}</div>; }
function StringList({ label, values, error, onChange, addLabel, removeLabel }: { label: string; values: string[]; error?: string; onChange: (values: string[]) => void; addLabel: string; removeLabel: string }) {
  return <Field label={label} error={error}>{values.map((value, index) => <div className={styles.row} key={index}><Input aria-label={`${label} ${index + 1}`} value={value} onChange={(event) => onChange(values.map((entry, i) => i === index ? event.target.value : entry))} /><Button type="button" size="sm" aria-label={`${removeLabel} ${label} ${index + 1}`} onClick={() => onChange(values.filter((_, i) => i !== index))}>{removeLabel}</Button></div>)}<Button type="button" size="sm" onClick={() => onChange([...values, ''])}>{addLabel} · {label}</Button></Field>;
}
function StepRow({ step, index, onChange, onRemove }: { step: CaseEdit['steps'][number]; index: number; onChange: (step: CaseEdit['steps'][number]) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  return <div className={styles.row}><Input aria-label={`${t('editor.stepText')} ${index + 1}`} value={step.text} onChange={(event) => onChange({ ...step, text: event.target.value })} /><Select aria-label={`${t('editor.stepDepth')} ${index + 1}`} value={String(step.depth)} options={[0, 1, 2, 3].map((value) => ({ value: String(value), label: String(value) }))} onValueChange={(value) => onChange({ ...step, depth: Number(value) })} /><Button type="button" size="sm" aria-label={`${t('editor.remove')} ${t('editor.stepText')} ${index + 1}`} onClick={onRemove}>{t('editor.remove')}</Button></div>;
}
