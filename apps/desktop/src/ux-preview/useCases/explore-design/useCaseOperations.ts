import { useRef, useState } from 'react';
import { z } from 'zod';
import { useZodForm } from '../../../shared/forms/useZodForm';
import { casePath, planIsCurrent, prepareCaseOperation, suiteOperations, validSegment, type CaseOperation, type OperationFields, type OperationPlan } from './caseOperations';
import type { LayoutStateId } from './layoutStates';
import { t } from './messages';
import type { UsePreviewCaseEditorResult } from './usePreviewCaseEditor';
export type PartialDeleteReport = { removed: string[]; remaining: string[]; journal: string };
export type UseCaseOperationsArgs = { editor: UsePreviewCaseEditorResult; state: LayoutStateId; onRecovery: () => void };
export type UseCaseOperationsResult = {
  operation: CaseOperation | null; phase: 'parameters' | 'preview' | 'stale' | 'partial'; values: OperationFields; error: string; busy: boolean;
  plan: OperationPlan | null; report: PartialDeleteReport | null; source: string;
  open: (operation: CaseOperation) => void; close: () => void; update: (key: keyof OperationFields, value: string) => void;
  prepare: () => void; confirm: () => Promise<void>; back: () => void; showRecovery: () => void;
};
export function useCaseOperations({ editor, state, onRecovery }: UseCaseOperationsArgs): UseCaseOperationsResult {
  const [operation, setOperation] = useState<CaseOperation | null>(null); const [phase, setPhase] = useState<UseCaseOperationsResult['phase']>('parameters');
  const [plan, setPlan] = useState<OperationPlan | null>(null); const [report, setReport] = useState<PartialDeleteReport | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const pending = useRef(false); const serial = useRef(100); const staleRetried = useRef(false);
  const form = useZodForm<OperationFields>({ initialValues: { name: '', destination: '' }, schema: z.object({ name: z.string(), destination: z.string() }), invalidMessage: t('invalidName') });
  const folder = editor.folder ?? editor.selected?.folder ?? editor.folders[0] ?? '';
  const isSuite = operation !== null && suiteOperations.includes(operation);
  const source = isSuite ? `cases/${folder}` : editor.selected ? casePath(editor.selected) : '';
  function prepare() {
    if (!operation || editor.blocked || pending.current) return;
    const values = form.validate(); if (!values) return;
    const needsName = ['newCase', 'duplicateCase', 'newFolder', 'renameCase', 'renameSuite', 'duplicateSuite'].includes(operation);
    const destination = [values.destination, values.name.trim()].filter(Boolean).join('/');
    if ((needsName && !validSegment(values.name)) || (operation === 'renameCase' && !values.name.endsWith('.md')) || (['newFolder', 'renameSuite', 'duplicateSuite'].includes(operation) && editor.folders.includes(destination)) || (operation === 'moveSuite' && (!values.destination || values.destination === folder || values.destination.startsWith(`${folder}/`))) || (['newCase', 'duplicateCase', 'moveCase'].includes(operation) && !values.destination)) { setError(t('invalidName')); return; }
    const nextPlan = prepareCaseOperation({ operation, fields: values, selected: editor.selected, folder, cases: editor.cases, folders: editor.folders, revision: editor.revision, allocateId: () => `demo-case-${serial.current++}` });
    const existingPaths = editor.cases.map(casePath);
    if (nextPlan.entries.some((entry) => entry.to && entry.to !== entry.from && existingPaths.includes(entry.to))) { setError(t('invalidName')); return; }
    setPlan(nextPlan); setPhase('preview'); setError('');
  }
  function showRecovery() {
    setOperation('deleteSuite'); setPhase('partial'); setReport({ removed: ['cases/Оплата картой/PAY-042.md'], remaining: ['cases/Оплата картой/vendor.txt', 'cases/Оплата картой.md'], journal: '.testoritto-suite-demo/journal.json' });
  }
  return { operation, phase, values: form.values, error, busy, plan, report, source,
    open: (value) => { if (editor.blocked || pending.current) return; setOperation(value); setPlan(null); setReport(null); setPhase('parameters'); setError(''); staleRetried.current = false; form.reset({ name: value === 'duplicateCase' ? `${editor.selected?.title ?? ''} · копия` : value === 'renameCase' ? editor.selected?.filename ?? `${editor.selected?.displayId ?? ''}.md` : value === 'renameSuite' ? folder.split('/').at(-1) ?? '' : '', destination: value === 'newFolder' || suiteOperations.includes(value) ? '' : folder }); },
    close: () => { if (!pending.current) { setOperation(null); setError(''); } },
    update: (key, value) => { if (!pending.current) form.setFieldValue(key, value); }, prepare,
    back: () => { if (!pending.current) { setPhase('parameters'); setError(''); } }, showRecovery,
    confirm: async () => {
      if (!plan || !operation || editor.blocked || pending.current) return;
      if (!planIsCurrent(plan, editor.revision) || (state === 'suiteStale' && isSuite && !staleRetried.current)) { staleRetried.current = true; setPhase('stale'); return; }
      pending.current = true; setBusy(true);
      try { await new Promise<void>((resolve) => setTimeout(resolve, 450));
        if (operation === 'deleteSuite' && state === 'suitePartial') {
          const first = editor.cases.find((item) => plan.affectedIds.includes(item.id));
          const removed = first ? [casePath(first)] : [plan.entries[0].from!];
          editor.replace(editor.cases.filter((item) => item.id !== first?.id), editor.folders);
          setReport({ removed, remaining: plan.entries.map((item) => item.from!).filter((path) => !removed.includes(path)), journal: '.testoritto-suite-demo/journal.json' }); setPhase('partial'); onRecovery();
        } else if (editor.replace(plan.cases, plan.folders, plan.selectId)) setOperation(null);
      } finally { pending.current = false; setBusy(false); }
    },
  };
}
