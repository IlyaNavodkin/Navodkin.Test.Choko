import type { ReportDocument } from './types';

export type ReportSummary = ReportDocument['summary'];
export type ReportResult = keyof ReportSummary['counts'];
// Print equivalents of ui/theme/tokens.css. Tests keep these values in sync.
export const reportResultColors = {
  pass: { token: '--app-success', pdf: '#85b294' },
  fail: { token: '--app-danger', pdf: '#c96f5f' },
  blocked: { token: '--app-warning', pdf: '#d9a55b' },
  in_progress: { token: '--app-accent-bg', pdf: '#5e7b96' },
  skipped: { token: '--app-fg3', pdf: '#b0b1af' },
  not_run: { token: '--app-fg5', pdf: '#6f706e' },
} as const satisfies Record<ReportResult, { token: string; pdf: string }>;
export const distributionOrder: ReportResult[] = ['pass', 'fail', 'blocked', 'in_progress', 'skipped', 'not_run'];
export function distributionSegments(summary: ReportSummary) {
  let offset = 0;
  return distributionOrder.filter((state) => summary.counts[state] > 0).map((state) => {
    const fraction = summary.total === 0 ? 0 : summary.counts[state] / summary.total;
    const segment = { state, count: summary.counts[state], fraction, offset };
    offset += fraction;
    return segment;
  });
}
