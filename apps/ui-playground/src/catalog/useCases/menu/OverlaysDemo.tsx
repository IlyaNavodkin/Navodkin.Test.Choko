import { useState } from 'react';
import * as UI from '@codaa/ui';
import type { DemoId } from '../../registry/inventory';
import { Choice, DemoFrame, Flag, Range, TextControl } from '../inspect-component/DemoControls';
import { useDemoSession } from '../inspect-component/useDemoSession';
import { t } from '../../../shared/i18n/messages';
import styles from '../inspect-component/Demo.module.css';
export function OverlaysDemo({ demo }: { demo: DemoId }) {
  const [open, setOpen] = useState(false);
  const [controlled, setControlled] = useState(true);
  const [align, setAlign] = useState<UI.PopoverAlign>('start');
  const [placement, setPlacement] = useState<UI.PopoverPlacement>('bottom');
  const [width, setWidth] = useState(246);
  const [offset, setOffset] = useState(8);
  const [icon, setIcon] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [second, setSecond] = useState(true);
  const [full, setFull] = useState(false);
  const [backdrop, setBackdrop] = useState(true);
  const [failure, setFailure] = useState(false);
  const [loading, setLoading] = useState(false);
  const [danger, setDanger] = useState(false);
  const [match, setMatch] = useState(false);
  const [text, setText] = useState(t('title'));
  const [error, setError] = useState<string>();
  const { output, report, later } = useDemoSession();
  const trigger = icon ? <UI.Icon name={UI.IconNames.plus} /> : t('open');
  const confirm = (retrySuccess = false) => {
    if (loading) return;
    setLoading(true); setError(undefined);
    later(() => {
      try { if (failure && !retrySuccess) throw Error(t('error')); report(t('saved')); setOpen(false); }
      catch (e) { setError(e instanceof Error ? e.message : t('error')); }
      finally { setLoading(false); }
    }, 800);
  };
  let example;
  switch (demo) {
    case 'menu': example = <UI.Menu key={String(controlled)} open={controlled ? open : undefined} onOpenChange={setOpen} align={align === 'end' ? 'end' : 'start'} width={width}>
      <UI.MenuTrigger aria-label={t('open')} disabled={disabled}>{trigger}</UI.MenuTrigger><UI.MenuLabel>{text}</UI.MenuLabel>
      <UI.MenuItem icon={icon ? <UI.Icon name={UI.IconNames.plus} /> : undefined} trailing="↵" onClick={() => report(t('action'))}>{t('action')}</UI.MenuItem><UI.MenuItem disabled>{t('disabled')}</UI.MenuItem>
      {second && <><UI.MenuSeparator /><UI.MenuLabel>{t('secondary')}</UI.MenuLabel><UI.MenuItem tone="danger" onClick={() => report(t('remove'))}>{t('remove')}</UI.MenuItem></>}
    </UI.Menu>; break;
    case 'popover': example = <UI.Popover open={open} onOpenChange={setOpen} placement={placement} align={align} offset={offset} matchAnchorWidth={match}><UI.PopoverTrigger disabled={disabled} aria-label={t('open')}>{trigger}</UI.PopoverTrigger><UI.PopoverContent><UI.Input aria-label={t('text')} value={text} onChange={e => { setText(e.target.value); report(e.target.value); }} /><UI.Button onClick={() => { report(text); setOpen(false); }}>{t('submit')}</UI.Button></UI.PopoverContent></UI.Popover>; break;
    case 'modal': example = <><UI.Button onClick={() => setOpen(true)}>{t('open')}</UI.Button><UI.Modal open={open} onOpenChange={setOpen} title={text} fullScreen={full} closeOnBackdrop={backdrop} maxWidth={width + 240} toolbar={<UI.Badge>{t('local')}</UI.Badge>} actions={<UI.Button onClick={() => { report(t('saved')); setOpen(false); }}>{t('submit')}</UI.Button>}><UI.Input aria-label={t('name')} value={text} onChange={e => setText(e.target.value)} /><p>{t('description')}</p></UI.Modal></>; break;
    case 'confirm': example = <><UI.Button onClick={() => setOpen(true)}>{t('open')}</UI.Button><UI.ConfirmDialog open={open} onOpenChange={setOpen} title={text} description={<>{t('description')}{error && <span role="alert" className={styles.confirmError}>{error} <UI.Button loading={loading} onClick={() => confirm(true)}>{t('retry')}</UI.Button></span>}</>} tone={danger ? 'danger' : 'default'} loading={loading} onConfirm={() => confirm()} confirmLabel={t('submit')} /></>; break;
    default: throw Error(`Unknown overlay demo: ${demo}`);
  }
  return <DemoFrame output={output} controls={<><TextControl value={text} onChange={setText} />
    <Flag label="open" value={open} onChange={setOpen} />
    {demo === 'menu' && <><Flag label="controlled" value={controlled} onChange={setControlled} /><Flag label={t('secondary')} value={second} onChange={setSecond} /></>}
    {['menu','popover'].includes(demo) && <><Flag label={t('icon')} value={icon} onChange={setIcon} /><Flag label={t('disabled')} value={disabled} onChange={setDisabled} /><Choice label="align" value={align} options={demo === 'menu' ? ['start','end'] : ['start','center','end']} onChange={setAlign} /></>}
    {demo === 'popover' && <><Choice label="placement" value={placement} options={['top','bottom']} onChange={setPlacement} /><Range label="offset" value={offset} max={32} onChange={setOffset} /><Flag label="matchAnchorWidth" value={match} onChange={setMatch} /></>}
    {['menu','modal'].includes(demo) && <Range label="width" value={width} min={200} max={360} onChange={setWidth} />}
    {demo === 'modal' && <><Flag label="fullScreen" value={full} onChange={setFull} /><Flag label="closeOnBackdrop" value={backdrop} onChange={setBackdrop} /></>}
    {demo === 'confirm' && <><Flag label={t('simulatedError')} value={failure} onChange={setFailure} /><Flag label="tone danger" value={danger} onChange={setDanger} /></>}
  </>}>{example}</DemoFrame>;
}
