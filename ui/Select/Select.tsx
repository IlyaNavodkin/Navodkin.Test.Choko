'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Icon, IconNames } from '../Icon/Icon';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover/Popover';
import { Spinner } from '../Spinner/Spinner';
import styles from './Select.module.css';
import { useI18n } from '../i18n/provider';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'onChange' | 'value'
> & {
  options: readonly SelectOption[];
  anchor?: HTMLElement | null;
  hideTrigger?: boolean;
  contentClassName?: string;
  matchAnchorWidth?: boolean;
  value?: string;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
  loading?: boolean;
  size?: 'xs' | 'sm' | 'md';
  showIndicator?: boolean;
  renderTrigger?: (state: { option?: SelectOption; open: boolean }) => ReactNode;
  onValueChange?: (value: string) => void;
};

function firstEnabledIndex(options: readonly SelectOption[]) {
  return options.findIndex((option) => !option.disabled);
}

/**
 * A keyboard-accessible single-value select built on the shared Popover.
 * Its list is portaled and therefore retains the same collision handling as other overlays.
 */
export function Select({
  'aria-label': ariaLabel,
  anchor = null,
  className = '',
  contentClassName = '',
  defaultOpen = false,
  disabled = false,
  loading = false,
  hideTrigger = false,
  matchAnchorWidth = true,
  name,
  onKeyDown,
  onOpenChange,
  onValueChange,
  open: controlledOpen,
  options,
  placeholder,
  renderTrigger,
  showIndicator = true,
  size = 'md',
  value = '',
  ...props
}: SelectProps) {
  const { t } = useI18n();
  const resolvedPlaceholder = placeholder ?? t('selectValue');
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;
  const isDisabled = disabled || loading;
  const open = controlledOpen ?? uncontrolledOpen;

  const setOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );

  const focusOption = (nextIndex: number) => {
    if (nextIndex < 0) return;
    setFocusedIndex(nextIndex);
    requestAnimationFrame(() => optionRefs.current[nextIndex]?.focus());
  };

  const moveFocus = (fromIndex: number, direction: 1 | -1) => {
    if (!options.length) return;
    for (let offset = 1; offset <= options.length; offset += 1) {
      const nextIndex = (fromIndex + direction * offset + options.length) % options.length;
      if (!options[nextIndex].disabled) {
        focusOption(nextIndex);
        return;
      }
    }
  };

  const selectOption = (option: SelectOption) => {
    if (option.disabled) return;
    onValueChange?.(option.value);
    setOpen(false);
    requestAnimationFrame(() => (anchor ?? triggerRef.current)?.focus());
  };

  const openWithFocusedOption = () => {
    const nextIndex =
      selectedIndex >= 0 && !options[selectedIndex].disabled
        ? selectedIndex
        : firstEnabledIndex(options);
    setFocusedIndex(nextIndex);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const index =
      selectedIndex >= 0 && !options[selectedIndex].disabled
        ? selectedIndex
        : firstEnabledIndex(options);
    setFocusedIndex(index);
  }, [open, options, selectedIndex]);

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || isDisabled) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) openWithFocusedOption();
      return;
    }
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const currentIndex = Number((event.target as HTMLElement).dataset.optionIndex);
    const index = Number.isInteger(currentIndex) ? currentIndex : focusedIndex;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(index, 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(index, -1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusOption(firstEnabledIndex(options));
    } else if (event.key === 'End') {
      event.preventDefault();
      const lastEnabledIndex = [...options].map((option) => !option.disabled).lastIndexOf(true);
      focusOption(lastEnabledIndex);
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <Popover
      align="start"
      anchor={anchor}
      matchAnchorWidth={matchAnchorWidth}
      offset={4}
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) openWithFocusedOption();
        else setOpen(false);
      }}
    >
      {name ? <input name={name} type="hidden" value={value} /> : null}
      {!hideTrigger ? (
        <PopoverTrigger
          {...props}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-busy={loading || undefined}
          className={`${styles.trigger} ${styles[`size-${size}`]} ${open ? styles.open : ''} ${className}`.trim()}
          disabled={isDisabled}
          ref={triggerRef}
          role="combobox"
          onKeyDown={handleTriggerKeyDown}
        >
          {renderTrigger ? (
            renderTrigger({ option: selectedOption, open })
          ) : (
            <span className={selectedOption ? styles.value : styles.placeholder}>
              {selectedOption?.label ?? resolvedPlaceholder}
            </span>
          )}
          {loading ? (
            <Spinner aria-hidden="true" size="sm" />
          ) : showIndicator ? (
            <Icon
              aria-hidden="true"
              className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`.trim()}
              name={IconNames.chevronDown}
              size="md"
            />
          ) : null}
        </PopoverTrigger>
      ) : null}
      <PopoverContent
        aria-label={ariaLabel ?? resolvedPlaceholder}
        autoFocus
        className={`${styles.content} ${contentClassName}`.trim()}
        role="listbox"
        onKeyDown={handleListKeyDown}
      >
        {options.length ? (
          options.map((option, index) => (
            <button
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              aria-selected={option.value === value}
              className={`${styles.option} ${option.value === value ? styles.selected : ''} ${
                focusedIndex === index ? styles.focused : ''
              }`.trim()}
              data-autofocus={focusedIndex === index || undefined}
              data-option-index={index}
              disabled={option.disabled}
              key={option.value}
              role="option"
              type="button"
              onClick={() => selectOption(option)}
              onMouseMove={() => setFocusedIndex(index)}
            >
              <span>{option.label}</span>
              {option.value === value ? <Icon name={IconNames.check} size="sm" /> : null}
            </button>
          ))
        ) : (
              <span className={styles.empty}>{t('noDevices')}</span>
        )}
      </PopoverContent>
    </Popover>
  );
}
