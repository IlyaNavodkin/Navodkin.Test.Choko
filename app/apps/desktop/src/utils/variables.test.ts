import { describe, expect, it } from 'vitest';
import { findVariableLint, parseToken, resolveVariables } from './variables';

const D = '2026-06-10'; // a Wednesday; June has 30 days

describe('parseToken', () => {
  it('parses a plain today and signed offsets with units', () => {
    expect(parseToken('{{today}}')).toEqual({ sign: 1, amount: 0, unit: 'd' });
    expect(parseToken('{{today+7}}')).toEqual({ sign: 1, amount: 7, unit: 'd' });
    expect(parseToken('{{today-30}}')).toEqual({ sign: -1, amount: 30, unit: 'd' });
    expect(parseToken('{{today+2w}}')).toEqual({ sign: 1, amount: 2, unit: 'w' });
    expect(parseToken('{{today-3m}}')).toEqual({ sign: -1, amount: 3, unit: 'm' });
    expect(parseToken('{{ TODAY + 1Y }}')).toEqual({ sign: 1, amount: 1, unit: 'y' });
  });

  it('returns null for non-tokens', () => {
    for (const s of ['{{tomorrow}}', '{{today*2}}', '{{today+}}', '{{today+1.5}}', '{{ today 7 }}']) {
      expect(parseToken(s)).toBeNull();
    }
  });
});

describe('resolveVariables — day/week math', () => {
  it('resolves the plain token and bare-number days', () => {
    expect(resolveVariables('{{today}}', D)).toBe('2026-06-10');
    expect(resolveVariables('{{today+7}}', D)).toBe('2026-06-17');
    expect(resolveVariables('{{today-30}}', D)).toBe('2026-05-11');
  });

  it('treats N as days and Nw as weeks', () => {
    expect(resolveVariables('{{today+1d}}', D)).toBe('2026-06-11');
    expect(resolveVariables('{{today+2w}}', D)).toBe('2026-06-24');
    expect(resolveVariables('{{today-1w}}', D)).toBe('2026-06-03');
  });

  it('crosses month and year boundaries by days', () => {
    expect(resolveVariables('{{today+30}}', D)).toBe('2026-07-10');
    expect(resolveVariables('{{today+365}}', D)).toBe('2027-06-10');
  });
});

describe('resolveVariables — month/year math with clamping', () => {
  it('adds and subtracts whole months and years', () => {
    expect(resolveVariables('{{today+1m}}', D)).toBe('2026-07-10');
    expect(resolveVariables('{{today-1m}}', D)).toBe('2026-05-10');
    expect(resolveVariables('{{today+1y}}', D)).toBe('2027-06-10');
    expect(resolveVariables('{{today-1y}}', D)).toBe('2025-06-10');
  });

  it('clamps to the last valid day of the target month', () => {
    expect(resolveVariables('{{today+1m}}', '2026-01-31')).toBe('2026-02-28');
    expect(resolveVariables('{{today+1m}}', '2024-01-31')).toBe('2024-02-29'); // leap year
    expect(resolveVariables('{{today-1y}}', '2024-02-29')).toBe('2023-02-28');
    expect(resolveVariables('{{today+1m}}', '2026-03-31')).toBe('2026-04-30');
  });
});

describe('resolveVariables — tolerance & multiples', () => {
  it('tolerates whitespace and case', () => {
    expect(resolveVariables('{{ today + 7 }}', D)).toBe('2026-06-17');
    expect(resolveVariables('{{TODAY+1D}}', D)).toBe('2026-06-11');
    expect(resolveVariables('{{Today-1W}}', D)).toBe('2026-06-03');
  });

  it('replaces every token in a string', () => {
    expect(resolveVariables('valid {{today}} until {{today+7}}', D)).toBe('valid 2026-06-10 until 2026-06-17');
  });

  it('accepts a Date as the test date (local components, no UTC drift)', () => {
    expect(resolveVariables('{{today}}', new Date(2026, 5, 10))).toBe('2026-06-10');
  });
});

describe('resolveVariables — escapes & malformed', () => {
  it('emits triple-brace escapes as a literal double-brace, unresolved', () => {
    expect(resolveVariables('{{{today}}}', D)).toBe('{{today}}');
    expect(resolveVariables('{{{today+7}}}', D)).toBe('{{today+7}}');
    expect(resolveVariables('lit {{{today}}} real {{today}}', D)).toBe('lit {{today}} real 2026-06-10');
  });

  it('leaves malformed tokens verbatim', () => {
    for (const s of ['{{today*2}}', '{{tomorrow}}', '{{today+}}', '{{today+1.5}}', '{{ today 7 }}', '{{todayy}}']) {
      expect(resolveVariables(s, D)).toBe(s);
    }
  });

  it('handles pathological braces predictably (pinned behavior)', () => {
    // A quadruple-brace escape consumes the inner triple, leaving the outer brace pair literal.
    expect(resolveVariables('{{{{today}}}}', D)).toBe('{{{today}}}');
    // A token wrapped in extra braces resolves the inner token; the outer braces stay literal.
    expect(resolveVariables('{{ {{today}} }}', D)).toBe('{{ 2026-06-10 }}');
  });
});

describe('findVariableLint', () => {
  it('returns nothing for valid tokens and plain text', () => {
    expect(findVariableLint('no tokens here')).toEqual([]);
    expect(findVariableLint('{{today}} and {{today+7}} and {{today-1m}}')).toEqual([]);
  });

  it('flags each distinct malformed token once', () => {
    const w = findVariableLint('{{todya}} then {{today*2}} then {{todya}}');
    expect(w).toHaveLength(2);
    expect(w.every((x) => x.code === 'unknown-variable')).toBe(true);
    expect(w[0].message).toContain('{{todya}}');
  });

  it('flags an incomplete offset', () => {
    expect(findVariableLint('{{today+}}')).toHaveLength(1);
  });

  it('does not flag escaped sequences', () => {
    expect(findVariableLint('{{{todya}}}')).toEqual([]);
    expect(findVariableLint('keep {{{today}}} and warn {{nope}}')).toHaveLength(1);
  });
});
