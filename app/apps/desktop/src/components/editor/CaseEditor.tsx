import { useEffect, useRef, useState } from 'react';
import { I } from '@/components/icons';
import { Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { caseFileName, caseStem } from '@/services/format/filename';
import { slug } from '@/utils/ids';
import { editorKeyDown, renderInlineResolved, renderMarkdownResolved } from '@/utils/markdown';
import { numberSteps } from '@/utils/steps';
import { findVariableLint } from '@/utils/variables';
import { useApp, useAppStore } from '@/store/app-store';
import type { Case, Status } from '@/types';
import { ListControl } from './ListControl';
import { ObjectiveEditor } from './ObjectiveEditor';
import { SetupControl } from './SetupControl';
import { StepsControl } from './StepsControl';
import { TagEditor } from './TagEditor';

const STATUS_TEXT: Record<Status, string> = {
  active: 'text-pass',
  draft: 'text-blocked',
  deprecated: 'text-ink-3 line-through',
};

export function CaseEditor() {
  const ctx = useApp();
  const [previewVars, setPreviewVars] = useState(false);
  const [previewDate, setPreviewDate] = useState(() => new Date().toISOString().slice(0, 10));
  // Filename editing is an explicit Edit→Done toggle (not live), so a rename only happens
  // once on commit rather than on every keystroke.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) → document-level undo/redo of case edits. A window listener
  // so it works wherever focus is in the editor; native per-input undo is bypassed (our programmatic
  // formatting edits don't feed the browser's history anyway, and undo also navigates between fields).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useAppStore.getState().modal) return; // a modal owns its own text + native undo
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== 'z' && k !== 'y') return;
      // if focus is in an editable element outside this editor, let its native undo win
      const ae = document.activeElement;
      const editable =
        ae instanceof HTMLElement && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
      if (editable && rootRef.current && !rootRef.current.contains(ae)) return;
      e.preventDefault();
      if (k === 'y' || e.shiftKey) ctx.redo();
      else ctx.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctx.undo, ctx.redo]);

  // After an undo/redo lands on a case + field, scroll that section into view and focus it.
  useEffect(() => {
    const focus = ctx.editorFocus;
    const root = rootRef.current;
    if (!focus || !root) return;
    const section = root.querySelector(`[data-edit-field="${focus.field}"]`);
    if (!(section instanceof HTMLElement)) return;
    section.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const target = section.matches('input, textarea, select')
      ? section
      : section.querySelector('input, textarea, select');
    if (target instanceof HTMLElement) target.focus();
  }, [ctx.editorFocus]);

  const c = ctx.cases.find((x) => x.id === ctx.sel.id);
  if (!c) return null;
  const patch = (p: Partial<Case>) => ctx.updateCase(c.id, p);
  const path = ctx.casePath(c);
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';

  // --- filename (slug) override editing ---
  const draftStem = caseStem(nameDraft) || slug(c.title) || 'untitled';
  // Resolve each sibling case's on-disk stem the same way the writer does, to catch a
  // collision *before* it silently overwrites another file (the bug this feature fixes).
  const siblingStems = new Set(
    ctx.cases
      .filter((x) => x.id !== c.id && x.suite === c.suite)
      .map((x) => caseFileName(x).replace(/\.md$/, '')),
  );
  const nameClash = siblingStems.has(draftStem);

  const startEditName = () => {
    setNameDraft(caseFileName(c).replace(/\.md$/, ''));
    setEditingName(true);
  };
  const commitName = () => {
    if (nameClash) return; // block the overwrite; leave the editor open so the user can fix it
    // Store the override only when it diverges from the title's auto-slug; otherwise clear it
    // so the filename tracks the title again.
    patch({ slug: draftStem && draftStem !== slug(c.title) ? draftStem : undefined });
    setEditingName(false);
  };

  // a displayId is read-only unless it collides with another case in the workspace
  const clashes = ctx.cases.filter(
    (x) => x.id !== c.id && x.displayId.trim().toLowerCase() === c.displayId.trim().toLowerCase(),
  );
  const idConflict = clashes.length > 0;
  const nextFreeId = () => {
    const prefix = c.displayId.split('-')[0] || ctx.workspace?.prefix || 'CW';
    const used = new Set(ctx.cases.map((x) => x.displayId));
    const pad = (s: number) => `${prefix}-${String(s).padStart(4, '0')}`;
    let n = 1;
    while (used.has(pad(n))) n++;
    return pad(n);
  };

  const stepNums = numberSteps(c.steps);
  const lintTokens = findVariableLint(
    [c.objective, ...c.systems, ...c.setup.flatMap((s) => [s.name, s.body]), ...c.steps.map((s) => s.text), ...c.expected].join('\n'),
  )
    .map((w) => w.message.match(/"([^"]+)"/)?.[1] ?? '')
    .filter(Boolean);

  return (
    <div ref={rootRef} className="flex min-h-0 flex-1 flex-col bg-panel">
      <div className="flex flex-none items-center gap-2.5 border-b border-border bg-panel-2 px-[26px] py-[7px]">
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint">Variables</span>
        <Button
          variant="ghost"
          size="sm"
          className={cn(previewVars && 'text-accent-ink')}
          onClick={() => setPreviewVars((p) => !p)}
          title="Preview how the {{today}} variable resolves against a date"
        >
          {I.eye({ size: 14 })} {previewVars ? 'Hide resolved' : 'Resolve variables'}
        </Button>
        {previewVars && (
          <input
            type="date"
            className="h-[26px] rounded-md border border-border bg-panel px-2 font-mono text-[12px] text-ink focus:border-accent focus:outline-none"
            value={previewDate}
            onChange={(e) => setPreviewDate(e.target.value || previewDate)}
          />
        )}
        {lintTokens.length > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-[oklch(0.55_0.1_66)]">
            {I.warn({ size: 13 })} {lintTokens.length} unrecognized variable{lintTokens.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="flex-none border-b border-border px-[26px] pt-[14px]">
        <div className="flex items-center gap-2.5">
          <input
            className="-mx-[7px] -my-[3px] min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-[7px] py-[3px] text-[21px] font-semibold tracking-[-0.01em] text-ink hover:bg-raise focus:border-accent focus:bg-panel focus:shadow-[0_0_0_3px_var(--accent-soft)] focus:outline-none"
            value={c.title}
            onChange={(e) => patch({ title: e.target.value })}
            onKeyDown={editorKeyDown}
            placeholder="Untitled case"
            data-edit-field="title"
          />
          <Button size="sm" variant="ghost" title="Duplicate" onClick={() => ctx.duplicateCase(c.id)}>
            {I.copy({ size: 14 })} Duplicate
          </Button>
          <Button size="sm" variant="ghost" className="text-fail hover:bg-fail-soft hover:text-fail" title="Delete" onClick={() => ctx.deleteCase(c.id)}>
            {I.trash({ size: 14 })}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 pb-[13px] pt-2.5">
          <div className="inline-flex items-center gap-1.5 font-mono text-[12px]">
            <span className="text-ink-faint">ID</span>
            {idConflict ? (
              <input
                className="h-6 w-[110px] rounded-md border border-blocked bg-blocked-soft px-[7px] py-[3px] font-mono text-[12px] font-semibold text-[oklch(0.46_0.12_66)] shadow-[0_0_0_3px_var(--blocked-soft)] focus:shadow-[0_0_0_3px_oklch(0.85_0.08_80)] focus:outline-none"
                value={c.displayId}
                autoFocus
                title="This ID conflicts — edit to resolve"
                onChange={(e) => patch({ displayId: e.target.value })}
                data-edit-field="displayId"
              />
            ) : (
              <span
                className="inline-flex items-center gap-[5px] rounded-sm border border-border bg-sunken px-1.5 py-px text-ink-3"
                title="Human-facing ID · stable · editable only when it conflicts"
              >
                {c.displayId}
                <button
                  className="grid size-[18px] place-items-center rounded-sm hover:bg-raise"
                  onClick={() => ctx.toast('Copied ' + c.displayId)}
                >
                  {I.copy({ size: 12 })}
                </button>
              </span>
            )}
          </div>
          <div className="inline-flex items-center gap-1.5 font-mono text-[12px]">
            <span className="text-ink-faint">Status</span>
            <select
              className={cn(
                'h-[26px] rounded-md border border-border bg-panel px-2 py-0.5 text-[12px] font-semibold',
                STATUS_TEXT[c.status],
              )}
              value={c.status}
              onChange={(e) => patch({ status: e.target.value as Status })}
              data-edit-field="status"
            >
              {/* color each option so the open menu shows each status in its own color,
                  rather than inheriting the select's current-status color */}
              <option value="draft" className="text-blocked">
                Draft
              </option>
              <option value="active" className="text-pass">
                Active
              </option>
              <option value="deprecated" className="text-ink-3">
                Deprecated
              </option>
            </select>
          </div>
          <span className="mx-0.5 my-1.5 w-px self-stretch bg-border" />
          <div className="inline-flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[12px]" data-edit-field="tags">
            <span className="text-ink-faint">Tags</span>
            <TagEditor tags={c.tags} onChange={(t) => patch({ tags: t })} />
          </div>
        </div>
        {idConflict && (
          <div className="mb-[13px] flex items-center gap-[9px] rounded-md border border-[oklch(0.85_0.07_80)] bg-blocked-soft px-3 py-2 text-[12.5px] text-[oklch(0.5_0.12_66)]">
            <span className="shrink-0">{I.warn({ size: 15 })}</span>
            <span>
              Display ID <b className="font-mono">{c.displayId}</b> is already used by{' '}
              {clashes.length === 1 ? 'another case' : clashes.length + ' other cases'} (
              {clashes.map((x) => x.title).join(', ')}). IDs must be unique — rename this one or pick the next free
              number.
            </span>
            <Button size="sm" className="ml-auto shrink-0 font-mono" onClick={() => patch({ displayId: nextFreeId() })}>
              Use {nextFreeId()}
            </Button>
          </div>
        )}
      </div>

      {lintTokens.length > 0 && (
        <div className="flex-none border-b border-[oklch(0.85_0.07_80)] bg-blocked-soft px-[26px] py-2">
          <div className="flex items-start gap-2 text-[12.5px] text-[oklch(0.5_0.12_66)]">
            <span className="mt-px shrink-0">{I.warn({ size: 15 })}</span>
            <div>
              <span className="font-semibold">
                {lintTokens.length} unrecognized variable{lintTokens.length > 1 ? 's' : ''}
              </span>{' '}
              — left literal at run time. Supported: <span className="font-mono">{'{{today}}'}</span>,{' '}
              <span className="font-mono">{'{{today+7}}'}</span>, <span className="font-mono">{'{{today-1m}}'}</span>.{' '}
              <span className="font-mono text-[11.5px] text-ink-3">{lintTokens.join('  ·  ')}</span>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-[26px] px-[26px] pb-20 pt-[26px]">
          {previewVars && (
            <section className="flex flex-col gap-3 rounded-lg border border-dashed border-accent-line bg-accent-soft px-4 py-3.5">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-faint">
                {I.eye({ size: 13 })} Resolved preview · <span className="font-mono">{'{{today}}'}</span> ={' '}
                <span className="font-mono text-accent-ink">{previewDate}</span>
              </div>
              {c.objective.trim() && (
                <div className="font-read text-[14.5px] leading-[1.6] text-ink-2">
                  {renderMarkdownResolved(c.objective, previewDate, 'pvo')}
                </div>
              )}
              {c.systems.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {c.systems.map((s, i) => (
                    <span key={i} className="rounded-full border border-border bg-panel px-[10px] py-[2px] text-[12px] text-ink-2">
                      {renderInlineResolved(s, previewDate, `pvs${i}`)}
                    </span>
                  ))}
                </div>
              )}
              {c.setup.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {c.setup.map((s, i) => (
                    <div key={i} className="text-[13px] text-ink-2">
                      <span className="font-semibold">{renderInlineResolved(s.name, previewDate, `pvn${i}`)}</span>
                      {s.body.trim() && (
                        <div className="mt-0.5 text-ink-3">{renderMarkdownResolved(s.body, previewDate, `pvb${i}`)}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {c.steps.length > 0 && (
                <ol className="flex flex-col gap-1">
                  {c.steps.map((s, i) => (
                    <li key={i} className="flex gap-2 text-[13px] text-ink-2" style={{ marginLeft: s.depth * 18 }}>
                      <span className="shrink-0 font-mono text-ink-faint">{stepNums[i]}.</span>
                      <span>{renderInlineResolved(s.text, previewDate, `pvt${i}`)}</span>
                    </li>
                  ))}
                </ol>
              )}
              {c.expected.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {c.expected.map((e, i) => (
                    <li key={i} className="flex gap-2 text-[13px] text-ink-2">
                      <span className="shrink-0 text-ink-faint">–</span>
                      <span>{renderInlineResolved(e, previewDate, `pve${i}`)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <div data-edit-field="objective">
            <ObjectiveEditor value={c.objective} onChange={(v) => patch({ objective: v })} />
          </div>
          <hr className="m-0 h-px border-0 bg-border" />
          <div data-edit-field="systems">
            <ListControl
              icon={I.layers({ size: 15 })}
              title="Systems in Scope"
              mark="## Systems in Scope"
              marker="–"
              items={c.systems}
              onChange={(v) => patch({ systems: v })}
              placeholder="System or component…"
            />
          </div>
          <hr className="m-0 h-px border-0 bg-border" />
          <div data-edit-field="setup">
            <SetupControl items={c.setup} onChange={(v) => patch({ setup: v })} />
          </div>
          <hr className="m-0 h-px border-0 bg-border" />
          <div data-edit-field="steps">
            <StepsControl steps={c.steps} onChange={(v) => patch({ steps: v })} />
          </div>
          <hr className="m-0 h-px border-0 bg-border" />
          <div data-edit-field="expected">
            <ListControl
              icon={I.check({ size: 15 })}
              title="Acceptance Criteria"
              mark="## Acceptance Criteria"
              marker="–"
              items={c.expected}
              onChange={(v) => patch({ expected: v })}
              placeholder="Expected outcome…"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-none items-center gap-2.5 border-t border-border bg-panel-2 px-[26px] py-[7px] font-mono text-[11.5px] text-ink-faint">
        <span className="grid place-items-center text-ink-3">{I.file({ size: 13 })}</span>
        {editingName ? (
          <>
            {dir && <span className="shrink-0 text-ink-3">{dir}</span>}
            <input
              autoFocus
              className={cn(
                'min-w-0 max-w-[420px] flex-1 rounded border bg-panel px-1.5 py-0.5 font-mono text-[11.5px] text-ink focus:outline-none',
                nameClash ? 'border-fail focus:border-fail' : 'border-border focus:border-accent',
              )}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                else if (e.key === 'Escape') setEditingName(false);
              }}
              spellCheck={false}
              title="Filename stem — saved on Done. Spaces and other characters become hyphens."
            />
            <span className="shrink-0 text-ink-3">.md</span>
            {nameClash && <span className="shrink-0 text-fail">name already in use</span>}
            <button
              className="shrink-0 text-accent-ink hover:underline disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
              onClick={commitName}
              disabled={nameClash}
            >
              Done
            </button>
            <button className="shrink-0 text-ink-3 hover:underline" onClick={() => setEditingName(false)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="truncate">{path}</span>
            <button className="shrink-0 text-accent-ink hover:underline" onClick={startEditName} title="Rename the file">
              Edit
            </button>
          </>
        )}
        <span className={cn('ml-auto inline-flex shrink-0 items-center gap-[5px]', c.modified ? 'text-blocked' : 'text-pass')}>
          {c.modified ? (
            <>
              {I.dot({ size: 9 })} uncommitted changes
            </>
          ) : (
            <>
              {I.check({ size: 13 })} committed
            </>
          )}
        </span>
      </div>
    </div>
  );
}
