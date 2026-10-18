import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { node } from '@/lib/node';

// These are real-git integration tests: every case spawns git subprocesses (init, clone, fetch,
// pull, merge) and the beforeAll builds an origin + two clones. Individual cases pass comfortably
// in isolation but brush against vitest's default 5s timeout when the whole suite runs in parallel
// and many git processes contend for the machine — the source of intermittent CI flakes. Give this
// file generous headroom so a slow-but-correct run never trips the timeout.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });
import {
  abortMerge,
  diffPath,
  discardPaths,
  fetch,
  keepStashedVersion,
  pull,
  push,
  stageAndCommit,
  stashPop,
  stashPush,
  status,
} from './git';

let tmp: string;
let repo: string;
let origin: string;
let clone: string;

const write = (dir: string, name: string, content: string) =>
  node.fsp().writeFile(node.path().join(dir, name), content);
const read = (dir: string, name: string) => node.fsp().readFile(node.path().join(dir, name), 'utf8');

async function configure(dir: string, email: string, name: string) {
  const g = node.simpleGit()(dir);
  await g.addConfig('user.email', email, false, 'local');
  await g.addConfig('user.name', name, false, 'local');
  await g.addConfig('core.autocrlf', 'false', false, 'local'); // keep test content byte-exact
  await g.addConfig('commit.gpgsign', 'false', false, 'local'); // don't inherit ambient signing config
}

beforeAll(async () => {
  const fsp = node.fsp();
  const path = node.path();
  tmp = await fsp.mkdtemp(path.join(node.os().tmpdir(), 'cw-git-'));
  repo = path.join(tmp, 'repo');
  origin = path.join(tmp, 'origin.git');
  clone = path.join(tmp, 'clone');

  await fsp.mkdir(repo, { recursive: true });
  const g = node.simpleGit()(repo);
  await g.init();
  await configure(repo, 'dev@cw.dev', 'Dev');
  await write(repo, 'a.md', 'one\n');
  await g.add('.');
  await g.commit('init');
  await g.branch(['-M', 'main']);

  await fsp.mkdir(origin, { recursive: true });
  // Create the bare origin with HEAD -> main. Without an explicit initial branch the
  // bare repo inherits git's `init.defaultBranch` (often `master` on CI runners), so its
  // HEAD points at a ref that never gets pushed — the later `clone` then checks out an
  // empty tree and the divergent-pull tests fail. Pinning it to `main` keeps CI in sync.
  await node.simpleGit()(origin).init(true, ['-b', 'main']);
  await g.addRemote('origin', origin);
  await g.push(['-u', 'origin', 'main']);
});

afterAll(async () => {
  await node.fsp().rm(tmp, { recursive: true, force: true });
});

describe('git service', () => {
  it('reports a clean tree on main', async () => {
    const s = await status(repo);
    expect(s.branch).toBe('main');
    expect(s.changes).toHaveLength(0);
    expect(s.ahead).toBe(0);
  });

  it('detects a modification, commits it, and pushes', async () => {
    await write(repo, 'a.md', 'two\n');
    let s = await status(repo);
    expect(s.changes.map((c) => c.status)).toContain('M');

    await stageAndCommit(repo, ['a.md'], 'update a');
    s = await status(repo);
    expect(s.changes).toHaveLength(0);
    expect(s.ahead).toBe(1);

    await push(repo);
    s = await status(repo);
    expect(s.ahead).toBe(0);
  });

  it('pulls a divergent upstream change (clean merge)', async () => {
    await node.simpleGit()().clone(origin, clone);
    await configure(clone, 'other@cw.dev', 'Other');
    await write(clone, 'b.md', 'beta\n');
    const gc = node.simpleGit()(clone);
    await gc.add('.');
    await gc.commit('add b');
    await gc.push();

    const res = await pull(repo);
    expect(res.ok).toBe(true);
    expect(await read(repo, 'b.md')).toBe('beta\n');
  });

  it('surfaces conflicts on a divergent same-file pull and aborts cleanly', async () => {
    // local commit (not pushed)
    await write(repo, 'a.md', 'local change\n');
    await stageAndCommit(repo, ['a.md'], 'local edit');

    // a competing upstream commit to the same file
    const gc = node.simpleGit()(clone);
    await gc.pull();
    await write(clone, 'a.md', 'remote change\n');
    await gc.add('.');
    await gc.commit('remote edit');
    await gc.push();

    const res = await pull(repo);
    expect(res.ok).toBe(false);
    expect(res.conflicted).toContain('a.md');

    await abortMerge(repo);
    expect((await status(repo)).conflicted).toHaveLength(0);
  });

  it('fetch surfaces commits-behind without merging', async () => {
    const fsp = node.fsp();
    const path = node.path();
    const o = path.join(tmp, 'fetch-origin.git');
    const a = path.join(tmp, 'fetch-a');
    const b = path.join(tmp, 'fetch-b');

    // a bare origin seeded from clone `a`
    await fsp.mkdir(o, { recursive: true });
    await node.simpleGit()(o).init(true, ['-b', 'main']);
    await fsp.mkdir(a, { recursive: true });
    const ga = node.simpleGit()(a);
    await ga.init();
    await configure(a, 'a@cw.dev', 'A');
    await write(a, 'x.md', '1\n');
    await ga.add('.');
    await ga.commit('init');
    await ga.branch(['-M', 'main']);
    await ga.addRemote('origin', o);
    await ga.push(['-u', 'origin', 'main']);

    // a second clone `b` pushes a new upstream commit
    await node.simpleGit()().clone(o, b);
    await configure(b, 'b@cw.dev', 'B');
    const gb = node.simpleGit()(b);
    await write(b, 'x.md', '2\n');
    await gb.add('.');
    await gb.commit('upstream change');
    await gb.push();

    // a's stale remote-tracking ref → status sees nothing behind yet
    expect((await status(a)).behind).toBe(0);

    // fetch refreshes the ref → status now reports 1 behind, and the working tree is untouched
    await fetch(a);
    expect((await status(a)).behind).toBe(1);
    expect(await read(a, 'x.md')).toBe('1\n');
  }, 20_000); // spins up its own origin + two clones — slower than the shared-repo cases
});

describe('working-tree ops (diff / discard / stash)', () => {
  let wt: string; // its own repo — the shared one above is order-dependent

  beforeAll(async () => {
    const fsp = node.fsp();
    const path = node.path();
    wt = path.join(tmp, 'worktree-ops');
    await fsp.mkdir(path.join(wt, 'suite'), { recursive: true });
    const g = node.simpleGit()(wt);
    await g.init();
    await configure(wt, 'dev@cw.dev', 'Dev');
    await node.fsp().writeFile(path.join(wt, 'suite', 'case.md'), 'line one\nline two\n');
    await g.add('.');
    await g.commit('init');
  });

  it('diffPath reports a tracked modification as a unified patch', async () => {
    await node.fsp().writeFile(node.path().join(wt, 'suite', 'case.md'), 'line one\nline CHANGED\n');
    const patch = await diffPath(wt, 'suite/case.md');
    expect(patch).toContain('diff --git a/suite/case.md b/suite/case.md');
    expect(patch).toContain('-line two');
    expect(patch).toContain('+line CHANGED');
  });

  it('diffPath synthesizes a new-file patch for untracked files under a folder', async () => {
    await write(wt, 'fresh.md', 'brand\nnew\n');
    const patch = await diffPath(wt, '.');
    expect(patch).toContain('diff --git a/fresh.md b/fresh.md');
    expect(patch).toContain('new file mode 100644');
    expect(patch).toContain('+brand');
    expect(patch).toContain('+new');
  });

  it('discardPaths restores tracked files from HEAD and deletes untracked ones', async () => {
    await discardPaths(wt, ['suite/case.md', 'fresh.md']);
    expect(await read(wt, 'suite/case.md')).toBe('line one\nline two\n');
    await expect(node.fsp().stat(node.path().join(wt, 'fresh.md'))).rejects.toThrow();
    expect((await status(wt)).changes).toHaveLength(0);
  });

  it('stash push/pop round-trips local edits (including untracked) across a clean tree', async () => {
    await node.fsp().writeFile(node.path().join(wt, 'suite', 'case.md'), 'edited\n');
    await write(wt, 'extra.md', 'untracked\n');

    expect(await stashPush(wt, 'test stash')).toBe(true);
    expect((await status(wt)).changes).toHaveLength(0); // tree clean while stashed

    const pop = await stashPop(wt);
    expect(pop.ok).toBe(true);
    expect(await read(wt, 'suite/case.md')).toBe('edited\n');
    expect(await read(wt, 'extra.md')).toBe('untracked\n');

    await discardPaths(wt, ['suite/case.md', 'extra.md']); // reset for the next test
  });

  it('stashPush reports false on a clean tree', async () => {
    expect(await stashPush(wt, 'noop')).toBe(false);
  });

  it('keepStashedVersion resolves a conflicted pop by keeping the local edits', async () => {
    // Local edit → stashed; then the branch moves on (as a pull would) touching the same lines.
    await node.fsp().writeFile(node.path().join(wt, 'suite', 'case.md'), 'line one\nlocal edit\n');
    expect(await stashPush(wt, 'local edits')).toBe(true);
    await node.fsp().writeFile(node.path().join(wt, 'suite', 'case.md'), 'line one\nupstream edit\n');
    await stageAndCommit(wt, ['suite/case.md'], 'upstream change');

    const pop = await stashPop(wt);
    expect(pop.ok).toBe(false);
    expect(pop.conflicted).toContain('suite/case.md');

    const unresolved = await keepStashedVersion(wt, pop.conflicted);
    expect(unresolved).toHaveLength(0);
    expect(await read(wt, 'suite/case.md')).toBe('line one\nlocal edit\n');

    const s = await status(wt);
    expect(s.conflicted).toHaveLength(0);
    expect(s.changes.map((c) => c.status)).toEqual(['M']); // a plain modification again
    expect((await node.simpleGit()(wt).raw(['stash', 'list'])).trim()).toBe(''); // stash dropped
  });
});
