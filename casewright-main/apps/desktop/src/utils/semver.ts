/**
 * Tiny, dependency-free semantic-version comparator — just enough to tell whether
 * a GitHub release tag is newer than the running build. We only ever compare
 * stable releases, so any `-prerelease` / `+build` suffix is ignored (and an
 * unparseable version is treated as "not newer", so we never prompt on garbage).
 */

/**
 * Parse "1.2.3" or "v1.2.3" → [1, 2, 3]; a trailing -prerelease/+build suffix is
 * dropped. The match is anchored so non-semver tags (`1.2.3.4`, `v1.2.3foo`) are
 * rejected outright rather than silently truncated to `1.2.3`.
 */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Compare two versions: -1 (a < b), 0 (equal / unparseable), 1 (a > b). */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? -1 : 1;
  }
  return 0;
}

/** True when `latest` is strictly newer than `current`. */
export const isNewer = (latest: string, current: string): boolean => compareVersions(latest, current) > 0;
