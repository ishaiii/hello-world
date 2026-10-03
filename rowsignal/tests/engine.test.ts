import { describe, expect, it } from 'vitest';
import { applyManualLinks, compareTables } from '../src/engine/compare';
import { serializeKey } from '../src/engine/config';
import { parseDecimal, decToString, decWithinTolerance } from '../src/engine/decimal';
import { parseDateText, excelSerialToIso } from '../src/engine/dates';
import { parseNumberText, canonicalize } from '../src/engine/values';
import { defaultFormat } from '../src/engine/config';
import { CancelledError, UserFacingError } from '../src/engine/types';
import { cfg, csv, keysOf, loadCsv, runCsv } from './helpers';

describe('keyed matching is independent of row order', () => {
  const rows = [
    ['id', 'qty'],
    ['a1', '1'],
    ['a2', '2'],
    ['a3', '3'],
    ['a4', '4'],
    ['a5', '5'],
  ];
  const other = [
    ['id', 'qty'],
    ['a1', '1'],
    ['a2', '9'],
    ['a3', '3'],
    ['b7', '7'],
  ];
  const config = cfg({ fields: [{ aColumn: 'c1', kind: 'number' }] });

  it('gives the same classification when either file is shuffled', async () => {
    const base = await runCsv(csv(rows), csv(other), config);
    for (let seed = 1; seed <= 6; seed++) {
      const shuffle = <T,>(arr: T[]) => {
        const a = [...arr];
        let s = seed * 7919;
        for (let i = a.length - 1; i > 0; i--) {
          s = (s * 1103515245 + 12345) & 0x7fffffff;
          const j = s % (i + 1);
          [a[i], a[j]] = [a[j]!, a[i]!];
        }
        return a;
      };
      const r = await runCsv(csv([rows[0]!, ...shuffle(rows.slice(1))]), csv([other[0]!, ...shuffle(other.slice(1))]), config);
      expect(r.summary).toEqual(base.summary);
      for (const cat of ['matched', 'different', 'only-a', 'only-b'] as const) expect(keysOf(r.rows, cat)).toEqual(keysOf(base.rows, cat));
      expect(r.accounting.balanced).toBe(true);
    }
    expect(base.summary).toMatchObject({ matched: 2, different: 1, onlyA: 2, onlyB: 1 });
  });
});

describe('identifiers are exact strings', () => {
  it('keeps 00123 and 123 distinct by default', async () => {
    const r = await runCsv(csv([['id'], ['00123']]), csv([['id'], ['123']]), cfg({}));
    expect(r.summary.pairs).toBe(0);
    expect(r.summary.onlyA).toBe(1);
    expect(r.summary.onlyB).toBe(1);
  });

  it('does not coerce 1E3 or 1000.0 into 1000', async () => {
    const r = await runCsv(csv([['id'], ['1E3'], ['1000.0']]), csv([['id'], ['1000']]), cfg({}));
    expect(r.summary.pairs).toBe(0);
    expect(r.summary.onlyA).toBe(2);
  });

  it('only trims or folds case for identifiers when the rule says so', async () => {
    const a = csv([['id'], [' X1'], ['y2']]);
    const b = csv([['id'], ['X1'], ['Y2']]);
    expect((await runCsv(a, b, cfg({}))).summary.pairs).toBe(0);
    expect((await runCsv(a, b, cfg({ keys: [{ aColumn: 'c0', trim: true }] }))).summary.pairs).toBe(1);
    expect((await runCsv(a, b, cfg({ keys: [{ aColumn: 'c0', caseInsensitive: true }] }))).summary.pairs).toBe(1);
    expect((await runCsv(a, b, cfg({ keys: [{ aColumn: 'c0', trim: true, caseInsensitive: true }] }))).summary.pairs).toBe(2);
  });
});

describe('compound keys cannot collide', () => {
  it('serialises with length prefixes so separators in values are harmless', () => {
    expect(serializeKey(['a|b', 'c'])).not.toBe(serializeKey(['a', 'b|c']));
    expect(serializeKey(['1', '23'])).not.toBe(serializeKey(['12', '3']));
    expect(serializeKey(['', 'x'])).not.toBe(serializeKey(['x', '']));
    expect(serializeKey(['1:2', '3'])).not.toBe(serializeKey(['1', '2:3']));
  });

  it('keeps colliding-looking pairs apart in a real comparison', async () => {
    const a = csv([['p', 'q'], ['a|b', 'c'], ['1', '23']]);
    const b = csv([['p', 'q'], ['a', 'b|c'], ['12', '3']]);
    const r = await runCsv(a, b, cfg({ keys: [{ aColumn: 'c0' }, { aColumn: 'c1' }] }));
    expect(r.summary.pairs).toBe(0);
    expect(r.summary.onlyA).toBe(2);
    expect(r.summary.onlyB).toBe(2);
  });

  it('matches compound keys only when every part agrees', async () => {
    const a = csv([['o', 's', 'q'], ['1008', 'A', '2'], ['1008', 'B', '3']]);
    const b = csv([['o', 's', 'q'], ['1008', 'A', '2']]);
    const r = await runCsv(a, b, cfg({ keys: [{ aColumn: 'c0' }, { aColumn: 'c1' }], fields: [{ aColumn: 'c2', kind: 'number' }] }));
    expect(r.summary).toMatchObject({ matched: 1, onlyA: 1, ambiguousGroups: 0 });
  });
});

describe('duplicate and blank keys', () => {
  it('marks the whole group ambiguous and never pairs or consumes rows twice', async () => {
    const a = csv([['id', 'v'], ['k', '1'], ['k', '2'], ['z', '9']]);
    const b = csv([['id', 'v'], ['k', '1'], ['z', '9']]);
    const r = await runCsv(a, b, cfg({ fields: [{ aColumn: 'c1' }] }));
    expect(r.summary).toMatchObject({ matched: 1, ambiguousGroups: 1, ambiguousRowsA: 2, ambiguousRowsB: 1, onlyA: 0, onlyB: 0 });
    const g = r.rows.find((x) => x.category === 'ambiguous')!;
    expect(g.aRows).toEqual([2, 3]);
    expect(g.bRows).toEqual([2]);
    expect(r.accounting.balanced).toBe(true);
  });

  it('treats a duplicate on only the B side as ambiguous too, with no cartesian product', async () => {
    const a = csv([['id'], ['k']]);
    const b = csv([['id'], ['k'], ['k'], ['k']]);
    const r = await runCsv(a, b, cfg({}));
    expect(r.summary).toMatchObject({ pairs: 0, ambiguousGroups: 1, ambiguousRowsA: 1, ambiguousRowsB: 3 });
    expect(r.rows).toHaveLength(1);
  });

  it('reports a duplicate that exists in only one file as ambiguous, not as "only in"', async () => {
    const r = await runCsv(csv([['id'], ['k'], ['k']]), csv([['id'], ['other']]), cfg({}));
    expect(r.summary).toMatchObject({ ambiguousGroups: 1, ambiguousRowsA: 2, ambiguousRowsB: 0, onlyB: 1 });
  });

  it('never matches blank or whitespace-only keys, even with each other', async () => {
    const a = csv([['id', 'v'], ['', '1'], ['  ', '2'], ['ok', '3']]);
    const b = csv([['id', 'v'], ['', '1'], ['ok', '3']]);
    const r = await runCsv(a, b, cfg({ keys: [{ aColumn: 'c0', trim: true }], fields: [{ aColumn: 'c1' }] }));
    expect(r.summary).toMatchObject({ matched: 1, invalidA: 2, invalidB: 1, pairs: 1 });
    expect(r.accounting.balanced).toBe(true);
  });

  it('reports a blank part of a compound key as invalid', async () => {
    const r = await runCsv(csv([['a', 'b'], ['1', ''], ['2', 'x']]), csv([['a', 'b'], ['1', ''], ['2', 'x']]), cfg({ keys: [{ aColumn: 'c0' }, { aColumn: 'c1' }] }));
    expect(r.summary).toMatchObject({ matched: 1, invalidA: 1, invalidB: 1 });
  });
});

describe('field rules are applied only when enabled', () => {
  const a = csv([['id', 'sku'], ['1', ' Mug ']]);
  const b = csv([['id', 'sku'], ['1', 'mug']]);
  const run = (rule: object) => runCsv(a, b, cfg({ fields: [{ aColumn: 'c1', ...rule }] }));

  it('distinguishes spaces and case until asked to ignore them', async () => {
    expect((await run({})).summary.different).toBe(1);
    expect((await run({ trim: true })).summary.different).toBe(1);
    expect((await run({ caseInsensitive: true })).summary.different).toBe(1);
    expect((await run({ trim: true, caseInsensitive: true })).summary.matched).toBe(1);
  });

  it('explains a whitespace-only difference and how to fix it', async () => {
    const r = await runCsv(csv([['id', 's'], ['1', 'MUG ']]), csv([['id', 's'], ['1', 'MUG']]), cfg({ fields: [{ aColumn: 'c1' }] }));
    expect(r.rows[0]!.reasons.join(' ')).toMatch(/Ignore spaces around values/);
  });

  it('names exactly the options that would reconcile two values, and never one already on', async () => {
    const hint = async (a: string, b: string, rule: object) => {
      const r = await runCsv(csv([['id', 's'], ['1', a]]), csv([['id', 's'], ['1', b]]), cfg({ fields: [{ aColumn: 'c1', ...rule }] }));
      return r.rows[0]!.reasons.join(' ');
    };
    expect(await hint('mug', ' MUG ', {})).toMatch(/spaces and upper\/lower case; turn on “Ignore spaces around values” and “Ignore upper\/lower case”/);
    expect(await hint('mug', ' MUG ', { trim: true })).toMatch(/only by upper\/lower case/);
    expect(await hint('mug', ' MUG ', { caseInsensitive: true })).toMatch(/only by spaces/);
    expect(await hint('mug', 'cup', {})).not.toMatch(/turn on/);
  });

  it('does not remove punctuation, accents or internal spaces', async () => {
    const r = await runCsv(csv([['id', 's'], ['1', 'café-1 x']]), csv([['id', 's'], ['1', 'cafe1x']]), cfg({ fields: [{ aColumn: 'c1', trim: true, caseInsensitive: true }] }));
    expect(r.summary.different).toBe(1);
  });
});

describe('decimal arithmetic is exact', () => {
  it('parses, compares and prints without floating point', () => {
    expect(decToString(parseDecimal('0.30')!)).toBe('0.3');
    expect(decToString(parseDecimal('-0.0')!)).toBe('0');
    expect(decToString(parseDecimal('1E3')!)).toBe('1000');
    expect(decToString(parseDecimal('1.5e-3')!)).toBe('0.0015');
    expect(parseDecimal('1e999999')).toBeNull();
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('.')).toBeNull();
    expect(parseDecimal('1.2.3')).toBeNull();
  });

  it('uses <= for tolerance at the exact boundary and handles 0.1 + 0.2 style values', () => {
    const d = (s: string) => parseDecimal(s)!;
    expect(decWithinTolerance(d('10.00'), d('10.05'), d('0.05'))).toBe(true);
    expect(decWithinTolerance(d('10.00'), d('10.051'), d('0.05'))).toBe(false);
    expect(decWithinTolerance(d('0.1'), d('0.30000000000000004'), d('0'))).toBe(false);
    expect(decWithinTolerance(d('-5'), d('-5.0'), d('0'))).toBe(true);
    expect(decWithinTolerance(d('-5'), d('5'), d('10'))).toBe(true);
    expect(decWithinTolerance(d('-5'), d('5'), d('9.99'))).toBe(false);
  });

  it('compares numbers across formats and applies tolerance in a real comparison', async () => {
    const a = csv([['id', 'amt'], ['1', '1,200.00'], ['2', '100.04'], ['3', '-7.50'], ['4', '5.00']]);
    const b = csv([['id', 'amt'], ['1', '1200'], ['2', '100.00'], ['3', '-7.5'], ['4', '5.05']]);
    const exact = await runCsv(a, b, cfg({ fields: [{ aColumn: 'c1', kind: 'number', trim: true }] }));
    expect(keysOf(exact.rows, 'matched')).toEqual(['1', '3']);
    const loose = await runCsv(a, b, cfg({ fields: [{ aColumn: 'c1', kind: 'number', trim: true, tolerance: '0.04' }] }));
    expect(keysOf(loose.rows, 'matched')).toEqual(['1', '2', '3']);
    expect(keysOf(loose.rows, 'different')).toEqual(['4']);
    expect(loose.rows.find((x) => x.keyA?.[0] === '4')!.reasons[0]).toMatch(/allowed difference: 0.04/);
  });

  it('keeps blanks, zero, the text NULL and malformed numbers distinct', async () => {
    const a = csv([['id', 'n'], ['blank', ''], ['zero', '0'], ['null', 'NULL'], ['bad', '12abc'], ['bothblank', '']]);
    const b = csv([['id', 'n'], ['blank', '0'], ['zero', ''], ['null', '0'], ['bad', '12abc'], ['bothblank', '']]);
    const r = await runCsv(a, b, cfg({ fields: [{ aColumn: 'c1', kind: 'number', trim: true }] }));
    expect(keysOf(r.rows, 'matched')).toEqual(['bothblank']);
    const by = (k: string) => r.rows.find((x) => x.keyA?.[0] === k)!;
    expect(by('blank').status).toBe('d'); // blank is not zero
    expect(by('zero').status).toBe('d');
    expect(by('null').status).toBe('u'); // NULL text is malformed, not blank
    expect(by('bad').status).toBe('u'); // identical malformed text is still unreadable, not "equal"
    expect(by('bad').reasons[0]).toMatch(/cannot be compared/);
    expect(r.accounting.balanced).toBe(true);
  });

  it('reads per-file number formats (European vs US) without guessing from location', () => {
    const us = { ...defaultFormat() };
    const eu = { ...defaultFormat(), decimal: ',' as const, thousands: '.' as const };
    const val = (s: string, f = us) => {
      const r = parseNumberText(s, f);
      return r.ok ? decToString(r.dec) : 'ERR';
    };
    expect(val('1,234.56')).toBe('1234.56');
    expect(val('1.234,56', eu)).toBe('1234.56');
    expect(val('12,34,567.50')).toBe('1234567.5'); // Indian grouping
    expect(val('1,2,3')).toBe('ERR'); // misplaced separators
    expect(val('1.234,56')).toBe('ERR');
    expect(val('$100')).toBe('ERR'); // currency symbol needs an explicit rule
    expect(val('$100', { ...us, currency: true })).toBe('100');
    expect(val('₹1,00,000.00', { ...us, currency: true })).toBe('100000');
    expect(val('-$5.00', { ...us, currency: true })).toBe('-5');
    expect(val('(5.00)')).toBe('ERR');
    expect(val('1 234,5', { ...us, decimal: ',', thousands: ' ' })).toBe('1234.5');
  });
});

describe('dates', () => {
  it('requires an explicit order for ambiguous numeric dates', () => {
    expect(parseDateText('03/04/2026', null)).toMatchObject({ ok: false });
    expect(parseDateText('03/04/2026', 'DMY')).toEqual({ ok: true, iso: '2026-04-03' });
    expect(parseDateText('03/04/2026', 'MDY')).toEqual({ ok: true, iso: '2026-03-04' });
  });

  it('always reads year-first and month-name dates unambiguously', () => {
    expect(parseDateText('2026-04-03', null)).toEqual({ ok: true, iso: '2026-04-03' });
    expect(parseDateText('3 Apr 2026', null)).toEqual({ ok: true, iso: '2026-04-03' });
    expect(parseDateText('April 3, 2026', 'DMY')).toEqual({ ok: true, iso: '2026-04-03' });
    expect(parseDateText('2026-04-03T23:59:59Z', null)).toEqual({ ok: true, iso: '2026-04-03' });
  });

  it('rejects impossible and ambiguous-century dates instead of guessing', () => {
    expect(parseDateText('31/04/2026', 'DMY')).toMatchObject({ ok: false });
    expect(parseDateText('29/02/2025', 'DMY')).toMatchObject({ ok: false });
    expect(parseDateText('29/02/2024', 'DMY')).toEqual({ ok: true, iso: '2024-02-29' });
    expect(parseDateText('13/13/2026', 'MDY')).toMatchObject({ ok: false });
    expect(parseDateText('03/04/26', 'DMY')).toMatchObject({ ok: false, reason: expect.stringContaining('four digits') });
    expect(parseDateText('soon', 'DMY')).toMatchObject({ ok: false });
  });

  it('never shifts a date by time zone', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['Pacific/Honolulu', 'Asia/Kolkata', 'Pacific/Kiritimati', 'UTC']) {
        process.env.TZ = tz;
        expect(parseDateText('03/04/2026', 'DMY')).toEqual({ ok: true, iso: '2026-04-03' });
        expect(excelSerialToIso(46115, false).text).toBe('2026-04-03');
        expect(excelSerialToIso(46115.99999, false).text.startsWith('2026-04-03')).toBe(true);
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('converts Excel serials in both date systems', () => {
    expect(excelSerialToIso(1, false).text).toBe('1900-01-01');
    expect(excelSerialToIso(61, false).text).toBe('1900-03-01');
    expect(excelSerialToIso(60, false).ok).toBe(false);
    expect(excelSerialToIso(0, true).text).toBe('1904-01-01');
    expect(excelSerialToIso(1461, true).text).toBe('1908-01-01');
    // the same calendar day has different serials in the two systems (1462 days apart)
    expect(excelSerialToIso(46115, false).text).toBe(excelSerialToIso(46115 - 1462, true).text);
    expect(excelSerialToIso(-1, false).ok).toBe(false);
  });

  it('compares dates across files with different explicit formats', async () => {
    const a = csv([['id', 'd'], ['1', '03/04/2026'], ['2', '13/04/2026']]);
    const b = csv([['id', 'd'], ['1', '04/03/2026'], ['2', '04/13/2026']]);
    const r = await runCsv(a, b, cfg({ fields: [{ aColumn: 'c1', kind: 'date', trim: true }], fmtA: { dateOrder: 'DMY' }, fmtB: { dateOrder: 'MDY' } }));
    expect(r.summary.matched).toBe(2);
    const wrong = await runCsv(a, b, cfg({ fields: [{ aColumn: 'c1', kind: 'date', trim: true }], fmtA: { dateOrder: 'DMY' }, fmtB: { dateOrder: 'DMY' } }));
    expect(wrong.summary.matched).toBe(0);
    expect(wrong.rows.some((x) => x.status === 'u')).toBe(true); // 04/13/2026 is not a valid DMY date
  });
});

describe('cell kinds from XLSX never become silent zeros or matches', () => {
  it('flags formulas with no saved result and error cells instead of comparing them', () => {
    const f = defaultFormat();
    const rule = { trim: true, caseInsensitive: false, emptyAsNull: false };
    expect(canonicalize('', 32, 'number', rule, f)).toMatchObject({ t: 'bad' });
    expect(canonicalize('#N/A', 8, 'text', rule, f)).toMatchObject({ t: 'bad' });
    expect(canonicalize('7', 17, 'number', rule, f)).toMatchObject({ t: 'value', v: '7' });
  });
});

describe('jobs: cancellation and validation', () => {
  it('stops with CancelledError when the job is cancelled', async () => {
    const rows = ['id'];
    for (let i = 0; i < 20000; i++) rows.push(String(i));
    const t = loadCsv(rows.join('\n')).table;
    let calls = 0;
    await expect(compareTables(t, t, cfg({}), { isCancelled: () => ++calls > 2 })).rejects.toBeInstanceOf(CancelledError);
  });

  it('refuses to run with a missing key', async () => {
    const t = loadCsv('a,b\n1,2\n').table;
    const config = cfg({});
    config.keys = [];
    await expect(compareTables(t, t, config)).rejects.toBeInstanceOf(UserFacingError);
  });

  it('refuses to run when a mapped column no longer exists', async () => {
    const t = loadCsv('a\n1\n').table;
    await expect(compareTables(t, t, cfg({ keys: [{ aColumn: 'c5' }] }))).rejects.toBeInstanceOf(UserFacingError);
  });

  it('preserves the invariant that every row appears exactly once, with manual links', async () => {
    const a = loadCsv(csv([['id', 'name'], ['100', 'Acme Ltd'], ['101', 'Other']])).table;
    const b = loadCsv(csv([['id', 'name'], ['100', 'Acme Ltd'], ['999', 'Acme Limited']])).table;
    const config = cfg({ fields: [{ aColumn: 'c1' }] });
    const base = await compareTables(a, b, config);
    expect(base.summary).toMatchObject({ matched: 1, onlyA: 1, onlyB: 1 });
    const linked = applyManualLinks(base, [{ aIdx: 1, bIdx: 1 }], a, b);
    expect(linked.summary).toMatchObject({ matched: 1, different: 1, manualPairs: 1, onlyA: 0, onlyB: 0 });
    expect(linked.accounting.balanced).toBe(true);
    expect(linked.accounting.A.pairedManual).toBe(1);
    const row = linked.rows.find((x) => x.provenance === 'manual')!;
    expect(row.keyA).toEqual(['101']);
    expect(row.keyB).toEqual(['999']);
    expect(row.summary).toMatch(/Manually linked/);
    // transactional: an invalid link applies nothing
    expect(() => applyManualLinks(base, [{ aIdx: 1, bIdx: 1 }, { aIdx: 0, bIdx: 1 }], a, b)).toThrow(UserFacingError);
    expect(() => applyManualLinks(base, [{ aIdx: 1, bIdx: 1 }, { aIdx: 1, bIdx: 1 }], a, b)).toThrow(UserFacingError);
    // undo = re-apply with fewer links, from the untouched base
    const undone = applyManualLinks(base, [], a, b);
    expect(undone.summary).toEqual(base.summary);
  });
});
