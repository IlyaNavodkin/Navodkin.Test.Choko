import { flushPersist } from '@/services/persist';
import {
  ReferenceConflictError,
  ReferenceStaleError,
  loadGlossary,
  readGlossaryEntry,
  saveGlossaryEntry,
  setGlossaryArchived,
  type ReferenceDoc,
  type WriteGuard,
} from '@/services/reference-book';
import { validateReferenceEntry, type ArgValue, type ReferenceEntry, type ReferenceKind } from '@/schemas/reference-book';
import { randomUuid } from '@/utils/ids';
import type { AppState, StoreGet, StoreSet } from '../app-store';
import type { RefPickerRequest } from '@/types';

// ---------------------------------------------------------------------------
// Reference book (`.testoritto/glossary/`): the catalog, the search/filter state, and the
// editor's draft — which is deliberately NOT written to disk until the user saves it.
//
// Spec obligations that live here:
//   · opening the section, selecting a record and switching records never write;
//   · a dirty draft blocks navigation until the user chooses stay / save / discard;
//   · a failed save keeps the draft and never reports a false save;
//   · a record changed outside the app is refused, not clobbered (the user may instead
//     reload it or explicitly overwrite).
// ---------------------------------------------------------------------------

type ReferenceSlice = Pick<
  AppState,
  | 'refs'
  | 'refIssues'
  | 'refSelId'
  | 'refDraft'
  | 'refDraftBase'
  | 'refDirty'
  | 'refSaveError'
  | 'refPendingLeave'
  | 'refQuery'
  | 'refKindFilter'
  | 'refShowArchived'
  | 'loadRefs'
  | 'openReferenceBook'
  | 'selectRefEntry'
  | 'createRefEntry'
  | 'editRefDraft'
  | 'addRefValue'
  | 'editRefValue'
  | 'removeRefValue'
  | 'saveRefEntry'
  | 'discardRefDraft'
  | 'reloadRefEntry'
  | 'setRefArchived'
  | 'guardRefLeave'
  | 'resolveRefLeave'
  | 'setRefQuery'
  | 'setRefKindFilter'
  | 'setRefShowArchived'
  | 'refPicker'
  | 'openRefPicker'
  | 'closeRefPicker'
  | 'openReferenceEntry'
>;

/** A blank record for a chosen kind — its id is generated up front and never changes. */
export function newReferenceEntry(kind: ReferenceKind): ReferenceEntry {
  return {
    id: randomUuid(),
    kind,
    title: '',
    aliases: [],
    archived: false,
    description: '',
    ...(kind === 'link' ? { url: '' } : { values: [] }),
  };
}

/** Fixed key order so two records can be compared as JSON (the dirty check). */
const normalize = (e: ReferenceEntry) =>
  JSON.stringify({
    id: e.id,
    kind: e.kind,
    title: e.title,
    aliases: e.aliases,
    archived: e.archived,
    description: e.description,
    url: e.kind === 'link' ? (e.url ?? '') : '',
    values:
      e.kind === 'arguments'
        ? (e.values ?? []).map((v) => ({ key: v.key, type: v.type, value: v.value, options: v.options ?? [] }))
        : [],
  });

/** Field-for-field equality of two records. */
export const sameReferenceEntry = (a: ReferenceEntry, b: ReferenceEntry): boolean => normalize(a) === normalize(b);

/** Catalog order: by title, then id — stable regardless of when a record was written. */
const sortDocs = (docs: ReferenceDoc[]): ReferenceDoc[] =>
  [...docs].sort((a, b) =>
    a.entry.title.localeCompare(b.entry.title, undefined, { sensitivity: 'base' }) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function createReferenceSlice(set: StoreSet, get: StoreGet): ReferenceSlice {
  /** Recompute the dirty flag for `draft` against the saved record of the same id. */
  const draftPatch = (s: AppState, draft: ReferenceEntry): Partial<AppState> => {
    const doc = s.refs.find((d) => d.id === draft.id);
    return {
      refDraft: draft,
      // A brand-new record is dirty as soon as it is touched; a saved one only while it differs.
      refDirty: s.refDraftBase === null || !doc || !sameReferenceEntry(draft, doc.entry),
      // Field errors are re-derived on the next save; a conflict stays until it is resolved.
      refSaveError: s.refSaveError?.kind === 'fields' ? null : s.refSaveError,
    };
  };

  /** Gate a navigation on the draft decision: `true` = go ahead, `false` = the prompt is up. */
  const guard = (label: string, proceed: () => void): boolean => {
    if (!get().refDirty) return true;
    set({ refPendingLeave: { label, proceed } });
    return false;
  };

  const patchDraft = (patch: Partial<ReferenceEntry>): void =>
    set((s) => (s.refDraft ? draftPatch(s, { ...s.refDraft, ...patch }) : {}));

  const patchValues = (fn: (values: ArgValue[]) => ArgValue[]): void =>
    set((s) => {
      if (!s.refDraft || s.refDraft.kind !== 'arguments') return {};
      return draftPatch(s, { ...s.refDraft, values: fn(s.refDraft.values ?? []) });
    });

  return {
    /* ---- state ---- */
    refs: [],
    refIssues: [],
    refSelId: null,
    refDraft: null,
    /** Revision the draft is based on; `null` marks a record that has never been saved. */
    refDraftBase: null,
    refDirty: false,
    refSaveError: null,
    refPendingLeave: null,
    refQuery: '',
    refKindFilter: 'all',
    refShowArchived: false,

    /**
     * (Re)read the catalog. Read-only: an absent `.testoritto/` yields an empty catalog and
     * nothing is created. A dirty draft is never replaced by what is on disk.
     */
    loadRefs: async () => {
      const repoPath = get().repoPath;
      if (!repoPath) {
        set({
          refs: [],
          refIssues: [],
          refSelId: null,
          refDraft: null,
          refDraftBase: null,
          refDirty: false,
          refSaveError: null,
          refPendingLeave: null,
        });
        return;
      }
      let loaded: Awaited<ReturnType<typeof loadGlossary>>;
      try {
        loaded = await loadGlossary(repoPath);
      } catch (e) {
        set({ refIssues: [{ code: 'glossary-read', message: errText(e) }] });
        return;
      }
      const docs = sortDocs(loaded.docs);
      set((s) => {
        // An unsaved record (or unsaved edits) belongs to the user — leave it alone.
        if (s.refDraft && (s.refDraftBase === null || s.refDirty)) return { refs: docs, refIssues: loaded.issues };
        const doc = s.refSelId ? (docs.find((d) => d.id === s.refSelId) ?? null) : null;
        return {
          refs: docs,
          refIssues: loaded.issues,
          refSelId: doc ? doc.id : null,
          refDraft: doc ? { ...doc.entry } : null,
          refDraftBase: doc?.revision ?? null,
          refDirty: false,
          refSaveError: null,
        };
      });
    },

    openReferenceBook: () => {
      void flushPersist();
      set({ view: 'glossary' });
    },

    selectRefEntry: (id) => {
      const doc = get().refs.find((d) => d.id === id);
      if (!doc) return;
      if (!guard(`the record "${doc.entry.title || doc.id}"`, () => get().selectRefEntry(id))) return;
      set({
        refSelId: id,
        refDraft: { ...doc.entry },
        refDraftBase: doc.revision,
        refDirty: false,
        refSaveError: null,
      });
    },

    createRefEntry: (kind) => {
      if (!guard('a new record', () => get().createRefEntry(kind))) return;
      set({ refSelId: null, refDraft: newReferenceEntry(kind), refDraftBase: null, refDirty: false, refSaveError: null });
    },

    editRefDraft: (patch) => patchDraft(patch),

    addRefValue: () => patchValues((values) => [...values, { key: '', type: 'string', value: '' }]),

    editRefValue: (index, patch) => patchValues((values) => values.map((v, i) => (i === index ? { ...v, ...patch } : v))),

    removeRefValue: (index) => patchValues((values) => values.filter((_, i) => i !== index)),

    /** Validate, then write atomically. A failure keeps the draft and reports why. */
    saveRefEntry: async (opts) => {
      const { repoPath, refDraft, refDraftBase } = get();
      if (!repoPath || !refDraft) return false;
      const issues = validateReferenceEntry(refDraft);
      if (issues.length) {
        set({ refSaveError: { kind: 'fields', issues } });
        return false;
      }
      const existing = get().refs.find((d) => d.id === refDraft.id);
      const writeGuard: WriteGuard = opts?.force
        ? { kind: 'force' }
        : refDraftBase === null
          ? { kind: 'create' }
          : { kind: 'replace', revision: refDraftBase };
      try {
        const saved = await saveGlossaryEntry(repoPath, refDraft, writeGuard, {
          extra: existing?.extra,
          eol: existing?.eol,
        });
        set((s) => ({
          refs: sortDocs([...s.refs.filter((d) => d.id !== saved.id), saved]),
          refIssues: s.refIssues.filter((i) => i.file !== saved.rel),
          refSelId: saved.id,
          refDraft: { ...saved.entry },
          refDraftBase: saved.revision,
          refDirty: false,
          refSaveError: null,
        }));
        get().toast('Saved to the reference book');
        return true;
      } catch (e) {
        if (e instanceof ReferenceStaleError || e instanceof ReferenceConflictError) {
          // The file changed (or appeared) outside the app — the user decides what wins.
          set({ refSaveError: { kind: 'conflict', message: errText(e) } });
        } else {
          set({ refSaveError: { kind: 'io', message: errText(e) } });
          get().toast('Could not save the record');
        }
        return false;
      }
    },

    discardRefDraft: () =>
      set((s) => {
        if (s.refDraftBase === null) {
          // A never-saved record has nothing to fall back to.
          return { refDraft: null, refDirty: false, refSaveError: null };
        }
        const doc = s.refs.find((d) => d.id === s.refSelId);
        return doc
          ? { refDraft: { ...doc.entry }, refDirty: false, refSaveError: null }
          : { refDraft: null, refSelId: null, refDirty: false, refSaveError: null };
      }),

    /** Take what is on disk now (the "reload" half of the conflict decision). */
    reloadRefEntry: async () => {
      const { repoPath, refSelId } = get();
      if (!repoPath || !refSelId) return;
      const doc = await readGlossaryEntry(repoPath, refSelId);
      set((s) => ({
        refs: doc ? sortDocs([...s.refs.filter((d) => d.id !== doc.id), doc]) : s.refs.filter((d) => d.id !== refSelId),
        refSelId: doc ? doc.id : null,
        refDraft: doc ? { ...doc.entry } : null,
        refDraftBase: doc?.revision ?? null,
        refDirty: false,
        refSaveError: null,
      }));
      get().toast(doc ? 'Reloaded the record from disk' : 'The record no longer exists on disk');
    },

    setRefArchived: async (id, archived) => {
      const repoPath = get().repoPath;
      if (!repoPath) return;
      try {
        const doc = await setGlossaryArchived(repoPath, id, archived);
        set((s) => {
          const refs = sortDocs([...s.refs.filter((d) => d.id !== doc.id), doc]);
          if (s.refSelId !== doc.id) return { refs };
          // The selected record moved on disk: adopt the flag + revision, keep the user's edits.
          const draft: ReferenceEntry = { ...(s.refDraft ?? doc.entry), archived };
          return { refs, refDraft: draft, refDraftBase: doc.revision, refDirty: !sameReferenceEntry(draft, doc.entry) };
        });
        get().toast(archived ? 'Moved to the archive' : 'Restored from the archive');
      } catch (e) {
        get().toast(errText(e));
      }
    },

    guardRefLeave: guard,

    resolveRefLeave: async (choice) => {
      const pending = get().refPendingLeave;
      if (!pending) return;
      if (choice === 'stay') {
        set({ refPendingLeave: null });
        return;
      }
      if (choice === 'save') {
        const ok = await get().saveRefEntry();
        if (!ok) {
          set({ refPendingLeave: null }); // stay here with the error visible
          return;
        }
      } else {
        get().discardRefDraft();
      }
      set({ refPendingLeave: null });
      pending.proceed();
    },

    setRefQuery: (q) => set({ refQuery: q }),
    setRefKindFilter: (kind) => set({ refKindFilter: kind }),
    setRefShowArchived: (show) => set({ refShowArchived: show }),

    refPicker: null,
    openRefPicker: (req) => set({ refPicker: req, modal: 'refPicker' }),
    closeRefPicker: () => set({ refPicker: null, modal: null }),

    /** Open the section at one record — what a link chip in case text does. */
    openReferenceEntry: (id) => {
      const doc = get().refs.find((d) => d.id === id);
      if (!doc) {
        get().toast('That record is not in this repository’s reference book');
        return;
      }
      if (!guard(`the record "${doc.entry.title || doc.id}"`, () => get().openReferenceEntry(id))) return;
      void flushPersist();
      set({
        view: 'glossary',
        refSelId: id,
        refDraft: { ...doc.entry },
        refDraftBase: doc.revision,
        refDirty: false,
        refSaveError: null,
      });
    },
  };
}
