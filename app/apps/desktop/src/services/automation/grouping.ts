import type { PlaywrightJsonReport, ResolvedAutomationArg } from '@/schemas/automation';
import { argumentFingerprint } from './arguments';

// ---------------------------------------------------------------------------
// Deterministic grouping (design §Порядок, группировка и параллелизм, spec "Deterministic grouping
// and ordering").
//
// Two things the app owns, and one it explicitly does not:
//   · tests with the same resolved arguments and project share one invocation (fewer browser
//     startups), in first-appearance order;
//   · invocations run sequentially in selection order;
//   · order and parallelism *inside* one Playwright run stay the project's (`workers`,
//     `fullyParallel`, `serial`, dependency projects) — we never pass `--workers=1`.
// ---------------------------------------------------------------------------

export interface InvocationItem {
  /** The identity tuple this item resolves to. */
  target: { test: { automationId: string | null; title: string }; project: string; variantId: string };
  args: readonly ResolvedAutomationArg[];
}

export interface GroupedInvocation {
  /** Stable id: project + argument fingerprint (unique within one plan). */
  id: string;
  project: string;
  args: ResolvedAutomationArg[];
  fingerprint: string;
  items: InvocationItem[];
}

/**
 * Group in first-appearance order by `project + resolved args`. Tests that resolve identically share
 * an invocation; a different value (or project) starts a new one. Order is fully determined by the
 * input order, so the same selection always produces the same plan.
 */
export function groupInvocations(items: readonly InvocationItem[]): GroupedInvocation[] {
  const groups: GroupedInvocation[] = [];
  const index = new Map<string, GroupedInvocation>();
  for (const item of items) {
    const fingerprint = argumentFingerprint(item.args);
    const id = `${item.target.project}::${fingerprint}`;
    let group = index.get(id);
    if (!group) {
      group = { id, project: item.target.project, args: [...item.args], fingerprint, items: [] };
      index.set(id, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

/**
 * Whether Playwright will run the tests inside an invocation in parallel. `workers` comes from the
 * project config; `null` means "not known from discovery" (Playwright's default is 50% of cores).
 * We surface this rather than changing it.
 */
export function mayRunInParallel(
  report: Pick<PlaywrightJsonReport, 'config'> | null,
  project: string,
): boolean {
  const projects = report?.config?.projects ?? [];
  const cfg = projects.find((p) => p?.name === project);
  if (cfg?.workers !== undefined) return cfg.workers !== 1;
  return true; // Playwright's default is parallel
}

/** A short, user-facing warning when more than one test in an invocation may interleave. */
export function parallelismWarning(
  report: Pick<PlaywrightJsonReport, 'config'> | null,
  groups: readonly GroupedInvocation[],
): string | null {
  const parallel = groups.filter((g) => g.items.length > 1 && mayRunInParallel(report, g.project));
  if (parallel.length === 0) return null;
  return `${parallel.length} invocation${parallel.length === 1 ? '' : 's'} contain more than one test; Playwright may run them in parallel, as configured in the project. The app does not change that.`;
}

/** Projects that other projects depend on (e.g. an auth setup) — Playwright runs them itself. */
export function dependencyProjects(report: Pick<PlaywrightJsonReport, 'config'> | null): string[] {
  const raw = report?.config?.projects ?? [];
  const names = new Set(raw.map((p) => p?.name).filter((n): n is string => !!n));
  const deps: string[] = [];
  for (const p of raw as unknown as { name?: string; dependencies?: unknown }[]) {
    for (const d of Array.isArray(p?.dependencies) ? p.dependencies : []) {
      const name = typeof d === 'string' ? d : (d as { name?: string })?.name;
      if (typeof name === 'string' && names.has(name) && !deps.includes(name)) deps.push(name);
    }
  }
  return deps;
}
