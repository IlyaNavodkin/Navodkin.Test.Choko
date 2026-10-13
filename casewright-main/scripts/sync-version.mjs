// Set the release version across the monorepo's published manifests.
//
// Invoked by semantic-release (@semantic-release/exec, `prepare` step):
//   node scripts/sync-version.mjs 0.4.0
//
// semantic-release decides the number from the Conventional Commits — this script
// only writes it into the root package.json and apps/desktop/package.json (the
// desktop manifest the runtime + auto-updater report), preserving 2-space
// indentation and the trailing newline so the commit diff stays minimal.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = (process.argv[2] || '').replace(/^v/, '');
if (!/^\d+\.\d+\.\d+/.test(version)) {
  console.error(`✗ sync-version: "${process.argv[2]}" is not a valid semver (e.g. 0.4.0)`);
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const targets = ['package.json', 'apps/desktop/package.json'];

for (const rel of targets) {
  const file = join(root, rel);
  const json = JSON.parse(readFileSync(file, 'utf8'));
  json.version = version;
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`  ✓ ${rel} → ${version}`);
}
