import { z } from 'zod';
import { glossaryKinds } from './types';
import type { EnvironmentPrimitive, EnvironmentValues } from './types';
export function isHttpUrl(value: string): boolean {
  try { const url = new URL(value); return /^https?:\/\//i.test(value) && (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password; } catch { return false; }
}
const KEY = /^[^\x00-\x1f\x7f]{1,64}$/u;
/** Parses `key=value` lines of an environment entry; the value keeps its JSON primitive type. */
export function parseEnvironmentValues(text: string): { values: EnvironmentValues; errors: string[] } {
  const values: EnvironmentValues = Object.create(null) as EnvironmentValues;
  const errors: string[] = [];
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) errors.push('empty');
  if (lines.length > 100) errors.push('count');
  for (const line of lines) {
    const separator = line.indexOf('=');
    if (separator < 1) { errors.push('syntax'); continue; }
    const key = line.slice(0, separator).trim();
    const raw = line.slice(separator + 1).trim();
    if (!KEY.test(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) { errors.push('key'); continue; }
    if (Object.hasOwn(values, key)) { errors.push('duplicate'); continue; }
    if (!raw) { errors.push('value'); continue; }
    values[key] = /^(true|false)$/u.test(raw) ? raw === 'true' : /^-?\d+(\.\d+)?$/u.test(raw) ? Number(raw) : raw;
  }
  if (new TextEncoder().encode(JSON.stringify(values)).length > 64 * 1024) errors.push('payload');
  return { values, errors };
}
export function formatEnvironmentValues(values: EnvironmentValues | undefined): string {
  return Object.entries(values ?? {}).filter(([, value]) => value !== '').map(([key, value]) => `${key}=${String(value)}`).join('\n');
}
export function environmentPrimitive(value: EnvironmentPrimitive): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}
export const glossarySchema = z.object({
  title: z.string().trim().min(1), kind: z.enum(glossaryKinds), aliases: z.string(), description: z.string(),
  url: z.string().trim().refine((value) => !value || isHttpUrl(value)),
  values: z.string(),
}).superRefine((value, context) => {
  if (value.kind === 'environment') {
    if (parseEnvironmentValues(value.values).errors.length) context.addIssue({ code: 'custom', path: ['values'], message: 'invalid' });
    return;
  }
  if (value.values.trim()) context.addIssue({ code: 'custom', path: ['values'], message: 'forbidden' });
  if (!value.description.trim() && !value.url) context.addIssue({ code: 'custom', path: ['description'], message: 'required' });
});
