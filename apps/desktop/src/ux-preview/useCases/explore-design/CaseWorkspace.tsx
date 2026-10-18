import { Button, Icon, IconNames, Input, Select } from '@codaa/ui';
import type { CaseOperation } from './caseOperations';
import { CaseReading } from './CaseReading';
import type { GlossaryEntry } from '../manage-glossary/types';
import { caseStatuses, t } from './messages';
import { CreateActions, ObjectActions } from './ObjectActions';
import type { UsePreviewCaseEditorResult } from './usePreviewCaseEditor';
import { DocumentBlock, SaveBar } from './Shared';
import styles from './Preview.module.css';
export function CaseWorkspace({ model: m, workspace, onOperation, entries = [], onOpenEntry = () => undefined }: { entries?: GlossaryEntry[]; onOpenEntry?: (id: string) => void; model: UsePreviewCaseEditorResult; workspace: string; onOperation: (operation: CaseOperation) => void }) {
  return <div className={styles.workspace}>
    <aside className={styles.sidebar}><div className={styles.sideTools}><Input size="sm" aria-label={t('search')} placeholder={t('search')} leadingIcon={<Icon name={IconNames.search} size="sm" />} value={m.filters.search} onChange={(event) => m.setFilters({ ...m.filters, search: event.target.value })} />
      <div className={styles.filterRow}><Select size="xs" aria-label={t('status')} value={m.filters.status} options={[{ value: '', label: t('allStatus') }, ...caseStatuses.map((value) => ({ value, label: t(value) }))]} onValueChange={(value) => m.setFilters({ ...m.filters, status: value })} /><Select size="xs" aria-label={t('allTags')} value={m.filters.tag} options={[{ value: '', label: t('allTags') }, ...[...new Set(m.cases.flatMap((item) => item.tags))].filter(Boolean).map((value) => ({ value, label: value }))]} onValueChange={(value) => m.setFilters({ ...m.filters, tag: value })} /></div>
      <div className={styles.sideHeading}><span className={styles.workspaceName}>{t('workspace')}</span><CreateActions blocked={m.blocked || m.saving} onOperation={onOperation} /></div>
    </div>
      <div className={styles.tree}><button className={`${styles.folder} ${styles.workspaceRoot}`} aria-label={`${t('allCases')} ${m.cases.length}`} onClick={() => { m.setFilters({ search: '', status: '', tag: '', folder: '' }); if (m.selected) m.selectCase(m.selected.id); }}><Icon name={IconNames.chevronDown} size="sm" /><Icon name={IconNames.folderOpen} size="md" />{workspace}<small>{m.cases.length}</small></button>
        {m.folders.filter((folder) => !m.filters.folder || folder === m.filters.folder).map((folder) => <section className={styles.treeFolder} key={folder}><button className={`${styles.folder} ${m.folder === folder ? styles.selected : ''}`} onClick={() => m.selectFolder(folder)}><Icon name={IconNames.chevronDown} size="sm" /><Icon name={IconNames.folderOpen} size="md" />{folder}<small>{m.cases.filter((item) => item.folder === folder).length}</small></button>
          {m.visibleCases.filter((item) => item.folder === folder).map((item) => <button key={item.id} className={`${styles.treeItem} ${m.selected?.id === item.id && !m.folder ? styles.selected : ''}`} aria-pressed={m.selected?.id === item.id && !m.folder} onClick={() => m.selectCase(item.id)}><Icon name={IconNames.fileText} size="sm" /><span><small>{item.displayId}</small>{item.title}</span></button>)}</section>)}
        {m.visibleCases.length === 0 && <div className={styles.empty}><p>{t(m.cases.length ? 'noResults' : 'noCases')}</p><Button size="sm" onClick={() => m.setFilters({ search: '', status: '', tag: '', folder: '' })}>{t('resetFilters')}</Button></div>}
      </div>
    </aside>
    <main className={styles.detail}>
      <SaveBar breadcrumb={`${workspace} / ${m.folder ?? m.selected?.folder ?? ''}`} dirty={m.dirty} saving={m.saving} blocked={m.blocked} saved={m.saved} onSave={m.save} menu={<ObjectActions suite={Boolean(m.folder)} blocked={m.blocked || m.saving || (!m.folder && !m.selected)} onOperation={onOperation} />} />
      {m.notice && <p className={styles.notice} role="status">{m.notice}</p>}
      {m.folder ? <article className={styles.document}><span className={styles.eyebrow}>{t('folderNote')}</span><h1>{m.folder}</h1><DocumentBlock title={t('notes')} icon={IconNames.folder}><p>{t('folderCopy')}</p></DocumentBlock><p className={styles.muted}>{t('folderTip')}</p></article> : <CaseReading key={m.selected?.id} model={m} entries={entries} onOpenEntry={onOpenEntry} />}
    </main>
  </div>;
}
