import { useEffect, useRef, useState } from 'react';
import { I } from '@/components/icons';
import { Button, Field, Input, RES, SELECTABLE_RESULTS, Textarea } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import { renderInline, renderMarkdown } from '@/utils/markdown';
import { resolveVariables } from '@/utils/variables';
import { buildDefectText, deriveItems, effectiveTestDate, type ChecklistItem } from '@/utils/run-items';
import type { CheckState, Result } from '@/types';
import { GuideChecklist } from './GuideChecklist';

export function RunGuide() {
  const ctx = useApp();
  const run = ctx.runs.find((r) => r.id === ctx.sel.runId);
  const idx = ctx.sel.guideIndex ?? 0;
  const [result, setResult] = useState<Result | null>(null);
  const [tester, setTester] = useState(ctx.lastTester);
  const [notes, setNotes] = useState('');
  const [forceRecord, setForceRecord] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const runId = run?.id;
  const row = run?.rows[idx];
  // Seed the recorder from the row so revisiting a recorded case shows its state.
  useEffect(() => {
    setResult(row && row.result !== 'not_run' ? row.result : null);
    setNotes(row?.notes ?? '');
    setTester(row?.tester || ctx.lastTester);
    setForceRecord(false);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, runId]);

  if (!run || !row) return null;
  const kase = ctx.cases.find((c) => c.id === row.case_id);

  const myChecks = row.checks;
  const myFailNotes = row.failNotes;
  const cycle = (key: string) => ctx.cycleRunCheck(run.id, idx, key);
  const setCheck = (key: string, state: CheckState) => ctx.setRunGroupChecks(run.id, idx, [key], state);
  const setFailNote = (key: string, value: string) => ctx.setRunFailNote(run.id, idx, key, value);
  const copyText = (text: string) => {
    const t = text.trim();
    if (!t) return;
    const writing = navigator.clipboard?.writeText(t);
    if (!writing) {
      ctx.toast('Clipboard unavailable');
      return;
    }
    void writing.then(
      () => ctx.toast('Copied'),
      () => ctx.toast('Could not copy'),
    );
  };

  // ---- derive checklist items from the live case, resolving {{today}} against the test date ----
  const testDate = effectiveTestDate(run, row);
  const withDates = (items: ChecklistItem[]) =>
    items.map((it) => ({
      ...it,
      text: resolveVariables(it.text, testDate),
      body: it.body ? resolveVariables(it.body, testDate) : it.body,
    }));
  const derived = deriveItems(kase);
  const setupItems = withDates(derived.setup);
  const stepItems = withDates(derived.steps);
  const acceptItems = withDates(derived.accept);
  const allItems = [...setupItems, ...stepItems, ...acceptItems];
  const total = allItems.length;
  const checkedCount = allItems.filter((it) => (myChecks[it.key] ?? 'none') !== 'none').length;
  const complete = total > 0 && allItems.every((it) => myChecks[it.key] === 'pass');
  const canRecord = complete || forceRecord;
  const setGroup = (keys: string[], state: 'none' | 'pass' | 'fail') => ctx.setRunGroupChecks(run.id, idx, keys, state);

  // ---- navigation / recording ----
  const remaining = run.rows.map((_, i) => i).filter((i) => i !== idx && run.rows[i].result === 'not_run');
  const go = (i: number) => ctx.guideGo(i);
  const record = () => {
    if (!result) return;
    if (tester.trim()) ctx.setLastTester(tester.trim());
    ctx.recordRunResult(run.id, idx, { result, tester, notes });
    ctx.toast(`${row.display_id} recorded · ${RES[result].label}`);
    const next = run.rows.findIndex((r, i) => i > idx && r.result === 'not_run');
    const anyEarlier = run.rows.findIndex((r) => r.result === 'not_run');
    if (next !== -1) go(next);
    else if (anyEarlier !== -1) go(anyEarlier);
    else ctx.exitGuide();
  };

  const tested = run.rows.filter((r) => r.result !== 'not_run').length;

  // ---- defect helper (shown once a non-passing result is chosen) ----
  const effResult: Result | null = result ?? (row.result !== 'not_run' ? row.result : null);
  const showDefect = effResult === 'fail' || effResult === 'blocked' || effResult === 'skipped';
  const defectText = showDefect ? buildDefectText(run, { ...row, result: effResult, tester, notes }, kase) : '';
  const copyDefect = () => {
    const writing = navigator.clipboard?.writeText(defectText);
    if (!writing) {
      ctx.toast('Clipboard unavailable');
      return;
    }
    void writing.then(
      () => ctx.toast('Defect copied to clipboard'),
      () => ctx.toast('Could not copy'),
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg">
      <div className="flex h-[56px] flex-none items-center gap-4 border-b border-border bg-panel-2 px-[22px]">
        <Button variant="ghost" onClick={ctx.exitGuide}>
          {I.back({ size: 15 })} Results grid
        </Button>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold">{run.name}</div>
          <div className="mt-px text-[11.5px] text-ink-faint">
            {tested} of {run.rows.length} cases recorded
          </div>
        </div>
        <div className="flex items-center gap-1.5" title="Resolves {{today}} in this case against this date">
          <label htmlFor="cw-test-date" className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-ink-faint">
            Test date
          </label>
          <input
            id="cw-test-date"
            type="date"
            className="h-[28px] rounded-md border border-border bg-panel px-2 font-mono text-[12px] text-ink focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:outline-none"
            value={testDate}
            onChange={(e) => ctx.setRowTestDate(run.id, idx, e.target.value || null)}
          />
          {row.testDate != null && (
            <button
              className="text-[11px] font-medium text-accent-ink hover:underline"
              title="Reset to the run's test date"
              onClick={() => ctx.setRowTestDate(run.id, idx, null)}
            >
              reset
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button icon disabled={idx === 0} onClick={() => go(idx - 1)} title="Previous case">
            {I.chevron({ size: 16, style: { transform: 'rotate(180deg)' } })}
          </Button>
          <span className="min-w-[44px] text-center font-mono text-[12px] text-ink-3">
            {idx + 1} / {run.rows.length}
          </span>
          <Button icon disabled={idx === run.rows.length - 1} onClick={() => go(idx + 1)} title="Next case">
            {I.chevron({ size: 16 })}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto" ref={scrollRef}>
        <div className="mx-auto flex max-w-[720px] flex-col gap-4 px-[26px] pb-20 pt-[26px]">
          <div className="pb-1.5">
            <div className="font-mono text-[12px] font-semibold text-accent-ink">{row.display_id}</div>
            <h2 className="mb-3 mt-1 text-[23px] font-semibold leading-[1.25] tracking-[-0.01em] [text-wrap:pretty]">
              {kase ? kase.title : row.title}
            </h2>
            <div className="flex items-center gap-2.5">
              <div className="h-1.5 max-w-[260px] flex-1 overflow-hidden rounded-full bg-sunken">
                <i className="block h-full bg-accent transition-[width] duration-200" style={{ width: (total ? (checkedCount / total) * 100 : 0) + '%' }} />
              </div>
              <span className="font-mono text-[11.5px] text-ink-faint">
                {checkedCount}/{total} checks
              </span>
            </div>
          </div>

          {!kase ? (
            <div className="flex items-center gap-[13px] rounded-lg border border-[oklch(0.85_0.07_80)] bg-blocked-soft p-[18px] text-[oklch(0.5_0.12_66)]">
              {I.warn({ size: 22 })}
              <div>
                <div className="mb-[3px] font-semibold">This case no longer resolves to a live file.</div>
                <div className="text-ink-3">
                  It was deleted after the run was created. You can still record a result from the snapshot.
                </div>
              </div>
            </div>
          ) : (
            <>
              <section className="overflow-hidden rounded-lg border border-border bg-panel-2">
                <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">Brief</span>
                </div>
                <div className="px-[18px] py-4 font-read text-[16.5px] leading-[1.6] text-[oklch(0.30_0.012_60)]">
                  {renderMarkdown(resolveVariables(kase.objective, testDate), 'gobj')}
                </div>
                <div className="px-[18px] pb-4">
                  <div className="mb-[7px] text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint">Systems in scope</div>
                  <div className="flex flex-wrap gap-1.5">
                    {kase.systems.map((s, i) => (
                      <span key={i} className="rounded-full border border-border bg-panel px-[11px] py-[3px] text-[12.5px] text-ink-2">
                        {renderInline(resolveVariables(s, testDate), `gsys${i}`)}
                      </span>
                    ))}
                  </div>
                </div>
              </section>

              <GuideChecklist
                title="Setup"
                caption="Get the environment ready before you begin."
                items={setupItems}
                myChecks={myChecks}
                failNotes={myFailNotes}
                cycle={cycle}
                onFailNote={setFailNote}
                setGroup={(state) => setGroup(setupItems.map((i) => i.key), state)}
                setState={setCheck}
                copy={copyText}
              />
              <GuideChecklist
                title="Steps"
                caption="Perform each step in order — click to mark passed or failed."
                numbered
                items={stepItems}
                myChecks={myChecks}
                failNotes={myFailNotes}
                cycle={cycle}
                onFailNote={setFailNote}
                setGroup={(state) => setGroup(stepItems.map((i) => i.key), state)}
                setState={setCheck}
                copy={copyText}
              />
              <GuideChecklist
                title="Acceptance Criteria"
                caption="Verify every acceptance criterion holds."
                items={acceptItems}
                myChecks={myChecks}
                failNotes={myFailNotes}
                cycle={cycle}
                onFailNote={setFailNote}
                setGroup={(state) => setGroup(acceptItems.map((i) => i.key), state)}
                setState={setCheck}
                copy={copyText}
              />
            </>
          )}

          <section
            className={cn(
              'overflow-hidden rounded-lg border bg-panel transition-opacity',
              canRecord ? 'border-accent-line shadow-[0_2px_14px_var(--shadow)]' : 'border-border-2 opacity-[0.92]',
            )}
          >
            <div className="flex items-center gap-2.5 border-b border-border bg-panel-2 px-4 py-3">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">Record result</span>
              {!canRecord && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-[oklch(0.55_0.1_66)]">
                  {I.warn({ size: 13 })} Pass all {total} checks to record a pass
                </span>
              )}
              {complete && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] font-semibold text-pass">
                  {I.check({ size: 14 })} All checks passed
                </span>
              )}
            </div>

            <div className="flex flex-col gap-[14px] p-4">
              <div className="flex flex-wrap gap-2">
                {SELECTABLE_RESULTS.map((r) => (
                  <button
                    key={r.key}
                    className="inline-flex items-center gap-[7px] rounded-md border border-border-2 bg-panel px-4 py-2 text-[13.5px] font-semibold text-ink enabled:hover:bg-raise disabled:pointer-events-none disabled:opacity-40"
                    disabled={!canRecord}
                    style={
                      result === r.key
                        ? { borderColor: r.color, background: 'color-mix(in oklch, ' + r.color + ' 12%, white)' }
                        : undefined
                    }
                    onClick={() => setResult(r.key)}
                  >
                    <span className="size-2.5 rounded-[3px]" style={{ background: r.color }} />
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <Field label="Tester">
                  <Input mono className="disabled:opacity-50" value={tester} disabled={!canRecord} onChange={(e) => setTester(e.target.value)} />
                </Field>
                <Field
                  className="flex-1"
                  label={<>Notes {result === 'fail' && <span className="text-fail">· link a defect</span>}</>}
                >
                  <Textarea
                    className="min-h-[38px] resize-none overflow-hidden text-[13px] leading-[1.45] disabled:opacity-50"
                    value={notes}
                    disabled={!canRecord}
                    rows={1}
                    placeholder={result === 'fail' ? 'What failed? Markdown ok — link DEF-…' : 'Optional · markdown, multi-line'}
                    onChange={(e) => {
                      setNotes(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                    }}
                  />
                </Field>
              </div>
            </div>

            <div className="flex items-center gap-2.5 border-t border-border bg-panel-2 px-4 py-3">
              {!complete && !forceRecord && (
                <Button variant="ghost" size="sm" className="text-[oklch(0.55_0.1_66)] hover:bg-blocked-soft" onClick={() => setForceRecord(true)}>
                  {I.warn({ size: 13 })} Can't complete — record fail / blocked / in progress
                </Button>
              )}
              <span className="flex-1" />
              <Button variant="primary" disabled={!canRecord || !result} onClick={record}>
                {I.check({ size: 15 })} {remaining.length ? 'Save & next case' : 'Save & finish'}
              </Button>
            </div>
          </section>

          {showDefect && (
            <section className="overflow-hidden rounded-lg border border-[oklch(0.85_0.07_27)] bg-fail-soft">
              <div className="flex items-center gap-2.5 border-b border-[oklch(0.88_0.05_27)] px-4 py-3">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-fail">Defect report</span>
                <span className="flex-1 text-[12px] text-ink-3">Paste into your work-item tracker; link back to this run.</span>
                <Button variant="ghost" size="sm" onClick={copyDefect}>
                  {I.copy({ size: 13 })} Copy
                </Button>
              </div>
              <pre className="max-h-[280px] overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-[12px] leading-[1.5] text-ink-2">{defectText}</pre>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
