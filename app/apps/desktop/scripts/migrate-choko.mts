import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { migrateChokoData } from '@/services/choko-migration';

(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url);
const target = process.argv[2];
if (!target) throw new Error('Usage: pnpm migrate:choko <repository-folder>');
const repoPath = resolve(target);
const migrated = await migrateChokoData(repoPath);
console.log(migrated ? `Migrated data and references to ${repoPath}/.ch/` : 'No pending Choko data migration.');
