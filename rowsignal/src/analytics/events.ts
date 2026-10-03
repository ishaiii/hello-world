/**
 * Optional, privacy-respecting product events. SHIPPED DISABLED: no sink is installed, so every
 * call here is a no-op and nothing leaves the device. The event types intentionally carry only
 * enumerated, non-sensitive values and counts of nothing — no file names, column names, cell
 * values, keys, notes or row counts — so even a mis-wired sink cannot receive spreadsheet data.
 *
 * To enable (owner decision, with any consent required where users live): call `setAnalyticsSink`
 * once at startup with a function that forwards `event` to a documented, aggregate-only service.
 * See docs/ADS_AND_ANALYTICS.md.
 */
export type ErrorCategory = 'unsupported-type' | 'too-large' | 'too-many-rows' | 'corrupt-file' | 'password-protected' | 'config-invalid' | 'worker-failure' | 'other';

export type AnalyticsEvent =
  | { name: 'sample_opened' }
  | { name: 'own_files_added'; kinds: 'csv' | 'xlsx' | 'mixed' }
  | { name: 'comparison_completed'; seconds: number; usedRecipe: boolean }
  | { name: 'result_exported'; format: 'csv' | 'xlsx' }
  | { name: 'recipe_saved' }
  | { name: 'recipe_reused' }
  | { name: 'import_failed'; category: ErrorCategory };

export type AnalyticsSink = (event: AnalyticsEvent) => void;

let sink: AnalyticsSink | null = null;

export function setAnalyticsSink(next: AnalyticsSink | null): void {
  sink = next;
}

export function track(event: AnalyticsEvent): void {
  if (!sink) return;
  try {
    sink(event);
  } catch {
    /* analytics must never affect the product */
  }
}
