/**
 * Shared plumbing for the PDF report builders (run report + weekly report): escaping and
 * date formatting, the result color/label metadata, the segmented distribution bar, the
 * base document stylesheet, and the preview chrome (Save-PDF toolbar + its inline script).
 *
 * Like the builders themselves, this stays free of React, NW.js, and Node so it's directly
 * unit-testable and renders identically in the print window. The CSS defines its OWN
 * `:root` custom properties (the app's `var(--…)` tokens don't exist in the print window),
 * inlining the literal oklch values from `@casewright/brand`.
 */
import type { Result } from '@/types';

export const RESULT_META: Record<Result, { label: string; color: string }> = {
  pass: { label: 'Pass', color: 'var(--pass)' },
  fail: { label: 'Fail', color: 'var(--fail)' },
  blocked: { label: 'Blocked', color: 'var(--blocked)' },
  in_progress: { label: 'In progress', color: 'var(--inprogress)' },
  skipped: { label: 'Skipped', color: 'var(--skipped)' },
  not_run: { label: 'Not run', color: 'var(--notrun)' },
};

export const SEG_ORDER: Result[] = ['pass', 'fail', 'blocked', 'in_progress', 'skipped', 'not_run'];

/** HTML-escape a free-text value — run/case data can contain `<`, `&`, quotes. */
export function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const pct = (n: number, of: number): number => (of ? Math.round((n / of) * 100) : 0);

/** Format an ISO `YYYY-MM-DD` as a readable date, e.g. `Jun 1, 2026`. Parts are read
 *  explicitly (not `new Date(iso)`) to avoid UTC-vs-local day shifts. Unparseable → raw. */
export function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
  if (!m) return iso ?? '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Format a `YYYY-MM-DD HH:MM` stamp as `Jun 12, 2026, 2:27 PM` (date-only when no time). */
export function fmtStamp(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(s ?? '');
  if (!m) return s ?? '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? '0'), Number(m[5] ?? '0'));
  const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  if (m[4] === undefined) return date;
  return `${date}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export function statusBadge(status: 'open' | 'closed'): string {
  const cls = status === 'open' ? 'badge badge-open' : 'badge badge-closed';
  return `<span class="${cls}">${esc(status)}</span>`;
}

/**
 * Inner HTML for a segmented result-distribution bar (each segment flex-grows by its count,
 * colored per result). `showNumbers` prints the count inside each segment — on for the big
 * overall bar, off for the small per-suite/per-run bars.
 */
export function barSegments(counts: Record<Result, number>, showNumbers: boolean): string {
  const segs = SEG_ORDER.filter((r) => counts[r] > 0)
    .map((r) => {
      const onLight = r === 'not_run' || r === 'skipped';
      const text = showNumbers ? String(counts[r]) : '';
      return `<span class="seg" style="flex-grow:${counts[r]};background:${RESULT_META[r].color};color:${
        onLight ? 'var(--ink-2)' : 'oklch(1 0 0 / 0.92)'
      }">${text}</span>`;
    })
    .join('');
  if (segs) return segs;
  const total = SEG_ORDER.reduce((n, r) => n + counts[r], 0);
  return `<span class="seg" style="flex-grow:1;background:var(--sunken);color:var(--ink-3)">${showNumbers ? total : ''}</span>`;
}

/** Base stylesheet every report shares; builders append their own report-specific rules. */
export const REPORT_STYLE = `
:root{
  /* White document: page + panel fills are pure white (traditional look, less ink). Only
     --sunken keeps a faint neutral tint so inline code / chips stay distinguishable. */
  --bg:oklch(1 0 0);--panel:oklch(1 0 0);--panel-2:oklch(1 0 0);
  --sunken:oklch(0.965 0 0);--border:oklch(0.905 0.005 75);--border-2:oklch(0.855 0.006 72);
  --ink:oklch(0.28 0.012 60);--ink-2:oklch(0.46 0.010 60);--ink-3:oklch(0.60 0.008 62);--ink-faint:oklch(0.72 0.006 64);
  --accent:oklch(0.55 0.13 283);--accent-soft:oklch(0.952 0.028 283);--accent-ink:oklch(0.46 0.12 283);
  --pass:oklch(0.58 0.12 152);--fail:oklch(0.56 0.19 27);--blocked:oklch(0.62 0.16 52);
  --inprogress:oklch(0.58 0.13 250);--skipped:oklch(0.60 0.008 65);--notrun:oklch(0.90 0.003 80);
  --font-ui:"IBM Plex Sans",system-ui,-apple-system,sans-serif;
  --font-mono:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace;
}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{font-family:var(--font-ui);color:var(--ink);background:#fff;font-size:13px;line-height:1.5;
  -webkit-print-color-adjust:exact;print-color-adjust:exact;}
@page{margin:14mm;}
.report{max-width:840px;margin:0 auto;}
.mono{font-family:var(--font-mono);}
.muted{color:var(--ink-3);}
h1{font-size:23px;font-weight:600;margin:2px 0 0;letter-spacing:-0.01em;}
h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--ink-2);
  margin:0 0 10px;padding-bottom:7px;border-bottom:1px solid var(--border);break-after:avoid;}
section{margin-top:22px;}
.dot{display:inline-block;width:9px;height:9px;border-radius:3px;flex:0 0 auto;}

/* header */
.head{border-bottom:2px solid var(--border-2);padding-bottom:16px;}
.eyebrow{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;color:var(--ink-faint);}
.badge{display:inline-block;vertical-align:middle;font-size:10.5px;font-weight:700;text-transform:uppercase;
  letter-spacing:0.05em;padding:2px 9px;border-radius:999px;margin-left:6px;}
.badge-open{background:var(--accent-soft);color:var(--accent-ink);}
.badge-closed{background:var(--sunken);color:var(--ink-3);}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px 20px;margin:16px 0 0;}
.meta dt{font-size:10.5px;text-transform:uppercase;letter-spacing:0.05em;color:var(--ink-faint);margin:0;}
.meta dd{margin:2px 0 0;font-size:13px;font-weight:500;color:var(--ink);}

/* stat tiles */
/* Six fixed columns so the tiles always stay on one row (minmax(0,1fr) lets them
   shrink to fit narrow pages instead of wrapping one onto a second line). */
.tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-top:18px;}
.tile{border:1px solid var(--border);background:var(--panel-2);border-radius:9px;padding:11px 11px;break-inside:avoid;}
.tile-num{font-size:25px;font-weight:700;line-height:1;letter-spacing:-0.02em;}
.tile-label{margin-top:7px;font-size:11.5px;font-weight:600;color:var(--ink-2);}
.tile-sub{margin-top:2px;font-size:10px;color:var(--ink-faint);}

/* progress bar */
.bar-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:8px;}
.bar-head h2{margin:0;padding:0;border:0;}
.bar-pct{font-size:20px;font-weight:700;}
.bar-pct small{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--ink-faint);}
.bar{display:flex;height:30px;border:1px solid var(--border);border-radius:7px;overflow:hidden;}
.seg{display:flex;align-items:center;justify-content:center;font-family:var(--font-mono);font-size:11px;font-weight:700;min-width:24px;}
.legend{display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;}
.chip{display:inline-flex;align-items:center;gap:6px;background:var(--sunken);border-radius:999px;
  padding:3px 10px;font-size:11.5px;color:var(--ink-2);}
.chip b{font-weight:700;color:var(--ink);}

/* footer */
.footer{margin-top:26px;padding-top:12px;border-top:1px solid var(--border);
  font-size:10.5px;color:var(--ink-faint);text-align:center;}
.empty{margin-top:20px;border:1px dashed var(--border-2);border-radius:9px;padding:24px;text-align:center;color:var(--ink-3);}
`;

/* Preview-only chrome: a sticky toolbar with a "Save PDF" button. The toolbar is hidden
   when printing so the saved PDF is identical to the non-preview report. */
export const PREVIEW_STYLE = `
.cw-preview{padding-top:56px;background:var(--bg);}
.cw-toolbar{position:fixed;top:0;left:0;right:0;height:56px;display:flex;align-items:center;
  justify-content:space-between;gap:12px;padding:0 18px;background:var(--panel);
  border-bottom:1px solid var(--border);box-shadow:0 1px 4px oklch(0 0 0 / 0.06);z-index:10;}
.cw-toolbar-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--ink-3);}
.cw-toolbar-actions{display:flex;align-items:center;gap:14px;min-width:0;}
.cw-status{font-size:11.5px;color:var(--ink-3);max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.cw-status.err{color:var(--fail);font-weight:600;}
.cw-save{font-family:var(--font-ui);font-size:13px;font-weight:600;color:oklch(1 0 0 / 0.96);
  background:var(--accent);border:0;border-radius:7px;padding:8px 16px;cursor:pointer;flex:0 0 auto;}
.cw-save:hover:not(:disabled){filter:brightness(1.06);}
.cw-save:disabled{opacity:0.6;cursor:default;}
.cw-toggle{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:500;color:var(--ink-2);
  cursor:pointer;user-select:none;flex:0 0 auto;}
.cw-toggle input{accent-color:var(--accent);width:14px;height:14px;margin:0;cursor:pointer;}
@media print{.cw-toolbar{display:none!important;}.cw-preview{padding-top:0!important;background:#fff!important;}}
`;

/** A filesystem-safe default filename (with `.pdf`) from a report/run name. */
export function defaultPdfName(name: string): string {
  const base = (name || 'run')
    .replace(/[/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return `${base || 'run'}.pdf`;
}

/** Options for {@link renderToolbar}. */
export interface ToolbarOptions {
  /**
   * Show an "Include notes" checkbox (default unchecked). Checking it adds `cw-with-notes`
   * to `<body>` — reports opt their notes markup in via that class, and because Save PDF
   * prints the live DOM, the saved file matches whatever the checkbox says.
   */
  notesToggle?: boolean;
}

export function renderToolbar(opts: ToolbarOptions = {}): string {
  const toggle = opts.notesToggle
    ? `
      <label class="cw-toggle" title="Add the run's notes and per-case failure detail to the report">
        <input type="checkbox" id="cw-notes-toggle" />
        Include notes
      </label>`
    : '';
  return `
  <div class="cw-toolbar">
    <span class="cw-toolbar-title">Report preview</span>
    <div class="cw-toolbar-actions">
      <span class="cw-status" id="cw-status"></span>
      ${toggle}
      <button type="button" id="cw-save" class="cw-save">Save PDF…</button>
    </div>
  </div>`;
}

/**
 * Inline script (preview window only) that wires the "Save PDF" button: prompt for a
 * destination via NW.js's `<input nwsaveas>` (defaulting to `pdfName`), then print this
 * very window to that PDF. Runs in the preview window's own context so the save dialog's
 * focus/blur cancel detection tracks the window the user is actually looking at.
 *
 * It logs every step to the preview window's console (open it with F12) AND mirrors the
 * outcome into a visible status line in the toolbar, so a failure is never silent. With
 * `node-remote` granting this window Node access, it also stat()s the written file to
 * confirm the PDF actually landed rather than trusting `print()` to have succeeded.
 */
export function renderPreviewScript(pdfName: string): string {
  const defaultName = JSON.stringify(defaultPdfName(pdfName));
  return `
  <script>
  (function () {
    var TAG = '[pdf:preview]';
    var DEFAULT_NAME = ${defaultName};
    var btn = document.getElementById('cw-save');
    var statusEl = document.getElementById('cw-status');
    var nw = window.nw;

    function log() {
      try { console.log.apply(console, [TAG].concat([].slice.call(arguments))); } catch (e) {}
    }
    function setStatus(msg, isErr) {
      if (!statusEl) return;
      statusEl.textContent = msg || '';
      statusEl.className = 'cw-status' + (isErr ? ' err' : '');
    }
    function getRequire() {
      if (typeof require === 'function') return require;
      if (nw && typeof nw.require === 'function') return nw.require;
      return null;
    }

    // "Include notes" toggle (only rendered when the report has notes content): flips the
    // body class the notes sections key their visibility off. Wired before the NW.js guard
    // so it also works when the preview is opened in a plain browser.
    var notesToggle = document.getElementById('cw-notes-toggle');
    if (notesToggle) {
      notesToggle.addEventListener('change', function () {
        document.body.classList.toggle('cw-with-notes', notesToggle.checked);
        log('include notes:', notesToggle.checked);
      });
    }

    log('script loaded — nw =', !!nw, '· require =', typeof getRequire());
    if (!btn) { log('no #cw-save button in DOM'); return; }
    if (!nw) {
      btn.disabled = true;
      btn.textContent = 'Save unavailable';
      setStatus('NW.js API not available in this window (node-remote?)', true);
      log('window.nw missing — cannot save');
      return;
    }

    // For an nwsaveas dialog the target file does not exist yet, so input.files is usually
    // empty — the chosen path lives in input.value. Read both; '' / null means cancelled.
    function pathOf(input) {
      var f = input.files && input.files[0];
      return (f && f.path) || input.value || null;
    }

    function pickSave(name) {
      return new Promise(function (resolve) {
        var input = document.createElement('input');
        input.type = 'file';
        input.setAttribute('nwsaveas', name);
        input.style.display = 'none';
        var settled = false, armed = false;
        function finish(v) {
          if (settled) return;
          settled = true;
          window.removeEventListener('focus', onFocus);
          window.removeEventListener('blur', onBlur);
          input.remove();
          log('pickSave resolved:', v ? v : '(cancelled)');
          resolve(v || null);
        }
        function onBlur() { armed = true; log('save dialog opened (window blurred)'); }
        // After the dialog closes the window refocuses, but the change event carrying the
        // chosen path can arrive HUNDREDS of ms later. So don't judge on a single read —
        // poll input.value for a short window and finish the moment a path shows up. Only a
        // value that stays empty the whole time is a genuine cancel.
        function onFocus() {
          if (!armed) return;
          var waited = 0;
          (function check() {
            if (settled) return;
            var p = pathOf(input);
            if (p) { finish(p); return; }
            waited += 150;
            if (waited >= 2500) { finish(null); return; }
            setTimeout(check, 150);
          })();
        }
        input.onchange = function () { log('save input changed — value:', input.value); finish(pathOf(input)); };
        window.addEventListener('blur', onBlur);
        window.addEventListener('focus', onFocus);
        document.body.appendChild(input);
        log('opening save dialog (default name:', name + ')');
        input.click();
      });
    }

    // print() writes the PDF asynchronously and never rejects — poll the path to confirm.
    function verifyWritten(dest) {
      var req = getRequire();
      if (!req) {
        log('cannot verify (no require) — assuming success');
        setStatus('Saved (unverified): ' + dest);
        btn.textContent = 'Saved ✓';
        return;
      }
      var fs = req('fs');
      var tries = 0;
      (function poll() {
        tries++;
        var size = -1;
        try { var st = fs.statSync(dest); if (st.isFile()) size = st.size; } catch (e) {}
        log('verify try', tries, '— size:', size);
        if (size > 0) {
          setStatus('Saved: ' + dest);
          btn.textContent = 'Saved ✓';
          return;
        }
        if (tries < 16) { setTimeout(poll, 250); return; }
        setStatus('print() ran but no PDF appeared at ' + dest, true);
        btn.textContent = 'Save failed';
        log('gave up verifying — no file at', dest);
      })();
    }

    btn.addEventListener('click', function () {
      log('Save clicked');
      btn.disabled = true;
      btn.textContent = 'Saving…';
      setStatus('Choose a destination…');
      pickSave(DEFAULT_NAME).then(function (dest) {
        if (!dest) {
          btn.disabled = false;
          btn.textContent = 'Save PDF…';
          setStatus('Save cancelled');
          return;
        }
        var opts = { pdf_path: dest, headerFooterEnabled: false, marginsType: 0, shouldPrintBackgrounds: true };
        setStatus('Writing PDF…');
        try {
          var win = nw.Window.get();
          log('printing — window:', !!win, '· print is', win && typeof win.print, '· opts:', JSON.stringify(opts));
          win.print(opts);
          log('print() returned without throwing');
          verifyWritten(dest);
        } catch (e) {
          log('print() threw:', e);
          setStatus('Save failed: ' + ((e && e.message) || e), true);
          btn.textContent = 'Save failed';
        }
        setTimeout(function () { btn.disabled = false; }, 2000);
      }).catch(function (e) {
        log('pickSave threw:', e);
        setStatus('Save failed: ' + ((e && e.message) || e), true);
        btn.disabled = false;
        btn.textContent = 'Save PDF…';
      });
    });
  })();
  </script>`;
}
