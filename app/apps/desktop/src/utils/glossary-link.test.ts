import { describe, expect, it } from 'vitest';
import {
  glossaryHrefFrom,
  glossaryHrefId,
  glossaryIdsIn,
  glossaryLinkMarkdown,
  insertAtCursor,
  linkLabel,
  rebaseCaseLinks,
  relativePath,
  rewriteGlossaryHrefs,
} from './glossary-link';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const FILE = `.ch/glossary/${ID}.md`;

describe('glossaryHrefId', () => {
  it('reads the id out of a relative link to a record file', () => {
    expect(glossaryHrefId(`.ch/glossary/${ID}.md`)).toBe(ID);
    expect(glossaryHrefId(`../.ch/glossary/${ID}.md`)).toBe(ID);
    expect(glossaryHrefId(`../../../.ch/glossary/${ID}.md`)).toBe(ID);
    expect(glossaryHrefId(`  ./.ch/glossary/${ID}.md  `)).toBe(ID);
  });

  it('refuses anything that is not a relative glossary file link', () => {
    expect(glossaryHrefId(`${ID}.md`)).toBeNull();
    expect(glossaryHrefId(`/abs${FILE}`)).toBeNull();
    expect(glossaryHrefId(`sub/.ch/glossary/${ID}.md`)).toBeNull();
    expect(glossaryHrefId(`https://example.com/.ch/glossary/${ID}.md`)).toBeNull();
    expect(glossaryHrefId(`../../notes.md`)).toBeNull();
    expect(glossaryHrefId(`.ch/glossary/../secrets.md`)).toBeNull();
    expect(glossaryHrefId(`.ch/glossary/nested/${ID}.md`)).toBeNull();
    expect(glossaryHrefId('')).toBeNull();
  });
});

describe('relativePath', () => {
  it('walks up from the containing folder', () => {
    expect(relativePath('case.md', FILE)).toBe(FILE);
    expect(relativePath('Suite/case.md', FILE)).toBe(`../${FILE}`);
    expect(relativePath('Workspace/Suite/case.md', FILE)).toBe(`../../${FILE}`);
  });

  it('handles targets inside the same tree', () => {
    expect(relativePath('A/B/case.md', 'A/B/other.md')).toBe('other.md');
    expect(relativePath('A/B/case.md', 'A/C/other.md')).toBe('../C/other.md');
    expect(relativePath('A/B/case.md', 'A/B/C/d.md')).toBe('C/d.md');
  });
});

describe('glossaryHrefFrom / glossaryLinkMarkdown', () => {
  it('builds a link relative to the document that holds it', () => {
    expect(glossaryHrefFrom('Suite/case.md', ID)).toBe(`../${FILE}`);
    expect(glossaryLinkMarkdown('Suite/case.md', ID, 'Payments runbook')).toBe(`[Payments runbook](../${FILE})`);
  });

  it('drops brackets that the markdown whitelist cannot represent, falling back to the id', () => {
    expect(linkLabel('a [b] c')).toBe('a b c');
    expect(glossaryLinkMarkdown('case.md', ID, '[]')).toBe(`[${ID}](${FILE})`);
  });
});

describe('insertAtCursor', () => {
  it('inserts at the caret and reports where the caret lands', () => {
    const r = insertAtCursor('Setup: .', 7, 7, '[x](y)');
    expect(r).toEqual({ value: 'Setup: [x](y).', caret: 13 });
  });

  it('replaces a selection and clamps out-of-range offsets', () => {
    expect(insertAtCursor('abcdef', 1, 4, 'X')).toEqual({ value: 'aXef', caret: 2 });
    expect(insertAtCursor('abc', 99, 99, 'X')).toEqual({ value: 'abcX', caret: 4 });
    expect(insertAtCursor('abc', -5, 2, 'X')).toEqual({ value: 'Xc', caret: 1 });
  });
});

describe('rewriteGlossaryHrefs', () => {
  it('recomputes the path for a moved document, keeping the label', () => {
    const text = `See [Payments runbook](${FILE}) and [Stage](${FILE}).`;
    expect(rewriteGlossaryHrefs(text, 'New/Deep/case.md')).toBe(
      `See [Payments runbook](../../${FILE}) and [Stage](../../${FILE}).`,
    );
  });

  it('leaves other links, absolute paths and plain text alone', () => {
    const text = 'See [docs](https://example.com/a) and [notes](notes.md).';
    expect(rewriteGlossaryHrefs(text, 'X/case.md')).toBe(text);
  });

  it('never touches links inside code (fenced or inline)', () => {
    const text = [
      `Inline \`[l](${FILE})\` stays.`,
      '```',
      `[code](${FILE})`,
      '```',
      `Outside [real](${FILE}).`,
    ].join('\n');
    const next = rewriteGlossaryHrefs(text, 'A/B/case.md');
    expect(next).toContain(`Inline \`[l](${FILE})\` stays.`);
    expect(next).toContain(`[code](${FILE})`);
    expect(next).toContain(`Outside [real](../../${FILE}).`);
  });

  it('is a no-op when the path is already right', () => {
    const text = `See [x](../${FILE}).`;
    expect(rewriteGlossaryHrefs(text, 'Suite/case.md')).toBe(text);
  });
});

describe('rebaseCaseLinks', () => {
  const ID2 = '11111111-2222-4333-8444-555555555555';
  const before = `[A](../.ch/glossary/${ID}.md)`;
  const kase = {
    objective: `See ${before} and [docs](https://example.com).`,
    systems: [`${before} system`],
    setup: [{ name: 'Setup', body: `Do ${before}.` }, { name: 'Plain', body: 'no links' }],
    steps: [{ text: `${before} then stop` }, { text: 'nothing' }],
    expected: [`${before}`],
  };

  it('re-anchors every link-bearing field to the new location', () => {
    const next = rebaseCaseLinks(kase, 'A/B/case.md');
    expect(next).not.toBe(kase);
    expect(next.objective).toBe(`See [A](../../.ch/glossary/${ID}.md) and [docs](https://example.com).`);
    expect(next.systems[0]).toBe(`[A](../../.ch/glossary/${ID}.md) system`);
    expect(next.setup[0].body).toBe(`Do [A](../../.ch/glossary/${ID}.md).`);
    expect(next.setup[1]).toBe(kase.setup[1]); // an untouched row keeps its identity
    expect(next.steps[0].text).toBe(`[A](../../.ch/glossary/${ID}.md) then stop`);
    expect(next.steps[1]).toBe(kase.steps[1]);
    expect(next.expected[0]).toBe(`[A](../../.ch/glossary/${ID}.md)`);
  });

  it('returns the very same object when nothing needs to change', () => {
    // `../` is already correct one level deep.
    expect(rebaseCaseLinks(kase, 'Suite/case.md')).toBe(kase);
    const noLinks = { objective: 'plain', systems: [], setup: [], steps: [], expected: [] };
    expect(rebaseCaseLinks(noLinks, 'A/B/case.md')).toBe(noLinks);
    const other = {
      objective: `[x](https://example.com/a)`,
      systems: [],
      setup: [],
      steps: [],
      expected: [],
    };
    expect(rebaseCaseLinks(other, 'A/B/case.md')).toBe(other);
  });

  it('keeps labels and other record links intact while re-anchoring', () => {
    const text = `[One](../.ch/glossary/${ID}.md) [Two](../.ch/glossary/${ID2}.md)`;
    const next = rebaseCaseLinks({ objective: text, systems: [], setup: [], steps: [], expected: [] }, 'X/Y/c.md');
    expect(next.objective).toBe(
      `[One](../../.ch/glossary/${ID}.md) [Two](../../.ch/glossary/${ID2}.md)`,
    );
  });
});

describe('glossaryIdsIn', () => {
  it('collects referenced records in order, skipping code and foreign links', () => {
    const other = '11111111-2222-4333-8444-555555555555';
    const text = [
      `A [one](${FILE})`,
      '```',
      `[skipped](${FILE})`,
      '```',
      `B [two](../.ch/glossary/${other}.md) and \`[inline](${FILE})\``,
      'C [docs](https://example.com)',
    ].join('\n');
    expect(glossaryIdsIn(text)).toEqual([ID, other]);
  });

  it('finds nothing in text without glossary links', () => {
    expect(glossaryIdsIn('nothing to see')).toEqual([]);
    expect(glossaryIdsIn('[docs](https://example.com)')).toEqual([]);
  });
});
