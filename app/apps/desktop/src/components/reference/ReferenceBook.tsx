import { I } from '@/components/icons';
import { Button, Input, RowContextMenu, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ArgValue, ReferenceEntry } from '@/schemas/reference-book';
import type { ReferenceDoc } from '@/services/reference-book';
import { useApp } from '@/store/app-store';
import type { RefKindFilter, RefLeaveRequest, RefSaveError } from '@/types';
import { ReferenceCard } from './ReferenceCard';

const KINDS: { id: RefKindFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'link', label: 'Links' },
  { id: 'arguments', label: 'Arguments' },
];

/** Free-text search over title, aliases and description; archived records are opt-in. */
export function matchesReference(doc: ReferenceDoc, query: string, kind: RefKindFilter, showArchived: boolean): boolean {
  if (!showArchived && doc.entry.archived) return false;
  if (kind !== 'all' && doc.entry.kind !== kind) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { title, aliases, description } = doc.entry;
  return [title, ...aliases, description].some((f) => f.toLowerCase().includes(q));
}

export interface ReferenceListProps {
  docs: ReferenceDoc[];
  selectedId: string | null;
  query: string;
  kindFilter: RefKindFilter;
  showArchived: boolean;
  onSelect: (id: string) => void;
  onQuery: (q: string) => void;
  onKindFilter: (kind: RefKindFilter) => void;
  onShowArchived: (show: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
}

/** The catalog column: search, filters, and one row per record. */
export function ReferenceList({
  docs,
  selectedId,
  query,
  kindFilter,
  showArchived,
  onSelect,
  onQuery,
  onKindFilter,
  onShowArchived,
  onArchive,
}: ReferenceListProps) {
  const filtered = docs.filter((d) => matchesReference(d, query, kindFilter, showArchived));
  const archivedCount = docs.filter((d) => d.entry.archived).length;

  return (
    <div className="flex min-h-0 w-[320px] shrink-0 flex-col border-r border-border bg-panel-2">
      <div className="flex flex-col gap-2 border-b border-border p-2.5">
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-2 text-ink-faint">{I.search({ size: 14 })}</span>
          <Input
            className="h-[30px] pl-7"
            placeholder="Search the reference book…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.id}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-0.5 text-[11.5px] text-ink-2 hover:bg-raise',
                kindFilter === k.id && 'border-accent-line bg-accent-soft font-semibold text-accent-ink',
              )}
              onClick={() => onKindFilter(k.id)}
            >
              {k.label}
            </button>
          ))}
          <button
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded-full border border-border bg-panel px-2 py-0.5 text-[11.5px] text-ink-2 hover:bg-raise',
              showArchived && 'border-accent-line bg-accent-soft font-semibold text-accent-ink',
            )}
            title="Archived records stay in the repository and keep working in old runs"
            onClick={() => onShowArchived(!showArchived)}
          >
            Archive{archivedCount ? ` (${archivedCount})` : ''}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {filtered.map((doc) => (
          <RowContextMenu
            key={doc.id}
            items={[
              doc.entry.archived
                ? { label: 'Restore', icon: I.undo, on: () => onArchive(doc.id, false) }
                : { label: 'Archive', icon: I.download, on: () => onArchive(doc.id, true) },
            ]}
          >
            <button
              className={cn(
                'mb-1 flex w-full flex-col gap-1 rounded-md border border-transparent px-2.5 py-2 text-left transition hover:bg-raise',
                selectedId === doc.id && 'border-border bg-panel shadow-[0_1px_2px_var(--shadow)]',
              )}
              onClick={() => onSelect(doc.id)}
            >
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{doc.entry.title || doc.id}</span>
                {doc.readonly && <Tag className="border-fail text-fail">read-only</Tag>}
                {doc.entry.archived && <Tag>archived</Tag>}
              </span>
              <span className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                <span className="font-mono">
                  {doc.entry.kind === 'link' ? 'link' : `${(doc.entry.values ?? []).length} values`}
                </span>
                {doc.entry.aliases.length > 0 && <span className="truncate">· {doc.entry.aliases.join(', ')}</span>}
              </span>
            </button>
          </RowContextMenu>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-[12.5px] text-ink-3">
            {docs.length === 0 ? 'The reference book is empty.' : 'Nothing matches these filters.'}
          </div>
        )}
      </div>
    </div>
  );
}

export interface SaveErrorBarProps {
  error: RefSaveError | null;
  onReload: () => void;
  onOverwrite: () => void;
  onRetry: () => void;
}

/** The bar that explains a save which did not happen, and offers the way out of it. */
export function SaveErrorBar({ error, onReload, onOverwrite, onRetry }: SaveErrorBarProps) {
  if (!error) return null;
  if (error.kind === 'fields') {
    return (
      <div className="flex items-start gap-2.5 border-b border-[oklch(0.85_0.06_80)] bg-blocked-soft px-4 py-2 text-[12.5px] text-[oklch(0.5_0.12_66)]">
        <span className="mt-0.5 shrink-0">{I.warn({ size: 14 })}</span>
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold">Not saved — fix these first (your draft is kept):</span>
          {error.issues.map((issue, i) => (
            <span key={i}>{issue.message}</span>
          ))}
        </div>
      </div>
    );
  }
  if (error.kind === 'conflict') {
    return (
      <div className="flex items-center gap-2.5 border-b border-[oklch(0.85_0.06_80)] bg-blocked-soft px-4 py-2 text-[12.5px] text-[oklch(0.5_0.12_66)]">
        {I.warn({ size: 14 })}
        <span className="flex-1">
          {error.message} Your draft is still here — reload the file, or overwrite it with your version.
        </span>
        <Button size="sm" onClick={onReload}>
          Reload from disk
        </Button>
        <Button size="sm" variant="danger" onClick={onOverwrite}>
          Overwrite
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5 border-b border-[oklch(0.85_0.07_80)] bg-blocked-soft px-4 py-2 text-[12.5px] text-[oklch(0.5_0.12_66)]">
      {I.warn({ size: 14 })}
      <span className="flex-1">Could not write the record: {error.message}</span>
      <Button size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

export interface LeavePromptProps {
  pending: RefLeaveRequest | null;
  onStay: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

/** Stay / save / discard, asked before a navigation drops unsaved edits. */
export function LeavePrompt({ pending, onStay, onDiscard, onSave }: LeavePromptProps) {
  if (!pending) return null;
  return (
    <div className="flex items-center gap-2.5 border-b border-accent-line bg-accent-soft px-4 py-2 text-[12.5px] text-accent-ink">
      {I.warn({ size: 14 })}
      <span className="flex-1">The record has unsaved changes. Open {pending.label} anyway?</span>
      <Button size="sm" onClick={onStay}>
        Keep editing
      </Button>
      <Button size="sm" onClick={onDiscard}>
        Discard and open
      </Button>
      <Button size="sm" variant="primary" onClick={onSave}>
        Save and open
      </Button>
    </div>
  );
}

export interface ReferenceBookViewProps {
  refs: ReferenceDoc[];
  refIssues: { code: string; message: string }[];
  selId: string | null;
  draft: ReferenceEntry | null;
  draftBase: string | null;
  dirty: boolean;
  saveError: RefSaveError | null;
  pendingLeave: RefLeaveRequest | null;
  query: string;
  kindFilter: RefKindFilter;
  showArchived: boolean;
  onCreate: (kind: 'link' | 'arguments') => void;
  onSelect: (id: string) => void;
  onQuery: (q: string) => void;
  onKindFilter: (kind: RefKindFilter) => void;
  onShowArchived: (show: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
  onPatch: (patch: Partial<ReferenceEntry>) => void;
  onSave: () => void;
  onDiscard: () => void;
  onCardArchive: (archived: boolean) => void;
  onAddValue: () => void;
  onEditValue: (index: number, patch: Partial<ArgValue>) => void;
  onRemoveValue: (index: number) => void;
  onReload: () => void;  onOverwrite: () => void;
  onRetry: () => void;
  onStay: () => void;
  onLeaveDiscard: () => void;
  onLeaveSave: () => void;
}

/** The section's markup, driven entirely by props so its states can be rendered and asserted. */
export function ReferenceBookView(props: ReferenceBookViewProps) {
  const { refs, draft, selId } = props;
  const doc = selId ? refs.find((d) => d.id === selId) : undefined;
  const empty = refs.length === 0 && !draft;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex items-center gap-3 px-[22px] py-[14px]">
        <h2 className="m-0 text-[18px] font-semibold">Reference book</h2>
        <Tag>.testoritto/glossary/</Tag>
        <span className="flex-1" />
        <Button onClick={() => props.onCreate('link')}>{I.plus({ size: 14 })} New link</Button>
        <Button onClick={() => props.onCreate('arguments')}>{I.plus({ size: 14 })} New arguments set</Button>
      </div>
      <SaveErrorBar
        error={props.saveError}
        onReload={props.onReload}
        onOverwrite={props.onOverwrite}
        onRetry={props.onRetry}
      />
      <LeavePrompt
        pending={props.pendingLeave}
        onStay={props.onStay}
        onDiscard={props.onLeaveDiscard}
        onSave={props.onLeaveSave}
      />
      {props.refIssues.length > 0 && (
        <div className="flex flex-col gap-0.5 border-b border-[oklch(0.85_0.06_80)] bg-blocked-soft px-4 py-2 text-[12px] text-[oklch(0.5_0.12_66)]">
          {props.refIssues.map((issue, i) => (
            <span key={i}>{issue.message}</span>
          ))}
        </div>
      )}

      {empty ? (
        <div className="grid min-h-0 flex-1 place-items-center">
          <div className="flex max-w-[460px] flex-col items-center gap-3 text-center">
            {I.link({ size: 30, style: { color: 'var(--ink-faint)' } })}
            <div className="text-[14px] font-medium">Nothing in the reference book yet</div>
            <div className="text-[13px] text-ink-3">
              Keep the definitions, documents and environment values your cases repeat here — and link them from case text
              instead of copying them. Each record is one readable Markdown file under{' '}
              <span className="font-mono">.testoritto/glossary/</span>, so it travels with the repository.
            </div>
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={() => props.onCreate('link')}>
                {I.plus({ size: 14 })} New link
              </Button>
              <Button onClick={() => props.onCreate('arguments')}>{I.plus({ size: 14 })} New arguments set</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <ReferenceList
            docs={refs}
            selectedId={selId}
            query={props.query}
            kindFilter={props.kindFilter}
            showArchived={props.showArchived}
            onSelect={props.onSelect}
            onQuery={props.onQuery}
            onKindFilter={props.onKindFilter}
            onShowArchived={props.onShowArchived}
            onArchive={props.onArchive}
          />
          <ReferenceCard
            draft={draft}
            doc={doc}
            dirty={props.dirty}
            isNew={props.draftBase === null}
            saveError={props.saveError}
            onPatch={props.onPatch}
            onSave={props.onSave}
            onDiscard={props.onDiscard}
            onArchive={props.onCardArchive}
            onAddValue={props.onAddValue}
            onEditValue={props.onEditValue}
            onRemoveValue={props.onRemoveValue}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The reference book section: the catalog of `link` and `arguments` records, stored one
 * Markdown file per record under `.testoritto/glossary/`. The section coexists with the
 * case tree and runs in the sidebar; nothing here writes until the user saves explicitly.
 */
export function ReferenceBook() {
  const ctx = useApp();
  return (
    <ReferenceBookView
      refs={ctx.refs}
      refIssues={ctx.refIssues}
      selId={ctx.refSelId}
      draft={ctx.refDraft}
      draftBase={ctx.refDraftBase}
      dirty={ctx.refDirty}
      saveError={ctx.refSaveError}
      pendingLeave={ctx.refPendingLeave}
      query={ctx.refQuery}
      kindFilter={ctx.refKindFilter}
      showArchived={ctx.refShowArchived}
      onCreate={ctx.createRefEntry}
      onSelect={ctx.selectRefEntry}
      onQuery={ctx.setRefQuery}
      onKindFilter={ctx.setRefKindFilter}
      onShowArchived={ctx.setRefShowArchived}
      onArchive={(id, archived) => void ctx.setRefArchived(id, archived)}
      onPatch={ctx.editRefDraft}
      onSave={() => void ctx.saveRefEntry()}
      onDiscard={ctx.discardRefDraft}
      onCardArchive={(archived) => ctx.refDraft && void ctx.setRefArchived(ctx.refDraft.id, archived)}
      onAddValue={ctx.addRefValue}
      onEditValue={ctx.editRefValue}
      onRemoveValue={ctx.removeRefValue}
      onReload={() => void ctx.reloadRefEntry()}
      onOverwrite={() => void ctx.saveRefEntry({ force: true })}
      onRetry={() => void ctx.saveRefEntry()}
      onStay={() => void ctx.resolveRefLeave('stay')}
      onLeaveDiscard={() => void ctx.resolveRefLeave('discard')}
      onLeaveSave={() => void ctx.resolveRefLeave('save')}
    />
  );
}
