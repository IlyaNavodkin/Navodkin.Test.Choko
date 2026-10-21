import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    // pnpm's CLI shim exposes every hoisted dependency through NODE_PATH. Autotest
    // resolver tests must see only their temporary project's own dependencies.
    env: { NODE_PATH: '' },
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'scripts/**/*.test.mjs'],
    css: { include: /\.css(?:\?|$)/ },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
