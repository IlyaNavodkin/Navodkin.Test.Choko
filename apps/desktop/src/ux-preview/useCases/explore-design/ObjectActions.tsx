import { Icon, IconNames, Menu, MenuItem, MenuSeparator, MenuTrigger } from '@codaa/ui';
import type { CaseOperation } from './caseOperations';
import { t } from './messages';
import styles from './Preview.module.css';
export function CreateActions({ blocked, onOperation }: { blocked: boolean; onOperation: (operation: CaseOperation) => void }) {
  return <Menu><MenuTrigger disabled={blocked} className={styles.menuButton} aria-label={t('createMenu')}><Icon name={IconNames.plus} size="sm" />{t('create')}</MenuTrigger><MenuItem onClick={() => onOperation('newCase')}>{t('newCase')}</MenuItem><MenuItem onClick={() => onOperation('newFolder')}>{t('newFolder')}</MenuItem></Menu>;
}
export function ObjectActions({ suite, blocked, onOperation }: { suite: boolean; blocked: boolean; onOperation: (operation: CaseOperation) => void }) {
  const operations: CaseOperation[] = suite ? ['renameSuite', 'duplicateSuite', 'moveSuite', 'deleteSuite'] : ['duplicateCase', 'renameCase', 'moveCase', 'deleteCase'];
  return <Menu><MenuTrigger disabled={blocked} className={styles.menuButton} aria-label={suite ? t('folderOperations') : t('more')}><Icon name={IconNames.ellipsis} size="sm" /></MenuTrigger>{operations.map((operation) => <MenuItem key={operation} tone={operation.startsWith('delete') ? 'danger' : 'default'} onClick={() => onOperation(operation)}>{t(operation)}</MenuItem>)}</Menu>;
}
