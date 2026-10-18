import { useRef, useState } from 'react';
import * as UI from '@codaa/ui';
import { Choice, DemoFrame, Flag, Range } from '../inspect-component/DemoControls';
import { useDemoSession } from '../inspect-component/useDemoSession';
import { t } from '../../../shared/i18n/messages';
import styles from '../inspect-component/Demo.module.css';
type Metadata = {id:string;name:string;sizeBytes:number;status:UI.UploadFileStatus;progress:number};
export function UploadDemo() {
  const [files,setFiles]=useState<Metadata[]>([]);
  const [disabled,setDisabled]=useState(false);
  const [multiple,setMultiple]=useState(true);
  const [failure,setFailure]=useState(false);
  const [accept,setAccept]=useState('.md,.txt');
  const [limit,setLimit]=useState(64);
  const [hover,setHover]=useState(false);
  const [show,setShow]=useState(false);
  const [pointer,setPointer]=useState<'none'|'auto'>('none');
  const sequence=useRef(0);
  const {output,report,later}=useDemoSession();
  const start=(id:string)=>{
    setFiles(v=>v.map(f=>f.id===id?{...f,status:'queued',progress:0}:f));
    later(()=>setFiles(v=>v.map(f=>f.id===id?{...f,status:'uploading',progress:50}:f)),300);
    later(()=>setFiles(v=>v.map(f=>f.id===id?{...f,status:failure?'failed':'done',progress:failure?50:100}:f)),900);
  };
  const add=(metadata:{name:string;size:number}[])=>{const batch=metadata.map(f=>({id:`local-${++sequence.current}`,name:f.name,sizeBytes:f.size,status:'queued' as const,progress:0}));setFiles(v=>[...v,...batch]);batch.forEach(f=>start(f.id));report(t('simulated'));};
  return <DemoFrame output={output} controls={<><Flag label={t('disabled')} value={disabled} onChange={setDisabled}/><Flag label="multiple" value={multiple} onChange={setMultiple}/><Flag label={t('simulatedError')} value={failure} onChange={setFailure}/><Choice label="accept" value={accept} options={['.md,.txt','image/*','']} onChange={setAccept}/><Range label="maxSize KiB" value={limit} min={1} max={128} onChange={setLimit}/><Flag label="DropOverlay" value={show} onChange={setShow}/><Choice label="pointerEvents" value={pointer} options={['none','auto']} onChange={setPointer}/><UI.Button disabled={disabled} onClick={()=>add([{name:'Демо.txt',size:1024}])}>{t('simulated')}</UI.Button></>}>
    <p>{t('upload')}</p><div className={styles.bounded} onDragEnter={()=>setHover(true)} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setHover(false);}} onDropCapture={()=>setHover(false)}>
      <UI.UploadDropzone disabled={disabled} accept={accept} multiple={multiple} maxSizeBytes={limit*1024} hint={t('upload')} onFilesSelected={incoming=>add(incoming.map(f=>({name:f.name,size:f.size})))} onRejected={(rejected,reason)=>report(`${reason}: ${rejected.map(f=>f.name).join(', ')}`)} files={files.map(f=>({...f,stageLabel:f.status,errorMessage:f.status==='failed'?t('error'):undefined,onRetry:()=>start(f.id),onRemove:()=>setFiles(v=>v.filter(x=>x.id!==f.id))}))}/>
      {(hover||show)&&<UI.DropOverlay pointerEvents={pointer} title={t('demo')} description={t('upload')} icon={<UI.Icon name={UI.IconNames.file}/>}/>}
    </div>
    <div role="status" aria-live="polite">{files.map(file=><p key={file.id}>{file.name} · <UI.Badge variant={file.status==='failed'?'danger':file.status==='done'?'success':'neutral'}>{file.status}</UI.Badge></p>)}</div>
  </DemoFrame>;
}
