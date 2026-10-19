import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Input, Modal, ModalBody, ModalHeader, Tag } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { ReferenceDoc } from '@/services/reference-book';
import { useAppStore } from '@/store/app-store';
import { glossaryLinkMarkdown } from '@/utils/glossary-link';

export interface ReferencePickerProps {
  docs: ReferenceDoc[];
  onPick: (doc: ReferenceDoc) => void;
  onClose: () => void;
}

/** Search over title/aliases/description of the insertable records. */
const matches = (doc: ReferenceDoc, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const { title, aliases, description } = doc.entry;
  return [title, ...aliases, description].some((f) => f.toLowerCase().includes(q));
};

/**
 * «From the reference book» — choose a `link` record to insert into the field being edited.
 * Archived records are deliberately not offered: they stay readable through existing links.
 */
export function ReferencePicker({ docs, onPick, onClose }: ReferencePickerProps) {
  const [query, setQuery] = useState('');
  const filtered = docs.filter((d) => matches(d, query));

  return (
    <Modal onClose={onClose} maxWidth={520}>
      <ModalHeader>
        {I.link({ size: 15 })}
        <h3>From the reference book</h3>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </ModalHeader>
      <ModalBody className="flex max-h-[420px] flex-col gap-2.5">
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-2 text-ink-faint">{I.search({ size: 14 })}</span>
          <Input
            autoFocus
            className="h-[30px] pl-7"
            placeholder="Search links…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-border-2 px-3 py-6 text-center text-[12.5px] text-ink-3">
            {docs.length === 0
              ? 'No links in the reference book yet — add one in the Reference section first.'
              : 'Nothing matches this search.'}
          </div>
        ) : (
          <div className="flex flex-col gap-1 overflow-auto">
            {filtered.map((doc) => (
              <button
                key={doc.id}
                className={cn(
                  'flex flex-col gap-0.5 rounded-md border border-border bg-panel px-2.5 py-2 text-left transition hover:border-accent-line hover:bg-accent-soft',
                )}
                onClick={() => onPick(doc)}
              >
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{doc.entry.title || doc.id}</span>
                  {doc.entry.aliases.length > 0 && <Tag>{doc.entry.aliases.join(', ')}</Tag>}
                </span>
                {(doc.entry.description || doc.entry.url) && (
                  <span className="truncate text-[11.5px] text-ink-faint">
                    {doc.entry.description.split('\n')[0] || doc.entry.url}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        <div className="text-[11px] text-ink-faint">
          Inserting writes a plain Markdown link to the record's file, so the text still reads in any Markdown viewer.
        </div>
      </ModalBody>
    </Modal>
  );
}

export interface RefLinkButtonProps {
  /** Repo-relative path of the document being edited — the inserted link is relative to it. */
  baseRel: string;
  /** Receives the ready Markdown link; the caller decides where it lands. */
  onInsert: (markdown: string) => void;
}

const buttonClass =
  'inline-flex h-[26px] items-center gap-1 rounded-sm border border-transparent bg-transparent px-1.5 text-[11.5px] text-ink-2 hover:bg-raise hover:text-ink';

/**
 * Toolbar button that opens the reference-book picker. The picker itself is rendered at the app
 * root (like every other modal), because an inline-rendered dialog would be trapped in the
 * toolbar's stacking/positioning context.
 */
export function RefLinkButton({ baseRel, onInsert }: RefLinkButtonProps) {
  const openRefPicker = useAppStore((s) => s.openRefPicker);
  return (
    <button
      className={buttonClass}
      title="Insert a link from the reference book"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => openRefPicker({ baseRel, insert: onInsert })}
    >
      {I.link({ size: 13 })} Reference
    </button>
  );
}

/** The app-root host for the picker: reads the request from the store and inserts on choice. */
export function ReferencePickerHost() {
  const request = useAppStore((s) => s.refPicker);
  const closeRefPicker = useAppStore((s) => s.closeRefPicker);
  // Only the records that make sense to insert right now: links, not archived, not read-only.
  const docs = useAppStore((s) => s.refs).filter((d) => d.entry.kind === 'link' && !d.entry.archived && !d.readonly);

  if (!request) return null;
  return (
    <ReferencePicker
      docs={docs}
      onClose={closeRefPicker}
      onPick={(doc) => {
        const insert = request.insert;
        closeRefPicker();
        insert(glossaryLinkMarkdown(request.baseRel, doc.id, doc.entry.title));
      }}
    />
  );
}
