// Dev launcher: start the Vite dev server (with HMR), then open the app in NW.js
// pointed at the dev server URL. NW.js loads a tiny generated manifest in .nwdev/
// whose `main` is the Vite URL, so we get hot reload inside the real desktop window.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = dirname(dirname(fileURLToPath(import.meta.url))); // apps/desktop

const server = await createServer({ root, configFile: join(root, 'vite.config.ts') });
await server.listen();
server.printUrls();

const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5173/';

// Generate a dev manifest that points NW.js at the Vite dev server.
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const devDir = join(root, '.nwdev');
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
      name: 'casewright-dev',
      main: url,
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
const nw = spawn('nw', [devDir], { stdio: 'inherit', shell: true });

const shutdown = async (code = 0) => {
  await server.close().catch(() => {});
  process.exit(code);
};
nw.on('exit', (code) => shutdown(code ?? 0));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
