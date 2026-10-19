import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ReferenceEntry } from '@/schemas/reference-book';
import type { ReferenceDoc } from '@/services/reference-book';
import { ReferenceBookView, type ReferenceBookViewProps } from './ReferenceBook';

const link = (patch: Partial<ReferenceEntry> = {}): ReferenceEntry => ({
  id: 'aaaa',
  kind: 'link',
  title: 'Payments runbook',
  aliases: ['payments'],
  archived: false,
  description: 'How to debug a stuck payment.',
  url: 'https://example.com/payments',
  ...patch,
});

const doc = (entry: ReferenceEntry, patch: Partial<ReferenceDoc> = {}): ReferenceDoc => ({
  id: entry.id,
  rel: `.testoritto/glossary/${entry.id}.md`,
  entry,
  extra: {},
  eol: '\n',
  revision: 'rev-' + entry.id,
  readonly: false,
  issues: [],
  ...patch,
});

const noop = () => {};

/** Rendered HTML with the entities React emits decoded, so assertions read as plain text. */
const decode = (html: string): string =>
  html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

/** The section is purely prop-driven, so every UI state can be rendered and asserted directly. */
const view = (patch: Partial<ReferenceBookViewProps> = {}): string =>
  decode(
    renderToStaticMarkup(
      createElement(ReferenceBookView, {
        refs: [],
        refIssues: [],
        selId: null,
        draft: null,
        draftBase: null,
        dirty: false,
        saveError: null,
        pendingLeave: null,
        query: '',
        kindFilter: 'all',
        showArchived: false,
        onCreate: noop,
        onSelect: noop,
        onQuery: noop,
        onKindFilter: noop,
        onShowArchived: noop,
        onArchive: noop,
        onPatch: noop,
        onSave: noop,
        onDiscard: noop,
        onCardArchive: noop,
        onAddValue: noop,
        onEditValue: noop,
        onRemoveValue: noop,
        onReload: noop,
        onOverwrite: noop,
        onRetry: noop,
        onStay: noop,
        onLeaveDiscard: noop,
        onLeaveSave: noop,
        ...patch,
      }),
    ),
  );

describe('catalog view', () => {
  it('invites creating the first record and names the storage folder', () => {
    const out = view();
    expect(out).toContain('Nothing in the reference book yet');
    expect(out).toContain('.testoritto/glossary/');
    expect(out).toContain('New link');
    expect(out).toContain('New arguments set');
    expect(out).not.toContain('Search the reference book');
  });

  it('lists records and hides archived ones until asked', () => {
    const old = doc(link({ id: 'cccc', title: 'Legacy wiki', archived: true }));
    expect(view({ refs: [doc(link()), old] })).not.toContain('Legacy wiki');
    const withArchive = view({ refs: [doc(link()), old], showArchived: true });
    expect(withArchive).toContain('Payments runbook');
    expect(withArchive).toContain('Legacy wiki');
    expect(withArchive).toContain('Archive (1)');
  });

  it('filters by kind and by search over title, aliases and description', () => {
    const stage = doc(
      link({ id: 'bbbb', kind: 'arguments', title: 'stage', aliases: [], url: undefined, values: [], description: 'Stage environment values.' }),
    );
    const refs = [doc(link()), stage];
    expect(view({ refs, kindFilter: 'arguments' })).not.toContain('Payments runbook');
    expect(view({ refs, kindFilter: 'arguments' })).toContain('stage');
    expect(view({ refs, query: 'payments' })).toContain('Payments runbook'); // title + alias
    expect(view({ refs, query: 'stuck payment' })).not.toContain('stage'); // description
    expect(view({ refs, query: 'nothing here' })).toContain('Nothing matches these filters');
  });

  it('marks read-only files in the list', () => {
    const broken = doc(link({ title: 'Broken' }), { readonly: true });
    expect(view({ refs: [broken] })).toContain('read-only');
  });

  it('shows catalog-level problems (an unreadable folder)', () => {
    const refIssues = [
      { code: 'glossary-read', message: '.testoritto exists but is not a directory; the reference book cannot be read.' },
    ];
    expect(view({ refIssues })).toContain('.testoritto exists but is not a directory');
  });
});

describe('record card', () => {
  it('explains a read-only record and keeps its fields disabled', () => {
    const broken = doc(link({ title: 'Broken' }), {
      readonly: true,
      issues: [{ code: 'value-type', message: 'values[0] ("retries"): expected a number value.' }],
    });
    const out = view({ refs: [broken], selId: 'aaaa', draft: broken.entry, draftBase: broken.revision });
    expect(out).toContain("This file can't be edited in the app");
    expect(out).toContain('expected a number value');
    expect(out).toMatch(/<textarea[^>]*disabled/);
  });

  it('offers opening a valid URL and refuses an unsafe one', () => {
    const open = (url: string) => view({ refs: [doc(link({ url }))], selId: 'aaaa', draft: link({ url }), draftBase: 'rev-aaaa' });
    // A valid URL renders an enabled Open button; an unsafe one renders it disabled.
    expect(open('https://example.com/payments')).toMatch(/Open/);
    expect(open('https://example.com/payments')).not.toMatch(/<button[^>]*disabled[^>]*title="Enter a full http\(s\) URL first"/);
    expect(open('javascript:alert(1)')).toMatch(/<button[^>]*disabled[^>]*title="Enter a full http\(s\) URL first"/);
    expect(open('ftp://example.com/file')).toMatch(/title="Enter a full http\(s\) URL first"/);
  });

  it('warns about secrets and types the values of an arguments set', () => {
    const args = link({
      id: 'bbbb',
      kind: 'arguments',
      title: 'dev',
      url: undefined,
      values: [
        { key: 'retries', type: 'number', value: 3 },
        { key: 'env', type: 'enum', value: 'dev', options: ['dev', 'stage'] },
      ],
    });
    const out = view({ refs: [doc(args)], selId: 'bbbb', draft: args, draftBase: 'rev-bbbb' });
    expect(out).toContain('Never store passwords or tokens here');
    expect(out).toContain('Add value');
    expect(out).toContain('options');
    expect(out).toContain('one of'); // the enum type label
    expect(out).toContain('dev, stage');
  });

  it('reports a failed save without dropping the draft', () => {
    const out = view({
      refs: [doc(link())],
      selId: 'aaaa',
      draft: link({ title: '' }),
      draftBase: 'rev-aaaa',
      dirty: true,
      saveError: { kind: 'fields', issues: [{ field: 'title', message: 'A title is required' }] },
    });
    expect(out).toContain('Not saved — fix these first');
    expect(out).toContain('A title is required');
    expect(out).toContain('unsaved');
  });

  it('offers reload or overwrite when the file changed outside the app', () => {
    const out = view({
      refs: [doc(link())],
      selId: 'aaaa',
      draft: link({ title: 'Mine' }),
      draftBase: 'rev-aaaa',
      dirty: true,
      saveError: { kind: 'conflict', message: 'aaaa.md changed outside the app since it was read.' },
    });
    expect(out).toContain('changed outside the app');
    expect(out).toContain('Reload from disk');
    expect(out).toContain('Overwrite');
    expect(out).toContain('Mine');
  });

  it('reports an I/O failure with a retry', () => {
    const out = view({
      draft: link({ title: 'Mine' }),
      dirty: true,
      saveError: { kind: 'io', message: 'EACCES: permission denied' },
    });
    expect(out).toContain('EACCES: permission denied');
    expect(out).toContain('Try again');
  });
});

describe('draft protection', () => {
  it('asks stay / save / discard before a navigation drops unsaved edits', () => {
    const out = view({
      refs: [doc(link())],
      selId: 'aaaa',
      draft: link({ title: 'Changed' }),
      draftBase: 'rev-aaaa',
      dirty: true,
      pendingLeave: { label: 'the runs list', proceed: noop },
    });
    expect(out).toContain('unsaved changes');
    expect(out).toContain('the runs list');
    expect(out).toContain('Keep editing');
    expect(out).toContain('Discard and open');
    expect(out).toContain('Save and open');
  });

  it('shows no prompt while nothing is dirty', () => {
    expect(view({ refs: [doc(link())], selId: 'aaaa', draft: link(), draftBase: 'rev-aaaa' })).not.toContain('Discard and open');
  });
});
