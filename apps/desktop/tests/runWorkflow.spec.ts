import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { filterRunRows, nextPendingCase, summarizeRun, type RunCatalogEntry, type RunRow } from '../src/repository/useCases/execute-run/runWorkflow';
import { useRunNavigation } from '../src/repository/useCases/execute-run/useRunNavigation';
const row = (resourceId: string, result: RunRow['result']): RunRow => ({ resourceId, result, caseId: resourceId, displayId: `QA-${resourceId}`, title: `Case ${resourceId}`, path: `${resourceId}.md` });
const rows = [row('1', 'pass'), row('2', 'in_progress'), row('3', 'not_run'), row('4', 'fail'), row('5', 'blocked'), row('6', 'skipped')];
const run: RunCatalogEntry = { runId: 'run', name: 'Run', status: 'open', created: '', scope: '', testDate: '', detailsResourceId: 'details', cases: rows };
describe('run workflow', () => {
  it('counts terminal results and preserves catalog ordering while filtering', () => {
    expect(summarizeRun(rows)).toMatchObject({ total: 6, completed: 4, counts: { pass: 1, fail: 1, blocked: 1, skipped: 1, not_run: 1, in_progress: 1 } });
    expect(summarizeRun([])).toMatchObject({ total: 0, completed: 0 });
    expect(filterRunRows(rows, 'Ｃａｓｅ', 'all')).toEqual(rows);
    expect(filterRunRows(rows, 'qa-3', 'not_run')).toEqual([rows[2]]);
    expect(filterRunRows(rows, 'qa-3', 'pass')).toEqual([]);
  });
  it('resumes unfinished cases, wraps around and excludes the current case', () => {
    expect(nextPendingCase(rows)?.resourceId).toBe('2');
    expect(nextPendingCase(rows, '2')?.resourceId).toBe('3');
    expect(nextPendingCase(rows, '3')?.resourceId).toBe('2');
    expect(nextPendingCase([row('1', 'in_progress')], '1')).toBeUndefined();
    expect(nextPendingCase([])).toBeUndefined();
  });
  it('waits for the successful save to clear dirty state before advancing', async () => {
    const select = vi.fn();
    const { result, rerender } = renderHook(({ blocked }) => useRunNavigation({ sessionId: 'session', run, selection: { kind: 'run-case', resourceId: '2' }, blocked, select }), { initialProps: { blocked: false } });
    act(() => result.current.begin('2')); select.mockClear();
    rerender({ blocked: true });
    act(() => { result.current.move(1); result.current.exit(); result.current.saved(); });
    expect(select).not.toHaveBeenCalled();
    rerender({ blocked: false });
    await waitFor(() => expect(select).toHaveBeenCalledWith({ kind: 'run-case', resourceId: '3' }));
  });
  it('does not apply a late save transition to another repository session', async () => {
    const select = vi.fn();
    const { result, rerender } = renderHook(({ sessionId, blocked }) => useRunNavigation({ sessionId, run, selection: { kind: 'run-case', resourceId: '2' }, blocked, select }), { initialProps: { sessionId: 'first', blocked: true } });
    act(() => result.current.saved());
    rerender({ sessionId: 'second', blocked: false });
    await waitFor(() => expect(result.current.isGuide).toBe(false));
    expect(select).not.toHaveBeenCalled();
  });
});
