import { useCallback, useRef, useState } from 'react';
import { demoFiles } from './fixtures';
import { getLayoutState, type LayoutStateId } from './layoutStates';
import { t } from './messages';
import type { DemoFile, PreviewSection } from './types';
export type CommitPlan = { paths: string[]; message: string };
export type UseExploreDesignArgs = { state?: LayoutStateId };
export type UseExploreDesignResult = {
  repository: number | null; section: PreviewSection; files: DemoFile[]; selectedFiles: string[]; activeFile: string;
  message: string; ahead: number; behind: number; busy: boolean; notice: string; canCommit: boolean; canSync: boolean; state: LayoutStateId;
  openRepository: (index: number | null) => void; setSection: (section: PreviewSection) => void;
  toggleFile: (path: string, selected: boolean) => void; setActiveFile: (path: string) => void; setMessage: (value: string) => void;
  commit: (plan?: CommitPlan) => Promise<boolean>; sync: (action: 'pull' | 'push' | 'abort') => Promise<boolean>;
  recordFiles: (files: DemoFile[]) => void;
};
export function useExploreDesign({ state = 'normal' }: UseExploreDesignArgs = {}): UseExploreDesignResult {
  const [repository, setRepository] = useState<number | null>(null); const [section, setSection] = useState<PreviewSection>('cases');
  const [files, setFiles] = useState(() => structuredClone(demoFiles)); const [selectedFiles, setSelectedFiles] = useState([demoFiles[0].path, demoFiles[1].path]);
  const [activeFile, setActiveFile] = useState(demoFiles[0].path); const [message, setMessage] = useState('');
  const [ahead, setAhead] = useState(1); const [behind, setBehind] = useState(2); const [busy, setBusy] = useState(false); const pending = useRef(false); const [notice, setNotice] = useState('');
  const blocked = getLayoutState(state).block;
  const canCommit = !blocked && state !== 'identity';
  const canSync = !blocked && !['noUpstream', 'unborn'].includes(state);
  const recordFiles = useCallback((changes: DemoFile[]) => setFiles((old) => { const paths = new Set(changes.map((item) => item.path)); return [...old.filter((item) => !paths.has(item.path)), ...changes]; }), []);
  async function perform(action: () => boolean) { if (pending.current) return false; pending.current = true; setBusy(true); try { await new Promise<void>((resolve) => setTimeout(resolve, 650)); return action(); } finally { pending.current = false; setBusy(false); } }
  return { repository, section, files, selectedFiles, activeFile, message, ahead, behind, busy, notice, canCommit, canSync, state, recordFiles,
    openRepository: (index) => { setRepository(index); setSection('cases'); }, setSection,
    toggleFile: (path, selected) => { if (!pending.current && !blocked) setSelectedFiles((old) => selected ? [...new Set([...old, path])] : old.filter((item) => item !== path)); },
    setActiveFile, setMessage: (value) => { if (!pending.current && canCommit) setMessage(value); },
    commit: async (plan = { paths: [...selectedFiles], message }) => {
      if (!canCommit || !plan.message.trim() || !plan.paths.length || plan.paths.some((path) => !files.some((file) => file.path === path))) return false;
      return perform(() => { setFiles((old) => old.filter((item) => !plan.paths.includes(item.path))); setSelectedFiles((old) => old.filter((path) => !plan.paths.includes(path))); setMessage(''); setAhead((value) => value + 1); setNotice(t('commitDone')); return true; });
    },
    sync: async (action) => {
      if (action === 'abort' ? state !== 'conflict' && state !== 'abortFailed' : !canSync) return false;
      return perform(() => {
        if (action === 'abort') { if (state === 'abortFailed') { setNotice(getLayoutState(state).detail); return false; } setNotice(t('abortDone')); return true; }
        if (state === 'offline' || state === 'auth' || (state === 'rejected' && action === 'push')) { setNotice(getLayoutState(state).detail); return false; }
        if (action === 'pull') { setBehind(0); setNotice(t('pullDone')); } else { setAhead(0); setNotice(t('pushDone')); } return true;
      });
    },
  };
}
