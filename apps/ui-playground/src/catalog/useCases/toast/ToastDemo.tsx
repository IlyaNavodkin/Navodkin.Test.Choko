import { useEffect, useRef, useState } from 'react';
import { Button, Toast, showToast, dismissToast } from '@codaa/ui';
import { Choice, DemoFrame, Flag, TextControl } from '../inspect-component/DemoControls';
import { t } from '../../../shared/i18n/messages';
export function ToastDemo() {
  const [text,setText]=useState(t('title'));
  const [variant,setVariant]=useState<'info'|'error'>('info');
  const [auto,setAuto]=useState(true);
  const [action,setAction]=useState(true);
  const [output,setOutput]=useState<string>();
  const ids=useRef(new Set<number>());
  const clear=()=>{ids.current.forEach(dismissToast);ids.current.clear();};
  useEffect(()=>clear,[]);
  return <DemoFrame output={output} controls={<><TextControl value={text} onChange={setText}/><Choice label="store variant" value={variant} options={['info','error']} onChange={setVariant}/><Flag label="auto dismiss" value={auto} onChange={setAuto}/><Flag label={t('action')} value={action} onChange={setAction}/><Button onClick={clear}>{t('clear')}</Button></>}>
    <Toast role="status">{text}{action&&<Button onClick={()=>setOutput(t('success'))}>{t('action')}</Button>}</Toast>
    <Button onClick={()=>{ids.current.add(showToast({message:text,variant,duration:auto?1500:0}));setOutput(variant);}}>{t('open')}</Button>
  </DemoFrame>;
}
