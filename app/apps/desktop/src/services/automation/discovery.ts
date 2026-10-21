import type { SpawnOptions } from 'node:child_process';
import { node } from '@/lib/node';
import { AUTOMATION_LIMITS, type DiscoveredTest, type DiscoveryProblem } from '@/schemas/automation';
import { discoveredTests, discoveryIssues, parsePlaywrightReport, type DiscoveryIssues } from './report';
import { automationProjectPath } from './project';
import { AutomationRuntimeError, type NodeRuntime, type ProjectPlaywright } from './runtime';

// ---------------------------------------------------------------------------
// Discovery (`playwright test --list --reporter=json`) — spec "Autotest catalog from explicit
// discovery". It runs only on an explicit user action for a trusted profile: this module is never
// called when a repository/section is opened. The project is detected by `.ch/autotests/`
// and the CLI runs with that folder as its cwd. The JSON goes to stdout (no output-name override).
// ---------------------------------------------------------------------------

export interface DiscoverySpec {
  repoPath: string;
  node: NodeRuntime;
  playwright: ProjectPlaywright;
  /** Extra filter args (tags/projects), if any. */
  args?: readonly string[];
  timeoutMs?: number;
}

export interface DiscoveryInvocation {
  command: string;
  args: string[];
  options: SpawnOptions;
}

/** Build the spawn call for `--list --reporter=json` (pure). */
export function buildDiscoveryInvocation(spec: DiscoverySpec): DiscoveryInvocation {
  const args = [spec.playwright.cliPath, 'test', '--list', '--reporter=json', ...(spec.args ?? [])];
  return {
    command: spec.node.command,
    args,
    options: {
      cwd: automationProjectPath(spec.repoPath),
      shell: false,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    },
  };
}

export interface CliOutput {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a built invocation to completion, capturing bounded stdout/stderr. Injectable for tests. */
export type CliRunner = (inv: DiscoveryInvocation) => Promise<CliOutput>;

/** Default {@link CliRunner}: spawn without a shell, capture both streams (bounded). */
export const spawnCliRunner: CliRunner = (inv) =>
  new Promise<CliOutput>((resolve, reject) => {
    let child;
    try {
      child = node.childProcess().spawn(inv.command, inv.args, inv.options);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    let stdout = '';
    let stderr = '';
    const cap = AUTOMATION_LIMITS.maxReportBytes;
    child.stdout?.on('data', (d) => {
      if (stdout.length < cap) stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      if (stderr.length < cap) stderr += d.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ exitCode: code, stdout, stderr }));
  });

export interface DiscoveryResult {
  ok: boolean;
  tests: DiscoveredTest[];
  issues: DiscoveryIssues;
  problems: DiscoveryProblem[];
}

/**
 * Run discovery and derive the catalog. A missing Node/Playwright is a clear problem, not a crash;
 * a non-zero exit or unparseable stdout is a `runner-error`/`bad-report` problem. The catalog is
 * returned even when there are identity issues (the UI shows them, the run is blocked).
 */
export async function discoverTests(spec: DiscoverySpec, run: CliRunner = spawnCliRunner): Promise<DiscoveryResult> {
  let out: CliOutput;
  try {
    out = await run(buildDiscoveryInvocation(spec));
  } catch (e) {
    const message = e instanceof AutomationRuntimeError ? e.message : `Could not run Playwright discovery: ${errText(e)}`;
    return { ok: false, tests: [], issues: emptyIssues(), problems: [{ code: e instanceof AutomationRuntimeError && e.code === 'no-node' ? 'no-node' : 'runner-error', message }] };
  }

  const parsed = parsePlaywrightReport(out.stdout.trim() === '' ? '' : out.stdout);
  if (!parsed.ok) {
    const diag = out.stderr.trim().split('\n').slice(-8).join('\n');
    return {
      ok: false,
      tests: [],
      issues: emptyIssues(),
      problems: [{ code: 'bad-report', message: `${parsed.error}${diag ? `\n${diag}` : ''}` }],
    };
  }

  const tests = discoveredTests(parsed.report);
  const issues = discoveryIssues(tests);
  const problems: DiscoveryProblem[] = [];
  if (issues.empty) {
    problems.push({ code: 'no-tests', message: 'No tests were found in this Playwright project.' });
  }
  if (issues.unkeyed.length) {
    problems.push({
      code: 'no-tests',
      message: `${issues.unkeyed.length} test${issues.unkeyed.length === 1 ? '' : 's'} have no testoritto.automationId annotation or @tt: tag and cannot be started from a run.`,
    });
  }
  if (issues.duplicates.length) {
    problems.push({
      code: 'bad-report',
      message: `${issues.duplicates.length} test key${issues.duplicates.length === 1 ? ' is' : 's are'} duplicated (same caseId + automationId + project + variant); a run would be ambiguous.`,
    });
  }
  return { ok: true, tests, issues, problems };
}

const emptyIssues = (): DiscoveryIssues => ({ unkeyed: [], duplicates: [], empty: true });
const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));
