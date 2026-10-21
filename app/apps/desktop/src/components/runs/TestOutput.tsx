import { useState } from 'react';
import { Select } from '@/components/ui';
import type { RunAutomationResult } from '@/services/automation/run-results';
import { AutomationStatus } from './automation-status';
import { plainConsoleText } from '@/services/automation/test-output';

export function TestOutput({ result }: { result: RunAutomationResult }) {
  const attempts = result.attemptOutput ?? [];
  const [selected, setSelected] = useState(attempts.length - 1);
  const attempt = attempts[selected] ?? attempts.at(-1);
  return <section className="mt-4 border-t border-border pt-4" aria-label="Selected test output">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h5 className="text-[12px] font-semibold">Test output</h5>
      {attempts.length > 1 && <Select size="sm" aria-label="Output attempt" value={String(selected)} onValueChange={(value) => setSelected(Number(value))}
        options={attempts.map((a, i) => ({ value: String(i), label: `Attempt ${a.retry + 1} · ${a.status}` }))} />}
    </div>
    <p className="mt-1 text-[11px] text-ink-3">Only this test’s stdout / stderr. Available after its report is received.</p>
    {attempt && <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-3">
      <span>Attempt {attempt.retry + 1}</span><AutomationStatus status={attempt.status} />
    </div>}
    {attempt?.error && <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-fail-soft p-3 font-mono text-[11px] text-fail">{plainConsoleText(attempt.error)}</pre>}
    {attempt?.stdout && <div className="mt-3"><h6 className="text-[10px] uppercase text-ink-3">stdout</h6>
      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-sunken p-3 font-mono text-[11px]">{plainConsoleText(attempt.stdout)}</pre></div>}
    {attempt?.stderr && <div className="mt-3"><h6 className="text-[10px] uppercase text-ink-3">stderr</h6>
      <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-sunken p-3 font-mono text-[11px]">{plainConsoleText(attempt.stderr)}</pre></div>}
    {!attempt?.stdout && !attempt?.stderr && <p className="mt-3 text-[12px] text-ink-3">No console output recorded for this test. A test can finish without writing to stdout or stderr.</p>}
    {attempt?.truncated && <p className="mt-2 text-[11px] text-blocked">Output truncated to the display limit. The original report keeps the full output.</p>}
  </section>;
}
