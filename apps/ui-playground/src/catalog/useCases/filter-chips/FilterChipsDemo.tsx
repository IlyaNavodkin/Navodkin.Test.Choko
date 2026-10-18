import { useState } from 'react';
import * as UI from '@codaa/ui';
import { Choice, DemoFrame, Flag } from '../inspect-component/DemoControls';
import { tableRows } from '../table/TableDemo';
import { t } from '../../../shared/i18n/messages';
export function FilterChipsDemo() {
  const [selected, setSelected] = useState<string>();
  const [tone, setTone] = useState<UI.FilterChipTone>('brand');
  const [dot, setDot] = useState(true);
  const [icon, setIcon] = useState(false);
  const [many, setMany] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const filtered = tableRows.filter(r => selected === undefined || r.status === selected);
  return <DemoFrame output={`${t('count')}: ${filtered.length}`} controls={<><Choice label="tone" value={tone} options={['neutral','success','brand','warning','danger']} onChange={setTone} /><Flag label="dot" value={dot} onChange={setDot} /><Flag label={t('icon')} value={icon} onChange={setIcon} /><Flag label="5 chips" value={many} onChange={setMany} /><Flag label={t('disabled')} value={disabled} onChange={setDisabled} /></>}>
    <UI.FilterChipGroup>{(many ? ['Active','Draft','Blocked','Archived','Disabled'] : ['Active','Draft']).map(status => <UI.FilterChip key={status} active={selected === status} tone={tone} dot={dot} icon={icon ? <UI.Icon name={UI.IconNames.folder} /> : undefined} disabled={disabled || status === 'Disabled'} count={tableRows.filter(r=>r.status === status).length} onClick={() => setSelected(v=>v === status ? undefined : status)}>{status}</UI.FilterChip>)}</UI.FilterChipGroup>
    <ul>{filtered.slice(0,5).map(r=><li key={r.id}>{r.title} · {r.status}</li>)}</ul>
  </DemoFrame>;
}
