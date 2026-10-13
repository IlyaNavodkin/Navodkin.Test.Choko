// Shared site constants - links and the current version, in one place so pages
// (and the header/footer components) can't drift out of sync.
//
// The version comes from the monorepo ROOT package.json, not the web app's own: the
// release tooling (scripts/sync-version.mjs) bumps the root + desktop manifests on every
// release but never the web one, so reading the web manifest here left the site frozen at
// a stale number. The root manifest always reflects the latest published version.
import { version } from '../../../package.json';

/** Canonical project links. */
export const REPO_URL = 'https://github.com/jimbuck/casewright';
export const DOWNLOAD_URL = `${REPO_URL}/releases`;
export const LICENSE_URL = `${REPO_URL}/blob/main/LICENSE`;

/** Published version, sourced from the root package.json so the site never hard-codes a stale number. */
export const VERSION = version;

/**
 * Prefix an internal path with the configured base - `/` locally, `/casewright/`
 * on GitHub Pages - so links resolve in both. `withBase()` returns the site root.
 */
export function withBase(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
  const rest = path.replace(/^\/+/, '');
  return (rest ? `${base}/${rest}` : base) || '/';
}
