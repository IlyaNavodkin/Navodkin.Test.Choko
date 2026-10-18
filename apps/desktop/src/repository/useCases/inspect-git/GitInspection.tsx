import { Alert, Badge, Button, Checkbox, Modal, EmptyState, Input, LoadingState, Table, type TableColumn } from '@codaa/ui';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GitFile, GitSyncResult } from '../../api/contracts';
import { useSyncGit } from './useSyncGit';
import { useCommitGit } from './useCommitGit';
import { useInspectGit } from './useInspectGit';
import styles from './GitInspection.module.css';
export function GitInspection({ sessionId, blocked, onBusyChange, onPendingChange, onApplied, onFileCountChange }: { onApplied: (result: GitSyncResult) => Promise<void>; sessionId: string; blocked: boolean; onBusyChange: (busy: boolean) => void; onPendingChange: (pending: boolean) => void; onFileCountChange?: (count: number | null) => void }) {
  const { t } = useTranslation();
  const git = useInspectGit({ sessionId });
  const [search, setSearch] = useState('');
  const status = git.errorCode ? undefined : git.status;
  const [commitBusy, setCommitBusy] = useState(false);
  const [commitPending, setCommitPending] = useState(false);
  const sync = useSyncGit({ sessionId, status, blocked: blocked || commitBusy || git.isLoading, onApplied, refresh: git.refresh });
  useEffect(() => { onBusyChange(commitBusy || sync.busy); return () => onBusyChange(false); }, [commitBusy, sync.busy, onBusyChange]);
  useEffect(() => { onPendingChange(commitPending || sync.pending); return () => onPendingChange(false); }, [commitPending, sync.pending, onPendingChange]);
  useEffect(() => { onFileCountChange?.(status ? status.files.length : null); return () => onFileCountChange?.(null); }, [status, onFileCountChange]);
  const commit = useCommitGit({ sessionId, status, blocked: blocked || sync.busy || Boolean(status?.syncBlocked), invalidMessage: t('gitCommit.invalid'), onBusyChange: setCommitBusy, onPendingChange: setCommitPending, refresh: git.refresh });
  const staleDiff = git.diffErrorCode === 'INVALID_RESOURCE' || git.diffErrorCode === 'STALE_RESOURCE';
  const normalized = search.normalize('NFKC').trim().toLocaleLowerCase();
  const rows = status?.files.filter((file) => `${file.path} ${file.originalPath ?? ''}`.normalize('NFKC').toLocaleLowerCase().includes(normalized)) ?? [];
  const selected = status?.files.find((file) => file.fileId === git.fileId);
  const columns: TableColumn<GitFile>[] = [
    { id: 'commit', header: t('gitCommit.select'), render: (file) => <Checkbox checked={commit.form.values.fileIds.includes(file.fileId)} disabled={!commit.canCommit || commit.confirming || !file.committable || git.isLoading} aria-label={`${t('gitCommit.select')} ${file.path}`} onCheckedChange={(checked) => commit.select(file.fileId, checked === true)} /> },
    { id: 'path', header: t('gitView.files'), render: (file) => <Button className={styles.path} variant="ghost" size="sm" disabled={blocked || git.isLoading || file.submodule} onClick={() => git.select(file.fileId)} aria-pressed={git.fileId === file.fileId} title={file.submodule ? t('gitView.unsupported') : undefined}>{file.originalPath ? `${file.originalPath} → ` : ''}{file.path}</Button> },
    { id: 'index', header: t('gitView.index'), render: (file) => <code>{file.index}</code> },
    { id: 'worktree', header: t('gitView.worktree'), render: (file) => <code>{file.worktree}</code> },
  ];
  return <section className={styles.panel} aria-label={t('gitView.title')}>
    <div className={styles.toolbar}><h2>{t('gitView.title')}</h2><Button loading={git.isLoading} disabled={blocked || git.isLoading || commit.busy || commit.recovery || sync.pending || Boolean(sync.confirming)} onClick={git.refresh}>{t('gitView.refresh')}</Button></div>
    <p>{t('gitSync.policy')}</p>
    <div className={styles.toolbar}><Button disabled={!sync.canSync} onClick={() => sync.prepare('pull')}>{t('gitSync.pull')}</Button><Button disabled={!sync.canSync} onClick={() => sync.prepare('push')}>{t('gitSync.push')}</Button>{sync.abortToken ? <Button disabled={sync.pending || sync.recovery || blocked} onClick={() => sync.prepare('abort')}>{t('gitSync.abort')}</Button> : null}</div>
    {sync.errorCode ? <Alert variant="danger">{t(`repository.errors.${sync.errorCode}`)}</Alert> : null}
    {sync.conflict ? <Alert variant="danger">{t('gitSync.conflict')}<ul>{(sync.result?.unmergedPaths ?? status?.files.filter((file) => file.unmerged).map((file) => file.path) ?? []).map((path) => <li key={path}>{path}</li>)}</ul></Alert> : null}
    {sync.result && sync.result.outcome !== 'conflict' ? <Alert variant={sync.result.reloadRequired ? 'danger' : 'success'}>{t(sync.result.reloadRequired ? 'gitSync.reopen' : `gitSync.${sync.result.outcome}`)}</Alert> : null}
    <Modal closable={!sync.pending} open={sync.confirming !== null} title={t('gitSync.title')} closeOnBackdrop={false} onOpenChange={(open) => { if (!open) sync.cancel(); }} actions={<><Button disabled={sync.pending} onClick={sync.cancel}>{t('gitCommit.cancel')}</Button><Button variant="primary" loading={sync.pending} disabled={sync.pending} onClick={() => void sync.execute()}>{t('gitSync.confirm')}</Button></>}><p>{t(sync.confirming?.action === 'abort' ? 'gitSync.abortPolicy' : 'gitSync.policy')}</p><p>{status?.branch} → {status?.upstream}</p><strong>{sync.confirming?.action}</strong></Modal>
    {git.isLoading ? <LoadingState title={t('gitView.loading')} /> : null}
    {git.errorCode ? <Alert variant="danger">{t(`repository.errors.${git.errorCode}`)}</Alert> : null}
    {status ? <>
      <dl className={styles.metadata}><dt>{t('gitView.branch')}</dt><dd>{status.detached ? t('gitView.detached') : status.branch}{status.unborn ? <> · {t('gitView.unborn')}</> : null}{status.head ? <code> · {status.head.slice(0, 12)}</code> : null}</dd><dt>{t('gitView.upstream')}</dt><dd>{status.upstream ?? t('gitView.noUpstream')}</dd><dt>{t('gitView.ahead')} / {t('gitView.behind')}</dt><dd>{status.ahead ?? '—'} / {status.behind ?? '—'}</dd></dl>
      <p className={styles.muted}>{t('gitView.localRefs')}</p>
      {status.filtersDisabled ? <Alert variant="warning">{t('gitView.filters')}</Alert> : null}
      {status.files.some((file) => file.unmerged) ? <Alert variant="danger">{t('gitView.conflict')}</Alert> : null}
      <Input aria-label={t('gitView.search')} placeholder={t('gitView.search')} value={search} onChange={(event) => setSearch(event.target.value)} />
      <p className={styles.muted}>{t('gitView.legend')}</p>
      <p>{t('gitCommit.savedVersions')}</p>
      <label htmlFor="git-commit-message">{t('gitCommit.message')}</label><Input id="git-commit-message" value={commit.form.values.message} disabled={commit.pending || commit.confirming || commit.recovery || sync.busy} onChange={(event) => commit.form.setFieldValue('message', event.target.value)} aria-invalid={Boolean(commit.form.errors.message)} />
      {commit.form.errors.message || commit.form.errors.fileIds ? <Alert variant="warning">{t('gitCommit.invalid')}</Alert> : null}
      <div className={styles.toolbar}><Button variant="primary" disabled={!commit.canCommit || git.isLoading} onClick={commit.prepare}>{t('gitCommit.create')}</Button><Button disabled={commit.pending || commit.recovery || sync.busy} onClick={commit.clear}>{t('gitCommit.clear')}</Button></div>
      {commit.errorCode ? <Alert variant="danger">{t(`repository.errors.${commit.errorCode}`)}</Alert> : null}
      {commit.result ? <Alert variant={commit.recovery ? 'danger' : 'success'}>{t(commit.recovery ? 'gitCommit.recovery' : 'gitCommit.success')} <code>{commit.result.head}</code>{commit.result.recoveryIndex ? <code> .git/{commit.result.recoveryIndex}</code> : null}</Alert> : null}
      <Table key={search} dense columns={columns} rows={rows} pageSize={25} pageSizeOptions={[25, 50, 100]} rowKey={(file) => file.fileId} empty={<EmptyState title={t(status.files.length ? 'gitView.noMatches' : 'gitView.clean')} />} />
    </> : null}
    <Modal open={commit.confirming} title={t('gitCommit.confirmTitle')} closeOnBackdrop={false} onOpenChange={(open) => { if (!open) commit.cancel(); }} actions={<><Button disabled={commit.pending} onClick={commit.cancel}>{t('gitCommit.cancel')}</Button><Button variant="primary" loading={commit.pending} disabled={commit.pending} onClick={() => void commit.commit()}>{t('gitCommit.confirm')}</Button></>}>
      <p>{t('gitCommit.savedVersions')}</p><p>{commit.form.values.message}</p><ul>{status?.files.filter((file) => commit.form.values.fileIds.includes(file.fileId)).map((file) => <li key={file.fileId}>{file.originalPath ? `${file.originalPath} → ` : ''}{file.path}</li>)}</ul>
    </Modal>
    {selected ? <section className={styles.diff} aria-label={`Diff · ${selected.path}`}><h3>{selected.path} <Badge>{selected.index}{selected.worktree}</Badge></h3>
      {git.isDiffLoading ? <LoadingState title={t('gitView.loadingDiff')} /> : null}
      {git.diffErrorCode ? <Alert variant="danger">{staleDiff ? t('gitView.stale') : t(`repository.errors.${git.diffErrorCode}`)} <Button disabled={commit.busy || commit.recovery || sync.pending || Boolean(sync.confirming)} onClick={staleDiff ? git.refresh : git.retryDiff}>{t(staleDiff ? 'gitView.refresh' : 'gitView.retry')}</Button></Alert> : null}
      {git.diff && !git.isDiffLoading && !git.diffErrorCode ? <>
        {git.diff.filtersDisabled && !status?.filtersDisabled ? <Alert variant="warning">{t('gitView.filters')}</Alert> : null}
        {git.diff.binary ? <Alert variant="info">{t('gitView.binary')}</Alert> : null}
        {git.diff.staged !== null ? <section><h4>{t('gitView.index')}</h4><pre>{git.diff.staged || t('gitView.emptyDiff')}</pre></section> : null}
        {git.diff.workingTree !== null ? <section><h4>{t('gitView.worktree')}</h4><pre>{git.diff.workingTree || t('gitView.emptyDiff')}</pre></section> : null}
        {git.diff.untrackedContent !== null ? <section><h4>{t('gitView.untracked')}</h4><pre>{git.diff.untrackedContent}</pre></section> : null}
      </> : null}
    </section> : <EmptyState title={t('gitView.selectFile')} />}
  </section>;
}
