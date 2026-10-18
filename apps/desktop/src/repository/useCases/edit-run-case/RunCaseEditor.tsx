import { Alert, Badge, Button, Input, Modal, Select, Textarea } from '@codaa/ui';
import { useEffect, useRef, useImperativeHandle, type ReactNode, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import type { RunCaseResource, RunCaseEdit } from '../../api/contracts';
import { useRunGuide } from '../execute-run/useRunGuide';
import { RunGuideChecklist } from '../execute-run/RunGuideChecklist';
import { useEditRunCase } from './useEditRunCase';
import styles from '../edit-run/RunEditor.module.css';

type Props = { guideMode?: boolean; onAdvance?: () => void; document: RunCaseResource; sessionId: string; resourceId: string; onBlockedChange: (value: boolean) => void; onSavingChange: (value: boolean) => void; onDocumentChange: (document: RunCaseResource) => void; ref?: Ref<{ save: () => Promise<boolean> }>; children: ReactNode };
const results = ['not_run', 'in_progress', 'pass', 'fail', 'blocked', 'skipped'] as const;
const states = ['none', 'pass', 'fail'] as const;
export function RunCaseEditor(props: Props) {
  const { t } = useTranslation();
  const editor = useEditRunCase({ ...props, initialEditing: props.guideMode, invalidMessage: t('runEditor.invalidField') });
  useImperativeHandle(props.ref, () => ({ save: editor.save }), [editor.save]);
  const { values, errors, setFieldValue } = editor.form;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (props.guideMode) { heading.current?.focus({ preventScroll: true }); heading.current?.scrollIntoView({ block: 'nearest' }); } }, [props.guideMode, props.resourceId]);
  const recorder = <>
      <Field label={t('repository.result')} error={errors.result}><Select aria-label={t('repository.result')} value={values.result} options={results.map((value) => ({ value, label: t(`repository.runResult.${value}`) }))} onValueChange={(value) => { const result = results.find((item) => item === value); if (result) setFieldValue('result', result); }} /></Field>
      <Field label={t('repository.tester')} error={errors.tester}><Input aria-label={t('repository.tester')} value={values.tester} onChange={(event) => setFieldValue('tester', event.target.value)} /></Field>
      <Field label={t('repository.executedAt')} error={errors.executedAt}><Input aria-label={t('repository.executedAt')} value={values.executedAt} onChange={(event) => setFieldValue('executedAt', event.target.value)} /><Button type="button" size="sm" onClick={() => setFieldValue('executedAt', new Date().toISOString())}>{t('runEditor.stamp')}</Button></Field>
      <Field label={t('repository.testDate')} error={errors.testDate}><Input aria-label={t('repository.testDate')} value={values.testDate ?? ''} onChange={(event) => setFieldValue('testDate', event.target.value || null)} /><small>{t('runEditor.inheritedDate')}</small></Field>
      <Field label={t('repository.notes')} error={errors.notes}><Textarea rows={4} aria-label={t('repository.notes')} value={values.notes} onChange={(event) => setFieldValue('notes', event.target.value)} /></Field>
  </>;
  const guide = useRunGuide({ model: props.document.document.model, values });
  const saveAndNext = async () => { if (values.result !== 'not_run' && await editor.save()) props.onAdvance?.(); };
  if (!editor.canEdit) return props.children;
  return <section className={styles.editor} aria-label={t('runEditor.title')}>
    <div className={styles.toolbar}>{editor.isEditing ? <>
      <Badge variant={editor.dirty ? 'warning' : 'success'}>{t(editor.isSaving ? 'editor.saving' : editor.dirty ? 'editor.dirty' : editor.saved ? 'editor.saved' : 'editor.clean')}</Badge>
      <Button variant="primary" loading={editor.isSaving} disabled={!editor.dirty || Boolean(editor.externalDocument)} onClick={() => void editor.save()}>{t('runEditor.save')}</Button>
      <Button disabled={editor.isSaving || !editor.dirty} onClick={editor.askDiscard}>{t('editor.discard')}</Button>
      <Button disabled={editor.isSaving} onClick={editor.stopEditing}>{t('editor.preview')}</Button>
    </> : <Button onClick={editor.startEditing}>{t('runEditor.edit')}</Button>}</div>
    {editor.errorCode ? <Alert variant="danger">{t(`repository.errors.${editor.errorCode}`)}</Alert> : null}
    {editor.externalDocument || editor.errorCode === 'EXTERNAL_CHANGE' ? <Alert variant="warning"><p>{t('editor.external')}</p><Button disabled={editor.isSaving} onClick={editor.askDiscard}>{t('editor.reload')}</Button></Alert> : null}
    {editor.isEditing ? <form onSubmit={(event) => { event.preventDefault(); void editor.save(); }}><fieldset className={styles.fields} disabled={editor.isSaving}>
      <h2 ref={heading} tabIndex={-1}>{props.document.document.model.displayId} · {props.document.document.model.title}</h2>
      {props.guideMode ? <RunGuideChecklist guide={guide} document={props.document} values={values} setFieldValue={setFieldValue}>
      {recorder}

      <Button type="button" variant="primary" loading={editor.isSaving} disabled={values.result === 'not_run' || Boolean(editor.externalDocument)} onClick={() => void saveAndNext()}>{t('runWorkflow.saveAndNext')}</Button>
      </RunGuideChecklist> : <>
      {recorder}
      {(['setup', 'steps', 'accept'] as const).map((section) => <CheckSection key={section} title={t(section === 'setup' ? 'repository.setup' : section === 'steps' ? 'repository.steps' : 'repository.acceptance')} items={props.document.document.model[section]} values={values[section]} error={errors[section]} onChange={(next) => setFieldValue(section, next)} />)}

      </>}

    </fieldset></form> : props.children}
    {props.guideMode && editor.isEditing ? <details><summary>{t('runWorkflow.savedDetails')}</summary>{props.children}</details> : null}
    <Modal open={editor.discardOpen} onOpenChange={(open) => { if (!open) editor.cancelDiscard(); }} title={t('editor.discardTitle')} closeOnBackdrop={false} closable={!editor.isSaving} actions={<><Button disabled={editor.isSaving} onClick={editor.cancelDiscard}>{t('editor.keepEditing')}</Button><Button variant="danger" loading={editor.isSaving} onClick={() => void editor.discard()}>{t('editor.confirmDiscard')}</Button></>}><p>{t('editor.discardDescription')}</p></Modal>
  </section>;
}
function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return <div className={styles.field}><span>{label}</span>{children}{error ? <span className={styles.error} role="alert">{error}</span> : null}</div>;
}
function CheckSection({ title, items, values, error, onChange }: { title: string; items: RunCaseResource['document']['model']['steps']; values: RunCaseEdit['steps']; error?: string; onChange: (values: RunCaseEdit['steps']) => void }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return <section className={styles.checklist}><h3>{title}</h3>{items.map((item, index) => {
    const value = values[index]!;
    const change = (next: typeof value) => onChange(values.map((entry, i) => i === index ? next : entry));
    return <div className={styles.item} key={item.key}><span>{index + 1}. {item.text}</span>
      <Select aria-label={`${title} ${index + 1} · ${t('runEditor.check')}`} value={value.state} options={states.map((state) => ({ value: state, label: t(`repository.checkState.${state}`) }))} onValueChange={(state) => { const next = states.find((item) => item === state); if (next) change({ ...value, state: next, failNote: next === 'fail' ? value.failNote : '' }); }} />
      {value.state === 'fail' ? <Input aria-label={`${title} ${index + 1} · ${t('runEditor.failNote')}`} value={value.failNote} onChange={(event) => change({ ...value, failNote: event.target.value })} /> : null}
    </div>;
  })}{error ? <span role="alert" className={styles.error}>{error}</span> : null}</section>;
}
