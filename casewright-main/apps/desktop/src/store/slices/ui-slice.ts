import type { Renaming } from '@/types';
import type { AppState, StoreSet } from '../app-store';

// ---------------------------------------------------------------------------
// Transient UI state with no disk/git side effects: toasts, the sidebar tree's
// collapsed/renaming state, the active modal, and the remembered last tester.
// `setCollapsed`/`setRenaming` accept a value or an updater (like React setState).
// ---------------------------------------------------------------------------

type UiSlice = Pick<
  AppState,
  | 'toasts'
  | 'collapsed'
  | 'renaming'
  | 'modal'
  | 'lastTester'
  | 'toast'
  | 'setCollapsed'
  | 'setRenaming'
  | 'setModal'
  | 'setLastTester'
>;

export function createUiSlice(set: StoreSet): UiSlice {
  return {
    toasts: [],
    collapsed: {},
    renaming: null,
    modal: null,
    lastTester: '',

    toast: (msg) => {
      const id = Math.random();
      set((s) => ({ toasts: [...s.toasts, { id, msg }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 2600);
    },

    setCollapsed: (updater) =>
      set((s) => ({
        collapsed:
          typeof updater === 'function'
            ? (updater as (p: Record<string, boolean>) => Record<string, boolean>)(s.collapsed)
            : updater,
      })),
    setRenaming: (updater) =>
      set((s) => ({
        renaming: typeof updater === 'function' ? (updater as (p: Renaming | null) => Renaming | null)(s.renaming) : updater,
      })),

    setModal: (modal) => set({ modal }),

    setLastTester: (v) => set({ lastTester: v }),
  };
}
