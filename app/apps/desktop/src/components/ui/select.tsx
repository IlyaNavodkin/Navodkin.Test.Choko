import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { I } from '@/components/icons';
import { cn } from '@/lib/utils';
import { controlBase } from './input';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  tone?: 'success' | 'warning' | 'muted';
}

export interface SelectProps extends Omit<ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>, 'children' | 'value' | 'defaultValue' | 'onChange' | 'name' | 'form' | 'type'> {
  options: readonly SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  size?: 'sm' | 'md';
}

const tones = { success: 'text-pass', warning: 'text-blocked', muted: 'text-ink-3' };
// Encode every value, including explicit "None" (empty string), without a reserved-value collision.
const encode = (value: string) => `option:${value}`;

/** Chioko's single-choice control. Radix owns focus, typeahead, keyboard and collision handling. */
export const Select = forwardRef<HTMLButtonElement, SelectProps>(function Select({
  options, value, onValueChange, placeholder = 'Choose…', size = 'md', className, disabled, ...props
}, ref) {
  const selected = options.find((option) => option.value === value);
  return <SelectPrimitive.Root value={selected ? encode(value) : ''} onValueChange={(next) => onValueChange(next.slice('option:'.length))} disabled={disabled}>
    <SelectPrimitive.Trigger
      ref={ref}
      {...props}
      title={props.title ?? selected?.label}
      className={cn(controlBase, 'inline-flex min-w-0 items-center justify-between gap-2 text-left font-ui font-medium disabled:cursor-not-allowed disabled:opacity-50 hover:border-accent-line data-[state=open]:border-accent data-[state=open]:shadow-[0_0_0_3px_var(--accent-soft)] aria-invalid:border-fail aria-invalid:focus:shadow-[0_0_0_3px_var(--fail-soft)]', size === 'sm' && 'h-7 w-auto px-2 py-1 text-[12px]', className)}
    >
      <span className="flex min-w-0 items-center gap-2">
        {selected?.tone && <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full bg-current', tones[selected.tone])} />}
        <span className={cn('truncate', selected?.tone && tones[selected.tone])}><SelectPrimitive.Value placeholder={placeholder}>{selected?.label}</SelectPrimitive.Value></span>
      </span>
      <SelectPrimitive.Icon className="shrink-0 text-ink-3">{I.chevronDown({ size: 14 })}</SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content position="popper" sideOffset={6} collisionPadding={8} className="chioko-select-content z-[80] flex flex-col overflow-hidden rounded-md border border-border-2 bg-panel font-ui text-[13px] text-ink shadow-[0_8px_24px_var(--shadow),0_2px_6px_var(--shadow)]">
        <SelectPrimitive.ScrollUpButton className="grid h-6 cursor-default place-items-center bg-panel text-ink-3"><span className="rotate-180">{I.chevronDown({ size: 14 })}</span></SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="min-h-0 flex-1 p-1">
          {options.map((option) => <SelectPrimitive.Item key={option.value} value={encode(option.value)} disabled={option.disabled} textValue={option.label}
            className="relative flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 pl-3 pr-8 outline-none data-[highlighted]:bg-accent-soft data-[highlighted]:text-accent-ink data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:opacity-45">
            {option.tone && <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full bg-current', tones[option.tone])} />}
            <SelectPrimitive.ItemText><span className="break-words [overflow-wrap:anywhere]">{option.label}</span></SelectPrimitive.ItemText>
            <SelectPrimitive.ItemIndicator className="absolute right-2 grid place-items-center text-accent" aria-hidden="true">{I.check({ size: 15 })}</SelectPrimitive.ItemIndicator>
          </SelectPrimitive.Item>)}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="grid h-6 cursor-default place-items-center bg-panel text-ink-3">{I.chevronDown({ size: 14 })}</SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  </SelectPrimitive.Root>;
});
