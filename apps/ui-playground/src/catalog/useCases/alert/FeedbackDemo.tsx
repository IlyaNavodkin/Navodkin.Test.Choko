import { useState } from 'react';
import * as UI from '@codaa/ui';
import type { DemoId } from '../../registry/inventory';
import { Choice, DemoFrame, Flag, Range, TextControl } from '../inspect-component/DemoControls';
import { t } from '../../../shared/i18n/messages';
export function FeedbackDemo({demo}:{demo:DemoId}) {
  const [text,setText]=useState(t('title'));
  const [tone,setTone]=useState<UI.StatusPillTone>(demo==='alert'?'info':demo==='progress'?'brand':'neutral');
  const [size,setSize]=useState<'sm'|'md'|'lg'>('md');
  const [icon,setIcon]=useState(false);
  const [pulse,setPulse]=useState(false);
  const [action,setAction]=useState(true);
  const [loading,setLoading]=useState(true);
  const [row,setRow]=useState(false);
  const [width,setWidth]=useState(180);
  const [height,setHeight]=useState(20);
  const [count,setCount]=useState(3);
  const [value,setValue]=useState(0.5);
  const [output,setOutput]=useState<string>();
  const symbol=icon?<UI.Icon name={UI.IconNames.plus}/>:undefined;
  const badgeTone=tone==='info'?'brand':tone;
  let example;
  switch(demo) {
    case 'alert': example=<UI.Alert variant={tone==='brand'||tone==='neutral'?'info':tone} icon={symbol} action={action?<UI.Button onClick={()=>setOutput(t('success'))}>{t('action')}</UI.Button>:undefined}>{text}</UI.Alert>;break;
    case 'badge': example=<UI.Badge variant={badgeTone}>{text}</UI.Badge>;break;
    case 'dot-chip': example=<UI.DotChip color="var(--app-accent-bg)" leading={symbol} size={size==='lg'?'md':size}>{text}</UI.DotChip>;break;
    case 'status-pill': example=<UI.StatusPill tone={tone} icon={symbol} pulse={pulse} size={size==='lg'?'md':size}>{text}</UI.StatusPill>;break;
    case 'empty-state': example=<UI.EmptyState title={text} description={t('description')} direction={row?'row':'column'} icon={icon?UI.IconNames.folder:undefined} iconSize={size}/>;break;
    case 'loading-state': example=loading?<UI.LoadingState size={size} title={text} description={t('description')}/>:<UI.Badge variant="success">{t('success')}</UI.Badge>;break;
    case 'skeleton': example=loading?<>{Array.from({length:count},(_,i)=><UI.Skeleton key={i} width={width} height={height}/>)}</>:<p>{text}</p>;break;
    case 'spinner': example=loading?<UI.Spinner size={size} aria-label={text}/>:<p>{text}</p>;break;
    case 'progress': example=<><UI.Progress label={text} value={value} tone={tone==='neutral'||tone==='info'?'brand':tone}/><output>{Math.round(Math.max(0,Math.min(1,value))*100)}%</output></>;break;
    default: throw Error(`Unknown feedback demo: ${demo}`);
  }
  return <DemoFrame output={output} controls={<><TextControl value={text} onChange={setText}/>
    {['alert','badge','status-pill','progress'].includes(demo)&&<Choice label="tone / variant" value={tone} options={demo==='alert'?['info','success','warning','danger']:demo==='progress'?['brand','warning','success','danger']:demo==='badge'?['neutral','brand','success','warning','danger']:['neutral','info','success','warning','danger','brand']} onChange={setTone}/>}
    {['dot-chip','status-pill','empty-state','loading-state','spinner'].includes(demo)&&<Choice label="size" value={size} options={['dot-chip','status-pill'].includes(demo)?['sm','md']:['sm','md','lg']} onChange={setSize}/>}
    {['alert','dot-chip','status-pill','empty-state'].includes(demo)&&<Flag label={t('icon')} value={icon} onChange={setIcon}/>}
    {demo==='alert'&&<Flag label={t('action')} value={action} onChange={setAction}/>}
    {demo==='status-pill'&&<Flag label="pulse" value={pulse} onChange={setPulse}/>}
    {demo==='empty-state'&&<Flag label="direction row" value={row} onChange={setRow}/>}
    {['loading-state','skeleton','spinner'].includes(demo)&&<Flag label={t('loading')} value={loading} onChange={setLoading}/>}
    {demo==='skeleton'&&<><Range label="width" value={width} min={60} max={300} onChange={setWidth}/><Range label="height" value={height} min={8} max={100} onChange={setHeight}/><Range label={t('count')} value={count} min={1} max={6} onChange={setCount}/></>}
    {demo==='progress'&&<Range label="value (0…1)" value={value} min={-0.1} max={1.1} step={0.1} onChange={setValue}/>}
  </>}>{example}</DemoFrame>;
}
