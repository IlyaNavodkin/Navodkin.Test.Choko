import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const scriptUrl = import.meta.url;
const desktopRoot = fileURLToPath(new URL('../', scriptUrl));
process.env.PLAYWRIGHT_BROWSERS_PATH = fileURLToPath(new URL('../../../.cache/playwright', scriptUrl));

const require = createRequire(scriptUrl);
const cliPath = require.resolve('@playwright/test/cli');
const typecheckPath = require.resolve('typescript/bin/tsc');
const vitePath = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', scriptUrl));

function runNode(entry, args, label) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [entry, ...args], {
      cwd: desktopRoot,
      env: process.env,
      stdio: 'inherit',
    });
    child.once('error', (error) => {
      process.stderr.write(`Не удалось запустить ${label}: ${error.message}\n`);
      resolve(1);
    });
    child.once('close', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

async function waitForPreview(server) {
  const deadline = Date.now() + 30_000;
  let launchError;
  server.once('error', (error) => { launchError = error; });
  while (Date.now() < deadline) {
    if (launchError) throw launchError;
    if (server.exitCode !== null) throw new Error(`Vite preview exited early with code ${server.exitCode}.`);
    try {
      const response = await fetch('http://127.0.0.1:4175/', { signal: AbortSignal.timeout(1_000) });
      if (response.ok) {
        await response.body?.cancel();
        return;
      }
    } catch {
      // The preview has not bound its local port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the local Vite preview on port 4175.');
}

async function ensurePreviewPortAvailable() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(4175, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) => {
    probe.close((error) => error ? reject(error) : resolve());
  });
}

async function stopPreview(server) {
  if (server.pid === undefined || server.exitCode !== null) return;
  await new Promise((resolve) => {
    server.once('close', resolve);
    server.kill();
  });
}

if (process.argv[2] === 'install') {
  process.exitCode = await runNode(cliPath, process.argv.slice(2), 'Playwright');
} else {
  const typecheckCode = await runNode(typecheckPath, ['--noEmit'], 'TypeScript');
  if (typecheckCode !== 0) process.exitCode = typecheckCode;
  else {
    const browserTypecheckCode = await runNode(typecheckPath, ['--project', 'tsconfig.browser.json'], 'browser TypeScript');
    if (browserTypecheckCode !== 0) process.exitCode = browserTypecheckCode;
    else {
      const buildCode = await runNode(vitePath, ['build'], 'Vite build');
      if (buildCode !== 0) process.exitCode = buildCode;
      else {
        try {
          await ensurePreviewPortAvailable();
        } catch {
          process.stderr.write('Порт 4175 уже занят; browser preview не будет подключаться к чужому серверу.\n');
          process.exitCode = 1;
          process.stdin.pause();
        }
        if (process.exitCode === undefined) {
          const preview = spawn(process.execPath, [vitePath, 'preview', '--host', '127.0.0.1', '--port', '4175', '--strictPort'], {
            cwd: desktopRoot,
            env: process.env,
            stdio: 'inherit',
          });
          try {
            await waitForPreview(preview);
            process.exitCode = await runNode(cliPath, process.argv.slice(2), 'Playwright');
          } catch (error) {
            process.stderr.write(`Ошибка browser preview: ${error instanceof Error ? error.message : 'неизвестная ошибка'}\n`);
            process.exitCode = 1;
          } finally {
            await stopPreview(preview);
            process.stdin.pause();
          }
        }
      }
    }
  }
}
