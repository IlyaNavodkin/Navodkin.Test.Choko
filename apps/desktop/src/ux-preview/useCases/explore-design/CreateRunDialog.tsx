import actionStyles from './PrimaryAction.module.css';
import { useState } from 'react';
import { z } from 'zod';
import { Button, Checkbox, Icon, IconNames, Input, Modal } from '@codaa/ui';
import { useZodForm } from '../../../shared/forms/useZodForm';
import { DialogHeading, DialogNotice } from './DialogVisuals';
import { t } from './messages';
import type { DemoCase } from './types';
import styles from './Dialogs.module.css';
const runSchema = z.object({ name: z.string().trim().min(1), date: z.string().refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().startsWith(value)), ids: z.array(z.string()).min(1) });
type CreateRunValues = z.infer<typeof runSchema>;
export function CreateRunDialog({ cases, blocked, onClose, onCreate }: { cases: DemoCase[]; blocked: boolean; onClose: () => void; onCreate: (name: string, date: string, cases: DemoCase[]) => boolean }) {
  const form = useZodForm<CreateRunValues>({ initialValues: { name: '', date: '2026-10-16', ids: [] }, schema: runSchema, invalidMessage: t('runValidation') });
  const [search, setSearch] = useState(''); const [busy, setBusy] = useState(false);
  const chosen = form.values.ids.map((id) => cases.find((item) => item.id === id)!).filter(Boolean);
  function reorder(index: number, offset: number) { const ids = [...form.values.ids]; [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]]; form.setFieldValue('ids', ids); }
  async function create() { if (busy || blocked) return; const values = form.validate(); if (!values) return; setBusy(true); await new Promise<void>((resolve) => setTimeout(resolve, 450)); if (onCreate(values.name, values.date, chosen)) onClose(); setBusy(false); }
  return <Modal open title={<DialogHeading title={t('newRun')} icon={IconNames.fileText} />} maxWidth={760} closable={!busy} onOpenChange={(open) => { if (!open) onClose(); }} actions={<><Button disabled={busy} onClick={onClose}>{t('cancel')}</Button><Button className={actionStyles.primaryAction} variant="primary" disabled={blocked} loading={busy} onClick={create}>{t('createRun')}</Button></>}><div className={styles.form}>
    <div className={styles.twoColumns}><label>{t('name')}<Input aria-label={t('name')} value={form.values.name} disabled={busy} onChange={(event) => form.setFieldValue('name', event.target.value)} /></label><label>{t('date')}<Input type="date" aria-label={t('date')} value={form.values.date} disabled={busy} onChange={(event) => form.setFieldValue('date', event.target.value)} /></label></div>
    <h3>{t('selectCases')} · {chosen.length}</h3><Input size="sm" aria-label={t('search')} placeholder={t('search')} value={search} onChange={(event) => setSearch(event.target.value)} />
    <div className={styles.caseList}>{cases.filter((item) => `${item.displayId} ${item.title} ${item.folder}`.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))).map((item) => <div key={item.id}><Checkbox disabled={busy} checked={form.values.ids.includes(item.id)} onCheckedChange={(checked) => form.setFieldValue('ids', checked ? [...form.values.ids, item.id] : form.values.ids.filter((id) => id !== item.id))}>{item.displayId} · {item.title}</Checkbox></div>)}</div>
    <h3>{t('selectionOrder')}</h3><div className={styles.caseList}>{chosen.map((item, index) => <div key={item.id}><span>{index + 1}. {item.displayId} · {item.title}</span><Button size="sm" variant="ghost" disabled={index === 0 || busy} aria-label={`${t('up')} ${item.displayId}`} onClick={() => reorder(index, -1)}><Icon name={IconNames.chevronUp} size="sm" /></Button><Button size="sm" variant="ghost" disabled={index === chosen.length - 1 || busy} aria-label={`${t('down')} ${item.displayId}`} onClick={() => reorder(index, 1)}><Icon name={IconNames.chevronDown} size="sm" /></Button></div>)}</div>
    {Object.keys(form.errors).length > 0 && <DialogNotice tone="danger" alert>{t('runValidation')}</DialogNotice>}<DialogNotice>{t('snapshotCreateHint')}</DialogNotice>
  </div></Modal>;
}
