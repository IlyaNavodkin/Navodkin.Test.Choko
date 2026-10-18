import type { Content, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces';
import { t } from '../explore-design/messages';
import { rt } from './messages';
import type { ReportDocument } from './types';
import { distributionOrder, distributionSegments, reportResultColors, type ReportResult, type ReportSummary } from './distributionModel';

// Text stays unchanged; pdfmake's wordBreak handles long URLs/IDs at layout time.
const text = (value: string): Content => ({ text: value });
function table(headers: string[], rows: (string | ContentText)[][], widths: ('*' | number)[]): Content {
  const cells = (values: (string | ContentText)[]): ContentText[] => values.map((value) => ({ ...(typeof value === 'string' ? { text: value } : value), margin: [3, 4, 3, 4] }));
  return { table: { headerRows: 1, widths, body: [cells(headers).map((cell) => ({ ...cell, bold: true, fillColor: '#eeeeee' })), ...rows.map(cells)] }, layout: 'lightHorizontalLines', margin: [0, 6, 0, 14] };
}
export const formatRate = (rate: number | null): string => rate === null ? '—' : `${Math.round(rate * 100)}%`;
const pdfResult = (state: ReportResult): ContentText => ({ text: [{ text: '● ', color: reportResultColors[state].pdf }, { text: t(state), color: '#171717' }] });
// A4 content width (595.28 - 2 * 36). No labels inside tiny segments.
export function pdfDistribution(summary: ReportSummary, compact = false): Content {
  const width = 523.28;
  const height = compact ? 8 : 20;
  return { unbreakable: true, stack: [
    { canvas: [{ type: 'rect', x: 0, y: 0, w: width, h: height, color: '#eeeeee' }, ...distributionSegments(summary).map(({ state, fraction, offset }) => ({ type: 'rect' as const, x: offset * width, y: 0, w: fraction * width, h: height, color: reportResultColors[state].pdf }))], margin: [0, 6, 0, 8] },
    ...(summary.total === 0 ? [text(rt('noResults'))] : []),
    { columns: [distributionOrder.slice(0, 3), distributionOrder.slice(3)].map((states) => ({ width: '*', stack: states.map((state) => ({ text: [{ text: '● ', color: reportResultColors[state].pdf }, { text: `${t(state)}: ${summary.counts[state]}`, color: '#171717' }], margin: [0, 1, 0, 1] })) })), columnGap: 16, margin: [0, 0, 0, 8] },
  ] };
}
export function buildPdfDefinition(report: ReportDocument): TDocumentDefinitions {
  const content: Content[] = [
    { text: rt(report.kind), style: 'title' }, text(report.repoName), text(`${report.period.start} — ${report.period.end}`),
    text(`${rt('generated')}: ${report.generatedAt}`), { text: rt('summary'), style: 'heading' },
    pdfDistribution(report.summary),
    text(`${rt('total')}: ${report.summary.total} · ${rt('passRate')}: ${formatRate(report.summary.passRate)}`),
    { text: rt('suites'), style: 'heading' },
  ];
  for (const suite of report.suites) content.push({ text: suite.name, bold: true, margin: [0, 8, 0, 2] }, text(`${rt('total')}: ${suite.summary.total} · ${rt('passRate')}: ${formatRate(suite.summary.passRate)}`), pdfDistribution(suite.summary, true));
  if (report.kind === 'weekly') {
    // At most five run columns; repeat case labels and header row on every page.
    for (let start = 0; start < report.runs.length; start += 5) {
      const columns = report.runs.slice(start, start + 5);
      content.push({ text: `${rt('matrix')} · ${start + 1}–${start + columns.length}`, style: 'heading' }, table(
        [rt('case'), ...columns.map((run) => `${run.name}\n${run.date}`)],
        report.matrix.map((row) => [`${row.displayId}\n${row.title}`, ...columns.map((run) => { const result = row.results.find((cell) => cell.runId === run.id)?.result; return result ? pdfResult(result) : '—'; })]),
        [150, ...columns.map(() => '*' as const)],
      ));
    }
  }
  for (const run of report.runs) {
    content.push({ text: run.name, style: 'heading' }, text(`${run.date} · ${rt(run.closed ? 'closed' : 'opened')} · ${run.id}`), text(run.summary));
    if (report.kind === 'weekly') content.push(text(`${rt('total')}: ${run.totals.total} · ${rt('passRate')}: ${formatRate(run.totals.passRate)}`), pdfDistribution(run.totals, true));
    if (run.notes !== undefined) content.push(text(`${rt('runNotes')}: ${run.notes}`));
    content.push(table([rt('case'), rt('result'), rt('tester')], run.cases.map((item) => [`${item.displayId} · ${item.title}\n${item.suite}`, pdfResult(item.result), item.tester || '—']), ['*', 95, 105]));
    for (const item of run.cases) {
      content.push({ text: `${item.displayId} · ${item.title}`, style: 'heading' }, text(`${rt('snapshot')}: ${item.id}`), text(`${rt('objective')}: ${item.objective}`), text(`${rt('setup')}: ${item.setup}`));
      if (item.systems !== undefined) content.push(text(`${rt('systems')}: ${item.systems}`));
      item.steps.forEach((step, index) => content.push(text(`${index + 1}. ${step} [${rt(item.checks[index] ?? 'none')}]`)));
      content.push(text(`${rt('expected')}: ${item.expected}`));
      if (item.notes !== undefined) content.push(text(`${rt('runNotes')}: ${item.notes}`));
      if (item.failNotes !== undefined) item.failNotes.forEach((note, index) => { if (note) content.push(text(`${rt('failNotes')} ${index + 1}: ${note}`)); });
    }
  }
  return { pageSize: 'A4', pageMargins: [36, 42, 36, 42], defaultStyle: { font: 'Roboto', fontSize: 9, lineHeight: 1.2, wordBreak: 'break-all' },
    styles: { title: { fontSize: 22, bold: true, margin: [0, 0, 0, 12] }, heading: { fontSize: 12, bold: true, margin: [0, 16, 0, 6] } },
    info: { title: `${rt(report.kind)} · ${report.repoName}`, creator: 'Testoritto' }, content,
    footer: (page, pages) => ({ text: `Testoritto${report.origin === 'demo' ? ` · ${rt('demoSource')}` : ''} · ${report.period.start} · ${page} / ${pages}`, alignment: 'center', fontSize: 8, margin: [20, 14, 20, 0] }),
  };
}
