import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Icon, IconNames, Input, Select, Textarea } from '@codaa/ui';
import { SectionMarkdownEditor } from '../../components/markdown-editor/SectionMarkdownEditor';
import type { ReferenceOption } from '../../components/markdown-editor/ReferencePicker';
import { SourceReferenceButton } from '../../components/markdown-editor/SourceReferenceButton';
import { caseStatuses, t } from './messages';
import { DocumentBlock } from './Shared';
import type { UsePreviewCaseEditorResult } from './usePreviewCaseEditor';
import styles from './Preview.module.css';
export function CaseDocument({ model: m, references }: { model: UsePreviewCaseEditorResult; references?: ReferenceOption[] }) {
  if (!m.selected) return <div className={styles.empty}><h1>{t('noSelection')}</h1><p>{t('noCasesHint')}</p></div>;
  return <CaseFields key={m.selected.id} model={m} references={references} />;
}
function CaseFields({ model: m, references }: { model: UsePreviewCaseEditorResult; references?: ReferenceOption[] }) {
  const nextKey = useRef(0);
  const [stepKeys, setStepKeys] = useState(() => m.values.steps.map(() => nextKey.current++));
  const stepRefs = useRef(new Map<number, HTMLTextAreaElement>());
  const pendingFocus = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    const target = stepRefs.current.get(pendingFocus.current);
    if (target) { target.focus(); target.setSelectionRange(target.value.length, target.value.length); pendingFocus.current = null; }
  });
  function addAfter(index: number) {
    if (locked) return;
    const key = nextKey.current++;
    setStepKeys([...stepKeys.slice(0, index + 1), key, ...stepKeys.slice(index + 1)]);
    pendingFocus.current = key;
    m.update('steps', [...m.values.steps.slice(0, index + 1), '', ...m.values.steps.slice(index + 1)]);
  }
  function remove(index: number) {
    if (locked || m.values.steps.length <= 1) return;
    pendingFocus.current = stepKeys[index > 0 ? index - 1 : 1];
    setStepKeys(stepKeys.filter((_, i) => i !== index));
    m.update('steps', m.values.steps.filter((_, i) => i !== index));
  }
  const locked = m.saving || m.blocked;
  useEffect(() => { if (stepKeys.length !== m.values.steps.length) setStepKeys(m.values.steps.map(() => nextKey.current++)); }, [m.values.steps.length, stepKeys.length]);
  function reorder(index: number, offset: number) {
    if (locked || index + offset < 0 || index + offset >= m.values.steps.length) return;
    const steps = [...m.values.steps]; const keys = [...stepKeys];
    [steps[index], steps[index + offset]] = [steps[index + offset], steps[index]];
    [keys[index], keys[index + offset]] = [keys[index + offset], keys[index]];
    setStepKeys(keys); m.update('steps', steps);
  }
  if (!m.selected) return null;
  return <article className={styles.document}><fieldset className={styles.editorFields} disabled={m.saving || m.blocked}>
    <div className={styles.documentId}><Icon name={IconNames.fileText} />{m.selected.displayId}</div>
    <h1 aria-label={m.values.title}><Input className={styles.titleInput} aria-label={t('title')} value={m.values.title} onChange={(event) => m.update('title', event.target.value)} /></h1>{m.errors.title && <p className={styles.error} role="alert">{m.errors.title}</p>}
    <div className={styles.tags}><Select className={styles.statusSelect} data-status={m.values.status} size="sm" aria-label={t('status')} value={m.values.status} options={caseStatuses.map((value) => ({ value, label: t(value) }))} renderTrigger={() => <span className={styles.caseStatus}><span className={styles.statusDot} />{t(m.values.status)}</span>} onValueChange={(value) => { const status = caseStatuses.find((item) => item === value); if (status) m.update('status', status); }} />{m.values.tags.filter(Boolean).map((tag, i) => <span className={styles.tag} key={`${tag}-${i}`}>{tag}</span>)}</div>
    <DocumentBlock title={t('objective')} icon={IconNames.crosshair}><SectionMarkdownEditor references={references} label={t('objective')} disabled={locked} value={m.values.objective} onChange={(value) => m.update('objective', value)} /></DocumentBlock>
    <DocumentBlock title={t('setup')} icon={IconNames.fileText}><SectionMarkdownEditor references={references} label={t('setup')} disabled={locked} value={m.values.setup} onChange={(value) => m.update('setup', value)} /></DocumentBlock>
    <DocumentBlock title={t('steps')} icon={IconNames.list} action={<Button className={styles.addStep} size="sm" leadingIcon={<Icon name={IconNames.plus} size="sm" />} onClick={() => addAfter(m.values.steps.length - 1)}>{t('addStep')}</Button>}>{m.values.steps.map((step, index) => <div className={styles.step} key={stepKeys[index] ?? index}><span className={styles.stepNumber}>{index + 1}</span><Textarea className={styles.stepInput} rows={1} ref={(element) => { const key = stepKeys[index]; if (element) stepRefs.current.set(key, element); else stepRefs.current.delete(key); }} aria-label={`${t('step')} ${index + 1}`} disabled={locked} value={step} onChange={(event) => m.update('steps', m.values.steps.map((value, i) => i === index ? event.target.value : value))}
      onKeyDown={(event) => {
        if (locked || event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); addAfter(index); }
        else if (event.key === 'Backspace' && step === '' && m.values.steps.length > 1) { event.preventDefault(); remove(index); }
      }} /><div className={styles.stepActions}>
      {references && <StepReference target={() => stepRefs.current.get(stepKeys[index]) ?? null} options={references} value={step} disabled={locked} onChange={(value) => m.update('steps', m.values.steps.map((old, i) => i === index ? value : old))} />}
      <Button size="sm" variant="ghost" disabled={index === 0} aria-label={`${t('up')} ${t('step')} ${index + 1}`} onClick={() => reorder(index, -1)}><Icon name={IconNames.chevronUp} size="sm" /></Button><Button size="sm" variant="ghost" disabled={index === m.values.steps.length - 1} aria-label={`${t('down')} ${t('step')} ${index + 1}`} onClick={() => reorder(index, 1)}><Icon name={IconNames.chevronDown} size="sm" /></Button><Button size="sm" variant="ghost" disabled={m.values.steps.length === 1} aria-label={`${t('removeStep')} ${index + 1}`} onClick={() => remove(index)}><Icon name={IconNames.trash} size="sm" /></Button>
    </div></div>)}{m.errors.steps && <p className={styles.error}>{m.errors.steps}</p>}</DocumentBlock>
    <DocumentBlock title={t('expected')} icon={IconNames.checkCircle}><SectionMarkdownEditor references={references} label={t('expected')} disabled={locked} value={m.values.expected} onChange={(value) => m.update('expected', value)} /></DocumentBlock>
    <details className={styles.properties}><summary>{t('metadata')}</summary><div className={styles.metadataRow}><label>{t('systems')}<Input size="sm" aria-label={t('systems')} value={m.values.systems} onChange={(event) => m.update('systems', event.target.value)} /></label><label>{t('tags')}<Input size="sm" aria-label={t('tags')} value={m.values.tags.join(',')} onChange={(event) => m.update('tags', event.target.value.split(','))} /></label></div><label>{t('stableId')}<Input size="sm" readOnly value={m.selected.id} /></label></details>
  </fieldset></article>;
}

function StepReference({ target, ...props }: Omit<Parameters<typeof SourceReferenceButton>[0], 'target'> & { target: () => HTMLTextAreaElement | null }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => { ref.current = target(); });
  return <SourceReferenceButton {...props} target={ref} />;
}
