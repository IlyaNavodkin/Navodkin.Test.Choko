import { useState, type KeyboardEvent } from 'react';
import * as UI from '@codaa/ui';
import type { DemoId } from '../../registry/inventory';
import { DemoFrame, Flag, Range } from '../inspect-component/DemoControls';
import { t } from '../../../shared/i18n/messages';
export function rovingTabs(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'));
  const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
  event.preventDefault(); tabs[next]?.focus(); tabs[next]?.click();
}
export function NavigationDemo({ demo }: { demo: DemoId }) {
  const [value, setValue] = useState('cases');
  const [long, setLong] = useState(false);
  const [icon, setIcon] = useState(false);
  const [stretch, setStretch] = useState(false);
  const [large, setLarge] = useState(false);
  const [count, setCount] = useState(7);
  const [page, setPage] = useState(0);
  const options = [{ value: 'cases', label: long ? 'Очень длинное название списка тест-кейсов' : 'Кейсы' },{ value: 'runs', label: long ? 'Результаты последних ручных прогонов' : 'Прогоны' },{ value: 'disabled', label: t('disabled'), disabled: true }];
  let example;
  switch(demo) {
    case 'breadcrumbs': example = <UI.Breadcrumbs maxItems={3} items={Array.from({ length: long ? 7 : 3 }, (_, i) => ({ id: String(i), label: `Уровень ${i + 1}`, icon: icon ? <UI.Icon name={UI.IconNames.folder} /> : undefined, onClick: () => setValue(`Уровень ${i + 1}`) }))} />; break;
    case 'tabs': example = <><UI.Tabs aria-label={t('selection')} value={value} onValueChange={setValue} onKeyDown={rovingTabs}>{options.map(o => <UI.Tab id={`demo-tab-${o.value}`} key={o.value} value={o.value} disabled={o.disabled} tabIndex={value === o.value ? 0 : -1} aria-controls={`demo-panel-${o.value}`}>{o.label}</UI.Tab>)}</UI.Tabs><div role="tabpanel" id={`demo-panel-${value}`} aria-labelledby={`demo-tab-${value}`}>{value === 'cases' ? 'Локальные кейсы' : 'Локальные прогоны'}</div></>; break;
    case 'segmented': example = <><UI.SegmentedControl aria-label={t('selection')} value={value} onValueChange={setValue} size={large ? 'md' : 'sm'} stretch={stretch} options={options.map(o => ({ ...o, icon: icon ? <UI.Icon name={UI.IconNames.folder} /> : undefined }))} /><p>{value === 'cases' ? 'Локальные кейсы' : 'Локальные прогоны'}</p></>; break;
    case 'pagination-indicator': example = <><UI.PaginationIndicator totalPageCount={count} currentPage={Math.min(page, count - 1) + 1} /><UI.Button disabled={page === 0} onClick={() => setPage(p => p - 1)}>{t('previous')}</UI.Button><UI.Button disabled={page >= count - 1} onClick={() => setPage(p => p + 1)}>{t('next')}</UI.Button></>; break;
    default: throw Error(`Unknown navigation demo: ${demo}`);
  }
  return <DemoFrame output={demo === 'pagination-indicator' ? `${page + 1} / ${count}` : value} controls={<>
    {demo!=='pagination-indicator'&&<Flag label={t('longer')} value={long} onChange={setLong} />}{['breadcrumbs','segmented'].includes(demo)&&<Flag label={t('icon')} value={icon} onChange={setIcon} />}
    {demo === 'segmented' && <><Flag label="stretch" value={stretch} onChange={setStretch} /><Flag label="size md" value={large} onChange={setLarge} /></>}
    {demo === 'pagination-indicator' && <Range label="totalPageCount" min={1} max={12} value={count} onChange={v => { setCount(v); setPage(p => Math.min(p, v - 1)); }} />}
  </>}>{example}</DemoFrame>;
}
