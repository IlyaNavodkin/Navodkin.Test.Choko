import { describe, expect, it } from 'vitest';
import { GLOSSARY_DIR, glossaryRel, parseReferenceEntry, serializeReferenceEntry } from './reference-book';
import type { ReferenceEntry } from '@/schemas/reference-book';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';

const link = (patch: Partial<ReferenceEntry> = {}): ReferenceEntry => ({
  id: ID,
  kind: 'link',
  title: 'Payments runbook',
  aliases: ['payments', 'PSP'],
  archived: false,
  description: 'How to debug a stuck payment.\n\nSee the on-call channel.',
  url: 'https://example.com/payments?tab=runbook',
  ...patch,
});

const args = (patch: Partial<ReferenceEntry> = {}): ReferenceEntry => ({
  id: ID,
  kind: 'arguments',
  title: 'dev',
  aliases: [],
  archived: false,
  description: 'Development environment values.',
  values: [
    { key: 'host', type: 'string', value: 'dev.example.com' },
    { key: 'baseUrl', type: 'url', value: 'https://dev.example.com' },
    { key: 'retries', type: 'number', value: 3 },
    { key: 'verbose', type: 'boolean', value: true },
    { key: 'env', type: 'enum', value: 'dev', options: ['dev', 'stage'] },
  ],
  ...patch,
});

/** Serialize → parse, asserting the entry survives unchanged and the file is well-formed. */
function roundTrip(entry: ReferenceEntry, extra?: Record<string, unknown>, eol?: '\n' | '\r\n') {
  const text = serializeReferenceEntry(entry, { extra, eol });
  const parsed = parseReferenceEntry(text, entry.id);
  return { text, parsed };
}

describe('glossary paths', () => {
  it('places records under .ch/glossary with the id as the file stem', () => {
    expect(GLOSSARY_DIR).toBe('.ch/glossary');
    expect(glossaryRel(ID)).toBe('.ch/glossary/0f8fad5b-d9cb-469f-a165-70867728950e.md');
  });
});

describe('serializeReferenceEntry', () => {
  it('writes the documented front matter and body', () => {
    const text = serializeReferenceEntry(link());
    expect(text).toBe(
      [
        '---',
        'schema_version: 1',
        `id: ${ID}`,
        'kind: link',
        'title: Payments runbook',
        'aliases: [payments, PSP]',
        'archived: false',
        'url: https://example.com/payments?tab=runbook',
        '---',
        '',
        'How to debug a stuck payment.',
        '',
        'See the on-call channel.',
        '',
      ].join('\n'),
    );
  });

  it('writes typed values, including enum options', () => {
    const text = serializeReferenceEntry(args());
    expect(text).toContain('values:\n');
    expect(text).toContain('  - key: retries\n    type: number\n    value: 3\n');
    expect(text).toContain('  - key: verbose\n    type: boolean\n    value: true\n');
    expect(text).toContain('    options: [dev, stage]\n');
  });

  it('writes an empty values list for an empty set', () => {
    const text = serializeReferenceEntry(args({ values: [] }));
    expect(text).toContain('\nvalues: []\n');
    expect(parseReferenceEntry(text, ID).entry.values).toEqual([]);
  });

  it('omits an empty url and an empty description body', () => {
    const text = serializeReferenceEntry(link({ url: '', description: '' }));
    expect(text).not.toContain('url:');
    expect(text).toBe(`---\nschema_version: 1\nid: ${ID}\nkind: link\ntitle: Payments runbook\naliases: [payments, PSP]\narchived: false\n---\n`);
  });

  it('quotes scalars that would otherwise read back as another type', () => {
    const text = serializeReferenceEntry(link({ title: 'yes', aliases: ['123', 'a: b'], url: 'https://x.test' }));
    expect(text).toContain('title: "yes"');
    expect(text).toContain('aliases: ["123", "a: b"]');
    expect(parseReferenceEntry(text, ID).entry.title).toBe('yes');
    expect(parseReferenceEntry(text, ID).entry.aliases).toEqual(['123', 'a: b']);
  });

  it('preserves unknown front-matter fields of any shape', () => {
    const extra = { priority: 2, owner: { team: 'payments', contacts: ['a@b.c'] }, flags: [true, null, 'x'] };
    const text = serializeReferenceEntry(link(), { extra });
    const again = parseReferenceEntry(text, ID);
    expect(again.extra).toEqual(extra);
    expect(again.status).toBe('ok');
    // …and they survive a second save unchanged.
    expect(parseReferenceEntry(serializeReferenceEntry(again.entry, { extra: again.extra }), ID).extra).toEqual(extra);
  });
});

describe('parseReferenceEntry', () => {
  it('round-trips a link record', () => {
    const { parsed } = roundTrip(link());
    expect(parsed.status).toBe('ok');
    expect(parsed.entry).toEqual(link());
    expect(parsed.issues).toEqual([]);
  });

  it('round-trips an arguments record with every value type', () => {
    const { parsed } = roundTrip(args());
    expect(parsed.status).toBe('ok');
    expect(parsed.entry).toEqual(args());
    expect(parsed.entry.values).toHaveLength(5);
  });

  it('round-trips an archived record and a hand-written one with no aliases key', () => {
    expect(roundTrip(link({ archived: true })).parsed.entry.archived).toBe(true);
    const handWritten = `---\nschema_version: 1\nid: ${ID}\nkind: arguments\ntitle: stage\ndescription: ignored\nvalues: []\n---\nStage values.\n`;
    const parsed = parseReferenceEntry(handWritten, ID);
    expect(parsed.status).toBe('ok');
    expect(parsed.entry.archived).toBe(false);
    expect(parsed.entry.description).toBe('Stage values.');
  });

  it('keeps the line ending of the file it read', () => {
    const lf = roundTrip(link({ description: 'One line.' }));
    expect(lf.parsed.eol).toBe('\n');
    const crlf = roundTrip(link({ description: 'One line.' }), undefined, '\r\n');
    expect(crlf.parsed.eol).toBe('\r\n');
    expect(crlf.text).toContain('\r\n');
    expect(crlf.text.split('\n').every((l) => l === '' || l.endsWith('\r'))).toBe(true);
    // A CRLF file read from disk keeps CRLF on the next save.
    expect(serializeReferenceEntry(crlf.parsed.entry, { eol: crlf.parsed.eol })).toEqual(crlf.text);
  });

  it('tolerates a CRLF file with no trailing newline', () => {
    const text = `---\r\nschema_version: 1\r\nid: ${ID}\r\nkind: link\r\ntitle: Runbook\r\narchived: false\r\n---\r\nBody\r\n`;
    const parsed = parseReferenceEntry(text.replace(/\r\n$/, ''), ID);
    expect(parsed.status).toBe('ok');
    expect(parsed.entry.title).toBe('Runbook');
    expect(parsed.entry.description).toBe('Body');
    expect(parsed.eol).toBe('\r\n');
  });

  it('reads the identity from the file name and reports a divergent id', () => {
    const text = serializeReferenceEntry(link({ id: 'other-id' }));
    const parsed = parseReferenceEntry(text, ID);
    expect(parsed.entry.id).toBe(ID);
    expect(parsed.issues.map((i) => i.code)).toEqual(['id-mismatch']);
    expect(parsed.status).toBe('ok'); // healed on the next save, not read-only
  });

  it('marks a file with no kind as read-only and keeps its body', () => {
    const parsed = parseReferenceEntry('# Just a note\n\nBody text.\n', ID);
    expect(parsed.status).toBe('readonly');
    expect(parsed.kindRaw).toBe('');
    expect(parsed.entry.description).toBe('# Just a note\n\nBody text.');
    expect(parsed.issues.map((i) => i.code)).toEqual(['unknown-kind']);
  });

  it('marks an unknown kind as read-only and preserves its fields', () => {
    const text = `---\nschema_version: 1\nid: ${ID}\nkind: widget\ntitle: W\nwidget_spec:\n  size: 3\n---\nBody\n`;
    const parsed = parseReferenceEntry(text, ID);
    expect(parsed.status).toBe('readonly');
    expect(parsed.kindRaw).toBe('widget');
    expect(parsed.extra).toEqual({ widget_spec: { size: 3 } });
    expect(parsed.issues[0].message).toContain('widget');
  });

  it('marks a newer schema_version as read-only', () => {
    const text = `---\nschema_version: 2\nid: ${ID}\nkind: link\ntitle: Future\n---\nBody\n`;
    const parsed = parseReferenceEntry(text, ID);
    expect(parsed.status).toBe('readonly');
    expect(parsed.issues.map((i) => i.code)).toEqual(['schema-version']);
  });

  it('marks broken YAML as read-only without throwing', () => {
    const parsed = parseReferenceEntry(`---\ntitle: "unterminated\nkind: [\n---\nBody\n`, ID);
    expect(parsed.status).toBe('readonly');
    expect(parsed.issues[0].code).toBe('frontmatter');
    expect(parsed.entry.id).toBe(ID);
  });

  it('marks a value whose type does not match its declaration as read-only, naming the key', () => {
    const text = `---\nschema_version: 1\nid: ${ID}\nkind: arguments\ntitle: dev\nvalues:\n  - key: retries\n    type: number\n    value: "three"\n---\nDev.\n`;
    const parsed = parseReferenceEntry(text, ID);
    expect(parsed.status).toBe('readonly');
    expect(parsed.issues[0]).toMatchObject({ code: 'value-type' });
    expect(parsed.issues[0].message).toContain('retries');
  });

  it('rejects an unknown value type, a malformed row and a non-list values block', () => {
    const bad = (values: string) => parseReferenceEntry(
      `---\nschema_version: 1\nid: ${ID}\nkind: arguments\ntitle: dev\nvalues:\n${values}---\nDev.\n`,
      ID,
    );
    expect(bad('  - key: when\n    type: date\n    value: today\n').issues[0].code).toBe('unknown-type');
    expect(bad('  - key: host\n').issues[0].code).toBe('unknown-type');
    expect(bad('  host: dev\n').issues[0].code).toBe('values-shape');
    expect(bad('  - key: env\n    type: enum\n    value: dev\n').issues[0].code).toBe('value-type');
    for (const text of ['  - key: when\n    type: date\n    value: today\n', '  host: dev\n']) {
      expect(bad(text).status).toBe('readonly');
    }
  });

  it('coerces YAML scalars for string-typed values and enum options', () => {
    const text = `---\nschema_version: 1\nid: ${ID}\nkind: arguments\ntitle: dev\nvalues:\n  - key: port\n    type: string\n    value: 8080\n  - key: env\n    type: enum\n    value: dev\n    options: [dev, "2"]\n---\nDev.\n`;
    const parsed = parseReferenceEntry(text, ID);
    expect(parsed.status).toBe('ok');
    expect(parsed.entry.values).toEqual([
      { key: 'port', type: 'string', value: '8080' },
      { key: 'env', type: 'enum', value: 'dev', options: ['dev', '2'] },
    ]);
  });

  it('keeps the other kind\'s payload as an unknown field instead of dropping it', () => {
    const text = `---\nschema_version: 1\nid: ${ID}\nkind: link\ntitle: L\nurl: https://x.test\nvalues:\n  - key: host\n    type: string\n    value: dev\n---\nBody\n`;
    const parsed = parseReferenceEntry(text, ID);
    expect(parsed.status).toBe('ok');
    expect(parsed.entry.values).toBeUndefined();
    expect(parsed.extra.values).toEqual([{ key: 'host', type: 'string', value: 'dev' }]);
  });

  it('marks a non-boolean archived flag and a non-list aliases block as read-only', () => {
    const archived = parseReferenceEntry(`---\nid: ${ID}\nkind: link\ntitle: L\narchived: "yes"\n---\nB\n`, ID);
    expect(archived.status).toBe('readonly');
    expect(archived.entry.archived).toBe(false);
    expect(archived.issues.map((i) => i.code)).toEqual(['archived-shape']);
    const aliases = parseReferenceEntry(`---\nid: ${ID}\nkind: link\ntitle: L\naliases:\n  a: b\n---\nB\n`, ID);
    expect(aliases.status).toBe('readonly');
    expect(aliases.issues.map((i) => i.code)).toEqual(['aliases-shape']);
  });

  it('accepts a hand-written single alias and a null aliases key', () => {
    const single = parseReferenceEntry(`---\nid: ${ID}\nkind: link\ntitle: L\naliases: runbook\n---\nB\n`, ID);
    expect(single.entry.aliases).toEqual(['runbook']);
    const none = parseReferenceEntry(`---\nid: ${ID}\nkind: link\ntitle: L\naliases:\n---\nB\n`, ID);
    expect(none.entry.aliases).toEqual([]);
    expect(none.status).toBe('ok');
  });

  it('normalizes a CRLF body and blanks around it on save', () => {
    const text = `---\r\nid: ${ID}\r\nkind: link\r\ntitle: L\r\n---\r\n\r\nBody line\r\n\r\n`;
    const parsed = parseReferenceEntry(text, ID);
    expect(parsed.entry.description).toBe('Body line');
    expect(parsed.eol).toBe('\r\n');
  });
});
