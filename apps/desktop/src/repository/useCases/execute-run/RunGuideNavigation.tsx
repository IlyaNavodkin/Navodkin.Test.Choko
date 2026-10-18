import { Button } from '@codaa/ui';
import { useTranslation } from 'react-i18next';
import type { UseRunNavigationResult } from './useRunNavigation';
import styles from './RunWorkflow.module.css';
export function RunGuideNavigation({ navigation, total, blocked }: { navigation: UseRunNavigationResult; total: number; blocked: boolean }) {
  const { t } = useTranslation();
  return <nav className={styles.toolbar} aria-label={t('runWorkflow.navigation')}>
    <Button disabled={blocked} onClick={navigation.exit}>{t('runWorkflow.grid')}</Button>
    <span>{t('runWorkflow.casePosition', { current: navigation.index + 1, total })}</span>
    <Button disabled={blocked || navigation.index <= 0} onClick={() => navigation.move(-1)}>{t('runWorkflow.previousCase')}</Button>
    <Button disabled={blocked || navigation.index < 0 || navigation.index >= total - 1} onClick={() => navigation.move(1)}>{t('runWorkflow.nextCase')}</Button>
  </nav>;
}
