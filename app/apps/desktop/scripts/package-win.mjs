// Package the desktop app into a Windows NW.js distribution.
//
// Run AFTER `vite build` (the `package:win` npm script chains them). Steps:
//   1. Stage a minimal NW.js manifest + the built `dist/` into build/staging.
//   2. `npm install` ONLY the runtime node-deps (simple-git, gray-matter,
//      papaparse) there, so the app ships a real, flat node_modules — pnpm's
//      symlinked store can't be copied into a distributable.
//   3. nw-builder downloads the pinned NW.js runtime and merges the staged app
//      into Casewright.exe (+ Chromium runtime) under build/out.
//   4. Zip build/out into a portable Casewright-<version>-win-x64.zip.
//
// Output (all under apps/desktop/build/, gitignored):
//   build/out/Casewright.exe            — the app folder (consumed by the installer)
//   build/Casewright-<version>-win-x64.zip — portable distribution
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import nwbuild from 'nw-builder';

const here = dirname(fileURLToPath(import.meta.url)); // apps/desktop/scripts
const desktopRoot = join(here, '..');
const distDir = join(desktopRoot, 'dist');
const buildDir = join(desktopRoot, 'build');
const stagingDir = join(buildDir, 'staging');
const outDir = join(buildDir, 'out');
const cacheDir = join(desktopRoot, '.nwcache');
const iconPath = join(desktopRoot, 'build-resources', 'icon.ico');

const pkg = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8'));

// Version: CI passes the release tag via CASEWRIGHT_VERSION; otherwise package.json.
const version = (process.env.CASEWRIGHT_VERSION || pkg.version).replace(/^v/, '');

// Pin the NW.js runtime to the same version as the dev SDK (`nw` devDep), normal flavor.
const nwVersion = (pkg.devDependencies.nw || '').replace(/-sdk$|-nacl$/, '') || 'latest';

// The node-only libs Vite leaves un-bundled (see vite.config.ts NODE_ONLY) — these
// must exist as real modules in the shipped app. Pin to the exact installed versions.
const RUNTIME_DEPS = ['simple-git', 'gray-matter', 'papaparse'];
const installedVersion = (name) =>
  JSON.parse(readFileSync(join(desktopRoot, 'node_modules', name, 'package.json'), 'utf8')).version;

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('✗ dist/index.html not found — run `vite build` first (use `pnpm package:win`).');
  process.exit(1);
}

console.log(`\n▶ Packaging Casewright ${version} (NW.js ${nwVersion}, win-x64)\n`);

// ── 1. stage ───────────────────────────────────────────────────────────────
rmSync(stagingDir, { recursive: true, force: true });
rmSync(outDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });

const manifest = {
  name: 'casewright',
  productName: 'Casewright',
  version,
  main: 'dist/index.html',
  // Carry node-remote through so the report preview window (a local file:// page) gets the
  // `nw`/Node context its Save button needs — see package.json + run-report.ts.
  'node-remote': pkg['node-remote'],
  window: pkg.window,
  dependencies: Object.fromEntries(RUNTIME_DEPS.map((d) => [d, installedVersion(d)])),
};
writeFileSync(join(stagingDir, 'package.json'), JSON.stringify(manifest, null, 2));
cpSync(distDir, join(stagingDir, 'dist'), { recursive: true });
// Ship the PNG referenced by window.icon (the .exe carries the .ico, but the running
// window/taskbar icon comes from window.icon → build-resources/icon.png).
mkdirSync(join(stagingDir, 'build-resources'), { recursive: true });
cpSync(join(desktopRoot, 'build-resources', 'icon.png'), join(stagingDir, 'build-resources', 'icon.png'));
console.log('  ✓ staged manifest + dist + icon');

// ── 2. install runtime node_modules (flat, prod-only) ────────────────────────
console.log(`  • installing runtime deps: ${RUNTIME_DEPS.join(', ')}`);
const npm = spawnSync(
  'npm',
  ['install', '--omit=dev', '--no-audit', '--no-fund', '--no-package-lock', '--loglevel=error'],
  { cwd: stagingDir, stdio: 'inherit', shell: true },
);
if (npm.status !== 0) {
  console.error('✗ npm install of runtime deps failed');
  process.exit(npm.status ?? 1);
}
console.log('  ✓ runtime node_modules installed');

// ── 3. nw-builder ────────────────────────────────────────────────────────────
const year = new Date().getFullYear();
await nwbuild({
  mode: 'build',
  flavor: 'normal',
  platform: 'win',
  arch: 'x64',
  version: nwVersion,
  srcDir: stagingDir,
  glob: false,
  managedManifest: false,
  cacheDir,
  outDir,
  zip: false,
  logLevel: 'info',
  app: {
    name: 'Casewright',
    icon: iconPath,
    version,
    company: pkg.author || 'Casewright',
    fileDescription: "Casewright — a bespoke editor for manual test cases",
    fileVersion: version,
    productName: 'Casewright',
    productVersion: version,
    internalName: 'Casewright',
    originalFilename: 'Casewright.exe',
    legalCopyright: `© ${year} ${pkg.author || 'Casewright'}`,
  },
});

const exePath = join(outDir, 'Casewright.exe');
if (!existsSync(exePath)) {
  console.error(`✗ nw-builder did not produce ${exePath}`);
  process.exit(1);
}
console.log(`  ✓ built ${exePath}`);

// ── 4. portable zip ──────────────────────────────────────────────────────────
const zipPath = join(buildDir, `Casewright-${version}-win-x64.zip`);
rmSync(zipPath, { force: true });
const zip = spawnSync(
  'powershell',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Compress-Archive -Path '${join(outDir, '*')}' -DestinationPath '${zipPath}' -Force`,
  ],
  { stdio: 'inherit' },
);
if (zip.status !== 0) {
  console.error('✗ Compress-Archive failed');
  process.exit(zip.status ?? 1);
}
console.log(`  ✓ wrote ${zipPath}`);

console.log(`\n✓ Packaging complete:\n    ${exePath}\n    ${zipPath}\n`);
