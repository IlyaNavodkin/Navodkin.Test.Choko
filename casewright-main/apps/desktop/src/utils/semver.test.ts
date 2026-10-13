import { describe, expect, it } from 'vitest';
import { compareVersions, isNewer, parseVersion } from './semver';

describe('parseVersion', () => {
  it('parses plain and v-prefixed versions', () => {
    expect(parseVersion('1.2.3')).toEqual([1, 2, 3]);
    expect(parseVersion('v0.1.0')).toEqual([0, 1, 0]);
    expect(parseVersion('  v10.20.30  ')).toEqual([10, 20, 30]);
  });

  it('ignores prerelease and build metadata', () => {
    expect(parseVersion('1.2.3-beta.1')).toEqual([1, 2, 3]);
    expect(parseVersion('v2.0.0+build.5')).toEqual([2, 0, 0]);
  });

  it('returns null for malformed input', () => {
    expect(parseVersion('1.2')).toBeNull();
    expect(parseVersion('not-a-version')).toBeNull();
    expect(parseVersion('')).toBeNull();
  });

  it('rejects non-semver tags rather than truncating them', () => {
    expect(parseVersion('v1.2.3foo')).toBeNull();
    expect(parseVersion('1.2.3.4')).toBeNull();
    expect(parseVersion('1.2.3-')).toEqual([1, 2, 3]); // a bare suffix marker is still 1.2.3
  });
});

describe('compareVersions', () => {
  it('orders by major, then minor, then patch', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
    expect(compareVersions('1.1.2', '1.1.5')).toBe(-1);
    expect(compareVersions('1.1.1', '1.1.1')).toBe(0);
  });

  it('treats unparseable versions as equal (not newer)', () => {
    expect(compareVersions('garbage', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', 'garbage')).toBe(0);
  });
});

describe('isNewer', () => {
  it('is true only for a strictly greater version', () => {
    expect(isNewer('0.2.0', '0.1.0')).toBe(true);
    expect(isNewer('v1.0.1', '1.0.0')).toBe(true);
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
    expect(isNewer('0.9.9', '1.0.0')).toBe(false);
  });

  it('ignores prerelease suffixes when comparing', () => {
    expect(isNewer('1.2.3-rc.1', '1.2.3')).toBe(false);
    expect(isNewer('1.3.0-rc.1', '1.2.3')).toBe(true);
  });
});
