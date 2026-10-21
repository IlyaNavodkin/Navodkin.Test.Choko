import { z } from 'zod';

/**
 * `chioko.yaml` at a workspace root — its presence declares the folder a
 * workspace (PRD §4 req 6, 12). `name` and `displayIdPrefix` are required, but
 * parsing stays tolerant: a missing/blank value coerces to a default here and the
 * repo service emits a lint warning (req 13). The UI enforces non-blank on save
 * (req 15). There is no `runsDir` — runs are centralized in `.ch/runs/`.
 */
export const WorkspaceYamlSchema = z.looseObject({
  name: z.coerce.string().default(''),
  description: z.coerce.string().optional(),
  displayIdPrefix: z.coerce.string().default(''),
});

export type WorkspaceYaml = z.infer<typeof WorkspaceYamlSchema>;
