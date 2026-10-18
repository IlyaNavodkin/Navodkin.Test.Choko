import { useState } from 'react';
import * as UI from '@codaa/ui';
import type { DemoId } from '../../registry/inventory';
import { Choice, DemoFrame, Flag, Range } from '../inspect-component/DemoControls';
import { t } from '../../../shared/i18n/messages';
import styles from '../inspect-component/Demo.module.css';
export const markdownFixture='# Проверка формы\n\n## Шаги\n\n- Открыть окно\n- Ввести **название**\n\n| Поле | Результат |\n| --- | --- |\n| Название | Сохранено |\n\n```ts\nconst result = "local";\n```\n\n[Локальная ссылка](#local-demo)\n\n<script>window.bad = true</script>';
export function ContentDemo({demo}:{demo:DemoId}) {
  const [query,setQuery]=useState('');
  const [size,setSize]=useState<UI.IconSize | number>('md');
  const [stroke,setStroke]=useState(2);
  const [avatarSize,setAvatarSize]=useState<UI.AvatarSize>('lg');
  const [fixture,setFixture]=useState<'initial'|'image'|'broken'|'speaking'>('initial');
  const [online,setOnline]=useState(true);
  const [speaking,setSpeaking]=useState(false);
  const [content,setContent]=useState(markdownFixture);
  const [output,setOutput]=useState<string>();
  const names=[...new Set(Object.values(UI.IconNames))].filter(name=>name.includes(query.trim().toLowerCase()));
  let example;
  switch(demo) {
    case 'icons':example=<><UI.SearchInput aria-label={t('filter')} value={query} onValueChange={setQuery} debounceMs={0}/><div className={styles.icons}>{names.map(name=><div className={styles.icon} key={name}><UI.Icon name={name} size={size} strokeWidth={stroke} aria-label={name} role="img"/><span>{name}</span></div>)}</div></>;break;
    case 'avatar':example=<><UI.Avatar initial="T" alt="Testoritto" size={avatarSize} online={online} src={fixture==='image'?'/fixtures/mark.svg':fixture==='broken'?'/fixtures/broken.svg':undefined} speakingSrc={fixture==='speaking'?'/fixtures/speaking.svg':undefined} silentSrc={fixture==='speaking'?'/fixtures/mark.svg':undefined} isSpeaking={speaking}/><span>{online?t('online'):t('offline')}</span></>;break;
    case 'markdown':example=<div onClick={e=>{const anchor=(e.target as HTMLElement).closest('a');if(anchor){e.preventDefault();setOutput(anchor.textContent??t('demo'));}}}><UI.Markdown content={content}/></div>;break;
    default:throw Error(`Unknown content demo: ${demo}`);
  }
  return <DemoFrame output={output} controls={<>
    {demo==='icons'&&<><Choice label="size" value={typeof size==='number'?'numeric':size} options={['xs','sm','md','lg','numeric']} onChange={v=>setSize(v==='numeric'?40:v)}/><Range label="strokeWidth" value={stroke} min={1} max={4} step={0.5} onChange={setStroke}/></>}
    {demo==='avatar'&&<><Choice label="fixture" value={fixture} options={['initial','image','broken','speaking']} onChange={setFixture}/><Choice label="size" value={avatarSize} options={['sm','md','lg','xl']} onChange={setAvatarSize}/><Flag label="online" value={online} onChange={setOnline}/><Flag label="isSpeaking" value={speaking} onChange={setSpeaking}/></>}
    {demo==='markdown'&&<><label>{t('text')}<UI.Textarea aria-label={t('text')} value={content} rows={10} onChange={e=>setContent(e.target.value)}/></label><UI.Button onClick={()=>setContent('')}>{t('emptyFixture')}</UI.Button><UI.Button onClick={()=>setContent(markdownFixture)}>{t('retry')}</UI.Button></>}
  </>}>{example}</DemoFrame>;
}
