import { useMemo, useRef, useState } from 'react';
import { buildReport } from './buildReport';
import { createReportBlob, downloadReportBlob, reportFilename } from './exportReport';
import { rt } from './messages';
import type { ExportFormat, ReportSource } from './types';
export type UseReportPreviewArgs = { source: ReportSource };
export type UseReportPreviewResult = ReturnType<typeof useReportPreview>;
export function useReportPreview({ source }: UseReportPreviewArgs) {
  const [date, setDate] = useState(() => source.runs.find((run) => run.id === source.runId)?.date ?? source.runs[0]?.date ?? '');
  const [includeNotes, setIncludeNotes] = useState(false);
  const [status, setStatus] = useState<'idle' | 'preparing' | 'handed' | 'failed'>('idle');
  const working = useRef(false);
  const report = useMemo(() => buildReport(source, date, includeNotes), [source, date, includeNotes]);
  async function exportFile(format: ExportFormat): Promise<void> {
    if (working.current || !report?.runs.length) return;
    working.current = true; setStatus('preparing');
    try { const blob = await createReportBlob(report, format); downloadReportBlob(blob, reportFilename(report, format)); setStatus('handed'); }
    catch { setStatus('failed'); }
    finally { working.current = false; }
  }
  return { date, includeNotes, report, status, busy: status === 'preparing', notice: status === 'idle' ? '' : rt(status === 'preparing' ? 'preparing' : status === 'failed' ? 'failed' : 'handed'),
    setDate: (value: string) => { if (!working.current) { setDate(value); setStatus('idle'); } },
    setIncludeNotes: (value: boolean) => { if (!working.current) { setIncludeNotes(value); setStatus('idle'); } }, exportFile };
}
