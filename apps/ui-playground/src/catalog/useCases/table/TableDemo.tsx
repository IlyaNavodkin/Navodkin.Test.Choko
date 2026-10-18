import { useState } from 'react';
import * as UI from '@codaa/ui';
import { Choice, DemoFrame, Flag } from '../inspect-component/DemoControls';
import { t } from '../../../shared/i18n/messages';
import styles from '../inspect-component/Demo.module.css';
export type DemoRow = { id: string; title: string; status: string; disabled: boolean };
export const tableRows: DemoRow[] = Array.from({ length: 24 }, (_, i) => ({ id: `case-${i+1}`, title: `Кейс ${String(i+1).padStart(2,'0')} · Проверка формы`, status: i % 2 ? 'Draft' : 'Active', disabled: i === 2 }));
export function TableDemo() {
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [dense, setDense] = useState(false);
  const [sticky, setSticky] = useState(true);
  const [selectable, setSelectable] = useState(true);
  const [empty, setEmpty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pageSize, setPageSize] = useState('5');
  const [size, setSize] = useState<'xs'|'sm'|'md'>('sm');
  const [output, setOutput] = useState<string>();
  const rows = empty ? [] : tableRows.filter(r => r.title.toLowerCase().includes(query.toLowerCase()) && (!activeOnly || r.status === 'Active'));
  const filter = (query: string, active: boolean) => {
    setQuery(query); setActiveOnly(active);
    const visible = tableRows.filter(r => r.title.toLowerCase().includes(query.toLowerCase()) && (!active || r.status === 'Active'));
    setSelected(keys => keys.filter(k => visible.some(r => r.id === k)));
  };
  const columns: UI.TableColumn<DemoRow>[] = [{ id:'title', header:t('name'), sortable:true, sortValue:r=>r.title, render:r=>r.title },{ id:'status', header:'Status', sortable:true, sortValue:r=>r.status, render:r=><UI.Badge variant={r.status === 'Active' ? 'success' : 'neutral'}>{r.status}</UI.Badge> }];
  return <DemoFrame output={output ?? `${t('selection')}: ${selected.join(', ') || '0'}`} controls={<>
    <Choice label="pageSize" value={pageSize} options={['5','10']} onChange={setPageSize} /><Choice label="searchSize" value={size} options={['xs','sm','md']} onChange={setSize} />
    <Flag label="selectable" value={selectable} onChange={setSelectable} /><Flag label="dense" value={dense} onChange={setDense} /><Flag label="stickyHeader" value={sticky} onChange={setSticky} /><Flag label={t('emptyFixture')} value={empty} onChange={v => {setEmpty(v);setSelected([]);}} /><Flag label={t('loading')} value={loading} onChange={setLoading} /><Flag label={t('simulatedError')} value={error} onChange={setError} />
  </>}><div className={styles.wide}>
    <UI.SelectionBar label={`${t('selection')}: ${selected.length}`} meta={t('local')} onClear={() => setSelected([])} clearLabel={t('clear')} />
    <UI.DataTableToolbar searchValue={query} onSearchChange={v => filter(v, activeOnly)} searchSize={size} totalCount={rows.length} selectedCount={selected.length} onClearSelection={() => setSelected([])} actions={<UI.Button onClick={() => {filter('',false);setSelected([]);}}>{t('clear')}</UI.Button>}><UI.FilterChip active={activeOnly} tone="success" count={tableRows.filter(r=>r.status === 'Active').length} onClick={() => filter(query,!activeOnly)}>Active</UI.FilterChip></UI.DataTableToolbar>
    {loading ? <UI.LoadingState /> : error ? <UI.Alert variant="danger" action={<UI.Button onClick={() => setError(false)}>{t('retry')}</UI.Button>}>{t('error')}</UI.Alert> : <UI.Table key={pageSize} columns={columns} rows={rows} rowKey={r=>r.id} pageSize={Number(pageSize)} pageSizeOptions={[5,10]} selectedKeys={selected} onSelectedKeysChange={setSelected} rowDisabled={r=>r.disabled} selectable={selectable} dense={dense} stickyHeader={sticky} onRowClick={r=>setOutput(r.id)} empty={<UI.EmptyState title={t('empty')} />} />}
  </div></DemoFrame>;
}
