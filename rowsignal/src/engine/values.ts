/**
 * Turn a raw cell into a comparable value, using only the rules the user confirmed.
 *
 * Nothing is normalised implicitly: whitespace, case, leading zeros, punctuation and accents are
 * preserved unless the matching option is switched on. Blank cells, zero, the text "NULL" and
 * malformed numbers are four different things.
 */
import {
  decRoundSignificant,
  decToString,
  decWithinTolerance,
  parseDecimal,
  type Dec,
} from './decimal';
import { isoDatePart, parseDateText } from './dates';
import {
  CELL_BOOL,
  CELL_DATE,
  CELL_DATE_INVALID,
  CELL_ERROR,
  CELL_FORMULA_NOCACHE,
  CELL_NUMBER,
  type FieldKind,
  type FieldRule,
  type FieldStatus,
  type FileFormat,
  type KeyRule,
} from './types';

export type Canon =
  | { t: 'blank' }
  | { t: 'value'; v: string; dec?: Dec }
  | { t: 'bad'; why: string };

/** Format used for cells that the file itself stored as numbers (no locale involved). */
export const CANONICAL_FORMAT: FileFormat = { decimal: '.', thousands: 'none', currency: false, dateOrder: null };

const CURRENCY_PREFIX = /^(?:Rs\.?|INR|USD|[$€£₹¥])\s*/i;
const CURRENCY_SUFFIX = /\s*(?:Rs\.?|INR|USD|[$€£₹¥])$/i;
const HAS_CURRENCY = /[$€£₹¥]|\b(?:Rs\.?|INR|USD)\b/i;

const numberRegexCache = new Map<string, RegExp>();

function numberRegex(fmt: FileFormat): RegExp {
  const thousands = fmt.thousands === fmt.decimal ? 'none' : fmt.thousands;
  const key = `${fmt.decimal}|${thousands}`;
  let re = numberRegexCache.get(key);
  if (re) return re;
  const dec = fmt.decimal === '.' ? '\\.' : ',';
  const frac = `(?:${dec}\\d*)?`;
  const exp = '(?:[eE][+-]?\\d+)?';
  const parts = [`\\d+${frac}${exp}`, `${dec}\\d+${exp}`];
  if (thousands !== 'none') {
    const th = thousands === '.' ? '\\.' : thousands === ',' ? ',' : ' ';
    parts.unshift(`\\d{1,3}(?:${th}\\d{3})+${frac}`, `\\d{1,2}(?:${th}\\d{2})*${th}\\d{3}${frac}`);
  }
  re = new RegExp(`^(?:${parts.join('|')})$`);
  numberRegexCache.set(key, re);
  return re;
}

export type NumberParse = { ok: true; dec: Dec } | { ok: false; reason: string };

/** Parse a number written as text using the file's explicit decimal/thousands settings. */
export function parseNumberText(raw: string, fmt: FileFormat): NumberParse {
  let t = raw;
  if (fmt.thousands === ' ') t = t.replace(/[\u00A0\u202F]/g, ' ');
  let neg = false;
  let signed = false;
  if (t.startsWith('+') || t.startsWith('-') || t.startsWith('−')) {
    neg = !t.startsWith('+');
    signed = true;
    t = t.slice(1);
  }
  if (fmt.currency) {
    t = t.replace(CURRENCY_PREFIX, '').replace(CURRENCY_SUFFIX, '');
    if (!signed && (t.startsWith('-') || t.startsWith('+') || t.startsWith('−'))) {
      neg = !t.startsWith('+');
      t = t.slice(1);
    }
  } else if (HAS_CURRENCY.test(t)) {
    return { ok: false, reason: `“${clip(raw)}” contains a currency symbol; turn on “Ignore currency symbols” to read it (no conversion is applied)` };
  }
  if (!numberRegex(fmt).test(t)) {
    if (/^\(.*\)$/.test(t)) return { ok: false, reason: `“${clip(raw)}” uses brackets for a negative number, which is not supported; use a minus sign` };
    if (/\s/.test(t) && fmt.thousands !== ' ') return { ok: false, reason: `“${clip(raw)}” is not a valid number (it contains spaces)` };
    if (fmt.thousands === 'none' && /[,.]/.test(t) && /\d[,.]\d{3}\b/.test(t)) {
      return { ok: false, reason: `“${clip(raw)}” looks like it has thousands separators; choose the separator used in this file` };
    }
    return { ok: false, reason: `“${clip(raw)}” is not a valid number for this file's format` };
  }
  const thousands = fmt.thousands === fmt.decimal ? 'none' : fmt.thousands;
  let plain = t;
  if (thousands !== 'none') plain = plain.split(thousands).join('');
  if (fmt.decimal === ',') plain = plain.replace(',', '.');
  const dec = parseDecimal((neg ? '-' : '') + plain);
  if (!dec) return { ok: false, reason: `“${clip(raw)}” is too large or too long to compare exactly` };
  return { ok: true, dec };
}

/** Text shown inside messages: single line, bounded. */
export function clip(s: string, n = 48): string {
  const one = s.replace(/\s+/g, ' ');
  return one.length > n ? one.slice(0, n - 1) + '…' : one;
}

const TRUE_TOKENS = new Set(['true', 't', 'yes', 'y', '1']);
const FALSE_TOKENS = new Set(['false', 'f', 'no', 'n', '0']);

interface Common {
  trim: boolean;
  caseInsensitive: boolean;
  emptyAsNull: boolean;
}

function structuralProblem(text: string, flags: number): string | null {
  if (flags & CELL_ERROR) return `the cell contains the error value ${text}`;
  if (flags & CELL_FORMULA_NOCACHE) {
    return 'the cell holds a formula with no saved result (in Excel, copy the column and paste as values, then save again)';
  }
  return null;
}

/** Canonical form of one cell under a field rule. */
export function canonicalize(text: string, flags: number, kind: FieldKind, rule: Common, fmt: FileFormat): Canon {
  const problem = structuralProblem(text, flags);
  if (problem) return { t: 'bad', why: problem };
  let s = rule.trim ? text.trim() : text;
  if (s === '' || (rule.emptyAsNull && s.trim() === '')) return { t: 'blank' };

  switch (kind) {
    case 'text':
    case 'identifier':
      return { t: 'value', v: rule.caseInsensitive ? s.toLowerCase() : s };
    case 'number': {
      const typed = (flags & CELL_NUMBER) !== 0;
      const r = parseNumberText(s, typed ? CANONICAL_FORMAT : fmt);
      return r.ok ? { t: 'value', v: decToString(r.dec), dec: r.dec } : { t: 'bad', why: r.reason };
    }
    case 'date': {
      if (flags & CELL_DATE_INVALID) return { t: 'bad', why: 'the date stored in the cell is not a real calendar date' };
      if (flags & CELL_DATE) {
        const d = isoDatePart(s);
        return d ? { t: 'value', v: d } : { t: 'bad', why: 'the cell holds a time of day without a date' };
      }
      if (flags & CELL_NUMBER) {
        return { t: 'bad', why: 'the cell is a plain number, not a date; format it as a date in Excel or save the column as text' };
      }
      const r = parseDateText(s, fmt.dateOrder);
      return r.ok ? { t: 'value', v: r.iso } : { t: 'bad', why: `“${clip(text)}”: ${r.reason}` };
    }
    case 'boolean': {
      s = s.trim().toLowerCase();
      if (flags & CELL_BOOL) return { t: 'value', v: s === 'true' || s === '1' ? 'true' : 'false' };
      if (TRUE_TOKENS.has(s)) return { t: 'value', v: 'true' };
      if (FALSE_TOKENS.has(s)) return { t: 'value', v: 'false' };
      return { t: 'bad', why: `“${clip(text)}” is not a yes/no value (use TRUE/FALSE, yes/no or 1/0)` };
    }
  }
}

export type KeyPart = { ok: true; v: string } | { ok: false; why: string };

/**
 * A key component is always an exact string. It is invalid when empty (or only spaces), or when
 * the cell is an error / formula without a stored result. Leading zeros and digits are untouched.
 */
export function canonicalKeyPart(text: string, flags: number, rule: KeyRule): KeyPart {
  const problem = structuralProblem(text, flags);
  if (problem) return { ok: false, why: problem };
  if (text.trim() === '') return { ok: false, why: 'the identifier is blank' };
  let v = rule.trim ? text.trim() : text;
  if (rule.caseInsensitive) v = v.toLowerCase();
  return { ok: true, v };
}

export interface FieldOutcome {
  status: FieldStatus;
  aNorm: string;
  bNorm: string;
  reason?: string;
}

function show(canon: Canon, raw: string): string {
  if (canon.t === 'blank') return '(blank)';
  if (canon.t === 'bad') return `(unreadable: ${clip(raw)})`;
  return canon.v;
}

/** Which not-yet-enabled options would make two texts equal? Never suggests an option that is already on. */
function reconcilingOptions(a: string, b: string, rule: { trim: boolean; caseInsensitive: boolean }): 'space' | 'case' | 'both' | null {
  const needTrim = !rule.trim;
  const needCase = !rule.caseInsensitive;
  // Start from what the active options already do, then ask what else would make the two equal.
  const base = (x: string) => {
    let y = rule.trim ? x.trim() : x;
    if (rule.caseInsensitive) y = y.toLowerCase();
    return y;
  };
  const a0 = base(a);
  const b0 = base(b);
  if (needTrim && a0.trim() === b0.trim()) return 'space';
  if (needCase && a0.toLowerCase() === b0.toLowerCase()) return 'case';
  if (needTrim && needCase && a0.trim().toLowerCase() === b0.trim().toLowerCase()) return 'both';
  return null;
}

/** Compare two canonical values under a field rule; the reason is plain language. */
export function compareCanon(
  rule: FieldRule,
  a: Canon,
  b: Canon,
  aRaw: string,
  bRaw: string,
  tolerance: Dec | null,
): FieldOutcome {
  const aNorm = show(a, aRaw);
  const bNorm = show(b, bRaw);
  const label = rule.label;

  if (a.t === 'bad' || b.t === 'bad') {
    const parts: string[] = [];
    if (a.t === 'bad') parts.push(`File A: ${a.why}`);
    if (b.t === 'bad') parts.push(`File B: ${b.why}`);
    return { status: 'u', aNorm, bNorm, reason: `${label} cannot be compared. ${parts.join('. ')}.` };
  }
  if (a.t === 'blank' && b.t === 'blank') return { status: 's', aNorm, bNorm };
  if (a.t === 'blank' || b.t === 'blank') {
    const who = a.t === 'blank' ? 'blank in A' : 'blank in B';
    const other = a.t === 'blank' ? `B has “${clip(bRaw)}”` : `A has “${clip(aRaw)}”`;
    return { status: 'd', aNorm, bNorm, reason: `${label}: ${who}, ${other}.` };
  }

  // Both are values.
  if (rule.kind === 'number' && a.dec && b.dec) {
    const tol = tolerance ?? { c: 0n, s: 0 };
    if (decWithinTolerance(a.dec, b.dec, tol)) return { status: 's', aNorm, bNorm };
    const tolText = tol.c === 0n ? '' : ` (allowed difference: ${decToString(tol)})`;
    return {
      status: 'd',
      aNorm,
      bNorm,
      reason: `${label}: A has ${clip(aRaw)}, B has ${clip(bRaw)}${tolText}.`,
    };
  }
  if (a.v === b.v) return { status: 's', aNorm, bNorm };

  let hint = '';
  if (rule.kind === 'text' || rule.kind === 'identifier') {
    const why = reconcilingOptions(aRaw, bRaw, rule);
    if (why === 'space') hint = ' The values differ only by spaces around them; turn on “Ignore spaces around values” to treat them as equal.';
    if (why === 'case') hint = ' The values differ only by upper/lower case; turn on “Ignore upper/lower case” to treat them as equal.';
    if (why === 'both') hint = ' The values differ only by spaces and upper/lower case; turn on “Ignore spaces around values” and “Ignore upper/lower case” to treat them as equal.';
  }
  return {
    status: 'd',
    aNorm,
    bNorm,
    reason: `${label}: A has “${clip(aRaw)}”, B has “${clip(bRaw)}”.${hint}`,
  };
}

export function parseTolerance(text: string): Dec | null {
  const d = parseDecimal(text.trim() === '' ? '0' : text.trim());
  if (!d || d.c < 0n) return null;
  return d;
}

/** A readable one-line description of what a rule does, for the rules summary and exports. */
export function describeFieldRule(rule: FieldRule, aFmt: FileFormat, bFmt: FileFormat): string {
  const bits: string[] = [];
  switch (rule.kind) {
    case 'text':
      bits.push('compared as text');
      break;
    case 'identifier':
      bits.push('compared as an exact identifier (leading zeros kept)');
      break;
    case 'number': {
      const tol = parseTolerance(rule.tolerance);
      bits.push(
        tol && tol.c !== 0n ? `compared as decimal numbers, allowed difference ±${decToString(tol)}` : 'compared as exact decimal numbers',
      );
      bits.push(`File A: decimal “${aFmt.decimal}”, thousands ${sepName(aFmt.thousands)}${aFmt.currency ? ', currency symbols ignored' : ''}`);
      bits.push(`File B: decimal “${bFmt.decimal}”, thousands ${sepName(bFmt.thousands)}${bFmt.currency ? ', currency symbols ignored' : ''}`);
      break;
    }
    case 'date':
      bits.push('compared as calendar dates (time of day ignored, no time-zone shift)');
      bits.push(`File A read as ${orderName(aFmt.dateOrder)}, File B read as ${orderName(bFmt.dateOrder)}; real Excel dates are used as stored`);
      break;
    case 'boolean':
      bits.push('compared as yes/no values');
      break;
  }
  bits.push(rule.trim ? 'spaces around values ignored' : 'spaces are significant');
  if (rule.kind === 'text' || rule.kind === 'identifier') bits.push(rule.caseInsensitive ? 'upper/lower case ignored' : 'upper/lower case is significant');
  if (rule.emptyAsNull) bits.push('whitespace-only cells treated as blank');
  return bits.join('; ');
}

function sepName(s: string): string {
  return s === 'none' ? 'none' : s === ' ' ? 'space' : `“${s}”`;
}

function orderName(o: string | null): string {
  return o === 'DMY' ? 'DD/MM/YYYY' : o === 'MDY' ? 'MM/DD/YYYY' : o === 'YMD' ? 'YYYY/MM/DD' : 'an unchosen format';
}

export function describeKeyRule(rule: KeyRule): string {
  const bits = ['exact identifier, kept as text (00123 and 123 are different)'];
  bits.push(rule.trim ? 'spaces around values ignored' : 'spaces are significant');
  bits.push(rule.caseInsensitive ? 'upper/lower case ignored' : 'upper/lower case is significant');
  return bits.join('; ');
}

/** Round an XLSX numeric cell's stored text to the 15 significant digits Excel itself shows. */
export function excelNumberText(stored: string): string {
  const d = parseDecimal(stored.trim());
  if (!d) return stored;
  return decToString(decRoundSignificant(d, 15));
}

