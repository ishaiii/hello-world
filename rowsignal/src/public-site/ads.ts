import { site } from '../site.config';

/**
 * Advertising integration point. Everything here is inert by default:
 *  - `site.ads.enabled` is false unless the owner sets VITE_ADS_ENABLED=true;
 *  - no publisher id is bundled (the owner supplies VITE_ADS_PUBLISHER_ID);
 *  - no script is ever loaded without a consent decision, which the owner must wire to a real
 *    consent-management implementation before enabling (see docs/ADS_AND_ANALYTICS.md);
 *  - ad slots are only placed on public guide and tool pages, never in the workspace.
 */
export const adsConfigured = (): boolean => site.ads.enabled && site.ads.publisherId !== '';

/** Replace with a real consent check before enabling ads. Defaults to "no consent". */
export const adConsentGranted = (): boolean => false;
