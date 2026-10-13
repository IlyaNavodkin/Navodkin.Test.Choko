import type { ConfigYaml } from '@/schemas';
import { yamlScalar } from './workspace';

/**
 * The `.casewright/.gitignore` body. Keeps transient subdirectories (at minimum
 * `cache/`) out of Git while `config.yaml` and `runs/` are committed (PRD §4 req 4, 5).
 */
export const CASEWRIGHT_GITIGNORE = `# Casewright transient data — safe to delete, never committed.\ncache/\n`;

/**
 * Serialize `.casewright/config.yaml`: repo-wide config plus the `workspaces:` list that
 * declares which folders are workspaces. `displayIdPrefix`/`description` carry the root
 * workspace's metadata when the root is itself a workspace.
 */
export function serializeConfigYaml(
  cfg: Pick<ConfigYaml, 'version' | 'name'> & {
    workspaces?: string[];
    displayIdPrefix?: string;
    description?: string;
  },
): string {
  const lines = [`version: ${cfg.version}`];
  if (cfg.name && cfg.name.trim()) lines.push(`name: ${yamlScalar(cfg.name)}`);
  if (cfg.displayIdPrefix && cfg.displayIdPrefix.trim()) lines.push(`displayIdPrefix: ${yamlScalar(cfg.displayIdPrefix.trim())}`);
  if (cfg.description && cfg.description.trim()) lines.push(`description: ${yamlScalar(cfg.description.trim())}`);
  const ws = cfg.workspaces ?? [];
  if (ws.length) {
    lines.push('workspaces:');
    for (const p of ws) lines.push(`  - ${yamlScalar(p)}`);
  }
  return lines.join('\n') + '\n';
}
