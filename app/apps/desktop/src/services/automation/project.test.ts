import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AUTOTESTS_DIR, automationProjectPath, findAutomationProject } from './project';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});

async function mkRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'testoritto-project-'));
  cleanup.push(dir);
  return dir;
}

describe('autotest project detection', () => {
  it('uses .ch/autotests as the project root', async () => {
    const repo = await mkRepo();
    expect(AUTOTESTS_DIR).toBe('.ch/autotests');
    expect(automationProjectPath(repo)).toBe(join(repo, '.ch', 'autotests'));

    const missing = await findAutomationProject(repo);
    expect(missing).toMatchObject({ rel: '.ch/autotests', exists: false });

    await mkdir(join(repo, '.ch', 'autotests'), { recursive: true });
    const found = await findAutomationProject(repo);
    expect(found.exists).toBe(true);
    expect(found.dir).toBe(automationProjectPath(repo));
  });
});
