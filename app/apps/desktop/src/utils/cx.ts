export type ClassValue = string | number | false | null | undefined;

/** Tiny classnames joiner. */
export function cx(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(' ');
}
