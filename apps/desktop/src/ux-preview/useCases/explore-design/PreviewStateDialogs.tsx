import actionStyles from './PrimaryAction.module.css';
import { useState } from 'react';
import { Button, Checkbox, Icon, IconNames, Modal } from '@codaa/ui';
import { DialogHeading, DialogNotice } from './DialogVisuals';
import { PathList } from './CaseOperationDialog';
import { getLayoutState, layoutStates, type LayoutStateId } from './layoutStates';
import { t } from './messages';
import type { UsePreviewNavigationResult } from './usePreviewNavigation';
import styles from './Dialogs.module.css';
export function NavigationDialog({ model: m }: { model: UsePreviewNavigationResult }) {
  return <Modal open={m.open} title={<DialogHeading title={t('dirtyTitle')} icon={IconNames.triangleAlert} tone="warning" />} maxWidth={640} closable={!m.busy} onOpenChange={(open) => { if (!open) m.cancel(); }} actions={<><Button disabled={m.busy} onClick={m.cancel}>{t('continue')}</Button><Button variant="ghost-danger" disabled={m.busy} onClick={m.discardAndContinue}>{t('discard')}</Button><Button className={actionStyles.primaryAction} variant="primary" loading={m.busy} onClick={m.saveAndContinue}>{t('saveAndContinue')}</Button></>}><div className={styles.form}><p>{t('dirtyHint')}</p>{m.error && <DialogNotice tone="danger" alert>{m.error}</DialogNotice>}</div></Modal>;
}
export function LayoutStatesDialog({ state, onSelect, onClose, onRestart }: { state: LayoutStateId; onSelect: (state: LayoutStateId) => void; onClose: () => void; onRestart: () => void }) {
  const groups = [...new Set(layoutStates.map((item) => item.group))];
  return <Modal open title={<DialogHeading title={t('layoutStates')} icon={IconNames.slidersHorizontal} />} maxWidth={760} onOpenChange={(open) => { if (!open) onClose(); }} actions={<><Button onClick={onRestart}>{t('restartDemo')}</Button><Button onClick={onClose}>{t('close')}</Button></>}><div className={`${styles.form} ${styles.groups}`}>{groups.map((group) => <section key={group}><h3>{group}</h3>{layoutStates.filter((item) => item.group === group).map((item) => <Button key={item.id} size="sm" variant={item.id === state ? 'primary' : 'secondary'} aria-pressed={item.id === state} title={item.detail} onClick={() => onSelect(item.id)}>{item.label}</Button>)}</section>)}</div></Modal>;
}
export const initializationPaths = ['.casewright/config.yaml', '.casewright/.gitignore', '.casewright/runs/.gitkeep'];
export function InitializeDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [fail, setFail] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function confirm() { if (busy) return; setBusy(true); await new Promise<void>((resolve) => setTimeout(resolve, 450)); if (fail) setError(t('initFailed')); else { onSuccess(); onClose(); } setBusy(false); }
  return <Modal open title={<DialogHeading title={t('initTitle')} icon={IconNames.folderOpen} />} maxWidth={640} closable={!busy} onOpenChange={(open) => { if (!open) onClose(); }} actions={<><Button disabled={busy} onClick={onClose}>{t('cancel')}</Button><Button className={actionStyles.primaryAction} variant="primary" loading={busy} onClick={confirm}>{t('initConfirm')}</Button></>}><div className={styles.form}><strong>PayFlow QA</strong><p>{t('initHint')}</p><h3>{t('initFiles')}</h3><PathList paths={initializationPaths} /><Checkbox checked={fail} disabled={busy} onCheckedChange={setFail}>{t('simulateFailure')}</Checkbox>{error && <DialogNotice tone="danger" alert>{error}</DialogNotice>}</div></Modal>;
}
export function StateBanner({ state, onReset, onInit, onReload, onRecovery, onAbort }: { state: LayoutStateId; onReset: () => void; onInit: () => void; onReload: () => void; onRecovery: () => void; onAbort: () => void }) {
  if (state === 'normal' || state === 'empty') return null;
  const item = getLayoutState(state);
  const tone = ['loading', 'readonly', 'runLegacy', 'unborn'].includes(state) ? 'info' : ['external', 'watcherFailed', 'trust', 'missingId', 'suiteStale', 'suitePartial'].includes(state) ? 'warning' : 'danger';
  return <section className={styles.stateBanner} data-tone={tone} aria-label={item.label}><Icon name={tone === 'info' ? IconNames.info : IconNames.triangleAlert} /><div><strong>{item.label}</strong><p>{item.detail}</p>{(state === 'indexRecovery' || state === 'suiteRecovery') && <code>.testoritto-{state === 'indexRecovery' ? 'index' : 'suite'}-demo/journal.json</code>}</div><div className={styles.bannerActions}>
    {state === 'config' ? <Button size="sm" onClick={onInit}>{t('init')}</Button> : state === 'external' ? <><Button size="sm" onClick={onReset}>{t('externalKeep')}</Button><Button size="sm" onClick={onReload}>{t('externalReload')}</Button></> : state === 'conflict' || state === 'abortFailed' ? <Button size="sm" onClick={onAbort}>{t('abort')}</Button> : state === 'suiteRecovery' ? <Button size="sm" onClick={onRecovery}>{t('recoveryView')}</Button> : state === 'trust' ? <Button size="sm" onClick={onReset}>{t('trustConfirm')}</Button> : ['missingGit', 'loading', 'error', 'watcherFailed'].includes(state) ? <Button size="sm" onClick={onReset}>{t('retry')}</Button> : null}
  </div></section>;
}
