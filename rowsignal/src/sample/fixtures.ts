/** Builds the XLSX versions of the sample files from typed rows (shared by the script and tests). */
import { buildXlsx, excelSerialFromYmd, type XCell } from '../export/xlsxWriter';
import { DISPATCH_HEADERS, DISPATCH_ROWS, ORDERS_HEADERS, ORDERS_ROWS } from './orders';

type Typed = Array<[number | null, string, number, number, [number, number, number]]>;

function sheetRows(headers: string[], rows: Typed, dateStyle: 'dateDMY' | 'dateMDY'): XCell[][] {
  const out: XCell[][] = [headers.map((h) => ({ v: h, style: 'bold' as const }))];
  for (const [id, sku, qty, amount, [y, m, d]] of rows) {
    out.push([
      id === null ? null : { v: id, style: 'integer' },
      sku,
      qty,
      { v: amount, style: 'money' },
      { serial: excelSerialFromYmd(y, m, d), style: dateStyle },
    ]);
  }
  return out;
}

export function ordersXlsx(): Uint8Array {
  return buildXlsx([{ name: 'Orders', rows: sheetRows(ORDERS_HEADERS, ORDERS_ROWS, 'dateDMY'), colWidths: [12, 12, 10, 12, 12] }]);
}

export function dispatchXlsx(): Uint8Array {
  return buildXlsx([{ name: 'Dispatch', rows: sheetRows(DISPATCH_HEADERS, DISPATCH_ROWS, 'dateMDY'), colWidths: [14, 14, 8, 12, 14] }]);
}
