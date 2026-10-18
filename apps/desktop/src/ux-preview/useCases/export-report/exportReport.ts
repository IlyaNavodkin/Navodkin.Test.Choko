import { buildPdfDefinition } from './pdfDefinition';
import { reportSchema } from './schema';
import type { ExportFormat, ReportDocument } from './types';

export function reportFilename(report: ReportDocument, format: ExportFormat): string {
  const label = report.kind === 'run' ? report.runs[0]?.name ?? 'run' : 'weekly';
  const safe = `${report.repoName}-${label}`.normalize('NFC').replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]/gu, '-').replace(/[. ]+$/g, '').slice(0, 100).replace(/[. ]+$/g, '') || 'report';
  return `testoritto-${safe}-${report.period.start}.${format}`;
}
export async function createReportBlob(report: ReportDocument, format: ExportFormat): Promise<Blob> {
  const validated = reportSchema.parse(report);
  if (!validated.runs.length) throw new Error('Empty report');
  if (format === 'json') return new Blob([JSON.stringify(validated, null, 2)], { type: 'application/json;charset=utf-8' });
  return generatePdfBlob(validated);
}
export async function generatePdfBlob(report: ReportDocument): Promise<Blob> {
  const validated = reportSchema.parse(report);
  if (!validated.runs.length) throw new Error('Empty report');
  // These imports (including fonts) are reached only after an explicit PDF action.
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  pdfMake.addVirtualFileSystem(fonts);
  return pdfMake.createPdf(buildPdfDefinition(validated)).getBlob();
}
export function downloadReportBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
    document.body.append(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } finally { setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}
