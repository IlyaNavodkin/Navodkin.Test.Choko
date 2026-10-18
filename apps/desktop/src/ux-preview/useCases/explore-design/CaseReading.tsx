import { useRef, useState } from 'react';
import { Button, IconNames, Modal } from '@codaa/ui';
import { SafeMarkdown } from '../../components/markdown-editor/SafeMarkdown';
import type { ReferenceOption } from '../../components/markdown-editor/ReferencePicker';
import { rt } from '../../components/markdown-editor/referenceMessages';
import type { GlossaryEntry } from '../manage-glossary/types';
import { gt } from '../manage-glossary/messages';
import { CaseDocument } from './CaseDocument';
import { casePath } from './caseOperations';
import { DocumentBlock } from './Shared';
import { t } from './messages';
import type { UsePreviewCaseEditorResult } from './usePreviewCaseEditor';
import styles from './Preview.module.css';
export function glossaryHref(caseFile: string, id: string): string { return `${'../'.repeat(caseFile.split('/').length - 1)}.testoritto/glossary/${id}.md`; }
export function resolveGlossaryReference(href: string, caseFile: string, entries: GlossaryEntry[]): GlossaryEntry | undefined { return entries.find((entry) => glossaryHref(caseFile, entry.id) === href); }
export function CaseReading({ model: m, entries, onOpenEntry }: { model: UsePreviewCaseEditorResult; entries: GlossaryEntry[]; onOpenEntry: (id: string) => void }) {
  const [editing, setEditing] = useState(false); const [visited, setVisited] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const origin = useRef<HTMLElement | null>(null);
  const file = m.selected ? casePath(m.selected) : '';
  const options: ReferenceOption[] = entries.filter((entry) => !entry.archived).map((entry) => ({ ...entry, kind: gt(entry.kind), href: glossaryHref(file, entry.id) }));
  function close() { setReference(null); requestAnimationFrame(() => origin.current?.focus()); }
  function open(href: string) { origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setReference(href); }
  const entry = reference ? resolveGlossaryReference(reference, file, entries) : undefined;
  if (!m.selected) return <CaseDocument model={m} />;
  return <>
    <div className={styles.readModes} aria-label={rt('mode')}><Button size="sm" variant="ghost" aria-pressed={!editing} onClick={() => setEditing(false)}>{rt('read')}</Button><Button size="sm" variant="ghost" aria-pressed={editing} disabled={m.blocked || m.saving} onClick={() => { setVisited(true); setEditing(true); }}>{rt('edit')}</Button>{m.dirty && <span className={styles.muted}>{rt('draft')}</span>}</div>
    {visited && <div hidden={!editing}><CaseDocument model={m} references={options} /></div>}
    {!editing && <article className={styles.document}>
      <div className={styles.documentId}>{m.selected.displayId}</div><h1>{m.values.title}</h1>
      <div className={styles.tags}><span>{t(m.values.status)}</span>{m.values.tags.filter(Boolean).map((tag, i) => <span key={i} className={styles.tag}>{tag}</span>)}</div>
      <DocumentBlock title={t('objective')} icon={IconNames.crosshair}><SafeMarkdown source={m.values.objective} onReference={open} /></DocumentBlock>
      <DocumentBlock title={t('setup')} icon={IconNames.fileText}><SafeMarkdown source={m.values.setup} onReference={open} /></DocumentBlock>
      <DocumentBlock title={t('steps')} icon={IconNames.list}><ol>{m.values.steps.map((step, i) => <li key={i}><SafeMarkdown source={step} onReference={open} /></li>)}</ol></DocumentBlock>
      <DocumentBlock title={t('expected')} icon={IconNames.checkCircle}><SafeMarkdown source={m.values.expected} onReference={open} /></DocumentBlock>
      <details className={styles.properties}><summary>{t('metadata')}</summary><p>{t('systems')}: {m.values.systems}</p><p>{t('stableId')}: {m.selected.id}</p></details>
    </article>}
    {reference && <Modal open title={entry?.title ?? rt('missing')} onOpenChange={(value) => { if (!value) close(); }} actions={<><Button onClick={close}>{rt('close')}</Button>{entry && <Button onClick={() => { setReference(null); onOpenEntry(entry.id); }}>{rt('open')}</Button>}</>}>
      {entry ? <><p>{gt(entry.kind)}{entry.archived ? ` · ${rt('archived')}` : ''}</p>{entry.aliases.length > 0 && <p>{rt('aliases')}: {entry.aliases.join(', ')}</p>}<SafeMarkdown source={entry.description} />{entry.url && <p>{entry.url}</p>}</> : <p role="status">{rt('unresolved')}</p>}
      {!entry && <details><summary>{rt('diagnostics')}</summary><p className={styles.muted}>{reference}</p></details>}
    </Modal>}
  </>;
}
