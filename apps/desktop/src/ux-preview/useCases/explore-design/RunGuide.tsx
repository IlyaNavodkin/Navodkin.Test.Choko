import actionStyles from './PrimaryAction.module.css';
import { useState, type ReactNode } from 'react';
import { Button, Icon, IconNames, Input, Progress, Textarea, type IconName } from '@codaa/ui';
import { resultStates, t, type PreviewMessageKey } from './messages';
import { DocumentBlock, ResultDot } from './Shared';
import type { UsePreviewRunsResult } from './usePreviewRuns';
import styles from './Preview.module.css';
type GuideStage = 'setup' | 'steps' | 'verification' | 'conclusion';
const stages: { id: GuideStage; label: PreviewMessageKey }[] = [{ id: 'setup', label: 'setup' }, { id: 'steps', label: 'steps' }, { id: 'verification', label: 'verification' }, { id: 'conclusion', label: 'conclusion' }];
function SnapshotSection({ title, icon, open, children }: { title: string; icon: IconName; open: boolean; children: ReactNode }) {
  return <details className={styles.snapshotSection} open={open}><summary><Icon name={icon} />{title}<Icon name={IconNames.chevronDown} size="sm" /></summary><div>{children}</div></details>;
}
export function RunGuide({ model: m, reportActions }: { model: UsePreviewRunsResult; reportActions?: ReactNode }) {
  const [stage, setStage] = useState<GuideStage>('steps');
  const item = m.run.snapshots[m.index]; const readonly = m.run.closed || m.saving || m.blocked;
  const completed = m.run.results.filter((result) => !['not_run', 'in_progress'].includes(result.result)).length;
  return <div className={styles.guide}>
    <aside className={`${styles.sidebar} ${styles.guideSidebar}`}>
      <section className={styles.guideRunCard}><h2><Icon name={IconNames.play} />{m.run.name}</h2><Progress label={t('completed')} value={completed / m.run.snapshots.length} /><p><span>{t('case')} {m.index + 1} / {m.run.snapshots.length}</span><span>{Math.round(completed / m.run.snapshots.length * 100)}%</span></p></section>
      <div className={styles.snapshotList}>{m.run.snapshots.map((snapshot, index) => <button key={snapshot.id} className={`${styles.snapshotItem} ${index === m.index ? styles.selected : ''}`} aria-pressed={index === m.index} onClick={() => { if (index !== m.index) m.startGuide(index); }} disabled={m.saving}><Icon name={IconNames.fileText} /><span><small>{snapshot.displayId}</small>{snapshot.title}</span><ResultDot mode="icon" value={index === m.index ? m.draft.result : m.run.results[index].result} /></button>)}</div>
      <Button className={styles.backToOverview} variant="ghost" leadingIcon={<Icon name={IconNames.arrowLeft} />} onClick={() => m.endGuide()} disabled={m.saving}>{t('backOverview')}</Button>
    </aside>
    <main className={styles.guideMain}>
      <div className={styles.guideScroll}><article className={styles.guideArticle}>
        {reportActions}
        <div className={styles.guideHeading}><span className={styles.breadcrumb}>{m.run.name} <span>/</span> {item.displayId}</span><span className={styles.guideMode}><Icon name={IconNames.list} size="sm" />{t('guideSteps')}</span><h1>{item.title}</h1><p className={styles.snapshotCaption}><Icon name={IconNames.fileText} /><strong>{t('snapshot')}</strong><span>{t('snapshotHint')}</span></p></div>
        <nav className={styles.stageNav} aria-label={t('guideSteps')}>{stages.map((value, index) => <button key={value.id} aria-current={stage === value.id ? 'step' : undefined} onClick={() => setStage(value.id)}><span>{index + 1}</span>{t(value.label)}</button>)}</nav>
        {m.notice && <p role="status" className={styles.notice}>{m.notice}</p>}
        <SnapshotSection title={t('objective')} icon={IconNames.crosshair} open={stage === 'setup'}><p>{item.objective}</p></SnapshotSection>
        <SnapshotSection title={t('setup')} icon={IconNames.fileText} open={stage === 'setup'}><p>{item.setup}</p></SnapshotSection>
        <SnapshotSection title={t('steps')} icon={IconNames.list} open={stage === 'steps'}>
          <div className={styles.guideChecklist}>{item.steps.map((step, index) => <div className={styles.guideStep} data-check={m.draft.checks[index]} key={index}>
            <div className={styles.guideStepRow}><span className={styles.stepNumber}>{index + 1}</span><span className={styles.checkState} data-check={m.draft.checks[index]} aria-hidden="true"><Icon name={m.draft.checks[index] === 'pass' ? IconNames.check : m.draft.checks[index] === 'fail' ? IconNames.x : IconNames.circle} size="sm" /></span><p>{step}</p>
              <div className={styles.checks}>{(['pass', 'fail', 'none'] as const).map((state) => <Button className={styles.checkButton} key={state} size="sm" variant="ghost" disabled={readonly} data-check={state} aria-pressed={m.draft.checks[index] === state} aria-label={`${t(state === 'none' ? 'checkNone' : state === 'pass' ? 'checkPass' : 'checkFail')} · ${t('step')} ${index + 1}`} onClick={() => m.setDraft({ ...m.draft, checks: m.draft.checks.map((old, i) => i === index ? state : old) })}>{state === 'none' ? '—' : t(state)}</Button>)}</div>
            </div>
            {m.draft.checks[index] === 'fail' && <label className={styles.failExplanation}>{t('failNote')}<Textarea rows={1} aria-label={`${t('failNote')} · ${t('step')} ${index + 1}`} placeholder={t('failNote')} value={m.draft.failNotes[index]} disabled={readonly} onChange={(event) => m.setDraft({ ...m.draft, failNotes: m.draft.failNotes.map((old, i) => i === index ? event.target.value : old) })} /></label>}
          </div>)}</div>
        </SnapshotSection>
        {stage === 'verification' && <SnapshotSection title={t('expected')} icon={IconNames.checkCircle} open><p>{item.expected}</p></SnapshotSection>}
        <DocumentBlock title={t('caseResult')} icon={IconNames.checkCircle}>
          <fieldset className={styles.resultChoices} disabled={readonly} aria-label={t('result')}><legend className={styles.srOnly}>{t('result')}</legend>{resultStates.map((value) => <label key={value} data-result={value}><input type="radio" name="run-result" value={value} checked={m.draft.result === value} onChange={() => m.setDraft({ ...m.draft, result: value })} /><span>{t(value)}</span></label>)}</fieldset>
          <div className={styles.resultMetadata}><label><Icon name={IconNames.user} size="sm" /><span>{t('tester')}</span><Input size="sm" aria-label={t('tester')} value={m.draft.tester} disabled={readonly} onChange={(event) => m.setDraft({ ...m.draft, tester: event.target.value })} /></label><label><Icon name={IconNames.fileText} size="sm" /><span>{t('resultNotes')}</span><Textarea rows={1} aria-label={t('resultNotes')} placeholder={t('resultNotes')} value={m.draft.notes} disabled={readonly} onChange={(event) => m.setDraft({ ...m.draft, notes: event.target.value })} /></label></div>
        </DocumentBlock>
      </article></div>
      <footer className={styles.guideFooter}><span className={m.dirty ? styles.dirty : styles.muted} role="status">{m.saving ? t('saving') : m.dirty ? t('dirty') : t('clean')}</span><Button variant="ghost" disabled={readonly || !m.dirty} onClick={() => m.saveResult(false)}>{t('save')}</Button><Button disabled={m.saving} onClick={() => m.endGuide()} leadingIcon={<Icon name={IconNames.arrowLeft} />}>{t('backOverview')}</Button><Button className={actionStyles.primaryAction} variant="primary" loading={m.saving} disabled={readonly} onClick={() => m.saveResult(true)}>{t('saveNext')}<Icon name={IconNames.arrowRight} /></Button></footer>
    </main>
  </div>;
}
