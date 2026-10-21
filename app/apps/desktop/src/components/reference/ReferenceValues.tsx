import { useState } from 'react';
import { I } from '@/components/icons';
import { Button, Input, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ARG_VALUE_TYPES, type ArgValue, type ArgValueType } from '@/schemas/reference-book';

export interface ReferenceValuesProps {
  values: ArgValue[];
  /** Identity of the record being edited — rows remount when it changes, re-seeding local text state. */
  recordId: string;
  disabled?: boolean;
  issueFor: (index: number) => string | null;
  onAdd: () => void;
  onEdit: (index: number, patch: Partial<ArgValue>) => void;
  onRemove: (index: number) => void;
}

const TYPE_LABEL: Record<ArgValueType, string> = {
  string: 'text',
  number: 'number',
  boolean: 'true/false',
  url: 'URL',
  enum: 'one of',
};

/**
 * A text input that keeps the user's exact keystrokes while committing a parsed value.
 * Without it a controlled input would fight the user on transient text ("3." → "3",
 * "dev, " → "dev") because the parsed model is what renders back.
 */
function DraftText({
  value,
  commit,
  className,
  ...rest
}: {
  value: string;
  commit: (text: string) => void;
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value);
  return (
    <Input
      {...rest}
      className={className}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value);
      }}
    />
  );
}

/** The value control, chosen by the declared type. Numbers keep the raw text until it parses. */
function ValueControl({
  row,
  disabled,
  onEdit,
}: {
  row: ArgValue;
  disabled?: boolean;
  onEdit: (patch: Partial<ArgValue>) => void;
}) {
  switch (row.type) {
    case 'boolean':
      return (
        <Select
          aria-label={`${row.key || 'Argument'} value`}
          disabled={disabled}
          value={row.value === true ? 'true' : 'false'}
          onValueChange={(value) => onEdit({ value: value === 'true' })}
          options={[{ value: 'true', label: 'true' }, { value: 'false', label: 'false' }]}
        />
      );
    case 'enum': {
      const options = (row.options ?? []).filter(Boolean);
      return (
        <Select aria-label={`${row.key || 'Argument'} value`} disabled={disabled} value={String(row.value ?? '')} onValueChange={(value) => onEdit({ value })}
          options={[{ value: '', label: options.length ? 'Choose…' : 'Add options first' }, ...options.map((o) => ({ value: o, label: o }))]} />
      );
    }
    case 'number':
      return (
        <DraftText
          key="number"
          value={typeof row.value === 'number' ? String(row.value) : ''}
          disabled={disabled}
          placeholder="0"
          className="font-mono"
          commit={(text) => {
            const n = Number(text);
            onEdit({ value: text.trim() !== '' && Number.isFinite(n) ? n : text });
          }}
        />
      );
    default:
      return (
        <Input
          disabled={disabled}
          className="font-mono"
          placeholder={row.type === 'url' ? 'https://…' : 'value'}
          value={String(row.value ?? '')}
          onChange={(e) => onEdit({ value: e.target.value })}
        />
      );
  }
}

/** The `key → typed value` rows of an `arguments` record, with the no-secrets reminder. */
export function ReferenceValues({ values, recordId, disabled, issueFor, onAdd, onEdit, onRemove }: ReferenceValuesProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2.5">
        <span className="grid place-items-center text-ink-3">{I.tag({ size: 15 })}</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-3">Values</span>
        <span className="font-mono text-[11px] text-ink-faint">{values.length}</span>
        <span className="flex-1" />
        <Button size="sm" variant="ghost" disabled={disabled} onClick={onAdd}>
          {I.plus({ size: 13 })} Add value
        </Button>
      </div>

      <div className="flex items-start gap-[7px] rounded-md border border-[oklch(0.85_0.06_80)] bg-blocked-soft px-2.5 py-[7px] text-[12px] text-[oklch(0.5_0.12_66)]">
        <span className="mt-px shrink-0">{I.warn({ size: 14 })}</span>
        <span>
          Never store passwords or tokens here — records live in the repository as plain text. Use the environment of the
          machine that runs the tests instead.
        </span>
      </div>

      {values.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-2 px-3 py-4 text-center text-[12.5px] text-ink-3">
          No values yet — add the keys consumers can reference.
        </div>
      ) : (
        values.map((row, i) => {
          const issue = issueFor(i);
          const bad = !!issue;
          return (
            <div key={`${recordId}:${i}`} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <Input
                  disabled={disabled}
                  className={cn('w-[150px] font-mono', bad && 'border-fail')}
                  placeholder="key"
                  value={row.key}
                  onChange={(e) => onEdit(i, { key: e.target.value })}
                />
                <Select
                  aria-label={`${row.key || 'Argument'} type`}
                  disabled={disabled}
                  className="w-[106px]"
                  value={row.type}
                  onValueChange={(value) => {
                    const type = value as ArgValueType;
                    // Switching type re-seeds the value so the row is never left in a foreign shape.
                    onEdit(i, { type, value: type === 'boolean' ? false : type === 'number' ? 0 : '', options: type === 'enum' ? (row.options ?? []) : undefined });
                  }}
                  options={ARG_VALUE_TYPES.map((t) => ({ value: t, label: TYPE_LABEL[t] }))}
                />
                <div className="min-w-0 flex-1">
                  <ValueControl row={row} disabled={disabled} onEdit={(patch) => onEdit(i, patch)} />
                </div>
                <Button size="sm" icon variant="ghost" disabled={disabled} title="Remove value" onClick={() => onRemove(i)}>
                  {I.trash({ size: 13 })}
                </Button>
              </div>
              {row.type === 'enum' && (
                <div className="flex items-center gap-1.5 pl-[3px]">
                  <span className="w-[70px] shrink-0 text-right font-mono text-[10.5px] text-ink-faint">options</span>
                  <div className="min-w-0 flex-1">
                    <DraftText
                      key="options"
                      value={(row.options ?? []).join(', ')}
                      disabled={disabled}
                      className="font-mono"
                      placeholder="dev, stage"
                      commit={(text) => onEdit(i, { options: text.split(',').map((o) => o.trim()) })}
                    />
                  </div>
                </div>
              )}
              {bad && <div className="pl-[154px] text-[11.5px] text-fail">{issue}</div>}
            </div>
          );
        })
      )}
    </div>
  );
}
