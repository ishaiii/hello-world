/**
 * Everything the "Match rules" step needs to show before a comparison runs: suggested column
 * pairs (always to be confirmed), per-column profiles, key uniqueness, unreadable-value counts and
 * decisions that are still missing. Suggestions are never applied silently.
 */
import { isoDatePart } from './dates';
import { Comparer, checkpoint } from './comparer';
import { validateConfig, type ConfigIssue } from './config';
import { canonicalize } from './values';
import {
  CELL_DATE,
  CELL_NUMBER,
  NO_HOOKS,
  type ColumnInfo,
  type DateOrder,
  type FieldKind,
  type FileFormat,
  type JobHooks,
  type KeyStats,
  type MatchConfig,
  type Role,
  type TableData,
} from './types';

// ---------------------------------------------------------------------------------------------
// Column profiles and type inference
// ---------------------------------------------------------------------------------------------

export interface ColumnProfile {
  sampled: number;
  nonBlank: number;
  unique: number;
  numeric: number;
  dateLike: number;
  typedNumber: number;
  typedDate: number;
  leadingZero: number;
  outerSpace: number;
}

const DATE_SHAPE = /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}(?:[T\s].*)?$|^\d{1,2}[-/.\s][A-Za-z]{3,9}[-/.,\s]+\d{4}$/;
const NUM_SHAPE = /^[+-]?[\d,. ]*\d(?:[eE][+-]?\d+)?$/;

export function profileColumn(t: TableData, col: number, sample = 2000): ColumnProfile {
  const seen = new Set<string>();
  const p: ColumnProfile = { sampled: 0, nonBlank: 0, unique: 0, numeric: 0, dateLike: 0, typedNumber: 0, typedDate: 0, leadingZero: 0, outerSpace: 0 };
  const n = Math.min(t.rowCount, sample);
  for (let i = 0; i < n; i++) {
    p.sampled++;
    const raw = t.text(i, col);
    const v = raw.trim();
    if (v === '') continue;
    p.nonBlank++;
    seen.add(v);
    const fl = t.flags(i, col);
    if (fl & CELL_NUMBER) p.typedNumber++;
    if (fl & CELL_DATE) p.typedDate++;
    if (raw !== v) p.outerSpace++;
    if (/^0\d+$/.test(v)) p.leadingZero++;
    if (NUM_SHAPE.test(v)) p.numeric++;
    if (DATE_SHAPE.test(v) || isoDatePart(v)) p.dateLike++;
  }
  p.unique = seen.size;
  return p;
}

export function inferKind(p: ColumnProfile): FieldKind {
  if (p.nonBlank === 0) return 'text';
  if (p.typedDate / p.nonBlank >= 0.9 || p.dateLike / p.nonBlank >= 0.9) return 'date';
  if (p.leadingZero > 0) return 'identifier';
  if (p.typedNumber / p.nonBlank >= 0.9 || p.numeric / p.nonBlank >= 0.9) return 'number';
  return 'text';
}

export interface DateOrderGuess {
  order: DateOrder | null;
  evidence: string;
  /** False when the values are consistent with more than one order (or contradict each other). */
  confident: boolean;
}

/** Look for a day above 12 in either position; with no such value the order is genuinely ambiguous. */
export function detectDateOrder(t: TableData, col: number, sample = 5000): DateOrderGuess {
  let first = 0;
  let second = 0;
  let any = 0;
  let yearFirst = 0;
  const n = Math.min(t.rowCount, sample);
  for (let i = 0; i < n; i++) {
    if (t.flags(i, col) & CELL_DATE) continue;
    const m = /^\s*(\d{1,4})[-/.](\d{1,2})[-/.](\d{1,4})/.exec(t.text(i, col));
    if (!m) continue;
    if (m[1]!.length === 4) {
      yearFirst++;
      continue;
    }
    any++;
    if (Number(m[1]) > 12) first++;
    if (Number(m[2]) > 12) second++;
  }
  if (any === 0) {
    return yearFirst > 0
      ? { order: 'YMD', evidence: 'Dates are written year-first, which is unambiguous.', confident: true }
      : { order: null, evidence: 'No day/month dates found to inspect.', confident: false };
  }
  if (first > 0 && second === 0) return { order: 'DMY', evidence: `${first} date${first === 1 ? '' : 's'} have a first number above 12, so the day comes first.`, confident: true };
  if (second > 0 && first === 0) return { order: 'MDY', evidence: `${second} date${second === 1 ? '' : 's'} have a second number above 12, so the month comes first.`, confident: true };
  if (first > 0 && second > 0) return { order: null, evidence: 'Some dates have a first number above 12 and others a second number above 12; the column mixes formats.', confident: false };
  return { order: null, evidence: 'Every date has both numbers 12 or below, so day-first and month-first both fit. Choose the one this file uses.', confident: false };
}

export function detectNumberFormat(t: TableData, col: number, sample = 2000): Pick<FileFormat, 'decimal' | 'thousands'> | null {
  let eu = 0;
  let us = 0;
  const n = Math.min(t.rowCount, sample);
  for (let i = 0; i < n; i++) {
    if (t.flags(i, col) & CELL_NUMBER) continue;
    const v = t.text(i, col).trim();
    if (/^[+-]?\d{1,3}(\.\d{3})+,\d+$/.test(v) || /^[+-]?\d+,\d{1,2}$/.test(v)) eu++;
    else if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(v) || /^[+-]?\d+\.\d+$/.test(v)) us++;
  }
  if (eu > 0 && us === 0) return { decimal: ',', thousands: '.' };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Header-based mapping suggestions
// ---------------------------------------------------------------------------------------------

const SYNONYMS: Record<string, string> = {
  qty: 'quantity', quantity: 'quantity', units: 'quantity', count: 'quantity', pieces: 'quantity', pcs: 'quantity', stock: 'quantity', onhand: 'quantity',
  no: 'id', num: 'id', number: 'id', id: 'id', ref: 'id', reference: 'id', code: 'id', '#': 'id',
  amount: 'amount', total: 'amount', sum: 'amount', value: 'amount',
  date: 'date', dated: 'date', day: 'date',
  sku: 'sku', product: 'sku', item: 'sku', article: 'sku', part: 'sku',
  email: 'email', mail: 'email',
  name: 'name', title: 'name', description: 'name',
  price: 'price', rate: 'price', cost: 'price', mrp: 'price',
};

const STOP = new Set(['the', 'of', 'a', 'an']);

function headerTokens(h: string): string[] {
  const spaced = h.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const toks = spaced.split(/[^a-z0-9#]+/).filter((x) => x && !STOP.has(x));
  return toks.map((t) => SYNONYMS[t] ?? t);
}

function headerScore(a: string, b: string): number {
  const na = a.trim().toLowerCase();
  const nb = b.trim().toLowerCase();
  if (na === '' || nb === '') return 0;
  if (na === nb) return 1;
  const ta = new Set(headerTokens(a));
  const tb = new Set(headerTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return inter / union;
}

export interface PairSuggestion {
  aColumn: string;
  bColumn: string;
  label: string;
  score: number;
  kind: FieldKind;
  aUniqueness: number;
  bUniqueness: number;
}

export interface MappingSuggestion {
  keys: PairSuggestion[];
  fields: PairSuggestion[];
}

const uniq = (p: ColumnProfile) => (p.nonBlank === 0 ? 0 : p.unique / p.nonBlank);

/** Suggest column pairs from header names and value shapes. The user must confirm every pair. */
export function suggestMapping(a: TableData, b: TableData): MappingSuggestion {
  const pa = a.columns.map((c) => profileColumn(a, c.index));
  const pb = b.columns.map((c) => profileColumn(b, c.index));
  const cand: Array<{ i: number; j: number; score: number }> = [];
  for (const ca of a.columns) {
    for (const cb of b.columns) {
      const s = headerScore(ca.header, cb.header);
      if (s >= 0.34) cand.push({ i: ca.index, j: cb.index, score: s });
    }
  }
  cand.sort((x, y) => y.score - x.score || x.i - y.i || x.j - y.j);
  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const pairs: PairSuggestion[] = [];
  for (const c of cand) {
    if (usedA.has(c.i) || usedB.has(c.j)) continue;
    usedA.add(c.i);
    usedB.add(c.j);
    const ka = inferKind(pa[c.i]!);
    const kb = inferKind(pb[c.j]!);
    const kind: FieldKind = ka === kb ? ka : ka === 'text' || kb === 'text' ? 'text' : ka === 'identifier' || kb === 'identifier' ? 'identifier' : 'text';
    pairs.push({
      aColumn: a.columns[c.i]!.id,
      bColumn: b.columns[c.j]!.id,
      label: a.columns[c.i]!.header || a.columns[c.i]!.label,
      score: c.score,
      kind,
      aUniqueness: uniq(pa[c.i]!),
      bUniqueness: uniq(pb[c.j]!),
    });
  }
  // A key is a pair that looks like an identifier and is (nearly) unique on both sides.
  const idish = (p: PairSuggestion) => {
    const ta = headerTokens(a.columns.find((c) => c.id === p.aColumn)!.header);
    return ta.includes('id') || ta.includes('sku') || ta.includes('email');
  };
  const keyCands = pairs.filter((p) => p.aUniqueness >= 0.95 && p.bUniqueness >= 0.95 && (idish(p) || p.kind === 'identifier'));
  keyCands.sort((x, y) => Number(idish(y)) - Number(idish(x)) || y.score - x.score);
  const key = keyCands[0];
  const keys = key ? [{ ...key, kind: 'identifier' as FieldKind }] : [];
  const fields = pairs.filter((p) => p !== key);
  return { keys, fields };
}

// ---------------------------------------------------------------------------------------------
// Analysis of a confirmed (or draft) configuration
// ---------------------------------------------------------------------------------------------

export interface FieldIssue {
  fieldId: string;
  role: Role;
  unreadable: number;
  blank: number;
  examples: string[];
}

export interface KeyHint {
  keyId: string;
  role: Role;
  outerSpaceValues: number;
  numericStoredValues: number;
}

export interface Analysis {
  keyStats: Record<Role, KeyStats>;
  /** Identifiers present in both files / only in A / only in B (distinct valid keys). */
  overlap: { both: number; onlyA: number; onlyB: number };
  keyHints: KeyHint[];
  fieldIssues: FieldIssue[];
  /** Decisions still missing before a comparison can run. */
  issues: ConfigIssue[];
  /** Files in which every mapped date column holds real Excel dates, so no format is needed. */
  dateOrderNeeded: Record<Role, boolean>;
}

export async function analyzeConfig(a: TableData, b: TableData, config: MatchConfig, hooks: JobHooks = NO_HOOKS): Promise<Analysis> {
  const issues = validateConfig(config, { A: a.columns, B: b.columns });
  const blocking = issues.some((i) => i.blocking && (i.code === 'key-column-missing' || i.code === 'field-column-missing' || i.code === 'no-key'));
  const empty: KeyStats = { rows: 0, blankKeys: 0, duplicateKeyRows: 0, duplicateKeyGroups: 0, uniqueKeys: 0 };
  const dateOrderNeeded: Record<Role, boolean> = { A: false, B: false };

  const tables: Record<Role, TableData> = { A: a, B: b };
  const colOf = (role: Role, id: string): number => tables[role].columns.findIndex((c: ColumnInfo) => c.id === id);

  // Which dates need a chosen format: only text dates do; real Excel dates are unambiguous.
  for (const f of config.fields) {
    if (f.kind !== 'date') continue;
    for (const role of ['A', 'B'] as const) {
      const col = colOf(role, role === 'A' ? f.aColumn : f.bColumn);
      if (col < 0) continue;
      const t = tables[role];
      const n = Math.min(t.rowCount, 5000);
      for (let i = 0; i < n; i++) {
        const text = t.text(i, col);
        if (text.trim() !== '' && !(t.flags(i, col) & CELL_DATE) && !isoDatePart(text.trim()) && /^\s*\d{1,2}[-/.]\d{1,2}[-/.]\d{4}/.test(text)) {
          dateOrderNeeded[role] = true;
          break;
        }
      }
      if (dateOrderNeeded[role] && config.formats[role].dateOrder === null) {
        issues.push({ code: 'date-format-missing', blocking: true, target: role, message: `Choose how dates are written in File ${role} (day first or month first).` });
      }
    }
  }
  if (blocking) {
    return { keyStats: { A: empty, B: empty }, overlap: { both: 0, onlyA: 0, onlyB: 0 }, keyHints: [], fieldIssues: [], issues, dateOrderNeeded };
  }

  const cmp = new Comparer(a, b, config);
  const ia = await cmp.buildKeyIndex('A', hooks);
  const ib = await cmp.buildKeyIndex('B', hooks);
  let both = 0;
  let onlyA = 0;
  for (const k of ia.groups.keys()) {
    if (ib.groups.has(k)) both++;
    else onlyA++;
  }
  const onlyB = ib.groups.size - both;

  const keyHints: KeyHint[] = [];
  config.keys.forEach((k, ki) => {
    for (const role of ['A', 'B'] as const) {
      const t = tables[role];
      const col = cmp.keyCols[role][ki]!;
      let outer = 0;
      let numeric = 0;
      for (let i = 0; i < t.rowCount; i++) {
        const v = t.text(i, col);
        if (v !== v.trim() && v.trim() !== '') outer++;
        if (t.flags(i, col) & CELL_NUMBER) numeric++;
      }
      keyHints.push({ keyId: k.id, role, outerSpaceValues: k.trim ? 0 : outer, numericStoredValues: numeric });
    }
  });

  const fieldIssues: FieldIssue[] = [];
  for (let f = 0; f < config.fields.length; f++) {
    const rule = config.fields[f]!;
    for (const role of ['A', 'B'] as const) {
      const t = tables[role];
      const col = cmp.fieldCols[role][f]!;
      let unreadable = 0;
      let blank = 0;
      const examples: string[] = [];
      for (let i = 0; i < t.rowCount; i++) {
        await checkpoint(hooks, i, 8192);
        const c = canonicalize(t.text(i, col), t.flags(i, col), rule.kind, rule, config.formats[role]);
        if (c.t === 'blank') blank++;
        else if (c.t === 'bad') {
          unreadable++;
          if (examples.length < 3 && !examples.includes(c.why)) examples.push(c.why);
        }
      }
      fieldIssues.push({ fieldId: rule.id, role, unreadable, blank, examples });
    }
  }
  return { keyStats: { A: ia.stats, B: ib.stats }, overlap: { both, onlyA, onlyB }, keyHints, fieldIssues, issues, dateOrderNeeded };
}

