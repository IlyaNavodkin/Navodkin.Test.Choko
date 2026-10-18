import { useRef, useState } from 'react';
import { useZodForm } from '../../../shared/forms/useZodForm';
import { caseDraft, demoCases, filterCases } from './fixtures';
import { t } from './messages';
import { caseSchema } from './schema';
import type { CaseDraft, CaseFilters, DemoCase } from './types';

export type UsePreviewCaseEditorArgs = { blocked?: boolean; failSave?: boolean };
export type UsePreviewCaseEditorResult = {
  cases: DemoCase[]; folders: string[]; visibleCases: DemoCase[]; selected: DemoCase | null; values: CaseDraft;
  errors: Partial<Record<keyof CaseDraft, string>>; dirty: boolean; saving: boolean; saved: boolean; blocked: boolean;
  filters: CaseFilters; folder: string | null; notice: string; revision: number;
  setFilters: (value: CaseFilters) => void; selectCase: (id: string, approved?: boolean) => void; selectFolder: (folder: string, approved?: boolean) => void;
  update: <K extends keyof CaseDraft>(key: K, value: CaseDraft[K]) => void; save: () => Promise<boolean>; discard: () => void;
  replace: (cases: DemoCase[], folders: string[], selectId?: string) => boolean; clear: () => void;
};
export function usePreviewCaseEditor({ blocked = false, failSave = false }: UsePreviewCaseEditorArgs = {}): UsePreviewCaseEditorResult {
  const [cases, setCases] = useState(() => structuredClone(demoCases));
  const [folders, setFolders] = useState(() => [...new Set(demoCases.map((item) => item.folder))]);
  const [revision, setRevision] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(demoCases[0].id);
  const [folder, setFolder] = useState<string | null>(null);
  const [filters, setFilters] = useState<CaseFilters>({ search: '', status: '', tag: '', folder: '' });
  const [saving, setSaving] = useState(false); const pending = useRef(false);
  const [saved, setSaved] = useState(false); const [notice, setNotice] = useState('');
  const selected = cases.find((item) => item.id === selectedId) ?? null;
  const form = useZodForm<CaseDraft>({ initialValues: caseDraft(demoCases[0]), schema: caseSchema, invalidMessage: t('required') });
  const dirty = selected !== null && JSON.stringify(form.values) !== JSON.stringify(caseDraft(selected));
  function selectCase(id: string, approved = false) {
    if (id === selectedId && folder === null) return;
    if (pending.current || (dirty && !approved && id !== selectedId)) { setNotice(t('saveBeforeSwitch')); return; }
    const item = cases.find((item) => item.id === id); if (!item) return;
    setSelectedId(id); form.reset(caseDraft(item)); setFolder(null); setSaved(false); setNotice('');
  }
  async function save(): Promise<boolean> {
    if (blocked) { setNotice(t('writingBlocked')); return false; }
    if (pending.current) return false; if (!dirty) return true;
    const values = form.validate(); if (!values || !selected) return false;
    pending.current = true; setSaving(true);
    try {
      await new Promise<void>((resolve) => setTimeout(resolve, 550));
      if (failSave) { setNotice(t('saveError')); return false; }
      setCases((old) => old.map((item) => item.id === selectedId ? { ...item, ...values } : item));
      setRevision((old) => old + 1); setSaved(true); setNotice(''); return true;
    } finally { pending.current = false; setSaving(false); }
  }
  function replace(nextCases: DemoCase[], nextFolders: string[], selectId = selectedId) {
    if (blocked || pending.current) { setNotice(t('writingBlocked')); return false; }
    setCases(nextCases); setFolders(nextFolders); setRevision((old) => old + 1);
    const nextSelected = nextCases.find((item) => item.id === selectId) ?? nextCases[0] ?? null;
    setSelectedId(nextSelected?.id ?? null); if (nextSelected) form.reset(caseDraft(nextSelected));
    setFolder(null); setFilters({ search: '', status: '', tag: '', folder: '' }); setNotice(t('operationDone')); return true;
  }
  return { cases, folders, visibleCases: filterCases(cases, filters), selected, values: form.values, errors: form.errors, dirty, saving, saved, blocked, filters, folder, notice, revision, setFilters, selectCase,
    selectFolder: (value, approved = false) => { if (pending.current || (dirty && !approved)) { setNotice(t('saveBeforeSwitch')); return; } setFolder(value); setFilters((old) => ({ ...old, folder: value })); },
    update: (key, value) => { if (!pending.current && !blocked) { form.setFieldValue(key, value); setSaved(false); } }, save,
    discard: () => { if (!pending.current && selected) { form.reset(caseDraft(selected)); setNotice(''); } }, replace,
    clear: () => { if (!blocked && !pending.current) { setCases([]); setSelectedId(null); setFolder(null); setRevision((value) => value + 1); } },
  };
}
