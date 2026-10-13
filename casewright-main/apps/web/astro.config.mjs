// @ts-check
import { defineConfig } from 'astro/config';

// `site` and `base` are read from the environment so the GitHub Pages workflow can inject the
// correct values for whatever owner/repo this lives in (see ../../.github/workflows/deploy-web.yml):
//
//   SITE_URL=https://<owner>.github.io   BASE_PATH=/casewright
//
// Locally they default to a root-served dev site, so `pnpm dev:web` Just Works.
// If you attach a custom domain later, set SITE_URL to it and BASE_PATH to '/'.
export default defineConfig({
  // `|| undefined` / `|| '/'` so empty-string env values (e.g. a user/org Pages site,
  // where the base path is "") fall back to the local defaults rather than breaking.
  site: process.env.SITE_URL || undefined,
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'ignore',
  build: {
    // Emit hashed assets under /assets so they resolve correctly under a base path.
    assets: 'assets',
  },
});
