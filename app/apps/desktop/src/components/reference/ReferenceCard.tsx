import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Input, Tag, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { openExternal } from '@/lib/nwjs';
import { isSafeHttpUrl, type ArgValue, type ReferenceEntry } from '@/schemas/reference-book';
import type { ReferenceDoc } from '@/services/reference-book';
import { renderMarkdown } from '@/utils/markdown';
import type { RefSaveError } from '@/types';
import { ReferenceValues } from './ReferenceValues';

/** Hand a validated http(s) URL to the OS browser — never opened inside the app, never automatically. */
const openUrl = (url: string): void => {
  if (isSafeHttpUrl(url)) openExternal(url);
};

export interface ReferenceCardProps {
  draft: ReferenceEntry | null;
  /** The saved record the draft belongs to (`undefined` for a record that is not written yet). */
  doc: ReferenceDoc | undefined;
  dirty: boolean;
  isNew: boolean;
  saveError: RefSaveError | null;
  onPatch: (patch: Partial<ReferenceEntry>) => void;
  onSave: () => void;
  onDiscard: () => void;
  onArchive: (archived: boolean) => void;
  onAddValue: () => void;
  onEditValue: (index: number, patch: Partial<ArgValue>) => void;
  onRemoveValue: (index: number) => void;
}

/** Comma-separated text that keeps the user's keystrokes (see ReferenceValues' DraftText). */
export function CommaList({
  value,
  commit,
  disabled,
  placeholder,
}: {
  value: string[];
  commit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState(value.join(', '));
  return (
    <Input
      disabled={disabled}
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
    />
  );
}

/** Why a file is shown but never rewritten — the record is subject to the user's own editor. */
export function ReadonlyNotice({ issues }: { issues: { code: string; message: string }[] }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-[oklch(0.85_0.06_80)] bg-blocked-soft px-3 py-2.5 text-[12.5px] text-[oklch(0.5_0.12_66)]">
      <div className="flex items-center gap-2 font-semibold">{I.warn({ size: 14 })} This file can't be edited in the app</div>
      {issues.map((issue, i) => (
        <div key={i} className="pl-[22px]">
          {issue.message}
        </div>
      ))}
      <div className="pl-[22px] text-[11.5px] opacity-80">
        The file is shown as it is and is never rewritten — fix it in an editor to make it editable again.
      </div>
    </div>
  );
}

/**
 * The URL row: plain text until opened. The link only reaches the OS through the explicit
 * "Open" click, and only when it is a credential-free http(s) URL — never followed to render.
 */
export function ReferenceUrlField({
  url,
  disabled,
  error,
  onChange,
  onOpen,
}: {
  url: string;
  disabled?: boolean;
  error?: string | null;
  onChange: (url: string) => void;
  onOpen: (url: string) => void;
}) {
  const trimmed = url.trim();
  const canOpen = isSafeHttpUrl(trimmed);
  return (
    <div className="flex flex-col gap-1">
      <Field label="URL">
        <div className="flex items-center gap-1.5">
          <Input
            disabled={disabled}
            className={cn('font-mono', error && 'border-fail')}
            value={url}
            placeholder="https://…"
            onChange={(e) => onChange(e.target.value)}
          />
          <Button
            size="sm"
            disabled={disabled || !canOpen}
            title={canOpen ? 'Open in your browser' : 'Enter a full http(s) URL first'}
            onClick={() => onOpen(trimmed)}
          >
            {I.link({ size: 13 })} Open
          </Button>
        </div>
      </Field>
      {error && <div className="text-[11.5px] text-fail">{error}</div>}
    </div>
  );
}

/**
 * The selected record: edit its fields, save explicitly, archive/restore it, or read a file
 * the app can't represent. Purely presentational — the draft lives in the store and nothing
 * is written until the user saves.
 */
export function ReferenceCard({
  draft,
  doc,
  dirty,
  isNew,
  saveError,
  onPatch,
  onSave,
  onDiscard,
  onArchive,
  onAddValue,
  onEditValue,
  onRemoveValue,
}: ReferenceCardProps) {
  const [preview, setPreview] = useState(false);

  if (!draft) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center text-ink-faint">
        <div className="flex max-w-[380px] flex-col items-center gap-2.5 text-center">
          {I.link({ size: 28, style: { color: 'var(--ink-faint)' } })}
          <div className="text-[13.5px] text-ink-3">
            Select a record on the left, or create a link to a document / an arguments set for automation.
          </div>
        </div>
      </div>
    );
  }

  const readonly = !!doc?.readonly;
  const issues = saveError?.kind === 'fields' ? saveError.issues : [];
  const issueFor = (field: 'title' | 'description' | 'url') => issues.find((i) => i.field === field)?.message ?? null;
  const valueIssue = (index: number) => issues.find((i) => i.field === 'values' && i.index === index)?.message ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="flex flex-col gap-3.5 px-[26px] py-[22px]">
        <div className="flex items-center gap-2.5">
          <h3 className="m-0 text-[16px] font-semibold">{isNew ? 'New record' : 'Record'}</h3>
          <Tag accent={draft.kind === 'link'}>{draft.kind === 'link' ? 'link' : 'arguments'}</Tag>
          {draft.archived && <Tag>archived</Tag>}
          {readonly && <Tag className="border-fail text-fail">read-only</Tag>}
          <span className="flex-1" />
          {!isNew && (
            <Button
              size="sm"
              variant="ghost"
              disabled={readonly}
              title={readonly ? 'This file cannot be changed in the app' : undefined}
              onClick={() => onArchive(!draft.archived)}
            >
              {draft.archived ? I.undo({ size: 13 }) : I.download({ size: 13 })}
              {draft.archived ? 'Restore' : 'Archive'}
            </Button>
          )}
          {dirty && (
            <Button size="sm" variant="ghost" onClick={onDiscard}>
              Discard changes
            </Button>
          )}
          <Button variant="primary" size="sm" disabled={readonly || (!dirty && !isNew)} onClick={onSave}>
            {I.check({ size: 13 })} Save
          </Button>
        </div>

        {readonly && <ReadonlyNotice issues={doc?.issues ?? []} />}

        <Field label="Title">
          <Input
            disabled={readonly}
            className={cn(issueFor('title') && 'border-fail')}
            value={draft.title}
            placeholder={draft.kind === 'link' ? 'Payments runbook' : 'dev'}
            onChange={(e) => onPatch({ title: e.target.value })}
          />
        </Field>
        {issueFor('title') && <div className="-mt-2.5 text-[11.5px] text-fail">{issueFor('title')}</div>}

        <Field label="Also known as">
          <CommaList
            key={draft.id}
            disabled={readonly}
            value={draft.aliases}
            placeholder="payments, PSP"
            commit={(text) => onPatch({ aliases: text.split(',').map((a) => a.trim()).filter(Boolean) })}
          />
        </Field>

        {draft.kind === 'link' && (
          <ReferenceUrlField
            url={draft.url ?? ''}
            disabled={readonly}
            error={issueFor('url')}
            onChange={(url) => onPatch({ url })}
            onOpen={(url) => openUrl(url)}
          />
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center text-ink-3">{I.edit({ size: 15 })}</span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">Description</span>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
              {preview ? I.edit({ size: 13 }) : I.eye({ size: 13 })} {preview ? 'Edit' : 'Preview'}
            </Button>
          </div>
          {preview ? (
            <div className="rounded-md border border-dashed border-border px-4 py-[14px] font-ui text-[14.5px] leading-[1.6] text-[oklch(0.30_0.012_60)]">
              {draft.description.trim() ? (
                renderMarkdown(draft.description, 'ref')
              ) : (
                <span className="text-ink-3">Nothing written yet.</span>
              )}
            </div>
          ) : (
            <Textarea
              disabled={readonly}
              className={cn('min-h-[110px]', issueFor('description') && 'border-fail')}
              value={draft.description}
              placeholder={
                draft.kind === 'link'
                  ? 'What this document is for, and when to open it…'
                  : 'What this set is for, and where it is used…'
              }
              onChange={(e) => onPatch({ description: e.target.value })}
            />
          )}
          {issueFor('description') && <div className="text-[11.5px] text-fail">{issueFor('description')}</div>}
        </div>

        {draft.kind === 'arguments' && (
          <ReferenceValues
            values={draft.values ?? []}
            recordId={draft.id}
            disabled={readonly}
            issueFor={valueIssue}
            onAdd={onAddValue}
            onEdit={onEditValue}
            onRemove={onRemoveValue}
          />
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3 font-mono text-[11px] text-ink-faint">
          <span>{draft.id}</span>
          {!isNew && doc && <span>· {doc.rel}</span>}
          {!isNew && doc && <span>· rev {doc.revision.slice(0, 8)}</span>}
          {dirty && <span className="text-accent-ink">· unsaved</span>}
        </div>
      </div>
    </div>
  );
}
