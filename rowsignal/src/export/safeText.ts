/**
 * Spreadsheet formula-injection policy for exported text.
 *
 * Opening a CSV in a spreadsheet application can evaluate any cell whose text starts with a
 * formula character. CSV quoting alone does not prevent that, so for CSV every untrusted text
 * value that could be read as a formula is prefixed with a single apostrophe:
 *
 *   • text starting with `=` or `@`, a tab, CR or LF, or a full-width `＝ ＋ － ＠`  → prefixed
 *   • text starting with `+` or `-` → prefixed UNLESS it is a plain numeric literal
 *     (digits, grouping commas, one decimal point, optional exponent), so real negative numbers
 *     such as `-12.50` or `-1,200.00` stay readable, while `-2+3`, `+SUM(A1)` and `+91 98765 43210`
 *     are neutralised
 *   • the same tests apply after any leading spaces
 *
 * The apostrophe is visible in the CSV (that is the documented cost of the protection). The
 * original value is never altered inside RowSignal. XLSX output does not need the prefix: text
 * is always written as a literal string cell, never as a formula; cells that begin with a formula
 * character also get Excel's "quote prefix" style so they stay text if edited.
 */

const PLAIN_NUMBER = /^[+-]?[0-9][0-9,]*(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;
const TRIGGERS = new Set(['=', '@', '\t', '\r', '\n', '＝', '＠']);
const SIGNS = new Set(['+', '-', '＋', '－']);

export function startsLikeFormula(text: string): boolean {
  if (text === '') return false;
  const stripped = text.replace(/^[  ]+/, '');
  if (stripped === '') return false;
  const c = stripped[0]!;
  if (TRIGGERS.has(c)) return true;
  if (SIGNS.has(c)) return !PLAIN_NUMBER.test(stripped.trim());
  return false;
}

/** CSV-safe text: neutralises formula-like starts with a visible apostrophe. */
export function neutraliseForCsv(text: string): string {
  return startsLikeFormula(text) ? `'${text}` : text;
}

export function csvField(value: string): string {
  const text = neutraliseForCsv(value);
  if (/[",\r\n]/.test(text) || text !== text.trim()) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** UTF-8 with a byte-order mark and CRLF line endings, which every major spreadsheet app opens correctly. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return '﻿' + rows.map((r) => r.map(csvField).join(',')).join('\r\n') + '\r\n';
}
