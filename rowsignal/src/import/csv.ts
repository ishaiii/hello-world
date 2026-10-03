/**
 * Delimited-text import. Quoting (including delimiters, escaped quotes and line breaks inside
 * quotes) is handled by PapaParse; this module adds delimiter detection, encoding handling,
 * limits, and conversion into a SheetGrid with truthful record numbers.
 */
import Papa from 'papaparse';
import { isBlankRow, emptyGrid, type SheetGrid } from '../engine/table';
import { UserFacingError } from '../engine/types';
import { decodeText, type Decoded, type EncodingChoice } from './encoding';
import type { Limits } from './limits';

export type DelimiterChoice = 'auto' | ',' | '\t' | ';';

export const DELIMITER_LABELS: Record<DelimiterChoice, string> = {
  auto: 'Detect automatically',
  ',': 'Comma',
  '\t': 'Tab',
  ';': 'Semicolon',
};

const CANDIDATES: Array<',' | ';' | '\t'> = [',', ';', '\t'];

export function detectDelimiter(text: string): ',' | ';' | '\t' {
  let sample = text.slice(0, 64 * 1024);
  const lastNl = Math.max(sample.lastIndexOf('\n'), sample.lastIndexOf('\r'));
  if (lastNl > 0 && text.length > sample.length) sample = sample.slice(0, lastNl);
  let best: ',' | ';' | '\t' = ',';
  let bestScore = 0;
  for (const cand of CANDIDATES) {
    const res = Papa.parse<string[]>(sample, { delimiter: cand, quoteChar: '"', escapeChar: '"', skipEmptyLines: true, preview: 40 });
    const counts = new Map<number, number>();
    for (const row of res.data) counts.set(row.length, (counts.get(row.length) ?? 0) + 1);
    let modal = 0;
    let freq = 0;
    for (const [len, f] of counts) {
      if (f > freq || (f === freq && len > modal)) {
        modal = len;
        freq = f;
      }
    }
    if (modal < 2 || res.data.length === 0) continue;
    const score = (freq / res.data.length) * (modal - 1);
    if (score > bestScore) {
      bestScore = score;
      best = cand;
    }
  }
  return best;
}

export interface CsvResult {
  grid: SheetGrid;
  delimiter: ',' | ';' | '\t';
  decoded: Decoded;
  warnings: string[];
}

export function parseCsv(bytes: Uint8Array, delimiterChoice: DelimiterChoice, encoding: EncodingChoice, limits: Limits): CsvResult {
  if (bytes.length > 0 && bytes.subarray(0, 4096).includes(0) && encoding === 'auto') {
    // NUL bytes that are not a UTF-16 pattern mean this is not a text file.
    const probe = decodeText(bytes, 'auto');
    if (probe.encoding !== 'utf-16le' && probe.encoding !== 'utf-16be') {
      throw new UserFacingError('csv-binary', 'This file does not look like text. It may be a spreadsheet or another binary format saved with a .csv name.');
    }
  }
  const decoded = decodeText(bytes, encoding);
  let text = decoded.text;
  const warnings: string[] = [];

  // Excel can write a first line "sep=;" to declare the delimiter; it is not a data row in Excel.
  let delimiter: ',' | ';' | '\t';
  const sep = /^sep=(.)\r?\n/i.exec(text);
  if (sep && (sep[1] === ',' || sep[1] === ';' || sep[1] === '\t')) {
    delimiter = delimiterChoice === 'auto' ? sep[1] : delimiterChoice;
    text = text.slice(sep[0].length);
  } else {
    delimiter = delimiterChoice === 'auto' ? detectDelimiter(text) : delimiterChoice;
  }

  const cap = limits.maxRows + 10_000;
  const res = Papa.parse<string[]>(text, {
    delimiter,
    quoteChar: '"',
    escapeChar: '"',
    skipEmptyLines: false,
    header: false,
    preview: cap,
  });
  if (res.meta.truncated) {
    throw new UserFacingError('too-many-rows', `This file has more than ${limits.maxRows.toLocaleString('en-US')} rows. RowSignal reads up to ${limits.maxRows.toLocaleString('en-US')} rows per file; filter or split the data first.`);
  }

  const grid = emptyGrid(null);
  let populated = 0;
  let maxCol = 0;
  for (let i = 0; i < res.data.length; i++) {
    const row = res.data[i]!;
    if (isBlankRow(row)) continue;
    if (grid.rows.length >= limits.maxRows + 1) {
      throw new UserFacingError('too-many-rows', `This file has more than ${limits.maxRows.toLocaleString('en-US')} rows. RowSignal reads up to ${limits.maxRows.toLocaleString('en-US')} rows per file; filter or split the data first.`);
    }
    let last = row.length;
    while (last > 0 && row[last - 1] === '') last--;
    if (last > limits.maxCols) {
      throw new UserFacingError('too-many-columns', `This file has more than ${limits.maxCols} columns. RowSignal reads up to ${limits.maxCols} columns; delete unused columns or split the file.`);
    }
    for (let c = 0; c < last; c++) if (row[c] !== '') populated++;
    if (populated > limits.maxCells) {
      throw new UserFacingError('too-many-cells', `This file has more than ${limits.maxCells.toLocaleString('en-US')} filled cells, which is more than RowSignal reads at once.`);
    }
    grid.rows.push(row);
    grid.rowNumbers.push(i + 1);
    grid.rowFlags.push(null);
    grid.lastRowNumber = i + 1;
    if (last > maxCol) maxCol = last;
  }
  grid.width = maxCol;

  const quoteErrors = res.errors.filter((e) => e.type === 'Quotes').length;
  if (quoteErrors > 0) {
    warnings.push(
      `${quoteErrors} quoting problem${quoteErrors === 1 ? '' : 's'} found (a quote mark that is not closed or not escaped). Rows near it may be merged or split incorrectly; check the file in a text editor.`,
    );
  }
  return { grid, delimiter, decoded, warnings };
}
