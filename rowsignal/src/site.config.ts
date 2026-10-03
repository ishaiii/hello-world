/**
 * Central, owner-editable site configuration. Nothing here is a claim about a registered domain or
 * a legal entity: every owner-supplied value is empty until the owner provides it (see
 * docs/LAUNCH_CHECKLIST.md). Values come from VITE_* environment variables at build time.
 */
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

export const site = {
  name: 'RowSignal',
  tagline: 'Compare Spreadsheets. Resolve Differences.',
  title: 'RowSignal — Compare Spreadsheets. Resolve Differences.',
  description:
    'Find what changed, what’s missing, and what needs your attention. Compare two Excel or CSV files by key, on your own device, and export the results.',
  /** Verified production origin, e.g. https://example.com — no trailing slash. Empty = no canonical/sitemap output. */
  baseUrl: (env.VITE_SITE_URL ?? '').replace(/\/+$/, ''),
  version: '0.1.0',
  /** Owner-supplied contact. Leave empty: the Contact page then offers diagnostics download only. */
  contactEmail: env.VITE_CONTACT_EMAIL ?? '',
  operatorName: env.VITE_OPERATOR_NAME ?? '',
  /** Advertising: off by default and never loaded in the workspace. See docs/ADS_AND_ANALYTICS.md. */
  ads: {
    enabled: env.VITE_ADS_ENABLED === 'true',
    publisherId: env.VITE_ADS_PUBLISHER_ID ?? '',
  },
  /** Analytics: off by default; no sink is installed unless the owner adds one. */
  analyticsEnabled: false,
} as const;

const trimSlash = (v: string) => v.replace(/\/+$/, '');

/**
 * Where the workspace lives. By default it is the same origin at /app/. To host the marketing site
 * and the workspace on different origins (so no public script can ever share an origin with real
 * data), set VITE_APP_URL for the public build and VITE_PUBLIC_URL for the workspace build.
 */
const appBase = env.VITE_APP_URL ? `${trimSlash(env.VITE_APP_URL)}/` : '/app/';
const publicBase = trimSlash(env.VITE_PUBLIC_URL ?? '');

/** Link from a public page into the workspace, e.g. `appHref('?sample=1')`. Always a full page navigation. */
export const appHref = (query = ''): string => `${appBase}${query}`;
/** Link from the workspace back to a public page, e.g. `publicHref('/privacy')`. */
export const publicHref = (path = '/'): string => `${publicBase}${path}`;
