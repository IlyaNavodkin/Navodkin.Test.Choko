/**
 * YAML scalar emission shared by the markdown serializers: quote a value only when a plain
 * scalar would read back as something else (a number, a boolean, an empty string, a comment).
 */
function needsQuote(s: string): boolean {
  if (s === '' || s !== s.trim()) return true;
  if (/:( |$)/.test(s) || /\s#/.test(s) || /^#/.test(s)) return true;
  if (/^[!&*?{}[\]|>@`"'%,\-]/.test(s)) return true;
  if (/^(true|false|null|yes|no|on|off|~)$/i.test(s)) return true;
  if (/^[\d.+-]+$/.test(s)) return true; // numeric-looking
  return false;
}

export const yamlScalar = (s: string): string => (needsQuote(s) ? JSON.stringify(s) : s);
