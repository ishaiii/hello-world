/**
 * Turns file bytes into a header-interpreted table plus a plain description of what was found.
 * Pure and DOM-free so it runs in the worker, in Node tests and at build time.
 */
import { ArrayTable, type SheetGrid } from '../engine/table';
import { UserFacingError, type ColumnInfo } from '../engine/types';
import { parseCsv, type DelimiterChoice } from './csv';
import type { EncodingChoice } from './encoding';
import { DEFAULT_LIMITS, formatBytes, type Limits } from './limits';
import { looksLikeOle, looksLikeZip } from './xlsx/zip';
import { XlsxWorkbook, type SheetState } from './xlsx/read';

export type FileKind = 'csv' | 'xlsx';

export interface ParseOptions {
  sheet?: string;
  /** `undefined` = first non-blank row; `null` = the file has no header row; number = source row. */
  headerRow?: number | null;
  delimiter?: DelimiterChoice;
  encoding?: EncodingChoice;
}

export interface SheetInfo {
  name: string;
  state: SheetState;
}

export interface HeaderChoice {
  rowNumber: number;
  cells: string[];
}

export interface FileInfo {
  fileName: string;
  size: number;
  kind: FileKind;
  sheets: SheetInfo[] | null;
  sheet: string | null;
  delimiter: ',' | ';' | '\t' | null;
  delimiterChoice: DelimiterChoice;
  encoding: string | null;
  encodingChoice: EncodingChoice;
  encodingNote: string | null;
  date1904: boolean | null;
  headerRow: number | null;
  headerChoices: HeaderChoice[];
  columns: ColumnInfo[];
  dataRowCount: number;
  skippedBlank: number;
  aboveHeader: number;
  hiddenRows: number;
  hiddenColumns: number;
  preview: { rowNumbers: number[]; rows: string[][] };
  warnings: string[];
  formulaCells: number;
  formulaNoCache: number;
  errorCells: number;
  numericCells: number;
  limits: Limits;
}

export interface LoadedFileData {
  info: FileInfo;
  grid: SheetGrid;
  table: ArrayTable;
  workbook: XlsxWorkbook | null;
}

const REJECT_BY_EXTENSION: Record<string, string> = {
  xls: 'This is the older Excel 97–2003 format (.xls). Open it in Excel and use Save As → Excel Workbook (.xlsx) or CSV, then add that file.',
  xlsm: 'Macro-enabled workbooks (.xlsm) are not opened, so macros can never run. In Excel, use Save As → Excel Workbook (.xlsx) to save a copy without macros.',
  xlsb: 'Binary workbooks (.xlsb) are not supported. In Excel, use Save As → Excel Workbook (.xlsx) or CSV.',
  xltx: 'Excel templates are not supported. Save a copy as a normal .xlsx workbook.',
  xltm: 'Macro-enabled templates are not opened. Save a copy as a normal .xlsx workbook.',
  ods: 'OpenDocument spreadsheets (.ods) are not supported yet. Export the sheet as .xlsx or .csv and add that file.',
  numbers: 'Apple Numbers files are not supported. Export the sheet as .xlsx or .csv and add that file.',
  pdf: 'RowSignal cannot read PDFs (it does no text recognition). Export the data from its source as a CSV or .xlsx file.',
  png: 'RowSignal cannot read images (it does no text recognition). Export the data as a CSV or .xlsx file.',
  jpg: 'RowSignal cannot read images (it does no text recognition). Export the data as a CSV or .xlsx file.',
  jpeg: 'RowSignal cannot read images (it does no text recognition). Export the data as a CSV or .xlsx file.',
  gif: 'RowSignal cannot read images (it does no text recognition). Export the data as a CSV or .xlsx file.',
  webp: 'RowSignal cannot read images (it does no text recognition). Export the data as a CSV or .xlsx file.',
  heic: 'RowSignal cannot read images (it does no text recognition). Export the data as a CSV or .xlsx file.',
  tsv: 'Tab-separated files are read as CSV: rename the file to end in .csv (the tab delimiter is detected automatically).',
  txt: 'Text files are read as CSV: rename the file to end in .csv (the delimiter is detected automatically).',
  zip: 'Compressed archives are not opened. Extract the .csv or .xlsx file first.',
  gz: 'Compressed archives are not opened. Extract the .csv or .xlsx file first.',
  json: 'JSON is not supported. Export the data as a CSV or .xlsx file.',
  xml: 'XML is not supported. Export the data as a CSV or .xlsx file.',
  doc: 'Word documents are not supported. Export the table as a CSV or .xlsx file.',
  docx: 'Word documents are not supported. Export the table as a CSV or .xlsx file.',
};

export function extensionOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

/** Decide how to read a file; throws a user-facing error for anything unsupported. */
export function detectKind(fileName: string, bytes: Uint8Array): FileKind {
  const ext = extensionOf(fileName);
  const reject = REJECT_BY_EXTENSION[ext];
  if (reject) throw new UserFacingError('unsupported-type', reject);
  if (ext !== 'csv' && ext !== 'xlsx') {
    throw new UserFacingError('unsupported-type', `“${fileName}” is not a .csv or .xlsx file. RowSignal reads CSV text files and Excel .xlsx workbooks.`);
  }
  if (bytes.length === 0) throw new UserFacingError('empty-file', `“${fileName}” is empty.`);
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith(0x25, 0x50, 0x44, 0x46)) {
    throw new UserFacingError('unsupported-type', 'This file is a PDF with a different extension. RowSignal cannot read PDFs; export the data as a CSV or .xlsx file.');
  }
  if (startsWith(0x89, 0x50, 0x4e, 0x47) || startsWith(0xff, 0xd8, 0xff) || startsWith(0x47, 0x49, 0x46, 0x38)) {
    throw new UserFacingError('unsupported-type', 'This file is an image with a different extension. RowSignal cannot read images; export the data as a CSV or .xlsx file.');
  }
  if (ext === 'csv') {
    if (looksLikeZip(bytes)) {
      throw new UserFacingError('type-mismatch', 'This file is an Excel workbook (or other ZIP package) saved with a .csv name. Rename it to .xlsx, or save it as a real CSV from Excel.');
    }
    if (looksLikeOle(bytes)) {
      throw new UserFacingError('type-mismatch', 'This file is an Excel file (possibly password-protected or in the old .xls format) with a .csv name. Open it in Excel and save a copy as .xlsx or CSV.');
    }
    return 'csv';
  }
  return 'xlsx';
}

function clipCell(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function loadFileData(
  fileName: string,
  bytes: Uint8Array,
  options: ParseOptions = {},
  limits: Limits = DEFAULT_LIMITS,
  reuse?: { workbook: XlsxWorkbook | null; grid: SheetGrid | null },
): LoadedFileData {
  if (bytes.length > limits.maxFileBytes) {
    throw new UserFacingError('file-too-large', `“${fileName}” is ${formatBytes(bytes.length)}, which is more than the ${formatBytes(limits.maxFileBytes)} limit. Remove unneeded columns or split the file.`);
  }
  const kind = detectKind(fileName, bytes);
  const deadline = Date.now() + limits.maxParseMs;
  const delimiterChoice = options.delimiter ?? 'auto';
  const encodingChoice = options.encoding ?? 'auto';

  let grid: SheetGrid;
  let workbook: XlsxWorkbook | null = null;
  let sheets: SheetInfo[] | null = null;
  let sheet: string | null = null;
  let delimiter: ',' | ';' | '\t' | null = null;
  let encoding: string | null = null;
  let encodingNote: string | null = null;
  const warnings: string[] = [];

  if (kind === 'csv') {
    const r = parseCsv(bytes, delimiterChoice, encodingChoice, limits);
    grid = r.grid;
    delimiter = r.delimiter;
    encoding = r.decoded.encoding;
    encodingNote = r.decoded.note ?? null;
    warnings.push(...r.warnings);
  } else {
    workbook = reuse?.workbook ?? XlsxWorkbook.open(bytes, limits);
    sheets = workbook.sheets.map((s) => ({ name: s.name, state: s.state }));
    sheet = options.sheet && workbook.sheets.some((s) => s.name === options.sheet) ? options.sheet : workbook.defaultSheet().name;
    grid = reuse?.grid && reuse.grid.sheetName === sheet ? reuse.grid : workbook.readSheet(sheet, limits, deadline);
    const meta = workbook.sheets.find((s) => s.name === sheet)!;
    if (meta.state !== 'visible') warnings.push(`The sheet “${sheet}” is hidden in the workbook. It was read because you selected it.`);
    if (workbook.hasMacros) warnings.push('This workbook contains macros. They are ignored and never run.');
    if (workbook.hasExternalLinks) warnings.push('This workbook links to other workbooks. The links are not followed; the values saved in this file are used.');
  }

  if (grid.rows.length === 0) {
    throw new UserFacingError('no-data', `“${fileName}” has no data${sheet ? ` on the sheet “${sheet}”` : ''}. Choose another sheet or file.`);
  }

  const headerRow = options.headerRow === undefined ? grid.rowNumbers[0]! : options.headerRow;
  const table = new ArrayTable(grid, headerRow);

  if (grid.formulaCells > 0) {
    warnings.push(`${grid.formulaCells.toLocaleString('en-US')} cells contain formulas. RowSignal compares the values saved in the file; it never recalculates or runs formulas.`);
  }
  if (grid.formulaNoCache > 0) {
    warnings.push(`${grid.formulaNoCache.toLocaleString('en-US')} formula cells have no saved result and cannot be compared. In Excel, copy those columns and paste them back as values, then save again.`);
  }
  if (grid.errorCells > 0) warnings.push(`${grid.errorCells.toLocaleString('en-US')} cells contain error values such as #N/A. Rows that depend on them are flagged, not matched.`);
  if (grid.hiddenRows > 0) warnings.push(`${grid.hiddenRows.toLocaleString('en-US')} hidden rows are included in the comparison (hidden rows are not skipped).`);
  if (grid.hiddenColumns.length > 0) warnings.push(`${grid.hiddenColumns.length} hidden columns can still be chosen in the match rules.`);
  if (table.aboveHeader > 0) warnings.push(`${table.aboveHeader} row${table.aboveHeader === 1 ? '' : 's'} above the header row ${table.aboveHeader === 1 ? 'is' : 'are'} ignored.`);
  if (table.skippedBlank > 0) warnings.push(`${table.skippedBlank.toLocaleString('en-US')} blank row${table.skippedBlank === 1 ? ' was' : 's were'} skipped.`);
  if (table.rowCount === 0) warnings.push('There are no data rows below the header row.');
  const dupHeaders = [...new Set(table.columns.filter((c) => c.header !== '' && table.columns.some((o) => o !== c && o.header === c.header)).map((c) => c.header))];
  if (dupHeaders.length > 0) {
    warnings.push(`Some columns share a header (${dupHeaders.slice(0, 3).map((h) => `“${clipCell(h, 24)}”`).join(', ')}). They are told apart by column letter.`);
  }

  const headerChoices: HeaderChoice[] = [];
  for (let g = 0; g < Math.min(30, grid.rows.length); g++) {
    headerChoices.push({ rowNumber: grid.rowNumbers[g]!, cells: grid.rows[g]!.slice(0, 8).map((c) => clipCell(c, 40)) });
  }
  const previewRows: string[][] = [];
  const previewNumbers: number[] = [];
  for (let i = 0; i < Math.min(8, table.rowCount); i++) {
    previewNumbers.push(table.rowNumber(i));
    const row: string[] = [];
    for (let c = 0; c < table.columns.length; c++) row.push(clipCell(table.text(i, c), 200));
    previewRows.push(row);
  }

  const info: FileInfo = {
    fileName,
    size: bytes.length,
    kind,
    sheets,
    sheet,
    delimiter,
    delimiterChoice,
    encoding,
    encodingChoice,
    encodingNote,
    date1904: workbook ? workbook.date1904 : null,
    headerRow,
    headerChoices,
    columns: table.columns,
    dataRowCount: table.rowCount,
    skippedBlank: table.skippedBlank,
    aboveHeader: table.aboveHeader,
    hiddenRows: grid.hiddenRows,
    hiddenColumns: grid.hiddenColumns.length,
    preview: { rowNumbers: previewNumbers, rows: previewRows },
    warnings,
    formulaCells: grid.formulaCells,
    formulaNoCache: grid.formulaNoCache,
    errorCells: grid.errorCells,
    numericCells: grid.numericCells,
    limits,
  };
  return { info, grid, table, workbook };
}
