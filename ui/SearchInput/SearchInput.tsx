'use client';

import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Icon, IconNames } from '../Icon/Icon';
import { Input, type InputSize } from '../Input/Input';
import styles from './SearchInput.module.css';

export type SearchInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value' | 'size'
> & {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  debounceMs?: number;
  trailing?: ReactNode;
  /** Forwarded to `Input` — `xs` / `sm` are the thin controls of a dense toolbar. */
  size?: InputSize;
};

/** Input with debounced onValueChange and a trailing search icon slot. */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  {
    value,
    defaultValue = '',
    onValueChange,
    debounceMs = 300,
    trailing,
    size = 'md',
    className = '',
    ...props
  },
  ref,
) {
  const isControlled = value !== undefined;
  const [localValue, setLocalValue] = useState(isControlled ? value : defaultValue);
  const onValueChangeRef = useRef(onValueChange);

  useEffect(() => {
    onValueChangeRef.current = onValueChange;
  }, [onValueChange]);

  useEffect(() => {
    if (isControlled) {
      setLocalValue(value);
    }
  }, [isControlled, value]);

  useEffect(() => {
    // An echo, not an edit: the parent already holds this exact text (it either handed it down as
    // `value` or just took it from `onValueChange`). Skipping by VALUE, not by a one-shot flag, is
    // what keeps every real edit: the flag version swallowed the first change after each sync, so
    // every second keystroke never reached the parent.
    if (isControlled && localValue === value) {
      return undefined;
    }
    const handle = window.setTimeout(() => {
      onValueChangeRef.current?.(localValue);
    }, debounceMs);
    return () => window.clearTimeout(handle);
  }, [debounceMs, isControlled, localValue, value]);

  return (
    <span className={[styles.control, size === 'xs' ? styles.xs : size === 'sm' ? styles.sm : '', className].filter(Boolean).join(' ')}>
      <Input
        {...props}
        ref={ref}
        className={styles.input}
        size={size}
        value={localValue}
        onChange={(event) => setLocalValue(event.target.value)}
      />
      <span aria-hidden="true" className={styles.trailing}>
        {trailing ?? <Icon name={IconNames.search} size="sm" />}
      </span>
    </span>
  );
});
