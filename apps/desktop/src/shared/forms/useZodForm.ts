import { useCallback, useState } from 'react';
import type { z } from 'zod';
export type UseZodFormArgs<T extends object> = { initialValues: T; schema: z.ZodType<T>; invalidMessage: string };
export type UseZodFormResult<T extends object> = { values: T; errors: Partial<Record<keyof T, string>>; setFieldValue: <K extends keyof T>(key: K, value: T[K]) => void; reset: (values: T) => void; validate: () => T | null };
export function useZodForm<T extends object>({ initialValues, schema, invalidMessage }: UseZodFormArgs<T>): UseZodFormResult<T> {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState<Partial<Record<keyof T, string>>>({});
  const setFieldValue = useCallback(<K extends keyof T>(key: K, value: T[K]) => { setValues((previous) => ({ ...previous, [key]: value })); }, []);
  const reset = useCallback((next: T) => { setValues(next); setErrors({}); }, []);
  const validate = () => {
    const result = schema.safeParse(values);
    if (result.success) { setErrors({}); return result.data; }
    const next: Partial<Record<keyof T, string>> = {};
    for (const issue of result.error.issues) { const field = issue.path[0]; if (typeof field === 'string' && field in values) next[field as keyof T] = invalidMessage; }
    setErrors(next); return null;
  };
  return { values, errors, setFieldValue, reset, validate };
}
