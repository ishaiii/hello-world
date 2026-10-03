/**
 * Deterministic benchmark fixtures: N rows × 12 columns. File B is File A shuffled, with ~3% of
 * rows removed, ~3% added and ~5% changed, so every result category is exercised.
 * Usage: tsx scripts/bench/generate.ts <outDir> <rows> [xlsx]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildXlsx, excelSerialFromYmd, type XCell } from '../../src/export/xlsxWriter';

export const HEADERS_A = ['Item ID', 'Name', 'Category', 'Qty', 'Price', 'Cost', 'Received', 'Warehouse', 'Supplier', 'Note', 'Active', 'Batch'];
export const HEADERS_B_DIFFERENT = ['Code', 'Title', 'Group', 'Units', 'Unit price', 'Unit cost', 'Date in', 'Site', 'Vendor', 'Comment', 'Enabled', 'Lot'];

export const HEADERS_B = process.env.SAME_HEADERS ? HEADERS_A : HEADERS_B_DIFFERENT;

let seed = 12345;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;

export interface Row {
  id: string;
  cells: string[];
  y: number;
  m: number;
  d: number;
  qty: number;
  price: string;
  cost: string;
}

function makeRow(i: number): Row {
  const qty = Math.floor(rnd() * 500);
  const price = (rnd() * 900 + 1).toFixed(2);
  const cost = (Number(price) * 0.6).toFixed(2);
  const y = 2025 + Math.floor(rnd() * 2);
  const m = 1 + Math.floor(rnd() * 12);
  const d = 1 + Math.floor(rnd() * 28);
  const id = `SKU-${String(i).padStart(6, '0')}`;
  return {
    id,
    qty,
    price,
    cost,
    y,
    m,
    d,
    cells: [id, `Item ${i} ${pick(['Alpha', 'Bravo', 'Delta', 'Echo'])}`, pick(['Tools', 'Parts', 'Toys', 'Books']), String(qty), price, cost, `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`, pick(['W1', 'W2', 'W3']), pick(['Acme', 'Globex', 'Initech']), '', pick(['TRUE', 'FALSE']), `B${Math.floor(rnd() * 900)}`],
  };
}

export function generate(n: number) {
  seed = 12345;
  const a: Row[] = Array.from({ length: n }, (_, i) => makeRow(i));
  const b: Row[] = [];
  for (const r of a) {
    const roll = rnd();
    if (roll < 0.03) continue; // removed
    const copy: Row = { ...r, cells: [...r.cells] };
    if (roll > 0.95) {
      copy.qty += 1;
      copy.cells[3] = String(copy.qty);
    }
    b.push(copy);
  }
  for (let i = 0; i < Math.floor(n * 0.03); i++) b.push(makeRow(n + i)); // added
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j]!, b[i]!];
  }
  return { a, b };
}

const csv = (headers: string[], rows: Row[]) => [headers.join(','), ...rows.map((r) => r.cells.join(','))].join('\r\n') + '\r\n';

function xlsx(headers: string[], rows: Row[], dmy: boolean): Uint8Array {
  const body: XCell[][] = [headers];
  for (const r of rows) {
    body.push([r.id, r.cells[1]!, r.cells[2]!, r.qty, Number(r.price), Number(r.cost), { serial: excelSerialFromYmd(r.y, r.m, r.d), style: dmy ? 'dateDMY' : 'dateMDY' }, r.cells[7]!, r.cells[8]!, r.cells[9]!, r.cells[10]!, r.cells[11]!]);
  }
  return buildXlsx([{ name: 'Data', rows: body }]);
}

const [, , out, rowsArg, kind] = process.argv;
if (out && rowsArg) {
  const n = Number(rowsArg);
  mkdirSync(out, { recursive: true });
  const { a, b } = generate(n);
  const bCsv = (rows: Row[]) => csv(HEADERS_B, rows.map((r) => ({ ...r, cells: r.cells.map((c, i) => (i === 6 ? `${String(r.m).padStart(2, '0')}/${String(r.d).padStart(2, '0')}/${r.y}` : c)) })));
  writeFileSync(join(out, `a-${n}.csv`), csv(HEADERS_A, a));
  writeFileSync(join(out, `b-${n}.csv`), bCsv(b));
  if (kind === 'xlsx') {
    writeFileSync(join(out, `a-${n}.xlsx`), xlsx(HEADERS_A, a, true));
    writeFileSync(join(out, `b-${n}.xlsx`), xlsx(HEADERS_B, b, false));
  }
  console.log(`wrote ${n} rows to ${out}`);
}
