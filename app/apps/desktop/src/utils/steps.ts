import type { Step } from '@/types';

/** Compute the "1.2.1"-style outline numbers for a list of (nestable) steps. */
export function numberSteps(steps: Step[]): string[] {
  const counters: number[] = [];
  const out: string[] = [];
  steps.forEach((s) => {
    const d = s.depth;
    counters[d] = (counters[d] || 0) + 1;
    counters.length = d + 1;
    out.push(counters.slice(0, d + 1).join('.'));
  });
  return out;
}

/** Serialize steps to indented plain text (2 spaces per depth level). */
export function stepText(steps: Step[]): string {
  return steps.map((s) => '  '.repeat(s.depth) + s.text).join('\n');
}

export function listText(items: string[]): string {
  return items.join('\n');
}
