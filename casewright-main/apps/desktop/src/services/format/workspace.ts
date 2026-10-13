import type { Workspace } from '@/types';

function needsQuote(s: string): boolean {
  if (s === '' || s !== s.trim()) return true;
  if (/:( |$)/.test(s) || /\s#/.test(s) || /^#/.test(s)) return true;
  if (/^[!&*?{}[\]|>@`"'%,\-]/.test(s)) return true;
  return false;
}

/** Quote a YAML scalar only when it would otherwise be ambiguous. Shared with `config.ts`. */
export const yamlScalar = (s: string): string => (needsQuote(s) ? JSON.stringify(s) : s);

/** Serialize the editable `casewright.yaml` fields (PRD §4 req 12). No `runsDir` — runs are centralized. */
export function serializeWorkspaceYaml(ws: Pick<Workspace, 'name' | 'description' | 'prefix'>): string {
  const lines = [`name: ${yamlScalar(ws.name)}`];
  if (ws.description.trim()) lines.push(`description: ${yamlScalar(ws.description)}`);
  lines.push(`displayIdPrefix: ${yamlScalar(ws.prefix)}`);
  return lines.join('\n') + '\n';
}
