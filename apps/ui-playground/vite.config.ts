import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  preview: { host: '127.0.0.1', port: 4174, strictPort: true },
  test: { environment: 'jsdom', include: ['tests/**/*.spec.{ts,tsx}'], restoreMocks: true },
});
