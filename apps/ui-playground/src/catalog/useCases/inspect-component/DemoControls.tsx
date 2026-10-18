import { Checkbox, Input, Select, Slider } from '@codaa/ui';
import type { ReactNode } from 'react';
import { t } from '../../../shared/i18n/messages';
import styles from './Demo.module.css';
export function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void }) {
  return <label className={styles.control}><span>{label}</span><Select aria-label={label} size="sm" value={value} options={options.map(v => ({ value: v, label: v }))} onValueChange={v => { const found = options.find(o => o === v); if (found !== undefined) onChange(found); }} /></label>;
}
export function Flag({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) { return <Checkbox checked={value} onCheckedChange={onChange}>{label}</Checkbox>; }
export function TextControl({ label = t('text'), value, onChange }: { label?: string; value: string; onChange: (value: string) => void }) { return <label className={styles.control}><span>{label}</span><Input size="sm" value={value} onChange={e => onChange(e.target.value)} /></label>; }
export function Range({ label, value, onChange, min = 0, max = 100, step = 1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; step?: number }) { return <Slider label={label} aria-label={label} value={value} min={min} max={max} step={step} onValueChange={onChange} formatValue={v => v} />; }
export function DemoFrame({ controls, children, output }: { controls: ReactNode; children: ReactNode; output?: ReactNode }) {
  return <><div className={styles.workbench}><section className={styles.stage} aria-label={t('example')}>{children}</section><aside className={styles.controls} aria-label={t('controls')}><h2>{t('controls')}</h2>{controls}</aside></div><div className={styles.output}><span>{t('output')}</span><output aria-live="polite">{output ?? t('initial')}</output></div></>;
}
