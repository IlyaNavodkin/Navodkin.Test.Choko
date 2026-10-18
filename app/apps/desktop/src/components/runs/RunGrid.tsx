import { useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { I } from '@/components/icons';
import { Button, Input, RES } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/store/app-store';
import { firstUnrun, nowStamp } from '@/utils/ids';
import { renderInline, renderMarkdown } from '@/utils/markdown';
import { buildRunSummary, type RunSummaryEntry } from '@/utils/run-items';
import type { Approval, Result, RunRow } from '@/types';
import { NotesField } from './NotesField';
import { RunCaseCard } from './RunCaseCard';

/** A tester/reviewer approval control: shows the stamp when set, else a name + approve button. */
function ApprovalCard({
  label,
  approval,
  defaultName,
  onApprove,
  onClear,
}: {
  label: string;
  approval: Approval | null;
  defaultName: string;
  onApprove: (name: string) => void;
  onClear: () => void;
}) {
  const [name, setName] = useState(defaultName);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-panel p-[14px]">
      <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">{label}</div>
      {approval ? (
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-pass">{I.check({ size: 14 })} {approval.name}</span>
          <span className="font-mono text-[11.5px] text-ink-faint">{approval.at}</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
            {I.x({ size: 12 })} Clear
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Input className="flex-1" mono value={name} placeholder="Your name" onChange={(e) => setName(e.target.value)} />
          <Button variant="primary" size="sm" disabled={!name.trim()} onClick={() => onApprove(name.trim())}>
            {I.check({ size: 13 })} Approve
          </Button>
        </div>
      )}
    </div>
  );
}

const SEGS: Result[] = ['pass', 'fail', 'blocked', 'in_progress', 'skipped', 'not_run'];

/* resizable run-detail panel bounds (px); width persists in localStorage */
const PANEL_MIN = 360;
const PANEL_MAX = 760;
const PANEL_DEFAULT = 540;
const PANEL_KEY = 'cw:runPanelWidth';
/* Smallest sliver of center content to keep visible — the drag can't grow the panel past this,
   so the panel never pushes off-screen no matter how narrow the window is. */
const MIN_CENTER = 120;

/** A failed/blocked case in the generated Summary, shown with its failed steps + notes. */
function AttentionRow({ entry }: { entry: RunSummaryEntry }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-panel-2 p-2.5">
      <div className="flex items-center gap-2">
        <span className="size-[9px] shrink-0 rounded-[3px]" style={{ background: RES[entry.result].color }} />
        <span className="font-mono text-[11px] text-ink-3">{entry.display_id}</span>
        <span className="text-[13px] font-semibold text-ink">{entry.title}</span>
        <span className="ml-auto font-mono text-[11px] font-semibold" style={{ color: RES[entry.result].color }}>
          {RES[entry.result].label}
        </span>
      </div>
      {entry.failures.length > 0 && (
        <ul className="flex flex-col gap-1 pl-0.5">
          {entry.failures.map((f, k) => (
            <li key={k} className="flex gap-1.5 text-[12.5px] leading-[1.45] text-ink-2">
              <span className="mt-[5px] size-[6px] shrink-0 rounded-full bg-fail" />
              <span>
                {renderInline(f.text, `af${entry.case_id}-${k}`)}
                {f.note && <span className="text-ink-3"> — {renderInline(f.note, `an${entry.case_id}-${k}`)}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {entry.notes && <div className="text-[12px] text-ink-3">{renderMarkdown(entry.notes, `anote${entry.case_id}`)}</div>}
      {entry.failures.length === 0 && !entry.notes && (
        <div className="text-[12px] text-ink-faint">No failure detail recorded.</div>
      )}
    </div>
  );
}

const RUN_STATUS: Record<string, string> = {
  open: 'text-accent-ink bg-accent-soft',
  closed: 'text-ink-3 bg-sunken',
};

// Vertical insertion indicator for the card grid — absolute so showing it never reflows the grid
// (a reflow would shift the drag hit-targets mid-drag and make the drop index oscillate). Sits in
// the gap to the left of the target card, or to the right of the last card.
const dropLine =
  "pointer-events-none absolute inset-y-1 z-10 w-0.5 rounded-[2px] bg-accent before:absolute before:left-1/2 before:-top-0.5 before:size-[7px] before:-translate-x-1/2 before:rounded-full before:bg-accent before:shadow-[0_0_0_2px_var(--panel)] before:content-['']";

export function RunGrid() {
  const ctx = useApp();
  const run = ctx.runs.find((r) => r.id === ctx.sel.runId);
  if (!run) return null;
  const liveIds = new Set(ctx.cases.map((c) => c.id));
  const caseById = new Map(ctx.cases.map((c) => [c.id, c] as const));

  const update = (i: number, patch: Partial<RunRow>) => ctx.updateRunRow(run.id, i, patch);
  const setResult = (i: number, result: Result) => {
    const row = run.rows[i];
    const patch: Partial<RunRow> = { result, executed_at: result === 'not_run' ? '' : nowStamp() };
    if (result !== 'not_run' && !row.tester && ctx.lastTester) patch.tester = ctx.lastTester;
    update(i, patch);
  };
  const setTester = (i: number, value: string) => {
    update(i, { tester: value });
    if (value.trim()) ctx.setLastTester(value.trim());
  };

  const summary = buildRunSummary(run, ctx.cases);
  const { counts: t, executed, passRate } = summary;

  // ---- resizable detail panel (left-edge handle; width persists) ----
  const bodyRef = useRef<HTMLDivElement>(null); // the center+panel flex row, for live width bounds
  const [panelWidth, setPanelWidth] = useState(() => {
    const v = Number(localStorage.getItem(PANEL_KEY));
    return v >= PANEL_MIN && v <= PANEL_MAX ? v : PANEL_DEFAULT;
  });
  // Drag the left edge to resize; dragging left widens the panel (delta is inverted vs. the
  // sidebar since this panel is docked to the right). The upper bound is the live container width
  // minus a sliver of center (so the panel can never be dragged off-screen, even on a tiny
  // window); width is clamped and persisted on release.
  const startResize = (e: ReactPointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = panelWidth;
    let last = startW;
    const onMove = (ev: PointerEvent) => {
      const avail = bodyRef.current ? bodyRef.current.clientWidth - MIN_CENTER : PANEL_MAX;
      // Floor the upper bound so a tiny window (no window min-width anymore) can't drive it negative.
      const upper = Math.max(MIN_CENTER, Math.min(PANEL_MAX, avail));
      last = Math.min(upper, Math.max(PANEL_MIN, startW + startX - ev.clientX));
      setPanelWidth(last);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      localStorage.setItem(PANEL_KEY, String(last));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const resetWidth = () => {
    setPanelWidth(PANEL_DEFAULT);
    localStorage.setItem(PANEL_KEY, String(PANEL_DEFAULT));
  };

  // ---- drag-reorder of the case cards (in-card handle; vertical drop line) ----
  const [drag, setDrag] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const cardOver = (i: number) => (e: DragEvent) => {
    if (drag === null) return;
    e.preventDefault();
    // Grid cells flow left→right, so insert before/after based on the horizontal midpoint.
    const r = e.currentTarget.getBoundingClientRect();
    const before = e.clientX - r.left < r.width / 2;
    setDropIdx(before ? i : i + 1);
  };
  const endDrag = () => {
    setDrag(null);
    setDropIdx(null);
  };
  const doDrop = (e?: DragEvent) => {
    if (e) e.preventDefault();
    if (drag !== null && dropIdx !== null) {
      // Convert the gap index to a post-removal target index (splice semantics).
      const at = drag < dropIdx ? dropIdx - 1 : dropIdx;
      if (at !== drag) ctx.reorderRunRows(run.id, drag, at);
    }
    endDrag();
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex flex-none items-center gap-[14px] overflow-hidden border-b border-border bg-panel-2 px-[26px] py-[14px]">
        <Button icon variant="ghost" onClick={ctx.openRunsList} title="Back to runs">
          {I.back({ size: 16 })}
        </Button>
        <div>
          <div className="text-[16px] font-semibold">
            {run.name}{' '}
            <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.05em]', RUN_STATUS[run.status])}>
              {run.status}
            </span>
          </div>
          <div className="font-mono text-[11.5px] text-ink-faint">{run.file}</div>
        </div>
        <div className="ml-auto flex items-center gap-[14px]">
          <div
            // Drop the segmented bar on narrow windows so the action buttons never get clipped;
            // the pass-rate % beside it still conveys completion.
            className="hidden h-[30px] w-[220px] overflow-hidden rounded-md border border-border xl:flex"
            title={`${t.pass} pass · ${t.fail} fail · ${t.blocked} blocked · ${t.in_progress} in progress · ${t.skipped} skipped · ${t.not_run} not run`}
          >
            {SEGS.map((s) =>
              t[s] ? (
                <i
                  key={s}
                  className="flex h-full items-center justify-center font-mono text-[11px] font-bold transition-[flex-grow] duration-300"
                  // not_run is near-white, so its count needs dark ink rather than the white used on the saturated fills.
                  style={{ flexGrow: t[s], background: RES[s].color, color: s === 'not_run' ? 'var(--ink-2)' : 'oklch(1 0 0 / 0.92)' }}
                >
                  {t[s]}
                </i>
              ) : null,
            )}
          </div>
          <div className="text-right">
            <div
              className="text-[22px] font-bold leading-none tracking-[-0.01em]"
              style={{ color: passRate >= 80 ? 'var(--pass)' : passRate >= 50 ? 'var(--blocked)' : 'var(--fail)' }}
            >
              {passRate}%
            </div>
            <div className="text-[10.5px] uppercase tracking-[0.05em] text-ink-faint">pass rate</div>
          </div>
          <Button variant="ghost" onClick={() => ctx.exportRunToPdf(run.id)} title="Export this run as a PDF report">
            {I.download({ size: 13 })} Export PDF
          </Button>
          <Button variant="ghost" onClick={() => ctx.setModal('addCases')} title="Add more test cases to this run">
            {I.plus({ size: 13 })} Add cases
          </Button>
          <Button variant="ghost" onClick={() => ctx.duplicateRun(run.id)} title="Copy this run into a fresh one with results reset">
            {I.copy({ size: 13 })} Duplicate
          </Button>
          <Button variant="danger" onClick={() => ctx.deleteRun(run.id)} title="Delete this run and its results">
            {I.trash({ size: 13 })} Delete
          </Button>
          <Button variant="primary" onClick={() => ctx.startGuide(run.id, firstUnrun(run))}>
            {I.play({ size: 13 })} Start testing
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1" ref={bodyRef}>
        {/* Drop is handled once, on this whole scroll area (incl. its padding + the empty space
            around the cards) so a drop that lands in a gap is still accepted. Cards only set the
            drop index via onDragOver; the event bubbles up to this single onDrop. */}
        <div
          className="@container min-h-0 min-w-0 flex-1 overflow-auto px-[26px] py-[18px]"
          onDragOver={(e) => drag !== null && e.preventDefault()}
          onDrop={doDrop}
        >
          {/* Card grid with three container-query breakpoints (responds to the center area's own
              width, which changes as the detail panel is resized — not the window): 1 column when
              small (< 800px), 2 at medium (≥ 800px), 3 at large (≥ 1200px). */}
          <div className="grid grid-cols-1 items-stretch gap-3 @min-[800px]:grid-cols-2 @min-[1200px]:grid-cols-3">
            {run.rows.map((row, i) => (
              <div
                key={row.case_id + i}
                className={cn('group/card relative', drag === i && 'opacity-40')}
                onDragOver={cardOver(i)}
              >
                {drag !== null && dropIdx === i && <div className={cn(dropLine, '-left-[7px]')} />}
                {drag !== null && i === run.rows.length - 1 && dropIdx === run.rows.length && (
                  <div className={cn(dropLine, '-right-[7px]')} />
                )}
                <RunCaseCard
                  row={row}
                  kase={caseById.get(row.case_id)}
                  gone={!liveIds.has(row.case_id)}
                  lastTester={ctx.lastTester}
                  onResult={(result) => setResult(i, result)}
                  onNotes={(v) => update(i, { notes: v })}
                  onTester={(v) => setTester(i, v)}
                  onGuide={() => ctx.startGuide(run.id, i)}
                  onRemove={() => void ctx.removeRunRow(run.id, i)}
                  onDragStart={() => setDrag(i)}
                  onDragEnd={endDrag}
                />
              </div>
            ))}
            {run.rows.length === 0 && (
              <div className="col-span-full rounded-lg border border-dashed border-border-2 px-4 py-8 text-center text-[13px] text-ink-3">
                No cases in this run.
              </div>
            )}
          </div>
        </div>

        <aside
          // `width` is the preferred size, but the panel stays shrinkable (shrink + min-w-0) so a
          // narrow window collapses the center first and then trims the panel — it can never force
          // horizontal overflow that would push the panel off-screen or stretch the header.
          className="relative flex min-h-0 min-w-0 shrink grow-0 flex-col border-l border-border bg-panel-2"
          style={{ width: panelWidth }}
        >
          {/* left-edge resize handle (double-click resets) */}
          <div
            role="separator"
            aria-orientation="vertical"
            title="Drag to resize · double-click to reset"
            onPointerDown={startResize}
            onDoubleClick={resetWidth}
            className="absolute -left-0.5 top-0 z-20 h-full w-1.5 cursor-col-resize transition-colors hover:bg-accent/30 active:bg-accent/50"
          />
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-5 py-[18px]">
          <section className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">Run name</label>
            <Input
              className="text-[14px] font-semibold"
              value={run.name}
              placeholder="Untitled run"
              onChange={(e) => ctx.setRunName(run.id, e.target.value)}
            />
          </section>

          <section className="flex flex-col gap-1.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2" htmlFor="run-test-date">
              Test date
            </label>
            <input
              id="run-test-date"
              type="date"
              className="h-[34px] w-full rounded-md border border-border bg-panel px-2.5 font-mono text-[13px] text-ink focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:outline-none"
              value={run.testDate ?? run.created}
              onChange={(e) => ctx.setRunTestDate(run.id, e.target.value || run.created)}
            />
            <span className="text-[11px] text-ink-faint">
              The date <span className="font-mono text-ink-3">{'{{today}}'}</span> resolves to by default; cases can override it in the runner.
            </span>
          </section>

          <section className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">Summary</div>
              <span className="text-[10.5px] text-ink-faint">generated from results</span>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-panel p-[14px]">
              {summary.total === 0 ? (
                <div className="text-[13px] text-ink-3">No cases in this run.</div>
              ) : (
                <>
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-[20px] font-bold leading-none"
                      style={{ color: passRate >= 80 ? 'var(--pass)' : passRate >= 50 ? 'var(--blocked)' : 'var(--fail)' }}
                    >
                      {passRate}%
                    </span>
                    <span className="text-[13px] text-ink-3">
                      pass rate · {t.pass}/{executed} executed {executed === 1 ? 'case' : 'cases'} passed
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SEGS.filter((s) => t[s]).map((s) => (
                      <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-sunken px-2.5 py-1 text-[12px] text-ink-2">
                        <span className="size-[9px] rounded-[3px]" style={{ background: RES[s].color }} />
                        <b className="font-semibold text-ink">{t[s]}</b> {RES[s].label}
                      </span>
                    ))}
                  </div>
                  {summary.attention.length > 0 ? (
                    <div className="flex flex-col gap-2">
                      <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-2">
                        Needs attention ({summary.attention.length})
                      </div>
                      {summary.attention.map((e) => (
                        <AttentionRow key={e.case_id} entry={e} />
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[12.5px] text-pass">
                      {I.check({ size: 14 })} No failed or blocked cases.
                    </div>
                  )}
                  {summary.passed.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-2">
                        Passed ({summary.passed.length})
                      </div>
                      <ul className="flex flex-col gap-0.5">
                        {summary.passed.map((e) => (
                          <li key={e.case_id} className="flex items-center gap-2 text-[12.5px] text-ink-3">
                            <span className="text-pass">{I.check({ size: 12 })}</span>
                            <span className="font-mono text-[11px] text-ink-faint">{e.display_id}</span>
                            <span className="truncate text-ink-2">{e.title}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {summary.remaining.length > 0 && (
                    <div className="flex flex-col gap-1">
                      <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-ink-2">
                        Not completed ({summary.remaining.length})
                      </div>
                      <ul className="flex flex-col gap-0.5">
                        {summary.remaining.map((e) => (
                          <li key={e.case_id} className="flex items-center gap-2 text-[12.5px] text-ink-3">
                            <span className="size-[9px] shrink-0 rounded-[3px]" style={{ background: RES[e.result].color }} />
                            <span className="font-mono text-[11px] text-ink-faint">{e.display_id}</span>
                            <span className="truncate text-ink-2">{e.title}</span>
                            <span className="ml-auto font-mono text-[10.5px] text-ink-faint">{RES[e.result].label}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2">Approvals</div>
            <div className="flex flex-col gap-3">
              <ApprovalCard
                label="Tester"
                approval={run.testerApproval}
                defaultName={ctx.lastTester}
                onApprove={(name) => ctx.setRunApproval(run.id, 'tester', name)}
                onClear={() => ctx.setRunApproval(run.id, 'tester', '')}
              />
              <ApprovalCard
                label="Reviewer"
                approval={run.reviewerApproval}
                defaultName=""
                onApprove={(name) => ctx.setRunApproval(run.id, 'reviewer', name)}
                onClear={() => ctx.setRunApproval(run.id, 'reviewer', '')}
              />
            </div>
          </section>

          <section className="flex flex-col gap-2">
            <NotesField
              label="Notes"
              labelClassName="text-[11px] font-bold uppercase tracking-[0.06em] text-ink-2"
              idPrefix="run-notes"
              placeholder="General notes about this run."
              value={run.notes}
              onChange={(v) => ctx.setRunNotes(run.id, v)}
            />
          </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
