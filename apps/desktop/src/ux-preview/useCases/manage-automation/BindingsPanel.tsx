import { Alert, Badge, Button, EmptyState, Select, StatusPill, Toggle } from '@codaa/ui';
import { useState } from 'react';
import { OverridesEditor } from './ArgumentEditor';
import { at } from './messages';
import { overridesDraft } from './usePreviewAutomation';
import type { UsePreviewAutomationResult } from './usePreviewAutomation';
import type { Autotest, BindingDraft } from './types';
import styles from './AutomationWorkspace.module.css';

/** A case can carry several bindings, and one autotest can be reused by several cases. */
export function BindingsPanel({ model: m }: { model: UsePreviewAutomationResult }) {
  const [caseId, setCaseId] = useState(() => m.cases[0]?.id ?? '');
  const [editing, setEditing] = useState<{ id: string | null; caseId: string; draft: BindingDraft } | null>(null);
  const disabled = m.blocked || m.busy;
  const caseBindings = m.bindings.filter((binding) => binding.caseId === caseId);

  function start(bindingId: string | null) {
    const caseRow = m.cases.find((item) => item.id === caseId);
    const existing = bindingId ? m.bindings.find((item) => item.id === bindingId) : undefined;
    const autotest = existing ? m.autotests.find((item) => item.id === existing.autotestId) : m.autotests.find((item) => !item.archived);
    if (!caseRow || !autotest) return;
    setEditing({ id: bindingId, caseId, draft: { autotestId: autotest.id, enabled: existing?.enabled ?? true, overrides: existing ? overridesDraft(autotest, existing.argumentOverrides) : overridesDraft(autotest, {}) } });
  }
  function draftAutotest(draft: BindingDraft | null): Autotest | null {
    return draft ? m.autotests.find((item) => item.id === draft.autotestId) ?? null : null;
  }

  return <section className={styles.panel}>
    <h2>{at('bindings')}</h2><p className={styles.muted}>{at('bindingsHint')}</p>
    <div className={styles.caseTabs}>{m.cases.map((item) => <button key={item.id} className={styles.caseChip} aria-pressed={item.id === caseId} onClick={() => { setCaseId(item.id); setEditing(null); }}><strong>{item.displayId}</strong><span>{item.title}</span></button>)}</div>
    {caseBindings.length ? <ul className={styles.bindingList}>{caseBindings.map((binding) => {
      const autotest = m.autotests.find((item) => item.id === binding.autotestId);
      const invocation = m.invocations.find((item) => item.bindingId === binding.id);
      return <li key={binding.id}>
        <div className={styles.bindingHead}>
          <strong>{autotest?.title ?? at('UNAVAILABLE')}</strong>
          <Badge variant={binding.enabled ? 'success' : 'neutral'}>{at(binding.enabled ? 'enabled' : 'blockedRunning')}</Badge>
          {autotest?.archived && <StatusPill tone="warning" size="sm">{at('archivedLabel')}</StatusPill>}
          <Toggle aria-label={`${at('enabled')} ${binding.id}`} checked={binding.enabled} disabled={disabled} onCheckedChange={() => m.toggleEnabled(binding.id)} />
        </div>
        <small>{binding.id} · {at('revision')}: {binding.revision}</small>
        <ul className={styles.overrideSummary}>{Object.entries(binding.argumentOverrides).map(([key, value]) => <li key={key}><code>{key}</code><span>{value.kind === 'environment' ? `${at('environment')}: ${value.entryId.slice(0, 13)}… · ${value.key}` : String(value.value)}</span></li>)}</ul>
        {invocation && invocation.issues.length > 0 && <Alert variant="warning">{invocation.issues.map((issue) => at(issue.code)).join(', ')}</Alert>}
        <div className={styles.rowActions}><Button size="sm" disabled={disabled} onClick={() => start(binding.id)}>{at('edit')}</Button><Button size="sm" variant="ghost" disabled={disabled} onClick={() => m.removeBinding(binding.id)}>{at('removeBinding')}</Button></div>
      </li>;
    })}</ul> : <p className={styles.muted}>{at('noBindings')}</p>}
    {editing ? <div className={styles.editor}>
      <h3>{editing.id ? at('edit') : at('addBinding')}</h3>
      <label>{at('autotest')}<Select aria-label={at('autotest')} value={editing.draft.autotestId} disabled={disabled} options={m.autotests.map((item) => ({ value: item.id, label: `${item.title}${item.archived ? ` · ${at('archivedLabel')}` : ''}` }))} onValueChange={(autotestId) => { const autotest = m.autotests.find((item) => item.id === autotestId)!; setEditing({ ...editing, draft: { ...editing.draft, autotestId: autotest.id, overrides: overridesDraft(autotest, {}) } }); }} /></label>
      <OverridesEditor definitions={draftAutotest(editing.draft)?.argumentDefinitions ?? []} environments={m.environments} draft={editing.draft.overrides} disabled={disabled} onChange={(overrides) => setEditing({ ...editing, draft: { ...editing.draft, overrides } })} />
      <div className={styles.rowActions}>
        <Button disabled={m.busy} onClick={() => setEditing(null)}>{at('discard')}</Button>
        <Button variant="primary" disabled={disabled} onClick={() => { if (m.saveBinding(editing.id, editing.caseId, editing.draft)) setEditing(null); }}>{at('save')}</Button>
      </div>
    </div> : <div className={styles.rowActions}><Button size="sm" disabled={disabled || !m.autotests.length} onClick={() => start(null)}>{at('addBinding')}</Button></div>}
  </section>;
}
