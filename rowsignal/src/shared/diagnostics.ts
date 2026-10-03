import { DEFAULT_LIMITS } from '../import/limits';
import { site } from '../site.config';

/**
 * A support/diagnostic report that contains NO file content: no file names, column names, cell
 * values, keys, notes or counts of discrepancies. It lists the app version, browser capabilities
 * and configured limits so a problem can be understood without seeing anyone's data.
 */
export function buildDiagnostics(extra: Record<string, string | number | boolean | null> = {}): string {
  const g = globalThis as unknown as {
    navigator?: Navigator & { deviceMemory?: number };
    Worker?: unknown;
    indexedDB?: unknown;
    CompressionStream?: unknown;
    isSecureContext?: boolean;
    matchMedia?: (q: string) => { matches: boolean };
  };
  const nav = g.navigator;
  const report = {
    about: 'RowSignal diagnostics. This report contains no file names, column names, cell values or results.',
    app: site.name,
    version: site.version,
    generatedAt: new Date().toISOString(),
    browser: nav?.userAgent ?? 'unknown',
    language: nav?.language ?? 'unknown',
    cpuCores: nav?.hardwareConcurrency ?? null,
    deviceMemoryGb: nav?.deviceMemory ?? null,
    features: {
      webWorkers: typeof g.Worker !== 'undefined',
      indexedDB: typeof g.indexedDB !== 'undefined',
      secureContext: g.isSecureContext ?? null,
      reducedMotion: g.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? null,
    },
    limits: DEFAULT_LIMITS,
    ...extra,
  };
  return JSON.stringify(report, null, 2);
}
