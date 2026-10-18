import { Button, Input, Select, Textarea } from '@codaa/ui';
import { useId } from 'react';
import { defaultGlossaryFilters } from './fixtures';
import { gt } from './messages';
import { environmentPrimitive, parseEnvironmentValues } from './schema';
import { glossaryKinds, type GlossaryDraft, type GlossaryFilters } from './types';
import type { UsePreviewGlossaryResult } from './usePreviewGlossary';
import styles from './GlossaryWorkspace.module.css';
export function GlossaryWorkspace({ model: m }: { model: UsePreviewGlossaryResult }) {
  const descriptionErrorId = useId();
  const disabled = m.blocked || m.saving;
  const entry = m.selected;
  const environment = m.values.kind === 'environment';
  const parsed = parseEnvironmentValues(m.values.values).values;
  return <div className={styles.workspace}>
    <aside className={styles.sidebar} aria-label={gt('heading')}>
      <div className={styles.tools}><h2>{gt('heading')}</h2>
        <Input size="sm" aria-label={gt('search')} placeholder={gt('search')} value={m.filters.search} onChange={(event) => m.setFilters({ ...m.filters, search: event.target.value })} />
        <Select size="sm" aria-label={gt('kind')} value={m.filters.kind} options={[{ value: '', label: gt('allKinds') }, ...glossaryKinds.map((value) => ({ value, label: gt(value) }))]} onValueChange={(kind) => m.setFilters({ ...m.filters, kind: kind as GlossaryFilters['kind'] })} />
        <Select size="sm" aria-label={gt('archiveFilter')} value={m.filters.archive} options={(['active', 'archived', 'all'] as const).map((value) => ({ value, label: gt(value) }))} onValueChange={(archive) => m.setFilters({ ...m.filters, archive: archive as GlossaryFilters['archive'] })} />
        <Button size="sm" disabled={disabled} onClick={m.create}>{gt('create')}</Button>
      </div>
      <div className={styles.list}>{m.visibleEntries.map((item) => <button key={item.id} className={styles.entry} aria-pressed={entry?.id === item.id} onClick={() => m.selectEntry(item.id)}><small>{gt(item.kind)}{item.archived && ` · ${gt('archivedLabel')}`}</small><strong>{item.title}</strong><span>{item.kind === 'environment' ? Object.keys(item.values ?? {}).join(', ') : item.description || item.url}</span></button>)}
        {!m.visibleEntries.length && <div className={styles.empty}><p>{gt('empty')}</p><Button size="sm" onClick={() => m.setFilters(defaultGlossaryFilters())}>{gt('reset')}</Button></div>}
      </div>
    </aside>
    <main className={styles.detail}>
      <p className={styles.memory}>{gt('memory')}</p>
      {m.blocked && <p role="status">{gt('blocked')}</p>}
      {m.notice && <p role="status" className={styles.notice}>{m.notice}</p>}
      {m.editing ? <form onSubmit={(event) => { event.preventDefault(); void m.save(); }} className={styles.article}>
        <h1>{m.newId ? gt('new') : gt('edit')}</h1>
        <p className={styles.id}>{gt('id')}: {m.newId ?? entry?.id}{entry && ` · ${gt('revision')}: ${entry.revision}`}</p>
        <fieldset disabled={disabled} className={styles.fields}>
          <Field name="title" model={m} />
          <label>{gt('kind')}<Select aria-label={gt('kind')} value={m.values.kind} options={glossaryKinds.map((value) => ({ value, label: gt(value) }))} onValueChange={(value) => m.update('kind', value as GlossaryDraft['kind'])} /></label>
          {!environment && <Field name="aliases" model={m} />}
          {!environment && <label>{gt('description')}<Textarea aria-label={gt('description')} rows={7} value={m.values.description} onChange={(event) => m.update('description', event.target.value)} aria-invalid={Boolean(m.errors.description)} aria-describedby={m.errors.description ? descriptionErrorId : undefined} />{m.errors.description && <span id={descriptionErrorId} className={styles.error}>{m.errors.description}</span>}</label>}
          {!environment && <Field name="url" model={m} />}
          {environment && <label>{gt('values')}<Textarea aria-label={gt('values')} rows={6} value={m.values.values} onChange={(event) => m.update('values', event.target.value)} aria-invalid={Boolean(m.errors.values)} aria-describedby={m.errors.values ? descriptionErrorId : undefined} placeholder={'baseUrl=https://pay.example.com\nhost=192.0.2.10'} />{m.errors.values ? <span id={descriptionErrorId} className={styles.error}>{m.errors.values}</span> : <small>{gt('valuesHint')}</small>}</label>}
        </fieldset>
        {environment && <ValueTable values={parsed} />}
        <div className={styles.actions}><span>{m.dirty && gt('dirty')}</span><Button type="button" disabled={m.saving} onClick={m.discard}>{gt('discard')}</Button><Button type="submit" variant="primary" disabled={disabled}>{gt(m.saving ? 'saving' : 'save')}</Button></div>
      </form> : entry ? <article className={styles.article}>
        <div className={styles.actions}><span>{gt(entry.kind)}{entry.archived && ` · ${gt('archivedLabel')}`}</span><Button size="sm" disabled={disabled} onClick={m.edit}>{gt('edit')}</Button><Button size="sm" disabled={disabled} onClick={() => void m.toggleArchive()}>{gt(entry.archived ? 'restore' : 'archive')}</Button></div>
        <h1>{entry.title}</h1><p className={styles.id}>{gt('id')}: {entry.id} · {gt('revision')}: {entry.revision}</p>
        {entry.aliases.length > 0 && <section><h2>{gt('aliases')}</h2><p>{entry.aliases.join(', ')}</p></section>}
        {entry.description && <section><h2>{gt('description')}</h2><p className={styles.description}>{entry.description}</p></section>}
        {entry.url && <section><h2>{gt('url')}</h2><p className={styles.url}>{entry.url}</p><small>{gt('urlHint')}</small></section>}
        {entry.values && <ValueTable values={entry.values} />}
      </article> : <p className={styles.empty}>{gt('select')}</p>}
    </main>
  </div>;
}
function ValueTable({ values }: { values: Record<string, string | number | boolean> }) {
  const keys = Object.keys(values);
  if (!keys.length) return null;
  return <section><h2>{gt('valuesTitle')}</h2><ul className={styles.values}>{keys.map((key) => <li key={key}><code>{key}</code><span className={styles.value}>{environmentPrimitive(values[key])}</span><small>{typeof values[key]}</small></li>)}</ul></section>;
}
function Field({ name, model: m }: { name: 'title' | 'aliases' | 'url'; model: UsePreviewGlossaryResult }) {
  const errorId = useId();
  const hintId = useId();
  const describedBy = [name === 'aliases' ? hintId : '', m.errors[name] ? errorId : ''].filter(Boolean).join(' ') || undefined;
  return <label>{gt(name)}<Input aria-label={gt(name)} value={m.values[name]} onChange={(event) => m.update(name, event.target.value)} aria-invalid={Boolean(m.errors[name])} aria-describedby={describedBy} />{name === 'aliases' && <small id={hintId}>{gt('aliasesHint')}</small>}{m.errors[name] && <span id={errorId} className={styles.error}>{m.errors[name]}</span>}</label>;
}
