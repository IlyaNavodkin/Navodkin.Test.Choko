// Dev launcher: start the Vite dev server (with HMR), then open the app in NW.js
// pointed at the dev server URL. NW.js loads a tiny generated manifest in .nwdev/
// whose `main` is the Vite URL, so we get hot reload inside the real desktop window.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = dirname(dirname(fileURLToPath(import.meta.url))); // apps/desktop
const automation = process.argv.includes('--automation');

const server = await createServer({
  root, configFile: join(root, 'vite.config.ts'),
  ...(automation ? { server: { host: '127.0.0.1', port: 5174, strictPort: true } } : {}),
});
await server.listen();
server.printUrls();

const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5173/';

// Generate a dev manifest that points NW.js at the Vite dev server.
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const devDir = join(root, automation ? '.nwdev-automation' : '.nwdev');
mkdirSync(devDir, { recursive: true });

// NW.js resolves window.icon relative to the manifest's own dir (.nwdev) and errors on an
// absolute/out-of-tree path, so copy the icon in beside the dev manifest and reference it by name.
const win = { ...manifest.window };
const iconSrc = join(root, 'build-resources', 'icon.png');
if (existsSync(iconSrc)) {
  copyFileSync(iconSrc, join(devDir, 'icon.png'));
  win.icon = 'icon.png';
} else {
  delete win.icon;
}

writeFileSync(
  join(devDir, 'package.json'),
  JSON.stringify(
    {
      name: automation ? 'chioko-automation' : 'chioko-dev',
      main: automation ? `${url}?automation=1` : url,
      // `<all_urls>` so Node/`nw` is granted to BOTH the dev server URL (the main window) and
      // local file:// pages — the latter is the report preview window, opened from a temp
      // .html file (see run-report.ts), whose Save button needs `nw` to drive print-to-PDF.
      'node-remote': '<all_urls>',
      window: win,
    },
    null,
    2,
  ),
);

// `nw` resolves from node_modules/.bin (pnpm puts it on PATH for this script).
const args = automation ? [
  '--remote-debugging-port=9223',
  '--remote-debugging-address=127.0.0.1',
  `--user-data-dir=${join(devDir, 'profile')}`,
] : [];
const nw = spawn('nw', [devDir, ...args], { stdio: 'inherit', shell: true });

const shutdown = async (code = 0) => {
  await server.close().catch(() => {});
  process.exit(code);
};
nw.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
