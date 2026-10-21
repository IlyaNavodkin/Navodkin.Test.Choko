import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { migrateChiokoData } from '@/services/chioko-migration';

(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url);
const target = process.argv[2];
if (!target) throw new Error('Usage: pnpm migrate:chioko <repository-folder>');
const repoPath = resolve(target);
const migrated = await migrateChiokoData(repoPath);
console.log(migrated ? `Migrated data and references to ${repoPath}/.ch/` : 'No pending Chioko data migration.');
