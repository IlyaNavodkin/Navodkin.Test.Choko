import { describe, expect, it } from 'vitest';
import type { Case } from '@/types';
import { caseLinkUses } from './run-snapshot';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const OTHER = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
const link = (id: string, label = 'Runbook') => `[${label}](../../.testoritto/glossary/${id}.md)`;

const kase = (patch: Partial<Case> = {}): Case => ({
  id: 'case0000001',
  displayId: 'PAY-0042',
  title: 'Roll a die',
  status: 'active',
  tags: [],
  suite: 'suite',
  objective: '',
  systems: [],
  setup: [],
  steps: [],
  expected: [],
  modified: false,
  ...patch,
});

describe('caseLinkUses', () => {
  it('names where every link was found, across every link-bearing field', () => {
    const uses = caseLinkUses(
      kase({
        objective: `See ${link(ID)}.`,
        systems: [`Auth service, ${link(OTHER)}`],
        setup: [{ name: `Sign in ${link(ID)}`, body: `Then ${link(OTHER)}.` }],
        steps: [{ text: `Open ${link(ID)}`, depth: 0 }],
        expected: [`Looks like ${link(OTHER)}`],
      }),
    );
    expect(uses).toEqual([
      { id: ID, where: 'PAY-0042 — Objective' },
      { id: OTHER, where: 'PAY-0042 — Systems' },
      { id: ID, where: 'PAY-0042 — Setup "Sign in Runbook"' },
      { id: OTHER, where: 'PAY-0042 — Setup "Sign in Runbook" body' },
      { id: ID, where: 'PAY-0042 — Step 1' },
      { id: OTHER, where: 'PAY-0042 — Acceptance 1' },
    ]);
  });

  it('reports a repeat as a separate use, in document order', () => {
    const uses = caseLinkUses(kase({ objective: `${link(ID)} and ${link(ID)}`, expected: [link(ID)] }));
    expect(uses.map((u) => u.id)).toEqual([ID, ID, ID]);
    expect(uses.map((u) => u.where)).toEqual(['PAY-0042 — Objective', 'PAY-0042 — Objective', 'PAY-0042 — Acceptance 1']);
  });

  it('ignores links inside fenced blocks and inline code — they are content, not usages', () => {
    const uses = caseLinkUses(
      kase({
        objective: ['```', link(ID), '```', `Inline \`${link(OTHER)}\` stays literal.`].join('\n'),
      }),
    );
    expect(uses).toEqual([]);
  });

  it('finds nothing in a case without links, and falls back for an unnamed case', () => {
    expect(caseLinkUses(kase())).toEqual([]);
    expect(caseLinkUses(kase({ displayId: '', title: '', objective: link(ID) }))).toEqual([
      { id: ID, where: 'case0000001 — Objective' },
    ]);
  });
});
