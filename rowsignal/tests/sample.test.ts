import { describe, expect, it } from 'vitest';
import { compareTables } from '../src/engine/compare';
import { loadFileData } from '../src/import/loadFile';
import { DISPATCH_CSV, ORDERS_CSV, SAMPLE_EXPECTED as X, sampleOrdersConfig } from '../src/sample/orders';
import { dispatchXlsx, ordersXlsx } from '../src/sample/fixtures';
import { enc, keysOf } from './helpers';

async function expectSample(a: ReturnType<typeof loadFileData>, b: ReturnType<typeof loadFileData>) {
  const r = await compareTables(a.table, b.table, sampleOrdersConfig());
  expect(r.summary.matched).toBe(X.matched);
  expect(keysOf(r.rows, 'matched')).toEqual(X.matchedKeys);
  expect(r.summary.different).toBe(X.different);
  expect(keysOf(r.rows, 'different')).toEqual(X.differentKeys);
  expect(r.summary.onlyA).toBe(X.onlyA);
  expect(keysOf(r.rows, 'only-a')).toEqual(X.onlyAKeys);
  expect(r.summary.onlyB).toBe(X.onlyB);
  expect(keysOf(r.rows, 'only-b')).toEqual(X.onlyBKeys);
  expect(r.summary.ambiguousGroups).toBe(X.ambiguousGroups);
  expect(r.summary.ambiguousRowsA).toBe(X.ambiguousRowsA);
  expect(r.summary.ambiguousRowsB).toBe(X.ambiguousRowsB);
  expect(r.summary.invalidA).toBe(X.invalidA);
  expect(r.summary.invalidB).toBe(X.invalidB);
  expect(r.accounting.A.total).toBe(10);
  expect(r.accounting.B.total).toBe(10);
  expect(r.accounting.balanced).toBe(true);
  return r;
}

describe('brief sample', () => {
  it('CSV fixtures give the exact expected counts', async () => {
    const r = await expectSample(loadFileData('orders.csv', enc(ORDERS_CSV)), loadFileData('dispatch.csv', enc(DISPATCH_CSV)));
    // worksheet row numbers differ from data-row numbers by the header row
    const p1004 = r.rows.find((x) => x.keyA?.[0] === '1004')!;
    expect(p1004.aRows).toEqual([5]);
    expect(p1004.status).toBe('sdss');
    const p1005 = r.rows.find((x) => x.keyA?.[0] === '1005')!;
    expect(p1005.status).toBe('ssds');
  });

  it('XLSX fixtures give the same results', async () => {
    const a = loadFileData('orders.xlsx', ordersXlsx());
    const b = loadFileData('dispatch.xlsx', dispatchXlsx());
    expect(a.info.kind).toBe('xlsx');
    await expectSample(a, b);
  });
});
