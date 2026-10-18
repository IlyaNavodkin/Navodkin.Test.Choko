import type { ResultState } from '../explore-design/types';
import { dateSchema, reportSchema } from './schema';
import type { ReportDocument, ReportSource } from './types';

export function weekPeriod(value: string): ReportDocument['period'] | null {
  if (!dateSchema.safeParse(value).success) return null;
  // Date-only arithmetic at UTC noon, never interpreting a local instant as a date.
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { start, end: date.toISOString().slice(0, 10) };
}
export function summarize(results: readonly ResultState[]): ReportDocument['summary'] {
  const counts = { not_run: 0, in_progress: 0, pass: 0, fail: 0, blocked: 0, skipped: 0 };
  for (const result of results) counts[result]++;
  return { counts, total: results.length, passRate: counts.pass + counts.fail ? counts.pass / (counts.pass + counts.fail) : null };
}
export function buildReport(source: ReportSource, date: string, includeNotes: boolean): ReportDocument | null {
  const period = source.kind === 'weekly' ? weekPeriod(date) : dateSchema.safeParse(date).success ? { start: date, end: date } : null;
  if (!period) return null;
  const runs = source.runs.filter((run) => source.kind === 'run' ? run.id === source.runId : run.date >= period.start && run.date <= period.end)
    .slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)).map((run) => {
      const cases = run.snapshots.map((item, index) => {
        const result = run.results[index];
        return { id: item.id, displayId: item.displayId, title: item.title, suite: item.folder, status: item.status, tags: [...item.tags], ...(item.systems !== undefined ? { systems: item.systems } : {}), ...(item.filename !== undefined ? { filename: item.filename } : {}), objective: item.objective, setup: item.setup, steps: [...item.steps], expected: item.expected,
          result: result?.result ?? 'not_run' as const, tester: result?.tester ?? '', checks: [...(result?.checks ?? [])],
          ...(includeNotes ? { notes: result?.notes ?? '', failNotes: [...(result?.failNotes ?? [])] } : {}) };
      });
      return { id: run.id, name: run.name, date: run.date, closed: run.closed, summary: run.summary, ...(includeNotes ? { notes: run.notes } : {}), cases, totals: summarize(cases.map((item) => item.result)) };
    });
  const allCases = runs.flatMap((run) => run.cases);
  const suites = [...new Set(allCases.map((item) => item.suite))].map((name) => ({ name, summary: summarize(allCases.filter((item) => item.suite === name).map((item) => item.result)) }));
  // Latest saved snapshot supplies labels; immutable case ID joins the matrix.
  const labels = new Map(allCases.map((item) => [item.id, item]));
  const matrix = source.kind === 'weekly' ? [...labels.values()].map((item) => ({ caseId: item.id, displayId: item.displayId, title: item.title, results: runs.map((run) => ({ runId: run.id, result: run.cases.find((candidate) => candidate.id === item.id)?.result ?? null })) })) : [];
  return reportSchema.parse({ schemaVersion: 1, origin: 'demo', kind: source.kind, generatedAt: source.generatedAt, repoName: source.repoName, period, options: { includeNotes }, runs, summary: summarize(allCases.map((item) => item.result)), suites, matrix });
}
export const buildReportDocument = buildReport;
