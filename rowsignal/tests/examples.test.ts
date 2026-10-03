import { describe, expect, it } from 'vitest';
import { runExample } from '../src/sample/runExample';
import { keysOf } from './helpers';

describe('worked examples used on the public pages', () => {
  it('orders: the brief sample', async () => {
    const r = await runExample('orders');
    expect(r.result.summary).toMatchObject({ matched: 4, different: 2, onlyA: 1, onlyB: 2, ambiguousGroups: 1 });
  });

  it('inventory: two quantity/bin differences, one uncounted, one unlisted', async () => {
    const { result } = await runExample('inventory');
    expect(keysOf(result.rows, 'matched')).toEqual(['SKU-100', 'SKU-200']);
    expect(keysOf(result.rows, 'different')).toEqual(['SKU-101', 'SKU-102']);
    expect(keysOf(result.rows, 'only-a')).toEqual(['SKU-103']);
    expect(keysOf(result.rows, 'only-b')).toEqual(['SKU-104']);
    expect(result.rows.find((r) => r.keyA?.[0] === 'SKU-101')!.reasons[0]).toBe('Quantity: A has 0, B has 3.');
    expect(result.rows.find((r) => r.keyA?.[0] === 'SKU-102')!.status).toBe('sd');
  });

  it('missing rows: case and spacing handled by the identifier rule', async () => {
    const { result } = await runExample('missing');
    expect(keysOf(result.rows, 'matched').map((k) => k.toLowerCase().trim())).toEqual(['ana@example.com', 'ben@example.com', 'dev@example.com']);
    expect(keysOf(result.rows, 'only-a')).toEqual(['cara@example.com', 'eli@example.com']);
    expect(keysOf(result.rows, 'only-b')).toEqual(['fay@example.com']);
  });

  it('csv: a semicolon file with European numbers matches a comma file', async () => {
    const { result, info } = await runExample('csv');
    expect(info.A.delimiter).toBe(',');
    expect(info.B.delimiter).toBe(';');
    expect(keysOf(result.rows, 'matched')).toEqual(['INV-001', 'INV-002']);
    expect(keysOf(result.rows, 'different')).toEqual(['INV-003']);
  });

  it('excel: sheet and header row are chosen, IDs keep leading zeros, real dates compare', async () => {
    const { result, info, tables } = await runExample('excel');
    expect(info.A.sheet).toBe('Targets');
    expect(info.A.headerRow).toBe(3);
    expect(tables.A.rows[0]![0]).toBe('007');
    expect(keysOf(result.rows, 'matched')).toEqual(['007']);
    const ben = result.rows.find((r) => r.keyA?.[0] === '008')!;
    expect(ben.reasons).toEqual(['Target: A has 42000, B has 45000.']);
    const cara = result.rows.find((r) => r.keyA?.[0] === '009')!;
    expect(cara.reasons[0]).toContain('Start date');
    expect(keysOf(result.rows, 'only-a')).toEqual(['010']);
    expect(keysOf(result.rows, 'only-b')).toEqual(['011']);
  });

  it('duplicates: one key is ambiguous, adding SKU resolves it', async () => {
    const one = (await runExample('duplicates-one-key')).result.summary;
    expect(one).toMatchObject({ ambiguousGroups: 1, ambiguousRowsA: 2, ambiguousRowsB: 2, matched: 1 });
    const two = (await runExample('duplicates-two-keys')).result.summary;
    expect(two).toMatchObject({ ambiguousGroups: 0, matched: 2, different: 1 });
  });
});
