import { describe, expect, it } from 'vitest';
import { parseOrder, serializeOrder } from './order';

describe('.order format', () => {
  it('serializes one key per line with a trailing newline', () => {
    expect(serializeOrder(['PAY-0002-b', 'Auth', 'PAY-0001-a'])).toBe('PAY-0002-b\nAuth\nPAY-0001-a\n');
  });

  it('parses lines, trimming whitespace and dropping blanks', () => {
    expect(parseOrder('PAY-0002-b\n\n  Auth  \nPAY-0001-a\n')).toEqual(['PAY-0002-b', 'Auth', 'PAY-0001-a']);
  });

  it('tolerates CRLF line endings', () => {
    expect(parseOrder('a\r\nb\r\n')).toEqual(['a', 'b']);
  });

  it('round-trips', () => {
    const keys = ['c', 'a', 'b'];
    expect(parseOrder(serializeOrder(keys))).toEqual(keys);
  });
});
