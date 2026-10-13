import type { CSSProperties, InputHTMLAttributes, ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import styles from './Slider.module.css';

export type SliderProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'min' | 'max' | 'step' | 'onChange'
> & {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  formatValue?: (value: number) => ReactNode;
  onValueChange: (value: number) => void;
};

/** Accessible range input with a label and optional formatted value. */
export function Slider({
  className,
  formatValue,
  label,
  max = 100,
  min = 0,
  onValueChange,
  step = 1,
  value,
  ...props
}: SliderProps) {
  const progress =
    max === min ? 0 : Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  return (
    <label className={cn(styles.root, className)}>
      {label ? (
        <span className={styles.header}>
          <span>{label}</span>
          {formatValue ? <output>{formatValue(value)}</output> : null}
        </span>
      ) : null}
      <input
        {...props}
        className={styles.input}
        max={max}
        min={min}
        step={step}
        style={{ '--slider-progress': `${progress}%` } as CSSProperties}
        type="range"
        value={value}
        onChange={(event) => onValueChange(Number(event.target.value))}
      />
    </label>
  );
}
