import { describe, expect, it } from 'vitest';
import { folderSlug, slug } from './ids';

describe('slug (tree ids)', () => {
  it('lowercases, hyphenates, and trims', () => {
    expect(slug('User Management')).toBe('user-management');
    expect(slug('Auth & Sessions')).toBe('auth-sessions');
  });

  it('transliterates Cyrillic titles to stable ASCII filenames', () => {
    expect(slug('Генератор целых чисел')).toBe('generator-tselykh-chisel');
    expect(slug('Бросок кубиков — проверка')).toBe('brosok-kubikov-proverka');
    expect(slug('Ёжик в тумане')).toBe('ezhik-v-tumane');
  });
});

describe('folderSlug (wiki-safe folder + note filename, AzDO-encoded)', () => {
  it('turns spaces into the separator hyphen and PRESERVES case', () => {
    expect(folderSlug('User Management')).toBe('User-Management');
    expect(folderSlug('Billing')).toBe('Billing');
    expect(folderSlug('  spaced   out  ')).toBe('spaced-out');
  });

  it('encodes a literal dash as %2D so AzDO does not read it as a space', () => {
    expect(folderSlug('foo-bar')).toBe('foo%2Dbar');
    expect(folderSlug('Auth - Sessions')).toBe('Auth-%2D-Sessions');
    expect(folderSlug('PAY-0042')).toBe('PAY%2D0042');
  });

  it('strips filesystem/wiki-illegal characters', () => {
    expect(folderSlug('A / B : C')).toBe('A-B-C');
    expect(folderSlug('Plans*?"<>|')).toBe('Plans');
  });
});
