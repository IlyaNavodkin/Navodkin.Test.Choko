import type { Case } from '@/types';
import { glossaryIdsIn } from './glossary-link';

// ---------------------------------------------------------------------------
// Which reference-book records a case *uses* — the input of a run snapshot.
//
// A link inside code is content, not a usage, and that rule already lives in `glossary-link`'s
// code-aware scan; this module only says *which* text fields can carry links and how to name the
// place a link was found, so a missing record can be reported as "PAY-0042 — Step 3" rather than
// as a bare id.
// ---------------------------------------------------------------------------

export interface CaseLinkUse {
  id: string;
  /** Where the link was found, for diagnostics — e.g. `PAY-0042 — Step 3`. */
  where: string;
}

/** Everything that identifies a case in a diagnostic (`PAY-0042`, its title, or its id). */
const labelOf = (kase: Case): string => kase.displayId || kase.title || kase.id;

/** A setup item's name as a plain label — links collapse to their text, nothing else changes. */
const setupLabel = (name: string, index: number): string => {
  const plain = name.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
  return plain ? `Setup "${plain}"` : `Setup ${index + 1}`;
};

/** Every glossary record referenced by `kase`, in document order (duplicates included). */
export function caseLinkUses(kase: Case): CaseLinkUse[] {
  const base = labelOf(kase);
  const uses: CaseLinkUse[] = [];
  const add = (where: string, text: string | undefined): void => {
    if (!text) return;
    for (const id of glossaryIdsIn(text)) uses.push({ id, where: `${base} — ${where}` });
  };

  add('Objective', kase.objective);
  kase.systems.forEach((s) => add('Systems', s));
  kase.setup.forEach((it, i) => {
    const label = setupLabel(it.name, i);
    add(label, it.name);
    add(`${label} body`, it.body);
  });
  kase.steps.forEach((st, i) => add(`Step ${i + 1}`, st.text));
  kase.expected.forEach((e, i) => add(`Acceptance ${i + 1}`, e));
  return uses;
}
