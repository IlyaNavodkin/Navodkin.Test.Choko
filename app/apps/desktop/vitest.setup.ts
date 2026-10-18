import { createRequire } from 'node:module';

// The format layer pulls gray-matter / papaparse through src/lib/node.ts's runtime
// `require` bridge. In NW.js that's `globalThis.require`; under Vitest (plain Node
// ESM) we synthesize one so the same code path resolves modules from node_modules.
const g = globalThis as { require?: NodeRequire };
if (typeof g.require !== 'function') {
  g.require = createRequire(import.meta.url);
}
