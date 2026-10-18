import type { RunsCatalog } from '../../api/contracts';
export type RunCatalogEntry = RunsCatalog['runs'][number];
export type RunRow = RunCatalogEntry['cases'][number];
export const runResults = ['not_run', 'in_progress', 'pass', 'fail', 'blocked', 'skipped'] as const;
export function isPendingResult(result: RunRow['result']): boolean { return result === 'not_run' || result === 'in_progress'; }
export function summarizeRun(rows: RunRow[]) {
  const counts: Record<RunRow['result'], number> = { not_run: 0, in_progress: 0, pass: 0, fail: 0, blocked: 0, skipped: 0 };
  for (const row of rows) counts[row.result] += 1;
  return { counts, total: rows.length, completed: rows.length - counts.not_run - counts.in_progress };
}
export function nextPendingCase(rows: RunRow[], currentId?: string): RunRow | undefined {
  const index = currentId ? rows.findIndex((row) => row.resourceId === currentId) : -1;
  return [...rows.slice(index + 1), ...rows.slice(0, Math.max(0, index))].find((row) => isPendingResult(row.result));
}
export function filterRunRows(rows: RunRow[], search: string, result: 'all' | RunRow['result']): RunRow[] {
  const normalized = search.normalize('NFKC').trim().toLocaleLowerCase();
  return rows.filter((row) => (result === 'all' || row.result === result) && `${row.displayId} ${row.title}`.normalize('NFKC').toLocaleLowerCase().includes(normalized));
}
