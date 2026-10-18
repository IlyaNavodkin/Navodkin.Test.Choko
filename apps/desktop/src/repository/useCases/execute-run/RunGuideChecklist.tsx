import { Button, Input, Markdown, Progress, Select } from '@codaa/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { RunCaseEdit, RunCaseResource } from '../../api/contracts';
import type { UseZodFormResult } from '../../../shared/forms/useZodForm';
import type { UseRunGuideResult } from './useRunGuide';
import styles from './RunWorkflow.module.css';
type Props = { guide: UseRunGuideResult; document: RunCaseResource; values: RunCaseEdit; setFieldValue: UseZodFormResult<RunCaseEdit>['setFieldValue']; children: ReactNode };
const states = ['none', 'pass', 'fail'] as const;
export function RunGuideChecklist({ guide, document, values, setFieldValue, children }: Props) {
  const { t } = useTranslation();
  const item = guide.item;
  const value = item ? values[item.section][item.index] : undefined;
  const title = item ? t(item.section === 'setup' ? 'repository.setup' : item.section === 'steps' ? 'repository.steps' : 'repository.acceptance') : t('runWorkflow.record');
  const snapshot = document.document.snapshot?.model;
  const setupBody = item?.section === 'setup' ? snapshot?.setup[item.index]?.body : undefined;
  const change = (next: RunCaseEdit['steps'][number]) => { if (item) setFieldValue(item.section, values[item.section].map((entry, index) => index === item.index ? next : entry)); };
  return <div className={styles.guide}>
    <p className={styles.muted}>{t('runWorkflow.checkProgress', { checked: guide.checked, total: guide.total })}</p>
    <Progress value={guide.total ? guide.checked / guide.total : 0} label={t('runWorkflow.checkProgressLabel')} />
    {snapshot?.objective ? <Markdown className={styles.markup} content={snapshot.objective} /> : null}
    {!snapshot ? <p className={styles.muted}>{t('runWorkflow.legacySnapshot')}</p> : null}
    <div className={styles.toolbar}>
      <Button type="button" disabled={guide.cursor === 0} onClick={guide.previous}>{t('runWorkflow.previousItem')}</Button>
      <span>{guide.isRecord ? t('runWorkflow.record') : t('runWorkflow.itemPosition', { current: guide.cursor + 1, total: guide.total })}</span>
      <Button type="button" disabled={guide.isRecord} onClick={guide.next}>{t('runWorkflow.nextItem')}</Button>
      {!guide.isRecord ? <Button type="button" onClick={guide.record}>{t('runWorkflow.goRecord')}</Button> : null}
    </div>
    {item && value ? <section className={styles.item} aria-label={`${title} ${item.index + 1}`}>
      <h3>{title} · {item.index + 1}</h3><p>{item.text}</p>
      {setupBody ? <Markdown className={styles.markup} content={setupBody} /> : null}
      <Select aria-label={`${title} ${item.index + 1} · ${t('runEditor.check')}`} value={value.state} options={states.map((state) => ({ value: state, label: t(`repository.checkState.${state}`) }))} onValueChange={(state) => { const next = states.find((value) => value === state); if (next) change({ ...value, state: next, failNote: next === 'fail' ? value.failNote : '' }); }} />
      {value.state === 'fail' ? <Input aria-label={`${title} ${item.index + 1} · ${t('runEditor.failNote')}`} value={value.failNote} onChange={(event) => change({ ...value, failNote: event.target.value })} /> : null}
    </section> : children}
  </div>;
}
