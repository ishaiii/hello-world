/**
 * Builds result exports (CSV or XLSX) from an engine result. Source values are written exactly as
 * found; compared ("normalised") values are optional and clearly labelled. Nothing is uploaded.
 */
import type { Canon } from '../engine/values';
import { describeFieldRule, describeKeyRule } from '../engine/values';
import type { Comparer } from '../engine/comparer';
import type { ComparisonResult, FieldRule, ResultRow, Role } from '../engine/types';
import { toCsv } from './safeText';
import { buildXlsx, type XCell, type XSheet } from './xlsxWriter';

export interface Annotation {
  flag: 'followup' | 'reviewed' | null;
  note: string;
}

export interface ExportOptions {
  format: 'csv' | 'xlsx';
  /** `filtered` uses `rowIds`; `all` ignores it. */
  scope: 'all' | 'filtered';
  rowIds?: readonly string[] | null;
  /** Compared fields to include (by rule id); `null` = all mapped fields. */
  fieldIds: readonly string[] | null;
  includeNormalized: boolean;
  includeReasons: boolean;
  includeRowRefs: boolean;
  includeReview: boolean;
  /** XLSX only. */
  includeRules: boolean;
  roleNames: Record<Role, string>;
  fileNames: Record<Role, string>;
  sheetNames: Record<Role, string | null>;
}

export interface BuiltExport {
  bytes: Uint8Array;
  filename: string;
  mime: string;
  /** Result rows included (groups and single rows; pairs count once). */
  resultRows: number;
  notes: string[];
}

type Mode = 'both' | 'A' | 'B';

interface Rec {
  row: ResultRow;
  mode: Mode;
  aIdx?: number;
  bIdx?: number;
  result: string;
  extra?: string;
}

const REVIEW_LABEL: Record<string, string> = { followup: 'Needs follow-up', reviewed: 'Reviewed' };

function resultLabel(r: ResultRow): string {
  switch (r.category) {
    case 'matched':
      return 'Matched';
    case 'different':
      return 'Different';
    case 'only-a':
      return 'Only in File A';
    case 'only-b':
      return 'Only in File B';
    case 'ambiguous':
      return 'Duplicate key';
    case 'invalid':
      return `Invalid key (File ${r.side})`;
  }
}

function expand(rows: readonly ResultRow[]): Rec[] {
  const out: Rec[] = [];
  for (const row of rows) {
    const result = resultLabel(row);
    if (row.category === 'matched' || row.category === 'different') {
      out.push({ row, mode: 'both', aIdx: row.aIdx[0], bIdx: row.bIdx[0], result });
    } else if (row.category === 'only-a') {
      out.push({ row, mode: 'A', aIdx: row.aIdx[0], result });
    } else if (row.category === 'only-b') {
      out.push({ row, mode: 'B', bIdx: row.bIdx[0], result });
    } else if (row.category === 'ambiguous') {
      const extra = `${row.aIdx.length} in File A, ${row.bIdx.length} in File B`;
      for (const i of row.aIdx) out.push({ row, mode: 'both', aIdx: i, result, extra });
      for (const i of row.bIdx) out.push({ row, mode: 'both', bIdx: i, result, extra });
    } else {
      out.push({ row, mode: 'both', aIdx: row.aIdx[0], bIdx: row.bIdx[0], result });
    }
  }
  return out;
}

function canonCell(c: Canon, numeric: boolean): XCell {
  if (c.t === 'blank') return '';
  if (c.t === 'bad') return 'unreadable';
  if (numeric && c.dec) {
    const digits = c.v.replace(/^-/, '').replace('.', '').replace(/^0+/, '');
    if (digits.length <= 15) return Number(c.v);
  }
  return c.v;
}

export function buildExport(
  result: ComparisonResult,
  cmp: Comparer,
  opts: ExportOptions,
  annotations: Readonly<Record<string, Annotation>>,
  now: Date = new Date(),
): BuiltExport {
  const config = result.config;
  const fields: Array<{ rule: FieldRule; index: number }> = config.fields
    .map((rule, index) => ({ rule, index }))
    .filter((f) => opts.fieldIds === null || opts.fieldIds.includes(f.rule.id));

  const wanted = opts.scope === 'filtered' && opts.rowIds ? new Set(opts.rowIds) : null;
  const rows = wanted ? result.rows.filter((r) => wanted.has(r.id)) : result.rows;
  const recs = expand(rows);
  const notes: string[] = [];

  const header = (mode: Mode, grouped: boolean): string[] => {
    const h: string[] = ['Result'];
    if (mode === 'both') h.push('How paired');
    if (grouped) h.push('Rows with this key');
    for (const k of config.keys) {
      if (mode !== 'B') h.push(`${k.label} (File A)`);
      if (mode !== 'A') h.push(`${k.label} (File B)`);
    }
    if (opts.includeRowRefs) {
      if (mode !== 'B') h.push('Row in File A');
      if (mode !== 'A') h.push('Row in File B');
    }
    for (const { rule } of fields) {
      if (mode !== 'B') h.push(`${rule.label} (File A)`);
      if (mode !== 'A') h.push(`${rule.label} (File B)`);
      if (opts.includeNormalized) {
        if (mode !== 'B') h.push(`${rule.label} (File A, as compared)`);
        if (mode !== 'A') h.push(`${rule.label} (File B, as compared)`);
      }
    }
    if (mode === 'both') h.push('Differing fields');
    if (opts.includeReasons) h.push('Reasons');
    if (opts.includeReview) h.push('Review status', 'Review note');
    return h;
  };

  const cells = (rec: Rec, mode: Mode, grouped: boolean, typed: boolean): XCell[] => {
    const { row } = rec;
    const out: XCell[] = [rec.result];
    if (mode === 'both') out.push(row.category === 'matched' || row.category === 'different' ? (row.provenance === 'manual' ? 'Manually linked' : 'Exact key') : '');
    if (grouped) out.push(rec.extra ?? '');
    const hasA = rec.aIdx !== undefined;
    const hasB = rec.bIdx !== undefined;
    for (let k = 0; k < config.keys.length; k++) {
      if (mode !== 'B') out.push(hasA ? cmp.table('A').text(rec.aIdx!, cmp.keyCols.A[k]!) : '');
      if (mode !== 'A') out.push(hasB ? cmp.table('B').text(rec.bIdx!, cmp.keyCols.B[k]!) : '');
    }
    if (opts.includeRowRefs) {
      if (mode !== 'B') out.push(hasA ? (typed ? cmp.a.rowNumber(rec.aIdx!) : String(cmp.a.rowNumber(rec.aIdx!))) : '');
      if (mode !== 'A') out.push(hasB ? (typed ? cmp.b.rowNumber(rec.bIdx!) : String(cmp.b.rowNumber(rec.bIdx!))) : '');
    }
    const pair = hasA && hasB && (row.category === 'matched' || row.category === 'different');
    const differing: string[] = [];
    for (const { rule, index } of fields) {
      const numeric = rule.kind === 'number' && typed;
      if (mode !== 'B') out.push(hasA ? cmp.table('A').text(rec.aIdx!, cmp.fieldCols.A[index]!) : '');
      if (mode !== 'A') out.push(hasB ? cmp.table('B').text(rec.bIdx!, cmp.fieldCols.B[index]!) : '');
      if (opts.includeNormalized) {
        if (mode !== 'B') out.push(hasA ? nc(cmp.canonField('A', index, rec.aIdx!), numeric, typed) : '');
        if (mode !== 'A') out.push(hasB ? nc(cmp.canonField('B', index, rec.bIdx!), numeric, typed) : '');
      }
      if (pair && row.status && row.status[index] !== 's') differing.push(rule.label);
    }
    if (mode === 'both') out.push(differing.join(', '));
    if (opts.includeReasons) out.push(row.reasons.join('\n'));
    if (opts.includeReview) {
      const a = annotations[row.id];
      out.push(a?.flag ? REVIEW_LABEL[a.flag]! : '', a?.note ?? '');
    }
    return out;
  };
  const nc = (c: Canon, numeric: boolean, typed: boolean): XCell => {
    const v = canonCell(c, numeric);
    return typed || typeof v === 'string' ? v : String(v);
  };

  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const base = `rowsignal-results-${stamp}`;

  if (opts.format === 'csv') {
    const grouped = recs.some((r) => r.row.category === 'ambiguous');
    const table: string[][] = [header('both', grouped)];
    for (const rec of recs) table.push(cells(rec, 'both', grouped, false).map((c) => String(c ?? '')));
    if (opts.includeRules) notes.push('The rules summary is only available in Excel (.xlsx) exports.');
    return {
      bytes: new TextEncoder().encode(toCsv(table)),
      filename: `${base}.csv`,
      mime: 'text/csv;charset=utf-8',
      resultRows: rows.length,
      notes,
    };
  }

  // ---- XLSX
  const headRow = (labels: string[]): XCell[] => labels.map((v) => ({ v, style: 'header' as const }));
  const widths = (labels: string[]) => labels.map((l) => Math.min(40, Math.max(12, l.length + 3)));
  const sheetFor = (name: string, mode: Mode, list: Rec[], grouped = false): XSheet => {
    const h = header(mode, grouped);
    return {
      name,
      rows: [headRow(h), ...list.map((r) => cells(r, mode, grouped, true))],
      colWidths: widths(h),
      freezeRows: 1,
      autoFilter: true,
    };
  };
  const by = (pred: (r: Rec) => boolean) => recs.filter(pred);
  const sheets: XSheet[] = [];
  sheets.push(summarySheet(result, rows, opts, annotations, wanted !== null, now));
  sheets.push(sheetFor('Paired results', 'both', by((r) => r.row.category === 'matched' || r.row.category === 'different')));
  sheets.push(sheetFor('Only in File A', 'A', by((r) => r.row.category === 'only-a')));
  sheets.push(sheetFor('Only in File B', 'B', by((r) => r.row.category === 'only-b')));
  sheets.push(sheetFor('Ambiguous keys', 'both', by((r) => r.row.category === 'ambiguous'), true));
  sheets.push(sheetFor('Invalid keys', 'both', by((r) => r.row.category === 'invalid')));
  if (opts.includeRules) sheets.push(rulesSheet(result, opts, cmp));
  return {
    bytes: buildXlsx(sheets),
    filename: `${base}.xlsx`,
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    resultRows: rows.length,
    notes,
  };
}

function summarySheet(
  result: ComparisonResult,
  included: readonly ResultRow[],
  opts: ExportOptions,
  annotations: Readonly<Record<string, Annotation>>,
  filtered: boolean,
  now: Date,
): XSheet {
  const s = result.summary;
  const count = (pred: (r: ResultRow) => boolean) => included.filter(pred).length;
  const bold = (v: string): XCell => ({ v, style: 'bold' });
  const head = (labels: string[]): XCell[] => labels.map((v) => ({ v, style: 'header' as const }));
  const rows: XCell[][] = [];
  rows.push([{ v: 'RowSignal comparison results', style: 'bold' }]);
  rows.push(['Exported', now.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + ' (this device’s local time)']);
  rows.push([
    'Contents',
    filtered
      ? `Filtered view: ${included.length.toLocaleString('en-US')} of ${result.rows.length.toLocaleString('en-US')} result rows. The counts below describe the full comparison.`
      : 'All results.',
  ]);
  rows.push([]);
  rows.push(head(['File', 'Name you gave it', 'File name', 'Sheet', 'Rows compared']));
  for (const role of ['A', 'B'] as const) {
    rows.push([`File ${role}`, opts.roleNames[role], opts.fileNames[role], opts.sheetNames[role] ?? '', result.accounting[role].eligible]);
  }
  rows.push([]);
  rows.push(head(['Result', 'In full comparison', 'Unit', 'In this export']));
  rows.push([{ v: 'Matched', style: 'good' }, s.matched, 'pairs', count((r) => r.category === 'matched')]);
  rows.push([{ v: 'Different', style: 'warn' }, s.different, 'pairs', count((r) => r.category === 'different')]);
  rows.push([{ v: 'Only in File A', style: 'warn' }, s.onlyA, 'rows', count((r) => r.category === 'only-a')]);
  rows.push([{ v: 'Only in File B', style: 'warn' }, s.onlyB, 'rows', count((r) => r.category === 'only-b')]);
  rows.push([
    { v: 'Duplicate keys', style: 'warn' },
    s.ambiguousGroups,
    `groups (${s.ambiguousRowsA} rows in File A, ${s.ambiguousRowsB} in File B)`,
    count((r) => r.category === 'ambiguous'),
  ]);
  rows.push([
    { v: 'Invalid keys', style: 'bad' },
    s.invalidA + s.invalidB,
    `rows (${s.invalidA} in File A, ${s.invalidB} in File B)`,
    count((r) => r.category === 'invalid'),
  ]);
  rows.push([]);
  rows.push([bold('Row accounting (every compared row appears exactly once)')]);
  rows.push(head(['', 'Rows compared', 'In exact pairs', 'In manual links', 'Only in this file', 'In duplicate groups', 'Invalid keys', 'Total', 'Balanced']));
  for (const role of ['A', 'B'] as const) {
    const a = result.accounting[role];
    rows.push([`File ${role}`, a.eligible, a.pairedExact, a.pairedManual, a.only, a.ambiguousRows, a.invalid, a.total, a.balanced ? 'Yes' : 'NO — check this export']);
  }
  rows.push([]);
  rows.push([bold('Notes')]);
  const notes = [
    'Values are written exactly as found in your files. Identifiers keep leading zeros because they are stored as text.',
    'Text that could be read as a spreadsheet formula is stored as literal text, never as a formula.',
    s.manualPairs > 0
      ? `${s.manualPairs} pair${s.manualPairs === 1 ? ' was' : 's were'} linked manually by you (not exact key matches). They are labelled “Manually linked”.`
      : 'No pairs were linked manually.',
    opts.includeReview
      ? `Review notes are included for ${Object.values(annotations).filter((a) => a.flag || a.note).length} annotated rows.`
      : 'Review notes and flags are not included in this export.',
  ];
  for (const n of notes) rows.push([n]);
  return { name: 'Summary', rows, colWidths: [28, 26, 30, 22, 18, 20, 16, 12, 22] };
}

function rulesSheet(result: ComparisonResult, opts: ExportOptions, cmp: Comparer): XSheet {
  const { config } = result;
  const colName = (role: Role, id: string) => {
    const c = cmp.table(role).columns.find((x) => x.id === id);
    return c ? `${c.label} (column ${c.letter})` : '(not set)';
  };
  const head = (labels: string[]): XCell[] => labels.map((v) => ({ v, style: 'header' as const }));
  const rows: XCell[][] = [];
  rows.push([{ v: 'Rules applied to this comparison', style: 'bold' }]);
  rows.push([]);
  rows.push(head(['Identifier', 'Column in File A', 'Column in File B', 'Rule']));
  for (const k of config.keys) {
    rows.push([k.label, colName('A', k.aColumn), colName('B', k.bColumn), { v: describeKeyRule(k), style: 'wrap' }]);
  }
  rows.push([]);
  rows.push(head(['Compared value', 'Type', 'Column in File A', 'Column in File B', 'Rule']));
  for (const f of config.fields) {
    rows.push([f.label, f.kind, colName('A', f.aColumn), colName('B', f.bColumn), { v: describeFieldRule(f, config.formats.A, config.formats.B), style: 'wrap' }]);
  }
  rows.push([]);
  rows.push([{ v: 'How RowSignal decides', style: 'bold' }]);
  const facts = [
    'Rows are paired by the identifier columns, in any order. A pair is “Matched” only if every compared value agrees; otherwise it is “Different”.',
    'An identifier that appears more than once in either file is a “Duplicate key”. RowSignal never guesses which rows belong together.',
    'A blank identifier is an “Invalid key” and is never matched.',
    'Numbers are compared as exact decimals, never as floating-point values. No currency or unit conversion is applied.',
    'Dates are compared as calendar days. Day/month order comes from the setting for each file, not from your location.',
    'Formulas are never run; the value saved in the file is compared.',
    `File A is “${opts.roleNames.A}”, File B is “${opts.roleNames.B}”.`,
  ];
  for (const t of facts) rows.push([{ v: t, style: 'wrap' }]);
  return { name: 'Rules', rows, colWidths: [28, 22, 26, 26, 90] };
}
