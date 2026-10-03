import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { Comparer } from '../src/engine/comparer';
import { compareTables } from '../src/engine/compare';
import { buildExport, type ExportOptions } from '../src/export/build';
import { neutraliseForCsv, startsLikeFormula } from '../src/export/safeText';
import { buildXlsx, sanitizeSheetName } from '../src/export/xlsxWriter';
import { loadFileData } from '../src/import/loadFile';
import { DISPATCH_CSV, ORDERS_CSV, sampleOrdersConfig } from '../src/sample/orders';
import { cfg, csv, enc } from './helpers';

const baseOpts: ExportOptions = {
  format: 'xlsx',
  scope: 'all',
  rowIds: null,
  fieldIds: null,
  includeNormalized: false,
  includeReasons: true,
  includeRowRefs: true,
  includeReview: false,
  includeRules: true,
  roleNames: { A: 'Orders', B: 'Dispatch' },
  fileNames: { A: 'orders.csv', B: 'dispatch.csv' },
  sheetNames: { A: null, B: null },
};

async function sampleExport(over: Partial<ExportOptions> = {}, annotations = {}) {
  const a = loadFileData('orders.csv', enc(ORDERS_CSV)).table;
  const b = loadFileData('dispatch.csv', enc(DISPATCH_CSV)).table;
  const result = await compareTables(a, b, sampleOrdersConfig());
  const cmp = new Comparer(a, b, result.config);
  return { built: buildExport(result, cmp, { ...baseOpts, ...over }, annotations, new Date(2026, 3, 3, 14, 5)), result };
}

async function readBack(bytes: Uint8Array) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  return wb;
}

const rowValues = (ws: ExcelJS.Worksheet) => {
  const out: unknown[][] = [];
  ws.eachRow((row) => out.push((row.values as unknown[]).slice(1)));
  return out;
};

describe('XLSX export read back independently with ExcelJS', () => {
  it('has the expected sheets and per-category row counts for the sample', async () => {
    const { built } = await sampleExport();
    expect(built.filename).toBe('rowsignal-results-20260403-1405.xlsx');
    const wb = await readBack(built.bytes);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Paired results', 'Only in File A', 'Only in File B', 'Ambiguous keys', 'Invalid keys', 'Rules']);
    const count = (n: string) => wb.getWorksheet(n)!.rowCount - 1;
    expect(count('Paired results')).toBe(6);
    expect(count('Only in File A')).toBe(1);
    expect(count('Only in File B')).toBe(2);
    expect(count('Ambiguous keys')).toBe(3); // 2 rows from A + 1 from B, never collapsed
    expect(count('Invalid keys')).toBe(2);
  });

  it('writes identifiers and raw values as exact text, with source row numbers', async () => {
    const { built } = await sampleExport();
    const ws = (await readBack(built.bytes)).getWorksheet('Paired results')!;
    const header = rowValues(ws)[0]!;
    expect(header.slice(0, 5)).toEqual(['Result', 'How paired', 'Order ID (File A)', 'Order ID (File B)', 'Row in File A']);
    const r1004 = rowValues(ws).find((r) => r[2] === '1004')!;
    expect(r1004[0]).toBe('Different');
    expect(typeof r1004[2]).toBe('string');
    expect(r1004[4]).toBe(5); // worksheet row of order 1004 in orders.csv (header is row 1)
    expect(r1004[5]).toBe(6);
    const iAmount = header.indexOf('Amount (File A)');
    const r1002 = rowValues(ws).find((r) => r[2] === '1002')!;
    expect(r1002[iAmount]).toBe('1,200.00'); // raw text preserved, not coerced
    expect(r1002[iAmount + 1]).toBe('1200.00');
    expect(rowValues(ws).find((r) => r[2] === '1003')![header.indexOf('SKU (File B)')]).toBe(' MUG '); // outer spaces kept
  });

  it('summary counts agree with the engine and the accounting balances', async () => {
    const { built, result } = await sampleExport();
    const ws = (await readBack(built.bytes)).getWorksheet('Summary')!;
    const rows = rowValues(ws);
    const get = (label: string) => rows.find((r) => r[0] === label)!;
    expect(get('Matched')[1]).toBe(result.summary.matched);
    expect(get('Different')[1]).toBe(2);
    expect(get('Only in File B')[1]).toBe(2);
    expect(get('Duplicate keys')[1]).toBe(1);
    expect(get('Invalid keys')[1]).toBe(2);
    const acc = rows.filter((r) => r[0] === 'File A' || r[0] === 'File B').filter((r) => r.length >= 9);
    expect(acc.map((r) => [r[1], r[7], r[8]])).toEqual([[10, 10, 'Yes'], [10, 10, 'Yes']]);
  });

  it('exports only the filtered rows when asked, and says so', async () => {
    const { built } = await sampleExport({ scope: 'filtered', rowIds: ['b:7', 'b:8'] });
    const wb = await readBack(built.bytes);
    expect(wb.getWorksheet('Only in File B')!.rowCount - 1).toBe(2);
    expect(wb.getWorksheet('Paired results')!.rowCount - 1).toBe(0);
    const text = rowValues(wb.getWorksheet('Summary')!).flat().join(' ');
    expect(text).toMatch(/Filtered view: 2 of 12 result rows/);
  });

  it('includes review notes only when requested', async () => {
    const annotations = { 'p:4:1004': { flag: 'followup' as const, note: 'ask the warehouse' } };
    const without = await sampleExport({ includeReview: false }, annotations);
    expect(rowValues((await readBack(without.built.bytes)).getWorksheet('Paired results')!)[0]).not.toContain('Review note');
    const withNotes = await sampleExport({ includeReview: true }, annotations);
    const ws = (await readBack(withNotes.built.bytes)).getWorksheet('Paired results')!;
    const head = rowValues(ws)[0]!;
    const row = rowValues(ws).find((r) => r[2] === '1004')!;
    expect(row[head.indexOf('Review status')]).toBe('Needs follow-up');
    expect(row[head.indexOf('Review note')]).toBe('ask the warehouse');
  });

  it('adds typed numeric "as compared" columns when requested', async () => {
    const { built } = await sampleExport({ includeNormalized: true });
    const ws = (await readBack(built.bytes)).getWorksheet('Paired results')!;
    const head = rowValues(ws)[0]!;
    const row = rowValues(ws).find((r) => r[2] === '1002')!;
    expect(row[head.indexOf('Amount (File A, as compared)')]).toBe(1200); // a real number
    expect(row[head.indexOf('Date (File A, as compared)')]).toBe('2026-04-03');
  });

  it('has a rules sheet that describes the settings in words', async () => {
    const { built } = await sampleExport();
    const text = rowValues((await readBack(built.bytes)).getWorksheet('Rules')!).flat().join(' ');
    expect(text).toMatch(/exact identifier/);
    expect(text).toMatch(/File A read as DD\/MM\/YYYY, File B read as MM\/DD\/YYYY/);
    expect(text).toMatch(/Column.*Order Number/s);
  });
});

describe('CSV export', () => {
  it('uses a UTF-8 byte-order mark, CRLF and quoting, and reads back to the same values', async () => {
    const { built } = await sampleExport({ format: 'csv' });
    expect(built.mime).toContain('text/csv');
    expect([built.bytes[0], built.bytes[1], built.bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const back = loadFileData('r.csv', built.bytes).table;
    expect(back.rowCount).toBe(6 + 1 + 2 + 3 + 2);
    const col = (name: string) => back.columns.find((c) => c.header === name)!.index;
    const r = Array.from({ length: back.rowCount }, (_, i) => i).find((i) => back.text(i, col('Order ID (File A)')) === '1002')!;
    expect(back.text(r, col('Amount (File A)'))).toBe('1,200.00');
    expect(new TextDecoder().decode(built.bytes)).toContain('\r\n');
  });
});

describe('formula-injection protection', () => {
  const evil = ['=HYPERLINK("http://evil.example","click")', '+1+1', '-2+3', '@SUM(A1:A9)', '\t=1+1', '+91 98765 43210', '=cmd|\' /C calc\'!A0', ' =1+1'];
  const safe = ['-5.25', '+7', '-1,200.00', '0123', 'plain', 'a=b', '1e5', '-1E-3'];

  it('classifies formula-like text and plain numbers correctly', () => {
    for (const s of evil) expect(startsLikeFormula(s), s).toBe(true);
    for (const s of safe) expect(startsLikeFormula(s), s).toBe(false);
    expect(neutraliseForCsv('=1+1')).toBe("'=1+1");
    expect(neutraliseForCsv('-5.25')).toBe('-5.25'); // a real negative number is untouched
  });

  async function exportValues(format: 'csv' | 'xlsx') {
    const values = [...evil, ...safe];
    const a = loadFileData('a.csv', enc(csv([['id', 'note'], ...values.map((v, i) => [`k${i}`, v])]))).table;
    const b = loadFileData('b.csv', enc(csv([['id', 'note'], ...values.map((v, i) => [`k${i}`, v])]))).table;
    const config = cfg({ fields: [{ aColumn: 'c1' }] });
    const result = await compareTables(a, b, config);
    const built = buildExport(result, new Comparer(a, b, config), { ...baseOpts, format, includeRules: false }, {});
    return { built, values };
  }

  it('prefixes dangerous text in CSV but leaves safe numbers alone', async () => {
    const { built, values } = await exportValues('csv');
    const back = loadFileData('x.csv', built.bytes).table;
    const col = back.columns.find((c) => c.header === 'Field 1 (File A)')!.index;
    const got = new Map<string, string>();
    for (let i = 0; i < back.rowCount; i++) got.set(back.text(i, 2), back.text(i, col));
    values.forEach((v, i) => {
      const out = got.get(`k${i}`)!;
      if (evil.includes(v)) expect(out, v).toBe("'" + v);
      else expect(out, v).toBe(v);
    });
  });

  it('writes untrusted text as literal string cells in XLSX, never as formulas', async () => {
    const { built, values } = await exportValues('xlsx');
    const ws = (await readBack(built.bytes)).getWorksheet('Paired results')!;
    const head = rowValues(ws)[0]!;
    const col = head.indexOf('Field 1 (File A)');
    const idCol = head.indexOf('Key 1 (File A)');
    const got = new Map<string, unknown>();
    ws.eachRow((row, n) => {
      if (n > 1) got.set(String((row.values as unknown[])[idCol + 1]), row.getCell(col + 1));
    });
    values.forEach((v, i) => {
      const cell = got.get(`k${i}`) as ExcelJS.Cell;
      expect(cell.type, v).toBe(ExcelJS.ValueType.String);
      expect(cell.value, v).toBe(v);
      expect((cell as unknown as { formula?: string }).formula).toBeUndefined();
    });
  });
});

describe('XLSX writer robustness', () => {
  it('sanitises sheet names to Excel rules and keeps them unique', () => {
    const taken = new Set<string>();
    const names = ['A/B:C*D?[E]', 'x'.repeat(50), "'quoted'", 'History', '', 'Summary', 'summary'].map((n) => {
      const s = sanitizeSheetName(n, taken);
      taken.add(s);
      return s;
    });
    for (const n of names) {
      expect(n.length).toBeGreaterThan(0);
      expect(n.length).toBeLessThanOrEqual(31);
      expect(n).not.toMatch(/[[\]:*?/\\]/);
      expect(n.startsWith("'") || n.endsWith("'")).toBe(false);
    }
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    expect(names).not.toContain('History');
  });

  it('strips characters XML cannot hold and truncates cells over Excel’s limit', async () => {
    const bytes = buildXlsx([{ name: 'S', rows: [['bad\u0001\u0008 char', 'z'.repeat(40000), 'emoji 😀 ok', 'lone \uD800 surrogate']] }]);
    const ws = (await readBack(bytes)).getWorksheet('S')!;
    const row = ws.getRow(1).values as string[];
    expect(row[1]).toBe('bad�� char');
    expect(row[2]!.length).toBe(32767);
    expect(row[3]).toBe('emoji 😀 ok');
    expect(row[4]).toBe('lone � surrogate');
  });
});

let hasOpenpyxl = true;
try {
  execFileSync('python3', ['-c', 'import openpyxl'], { stdio: 'ignore' });
} catch {
  hasOpenpyxl = false;
}

describe.skipIf(!hasOpenpyxl)('XLSX export read back with openpyxl (a separate implementation)', () => {
  it('opens the sample export and sees the same sheets, strings and counts', async () => {
    const { built } = await sampleExport();
    const dir = mkdtempSync(join(tmpdir(), 'rowsignal-'));
    const path = join(dir, 'export.xlsx');
    writeFileSync(path, built.bytes);
    const out = execFileSync(
      'python3',
      [
        '-c',
        `
import json, sys, openpyxl
wb = openpyxl.load_workbook(sys.argv[1])
res = {"sheets": wb.sheetnames}
ws = wb["Paired results"]
res["paired_rows"] = ws.max_row - 1
header = [c.value for c in ws[1]]
res["header"] = header[:4]
row = [r for r in ws.iter_rows(min_row=2, values_only=True) if r[2] == "1004"][0]
res["r1004"] = [row[0], row[2], row[4]]
res["key_type"] = type(row[2]).__name__
res["formulas"] = sum(1 for s in wb for r in s.iter_rows() for c in r if c.data_type == "f")
print(json.dumps(res))
`,
        path,
      ],
      { encoding: 'utf8' },
    );
    const res = JSON.parse(out);
    expect(res.sheets).toEqual(['Summary', 'Paired results', 'Only in File A', 'Only in File B', 'Ambiguous keys', 'Invalid keys', 'Rules']);
    expect(res.paired_rows).toBe(6);
    expect(res.r1004).toEqual(['Different', '1004', 5]);
    expect(res.key_type).toBe('str');
    expect(res.formulas).toBe(0);
  });
});
