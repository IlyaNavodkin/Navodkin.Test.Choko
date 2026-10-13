'use client';

import { useId, type CSSProperties, type InputHTMLAttributes } from 'react';
import styles from './ColorPicker.module.css';
import { useI18n } from '../i18n/provider';

export type ColorPickerProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
};

/** Compact native color picker ported from Koster UI. */
export function ColorPicker({
  label,
  value,
  onValueChange,
  id,
  className = '',
  disabled,
  ...props
}: ColorPickerProps) {
  const { t } = useI18n();
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <label className={`${styles.root} ${disabled ? styles.disabled : ''} ${className}`.trim()} htmlFor={inputId}>
      <span className={styles.label}>{label}</span>
      <span className={styles.control} style={{ '--color-picker-value': value } as CSSProperties}>
        <span aria-hidden="true" className={styles.swatch} />
        <output className={styles.value}>{value.toUpperCase()}</output>
        <span aria-hidden="true" className={styles.action}>{t('change')}</span>
        <input
          {...props}
          aria-label={label}
          disabled={disabled}
          id={inputId}
          type="color"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
        />
      </span>
    </label>
  );
}
