/**
 * Exact decimal arithmetic on BigInt. Binary floating point is never used to compare values:
 * `0.1 + 0.2 !== 0.3` must not become a false mismatch, and `100.00` must equal `100`.
 *
 * A Dec is `c × 10^-s` with an integer coefficient `c` (signed) and a scale `s >= 0`.
 */

export interface Dec {
  c: bigint;
  s: number;
}

const MAX_DIGITS = 400;
const MAX_EXPONENT = 400;

const POW10_CACHE: bigint[] = [1n];
function pow10(n: number): bigint {
  while (POW10_CACHE.length <= n) {
    POW10_CACHE.push(POW10_CACHE[POW10_CACHE.length - 1]! * 10n);
  }
  return POW10_CACHE[n]!;
}

const PLAIN_RE = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/;

/**
 * Parse a canonical decimal string: optional sign, digits, optional `.digits`, optional exponent.
 * Returns null for anything else (including empty input and over-long numbers).
 */
export function parseDecimal(text: string): Dec | null {
  if (text.length === 0 || text.length > MAX_DIGITS + 20) return null;
  const m = PLAIN_RE.exec(text);
  if (!m) return null;
  const intPart = m[2] ?? '';
  const fracPart = m[3] ?? '';
  if (intPart.length === 0 && fracPart.length === 0) return null;
  if (intPart.length + fracPart.length > MAX_DIGITS) return null;
  let exp = 0;
  if (m[4] !== undefined) {
    exp = Number(m[4]);
    if (!Number.isFinite(exp) || Math.abs(exp) > MAX_EXPONENT) return null;
  }
  let c = BigInt((intPart + fracPart).replace(/^0+(?=\d)/, '') || '0');
  let s = fracPart.length - exp;
  if (s < 0) {
    c *= pow10(-s);
    s = 0;
  }
  if (m[1] === '-') c = -c;
  return { c, s };
}

export function decEquals(a: Dec, b: Dec): boolean {
  return decCompare(a, b) === 0;
}

export function decCompare(a: Dec, b: Dec): number {
  let ac = a.c;
  let bc = b.c;
  if (a.s < b.s) ac *= pow10(b.s - a.s);
  else if (b.s < a.s) bc *= pow10(a.s - b.s);
  return ac < bc ? -1 : ac > bc ? 1 : 0;
}

export function decSub(a: Dec, b: Dec): Dec {
  const s = Math.max(a.s, b.s);
  const ac = a.c * pow10(s - a.s);
  const bc = b.c * pow10(s - b.s);
  return { c: ac - bc, s };
}

export function decAdd(a: Dec, b: Dec): Dec {
  const s = Math.max(a.s, b.s);
  return { c: a.c * pow10(s - a.s) + b.c * pow10(s - b.s), s };
}

export function decAbs(a: Dec): Dec {
  return a.c < 0n ? { c: -a.c, s: a.s } : a;
}

/** `abs(a - b) <= tolerance`. A tolerance of zero means exact equality. */
export function decWithinTolerance(a: Dec, b: Dec, tolerance: Dec): boolean {
  return decCompare(decAbs(decSub(a, b)), tolerance) <= 0;
}

/** Canonical plain-text form: no exponent, no trailing fractional zeros, no "-0". */
export function decToString(d: Dec): string {
  let { c, s } = d;
  while (s > 0 && c % 10n === 0n) {
    c /= 10n;
    s -= 1;
  }
  const neg = c < 0n;
  let digits = (neg ? -c : c).toString();
  if (s > 0) {
    if (digits.length <= s) digits = '0'.repeat(s - digits.length + 1) + digits;
    digits = digits.slice(0, digits.length - s) + '.' + digits.slice(digits.length - s);
  }
  return (neg && c !== 0n ? '-' : '') + digits;
}

/** Round to at most `n` significant digits (half away from zero), as Excel displays numbers. */
export function decRoundSignificant(d: Dec, n: number): Dec {
  const abs = d.c < 0n ? -d.c : d.c;
  const len = abs.toString().length;
  if (len <= n) return d;
  const drop = len - n;
  const factor = pow10(drop);
  let q = abs / factor;
  const r = abs % factor;
  if (r * 2n >= factor) q += 1n;
  const signed = d.c < 0n ? -q : q;
  // Scale shrinks by `drop`; if that makes it negative, fold the zeros back into the coefficient.
  const s = d.s - drop;
  if (s >= 0) return { c: signed, s };
  return { c: signed * pow10(-s), s: 0 };
}

export function isNegativeDecimalString(text: string): boolean {
  return text.startsWith('-');
}
