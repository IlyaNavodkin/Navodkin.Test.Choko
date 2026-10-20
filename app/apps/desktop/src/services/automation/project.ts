import { node } from '@/lib/node';
import { CASEWRIGHT_DIR } from '@/services/repo-paths';

// ---------------------------------------------------------------------------
// The autotest project lives inside the repository's data folder:
//   .casewright/autotests/
//     package.json
//     playwright.config.ts
//     node_modules/
//     tests/…
//
// The **folder itself is the marker**: a repository has autotests when this folder exists.
// Discovery and execution run with their cwd set here, so Playwright resolves its config,
// dependencies and test files from the project — never from the repository root.
// ---------------------------------------------------------------------------

/** Repo-relative autotest project root — the detection marker. */
export const AUTOTESTS_DIR = `${CASEWRIGHT_DIR}/autotests`;

export interface AutomationProject {
  /** Absolute path of the repository root. */
  repoPath: string;
  /** Repo-relative project root (`.casewright/autotests`). */
  rel: string;
  /** Absolute path of the project root. */
  dir: string;
  /** Whether the project folder exists (the detection marker). */
  exists: boolean;
}

/** Absolute path of `<repo>/.casewright/autotests`. */
export function automationProjectPath(repoPath: string): string {
  return node.path().join(repoPath, ...AUTOTESTS_DIR.split('/'));
}

/**
 * Detect the autotest project by its folder. A missing folder is a normal state (the repository
 * simply has no autotests), not an error — callers decide whether they need one.
 */
export async function findAutomationProject(repoPath: string): Promise<AutomationProject> {
  const dir = automationProjectPath(repoPath);
  let exists = false;
  try {
    exists = (await node.fsp().stat(dir)).isDirectory();
  } catch {
    /* absent */
  }
  return { repoPath, rel: AUTOTESTS_DIR, dir, exists };
}
