import { useState } from 'react';
import * as UI from '@codaa/ui';
import type { DemoId } from '../../registry/inventory';
import { Choice, DemoFrame, Flag, TextControl } from '../inspect-component/DemoControls';
import { t } from '../../../shared/i18n/messages';
import styles from '../inspect-component/Demo.module.css';
export function ActionsDemo({ demo }: { demo: DemoId }) {
  const [text, setText] = useState(t('action'));
  const [disabled, setDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [icon, setIcon] = useState(true);
  const [active, setActive] = useState(false);
  const [size, setSize] = useState<'sm' | 'md'>('md');
  const [variant, setVariant] = useState<UI.ButtonVariant>('primary');
  const [controlVariant, setControlVariant] = useState<NonNullable<UI.ControlButtonProps['variant']>>('neutral');
  const [appearance, setAppearance] = useState<NonNullable<UI.ControlButtonProps['appearance']>>('solid');
  const [shape, setShape] = useState<NonNullable<UI.ControlButtonProps['shape']>>('square');
  const [elevated, setElevated] = useState(false);
  const [iconVariant, setIconVariant] = useState<NonNullable<UI.IconButtonProps['variant']>>('default');
  const [activeVariant, setActiveVariant] = useState<'danger' | 'accent'>('accent');
  const [sectionVariant, setSectionVariant] = useState<'accent' | 'success' | 'danger'>('accent');
  const [compact, setCompact] = useState(true);
  const [rightDisabled, setRightDisabled] = useState(false);
  const [align, setAlign] = useState<'start' | 'end'>('start');
  const [primary, setPrimary] = useState(true);
  const [count, setCount] = useState(0);
  const [rightCount, setRightCount] = useState(0);
  const click = () => { setCount(v => v + 1); setActive(v => !v); };
  const symbol = <UI.Icon name={UI.IconNames.plus} />;
  const menuItems = <><UI.MenuLabel>{t('secondary')}</UI.MenuLabel><UI.MenuItem onClick={() => setRightCount(v => v + 1)}>{t('secondary')}</UI.MenuItem><UI.MenuSeparator /><UI.MenuItem disabled>{t('disabled')}</UI.MenuItem></>;
  const menu = <UI.Menu align={align}><UI.MenuTrigger disabled={disabled}>{t('open')}</UI.MenuTrigger>{menuItems}</UI.Menu>;
  let example;
  switch (demo) {
    case 'buttons': example = <UI.Button variant={variant} size={size} leadingIcon={icon ? symbol : undefined} disabled={disabled} loading={loading} onClick={click}>{text}</UI.Button>; break;
    case 'button-group': example = <UI.ButtonGroup><UI.ButtonGroupLabel>{text}</UI.ButtonGroupLabel><UI.Button size={size} disabled={disabled} onClick={click}>{t('action')}</UI.Button><UI.ButtonGroupMenu>{compact ? menu : <UI.Button onClick={() => setRightCount(v => v + 1)}>{t('secondary')}</UI.Button>}</UI.ButtonGroupMenu></UI.ButtonGroup>; break;
    case 'control-buttons': example = <UI.ControlButton variant={controlVariant} appearance={appearance} shape={shape} size={size} active={active} elevated={elevated} disabled={disabled} onClick={click}>{icon ? symbol : text}</UI.ControlButton>; break;
    case 'icon-buttons': example = <UI.IconButton variant={iconVariant} size={size} active={active} activeVariant={activeVariant} aria-label={text} tooltipText={text} disabled={disabled} onClick={click}>{symbol}</UI.IconButton>; break;
    case 'section-button': example = <UI.SectionButton variant={sectionVariant} size={compact ? 'compact' : 'control'} active={active} disabled={disabled} rightContent={symbol} rightLabel={t('secondary')} rightActive={rightCount % 2 === 1} rightDisabled={rightDisabled} onClick={click} onRightClick={() => setRightCount(v => v + 1)}>{text}</UI.SectionButton>; break;
    case 'split-button': example = <UI.SplitButton variant={primary ? 'primary' : 'secondary'} size={size} disabled={disabled} loading={loading} icon={icon ? symbol : undefined} menuAlign={align} onAction={click} menu={menuItems}>{text}</UI.SplitButton>; break;
    default: throw Error(`Unknown actions demo: ${demo}`);
  }
  return <DemoFrame output={`${t('action')}: ${count} · ${t('secondary')}: ${rightCount}`} controls={<>
    <TextControl value={text} onChange={setText} /><Flag label={t('disabled')} value={disabled} onChange={setDisabled} />
    {demo !== 'section-button' && <Choice label="size" value={size} options={['sm','md']} onChange={setSize} />}
    {!['button-group','icon-buttons','section-button'].includes(demo) && <Flag label={t('icon')} value={icon} onChange={setIcon} />}
    {demo === 'buttons' && <Choice label="variant" value={variant} options={['primary','secondary','danger','ghost','ghost-danger','ghost-success']} onChange={setVariant} />}
    {(demo === 'buttons' || demo === 'split-button') && <Flag label={t('loading')} value={loading} onChange={setLoading} />}
    {demo === 'control-buttons' && <><Choice label="variant" value={controlVariant} options={['success','danger','neutral','leave']} onChange={setControlVariant} /><Choice label="appearance" value={appearance} options={['solid','utility','ghost']} onChange={setAppearance} /><Choice label="shape" value={shape} options={['square','round','pill']} onChange={setShape} /><Flag label="elevated" value={elevated} onChange={setElevated} /></>}
    {demo === 'icon-buttons' && <><Choice label="variant" value={iconVariant} options={['default','ghost','brand','danger','success']} onChange={setIconVariant} /><Choice label="activeVariant" value={activeVariant} options={['danger','accent']} onChange={setActiveVariant} /></>}
    {demo === 'section-button' && <><Choice label="variant" value={sectionVariant} options={['accent','success','danger']} onChange={setSectionVariant} /><Flag label="rightDisabled" value={rightDisabled} onChange={setRightDisabled} /></>}
    {(demo === 'section-button' || demo === 'button-group') && <Flag label="compact" value={compact} onChange={setCompact} />}
    {demo === 'split-button' && <Flag label="primary" value={primary} onChange={setPrimary} />}
    {(demo === 'split-button' || demo === 'button-group') && <Choice label="menuAlign" value={align} options={['start','end']} onChange={setAlign} />}
    {['control-buttons','icon-buttons','section-button'].includes(demo) && <Flag label={t('active')} value={active} onChange={setActive} />}
  </>}><div className={styles.row}>{example}</div></DemoFrame>;
}
