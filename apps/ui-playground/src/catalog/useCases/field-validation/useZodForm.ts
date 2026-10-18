import { useState } from 'react';
import type { ZodType } from 'zod';
export type UseZodFormArgs<T> = { initialValues: T; schema: ZodType<T> };
export type UseZodFormResult<T> = { values: T; errors: Partial<Record<keyof T, string>>; setFieldValue: <K extends keyof T>(key: K, value: T[K]) => void; validate: () => T | null };
export function useZodForm<T extends Record<string, string>>({ initialValues, schema }: UseZodFormArgs<T>): UseZodFormResult<T> {
  const [values, setValues] = useState(initialValues);
  const [submitted, setSubmitted] = useState(false);
  const result = schema.safeParse(values);
  const errors: Partial<Record<keyof T, string>> = {};
  if (submitted && !result.success) for (const issue of result.error.issues) {
    const key = Object.keys(values).find(k => k === issue.path[0]);
    if (key !== undefined) errors[key as keyof T] = issue.message;
  }
  return { values, errors, setFieldValue: (key, value) => setValues(v => ({ ...v, [key]: value })), validate: () => { setSubmitted(true); return result.success ? result.data : null; } };
}
