/**
 * Date-only parsing. Dates are calendar days (`YYYY-MM-DD`); no time zone is ever applied, so a
 * date written as 03/04/2026 can never drift to 02/04 or 04/04 by a UTC offset.
 */
import type { DateOrder } from './types';

export type DateParse = { ok: true; iso: string } | { ok: false; reason: string };

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5,
  jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

const TIME = String.raw`(?:[T\s]+\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?:[AaPp][Mm])?\s*(?:Z|[+-]\d{2}:?\d{2})?)?`;
const RE_YMD = new RegExp(String.raw`^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})` + TIME + '$');
const RE_NUM = new RegExp(String.raw`^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})` + TIME + '$');
const RE_NUM_2Y = /^\d{1,2}[-/.]\d{1,2}[-/.]\d{2}(?:\D.*)?$/;
const RE_D_MON_Y = new RegExp(String.raw`^(\d{1,2})[-/.\s]+([A-Za-z]{3,9})\.?[-/.,\s]+(\d{4})` + TIME + '$');
const RE_MON_D_Y = new RegExp(String.raw`^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})` + TIME + '$');

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

function pad(n: number, w: number): string {
  return String(n).padStart(w, '0');
}

export function makeIso(y: number, m: number, d: number): DateParse {
  if (!Number.isInteger(y) || y < 1 || y > 9999) return { ok: false, reason: `year ${y} is out of range` };
  if (m < 1 || m > 12) return { ok: false, reason: `month ${m} is not between 1 and 12` };
  const dim = daysInMonth(y, m);
  if (d < 1 || d > dim) return { ok: false, reason: `day ${d} does not exist in month ${m} of ${y}` };
  return { ok: true, iso: `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}` };
}

/**
 * Parse a date written as text. Numeric `a/b/yyyy` is read according to `order`; a year-first
 * date (`2026-04-03`) is always read year-month-day; month names are unambiguous. A trailing
 * time of day is accepted and ignored (dates are compared as calendar days).
 */
export function parseDateText(text: string, order: DateOrder | null): DateParse {
  const t = text.trim();
  let m = RE_YMD.exec(t);
  if (m) return makeIso(Number(m[1]), Number(m[2]), Number(m[3]));

  m = RE_NUM.exec(t);
  if (m) {
    if (order === null) {
      return { ok: false, reason: 'the date format for this file has not been chosen' };
    }
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    if (order === 'DMY') return makeIso(y, b, a);
    if (order === 'MDY') return makeIso(y, a, b);
    return { ok: false, reason: 'this date starts with a day or month, but the file is set to year-first' };
  }

  m = RE_D_MON_Y.exec(t);
  if (m) {
    const mon = MONTHS[m[2]!.toLowerCase()];
    if (mon) return makeIso(Number(m[3]), mon, Number(m[1]));
  }
  m = RE_MON_D_Y.exec(t);
  if (m) {
    const mon = MONTHS[m[1]!.toLowerCase()];
    if (mon) return makeIso(Number(m[3]), mon, Number(m[2]));
  }

  if (RE_NUM_2Y.test(t)) return { ok: false, reason: 'the year has two digits; use four digits so the century is clear' };
  return { ok: false, reason: 'not a recognised date' };
}

export interface SerialParts {
  /** `YYYY-MM-DD`, or `YYYY-MM-DDTHH:MM:SS` when the value carries a time of day, or `HH:MM:SS` for time-only values. */
  text: string;
  ok: boolean;
  reason?: string;
}

const MS_PER_DAY = 86_400_000;
const EPOCH_1900 = Date.UTC(1899, 11, 30); // serial 1 = 1900-01-01 once the leap-year quirk is handled
const EPOCH_1904 = Date.UTC(1904, 0, 1); // serial 0 = 1904-01-01

/**
 * Convert an Excel serial number into an ISO date using the workbook's own date system.
 * The 1900 system treats 1900 as a leap year (serial 60 = the non-existent 1900-02-29); the
 * 1904 system has no such quirk and a different base. Both are handled; neither is assumed.
 */
export function excelSerialToIso(serial: number, date1904: boolean): SerialParts {
  if (!Number.isFinite(serial) || serial < 0 || serial >= 2_958_466) {
    return { ok: false, text: String(serial), reason: 'the number is outside the range Excel can show as a date' };
  }
  let days = Math.floor(serial);
  let secs = Math.round((serial - days) * 86400);
  if (secs >= 86400) {
    secs -= 86400;
    days += 1;
  }
  const time = secs > 0 ? `${pad(Math.floor(secs / 3600), 2)}:${pad(Math.floor((secs % 3600) / 60), 2)}:${pad(secs % 60, 2)}` : '';

  let ms: number;
  if (date1904) {
    ms = EPOCH_1904 + days * MS_PER_DAY;
  } else {
    if (days === 0) {
      // Serial 0 is "January 0, 1900" — only meaningful as a time-only value.
      return time
        ? { ok: true, text: time }
        : { ok: false, text: '0', reason: 'serial 0 is not a calendar date (Excel shows it as 1900-01-00)' };
    }
    if (days === 60) {
      return { ok: false, text: '60', reason: "serial 60 is Excel's non-existent 1900-02-29 (a known Excel quirk)" };
    }
    // Before the fake leap day the base is 1899-12-31; after it, 1899-12-30.
    ms = days < 60 ? Date.UTC(1899, 11, 31) + days * MS_PER_DAY : EPOCH_1900 + days * MS_PER_DAY;
  }
  const d = new Date(ms);
  const iso = `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`;
  return { ok: true, text: time ? `${iso}T${time}` : iso };
}

/** `YYYY-MM-DD[THH:MM:SS]` → `YYYY-MM-DD`. Returns null if the text is not an ISO date. */
export function isoDatePart(text: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}:\d{2})?$/.exec(text);
  return m ? m[1]! : null;
}
