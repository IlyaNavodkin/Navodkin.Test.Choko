#!/usr/bin/env node
// Interactive release helper for Choko.
//
// It bumps the version in both package manifests, commits the change, creates
// an annotated v* tag, and optionally pushes the commit and tag so the GitHub
// Actions release workflow starts.
//
// Usage (from the app/ directory):
//   pnpm release                 # interactive: patch / minor / major
//   pnpm release minor           # skip the bump prompt
//   pnpm release --dry-run minor # print the plan, change nothing
//   pnpm release --no-push minor # commit + tag locally, do not push
//   pnpm release --yes --push major
//
// The script refuses to run on a dirty tree, a stale branch, or an existing tag.

import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import process from 'node:process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
  cwd: appRoot,
  encoding: 'utf8',
}).trim();

const rootPkgPath = join(appRoot, 'package.json');
const desktopPkgPath = join(appRoot, 'apps', 'desktop', 'package.json');
const rootPkgRel = relative(repoRoot, rootPkgPath).split(sep).join('/');
const desktopPkgRel = relative(repoRoot, desktopPkgPath).split(sep).join('/');

const BUMP_TYPES = ['patch', 'minor', 'major'];
const FLAGS = new Set([
  '--yes',
  '-y',
  '--dry-run',
  '--push',
  '--no-push',
  '--skip-checks',
  '--no-fetch',
  '--help',
  '-h',
]);

function git(args, options = {}) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });
}

function gitInherit(args) {
  execFileSync('git', args, { cwd: repoRoot, stdio: 'inherit' });
}

function run(command) {
  console.log(`\n$ ${command}`);
  execSync(command, {
    cwd: appRoot,
    stdio: 'inherit',
    shell: true,
  });
}

function readPackageVersion(file) {
  return JSON.parse(readFileSync(file, 'utf8')).version;
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version "${version}". Expected MAJOR.MINOR.PATCH.`);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function nextVersion(version, bump) {
  const { major, minor, patch } = parseVersion(version);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function replacePackageVersion(raw, version) {
  const pattern = /("version"\s*:\s*")[^"]*(")/;
  if (!pattern.test(raw)) {
    throw new Error('Could not find the top-level "version" field in package.json.');
  }
  return raw.replace(pattern, `$1${version}$2`);
}

function printHelp() {
  console.log(`
Choko release helper

Usage:
  node scripts/release.mjs [patch|minor|major] [options]

Options:
  -y, --yes       Skip the "create release?" confirmation
      --dry-run   Print the plan without changing anything
      --push      Push the commit and tag without asking
      --no-push   Commit and tag locally, but do not push
      --skip-checks
                  Skip typecheck/tests/builds
      --no-fetch  Do not run "git fetch" first
  -h, --help      Show this help

Examples:
  pnpm release
  pnpm release minor
  pnpm release --dry-run major
  pnpm release --no-push patch
  pnpm release --yes --push minor
`);
}

function parseArgs(argv) {
  const bump = argv.find((arg) => BUMP_TYPES.includes(arg));
  const unknown = argv.filter((arg) => !BUMP_TYPES.includes(arg) && !FLAGS.has(arg));
  if (unknown.length) {
    throw new Error(`Unknown argument(s): ${unknown.join(', ')}. Use --help for usage.`);
  }
  if (argv.includes('--push') && argv.includes('--no-push')) {
    throw new Error('Use either --push or --no-push, not both.');
  }
  return {
    bump,
    yes: argv.includes('--yes') || argv.includes('-y'),
    dryRun: argv.includes('--dry-run'),
    push: argv.includes('--push')
      ? true
      : argv.includes('--no-push')
        ? false
        : null,
    skipChecks: argv.includes('--skip-checks'),
    noFetch: argv.includes('--no-fetch'),
    help: argv.includes('--help') || argv.includes('-h'),
  };
}

function confirm(question, defaultYes) {
  const suffix = defaultYes ? ' [Y/n] ' : ' [y/N] ';
  return readline.question(question + suffix).then((answer) => {
    const value = answer.trim().toLowerCase();
    if (!value) return defaultYes;
    return value === 'y' || value === 'yes';
  });
}

let readline;

async function promptBump(current) {
  const { major, minor, patch } = parseVersion(current);
  console.log(`\nCurrent version: ${current}`);
  console.log('Select release type:');
  console.log(`  1) patch  ${major}.${minor}.${patch + 1}`);
  console.log(`  2) minor  ${major}.${minor + 1}.0`);
  console.log(`  3) major  ${major + 1}.0.0`);

  for (;;) {
    const answer = (await readline.question('Release type [1/2/3 or patch/minor/major]: '))
      .trim()
      .toLowerCase();
    const choice = { '1': 'patch', '2': 'minor', '3': 'major' }[answer] ?? answer;
    if (BUMP_TYPES.includes(choice)) return choice;
    console.log('Please enter 1, 2, 3, patch, minor, or major.');
  }
}

function assertCleanTree() {
  const status = git(['status', '--porcelain']).trim();
  if (status) {
    throw new Error(
      `Working tree is not clean. Commit or stash these changes first:\n\n${status}`,
    );
  }
}

function getUpstream() {
  try {
    return git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function resolvePushTarget(branch, upstream) {
  if (upstream.includes('/')) return upstream.slice(upstream.indexOf('/') + 1);
  return branch;
}

function assertTagIsNew(tag, remote) {
  if (git(['tag', '--list', tag]).trim()) {
    throw new Error(`Tag ${tag} already exists locally. Delete it or choose another version.`);
  }
  let remoteTags = '';
  try {
    remoteTags = git(['ls-remote', '--tags', remote, `refs/tags/${tag}`]).trim();
  } catch (error) {
    throw new Error(`Could not check ${remote} for tag ${tag}: ${error.message}`);
  }
  if (remoteTags) {
    throw new Error(`Tag ${tag} already exists on ${remote}. Delete it or choose another version.`);
  }
}

function assertBranchState(upstream) {
  if (!upstream) return;
  const counts = git(['rev-list', '--left-right', '--count', `HEAD...${upstream}`]).trim();
  const [ahead, behind] = counts.split(/\s+/).map(Number);
  if (behind > 0) {
    throw new Error(
      `Local branch is behind ${upstream} by ${behind} commit(s). Pull or rebase before releasing.`,
    );
  }
  if (ahead > 0) {
    console.log(`  • Branch is ahead of ${upstream} by ${ahead} commit(s); the release will include them.`);
  }
}

function restorePackageFiles(rootRaw, desktopRaw) {
  writeFileSync(rootPkgPath, rootRaw);
  writeFileSync(desktopPkgPath, desktopRaw);
  try {
    git(['reset', '--', rootPkgRel, desktopPkgRel], { stdio: 'ignore' });
  } catch {
    // Best-effort cleanup; the files are already restored.
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const rootVersion = readPackageVersion(rootPkgPath);
  const desktopVersion = readPackageVersion(desktopPkgPath);
  if (rootVersion !== desktopVersion) {
    throw new Error(
      `Version mismatch: app/package.json is ${rootVersion}, but apps/desktop/package.json is ${desktopVersion}. Align them first.`,
    );
  }

  if (!options.bump && !process.stdin.isTTY) {
    throw new Error('Specify patch, minor, or major when running non-interactively.');
  }

  readline = createInterface({ input: process.stdin, output: process.stdout });

  const bump = options.bump ?? (await promptBump(rootVersion));

  const version = nextVersion(rootVersion, bump);
  const tag = `v${version}`;

  console.log(`\nRelease plan`);
  console.log(`  • Type:    ${bump}`);
  console.log(`  • Version: ${rootVersion} → ${version}`);
  console.log(`  • Tag:     ${tag}`);

  if (!options.noFetch) {
    console.log('\nFetching origin…');
    try {
      gitInherit(['fetch', 'origin', '--tags', '--prune']);
    } catch {
      throw new Error('git fetch failed. Fix the network/remote, or rerun with --no-fetch.');
    }
  }

  assertCleanTree();

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  if (branch === 'HEAD') {
    throw new Error('Cannot release from a detached HEAD. Check out a branch first.');
  }
  const upstream = getUpstream();
  const targetBranch = resolvePushTarget(branch, upstream);

  assertBranchState(upstream);
  assertTagIsNew(tag, 'origin');

  console.log(`  • Branch:  ${branch} → origin/${targetBranch}`);

  if (options.dryRun) {
    console.log('\nDry run. No files, commits, or tags were changed.');
    console.log('Commands that would run:');
    console.log(`  git add ${rootPkgRel} ${desktopPkgRel}`);
    console.log(`  git commit -m "chore(release): ${version}"`);
    console.log(`  git tag -a ${tag} -m "Choko ${tag}"`);
    if (options.push !== false) {
      console.log(`  git push origin HEAD:${targetBranch}`);
      console.log(`  git push origin ${tag}`);
    }
    return;
  }

  if (!options.yes) {
    const proceed = await confirm(`Create release ${tag}?`, false);
    if (!proceed) {
      console.log('Aborted. Nothing was changed.');
      return;
    }
  }

  let push = options.push;
  if (push === null) {
    push = await confirm(`Push ${targetBranch} and ${tag} to origin?`, true);
  }

  if (!options.skipChecks) {
    console.log('\nRunning required checks…');
    run('pnpm --filter @choko/desktop typecheck');
    run('pnpm --filter @choko/desktop test');
    run('pnpm --filter @choko/desktop build');
    run('pnpm --filter @choko/web build');
  } else {
    console.log('\nSkipping checks (--skip-checks).');
  }

  const rootRaw = readFileSync(rootPkgPath, 'utf8');
  const desktopRaw = readFileSync(desktopPkgPath, 'utf8');
  const nextRootRaw = replacePackageVersion(rootRaw, version);
  const nextDesktopRaw = replacePackageVersion(desktopRaw, version);

  try {
    writeFileSync(rootPkgPath, nextRootRaw);
    writeFileSync(desktopPkgPath, nextDesktopRaw);
    gitInherit(['add', rootPkgRel, desktopPkgRel]);
    gitInherit(['commit', '-m', `chore(release): ${version}`]);
  } catch (error) {
    restorePackageFiles(rootRaw, desktopRaw);
    throw new Error(`Release commit failed. Package files were restored. ${error.message}`);
  }

  try {
    gitInherit(['tag', '-a', tag, '-m', `Choko ${tag}`]);
  } catch (error) {
    git(['reset', '--soft', 'HEAD~1'], { stdio: 'ignore' });
    restorePackageFiles(rootRaw, desktopRaw);
    throw new Error(`Tag creation failed. The release commit was rolled back. ${error.message}`);
  }

  if (push) {
    try {
      gitInherit(['push', 'origin', `HEAD:${targetBranch}`]);
      gitInherit(['push', 'origin', tag]);
    } catch (error) {
      throw new Error(
        `Release ${tag} was created locally, but the push failed. Push it manually with:\n` +
          `  git push origin HEAD:${targetBranch}\n  git push origin ${tag}\n\n${error.message}`,
      );
    }
    console.log(`\n✓ Released ${tag}.`);
    console.log('  GitHub Actions: https://github.com/IlyaNavodkin/Navodkin.Test.Choko/actions/workflows/build-desktop.yml');
  } else {
    console.log(`\n✓ Prepared ${tag} locally.`);
    console.log('Push it to trigger the release workflow:');
    console.log(`  git push origin HEAD:${targetBranch}`);
    console.log(`  git push origin ${tag}`);
  }
}

main()
  .catch((error) => {
    console.error(`\n✗ ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => {
    readline?.close();
  });
