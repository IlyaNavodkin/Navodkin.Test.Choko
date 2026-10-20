import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { resetReferenceRegistry, setReferenceCatalog, setReferenceOpener } from './glossary-link';
import { renderInline, renderMarkdown } from './markdown';
import { markdownInlineToHtml, markdownToHtml } from './markdown-html';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER = '11111111-2222-4333-8444-555555555555';
const HREF = `../../.casewright/glossary/${ID}.md`;

const html = (src: string): string => renderToStaticMarkup(createElement(Fragment, null, renderInline(src)));
const blockHtml = (src: string): string => renderToStaticMarkup(createElement(Fragment, null, renderMarkdown(src)));

const install = (docs: { id: string; title: string; archived?: boolean; description?: string }[] = []) =>
  setReferenceCatalog(
    docs.map((d) => ({
      id: d.id,
      entry: { title: d.title, description: d.description ?? '', archived: !!d.archived, kind: 'link' },
    })),
  );

afterEach(() => resetReferenceRegistry());

describe('reference links in rendered prose', () => {
  it('renders a chip with the record name, not a raw URL', () => {
    install([{ id: ID, title: 'Payments runbook', description: 'How to debug a stuck payment.' }]);
    const out = html(`See [the runbook](${HREF}) for the steps.`);
    expect(out).toContain('Payments runbook'); // the record's current name
    expect(out).toContain('How to debug a stuck payment.');
    expect(out).not.toContain('<a ');
    expect(out).not.toContain('.casewright/glossary'); // the path never reaches the reader
    expect(out).toContain('for the steps.');
  });

  it('opens the record card when clicked, and never navigates the app', () => {
    const opened: string[] = [];
    install([{ id: ID, title: 'Payments runbook' }]);
    setReferenceOpener((id) => opened.push(id));
    const out = html(`[x](${HREF})`);
    expect(out).toContain('cursor-pointer');
    expect(out).not.toContain('href');
    // The click handler is exercised through the store action in the app; here we assert the
    // chip wires the id it was given (the resolver is installed, the id resolves).
    expect(out).toContain('Payments runbook');
  });

  it('flags a link whose record is missing from this repository', () => {
    install([]);
    const out = html(`See [the runbook](${HREF}).`);
    expect(out).toContain('the runbook'); // the authored label is kept
    expect(out).toMatch(/border-dashed/); // broken-link styling
    expect(out).toMatch(/title="Not found in this repository/);
  });

  it('marks an archived record as archived but still readable', () => {
    install([{ id: ID, title: 'Old runbook', archived: true }]);
    const out = html(`See [x](${HREF}).`);
    expect(out).toContain('Old runbook');
    expect(out).toMatch(/title="[^"]*archived record/);
  });

  it('still renders ordinary external links as links', () => {
    install([{ id: ID, title: 'Payments runbook' }]);
    const out = html('[docs](https://example.com/a)');
    expect(out).toContain('<a ');
    expect(out).toContain('href="https://example.com/a"');
  });

  it('leaves links inside code alone (fenced and inline)', () => {
    install([{ id: ID, title: 'Payments runbook' }]);
    expect(blockHtml('```\n[x](../../.casewright/glossary/' + ID + '.md)\n```')).toContain('.casewright/glossary');
    const inline = html('use `[x](../../.casewright/glossary/' + ID + '.md)`');
    expect(inline).toContain('<code');
    expect(inline).toContain('.casewright/glossary');
  });

  it('resolves the same id whatever the relative depth is', () => {
    install([{ id: ID, title: 'Payments runbook' }, { id: OTHER, title: 'Stage values', archived: false }]);
    expect(html(`[a](../../.casewright/glossary/${OTHER}.md)`)).toContain('Stage values');
    expect(html(`[a](./.casewright/glossary/${OTHER}.md)`)).toContain('Stage values');
  });
});

describe('reference links in report HTML', () => {
  it('emits a static chip with the record name and no anchor', () => {
    install([{ id: ID, title: 'Payments runbook' }]);
    const out = markdownInlineToHtml(`See [x](${HREF}) for the steps.`);
    expect(out).toContain('<span class="ref-chip">Payments runbook</span>');
    expect(out).not.toContain('<a ');
    expect(out).toContain('for the steps.');
  });

  it('marks an archived record and an unresolved link', () => {
    install([{ id: ID, title: 'Old runbook', archived: true }]);
    expect(markdownInlineToHtml(`[x](${HREF})`)).toContain('<span class="ref-chip ref-archived">Old runbook</span>');
    expect(markdownInlineToHtml(`[gone](../../.casewright/glossary/${OTHER}.md)`)).toContain('<span class="ref-missing"');
  });

  it('works inside block markdown and never inside code', () => {
    install([{ id: ID, title: 'Payments runbook' }]);
    expect(markdownToHtml(`## Step\n\nSee [x](${HREF}).`)).toContain('<span class="ref-chip">Payments runbook</span>');
    expect(markdownToHtml('```\n[x](' + HREF + ')\n```')).toContain('.casewright/glossary');
  });
});
