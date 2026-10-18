import type { PrimitiveValue } from './catalog';

/**
 * Аргументы invocation, разрешённые приложением до запуска.
 *
 * Значения передаются приложением в окружении процесса теста, поэтому тест не читает
 * manifest и не зависит от порядка запуска. Секреты через этот канал не передаются.
 */
export function getInvocationArguments<T extends Record<string, PrimitiveValue> = Record<string, PrimitiveValue>>(): Readonly<T> {
  const raw = process.env.TESTORITTO_INVOCATION_ARGUMENTS;
  if (!raw) return Object.freeze({}) as Readonly<T>;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_INVOCATION_ARGUMENTS');
  return Object.freeze({ ...(parsed as T) });
}
/** Идентификатор invocation: совпадает с записью в отчёте и снимком аргументов. */
export function getInvocationId(): string {
  const value = process.env.TESTORITTO_INVOCATION_ID;
  if (!value) throw new Error('MISSING_INVOCATION_ID');
  return value;
}
