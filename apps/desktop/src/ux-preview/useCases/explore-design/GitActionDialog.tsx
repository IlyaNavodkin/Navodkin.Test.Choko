import actionStyles from './PrimaryAction.module.css';
import { useState } from 'react';
import { Button, IconNames, Modal } from '@codaa/ui';
import { DialogHeading, DialogNotice } from './DialogVisuals';
import { PathList } from './CaseOperationDialog';
import { t } from './messages';
import type { CommitPlan, UseExploreDesignResult } from './useExploreDesign';
import styles from './Dialogs.module.css';
export type GitAction = { type: 'commit'; plan: CommitPlan } | { type: 'pull' | 'push' | 'abort' };
export function GitActionDialog({ action, model: m, onClose, onAbort }: { action: GitAction | null; model: UseExploreDesignResult; onClose: () => void; onAbort: () => void }) {
  const [error, setError] = useState(''); if (!action) return null;
  const titles = { commit: t('commitConfirm'), pull: t('pullConfirm'), push: t('pushConfirm'), abort: t('abortConfirm') };
  async function confirm() {
    if (!action) return;
    const success = action.type === 'commit' ? await m.commit(action.plan) : await m.sync(action.type);
    if (success) { if (action.type === 'abort') onAbort(); onClose(); } else setError(t('stateError'));
  }
  return <Modal open maxWidth={680} title={<DialogHeading title={titles[action.type]} icon={action.type === 'abort' ? IconNames.ban : IconNames.gitBranch} tone={action.type === 'abort' ? 'danger' : 'info'} />} closable={!m.busy} onOpenChange={(open) => { if (!open) onClose(); }} actions={<><Button disabled={m.busy} onClick={onClose}>{t('cancel')}</Button><Button className={action.type === 'abort' ? undefined : actionStyles.primaryAction} variant={action.type === 'abort' ? 'danger' : 'primary'} loading={m.busy} onClick={confirm}>{t(action.type === 'commit' ? 'commit' : action.type)}</Button></>}><div className={styles.form}>
    <DialogNotice>{t(action.type === 'abort' ? 'abortHint' : action.type === 'commit' ? 'savedOnly' : 'syncHint')}</DialogNotice>
    {action.type === 'commit' && <><h3>{t('commitMessage')}</h3><p>{action.plan.message}</p><h3>{t('exactSelection')} ({action.plan.paths.length})</h3><PathList paths={action.plan.paths} /></>}
    {action.type === 'abort' && <><h3>{t('conflictedFiles')}</h3><PathList paths={['cases/Оплата картой/PAY-042.md', 'cases/Оплата картой.md']} /></>}
    {error && <DialogNotice tone="danger" alert>{error}<br />{m.notice}</DialogNotice>}
  </div></Modal>;
}
