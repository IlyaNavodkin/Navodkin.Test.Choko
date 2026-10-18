import type { ReactNode } from 'react';
import { Icon, IconNames, type IconName } from '@codaa/ui';
import styles from './Dialogs.module.css';
export function DialogHeading({ title, icon, tone = 'info' }: { title: string; icon: IconName; tone?: 'danger' | 'warning' | 'info' }) {
  return <span className={styles.dialogHeading} data-tone={tone}><Icon name={icon} /><span>{title}</span></span>;
}
export function DialogNotice({ children, tone = 'info', alert = false }: { children: ReactNode; tone?: 'danger' | 'warning' | 'info'; alert?: boolean }) {
  return <div className={styles.dialogNotice} data-tone={tone} role={alert ? 'alert' : undefined}><Icon name={tone === 'info' ? IconNames.info : IconNames.triangleAlert} /><div>{children}</div></div>;
}
