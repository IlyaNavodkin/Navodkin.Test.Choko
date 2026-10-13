import type { AppState, StoreSet } from '../app-store';

// ---------------------------------------------------------------------------
// Generic confirm/alert dialogs (shadcn) — replace native window.confirm/alert.
// Only one dialog shows at a time; a new request supersedes any pending one.
// ---------------------------------------------------------------------------

type DialogSlice = Pick<AppState, 'dialog' | 'confirm' | 'alert' | 'closeDialog'>;

export function createDialogSlice(set: StoreSet): DialogSlice {
  // Resolver for the currently-open dialog; a new request cancels the pending one (resolves false).
  let pendingDialog: ((result: boolean) => void) | null = null;

  return {
    dialog: null,

    confirm: (opts) =>
      new Promise<boolean>((resolve) => {
        pendingDialog?.(false); // a fresh request supersedes any pending one
        pendingDialog = resolve;
        set({ dialog: { kind: 'confirm', ...opts } });
      }),

    alert: (opts) =>
      new Promise<void>((resolve) => {
        pendingDialog?.(false);
        pendingDialog = () => resolve();
        set({ dialog: { kind: 'alert', title: opts.title, message: opts.message, confirmLabel: opts.okLabel } });
      }),

    closeDialog: (result) => {
      const resolve = pendingDialog;
      pendingDialog = null;
      set({ dialog: null });
      resolve?.(result);
    },
  };
}
