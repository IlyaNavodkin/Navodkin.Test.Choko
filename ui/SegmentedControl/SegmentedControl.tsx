'use client';

import { useRef, type KeyboardEvent, type ReactElement, type ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import styles from './SegmentedControl.module.css';

export type SegmentedOption<TValue extends string = string> = {
  value: TValue;
  label?: ReactNode;
  icon?: ReactNode;
  title?: string;
  disabled?: boolean;
};

export type SegmentedControlProps<TValue extends string = string> = {
  options: readonly SegmentedOption<TValue>[];
  value: TValue;
  onValueChange: (value: TValue) => void;
  size?: 'sm' | 'md';
  stretch?: boolean;
  className?: string;
  'aria-label'?: string;
};

/**
 * Single-choice icon/label switch with radio semantics and a roving tab stop.
 * It shares the visual language of `FilterChipGroup` but stays a distinct
 * component: a chip group filters, this one picks exactly one value.
 */
export function SegmentedControl<TValue extends string = string>({
  'aria-label': ariaLabel,
  className = '',
  onValueChange,
  options,
  size = 'sm',
  stretch = false,
  value,
}: SegmentedControlProps<TValue>): ReactElement {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const moveSelection = (fromIndex: number, direction: 1 | -1) => {
    if (!options.length) return;
    for (let step = 1; step <= options.length; step += 1) {
      const nextIndex = (fromIndex + direction * step + options.length) % options.length;
      const next = options[nextIndex];
      if (!next.disabled) {
        optionRefs.current[nextIndex]?.focus();
        onValueChange(next.value);
        return;
      }
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const direction =
      event.key === 'ArrowRight' || event.key === 'ArrowDown'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowUp'
          ? -1
          : 0;
    if (!direction) return;

    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    moveSelection(index < 0 ? options.length - 1 : index, direction);
  };

  return (
    <div
      aria-label={ariaLabel}
      className={cn(styles.root, styles[`size-${size}`], stretch && styles.stretch, className)}
      role="radiogroup"
      onKeyDown={handleKeyDown}
    >
      {options.map((option, index) => {
        const selected = option.value === value;

        return (
          <button
            key={option.value}
            ref={(node) => {
              optionRefs.current[index] = node;
            }}
            aria-checked={selected}
            className={cn(styles.option, selected && styles.selected)}
            disabled={option.disabled}
            role="radio"
            tabIndex={selected ? 0 : -1}
            title={option.title}
            type="button"
            onClick={() => onValueChange(option.value)}
          >
            {option.icon ? (
              <span aria-hidden="true" className={styles.icon}>
                {option.icon}
              </span>
            ) : null}
            {option.label !== undefined ? <span className={styles.label}>{option.label}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
