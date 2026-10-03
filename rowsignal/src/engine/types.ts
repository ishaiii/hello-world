/**
 * Shared types for the RowSignal engine. This module has no runtime dependencies and no DOM
 * access: everything in `src/engine` can run in a worker, in Node tests, or at build time.
 */

export type Role = 'A' | 'B';
export const ROLES: readonly Role[] = ['A', 'B'];

// ---------------------------------------------------------------------------------------------
// Imported tables
// ---------------------------------------------------------------------------------------------

export interface ColumnInfo {
  /** Stable internal id, `c<zero-based sheet column index>`. Unique even when headers repeat. */
  id: string;
  index: number;
  /** Spreadsheet column letter (A, B, … AA). */
  letter: string;
  /** Header text exactly as found (trimmed of nothing), or "Column C" when there is no header. */
  header: string;
  /** Visible, disambiguated label ("Qty", or "Qty (column D)" when the header repeats). */
  label: string;
  /** Column was hidden in the workbook (XLSX only). */
  hidden: boolean;
  /** 1-based occurrence among columns with the same header (1 for the first). */
  occurrence: number;
}

/** Bit flags describing how a cell was stored in the source file. Plain CSV text has no flags. */
export const CELL_NUMBER = 1; // stored as a number
export const CELL_DATE = 2; // stored as a date/time serial (text holds an ISO date)
export const CELL_BOOL = 4;
export const CELL_ERROR = 8; // error value such as #N/A (text holds the error code)
export const CELL_FORMULA = 16; // formula with a cached result (text holds the cached result)
export const CELL_FORMULA_NOCACHE = 32; // formula with no stored result (text is empty)
export const CELL_DATE_INVALID = 64; // date serial that does not map to a real date

export interface TableData {
  readonly columns: ColumnInfo[];
  /** Number of data rows (after header and blank-row handling). */
  readonly rowCount: number;
  readonly sheetName: string | null;
  /** Blank rows inside the data range that were left out. */
  readonly skippedBlank: number;
  /** Non-blank rows above the header row that were left out. */
  readonly aboveHeader: number;
  text(row: number, col: number): string;
  flags(row: number, col: number): number;
  /** Source row number (1-based; spreadsheet row, or CSV record number including the header). */
  rowNumber(row: number): number;
}

// ---------------------------------------------------------------------------------------------
// Match configuration
// ---------------------------------------------------------------------------------------------

export type FieldKind = 'text' | 'identifier' | 'number' | 'date' | 'boolean';
export type DateOrder = 'DMY' | 'MDY' | 'YMD';
export type ThousandsSeparator = 'none' | ',' | '.' | ' ';

/** Per-file interpretation of text numbers and dates. Never inferred from the visitor's location. */
export interface FileFormat {
  decimal: '.' | ',';
  thousands: ThousandsSeparator;
  /** Ignore $ € £ ₹ ¥ Rs INR USD around numbers. Formatting only — no currency conversion. */
  currency: boolean;
  /** How `03/04/2026` is read. `null` = not chosen yet (blocks comparison when a date is mapped). */
  dateOrder: DateOrder | null;
}

export interface KeyRule {
  id: string;
  label: string;
  aColumn: string;
  bColumn: string;
  /** Ignore outer spaces. Off by default: identifiers are compared exactly. */
  trim: boolean;
  caseInsensitive: boolean;
}

export interface FieldRule {
  id: string;
  label: string;
  kind: FieldKind;
  aColumn: string;
  bColumn: string;
  trim: boolean;
  caseInsensitive: boolean;
  /** Treat whitespace-only cells as blank even when `trim` is off. */
  emptyAsNull: boolean;
  /** Absolute tolerance as a decimal string; only used for `number`. "0" = exact. */
  tolerance: string;
}

export interface MatchConfig {
  version: 1;
  keys: KeyRule[];
  fields: FieldRule[];
  formats: Record<Role, FileFormat>;
}

// ---------------------------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------------------------

export type Category = 'matched' | 'different' | 'only-a' | 'only-b' | 'ambiguous' | 'invalid';
export const CATEGORIES: readonly Category[] = [
  'matched',
  'different',
  'only-a',
  'only-b',
  'ambiguous',
  'invalid',
];

/** Per-field outcome code: s = same, d = different, u = unreadable value. */
export type FieldStatus = 's' | 'd' | 'u';

export type Provenance = 'exact' | 'manual';

export interface ResultRow {
  /** Stable id: derived from the key (pairs, groups) or the source row (single rows). */
  id: string;
  category: Category;
  provenance: Provenance;
  /** Which file a single-sided row (only-a / only-b / invalid) belongs to. */
  side?: Role;
  /** Raw key values as found in each file. */
  keyA?: string[];
  keyB?: string[];
  /** Data-row indices into the loaded tables (internal). */
  aIdx: number[];
  bIdx: number[];
  /** Source row numbers (as a spreadsheet user would see them). */
  aRows: number[];
  bRows: number[];
  /** Raw values of the compared fields, in field order (pairs and single rows). */
  aVals?: string[];
  bVals?: string[];
  /** One char per field for pairs: s / d / u. */
  status?: string;
  /** Plain-language reasons, one per differing field (or one for the classification). */
  reasons: string[];
  /** One-line plain-language classification. */
  summary: string;
}

export interface Summary {
  matched: number;
  different: number;
  /** Pairs = matched + different (exact and manually linked). */
  pairs: number;
  manualPairs: number;
  onlyA: number;
  onlyB: number;
  ambiguousGroups: number;
  ambiguousRowsA: number;
  ambiguousRowsB: number;
  invalidA: number;
  invalidB: number;
}

export interface SideAccounting {
  /** Rows loaded into the comparison (blank rows and rows above the header are excluded). */
  eligible: number;
  pairedExact: number;
  pairedManual: number;
  only: number;
  ambiguousRows: number;
  invalid: number;
  total: number;
  balanced: boolean;
  skippedBlank: number;
  aboveHeader: number;
}

export interface Accounting {
  A: SideAccounting;
  B: SideAccounting;
  balanced: boolean;
}

export interface KeyStats {
  rows: number;
  blankKeys: number;
  /** Rows whose key appears more than once in this file. */
  duplicateKeyRows: number;
  duplicateKeyGroups: number;
  uniqueKeys: number;
}

export interface ComparisonResult {
  config: MatchConfig;
  rows: ResultRow[];
  summary: Summary;
  accounting: Accounting;
  keyStats: Record<Role, KeyStats>;
  warnings: string[];
  elapsedMs: number;
}

export interface ManualLink {
  aIdx: number;
  bIdx: number;
}

export interface ProgressInfo {
  phase: 'reading' | 'validating' | 'matching' | 'preparing' | 'suggesting' | 'exporting';
  /** Present only when a real count is known. */
  done?: number;
  total?: number;
}

export interface JobHooks {
  isCancelled(): boolean;
  onProgress?(p: ProgressInfo): void;
}

export class CancelledError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'CancelledError';
  }
}

/** Thrown for user-facing, expected failures (bad files, limits). Message is safe to display. */
export class UserFacingError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'UserFacingError';
    this.code = code;
  }
}

export const NO_HOOKS: JobHooks = { isCancelled: () => false };
