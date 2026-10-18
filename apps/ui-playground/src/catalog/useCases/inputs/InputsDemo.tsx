import { useState } from 'react';
import * as UI from '@codaa/ui';
import type { DemoId } from '../../registry/inventory';
import { Choice, DemoFrame, Flag, Range, TextControl } from '../inspect-component/DemoControls';
import { t } from '../../../shared/i18n/messages';
export function InputsDemo({ demo }: { demo: DemoId }) {
  const [value, setValue] = useState('');
  const [checked, setChecked] = useState(false);
  const [number, setNumber] = useState(40);
  const [color, setColor] = useState(() => getComputedStyle(document.documentElement).getPropertyValue('--app-accent-bg').trim());
  const [disabled, setDisabled] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [icon, setIcon] = useState(true);
  const [size, setSize] = useState<'xs' | 'sm' | 'md'>('md');
  const [type, setType] = useState<'text' | 'password' | 'email'>('text');
  const [rows, setRows] = useState(4);
  const [debounce, setDebounce] = useState(true);
  const [stepFive, setStepFive] = useState(false);
  const [percent, setPercent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [open, setOpen] = useState(false);
  const [match, setMatch] = useState(true);
  let example;
  switch (demo) {
    case 'inputs': example = <UI.Input aria-label={t('name')} value={value} onChange={e => setValue(e.target.value)} size={size} type={type} disabled={disabled} readOnly={readOnly} leadingIcon={icon ? <UI.Icon name={UI.IconNames.search} /> : undefined} trailingAction={<UI.IconButton aria-label={t('clear')} disabled={disabled || readOnly} onClick={() => setValue('')}><UI.Icon name={UI.IconNames.x} /></UI.IconButton>} />; break;
    case 'textarea': example = <UI.Textarea aria-label={t('text')} value={value} rows={rows} maxLength={240} disabled={disabled} readOnly={readOnly} onChange={e => setValue(e.target.value)} />; break;
    case 'search-input': example = <><UI.SearchInput aria-label={t('filter')} value={value} onValueChange={setValue} debounceMs={debounce ? 300 : 0} size={size} disabled={disabled} trailing={icon ? <UI.Icon name={UI.IconNames.search} /> : null} /><ul>{['Button','Input','Table','Modal'].filter(v => v.toLowerCase().includes(value.toLowerCase())).map(v => <li key={v}>{v}</li>)}</ul></>; break;
    case 'checkbox': example = <UI.Checkbox checked={checked} onCheckedChange={setChecked} disabled={disabled}>{t('selection')}</UI.Checkbox>; break;
    case 'toggle': example = <UI.Toggle checked={checked} onCheckedChange={setChecked} disabled={disabled} aria-label={t('active')} />; break;
    case 'slider': example = <UI.Slider label={t('size')} value={number} min={0} max={100} step={stepFive ? 5 : 1} disabled={disabled} formatValue={v => percent ? `${v}%` : v} onValueChange={setNumber} />; break;
    case 'color-picker': example = <UI.ColorPicker label={t('change')} value={color} onValueChange={setColor} disabled={disabled} />; break;
    case 'select': example = <UI.Select aria-label={t('selection')} placeholder={t('selection')} value={value} onValueChange={setValue} size={size} disabled={disabled} loading={loading} open={open} onOpenChange={setOpen} matchAnchorWidth={match} options={empty ? [] : [{ value: 'draft', label: 'Draft' },{ value: 'active', label: 'Active' },{ value: 'disabled', label: t('disabled'), disabled: true }]} />; break;
    default: throw Error(`Unknown input demo: ${demo}`);
  }
  return <DemoFrame output={demo === 'checkbox' || demo === 'toggle' ? String(checked) : demo === 'slider' ? String(number) : demo === 'color-picker' ? color : value} controls={<>
    <Flag label={t('disabled')} value={disabled} onChange={setDisabled} />
    {['inputs','textarea'].includes(demo) && <Flag label={t('readOnly')} value={readOnly} onChange={setReadOnly} />}
    {['inputs','textarea','select'].includes(demo) && <TextControl label="value" value={value} onChange={setValue} />}
    {['inputs','select','search-input'].includes(demo) && <Choice label="size" value={size} options={['xs','sm','md']} onChange={setSize} />}
    {demo === 'inputs' && <><Choice label="type" value={type} options={['text','password','email']} onChange={setType} /><Flag label="leadingIcon" value={icon} onChange={setIcon} /></>}
    {demo === 'textarea' && <Range label="rows" value={rows} min={2} max={10} onChange={setRows} />}
    {demo === 'search-input' && <Flag label="debounce 300 ms" value={debounce} onChange={setDebounce} />}
    {demo === 'slider' && <><Flag label="step = 5" value={stepFive} onChange={setStepFive} /><Flag label="formatValue %" value={percent} onChange={setPercent} /></>}
    {demo === 'select' && <><Flag label={t('loading')} value={loading} onChange={setLoading} /><Flag label={t('emptyFixture')} value={empty} onChange={setEmpty} /><Flag label="open" value={open} onChange={setOpen} /><Flag label="matchAnchorWidth" value={match} onChange={setMatch} /></>}
  </>}>{example}</DemoFrame>;
}
