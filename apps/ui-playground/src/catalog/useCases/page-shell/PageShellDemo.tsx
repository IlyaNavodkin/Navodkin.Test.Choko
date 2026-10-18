import { useState, type MouseEvent } from 'react';
import * as UI from '@codaa/ui';
import { Choice, DemoFrame, Flag, TextControl } from '../inspect-component/DemoControls';
import { useZodForm } from '../field-validation/useZodForm';
import { createFieldSchema } from '../field-validation/schema';
import { rovingTabs } from '../tabs/NavigationDemo';
import { t } from '../../../shared/i18n/messages';
import styles from '../inspect-component/Demo.module.css';
export function PageShellDemo() {
  const [variant,setVariant]=useState<UI.PageShellVariant>('chrome');
  const [width,setWidth]=useState<UI.PageShellWidth>('lg');
  const [long,setLong]=useState(false);
  const [many,setMany]=useState(false);
  const [disabled,setDisabled]=useState(false);
  const [logo,setLogo]=useState(false);
  const [large,setLarge]=useState(false);
  const [profileAction,setProfileAction]=useState(true);
  const [segment,setSegment]=useState('list');
  const [query,setQuery]=useState('');
  const [title,setTitle]=useState(t('title'));
  const [output,setOutput]=useState<string>();
  const [removed,setRemoved]=useState<number[]>([]);
  const form=useZodForm({initialValues:{name:''},schema:createFieldSchema(t('required'))});
  const copy=long?`${title} · ${t('description')} ${t('description')}`:title;
  const link=(message:string)=>(e:MouseEvent<HTMLAnchorElement>)=>{e.preventDefault();setOutput(message);};
  const actions=<><UI.Button disabled={disabled} onClick={()=>setOutput(t('action'))}>{t('action')}</UI.Button>{many&&<UI.Button onClick={()=>setOutput(t('secondary'))}>{t('secondary')}</UI.Button>}</>;
  const rows=Array.from({length:many?18:3},(_,i)=>i).filter(i=>!removed.includes(i)&&`Проверка ${i+1}`.toLowerCase().includes(query.toLowerCase()));
  return <DemoFrame output={output} controls={<><Choice label="variant" value={variant} options={['stage','chrome']} onChange={setVariant}/><Choice label="width" value={width} options={['sm','md','lg']} onChange={setWidth}/><TextControl value={title} onChange={setTitle}/><Flag label={t('longer')} value={long} onChange={setLong}/><Flag label={t('secondary')} value={many} onChange={setMany}/><Flag label={t('disabled')} value={disabled} onChange={setDisabled}/><Flag label="logoUrl" value={logo} onChange={setLogo}/><Flag label="brand size lg" value={large} onChange={setLarge}/><Flag label="user action" value={profileAction} onChange={setProfileAction}/></>}>
    <div className={styles.wide}><UI.PageShell variant={variant} width={width}>
      <UI.PageTopbar><UI.PageTopbarCopy><UI.PageBrand mark="T" title="Testoritto" eyebrow={t('demo')} description={long?t('description'):undefined} logoUrl={logo?'/fixtures/mark.svg':undefined} size={large?'lg':'md'}/></UI.PageTopbarCopy><UI.PageTopbarActions>{actions}</UI.PageTopbarActions></UI.PageTopbar>
      <UI.PageChromeBody>
        <UI.PageHeader><UI.PageHeaderCopy><UI.PageEyebrow>{t('local')}</UI.PageEyebrow><UI.PageTitle>{copy}</UI.PageTitle><UI.PageDescription>{t('description')}</UI.PageDescription></UI.PageHeaderCopy><UI.PageHeaderActions>{actions}</UI.PageHeaderActions></UI.PageHeader>
        <UI.PageUserChip username="Demo QA" label={t('local')} onClick={profileAction?()=>setOutput(t('profile')):undefined}/>
        <UI.PageSegmented aria-label={t('selection')} onKeyDown={rovingTabs}>{['list','form','disabled'].map(value=><UI.PageSegment id={`page-tab-${value}`} key={value} active={segment===value} disabled={value==='disabled'} tabIndex={segment===value?0:-1} aria-controls={`page-panel-${value}`} onClick={()=>setSegment(value)}>{value==='list'?'Список':value==='form'?'Форма':t('disabled')}</UI.PageSegment>)}</UI.PageSegmented>
        <UI.PageToolbar><UI.PageToolbarCopy><strong>{title}</strong><UI.PageMeta>{rows.length} · {t('count')}</UI.PageMeta></UI.PageToolbarCopy><UI.SearchInput aria-label={t('filter')} value={query} onValueChange={setQuery} debounceMs={0} size="sm"/><UI.PageTextButton disabled={disabled} onClick={()=>{setQuery('');setOutput(t('clear'));}}>{t('clear')}</UI.PageTextButton></UI.PageToolbar>
        <UI.PagePanel role="tabpanel" id={`page-panel-${segment}`} aria-labelledby={`page-tab-${segment}`}>
          {segment==='list'?<UI.PageList scrollable={many}>{rows.map(i=><UI.PageRow key={i}><UI.PageRowBody href="#demo" onClick={link(`Проверка ${i+1}`)}><UI.PageRowTitle>{long?copy:`Проверка ${i+1}`}</UI.PageRowTitle><UI.PageRowSubtitle>{t('description')}</UI.PageRowSubtitle><UI.PageMeta>{`case-${i+1}`}</UI.PageMeta></UI.PageRowBody><UI.PageRowActions><UI.Button onClick={()=>setRemoved(v=>[...v,i])}>{t('remove')}</UI.Button>{many&&<UI.Button onClick={()=>setOutput(String(i))}>{t('action')}</UI.Button>}</UI.PageRowActions></UI.PageRow>)}</UI.PageList>:<UI.PageForm onSubmit={e=>{e.preventDefault();const result=form.validate();if(result)setOutput(`${t('saved')}: ${result.name}`);}}><UI.Label label={<label htmlFor="page-name">{t('name')}</label>}><UI.PageJoinRow><UI.Input id="page-name" value={form.values.name} aria-invalid={Boolean(form.errors.name)} aria-describedby={form.errors.name?'page-name-error':undefined} onChange={e=>form.setFieldValue('name',e.target.value)}/><UI.Button type="submit">{t('submit')}</UI.Button></UI.PageJoinRow></UI.Label><UI.ErrorLabel id="page-name-error">{form.errors.name}</UI.ErrorLabel></UI.PageForm>}
        </UI.PagePanel>
        <UI.PageDivider/>
        <UI.PageMuted>{long?copy:t('description')}</UI.PageMuted><UI.PageHelp>{t('demo')} · <UI.PageLink href="#help" onClick={link(t('demo'))}>{t('description')}</UI.PageLink></UI.PageHelp>
        <UI.PageFooter><UI.PageSsoLink href="#sso-demo" onClick={link(t('demo'))}><UI.Icon name={UI.IconNames.plus}/>{t('demo')} SSO</UI.PageSsoLink><UI.PageLink href="#local" onClick={link(t('local'))}>{t('local')}</UI.PageLink>{actions}</UI.PageFooter>
      </UI.PageChromeBody>
    </UI.PageShell></div>
  </DemoFrame>;
}
