import { Button, Checkbox, Input, Select, Textarea } from '@codaa/ui';
import { at } from './messages';
import type { ArgumentDefinition, ArgumentOverridesDraft, ArgumentRow, EnvironmentEntry, PrimitiveValue } from './types';
import { emptyArgumentRow } from './usePreviewAutomation';
import styles from './AutomationWorkspace.module.css';

const types = ['string', 'number', 'boolean', 'enum'] as const;

export function DefinitionsEditor({ rows, disabled, onChange }: { rows: ArgumentRow[]; disabled: boolean; onChange: (rows: ArgumentRow[]) => void }) {
  const patch = (index: number, values: Partial<ArgumentRow>) => onChange(rows.map((row, position) => (position === index ? { ...row, ...values } : row)));
  return <div className={styles.definitions}>
    {rows.map((row, index) => <div className={styles.definitionRow} key={index}>
      <label>{at('key')}<Input size="sm" aria-label={`${at('key')} ${index + 1}`} value={row.key} disabled={disabled} onChange={(event) => patch(index, { key: event.target.value })} /></label>
      <label>{at('label')}<Input size="sm" aria-label={`${at('label')} ${index + 1}`} value={row.label} disabled={disabled} onChange={(event) => patch(index, { label: event.target.value })} /></label>
      <label>{at('type')}<Select size="sm" aria-label={`${at('type')} ${index + 1}`} value={row.type} disabled={disabled} options={types.map((value) => ({ value, label: at(value) }))} onValueChange={(value) => patch(index, { type: value as ArgumentRow['type'] })} /></label>
      {row.type === 'string' && <label>{at('format')}<Select size="sm" aria-label={`${at('format')} ${index + 1}`} value={row.format} disabled={disabled} options={[{ value: '', label: at('none') }, { value: 'url', label: at('url') }, { value: 'ip', label: at('ip') }]} onValueChange={(value) => patch(index, { format: value as ArgumentRow['format'] })} /></label>}
      {row.type === 'enum' && <label>{at('options')}<Input size="sm" aria-label={`${at('options')} ${index + 1}`} value={row.options} disabled={disabled} placeholder="chromium, firefox" onChange={(event) => patch(index, { options: event.target.value })} /></label>}
      {row.type === 'number' && <><label>{at('min')}<Input size="sm" aria-label={`${at('min')} ${index + 1}`} value={row.min} disabled={disabled} onChange={(event) => patch(index, { min: event.target.value })} /></label><label>{at('max')}<Input size="sm" aria-label={`${at('max')} ${index + 1}`} value={row.max} disabled={disabled} onChange={(event) => patch(index, { max: event.target.value })} /></label></>}
      <label>{at('defaultValue')}<Input size="sm" aria-label={`${at('defaultValue')} ${index + 1}`} value={row.defaultValue} disabled={disabled} onChange={(event) => patch(index, { defaultValue: event.target.value })} /></label>
      <label>{at('description')}<Textarea rows={2} aria-label={`${at('description')} ${index + 1}`} value={row.description} disabled={disabled} onChange={(event) => patch(index, { description: event.target.value })} /></label>
      <div className={styles.definitionActions}><Checkbox checked={row.required} disabled={disabled} onCheckedChange={(checked) => patch(index, { required: checked })}>{at('required')}</Checkbox><Button size="sm" variant="ghost" disabled={disabled} onClick={() => onChange(rows.filter((_, position) => position !== index))}>{at('removeArgument')}</Button></div>
    </div>)}
    <Button size="sm" disabled={disabled} onClick={() => onChange([...rows, emptyArgumentRow()])}>{at('addArgument')}</Button>
  </div>;
}

/** Overrides keep the layered reference semantics: a literal value and an environment reference are different things. */
export function OverridesEditor({ definitions, environments, draft, disabled, onChange }: { definitions: ArgumentDefinition[]; environments: EnvironmentEntry[]; draft: ArgumentOverridesDraft; disabled: boolean; onChange: (draft: ArgumentOverridesDraft) => void }) {
  if (!definitions.length) return <p className={styles.muted}>{at('noIssues')}</p>;
  const patch = (key: string, values: Partial<ArgumentOverridesDraft[string]>) => onChange({ ...draft, [key]: { ...(draft[key] ?? { source: 'inherit', literal: '', entryId: '', key: '' }), ...values } });
  return <div className={styles.overrides}>
    {definitions.map((definition) => {
      const row = draft[definition.key] ?? { source: 'inherit' as const, literal: '', entryId: '', key: '' };
      const environment = environments.find((entry) => entry.id === row.entryId);
      const value: PrimitiveValue | undefined = environment ? environment.values[row.key] : undefined;
      return <div className={styles.overrideRow} key={definition.key}>
        <div className={styles.overrideKey}><code>{definition.key}</code><small>{definition.label} · {at(definition.type)}{definition.required ? ` · ${at('required')}` : ''}</small></div>
        <Select size="sm" aria-label={`${at('overrides')} ${definition.key}`} value={row.source} disabled={disabled} options={[{ value: 'inherit', label: at('inherit') }, { value: 'literal', label: at('literal') }, { value: 'environment', label: at('environment') }]} onValueChange={(source) => patch(definition.key, { source: source as 'inherit' | 'literal' | 'environment' })} />
        {row.source === 'literal' && <Input size="sm" aria-label={`${definition.key} ${at('literal')}`} value={row.literal} disabled={disabled} onChange={(event) => patch(definition.key, { literal: event.target.value })} />}
        {row.source === 'environment' && <>
          <Select size="sm" aria-label={`${at('environmentEntry')} ${definition.key}`} value={row.entryId} disabled={disabled} options={[{ value: '', label: environments.length ? at('environmentEntry') : at('noEnvironment') }, ...environments.map((entry) => ({ value: entry.id, label: `${entry.title} · ${entry.revision}${entry.archived ? ` · ${at('archivedLabel')}` : ''}` }))]} onValueChange={(entryId) => patch(definition.key, { entryId, key: '' })} />
          <Select size="sm" aria-label={`${at('environmentKey')} ${definition.key}`} value={row.key} disabled={disabled || !environment} options={[{ value: '', label: at('environmentKey') }, ...Object.keys(environment?.values ?? {}).map((key) => ({ value: key, label: key }))]} onValueChange={(key) => patch(definition.key, { key })} />
          <small className={styles.overrideValue}>{value === undefined ? at('ENVIRONMENT_UNAVAILABLE') : `${at('value')}: ${String(value)}`}</small>
        </>}
      </div>;
    })}
  </div>;
}
