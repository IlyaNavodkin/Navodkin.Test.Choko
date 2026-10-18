import { useEffect, useRef } from 'react';
import { casePath } from './caseOperations';
import type { DemoCase, DemoFile, DemoRun } from './types';
export type UsePreviewChangeTrackingArgs = { cases: DemoCase[]; runs: DemoRun[]; recordFiles: (changes: DemoFile[]) => void };
export type UsePreviewChangeTrackingResult = Record<string, never>;
function documents(cases: DemoCase[], runs: DemoRun[]): Map<string, string[]> {
  return new Map([
    ...cases.map((item): [string, string[]] => [casePath(item), [`id: ${item.id}`, `status: ${item.status}`, `# ${item.title}`, ...item.objective.split(/\r?\n/), ...item.setup.split(/\r?\n/), ...item.steps.flatMap((step, i) => { const lines = step.split(/\r?\n/); const marker = `${i + 1}. `; return lines.map((line, index) => `${index === 0 ? marker : ' '.repeat(marker.length)}${line}`); }), ...item.expected.split(/\r?\n/)]]),
    ...runs.map((run): [string, string[]] => [`.casewright/runs/${run.id}/_run.md`, [`# ${run.name}`, `date: ${run.date}`, `closed: ${run.closed}`, run.summary, run.notes, ...run.results.map((item, i) => `${run.snapshots[i].displayId}: ${item.result} · ${item.tester} · ${item.notes}`)]]),
  ]);
}
export function usePreviewChangeTracking({ cases, runs, recordFiles }: UsePreviewChangeTrackingArgs): UsePreviewChangeTrackingResult {
  const previous = useRef(documents(cases, runs));
  useEffect(() => {
    const current = documents(cases, runs); const changes: DemoFile[] = [];
    for (const path of new Set([...previous.current.keys(), ...current.keys()])) {
      const before = previous.current.get(path) ?? []; const after = current.get(path) ?? [];
      if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ path, before, after, kind: before.length ? 'modified' : 'untracked' });
    }
    previous.current = current; if (changes.length) recordFiles(changes);
  }, [cases, runs, recordFiles]);
  return {};
}
