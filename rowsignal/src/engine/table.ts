import type { ColumnInfo, TableData } from './types';

/** Spreadsheet column letters: 0 → A, 25 → Z, 26 → AA. */
export function columnLetter(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

export function columnIndexFromLetters(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) {
    n = n * 26 + (letters.charCodeAt(i) - 64);
  }
  return n - 1;
}

/**
 * A sheet exactly as read from the file, before any header interpretation. Only non-blank rows are
 * kept; `rowNumbers` records where each one sat in the source so row references stay truthful.
 */
export interface SheetGrid {
  sheetName: string | null;
  rows: string[][];
  rowNumbers: number[];
  /** Per-row cell flags (see CELL_* in types). `null` when no cell in the row has a flag. */
  rowFlags: (Uint8Array | null)[];
  width: number;
  /** Highest source row number seen (including blank trailing rows that were present). */
  lastRowNumber: number;
  hiddenRows: number;
  hiddenColumns: number[];
  date1904: boolean;
  formulaCells: number;
  formulaNoCache: number;
  errorCells: number;
  /** Cells that were stored as numbers (identifiers may have lost leading zeros before import). */
  numericCells: number;
}

export function emptyGrid(sheetName: string | null): SheetGrid {
  return {
    sheetName,
    rows: [],
    rowNumbers: [],
    rowFlags: [],
    width: 0,
    lastRowNumber: 0,
    hiddenRows: 0,
    hiddenColumns: [],
    date1904: false,
    formulaCells: 0,
    formulaNoCache: 0,
    errorCells: 0,
    numericCells: 0,
  };
}

export function isBlankRow(cells: readonly string[]): boolean {
  for (const c of cells) {
    if (c !== '' && c.trim() !== '') return false;
  }
  return true;
}

/** Build column descriptors from a header row (or none) with stable ids and visible disambiguation. */
export function buildColumns(headerCells: readonly string[] | null, width: number, hidden: ReadonlySet<number>): ColumnInfo[] {
  const headers: string[] = [];
  for (let i = 0; i < width; i++) headers.push(headerCells ? (headerCells[i] ?? '').trim() : '');
  const totals = new Map<string, number>();
  for (const h of headers) if (h !== '') totals.set(h, (totals.get(h) ?? 0) + 1);
  const seen = new Map<string, number>();
  return headers.map((h, i) => {
    const letter = columnLetter(i);
    let occurrence = 1;
    let label: string;
    if (h === '') {
      label = `Column ${letter}`;
    } else {
      occurrence = (seen.get(h) ?? 0) + 1;
      seen.set(h, occurrence);
      label = (totals.get(h) ?? 0) > 1 ? `${h} (column ${letter})` : h;
    }
    return { id: `c${i}`, index: i, letter, header: h, label, hidden: hidden.has(i), occurrence };
  });
}

/** A header-interpreted view of a grid. Data rows are the non-blank rows after the header row. */
export class ArrayTable implements TableData {
  readonly columns: ColumnInfo[];
  readonly rowCount: number;
  readonly sheetName: string | null;
  /** Non-blank rows that sit above the header and are ignored. */
  readonly aboveHeader: number;
  /** Blank rows inside the data range that were skipped (present but empty, or absent). */
  readonly skippedBlank: number;
  readonly headerRow: number | null;
  private readonly grid: SheetGrid;
  private readonly start: number;

  /**
   * @param headerRow source row number holding the headers, or `null` when the file has no header.
   */
  constructor(grid: SheetGrid, headerRow: number | null) {
    this.grid = grid;
    this.sheetName = grid.sheetName;
    this.headerRow = headerRow;
    let headerCells: readonly string[] | null = null;
    let start = 0;
    if (headerRow !== null) {
      const g = grid.rowNumbers.indexOf(headerRow);
      if (g < 0) throw new Error(`Header row ${headerRow} is blank or does not exist`);
      headerCells = grid.rows[g]!;
      start = g + 1;
      this.aboveHeader = g;
    } else {
      this.aboveHeader = 0;
    }
    this.start = start;
    this.rowCount = Math.max(0, grid.rows.length - start);
    this.columns = buildColumns(headerCells, grid.width, new Set(grid.hiddenColumns));
    const base = headerRow ?? 0;
    this.skippedBlank = this.rowCount === 0 ? 0 : Math.max(0, grid.lastRowNumber - base - this.rowCount);
  }

  text(row: number, col: number): string {
    return this.grid.rows[this.start + row]?.[col] ?? '';
  }

  flags(row: number, col: number): number {
    return this.grid.rowFlags[this.start + row]?.[col] ?? 0;
  }

  rowNumber(row: number): number {
    return this.grid.rowNumbers[this.start + row] ?? 0;
  }
}

export function columnIndexById(columns: readonly ColumnInfo[], id: string): number {
  const i = columns.findIndex((c) => c.id === id);
  return i;
}
