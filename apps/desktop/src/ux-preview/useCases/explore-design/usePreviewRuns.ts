import { useRef, useState } from 'react';
import { createDemoRuns, emptyResult, nextPendingIndex } from './fixtures';
import { t } from './messages';
import type { DemoCase, DemoRun, ResultDraft } from './types';
export type RunMetadata = Pick<DemoRun, 'summary' | 'notes' | 'closed'>;
const metadata = ({ summary, notes, closed }: DemoRun): RunMetadata => ({ summary, notes, closed });
export type UsePreviewRunsArgs = { blocked?: boolean; failSave?: boolean };
export type UsePreviewRunsResult = {
  getSavedRuns: () => DemoRun[];
  runs: DemoRun[]; run: DemoRun; metadata: RunMetadata; guiding: boolean; index: number; draft: ResultDraft; dirty: boolean; saving: boolean; blocked: boolean;
  search: string; caseSearch: string; setCaseSearch: (value: string) => void; resultFilter: string; notice: string; metadataDirty: boolean;
  setSearch: (value: string) => void; setResultFilter: (value: string) => void; selectRun: (id: string, approved?: boolean) => void;
  startGuide: (index?: number, approved?: boolean) => void; endGuide: (approved?: boolean) => void; setDraft: (value: ResultDraft) => void;
  updateMetadata: (key: keyof RunMetadata, value: string | boolean) => void; discard: () => void;
  saveMetadata: () => Promise<boolean>; saveResult: (next: boolean) => Promise<boolean>;
  createRun: (name: string, date: string, cases: DemoCase[]) => boolean;
};
export function usePreviewRuns({ blocked = false, failSave = false }: UsePreviewRunsArgs = {}): UsePreviewRunsResult {
  const [runs, setRuns] = useState(createDemoRuns); const [id, setId] = useState('run-42');
  // Guard continuations can run before React renders the just-saved state.
  const savedRuns = useRef(runs);
  function updateSavedRuns(update: (current: DemoRun[]) => DemoRun[]) { savedRuns.current = update(savedRuns.current); setRuns(savedRuns.current); }
  const run = runs.find((item) => item.id === id)!;
  const [meta, setMeta] = useState(() => metadata(run));
  const [guiding, setGuiding] = useState(false); const [index, setIndex] = useState(2);
  const [draft, setDraft] = useState<ResultDraft>(() => structuredClone(run.results[2]));
  const [search, setSearch] = useState(''); const [caseSearch, setCaseSearch] = useState(''); const [resultFilter, setResultFilter] = useState('');
  const [saving, setSaving] = useState(false); const pending = useRef(false); const serial = useRef(100);
  const [notice, setNotice] = useState('');
  const metadataDirty = JSON.stringify(meta) !== JSON.stringify(metadata(run));
  const dirty = JSON.stringify(draft) !== JSON.stringify(run.results[index]);
  const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 550));
  async function saveResult(next: boolean): Promise<boolean> {
    if (blocked || run.closed) { setNotice(t('writingBlocked')); return false; }
    if (pending.current) return false; pending.current = true; setSaving(true);
    const saved = structuredClone(draft); const results = run.results.map((item, i) => i === index ? saved : item);
    try { await delay(); if (failSave) { setNotice(t('saveError')); return false; }
      updateSavedRuns((old) => old.map((item) => item.id === id ? { ...item, results } : item)); setNotice('');
      if (next) { const nextIndex = nextPendingIndex(results, index); if (nextIndex === null) { setGuiding(false); setNotice(t('runFinished')); } else { setIndex(nextIndex); setDraft(structuredClone(results[nextIndex])); } }
      return true;
    } finally { pending.current = false; setSaving(false); }
  }
  async function saveMetadata(): Promise<boolean> {
    if (blocked) { setNotice(t('writingBlocked')); return false; } if (pending.current) return false; if (!metadataDirty) return true;
    pending.current = true; setSaving(true);
    try { await delay(); if (failSave) { setNotice(t('saveError')); return false; } updateSavedRuns((old) => old.map((item) => item.id === id ? { ...item, ...meta } : item)); setNotice(''); return true; }
    finally { pending.current = false; setSaving(false); }
  }
  return { runs, getSavedRuns: () => structuredClone(savedRuns.current), run, metadata: meta, guiding, index, draft, dirty, saving, blocked, metadataDirty, search, caseSearch, setCaseSearch, resultFilter, notice, setSearch, setResultFilter,
    selectRun: (nextId, approved = false) => { if (pending.current || (!approved && (metadataDirty || (guiding && dirty)))) { setNotice(t('saveBeforeSwitch')); return; } const nextRun = runs.find((item) => item.id === nextId); if (!nextRun) return; setId(nextId); setMeta(metadata(nextRun)); setIndex(0); setDraft(structuredClone(nextRun.results[0])); setGuiding(false); setNotice(''); },
    startGuide: (nextIndex, approved = false) => { if (pending.current || (!approved && metadataDirty)) { setNotice(t('saveBeforeSwitch')); return; } const i = nextIndex ?? Math.max(0, run.results.findIndex((item) => item.result === 'not_run')); setIndex(i); setDraft(structuredClone(run.results[i])); setGuiding(true); setNotice(''); },
    endGuide: (approved = false) => { if (pending.current || (!approved && dirty)) { setNotice(t('saveBeforeSwitch')); return; } setGuiding(false); },
    setDraft: (value) => { if (!pending.current && !run.closed && !blocked) setDraft(value); },
    updateMetadata: (key, value) => { if (pending.current || blocked) return; setMeta((old) => key === 'closed' ? { ...old, closed: Boolean(value) } : { ...old, [key]: String(value) }); },
    discard: () => { if (!pending.current) { setMeta(metadata(run)); setDraft(structuredClone(run.results[index])); setNotice(''); } },
    createRun: (name, date, cases) => { if (blocked || pending.current || !cases.length || !name.trim()) return false; const snapshots = structuredClone(cases); const newRun: DemoRun = { id: `demo-run-${serial.current++}`, name: name.trim(), date, closed: false, summary: '', notes: '', snapshots, results: snapshots.map(emptyResult) }; updateSavedRuns((old) => [newRun, ...old]); setId(newRun.id); setMeta(metadata(newRun)); setIndex(0); setDraft(structuredClone(newRun.results[0])); setGuiding(false); setNotice(t('operationDone')); return true; },
    saveMetadata, saveResult };
}
