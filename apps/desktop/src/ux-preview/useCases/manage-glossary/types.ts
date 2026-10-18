export const glossaryKinds = ['term', 'abbreviation', 'document', 'environment'] as const;
export type GlossaryKind = typeof glossaryKinds[number];
/** JSON primitives allowed as an environment value. */
export type EnvironmentPrimitive = string | number | boolean;
export type EnvironmentValues = Record<string, EnvironmentPrimitive>;
export type GlossaryDraft = { title: string; kind: GlossaryKind; aliases: string; description: string; url: string; values: string };
export type GlossaryEntry = Omit<GlossaryDraft, 'aliases' | 'values'> & {
  id: string; aliases: string[]; archived: boolean;
  /** Immutable revision of the stored entry; autotest invocations snapshot it. */
  revision: string;
  /** Present for `environment` entries: typed key/value pairs referenced by autotest arguments. */
  values?: EnvironmentValues;
};
export type GlossaryFilters = { search: string; kind: '' | GlossaryKind; archive: 'active' | 'archived' | 'all' };
