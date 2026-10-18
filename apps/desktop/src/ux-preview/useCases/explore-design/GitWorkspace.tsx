import actionStyles from './PrimaryAction.module.css';
import { Button, Checkbox, Icon, IconNames, Textarea } from '@codaa/ui';
import { repositories } from './fixtures';
import { t } from './messages';
import type { UseExploreDesignResult } from './useExploreDesign';
import type { GitAction } from './GitActionDialog';
import styles from './Preview.module.css';
function DiffPane({ lines, counterpart, side }: { lines: string[]; counterpart: string[]; side: 'before' | 'after' }) {
  return <section className={styles.diffPane} aria-label={t(side)}><h3>{t(side)}</h3><div className={styles.codeScroll}><div className={styles.codeLines}>{lines.length ? lines.map((line, index) => <div className={`${styles.diffLine} ${counterpart[index] !== line ? side === 'before' ? styles.removed : styles.added : ''}`} key={index}><span>{index + 1}</span><code>{line || ' '}</code></div>) : <p className={styles.empty}>—</p>}</div></div></section>;
}
export function GitWorkspace({ model: m, onAction }: { model: UseExploreDesignResult; onAction: (action: GitAction) => void }) {
  const file = m.files.find((item) => item.path === m.activeFile);
  return <div className={styles.gitWorkspace}>
    <header className={styles.gitHeader}><div><h1>{t('changes')}</h1><div className={styles.gitBranchMeta}><span><Icon name={IconNames.box} size="sm" />{repositories[m.repository ?? 0].name}</span><span><Icon name={IconNames.gitBranch} size="sm" />{m.state === 'detached' ? 'HEAD · a83f62c' : 'main'}</span><span className={styles.upstream}><Icon name={IconNames.link} size="sm" />{m.state === 'noUpstream' || m.state === 'unborn' ? '—' : 'origin/main'}</span><span className={styles.syncCounts}><span>↑ {m.ahead}</span><span>↓ {m.behind}</span></span></div></div>
      <div className={styles.gitSync}><Button disabled={m.busy || !m.behind || !m.canSync} onClick={() => onAction({ type: 'pull' })} leadingIcon={<Icon name={IconNames.download} />}>{t('pull')}</Button><Button className={actionStyles.primaryAction} variant="primary" disabled={m.busy || !m.ahead || !m.canSync} onClick={() => onAction({ type: 'push' })} leadingIcon={<Icon name={IconNames.cloudUpload} />}>{t('push')} {m.ahead > 0 && <span className={styles.pushCount}>{m.ahead}</span>}</Button></div>
    </header>
    {m.notice && <p className={styles.notice} role="status">{m.notice}</p>}
    <div className={styles.gitBody}>
      <aside className={styles.gitLeft}><section className={styles.gitFiles}><div className={styles.sideHeading}><h2><Icon name={IconNames.fileText} />{t('files')} <span className={styles.muted}>· {m.files.length}</span></h2></div><div className={styles.changedFiles}>{m.files.map((item) => <div key={item.path} className={`${styles.changedFile} ${m.activeFile === item.path ? styles.selected : ''}`}><Checkbox aria-label={item.path} checked={m.selectedFiles.includes(item.path)} disabled={m.busy || (!m.canCommit && !m.canSync)} onCheckedChange={(selected) => m.toggleFile(item.path, selected)} /><button onClick={() => m.setActiveFile(item.path)}><Icon name={IconNames.fileText} /><span><strong>{item.path.split('/').at(-1)}</strong><small>{item.path}</small></span><span className={styles.fileKind} title={t(item.kind)}>{item.kind === 'untracked' ? 'A' : 'M'}</span></button></div>)}{m.files.length === 0 && <p className={styles.empty}>{t('noChanges')}</p>}</div></section>
        <section className={styles.commit}><h2>{t('commitMessage')}</h2><Textarea rows={4} aria-label={t('commitMessage')} placeholder={t('commitMessage')} value={m.message} disabled={m.busy || !m.canCommit} onChange={(event) => m.setMessage(event.target.value)} /><p className={styles.muted}>{t('selected')}: {m.selectedFiles.length}</p><Button className={actionStyles.primaryAction} variant="primary" loading={m.busy} disabled={m.busy || !m.canCommit || !m.message.trim() || m.selectedFiles.length === 0} leadingIcon={<Icon name={IconNames.gitBranch} />} onClick={() => onAction({ type: 'commit', plan: { paths: [...m.selectedFiles], message: m.message } })}>{t('commit')} ({m.selectedFiles.length})</Button></section>
      </aside>
      <main className={styles.diff}><header className={styles.diffHeading}><h2><Icon name={IconNames.fileText} />{file?.path ?? t('noDiff')}</h2>{file && <span className={styles.diffScope}>{t(file.kind === 'staged' ? 'inIndex' : 'workingCopy')}</span>}</header>{file ? <div className={styles.diffColumns}><DiffPane lines={file.before} counterpart={file.after} side="before" /><DiffPane lines={file.after} counterpart={file.before} side="after" /></div> : <p className={styles.empty}>{t('noDiff')}</p>}</main>
    </div>
    <p className={styles.gitHelp}><Icon name={IconNames.info} size="sm" />{t('separateActions')}</p>
  </div>;
}
