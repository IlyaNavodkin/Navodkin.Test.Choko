import { useRef, useState } from 'react';
import * as UI from '@codaa/ui';
import type { DemoId } from '../../registry/inventory';
import { Choice, DemoFrame, Flag, Range, TextControl } from '../inspect-component/DemoControls';
import { t } from '../../../shared/i18n/messages';
import styles from '../inspect-component/Demo.module.css';
export const boundSize=(value:number)=>Math.max(100,Math.min(340,value));
export function LayoutDemo({demo}:{demo:DemoId}) {
  const [text,setText]=useState(t('title'));
  const [open,setOpen]=useState(false);
  const [active,setActive]=useState(false);
  const [many,setMany]=useState(true);
  const [variant,setVariant]=useState<UI.AccentRailVariant>('brand');
  const [as,setAs]=useState<'div'|'article'|'button'>('button');
  const [axis,setAxis]=useState<'horizontal'|'vertical'>('horizontal');
  const [side,setSide]=useState<'left'|'right'>('right');
  const [size,setSize]=useState(200);
  const [resizable,setResizable]=useState(true);
  const [step,setStep]=useState(8);
  const [output,setOutput]=useState<string>();
  const origin=useRef(size);
  const action=<UI.Button onClick={()=>setOutput(t('success'))}>{t('action')}</UI.Button>;
  let example;
  switch(demo) {
    case 'accordion':example=<UI.Accordion open={open} onOpenChange={setOpen} title={text} right={<UI.Badge>3</UI.Badge>}>{action}<p>{t('description')}</p></UI.Accordion>;break;
    case 'accent-rail':example=as==='button'?<UI.AccentRail as="button" active={active} variant={variant} left={<UI.Icon name={UI.IconNames.folder}/>} right={<UI.Badge>3</UI.Badge>} onClick={()=>{setActive(v=>!v);setOutput(t('action'));}}>{text}</UI.AccentRail>:<UI.AccentRail as={as} active={active} variant={variant} left={<UI.Icon name={UI.IconNames.folder}/>} right={action}>{text}</UI.AccentRail>;break;
    case 'divider':example=<div className={styles.row}><span>{text}</span><UI.Divider orientation={axis} style={axis==='vertical'?{height:60}:undefined}/><span>{t('description')}</span></div>;break;
    case 'floating-toolbar':example=<UI.FloatingToolbar collapsed={!open} onCollapsedChange={v=>setOpen(!v)}>{open&&<><UI.FloatingToolbarGroup label={text}>{action}</UI.FloatingToolbarGroup>{many&&<UI.FloatingToolbarGroup label={t('secondary')}><UI.Button onClick={()=>setOutput(t('secondary'))}>{t('secondary')}</UI.Button></UI.FloatingToolbarGroup>}</>}</UI.FloatingToolbar>;break;
    case 'group-label':example=<UI.GroupLabel label={text}>{many?action:<span>{t('description')}</span>}</UI.GroupLabel>;break;
    case 'resize-handle':example=<div className={styles.bounded}><div className={styles.pane} style={{position:'relative',width:axis==='horizontal'?size:undefined,height:axis==='vertical'?size:undefined}}>{size}px<UI.ResizeHandle aria-label={t('size')} axis={axis} side={side} keyboardStep={step} onResizeStart={()=>{origin.current=size;}} onResize={delta=>setSize(boundSize(origin.current+delta))} onResizeStep={delta=>setSize(v=>boundSize(v+delta))}/></div></div>;break;
    case 'split-pane':example=<div className={styles.bounded}><UI.SplitPane key={`${axis}-${size}`} orientation={axis} defaultSize={size} minSize={100} maxSize={340} resizable={resizable} firstLabel={t('size')}><div className={styles.pane}>{text}</div><div className={styles.pane}>{t('description')}</div></UI.SplitPane></div>;break;
    default:throw Error(`Unknown layout demo: ${demo}`);
  }
  return <DemoFrame output={output} controls={<><TextControl value={text} onChange={setText}/>
    {['accordion','floating-toolbar'].includes(demo)&&<Flag label={t('expanded')} value={open} onChange={setOpen}/>}
    {['group-label','floating-toolbar'].includes(demo)&&<Flag label={t('secondary')} value={many} onChange={setMany}/>}
    {demo==='accent-rail'&&<><Choice label="as" value={as} options={['div','article','button']} onChange={setAs}/><Choice label="variant" value={variant} options={['brand','success','warning','danger','neutral']} onChange={setVariant}/><Flag label={t('active')} value={active} onChange={setActive}/></>}
    {['divider','split-pane','resize-handle'].includes(demo)&&<Choice label="orientation / axis" value={axis} options={['horizontal','vertical']} onChange={setAxis}/>}
    {demo==='resize-handle'&&<><Choice label="side" value={side} options={['left','right']} onChange={setSide}/><Range label="keyboardStep" value={step} min={1} max={32} onChange={setStep}/></>}
    {demo==='split-pane'&&<Flag label="resizable" value={resizable} onChange={setResizable}/>}
    {['split-pane','resize-handle'].includes(demo)&&<Range label="size (100…340)" value={size} min={100} max={340} onChange={setSize}/>}
  </>}>{example}</DemoFrame>;
}
