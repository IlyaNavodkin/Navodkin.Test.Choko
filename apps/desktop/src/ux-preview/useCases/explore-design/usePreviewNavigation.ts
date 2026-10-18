import { useRef, useState } from 'react';
import { t } from './messages';
export type PreviewDraftParticipant = { dirty: boolean; saving: boolean; save: () => Promise<boolean>; discard: () => void };
export type UsePreviewNavigationArgs = { participants: PreviewDraftParticipant[] };
export type UsePreviewNavigationResult = {
  open: boolean; busy: boolean; error: string; request: (action: () => void) => void; cancel: () => void;
  saveAndContinue: () => Promise<void>; discardAndContinue: () => void;
};
export function usePreviewNavigation({ participants }: UsePreviewNavigationArgs): UsePreviewNavigationResult {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const pending = useRef<(() => void) | null>(null); const working = useRef(false);
  function finish() { const action = pending.current; pending.current = null; setOpen(false); setError(''); action?.(); }
  return { open, busy, error,
    request: (action) => { if (working.current) return; if (!participants.some((item) => item.dirty || item.saving)) { action(); return; } pending.current = action; setOpen(true); setError(''); },
    cancel: () => { if (!working.current) { setOpen(false); pending.current = null; setError(''); } },
    saveAndContinue: async () => { if (working.current || participants.some((item) => item.saving)) return; working.current = true; setBusy(true); setError(''); try { for (const item of participants) { if (item.dirty && !(await item.save())) { setError(t('saveError')); return; } } finish(); } finally { working.current = false; setBusy(false); } },
    discardAndContinue: () => { if (working.current || participants.some((item) => item.saving)) return; participants.forEach((item) => item.discard()); finish(); },
  };
}
