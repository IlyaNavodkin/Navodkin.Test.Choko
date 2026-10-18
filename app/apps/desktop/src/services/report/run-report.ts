/**
 * NW.js side of the PDF report: render the report HTML to a temp file and open it in a
 * visible preview window. The preview's own "Save PDF" button (wired by the HTML builder)
 * runs the save dialog + print-to-PDF in-window, so the user can review before saving.
 *
 * Kept apart from the store (data is passed in) and from the pure HTML builder so each
 * layer stays independently testable.
 */
import { node } from '@/lib/node';
import { isNwjs, openWindow } from '@/lib/nwjs';
import { buildRunReportHtml, type RunReportModel } from './run-report-html';

export type PreviewReason = 'not-nwjs' | 'error';
export interface PreviewResult {
  ok: boolean;
  reason?: PreviewReason;
  /** Human-readable detail when `reason === 'error'`, for logging/diagnostics. */
  error?: string;
}

/**
 * Open a fully built report HTML document in a preview window the user can save from.
 * Returns a discriminated result rather than throwing so the caller can distinguish a
 * missing runtime from a real failure. The temp HTML is cleaned up when the preview closes.
 */
export async function previewReportHtml(html: string, windowTitle: string): Promise<PreviewResult> {
  if (!isNwjs()) {
    console.warn('[pdf] previewReportHtml: not running under NW.js — preview unavailable');
    return { ok: false, reason: 'not-nwjs' };
  }

  try {
    const fsp = node.fsp();
    const url = node.url();
    const tmp = node.path().join(node.os().tmpdir(), `casewright-report-${Date.now()}.html`);
    console.debug('[pdf] previewReportHtml: writing temp HTML', { tmp, bytes: html.length });
    await fsp.writeFile(tmp, html, 'utf8');

    // file:// URLs via Node so Windows path separators / drive letters / spaces are encoded.
    const win = await openWindow(url.pathToFileURL(tmp).href, {
      width: 900,
      height: 1024,
      position: 'center',
      title: windowTitle,
    });
    if (!win) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      console.error('[pdf] previewReportHtml: preview window did not open');
      return { ok: false, reason: 'error', error: 'Preview window did not open' };
    }

    // Drop the temp HTML once the user closes the preview — it has already been loaded.
    win.on('closed', () => {
      void fsp.rm(tmp, { force: true }).catch((e) => {
        console.warn('[pdf] previewReportHtml: temp cleanup failed', { tmp, error: e });
      });
    });
    console.debug('[pdf] previewReportHtml: preview opened', { tmp });
    return { ok: true };
  } catch (e) {
    console.error('[pdf] previewReportHtml: failed', e);
    return { ok: false, reason: 'error', error: e instanceof Error ? e.message : String(e) };
  }
}

/** Render a single run's report and open it in the Save-PDF preview window. */
export function previewRunReport(model: RunReportModel): Promise<PreviewResult> {
  return previewReportHtml(buildRunReportHtml(model, { preview: true }), `${model.runName || 'Run'} — Report preview`);
}
