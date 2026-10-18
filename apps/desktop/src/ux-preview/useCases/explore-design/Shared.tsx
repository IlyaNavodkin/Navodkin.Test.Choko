import actionStyles from './PrimaryAction.module.css';
import type { ReactNode } from 'react';
import { Button, Icon, IconNames, StatusPill, type IconName } from '@codaa/ui';
import { t } from './messages';
import type { ResultState } from './types';
import styles from './Preview.module.css';
export function DocumentBlock({ title, icon, children, action }: { title: string; icon: IconName; children: ReactNode; action?: ReactNode }) { return <section className={styles.block}><header className={styles.blockHeader}><h2><Icon name={icon} size="md" />{title}</h2>{action}</header>{children}</section>; }
export function SaveBar({ breadcrumb, dirty, saving, saved = false, blocked = false, onSave, menu }: { breadcrumb: string; dirty: boolean; saving: boolean; saved?: boolean; blocked?: boolean; onSave: () => void; menu?: ReactNode }) {
  return <div className={styles.savebar}><span className={styles.breadcrumb}>{breadcrumb}</span><span className={dirty ? styles.dirty : styles.muted} role="status">{saving ? t('saving') : dirty ? t('dirty') : saved ? t('saved') : t('clean')}</span><Button className={`${styles.saveButton} ${actionStyles.primaryAction}`} variant="primary" disabled={!dirty || saving || blocked} loading={saving} leadingIcon={<Icon name={IconNames.save} size="md" />} onClick={onSave}>{t('save')}</Button>{menu}</div>;
}
export function ResultDot({ value, mode = 'dot' }: { value: ResultState; mode?: 'dot' | 'icon' }) {
  const icon = value === 'pass' ? IconNames.check : value === 'fail' ? IconNames.x : value === 'blocked' ? IconNames.ban : value === 'in_progress' ? IconNames.clock : value === 'skipped' ? IconNames.minus : IconNames.circle;
  return <span className={`${styles.resultDot} ${mode === 'icon' ? styles.resultIcon : ''}`} data-result={value} aria-label={t(value)} title={t(value)}>{mode === 'icon' && <Icon name={icon} size="sm" />}</span>;
}
export function ResultPill({ value }: { value: ResultState }) { return <StatusPill className={styles.resultPill} size="md" icon={<ResultDot value={value} />} tone={value === 'pass' ? 'success' : value === 'fail' ? 'danger' : value === 'blocked' ? 'warning' : value === 'in_progress' ? 'info' : 'neutral'}>{t(value)}</StatusPill>; }
