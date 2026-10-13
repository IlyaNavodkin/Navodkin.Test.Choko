import { z } from 'zod';

/**
 * `.casewright/config.yaml` — the repo-wide config and the single source of truth for
 * which folders are workspaces (`workspaces:` — a list of repo-relative paths, `.` = the
 * repo root). Parsing is tolerant: unknown keys are accepted and a malformed file coerces
 * to these defaults with a lint warning rather than failing the open. `displayIdPrefix`
 * and `description` carry the *root* workspace's metadata (the root has no parent dir for
 * a sibling folder note, so it lives here instead).
 */
export const ConfigYamlSchema = z.looseObject({
  version: z.coerce.number().int().catch(1).default(1),
  name: z.coerce.string().optional(),
  workspaces: z.array(z.coerce.string()).catch([]).default([]),
  displayIdPrefix: z.coerce.string().optional(),
  description: z.coerce.string().optional(),
});

export type ConfigYaml = z.infer<typeof ConfigYamlSchema>;
