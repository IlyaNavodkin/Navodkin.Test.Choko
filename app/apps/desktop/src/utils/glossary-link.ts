import { GLOSSARY_DIR, isSafeEntryId } from '@/services/format/reference-book';

// ---------------------------------------------------------------------------
// The reference-book **link contract**: a plain Markdown link to a record's file,
//   [Payments runbook](../../.casewright/glossary/<id>.md)
// written relative to the file that contains it. Everything here is pure string/path
// math so it can be used by the editors (insertion), the renderer (chips) and the
// move/copy operations (path recomputation) without touching the filesystem.
//
// A link is recognized by its *shape* (a relative path ending in
// `.casewright/glossary/<id>.md`) and resolved by its `id` against the repository's
// loaded catalog — the href is never used to open a file, so a hand-written path can
// not make the app read something outside the glossary.
// ---------------------------------------------------------------------------

/** A relative href that points at a record file; group 1 is the record id. */
export const GLOSSARY_HREF_RE = /^(?:\.{1,2}\/)*\.casewright\/glossary\/([A-Za-z0-9._-]+)\.md$/;

/** The record id a relative href points at, or `null` when it is not a glossary link. */
export function glossaryHrefId(href: string): string | null {
  const m = GLOSSARY_HREF_RE.exec((href ?? '').trim());
  const id = m?.[1] ?? '';
  return id && isSafeEntryId(id) ? id : null;
}

const segments = (rel: string): string[] => (rel.replace(/\\/g, '/').replace(/^\.\//, '') || '').split('/').filter(Boolean);

/** The directory segments of a document path (its own file name dropped). */
const dirOf = (rel: string): string[] => segments(rel).slice(0, -1);

/** The relative path from document `baseRel` to `targetRel` (`../`-based, forward slashes). */
export function relativePath(baseRel: string, targetRel: string): string {
  const from = dirOf(baseRel);
  const to = segments(targetRel);
  let common = 0;
  while (common < from.length && common < to.length && from[common] === to[common]) common++;
  return [...Array(from.length - common).fill('..'), ...to.slice(common)].join('/');
}

/** The href for a record, relative to the document at `baseRel`. */
export function glossaryHrefFrom(baseRel: string, id: string): string {
  return relativePath(baseRel, `${GLOSSARY_DIR}/${id}.md`);
}

/**
 * A Markdown link label that survives the inline-markdown whitelist (which cannot represent
 * `[`/`]` inside a label) — brackets are dropped rather than emitted as a broken link.
 */
export function linkLabel(title: string): string {
  return (title ?? '').replace(/[[\]]/g, '').trim();
}

/** The Markdown link to insert into text located at `baseRel`. */
export function glossaryLinkMarkdown(baseRel: string, id: string, title: string): string {
  return `[${linkLabel(title) || id}](${glossaryHrefFrom(baseRel, id)})`;
}

/** Replace the selection in a text field with `insert`, returning the new value and caret. */
export function insertAtCursor(
  value: string,
  start: number,
  end: number,
  insert: string,
): { value: string; caret: number } {
  const from = Math.max(0, Math.min(start, value.length));
  const to = Math.max(from, Math.min(end, value.length));
  return { value: value.slice(0, from) + insert + value.slice(to), caret: from + insert.length };
}

// ---------------------------------------------------------------------------
// Code-aware scanning: a link inside a fenced block or an inline code span is content,
// not a usage of a record (design §4), so it is neither rendered as a chip nor rewritten.
// ---------------------------------------------------------------------------

/** Apply `fn` to every span of `text` that is outside fenced blocks and inline code. */
function mapOutsideCode(text: string, fn: (chunk: string) => string): string {
  const out: string[] = [];
  let inFence = false;
  let fenceChar = '';
  let fenceLen = 0;
  for (const line of text.split('\n')) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line);
    if (inFence) {
      out.push(line);
      if (fence && fence[1][0] === fenceChar && fence[1].length >= fenceLen) inFence = false;
      continue;
    }
    if (fence) {
      out.push(line);
      inFence = true;
      fenceChar = fence[1][0];
      fenceLen = fence[1].length;
      continue;
    }
    // Inline code spans inside an ordinary line.
    out.push(mapOutsideInlineCode(line, fn));
  }
  return out.join('\n');
}

function mapOutsideInlineCode(line: string, fn: (chunk: string) => string): string {
  const rx = /`[^`]*`/g;
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(line)) !== null) {
    out += fn(line.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + fn(line.slice(last));
}

const LINK_RX = /\[([^\]]*)\]\(([^)\s]+)\)/g;

/** Replace every glossary href in `text` with one computed against `baseRel`, keeping labels. */
export function rewriteGlossaryHrefs(text: string, baseRel: string): string {
  if (!text.includes(GLOSSARY_DIR)) return text;
  return mapOutsideCode(text, (chunk) =>
    chunk.replace(LINK_RX, (whole, label: string, href: string) => {
      const id = glossaryHrefId(href);
      if (!id) return whole;
      const next = glossaryHrefFrom(baseRel, id);
      return next === href ? whole : `[${label}](${next})`;
    }),
  );
}

/** Every glossary record id referenced from `text` (outside code), in order of appearance. */
export function glossaryIdsIn(text: string): string[] {
  if (!text.includes(GLOSSARY_DIR)) return [];
  const ids: string[] = [];
  mapOutsideCode(text, (chunk) => {
    chunk.replace(LINK_RX, (_whole, _label: string, href: string) => {
      const id = glossaryHrefId(href);
      if (id) ids.push(id);
      return _whole;
    });
    return chunk;
  });
  return ids;
}

// ---------------------------------------------------------------------------
// Resolution: the renderer (utils/markdown.tsx, utils/markdown-html.ts) is pure, so the
// loaded catalog and the "open the record" action are installed once by the store. A chip
// needs no prop drilling at its call site, and prose rendered outside the app (tests, a
// report built before the catalog loaded) simply resolves to nothing.
// ---------------------------------------------------------------------------

/** What a link chip needs to know about a record. */
export interface ReferenceLinkInfo {
  entry: { title: string; description: string; archived: boolean; kind: string };
  /** A file the app cannot edit — still readable through a link. */
  readonly?: boolean;
  /** Resolved from the open run's frozen snapshot rather than from the live catalog. */
  runSnapshot?: boolean;
}

/** A record as a run froze it when it was created. */
export interface ReferenceSnapshotEntry {
  id: string;
  kind: string;
  title: string;
  description: string;
  archived: boolean;
}

const EMPTY: ReadonlyMap<string, ReferenceLinkInfo> = new Map();
let catalog: ReadonlyMap<string, ReferenceLinkInfo> = EMPTY;
let installed: readonly { id: string; entry: ReferenceLinkInfo['entry']; readonly?: boolean }[] | null = null;
let opener: ((id: string) => void) | null = null;

/**
 * The open run's snapshot, when there is one. It wins over the live catalog, because a run must
 * keep showing the definition it recorded even after the record was edited, archived or deleted
 * (spec "Definition changes after run creation"). Ids the snapshot does not know — a link written
 * into the run after it was created — still fall back to the live catalog.
 */
let runSnapshot: ReadonlyMap<string, ReferenceSnapshotEntry> | null = null;
let snapshotSource: readonly ReferenceSnapshotEntry[] | null = null;

/** Install the loaded catalog (called by the store whenever `refs` changes). */
export function setReferenceCatalog(docs: readonly { id: string; entry: ReferenceLinkInfo['entry']; readonly?: boolean }[]): void {
  if (docs === installed) return;
  installed = docs;
  catalog = new Map(docs.map((d) => [d.id, { entry: d.entry, readonly: d.readonly }]));
}

/** Install (or clear) the open run's snapshot — the store does this while a run view is active. */
export function setReferenceSnapshot(entries: readonly ReferenceSnapshotEntry[] | null): void {
  if (entries === snapshotSource) return;
  snapshotSource = entries;
  runSnapshot = entries && entries.length ? new Map(entries.map((e) => [e.id, e])) : null;
}

/** Install the action a chip click runs (open the record's card in the Reference section). */
export function setReferenceOpener(fn: ((id: string) => void) | null): void {
  opener = fn;
}

/** The record a link points at, or `null` when neither the run snapshot nor the catalog knows it. */
export function referenceLinkInfo(id: string): ReferenceLinkInfo | null {
  const frozen = runSnapshot?.get(id);
  if (frozen) return { entry: frozen, runSnapshot: true };
  return catalog.get(id) ?? null;
}

/** Open a record's card — the click action of a link chip. */
export function openReferenceRecord(id: string): void {
  opener?.(id);
}

/** Reset the installed state (tests). */
export function resetReferenceRegistry(): void {
  catalog = EMPTY;
  installed = null;
  opener = null;
  runSnapshot = null;
  snapshotSource = null;
}

// ---------------------------------------------------------------------------
// Moving a document re-anchors the links it holds: a link is relative to the file that
// contains it, so when a case (or a whole suite's folder) moves, every link in it must be
// rewritten to the new depth. Labels and everything else are left exactly as authored.
// ---------------------------------------------------------------------------

/** The case fields that can carry markdown links. */
export interface LinkBearingCase {
  objective: string;
  systems: string[];
  setup: { name: string; body: string }[];
  steps: { text: string }[];
  expected: string[];
}

/** Re-anchor the links of `c` to `newRel`; returns the same object when nothing changed. */
export function rebaseCaseLinks<T extends LinkBearingCase>(c: T, newRel: string): T {
  const objective = rewriteGlossaryHrefs(c.objective, newRel);
  const systems = c.systems.map((s) => rewriteGlossaryHrefs(s, newRel));
  const setup = c.setup.map((it) => {
    const name = rewriteGlossaryHrefs(it.name, newRel);
    const body = rewriteGlossaryHrefs(it.body, newRel);
    return name === it.name && body === it.body ? it : { ...it, name, body };
  });
  const steps = c.steps.map((st) => {
    const text = rewriteGlossaryHrefs(st.text, newRel);
    return text === st.text ? st : { ...st, text };
  });
  const expected = c.expected.map((e) => rewriteGlossaryHrefs(e, newRel));
  const unchanged =
    objective === c.objective &&
    systems.every((s, i) => s === c.systems[i]) &&
    setup.every((it, i) => it === c.setup[i]) &&
    steps.every((s, i) => s === c.steps[i]) &&
    expected.every((e, i) => e === c.expected[i]);
  return unchanged ? c : { ...c, objective, systems, setup, steps, expected };
}
