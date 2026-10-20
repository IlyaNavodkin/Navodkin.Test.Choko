import { useEffect, useMemo, useState } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Input, Modal, ModalBody, ModalFooter, ModalHeader, Select, Textarea } from '@/components/ui';
import { pickFile } from '@/lib/nwjs';
import { cn } from '@/lib/utils';
import { addEvidenceFile, defectRel, environmentFor, loadDefect, saveDefect } from '@/services/defects';
import { useApp } from '@/store/app-store';
import type { Case, Run, RunRow } from '@/types';
import {
  buildDefectDraft,
  defaultDefectSummary,
  defectWarnings,
  renderDefectMarkdown,
  type DefectDraft,
  type DefectSource,
} from '@/utils/defect';
import { renderMarkdown } from '@/utils/markdown';
import { markdownToHtml } from '@/utils/markdown-html';

interface Props {
  run: Run;
  row: RunRow;
  idx: number;
  kase: Case | undefined;
  onClose: () => void;
}

const TABS = ['edit', 'preview'] as const;
type Tab = (typeof TABS)[number];

/**
 * Defect-snapshot composer. Prefills from the run row + case, lets the tester correct the
 * summary/environment/expected/actual, attach evidence, and freezes the result into
 * `.casewright/defects/<run>/<case>.md` on save/copy.
 */
export function DefectReportModal({ run, row, idx, kase, onClose }: Props) {
  const ctx = useApp();
  const [draft, setDraft] = useState<DefectDraft | null>(null);
  const [tab, setTab] = useState<Tab>('edit');
  const [savedRel, setSavedRel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [includeAllSteps, setIncludeAllSteps] = useState(false);

  // Prefer a failed automated result; fall back to the first result mapped to this row.
  const automationResults = (ctx.runAutomation[run.id]?.results ?? []).filter(
    (r) => r.caseRowIndex === idx || r.caseId === row.case_id,
  );
  const autoResult =
    automationResults.find((r) => r.status === 'failed' || r.status === 'timedOut') ?? automationResults[0];
  const automation = autoResult
    ? {
        executionId: autoResult.executionId,
        automationId: autoResult.automationId,
        project: autoResult.project,
        status: autoResult.status,
        attempts: autoResult.attempts,
        ...(autoResult.error ? { error: autoResult.error } : {}),
      }
    : null;

  useEffect(() => {
    void ctx.loadRunAutomation(run.id).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = ctx.repoPath ? await loadDefect(ctx.repoPath, run, row) : null;
      if (cancelled) return;
      if (existing) {
        setDraft(existing);
        setSavedRel(defectRel(run, row));
        return;
      }
      setDraft(
        buildDefectDraft(run, row, kase, {
          environment: environmentFor(kase),
          automation: automation ?? null,
          source: row.executed_at ? 'manual' : automation ? 'automation' : 'manual',
        }),
      );
      setSavedRel(null);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id, row.case_id, ctx.repoPath]);

  const warnings = useMemo(
    () => (draft ? defectWarnings(draft, defaultDefectSummary(run, row)) : []),
    [draft, run, row],
  );
  const markdown = draft ? renderDefectMarkdown(draft) : '';

  const update = (patch: Partial<DefectDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const persist = async (): Promise<boolean> => {
    if (!draft) return false;
    if (!ctx.repoPath) {
      ctx.toast('Open a repository to save the snapshot');
      return false;
    }
    setBusy(true);
    try {
      const next = { ...draft, updatedAt: new Date().toISOString() };
      const rel = await saveDefect(ctx.repoPath, run, row, next);
      setDraft(next);
      setSavedRel(rel);
      return true;
    } catch (e) {
      ctx.toast(`Could not save the snapshot: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const copyReport = async () => {
    if (!draft) return;
    const saved = await persist();
    const text = markdown;
    const html = `<div>${markdownToHtml(text)}</div>`;
    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      ctx.toast(saved ? 'Snapshot saved and copied' : 'Defect copied');
    } catch {
      try {
        await navigator.clipboard.writeText(text);
        ctx.toast(saved ? 'Snapshot saved and copied' : 'Defect copied');
      } catch {
        ctx.toast('Could not copy');
      }
    }
  };

  const copySummary = () => {
    if (!draft) return;
    const writing = navigator.clipboard?.writeText(draft.summary.trim());
    if (!writing) {
      ctx.toast('Clipboard unavailable');
      return;
    }
    void writing.then(
      () => ctx.toast('Summary copied'),
      () => ctx.toast('Could not copy'),
    );
  };

  const resetFromCase = async () => {
    if (!draft) return;
    const ok = await ctx.confirm({
      title: 'Reset the report from the case?',
      message: 'The editable fields are rebuilt from the current case and run. Evidence is kept.',
      confirmLabel: 'Reset',
    });
    if (!ok) return;
    const fresh = buildDefectDraft(run, row, kase, {
      environment: draft.environment || environmentFor(kase),
      automation: draft.automation ?? automation,
      source: draft.source,
      includeAllSteps,
    });
    fresh.evidence = draft.evidence;
    fresh.createdAt = draft.createdAt;
    setDraft(fresh);
  };

  const addEvidence = async () => {
    if (!ctx.repoPath) {
      ctx.toast('Open a repository to attach evidence');
      return;
    }
    const source = await pickFile();
    if (!source) return;
    try {
      const e = await addEvidenceFile(ctx.repoPath, run, row, source);
      setDraft((d) => (d ? { ...d, evidence: [...d.evidence, e] } : d));
      ctx.toast('Evidence attached');
    } catch (err) {
      ctx.toast(`Could not attach evidence: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const toggleAllSteps = (checked: boolean) => {
    setIncludeAllSteps(checked);
    if (!draft) return;
    const next = buildDefectDraft(run, row, kase, { includeAllSteps: checked });
    update({ steps: next.steps });
  };

  return (
    <Modal maxWidth={900} onClose={onClose}>
      <ModalHeader>
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[14.5px] font-semibold">Defect report</span>
          <span className="font-mono text-[11px] text-ink-faint">{row.display_id}</span>
          {savedRel && <span className="truncate font-mono text-[10.5px] text-ink-faint">· {savedRel}</span>}
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-0.5 rounded-md border border-border bg-panel-2 p-0.5">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={cn(
                'h-6 rounded px-2 text-[11.5px] font-medium capitalize transition',
                tab === t ? 'bg-panel text-ink shadow-[0_1px_2px_oklch(0.3_0.02_70/0.12)]' : 'text-ink-3 hover:text-ink',
              )}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <Button icon variant="ghost" onClick={onClose} title="Close">
          {I.x({ size: 14 })}
        </Button>
      </ModalHeader>

      <ModalBody className="flex flex-col gap-3">
        {!draft ? (
          <div className="py-10 text-center text-[12.5px] text-ink-3">Loading…</div>
        ) : tab === 'edit' ? (
          <>
            {warnings.length > 0 && (
              <div className="flex flex-col gap-1 rounded-md border border-[oklch(0.85_0.06_80)] bg-blocked-soft px-3 py-2 text-[12px] text-[oklch(0.5_0.12_66)]">
                <div className="flex items-center gap-1.5 font-semibold">
                  {I.warn({ size: 13 })} Before you copy
                </div>
                <ul className="ml-4 list-disc">
                  {warnings.map((w) => (
                    <li key={w.code}>{w.message}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-3">
              <Field label="Summary">
                <Input value={draft.summary} onChange={(e) => update({ summary: e.target.value })} />
              </Field>
              <Field label="Source">
                <Select value={draft.source} onChange={(e) => update({ source: e.target.value as DefectSource, automation: draft.automation ?? automation })}>
                  <option value="manual">Manual</option>
                  {automation && <option value="automation">Autotest</option>}
                  {automation && <option value="both">Manual + autotest</option>}
                </Select>
              </Field>
            </div>

            <Field label="Environment">
              <Textarea rows={2} value={draft.environment} onChange={(e) => update({ environment: e.target.value })} />
            </Field>

            <Field label="Objective">
              <Textarea rows={2} value={draft.objective} onChange={(e) => update({ objective: e.target.value })} />
            </Field>

            <Field label="Preconditions">
              <Textarea rows={3} value={draft.preconditions} onChange={(e) => update({ preconditions: e.target.value })} />
            </Field>

            <Field
              label={
                <span className="flex items-center gap-2">
                  Steps to reproduce
                  <label className="flex cursor-pointer items-center gap-1 text-[10.5px] font-normal normal-case tracking-normal text-ink-3">
                    <input type="checkbox" checked={includeAllSteps} onChange={(e) => toggleAllSteps(e.target.checked)} />
                    include steps after the failure
                  </label>
                </span>
              }
            >
              <Textarea rows={7} value={draft.steps} onChange={(e) => update({ steps: e.target.value })} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Expected result">
                <Textarea
                  rows={4}
                  value={draft.expected}
                  placeholder="What should have happened? Quote the relevant requirement if the case doesn't state it."
                  onChange={(e) => update({ expected: e.target.value })}
                />
              </Field>
              <Field label="Actual result">
                <Textarea rows={4} value={draft.actual} onChange={(e) => update({ actual: e.target.value })} />
              </Field>
            </div>

            <Field label="Test data">
              <Textarea rows={2} value={draft.testData} onChange={(e) => update({ testData: e.target.value })} />
            </Field>

            <Field label="Evidence">
              <div className="flex flex-col gap-1.5">
                {draft.evidence.map((e, i) => (
                  <div key={e.path} className="flex items-center gap-2 rounded border border-border bg-panel-2 px-2 py-1 text-[12px]">
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink-2">{e.name}</span>
                    <Button
                      icon
                      size="sm"
                      variant="ghost"
                      title="Remove from the report (the file stays on disk)"
                      onClick={() => update({ evidence: draft.evidence.filter((_x, j) => j !== i) })}
                    >
                      {I.x({ size: 12 })}
                    </Button>
                  </div>
                ))}
                <div>
                  <Button size="sm" variant="ghost" disabled={!ctx.repoPath} onClick={() => void addEvidence()}>
                    {I.plus({ size: 12 })} Attach file…
                  </Button>
                </div>
              </div>
            </Field>

            <Field label="Notes">
              <Textarea rows={3} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} />
            </Field>
          </>
        ) : (
          <div className="rounded-md border border-border bg-panel-2 px-[18px] py-4 font-read text-[14px] leading-[1.6]">
            {markdown.trim() ? renderMarkdown(markdown, 'defect-preview') : <span className="text-ink-3">Nothing to preview yet.</span>}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        {warnings.length > 0 && (
          <span className="mr-auto text-[11.5px] text-[oklch(0.5_0.12_66)]">
            {warnings.length} check{warnings.length === 1 ? '' : 's'} before copy
          </span>
        )}
        <Button variant="ghost" onClick={() => void resetFromCase()} disabled={!draft}>
          Reset from case
        </Button>
        <Button variant="ghost" onClick={copySummary} disabled={!draft}>
          Copy summary
        </Button>
        <Button onClick={() => void copyReport()} disabled={!draft}>
          {I.copy({ size: 13 })} Copy report
        </Button>
        <Button variant="primary" onClick={() => void persist()} disabled={!draft || busy}>
          {busy ? 'Saving…' : 'Save snapshot'}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
