/**
 * Resource budgets. These are conservative starting limits chosen to keep a browser tab responsive;
 * they are configuration, not measured performance claims (see docs/VERIFICATION.md for observed
 * timings). The effective values are shown to the user in the interface.
 */
export interface Limits {
  /** Largest accepted file, in bytes. */
  maxFileBytes: number;
  /** Populated (non-blank) rows per selected sheet, including the header row. */
  maxRows: number;
  maxCols: number;
  /** Populated cells per file. */
  maxCells: number;
  /** Total bytes an XLSX archive may expand to while we read the parts we need. */
  maxDecompressedBytes: number;
  maxZipEntries: number;
  /** Wall-clock budget for reading one file. */
  maxParseMs: number;
}

export const DEFAULT_LIMITS: Limits = {
  maxFileBytes: 10 * 1024 * 1024,
  maxRows: 100_000,
  maxCols: 100,
  maxCells: 2_000_000,
  maxDecompressedBytes: 256 * 1024 * 1024,
  maxZipEntries: 2_000,
  maxParseMs: 60_000,
};

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
