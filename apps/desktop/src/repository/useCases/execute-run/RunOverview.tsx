import { Badge, Button, EmptyState, Input, Progress, Select, Table, type TableColumn } from '@codaa/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { filterRunRows, runResults, summarizeRun, type RunCatalogEntry, type RunRow } from './runWorkflow';
import styles from './RunWorkflow.module.css';
export type RunOverviewProps = { run: RunCatalogEntry; blocked: boolean; onOpen: (resourceId: string) => void; onGuide: (resourceId?: string) => void };
export function RunOverview({ run, blocked, onOpen, onGuide }: RunOverviewProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<'all' | RunRow['result']>('all');
  const summary = summarizeRun(run.cases);
  const rows = useMemo(() => filterRunRows(run.cases, search, result), [run.cases, search, result]);
  const positions = new Map(run.cases.map((row, index) => [row.resourceId, index + 1]));
  const columns: TableColumn<RunRow>[] = [
    { id: 'position', header: '#', render: (row) => positions.get(row.resourceId) },
    { id: 'case', header: t('repository.case'), render: (row) => <Button className={styles.caseLink} variant="ghost" size="sm" disabled={blocked} aria-label={t('runWorkflow.openRow', { position: positions.get(row.resourceId)! })} onClick={() => onOpen(row.resourceId)}>{row.displayId} · {row.title || t('repository.untitled')}</Button> },
    { id: 'result', header: t('repository.result'), render: (row) => <Badge variant={row.result === 'fail' ? 'danger' : row.result === 'pass' ? 'success' : 'neutral'}>{t(`repository.runResult.${row.result}`)}</Badge> },
    { id: 'guide', header: t('runWorkflow.guide'), render: (row) => <Button size="sm" disabled={blocked} aria-label={t('runWorkflow.executeRow', { position: positions.get(row.resourceId)! })} onClick={() => onGuide(row.resourceId)}>{t('runWorkflow.execute')}</Button> },
  ];
  return <section className={styles.overview} aria-label={t('runWorkflow.overview')}>
    <div className={styles.toolbar}><h3>{t('runWorkflow.overview')}</h3><Button variant="primary" disabled={blocked || !run.cases.length} onClick={() => onGuide()}>{t('runWorkflow.start')}</Button></div>
    <div aria-live="polite">{t('runWorkflow.progress', { completed: summary.completed, total: summary.total })}</div>
    <Progress value={summary.total ? summary.completed / summary.total : 0} label={t('runWorkflow.progressLabel')} />
    <div className={styles.counts}>{runResults.map((result) => <span key={result}>{t(`repository.runResult.${result}`)}: <strong>{summary.counts[result]}</strong></span>)}</div>
    <div className={styles.filters}><Input aria-label={t('runWorkflow.search')} placeholder={t('runWorkflow.search')} value={search} onChange={(event) => setSearch(event.target.value)} /><Select aria-label={t('runWorkflow.resultFilter')} value={result} options={[{ value: 'all', label: t('runWorkflow.allResults') }, ...runResults.map((value) => ({ value, label: t(`repository.runResult.${value}`) }))]} onValueChange={(value) => { if (value === 'all' || runResults.some((result) => result === value)) setResult(value as typeof result); }} /></div>
    <div className={styles.table}><Table key={`${search}:${result}`} columns={columns} rows={rows} rowKey={(row) => row.resourceId} pageSize={25} pageSizeOptions={[25, 50, 100]} dense empty={<EmptyState title={t(run.cases.length ? 'runWorkflow.noMatches' : 'runWorkflow.empty')} />} /></div>
  </section>;
}
