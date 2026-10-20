import type { DiscoveredTest } from '@/schemas/automation';
import { supportsTestList } from '@/schemas/automation';
import { automationTag, testKey } from './report';
import type { ProjectPlaywright } from './runtime';

// ---------------------------------------------------------------------------
// Exact selection (design §Решение 5, spec "Exact selection and manual-run compatible argument
// channel").
//
// Playwright filters by tag/title, not by annotation, so every runnable test carries a unique
// `@tt:<automationId>` tag. We never guess by title: a selection is either expressible exactly
// (`--test-list` on 1.60+, or `--project` + an anchored `--grep` on the tag) or it is blocked with
// a diagnostic. `--project` is always passed so sibling projects/variants never run.
// ---------------------------------------------------------------------------

export interface SelectionTarget {
  /** The discovery entry being selected. */
  test: DiscoveredTest;
  project: string;
  /** Variant id; `default` when the test declares none. */
  variantId: string;
}

export interface SelectionPlan {
  ok: boolean;
  /** Playwright CLI args for the invocation (never includes a shell string). */
  args: string[];
  /** Files to write as `--test-list` content, when that path is used. */
  testList?: { content: string };
  problems: string[];
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The `--test-list` line for one discovered test (`[project] › file:line › suite › title`). */
export function testListLine(t: DiscoveredTest, project: string): string {
  const file = t.file ?? '';
  const location = t.line ? `${file}:${t.line}` : file;
  const path = [...t.titlePath];
  const prefix = project ? `[${project}] › ` : '';
  return `${prefix}${location}${path.length ? ` › ${path.join(' › ')}` : ''}`;
}

/** Group targets by project, preserving the caller's order (deterministic). */
export function byProject(targets: readonly SelectionTarget[]): Map<string, SelectionTarget[]> {
  const map = new Map<string, SelectionTarget[]>();
  for (const t of targets) {
    const list = map.get(t.project) ?? [];
    list.push(t);
    map.set(t.project, list);
  }
  return map;
}

/**
 * Build the CLI selection for one project's targets. Returns a blocked plan when any target has no
 * unique filterable marker (missing `automationId`), when the same tag appears twice in the
 * selection, or — on the grep path — when the tag also matches catalogued tests that were *not*
 * selected (another variant/project would otherwise run too). Both would run the wrong set.
 *
 * `catalog` is the full discovery result; without it the grep path cannot prove exclusivity and
 * says so rather than guessing.
 */
export function planSelection(
  targets: readonly SelectionTarget[],
  playwright: Pick<ProjectPlaywright, 'version'>,
  catalog?: readonly DiscoveredTest[],
): SelectionPlan {
  const problems: string[] = [];
  const projects = new Set<string>();
  const tagCounts = new Map<string, number>();

  for (const { test, project } of targets) {
    if (!test.automationId) {
      problems.push(`"${test.title}" has no automationId (annotation or @tt: tag), so it cannot be selected exactly.`);
      continue;
    }
    projects.add(project);
    const tag = automationTag(test.automationId);
    tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }
  for (const [tag, n] of tagCounts) {
    if (n > 1) problems.push(`The tag ${tag} is used by ${n} selected tests; the selection is ambiguous.`);
  }
  if (problems.length) return { ok: false, args: [], problems };

  if (targets.length === 0) return { ok: true, args: [], problems: [] };

  if (projects.size > 1) {
    return {
      ok: false,
      args: [],
      problems: [`One invocation can only target one project, but ${projects.size} were selected (${[...projects].join(', ')}).`],
    };
  }
  const project = [...projects][0];
  const projectArgs = project ? ['--project', project] : [];
  const useTestList = supportsTestList(playwright.version);

  if (useTestList) {
    const content = targets.map(({ test, project: p }) => testListLine(test, p ?? '')).join('\n') + '\n';
    return { ok: true, args: [...projectArgs, '--test-list', '<test-list>'], testList: { content }, problems: [] };
  }

  // Older Playwright: an anchored grep on the unique tag(s), scoped to the project. Prove the tag
  // is exclusive within the project — a second variant of the same automationId shares the tag and
  // would be started too.
  const selectedKeys = new Set(targets.map(({ test, project: p, variantId }) => testKey({ ...test, project: p, variantId })));
  const extras: string[] = [];
  if (!catalog) {
    problems.push('Cannot prove the tag is exclusive without the discovery catalog; run discovery again.');
  } else {
    for (const t of catalog) {
      if (t.project !== project || !t.automationId) continue;
      if (!tagCounts.has(automationTag(t.automationId))) continue;
      if (!selectedKeys.has(testKey({ ...t, project, variantId: t.variantId }))) extras.push(`"${t.title}"`);
    }
    if (extras.length) {
      problems.push(
        `The tag also matches ${extras.length} other test${extras.length === 1 ? '' : 's'} in project "${project}" (${extras.join(', ')}). Upgrade Playwright to 1.60+ for exact test-list selection.`,
      );
    }
  }
  if (problems.length) return { ok: false, args: [], problems };

  const tags = [...tagCounts.keys()];
  const grep = tags.length === 1 ? `^${escapeRegex(tags[0])}$` : tags.map((t) => escapeRegex(t)).join('|');
  return { ok: true, args: [...projectArgs, '--grep', grep], problems: [] };
}

/**
 * Render the final argv, substituting the test-list file path when that strategy was chosen.
 * Kept separate so the plan can be shown in the UI before the file is written.
 */
export function selectionArgs(plan: SelectionPlan, testListPath?: string): string[] {
  if (!plan.testList) return [...plan.args];
  if (!testListPath) throw new Error('A test-list selection needs a file path.');
  return plan.args.map((a) => (a === '<test-list>' ? testListPath : a));
}

/** The identity keys of the selection, used to correlate the report (see execution.ts). */
export const selectionKeys = (targets: readonly SelectionTarget[]): string[] =>
  targets.map(({ test, project, variantId }) => testKey({ ...test, project, variantId }));
