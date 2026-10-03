import { describe, expect, it } from 'vitest';
import { Comparer } from '../src/engine/comparer';
import { applyManualLinks, compareTables } from '../src/engine/compare';
import { analyzeConfig, detectDateOrder, detectNumberFormat, inferKind, profileColumn, suggestMapping } from '../src/engine/diagnostics';
import { resolvePortable, toPortable } from '../src/engine/portable';
import { diceSimilarity, suggestLinks, DEFAULT_SUGGEST_CAPS } from '../src/engine/suggest';
import { CancelledError } from '../src/engine/types';
import { DISPATCH_CSV, ORDERS_CSV, sampleOrdersConfig } from '../src/sample/orders';
import { cfg, csv, loadCsv } from './helpers';

describe('mapping suggestions and diagnostics', () => {
  const a = loadCsv(ORDERS_CSV).table;
  const b = loadCsv(DISPATCH_CSV).table;

  it('suggests the sample column pairs from header names, for the user to confirm', () => {
    const s = suggestMapping(a, b);
    expect(s.keys).toHaveLength(1);
    expect(s.keys[0]).toMatchObject({ aColumn: 'c0', bColumn: 'c0' }); // Order ID ↔ Order Number
    const pairs = Object.fromEntries(s.fields.map((f) => [f.aColumn, f.bColumn]));
    expect(pairs).toMatchObject({ c1: 'c1', c2: 'c2', c3: 'c3', c4: 'c4' }); // SKU↔Product Code, Quantity↔Qty, Amount↔Total, Date↔Dispatch Date
    expect(s.fields.find((f) => f.aColumn === 'c4')!.kind).toBe('date');
    expect(s.fields.find((f) => f.aColumn === 'c2')!.kind).toBe('number');
  });

  it('infers kinds without coercing identifiers with leading zeros', () => {
    const t = loadCsv(csv([['zip', 'qty', 'when', 'note'], ['02134', '5', '2026-04-03', 'x'], ['02135', '6', '2026-04-04', 'y']])).table;
    expect(inferKind(profileColumn(t, 0))).toBe('identifier');
    expect(inferKind(profileColumn(t, 1))).toBe('number');
    expect(inferKind(profileColumn(t, 2))).toBe('date');
    expect(inferKind(profileColumn(t, 3))).toBe('text');
  });

  it('detects date order only when the data proves it, and says when it is ambiguous', () => {
    const dmy = loadCsv('d\n25/12/2025\n01/02/2026\n').table;
    expect(detectDateOrder(dmy, 0)).toMatchObject({ order: 'DMY', confident: true });
    const mdy = loadCsv('d\n12/25/2025\n01/02/2026\n').table;
    expect(detectDateOrder(mdy, 0)).toMatchObject({ order: 'MDY', confident: true });
    expect(detectDateOrder(a, 4)).toMatchObject({ order: null, confident: false }); // 03/04/2026 only
    const mixed = loadCsv('d\n25/12/2025\n12/25/2025\n').table;
    expect(detectDateOrder(mixed, 0)).toMatchObject({ order: null, confident: false });
  });

  it('detects European number formatting but never applies it on its own', () => {
    const eu = loadCsv('n\n"1.234,56"\n"7,50"\n').table;
    expect(detectNumberFormat(eu, 0)).toEqual({ decimal: ',', thousands: '.' });
    expect(detectNumberFormat(loadCsv('n\n1,234.56\n7.5\n').table, 0)).toBeNull();
  });

  it('reports key uniqueness, overlap, unreadable values and the missing date format', async () => {
    const config = sampleOrdersConfig();
    const ok = await analyzeConfig(a, b, config);
    expect(ok.keyStats.A).toMatchObject({ rows: 10, blankKeys: 1, duplicateKeyRows: 2, duplicateKeyGroups: 1, uniqueKeys: 7 });
    expect(ok.keyStats.B).toMatchObject({ rows: 10, blankKeys: 1, duplicateKeyRows: 0, uniqueKeys: 9 });
    expect(ok.overlap).toEqual({ both: 7, onlyA: 1, onlyB: 2 }); // 1008 counts as shared
    expect(ok.issues.filter((i) => i.blocking)).toHaveLength(0);
    expect(ok.fieldIssues.every((f) => f.unreadable === 0)).toBe(true);

    const noFormat = sampleOrdersConfig();
    noFormat.formats.A.dateOrder = null;
    const blocked = await analyzeConfig(a, b, noFormat);
    expect(blocked.issues.some((i) => i.code === 'date-format-missing' && i.target === 'A')).toBe(true);

    const wrong = sampleOrdersConfig();
    wrong.formats.A.dateOrder = 'DMY';
    wrong.formats.B.dateOrder = 'DMY'; // 04/03/2026 is valid DMY too — but wrong; unreadable counts stay 0 here
    const w = await analyzeConfig(a, b, wrong);
    expect(w.fieldIssues.filter((f) => f.unreadable > 0)).toHaveLength(0);
  });

  it('hints when identifiers differ only by outer spaces', async () => {
    const x = loadCsv(csv([['id'], [' a'], ['b']])).table;
    const y = loadCsv(csv([['id'], ['a'], ['b ']])).table;
    const r = await analyzeConfig(x, y, cfg({}));
    expect(r.keyHints.find((h) => h.role === 'A')!.outerSpaceValues).toBe(1);
    expect(r.keyHints.find((h) => h.role === 'B')!.outerSpaceValues).toBe(1);
    const trimmed = await analyzeConfig(x, y, cfg({ keys: [{ aColumn: 'c0', trim: true }] }));
    expect(trimmed.keyHints.every((h) => h.outerSpaceValues === 0)).toBe(true);
  });
});

describe('approximate suggestions', () => {
  const names = (rows: string[][]) => loadCsv(csv([['id', 'name', 'qty'], ...rows])).table;
  const config = cfg({ fields: [{ aColumn: 'c1' }, { aColumn: 'c2', kind: 'number' }] });

  async function setup(aRows: string[][], bRows: string[][]) {
    const a = names(aRows);
    const b = names(bRows);
    const base = await compareTables(a, b, config);
    return { a, b, base, cmp: new Comparer(a, b, config) };
  }

  it('scores similarity as 0–1 and treats punctuation/case as noise only for scoring', () => {
    expect(diceSimilarity('Acme Ltd.', 'ACME LTD')).toBe(1);
    expect(diceSimilarity('Acme Ltd', 'Acme Limited')).toBeGreaterThanOrEqual(0.5);
    expect(diceSimilarity('apple', 'zebra')).toBeLessThan(0.2);
    expect(diceSimilarity('', '')).toBe(0);
  });

  it('suggests plausible pairs among unmatched rows only, one-to-one', async () => {
    const { base, cmp } = await setup(
      [['A-100', 'Acme Ltd', '5'], ['A-200', 'Globex Corp', '7'], ['K-1', 'matched', '1'], ['Z-9', 'Nothing alike', '3']],
      [['A100', 'ACME Ltd.', '5'], ['A-2OO', 'Globex Corporation', '7'], ['K-1', 'matched', '1'], ['Q-77', 'Qwerty', '99']],
    );
    expect(base.summary).toMatchObject({ matched: 1, onlyA: 3, onlyB: 3 });
    const res = await suggestLinks(cmp, base, { refs: ['k:k1', 'f:f1', 'f:f2'], threshold: 0.6 });
    expect(res.truncated).toBe(false);
    const pairs = res.suggestions.map((s) => [s.aIdx, s.bIdx]);
    expect(pairs).toContainEqual([0, 0]); // A-100 ~ A100
    expect(pairs).toContainEqual([1, 1]); // Globex
    // no row is ever offered twice
    expect(new Set(res.suggestions.map((s) => s.aIdx)).size).toBe(res.suggestions.length);
    expect(new Set(res.suggestions.map((s) => s.bIdx)).size).toBe(res.suggestions.length);
    // exact matches are never touched
    expect(res.suggestions.some((s) => s.aIdx === 2 || s.bIdx === 2)).toBe(false);
    for (const s of res.suggestions) {
      expect(s.score).toBeGreaterThanOrEqual(0.6);
      expect(s.score).toBeLessThanOrEqual(1);
    }
  });

  it('accepting and undoing links keeps the accounting balanced', async () => {
    const { a, b, base, cmp } = await setup([['A-100', 'Acme Ltd', '5'], ['x', 'one', '1']], [['A100', 'ACME Ltd.', '5'], ['y', 'two', '2']]);
    const res = await suggestLinks(cmp, base, { refs: ['k:k1', 'f:f1'], threshold: 0.5 });
    const first = res.suggestions[0]!;
    const linked = applyManualLinks(base, [{ aIdx: first.aIdx, bIdx: first.bIdx }], a, b);
    expect(linked.accounting.balanced).toBe(true);
    expect(linked.summary.manualPairs).toBe(1);
    expect(linked.rows.find((r) => r.provenance === 'manual')!.id).toBe(`m:${first.aIdx}:${first.bIdx}`);
    // after linking, the same rows cannot be suggested or linked again
    const again = await suggestLinks(new Comparer(a, b, config), linked, { refs: ['k:k1', 'f:f1'], threshold: 0.5 });
    expect(again.suggestions.some((s) => s.aIdx === first.aIdx || s.bIdx === first.bIdx)).toBe(false);
    expect(() => applyManualLinks(linked, [{ aIdx: first.aIdx, bIdx: first.bIdx }], a, b)).toThrow();
    const undone = applyManualLinks(base, [], a, b);
    expect(undone.accounting.balanced).toBe(true);
    expect(undone.summary.manualPairs).toBe(0);
  });

  it('is bounded: reports truncation instead of silently searching everything', async () => {
    const rows = Array.from({ length: 300 }, (_, i) => [`ID-${i}`, `Name ${i % 7}`, String(i)]);
    const rowsB = Array.from({ length: 300 }, (_, i) => [`XX-${i}`, `Name ${i % 7}`, String(i)]);
    const { base, cmp } = await setup(rows, rowsB);
    const res = await suggestLinks(cmp, base, { refs: ['k:k1', 'f:f1'], threshold: 0.3 }, undefined, { ...DEFAULT_SUGGEST_CAPS, maxPairs: 50 });
    expect(res.truncated).toBe(true);
    expect(res.truncatedReasons.join(' ')).toMatch(/candidate pairs/);
    expect(res.examinedPairs).toBeLessThanOrEqual(51);
    const capped = await suggestLinks(cmp, base, { refs: ['k:k1'], threshold: 0.3 }, undefined, { ...DEFAULT_SUGGEST_CAPS, maxPool: 100 });
    expect(capped.truncated).toBe(true);
  });

  it('can be cancelled', async () => {
    const rows = Array.from({ length: 2000 }, (_, i) => [`ID-${i}`, `n${i}`, String(i)]);
    const { base, cmp } = await setup(rows, rows.map((r) => [`Z${r[0]}`, r[1]!, r[2]!]));
    let n = 0;
    await expect(suggestLinks(cmp, base, { refs: ['k:k1'], threshold: 0.4 }, { isCancelled: () => ++n > 3 })).rejects.toBeInstanceOf(CancelledError);
  });

  it('suggests nothing without a text field to block on', async () => {
    const { base, cmp } = await setup([['a', 'n', '1']], [['b', 'n', '1']]);
    const res = await suggestLinks(cmp, base, { refs: ['f:f2'], threshold: 0.1 });
    expect(res.suggestions).toHaveLength(0);
  });
});

describe('recipes: portable config and schema changes', () => {
  const a = loadCsv(ORDERS_CSV).table;
  const b = loadCsv(DISPATCH_CSV).table;
  const portable = toPortable(sampleOrdersConfig(), a.columns, b.columns);

  it('stores header names, never data, and round-trips to the same config', () => {
    expect(JSON.stringify(portable)).not.toMatch(/1001|PEN|mug/);
    const back = resolvePortable(portable, a.columns, b.columns);
    expect(back.issues).toHaveLength(0);
    expect(back.config).toEqual(sampleOrdersConfig());
  });

  it('follows renamed positions: the same headers in a different order still resolve', async () => {
    const reordered = loadCsv('Date,Amount,SKU,Quantity,Order ID\n03/04/2026,100.00,PEN,10,1001\n').table;
    const { config, issues } = resolvePortable(portable, reordered.columns, b.columns);
    expect(issues).toHaveLength(0);
    expect(config.keys[0]!.aColumn).toBe('c4');
    expect(config.fields.map((f) => f.aColumn)).toEqual(['c2', 'c3', 'c1', 'c0']);
  });

  it('never remaps by position: missing, renamed and duplicated headers need a decision', () => {
    const changed = loadCsv('order id,SKU,Qty,Amount,Amount,Date\n1,A,1,1,1,03/04/2026\n').table;
    const { config, issues, newColumns } = resolvePortable(portable, changed.columns, b.columns);
    const kinds = issues.map((i) => `${i.role}:${i.ruleLabel}:${i.kind}`).sort();
    expect(kinds).toEqual(['A:Amount:duplicate', 'A:Order ID:renamed', 'A:Quantity:missing']);
    // unresolved columns are left unset so the comparison cannot run on a guess
    expect(config.keys[0]!.aColumn).toBe('');
    expect(config.fields.find((f) => f.label === 'Quantity')!.aColumn).toBe('');
    expect(issues.every((i) => i.blocking)).toBe(true);
    expect(newColumns.A).toContain('Qty');
    expect(issues.find((i) => i.kind === 'renamed')!.candidates).toEqual(['c0']);
  });

  it('reuses the saved rules with new, reordered files and gets the same answer', async () => {
    const a2 = loadCsv(csv([['Date', 'Order ID', 'Amount', 'Quantity', 'SKU'], ['03/04/2026', '1001', '100.00', '10', 'PEN'], ['03/04/2026', '1002', '5', '1', 'x']])).table;
    const b2 = loadCsv(csv([['Qty', 'Total', 'Dispatch Date', 'Order Number', 'Product Code'], ['1', '5', '04/03/2026', '1002', 'X'], ['10', '100', '04/03/2026', '1001', 'pen']])).table;
    const { config, issues } = resolvePortable(portable, a2.columns, b2.columns);
    expect(issues).toHaveLength(0);
    const r = await compareTables(a2, b2, config);
    expect(r.summary).toMatchObject({ matched: 2, different: 0, onlyA: 0, onlyB: 0 });
  });
});
