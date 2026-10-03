import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadFileData } from '../src/import/loadFile';
import { CELL_BOOL, CELL_DATE, CELL_ERROR, CELL_FORMULA_NOCACHE, CELL_NUMBER, UserFacingError } from '../src/engine/types';

const fx = (name: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', name)));

describe('XLSX produced by openpyxl (an independent writer)', () => {
  it('lists sheets with their state and defaults to the first visible one', () => {
    const r = loadFileData('openpyxl_multi.xlsx', fx('openpyxl_multi.xlsx'));
    expect(r.info.sheets).toEqual([
      { name: 'Orders', state: 'visible' },
      { name: 'Archive', state: 'hidden' },
      { name: 'Prices', state: 'visible' },
    ]);
    expect(r.info.sheet).toBe('Orders');
  });

  it('honours header-row selection and preserves real worksheet row numbers', () => {
    const r = loadFileData('m.xlsx', fx('openpyxl_multi.xlsx'), { headerRow: 3 });
    const t = r.table;
    expect(t.columns.map((c) => c.header)).toEqual(['Order ID', 'SKU', 'Qty', 'Price', 'Shipped', 'Active', 'Calc', 'Notes']);
    // rows 4,5,7,8,9 are data; row 6 is blank and skipped
    expect([0, 1, 2, 3, 4].map((i) => t.rowNumber(i))).toEqual([4, 5, 7, 8, 9]);
    expect(t.rowCount).toBe(5);
    expect(r.info.aboveHeader).toBe(2);
    expect(r.info.skippedBlank).toBe(1);
    expect(r.info.hiddenRows).toBe(1);
    expect(r.info.hiddenColumns).toBe(1);
    expect(t.columns[7]!.hidden).toBe(true);
  });

  it('keeps text identifiers exactly, flags numbers, dates, booleans and errors', () => {
    const t = loadFileData('m.xlsx', fx('openpyxl_multi.xlsx'), { headerRow: 3 }).table;
    expect(t.text(0, 0)).toBe('00123'); // stored as text: leading zeros survive
    expect(t.flags(0, 0)).toBe(0);
    expect(t.text(1, 0)).toBe('124'); // stored as a number
    expect(t.flags(1, 0) & CELL_NUMBER).toBeTruthy();
    expect(t.text(0, 3)).toBe('12.5');
    expect(t.text(2, 3)).toBe('1234567.891');
    expect(t.text(0, 4)).toBe('2026-04-03');
    expect(t.flags(0, 4) & CELL_DATE).toBeTruthy();
    expect(t.text(2, 4)).toBe('2026-04-03T14:30:00');
    expect(t.text(0, 5)).toBe('TRUE');
    expect(t.flags(0, 5) & CELL_BOOL).toBeTruthy();
    expect(t.text(3, 0)).toBe('#N/A');
    expect(t.flags(3, 0) & CELL_ERROR).toBeTruthy();
    expect(t.text(2, 1)).toBe('  pad  '); // outer spaces preserved
    expect(t.text(0, 7)).toBe('line one\nline two');
    expect(t.text(1, 7)).toBe('x & y < z');
  });

  it('never evaluates formulas: cells with no saved result are flagged, not computed', () => {
    const r = loadFileData('m.xlsx', fx('openpyxl_multi.xlsx'), { headerRow: 3 });
    expect(r.table.text(0, 6)).toBe('');
    expect(r.table.flags(0, 6) & CELL_FORMULA_NOCACHE).toBeTruthy();
    expect(r.info.formulaNoCache).toBe(2);
    expect(r.info.warnings.some((w) => /no saved result/.test(w))).toBe(true);
  });

  it('reads a chosen sheet and does not load others', () => {
    const r = loadFileData('m.xlsx', fx('openpyxl_multi.xlsx'), { sheet: 'Prices' });
    expect(r.info.sheet).toBe('Prices');
    expect(r.table.columns.map((c) => c.header)).toEqual(['Code', 'Price']);
    expect(r.table.rowCount).toBe(2);
  });

  it('reads a hidden sheet only when selected, with a notice', () => {
    const r = loadFileData('m.xlsx', fx('openpyxl_multi.xlsx'), { sheet: 'Archive' });
    expect(r.info.warnings.some((w) => /hidden in the workbook/.test(w))).toBe(true);
    expect(r.table.text(0, 0)).toBe('a1');
  });

  it('supports no-header mode with generated column names', () => {
    const r = loadFileData('m.xlsx', fx('openpyxl_multi.xlsx'), { sheet: 'Prices', headerRow: null });
    expect(r.table.columns.map((c) => c.label)).toEqual(['Column A', 'Column B']);
    expect(r.table.rowCount).toBe(3);
  });
});

describe('Excel date systems', () => {
  it('reads the 1904 date system with its own base', () => {
    const r = loadFileData('d.xlsx', fx('openpyxl_1904.xlsx'));
    expect(r.info.date1904).toBe(true);
    expect(r.table.text(0, 0)).toBe('2026-04-03');
    expect(r.table.text(1, 0)).toBe('1999-12-31');
  });

  it('handles the 1900 system including the fake leap day', () => {
    const r = loadFileData('d.xlsx', fx('openpyxl_1900_serials.xlsx'));
    expect(r.info.date1904).toBe(false);
    const col = (i: number) => r.table.text(i, 1);
    expect(col(0)).toBe('1900-01-01');
    expect(col(1)).toBe('1900-02-28');
    expect(col(3)).toBe('1900-03-01');
    expect(col(4)).toBe('2024-01-01');
    // serial 60 does not exist as a real date: flagged, not guessed
    expect(r.table.flags(2, 1)).toBeGreaterThan(0);
    expect(col(2)).toBe('60');
  });
});

describe('unsupported and hostile input', () => {
  const expectCode = (fn: () => unknown, code: string) => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(UserFacingError);
      expect((e as UserFacingError).code).toBe(code);
      return;
    }
    throw new Error('expected an error with code ' + code);
  };

  it('rejects legacy, macro, pdf and image types with an explanation', () => {
    for (const name of ['a.xls', 'a.xlsm', 'a.pdf', 'a.png', 'a.docx']) {
      expectCode(() => loadFileData(name, new Uint8Array([1, 2, 3, 4])), 'unsupported-type');
    }
  });

  it('detects a password-protected / OLE container saved as .xlsx', () => {
    const ole = new Uint8Array(512);
    ole.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    expectCode(() => loadFileData('p.xlsx', ole), 'xlsx-ole');
  });

  it('detects an xlsx saved with a .csv extension', () => {
    expectCode(() => loadFileData('wrong.csv', fx('openpyxl_1904.xlsx')), 'type-mismatch');
  });

  it('rejects a non-zip file named .xlsx', () => {
    expectCode(() => loadFileData('x.xlsx', new TextEncoder().encode('hello,world\n1,2\n')), 'xlsx-not-zip');
  });

  it('rejects files over the size limit', () => {
    expectCode(() => loadFileData('big.csv', new Uint8Array(20), {}, { ...{ maxFileBytes: 10 }, maxRows: 1, maxCols: 1, maxCells: 1, maxDecompressedBytes: 1, maxZipEntries: 1, maxParseMs: 1 }), 'file-too-large');
  });
});
