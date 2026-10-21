// Package the desktop app into a macOS NW.js application.
//
// Run AFTER `vite build` (the `package:mac` npm script chains them). Steps:
//   1. Generate `build/icon.icns` from the brand mascot with the macOS toolchain.
//   2. Stage a minimal NW.js manifest + the built `dist/` into build/staging-mac.
//   3. `npm install` ONLY the runtime node-deps (simple-git, gray-matter,
//      papaparse) there, so the app ships a real, flat node_modules — pnpm's
//      symlinked store can't be copied into a distributable.
//   4. nw-builder merges the staged app into a normal-flavor NW.js runtime
//      under build/mac-out/Choko.app.
//   5. Ad-hoc code-sign the bundle (required to launch an arm64 app after the
//      runtime's original signature has been invalidated by renaming/settings).
//   6. Zip the .app with `ditto` so the bundle metadata survives.
//
// Output (all under apps/desktop/build/, gitignored):
//   build/mac-out/Choko.app              — the application
//   build/Choko-<version>-mac-arm64.zip  — portable distribution
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import nwbuild from 'nw-builder';

const here = dirname(fileURLToPath(import.meta.url)); // apps/desktop/scripts
const desktopRoot = join(here, '..');
const distDir = join(desktopRoot, 'dist');
const buildDir = join(desktopRoot, 'build');
const stagingDir = join(buildDir, 'staging-mac');
const outDir = join(buildDir, 'mac-out');
const cacheDir = join(desktopRoot, '.nwcache');
const icnsPath = join(buildDir, 'icon.icns');
const licensePath = join(desktopRoot, '..', '..', '..', 'LICENSE');
const mascotPath = join(desktopRoot, '..', '..', 'packages', 'brand', 'choko-mascot.png');

const pkg = JSON.parse(readFileSync(join(desktopRoot, 'package.json'), 'utf8'));

// Version: CI passes the release tag via CHOKO_VERSION; otherwise package.json.
const version = (process.env.CHOKO_VERSION || pkg.version).replace(/^v/, '');

// Pin the NW.js runtime to the same version as the dev SDK (`nw` devDep), normal flavor.
const nwVersion = (pkg.devDependencies.nw || '').replace(/-sdk$|-nacl$/, '') || 'latest';

// The node-only libs Vite leaves un-bundled (see vite.config.ts NODE_ONLY) — these
// must exist as real modules in the shipped app. Pin to the exact installed versions.
const RUNTIME_DEPS = ['simple-git', 'gray-matter', 'papaparse'];
const installedVersion = (name) =>
  JSON.parse(readFileSync(join(desktopRoot, 'node_modules', name, 'package.json'), 'utf8')).version;

if (!existsSync(join(distDir, 'index.html'))) {
  console.error('✗ dist/index.html not found — run `vite build` first (use `pnpm package:mac`).');
  process.exit(1);
}

if (process.platform !== 'darwin') {
  console.error('✗ `package:mac` must run on macOS (it uses sips/iconutil/codesign/ditto).');
  process.exit(1);
}

// ── 1. icon ─────────────────────────────────────────────────────────────────
// Build the standard .iconset ladder from the high-resolution mascot, then let
// iconutil assemble it. Sizes follow Apple's required naming scheme.
const ICONSET = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png'],
];
const iconsetDir = join(buildDir, 'icon.iconset');
rmSync(iconsetDir, { recursive: true, force: true });
mkdirSync(iconsetDir, { recursive: true });
for (const [size, name] of ICONSET) {
  const sips = spawnSync('sips', ['-z', String(size), String(size), mascotPath, '--out', join(iconsetDir, name)]);
  if (sips.status !== 0) {
    console.error(`✗ sips failed for ${name}`);
    process.exit(sips.status ?? 1);
  }
}
const iconutil = spawnSync('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsPath], { stdio: 'inherit' });
if (iconutil.status !== 0) {
  console.error('✗ iconutil failed');
  process.exit(iconutil.status ?? 1);
}
console.log(`  ✓ generated ${icnsPath}`);

console.log(`\n▶ Packaging Choko ${version} (NW.js ${nwVersion}, osx-arm64)\n`);

// ── 2. stage ────────────────────────────────────────────────────────────────
rmSync(stagingDir, { recursive: true, force: true });
rmSync(outDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });

const manifest = {
  name: 'choko',
  productName: 'Choko',
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
cpSync(licensePath, join(stagingDir, 'LICENSE'));
// Local font binaries are bundled by Vite; ship their original OFL notices with the app.
const fontLicenseDir = join(stagingDir, 'licenses', 'fonts');
mkdirSync(fontLicenseDir, { recursive: true });
for (const family of ['onest', 'rubik', 'nunitosans', 'ibmplexmono']) {
  const name = `${family}-OFL.txt`;
  cpSync(join(desktopRoot, '..', '..', 'packages', 'brand', 'fonts', name), join(fontLicenseDir, name));
}
// Ship the PNG referenced by window.icon.
mkdirSync(join(stagingDir, 'build-resources'), { recursive: true });
cpSync(join(desktopRoot, 'build-resources', 'icon.png'), join(stagingDir, 'build-resources', 'icon.png'));
console.log('  ✓ staged manifest + dist + icon');

// ── 3. install runtime node_modules (flat, prod-only) ────────────────────────
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

// ── 4. nw-builder ────────────────────────────────────────────────────────────
const year = new Date().getFullYear();
await nwbuild({
  mode: 'build',
  flavor: 'normal',
  platform: 'osx',
  arch: 'arm64',
  version: nwVersion,
  srcDir: stagingDir,
  glob: false,
  managedManifest: false,
  cacheDir,
  outDir,
  zip: false,
  logLevel: 'info',
  // Allow an offline/local manifest and mirror (CI or a pre-seeded .nwcache).
  manifestUrl: process.env.NWJS_MANIFEST_URL || 'https://nwjs.io/versions.json',
  downloadUrl: process.env.NWJS_DOWNLOAD_URL || 'https://dl.nwjs.io',
  shaSum: process.env.NWJS_SHASUM !== 'false',
  app: {
    name: 'Choko',
    icon: icnsPath,
    LSApplicationCategoryType: 'public.app-category.developer-tools',
    CFBundleIdentifier: 'app.choko.desktop',
    CFBundleName: 'Choko',
    CFBundleDisplayName: 'Choko',
    CFBundleSpokenName: 'Choko',
    CFBundleVersion: version,
    CFBundleShortVersionString: version,
    NSHumanReadableCopyright: `© ${year} Jim Buck and Choko contributors`,
  },
});

const appPath = join(outDir, 'Choko.app');
if (!existsSync(appPath)) {
  console.error(`✗ nw-builder did not produce ${appPath}`);
  process.exit(1);
}
console.log(`  ✓ built ${appPath}`);

// ── 5. GUI PATH ──────────────────────────────────────────────────────────────
// Apps opened through LaunchServices inherit a minimal PATH
// (/usr/bin:/bin:/usr/sbin:/sbin), so a Homebrew/nvm Node is invisible to the
// automation runner even though the terminal finds it. LSEnvironment adds the
// build machine's Node directories (plus the usual package-manager bins) to the
// bundle only — the system-wide launchd environment is left untouched.
const infoPlist = join(appPath, 'Contents', 'Info.plist');
const nodeDirs = new Set([
  dirname(process.execPath),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
]);
// .../Cellar/<formula>/<version>/bin/node → .../opt/<formula>/bin (stable across upgrades).
const cellar = process.execPath.match(/^(.*)\/Cellar\/([^/]+)\/[^/]+\/bin\/node$/);
if (cellar) nodeDirs.add(`${cellar[1]}/opt/${cellar[2]}/bin`);
const guiPath = [...nodeDirs].filter(Boolean).join(':');
// Never replace the whole dict: the NW.js runtime already ships
// LSEnvironment.MallocNanoZone=0, which Chromium expects on macOS.
spawnSync('/usr/libexec/PlistBuddy', ['-c', 'Add :LSEnvironment dict', infoPlist]);
let setPath = spawnSync('/usr/libexec/PlistBuddy', ['-c', `Set :LSEnvironment:PATH ${guiPath}`, infoPlist]);
if (setPath.status !== 0) {
  setPath = spawnSync('/usr/libexec/PlistBuddy', ['-c', `Add :LSEnvironment:PATH string ${guiPath}`, infoPlist], {
    stdio: 'inherit',
  });
}
if (setPath.status !== 0) {
  console.error('✗ could not add PATH to LSEnvironment in Info.plist');
  process.exit(setPath.status ?? 1);
}
console.log(`  ✓ GUI PATH: ${guiPath}`);

// ── 6. ad-hoc signature ──────────────────────────────────────────────────────
// Renaming the NW.js helpers and rewriting Info.plist breaks the runtime's own
// signature; arm64 macOS refuses to launch a bundle with a broken signature.
const sign = spawnSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
if (sign.status !== 0) {
  console.error('✗ ad-hoc codesign failed');
  process.exit(sign.status ?? 1);
}
const verify = spawnSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
if (verify.status !== 0) {
  console.error('✗ signature verification failed');
  process.exit(verify.status ?? 1);
}
console.log('  ✓ ad-hoc signed and verified');

// ── 7. portable zip ──────────────────────────────────────────────────────────
const zipPath = join(buildDir, `Choko-${version}-mac-arm64.zip`);
rmSync(zipPath, { force: true });
const ditto = spawnSync('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', appPath, zipPath], {
  stdio: 'inherit',
});
if (ditto.status !== 0) {
  console.error('✗ ditto failed');
  process.exit(ditto.status ?? 1);
}
console.log(`  ✓ wrote ${zipPath}`);

console.log(`\n✓ Packaging complete:\n    ${appPath}\n    ${zipPath}\n`);
