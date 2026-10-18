import { z } from 'zod';
import { IdSchema } from './contracts';

export const ARGUMENT_LIMITS = Object.freeze({ count: 100, key: 64, value: 4096, payloadBytes: 64 * 1024 });
export const RevisionSchema = z.string().min(1).max(128);
export const ArgumentKeySchema = z.string().min(1).max(64).refine(key => !['__proto__', 'prototype', 'constructor'].includes(key) && !/[\x00-\x1f\x7f]/u.test(key));
export const PrimitiveValueSchema = z.union([z.string().max(4096), z.number().finite(), z.boolean()]);
export type PrimitiveValue = z.infer<typeof PrimitiveValueSchema>;
export const EnvironmentReferenceSchema = z.object({ kind: z.literal('environment'), entryId: z.string().uuid(), key: ArgumentKeySchema }).strict();
export type EnvironmentReference = z.infer<typeof EnvironmentReferenceSchema>;
export const ArgumentValueSchema = z.union([z.object({ kind: z.literal('literal'), value: PrimitiveValueSchema }).strict(), EnvironmentReferenceSchema]);
export type ArgumentValue = z.infer<typeof ArgumentValueSchema>;

// Validate own keys before the record parser can discard a special key.
function dictionary<T extends z.ZodTypeAny>(value: T) {
  return z.unknown().superRefine((input, context) => {
    if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input) as object | null)
      || Object.keys(input).length > 100 || Object.keys(input).some(key => !ArgumentKeySchema.safeParse(key).success)) context.addIssue({ code: 'custom', message: 'INVALID_ARGUMENT_KEYS' });
  }).pipe(z.record(value)).superRefine((input, context) => {
    if (new TextEncoder().encode(JSON.stringify(input)).length > ARGUMENT_LIMITS.payloadBytes) context.addIssue({ code: 'custom', message: 'ARGUMENT_PAYLOAD_LIMIT' });
  });
}
export const ArgumentValuesSchema = dictionary(ArgumentValueSchema);
export const EnvironmentValuesSchema = dictionary(PrimitiveValueSchema);
export const EnvironmentEntrySchema = z.object({ id: z.string().uuid(), kind: z.literal('environment'), title: z.string().min(1).max(200), description: z.string().max(4096), archived: z.boolean(), revision: RevisionSchema, values: EnvironmentValuesSchema }).strict();
export type EnvironmentEntry = z.infer<typeof EnvironmentEntrySchema>;

const definitionBase = { key: ArgumentKeySchema, label: z.string().min(1).max(200), description: z.string().max(4096), required: z.boolean() };
export const ArgumentDefinitionSchema = z.discriminatedUnion('type', [
  z.object({ ...definitionBase, type: z.literal('string'), format: z.enum(['url', 'ip']).optional(), default: z.string().max(4096).optional() }).strict(),
  z.object({ ...definitionBase, type: z.literal('number'), min: z.number().finite().optional(), max: z.number().finite().optional(), default: z.number().finite().optional() }).strict(),
  z.object({ ...definitionBase, type: z.literal('boolean'), default: z.boolean().optional() }).strict(),
  z.object({ ...definitionBase, type: z.literal('enum'), options: z.array(z.string().max(4096)).min(1).max(100).refine(items => new Set(items).size === items.length), default: z.string().max(4096).optional() }).strict(),
]).superRefine((definition, context) => {
  if ((definition.type === 'number' && definition.min !== undefined && definition.max !== undefined && definition.min > definition.max)
    || (definition.default !== undefined && !validArgument(definition, definition.default))) context.addIssue({ code: 'custom', message: 'INVALID_DEFINITION' });
});
export type ArgumentDefinition = z.infer<typeof ArgumentDefinitionSchema>;
export const AutotestSelectorSchema = z.object({ automationId: IdSchema, project: IdSchema, variantId: IdSchema }).strict();
export const AutotestSchema = z.object({ schemaVersion: z.literal(2), id: z.string().uuid(), title: z.string().trim().min(1).max(200), description: z.string().max(4096), archived: z.boolean(), revision: RevisionSchema, profileId: IdSchema, selector: AutotestSelectorSchema,
  argumentDefinitions: z.array(ArgumentDefinitionSchema).max(100).refine(items => new Set(items.map(item => item.key)).size === items.length), defaults: ArgumentValuesSchema,
}).strict().superRefine((test, context) => {
  for (const [key, input] of Object.entries(test.defaults)) {
    const definition = test.argumentDefinitions.find(item => item.key === key);
    if (!definition || (input.kind === 'literal' && !validArgument(definition, input.value))) context.addIssue({ code: 'custom', path: ['defaults', key], message: 'INVALID_ARGUMENT' });
  }
});
export type Autotest = z.infer<typeof AutotestSchema>;
export const CaseAutotestBindingSchema = z.object({ schemaVersion: z.literal(2), id: z.string().uuid(), caseId: IdSchema, autotestId: z.string().uuid(), revision: RevisionSchema, enabled: z.boolean(), argumentOverrides: ArgumentValuesSchema }).strict();
export type CaseAutotestBinding = z.infer<typeof CaseAutotestBindingSchema>;

export function validArgument(definition: ArgumentDefinition, value: PrimitiveValue): boolean {
  switch (definition.type) {
    case 'boolean': return typeof value === 'boolean';
    case 'number': return typeof value === 'number' && Number.isFinite(value) && (definition.min === undefined || value >= definition.min) && (definition.max === undefined || value <= definition.max);
    case 'enum': return typeof value === 'string' && definition.options.includes(value);
    case 'string': {
      if (typeof value !== 'string' || value.length > 4096) return false;
      if (definition.format === 'ip') return z.string().ip().safeParse(value).success;
      if (definition.format === 'url') {
        try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname) && !url.username && !url.password; } catch { return false; }
      }
      return true;
    }
  }
}

const ArgumentSourceSchema = z.object({ key: ArgumentKeySchema, layer: z.enum(['schema', 'autotest', 'binding', 'run']), reference: EnvironmentReferenceSchema.nullable(), revision: RevisionSchema.nullable() }).strict();
const ResolvedArgumentsSchema = dictionary(PrimitiveValueSchema);
export const InvocationSnapshotSchema = z.object({ schemaVersion: z.literal(2), invocationId: z.string().uuid(), createdAt: z.string().datetime(), caseRevision: RevisionSchema, autotest: AutotestSchema, binding: CaseAutotestBindingSchema, runOverrides: ArgumentValuesSchema,
  environments: z.array(EnvironmentEntrySchema).max(100).refine(items => new Set(items.map(item => item.id)).size === items.length), resolvedArguments: ResolvedArgumentsSchema, sources: z.array(ArgumentSourceSchema).max(100),
}).strict();
export type InvocationSnapshot = z.infer<typeof InvocationSnapshotSchema>;
export type ArgumentResolutionIssue = { code: 'INVALID_INPUT' | 'UNAVAILABLE' | 'UNKNOWN_ARGUMENT' | 'REQUIRED' | 'INVALID_VALUE' | 'ENVIRONMENT_UNAVAILABLE' | 'PAYLOAD_LIMIT' | 'STALE'; key?: string };
export type ResolutionResult<T> = { ok: true; value: T } | { ok: false; issues: ArgumentResolutionIssue[] };
const InvocationInputSchema = z.object({ invocationId: z.string().uuid(), createdAt: z.string().datetime(), caseRevision: RevisionSchema, autotest: AutotestSchema, binding: CaseAutotestBindingSchema, runOverrides: ArgumentValuesSchema, environments: z.array(EnvironmentEntrySchema).max(100).refine(items => new Set(items.map(item => item.id)).size === items.length) }).strict();
export type InvocationInput = z.infer<typeof InvocationInputSchema>;

export function createInvocationSnapshot(input: unknown): ResolutionResult<InvocationSnapshot> {
  const parsed = InvocationInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: [{ code: 'INVALID_INPUT' }] };
  const data = parsed.data;
  if (data.autotest.archived || !data.binding.enabled || data.binding.autotestId !== data.autotest.id) return { ok: false, issues: [{ code: 'UNAVAILABLE' }] };
  const issues: ArgumentResolutionIssue[] = [];
  const values = new Map<string, { input: ArgumentValue; layer: 'schema' | 'autotest' | 'binding' | 'run' }>();
  for (const definition of data.autotest.argumentDefinitions) if (definition.default !== undefined) values.set(definition.key, { input: { kind: 'literal', value: definition.default }, layer: 'schema' });
  for (const [layer, overrides] of [['autotest', data.autotest.defaults], ['binding', data.binding.argumentOverrides], ['run', data.runOverrides]] as const) {
    for (const [key, value] of Object.entries(overrides)) {
      if (!data.autotest.argumentDefinitions.some(definition => definition.key === key)) issues.push({ code: 'UNKNOWN_ARGUMENT', key });
      values.set(key, { input: value, layer });
    }
  }
  const resolvedArguments: Record<string, PrimitiveValue> = Object.create(null) as Record<string, PrimitiveValue>;
  const sources: InvocationSnapshot['sources'] = [];
  const environments = new Map<string, EnvironmentEntry>();
  for (const definition of data.autotest.argumentDefinitions) {
    const selected = values.get(definition.key);
    if (!selected) { if (definition.required) issues.push({ code: 'REQUIRED', key: definition.key }); continue; }
    let value: PrimitiveValue;
    let reference: EnvironmentReference | null = null;
    let revision: string | null = null;
    if (selected.input.kind === 'environment') {
      reference = selected.input;
      const environment = data.environments.find(entry => entry.id === reference?.entryId);
      if (!environment || environment.archived || !Object.hasOwn(environment.values, reference.key)) { issues.push({ code: 'ENVIRONMENT_UNAVAILABLE', key: definition.key }); continue; }
      value = environment.values[reference.key]!; revision = environment.revision; environments.set(environment.id, environment);
    } else value = selected.input.value;
    if (!validArgument(definition, value)) { issues.push({ code: 'INVALID_VALUE', key: definition.key }); continue; }
    resolvedArguments[definition.key] = value;
    sources.push({ key: definition.key, layer: selected.layer, reference, revision });
  }
  if (!ResolvedArgumentsSchema.safeParse(resolvedArguments).success) issues.push({ code: 'PAYLOAD_LIMIT' });
  if (issues.length) return { ok: false, issues };
  const snapshot = InvocationSnapshotSchema.parse({ schemaVersion: 2, invocationId: data.invocationId, createdAt: data.createdAt, caseRevision: data.caseRevision, autotest: data.autotest, binding: data.binding, runOverrides: data.runOverrides, environments: [...environments.values()], resolvedArguments, sources });
  return { ok: true, value: deepFreeze(snapshot) };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); }
  return value;
}

/** Source content is checked too: a forged unchanged revision cannot reuse a preview. */
export function validateInvocationPreview(snapshot: InvocationSnapshot, current: InvocationInput): ResolutionResult<InvocationSnapshot> {
  const refreshed = createInvocationSnapshot(current);
  if (!refreshed.ok) return refreshed;
  return JSON.stringify(snapshot) === JSON.stringify(refreshed.value) ? refreshed : { ok: false, issues: [{ code: 'STALE' }] };
}

export const AutomationCatalogSchema = z.object({ schemaVersion: z.literal(2), autotests: z.array(AutotestSchema).max(10_000), bindings: z.array(CaseAutotestBindingSchema).max(10_000) }).strict().superRefine((catalog, context) => {
  const ids = new Set<string>(); const bindingKeys = new Set<string>();
  for (const test of catalog.autotests) { if (ids.has(test.id)) context.addIssue({ code: 'custom', message: 'DUPLICATE_AUTOTEST' }); ids.add(test.id); }
  const bindingIds = new Set<string>();
  for (const binding of catalog.bindings) {
    const key = JSON.stringify([binding.caseId, binding.autotestId, Object.entries(binding.argumentOverrides).sort(([a], [b]) => a.localeCompare(b))]);
    if (bindingIds.has(binding.id) || bindingKeys.has(key) || !ids.has(binding.autotestId)) context.addIssue({ code: 'custom', message: 'INVALID_BINDING' });
    bindingIds.add(binding.id); bindingKeys.add(key);
  }
});
