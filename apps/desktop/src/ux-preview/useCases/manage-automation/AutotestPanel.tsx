import { Alert, Badge, Button, EmptyState, Input, StatusPill, Textarea } from '@codaa/ui';
import { useEffect, useRef, useState } from 'react';
import { DefinitionsEditor } from './ArgumentEditor';
import { at } from './messages';
import { autotestDraft, emptyArgumentRow } from './usePreviewAutomation';
import type { UsePreviewAutomationResult } from './usePreviewAutomation';
import type { Autotest, AutotestDraft } from './types';
import styles from './AutomationWorkspace.module.css';

export function AutotestPanel({ model: m, selected, createToken, onSaved }: { model: UsePreviewAutomationResult; selected: Autotest | null; createToken: number; onSaved: (id: string) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AutotestDraft | null>(null);
  const handledToken = useRef(0);
  const disabled = m.blocked || m.busy;
  // The sidebar create action is a token, so this panel stays the single owner of the draft.
  useEffect(() => { if (createToken > handledToken.current) { handledToken.current = createToken; startCreate(); } });

  function startCreate() { setEditingId('new'); setDraft({ title: '', description: '', profileId: m.profile.profileId, automationId: '', project: m.profile.projects[0], variantId: 'default', rows: [] }); }
  function startEdit(test: Autotest) { setEditingId(test.id); setDraft(autotestDraft(test)); }
  function patch(values: Partial<AutotestDraft>) { if (draft) setDraft({ ...draft, ...values }); }

  if (draft) return <section className={styles.panel}>
    <h2>{editingId === 'new' ? at('new') : at('edit')}</h2>
    <div className={styles.form}>
      <label>{at('title')}<Input aria-label={at('title')} value={draft.title} disabled={disabled} onChange={(event) => patch({ title: event.target.value })} /></label>
      <label>{at('description')}<Textarea rows={3} aria-label={at('description')} value={draft.description} disabled={disabled} onChange={(event) => patch({ description: event.target.value })} /></label>
      <div className={styles.formRow}>
        <label>{at('automationId')}<Input aria-label={at('automationId')} value={draft.automationId} disabled={disabled} onChange={(event) => patch({ automationId: event.target.value })} /></label>
        <label>{at('project')}<Input aria-label={at('project')} value={draft.project} disabled={disabled} onChange={(event) => patch({ project: event.target.value })} /></label>
        <label>{at('variantId')}<Input aria-label={at('variantId')} value={draft.variantId} disabled={disabled} onChange={(event) => patch({ variantId: event.target.value })} /></label>
      </div>
    </div>
    <h3>{at('arguments')}</h3><p className={styles.muted}>{at('argumentsHint')}</p>
    <DefinitionsEditor rows={draft.rows} disabled={disabled} onChange={(rows) => patch({ rows })} />
    <div className={styles.rowActions}>
      <Button disabled={m.busy} onClick={() => { setDraft(null); setEditingId(null); }}>{at('discard')}</Button>
      <Button variant="primary" disabled={disabled} onClick={() => { const saved = m.saveAutotest(editingId === 'new' ? null : editingId, draft); if (saved) { onSaved(saved); setDraft(null); setEditingId(null); } }}>{at('save')}</Button>
    </div>
  </section>;

  if (!selected) return <EmptyState title={at('select')} description={at('catalog')} />;
  return <section className={styles.panel}>
    <div className={styles.titleRow}>
      <h2>{selected.title}</h2>
      {selected.archived ? <StatusPill tone="warning" size="sm">{at('archivedLabel')}</StatusPill> : <StatusPill tone="success" size="sm">{at('active')}</StatusPill>}
      <div className={styles.rowActions}>
        <Button size="sm" disabled={disabled} onClick={() => startEdit(selected)}>{at('edit')}</Button>
        <Button size="sm" disabled={disabled} onClick={() => m.toggleArchive(selected.id)}>{at(selected.archived ? 'restore' : 'archive')}</Button>
        <Button size="sm" variant="ghost" disabled={disabled} onClick={() => m.removeAutotest(selected.id)}>{at('removeArgument')}</Button>
      </div>
    </div>
    <p className={styles.muted}>{selected.description}</p>
    <dl className={styles.facts}>
      <div><dt>{at('id')}</dt><dd>{selected.id}</dd></div>
      <div><dt>{at('revision')}</dt><dd>{selected.revision}</dd></div>
      <div><dt>{at('selector')}</dt><dd>{`${selected.selector.automationId} · ${selected.selector.project} · ${selected.selector.variantId}`}</dd></div>
      <div><dt>{at('profile')}</dt><dd>{selected.profileId}</dd></div>
    </dl>
    <h3>{at('arguments')}</h3>
    {selected.argumentDefinitions.length ? <ul className={styles.argumentList}>{selected.argumentDefinitions.map((definition) => <li key={definition.key}>
      <code>{definition.key}</code><strong>{definition.label}</strong>
      <Badge variant={definition.required ? 'warning' : 'neutral'}>{at(definition.type)}{definition.required ? ` · ${at('required')}` : ''}</Badge>
      <span>{definition.type === 'enum' ? definition.options.join(', ') : definition.type === 'string' ? definition.format ?? at('none') : definition.type === 'number' ? `${definition.min ?? '—'}…${definition.max ?? '—'}` : ''}</span>
      <small>{at('defaultValue')}: {definition.default === undefined ? '—' : String(definition.default)}</small>
      {Object.hasOwn(selected.defaults, definition.key) && <small>{at('layerAutotest')}: {JSON.stringify(selected.defaults[definition.key])}</small>}
    </li>)}</ul> : <p className={styles.muted}>{at('noIssues')}</p>}

    <h3>{at('discovered')}</h3><p className={styles.muted}>{at('discoveredHint')}</p>
    <div className={styles.rowActions}>
      <Button size="sm" disabled={disabled} loading={m.busy} onClick={m.discover}>{at('discover')}</Button>
      {m.discovery && <Badge variant="brand">{`${at('projects')}: ${m.discovery.tests.length} · ${m.discovery.catalogRevision}`}</Badge>}
    </div>
    {m.discovery && <>
      {m.discovery.dependencies.length > 0 && <Alert variant="info">{`${at('dependencies')}: ${m.discovery.dependencies.join(', ')}`}</Alert>}
      <ul className={styles.discoveryList}>{m.discovery.tests.map((test) => {
        const added = m.autotests.some((item) => item.selector.automationId === test.key.automationId && item.selector.project === test.key.project && item.selector.variantId === test.key.variantId);
        return <li key={`${test.key.automationId}:${test.key.project}:${test.key.variantId}`}>
          <strong>{test.title}</strong><code>{`${test.key.automationId} · ${test.key.project} · ${test.key.variantId}`}</code>
          <small>{test.file} · {at('expectedStatus')}: {at(test.expectedStatus)}</small>
          <Button size="sm" disabled={disabled || added} onClick={() => { const saved = m.saveAutotest(null, { title: test.title, description: test.file, profileId: m.profile.profileId, automationId: test.key.automationId, project: test.key.project, variantId: test.key.variantId, rows: [emptyArgumentRow()] }); if (saved) onSaved(saved); }}>{at(added ? 'alreadyAdded' : 'addDiscovered')}</Button>
        </li>;
      })}</ul>
    </>}
  </section>;
}
