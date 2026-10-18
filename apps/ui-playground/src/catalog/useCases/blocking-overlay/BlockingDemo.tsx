import { useEffect, useRef, useState } from 'react';
import { Button, showBlockingOverlay, hideBlockingOverlay } from '@codaa/ui';
import { DemoFrame, Flag } from '../inspect-component/DemoControls';
import { useDemoSession } from '../inspect-component/useDemoSession';
import { t } from '../../../shared/i18n/messages';
export function BlockingDemo() {
  const [custom,setCustom]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null);
  const owned=useRef(false);
  const {output,report,later}=useDemoSession();
  useEffect(()=>()=>{if(owned.current)hideBlockingOverlay();},[]);
  return <DemoFrame output={output} controls={<Flag label={t('text')} value={custom} onChange={setCustom}/>}><Button ref={trigger} onClick={()=>{owned.current=true;showBlockingOverlay(custom?t('title'):undefined);later(()=>{hideBlockingOverlay();owned.current=false;report(t('success'));trigger.current?.focus();},1500);}}>{t('open')} · 1.5 s</Button></DemoFrame>;
}
