import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { loadFileData } from '../src/import/loadFile';
import { CELL_FORMULA, CELL_FORMULA_NOCACHE, CELL_DATE, CELL_NUMBER } from '../src/engine/types';

async function workbook(build: (wb: ExcelJS.Workbook) => void): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  build(wb);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe('XLSX produced by ExcelJS (shared strings, data descriptors)', () => {
  it('reads shared strings, rich text, numbers, dates, booleans', async () => {
    const bytes = await workbook((wb) => {
      const ws = wb.addWorksheet('Data');
      ws.addRow(['id', 'name', 'qty', 'when', 'ok']);
      ws.addRow(['007', 'Plain', 5, new Date(Date.UTC(2026, 3, 3)), true]);
      ws.addRow(['008', { richText: [{ text: 'Rich ' }, { font: { bold: true }, text: 'text' }] }, 1.5, new Date(Date.UTC(2026, 3, 4)), false]);
      ws.getColumn(4).numFmt = 'yyyy-mm-dd';
    });
    const r = loadFileData('e.xlsx', bytes);
    expect(r.table.text(0, 0)).toBe('007');
    expect(r.table.text(1, 1)).toBe('Rich text');
    expect(r.table.text(1, 2)).toBe('1.5');
    expect(r.table.flags(0, 2) & CELL_NUMBER).toBeTruthy();
    expect(r.table.text(0, 3)).toBe('2026-04-03');
    expect(r.table.flags(0, 3) & CELL_DATE).toBeTruthy();
    expect(r.table.text(0, 4)).toBe('TRUE');
  });

  it('uses cached formula results when present and flags formulas without one', async () => {
    const bytes = await workbook((wb) => {
      const ws = wb.addWorksheet('F');
      ws.addRow(['a', 'b', 'sum']);
      ws.addRow([2, 3]);
      ws.getCell('C2').value = { formula: 'A2+B2', result: 5 };
      ws.addRow([4, 6]);
      ws.getCell('C3').value = { formula: 'A3+B3' } as ExcelJS.CellFormulaValue;
    });
    const r = loadFileData('f.xlsx', bytes);
    expect(r.table.text(0, 2)).toBe('5');
    expect(r.table.flags(0, 2) & CELL_FORMULA).toBeTruthy();
    expect(r.table.text(1, 2)).toBe('');
    expect(r.table.flags(1, 2) & CELL_FORMULA_NOCACHE).toBeTruthy();
    expect(r.info.formulaCells).toBe(2);
    expect(r.info.formulaNoCache).toBe(1);
  });

  it('reads the 1904 date system when ExcelJS writes it', async () => {
    const bytes = await workbook((wb) => {
      wb.properties.date1904 = true;
      const ws = wb.addWorksheet('D');
      ws.addRow(['d']);
      ws.addRow([new Date(Date.UTC(2026, 3, 3))]);
      ws.getColumn(1).numFmt = 'yyyy-mm-dd';
    });
    const r = loadFileData('d.xlsx', bytes);
    expect(r.info.date1904).toBe(true);
    expect(r.table.text(0, 0)).toBe('2026-04-03');
  });

  it('handles a larger sheet end to end', async () => {
    const bytes = await workbook((wb) => {
      const ws = wb.addWorksheet('Big');
      ws.addRow(['id', 'sku', 'qty', 'amt']);
      for (let i = 0; i < 5000; i++) ws.addRow([`ID${i}`, `SKU-${i % 50}`, i, i * 1.25]);
    });
    const r = loadFileData('big.xlsx', bytes);
    expect(r.table.rowCount).toBe(5000);
    expect(r.table.text(4999, 0)).toBe('ID4999');
    expect(r.table.text(4999, 3)).toBe('6248.75');
  });
});
