import type { LintWarning } from '@/schemas';

/**
 * Test-case template variables — the `{{today}}` date variable and its date math.
 *
 * Tokens are stored verbatim in case markdown and resolved to an ISO `YYYY-MM-DD`
 * date *at run time* against a chosen test date. This module is pure and has no UI
 * or store coupling: `resolveVariables` is string → string, `findVariableLint`
 * reports malformed tokens, and the date math clamps to end-of-month.
 *
 * Grammar (case-insensitive, whitespace-tolerant inside the braces):
 *   {{today}}            the test date itself
 *   {{today+N}} {{-N}}   N days before/after (bare number = days)
 *   {{today+Nd|Nw|Nm|Ny}}  N days / weeks / months / years
 *   {{{ … }}}            an escape — renders the literal `{{ … }}`, never resolved
 */

export type Unit = 'd' | 'w' | 'm' | 'y';

export interface ParsedToken {
  /** +1 or -1; +1 for a plain `{{today}}` with no offset. */
  sign: 1 | -1;
  /** Offset magnitude in `unit`s; 0 for a plain `{{today}}`. */
  amount: number;
  unit: Unit;
}

// A whole-token matcher (anchored) for `parseToken` / lint validation.
const ONE_TOKEN_RX = /^\{\{\s*today\s*(?:([+-])\s*(\d+)\s*([dwmy])?)?\s*\}\}$/i;

// One pass over a string: a triple-brace escape OR a single token. The escape
// alternative is listed first so it consumes the outer braces before the token
// alternative can match the inner `{{…}}`.
const RESOLVE_RX =
  /\{\{\{\s*([^{}]*?)\s*\}\}\}|\{\{\s*today\s*(?:([+-])\s*(\d+)\s*([dwmy])?)?\s*\}\}/gi;

// A loose `{{…}}` (no inner braces) used to find tokens to validate for the lint.
const LOOSE_RX = /\{\{[^{}]*?\}\}/g;
const ESCAPE_RX = /\{\{\{[^{}]*?\}\}\}/g;

/** Parse a single token string into its offset, or `null` if it isn't a valid token. */
export function parseToken(token: string): ParsedToken | null {
  const m = ONE_TOKEN_RX.exec(token);
  if (!m) return null;
  if (!m[1]) return { sign: 1, amount: 0, unit: 'd' };
  return {
    sign: m[1] === '-' ? -1 : 1,
    amount: Number(m[2]),
    unit: (m[3] ? m[3].toLowerCase() : 'd') as Unit,
  };
}

interface YMD {
  y: number;
  /** 1-based month. */
  m: number;
  d: number;
}

/** Number of days in a 1-based month, leap-year aware. */
function daysInMonth(year: number, month1: number): number {
  // Day 0 of the *next* month is the last day of this month.
  return new Date(year, month1, 0).getDate();
}

/** Read a test date (ISO string or `Date`) into local y/m/d ints — never via UTC. */
function toYMD(testDate: string | Date): YMD {
  if (testDate instanceof Date) {
    return { y: testDate.getFullYear(), m: testDate.getMonth() + 1, d: testDate.getDate() };
  }
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})/.exec(testDate);
  if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  const dt = new Date(testDate);
  if (Number.isNaN(dt.getTime())) return { y: 1970, m: 1, d: 1 };
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}

/** Apply a signed offset to a date, clamping the day to the target month's length. */
function addOffset(base: YMD, t: ParsedToken): YMD {
  const delta = t.sign * t.amount;
  if (t.unit === 'd' || t.unit === 'w') {
    const days = delta * (t.unit === 'w' ? 7 : 1);
    const dt = new Date(base.y, base.m - 1, base.d);
    dt.setDate(dt.getDate() + days);
    return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
  }
  const months = t.unit === 'y' ? delta * 12 : delta;
  const totalM = base.y * 12 + (base.m - 1) + months;
  const ny = Math.floor(totalM / 12);
  const nm = (((totalM % 12) + 12) % 12) + 1; // 1-based
  return { y: ny, m: nm, d: Math.min(base.d, daysInMonth(ny, nm)) };
}

const pad = (n: number, len = 2): string => String(n).padStart(len, '0');
const formatISO = (ymd: YMD): string => `${pad(ymd.y, 4)}-${pad(ymd.m)}-${pad(ymd.d)}`;

/**
 * Resolve every `{{today…}}` token in `text` to an ISO date against `testDate`.
 * Triple-brace escapes (`{{{…}}}`) are emitted as a literal `{{…}}` and never
 * resolved; malformed tokens are left verbatim.
 */
export function resolveVariables(text: string, testDate: string | Date): string {
  if (!text) return text;
  const base = toYMD(testDate);
  return text.replace(RESOLVE_RX, (match, esc, sign, amount, unit) => {
    if (esc !== undefined) return `{{${esc}}}`;
    const token: ParsedToken = sign
      ? { sign: sign === '-' ? -1 : 1, amount: Number(amount), unit: (unit ? unit.toLowerCase() : 'd') as Unit }
      : { sign: 1, amount: 0, unit: 'd' };
    return formatISO(addOffset(base, token));
  });
}

/**
 * Find `{{…}}` sequences that look like variables but don't match the grammar,
 * for surfacing as non-blocking editor warnings. Triple-brace escapes are ignored,
 * and duplicate tokens are reported once.
 */
export function findVariableLint(text: string): LintWarning[] {
  if (!text) return [];
  const stripped = text.replace(ESCAPE_RX, ''); // don't scan inside escapes
  const out: LintWarning[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  LOOSE_RX.lastIndex = 0;
  while ((m = LOOSE_RX.exec(stripped)) !== null) {
    const tok = m[0];
    if (parseToken(tok) || seen.has(tok)) continue;
    seen.add(tok);
    out.push({
      code: 'unknown-variable',
      message:
        `Unrecognized variable "${tok}". Supported: {{today}}, {{today+7}}, {{today-30}}, ` +
        `{{today+2w}}, {{today-1m}}, {{today+1y}}. Escape a literal with triple braces: {{{…}}}.`,
    });
  }
  return out;
}
