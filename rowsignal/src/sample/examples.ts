/**
 * Small worked examples. Each is a real pair of files with a real configuration: the app can open
 * one (`/app?example=<id>`), and public pages render its result by running the same engine at
 * build time, so every number shown on the website is computed, not typed. tests/examples.test.ts
 * pins the expected outcomes so page copy cannot drift from what the engine actually does.
 */
import { defaultFormat, emptyConfig } from '../engine/config';
import type { FieldRule, KeyRule, MatchConfig, Role } from '../engine/types';
import { buildXlsx, excelSerialFromYmd } from '../export/xlsxWriter';
import type { ParseOptions } from '../import/loadFile';
import { DISPATCH_CSV, ORDERS_CSV, sampleOrdersConfig } from './orders';

export interface ExampleFile {
  name: string;
  bytes: () => Uint8Array;
  options?: ParseOptions;
}

export interface Example {
  id: string;
  title: string;
  roleNames: Record<Role, string>;
  files: Record<Role, ExampleFile>;
  config: () => MatchConfig;
}

const enc = (s: string) => new TextEncoder().encode(s);
const csvFile = (name: string, text: string, options?: ParseOptions): ExampleFile => ({ name, bytes: () => enc(text), options });

export function rule(id: string, label: string, kind: FieldRule['kind'], col: string, extra: Partial<FieldRule> = {}): FieldRule {
  return { id, label, kind, aColumn: col, bColumn: col, trim: kind !== 'text' && kind !== 'identifier', caseInsensitive: false, emptyAsNull: false, tolerance: '0', ...extra };
}

export function keyRule(id: string, label: string, col: string, extra: Partial<KeyRule> = {}): KeyRule {
  return { id, label, aColumn: col, bColumn: col, trim: false, caseInsensitive: false, ...extra };
}

function config(keys: KeyRule[], fields: FieldRule[], formats?: Partial<Record<Role, Partial<MatchConfig['formats']['A']>>>): MatchConfig {
  const c = emptyConfig();
  c.keys = keys;
  c.fields = fields;
  c.formats = { A: { ...defaultFormat(), ...formats?.A }, B: { ...defaultFormat(), ...formats?.B } };
  return c;
}

// ---- inventory: count sheet vs stock list ------------------------------------------------------
const INVENTORY_A = ['SKU,Counted,Bin', 'SKU-100,24,A1', 'SKU-101,0,A2', 'SKU-102,15,B1', 'SKU-103,8,B2', 'SKU-200,40,C1', ''].join('\n');
const INVENTORY_B = ['Item Code,On hand,Bin', 'SKU-100,24,A1', 'SKU-101,3,A2', 'SKU-102,15,B4', 'SKU-104,12,B3', 'SKU-200,40,C1', ''].join('\n');

// ---- missing rows: two customer lists, emails typed differently ---------------------------------
const LIST_A = ['Email,Name', 'ana@example.com,Ana', 'ben@example.com,Ben', 'cara@example.com,Cara', 'dev@example.com,Dev', 'eli@example.com,Eli', ''].join('\n');
const LIST_B = ['Email,Name', '"Ana@Example.com ",Ana', 'ben@example.com,Ben', 'dev@example.com,Dev', 'fay@example.com,Fay', ''].join('\n');

// ---- CSV: comma file vs semicolon file with European number formatting ---------------------------
const CSV_A = ['Invoice,Total', 'INV-001,"1,250.50"', 'INV-002,980.00', 'INV-003,"12,000.00"', ''].join('\n');
const CSV_B = ['Invoice;Total', 'INV-001;1.250,50', 'INV-002;980,00', 'INV-003;12.500,00', ''].join('\n');

// ---- duplicates guide: order lines ---------------------------------------------------------------
const LINES_A = ['Order,SKU,Qty', '5001,PEN,10', '5001,BOOK,2', '5002,MUG,4', ''].join('\n');
const LINES_B = ['Order,SKU,Qty', '5001,PEN,10', '5001,BOOK,3', '5002,MUG,4', ''].join('\n');

// ---- Excel: two workbooks, title rows, several sheets, real dates, text IDs with leading zeros ----
const d = (y: number, m: number, day: number) => ({ serial: excelSerialFromYmd(y, m, day), style: 'dateISO' as const });
function targetsWorkbook(): Uint8Array {
  return buildXlsx([
    { name: 'Notes', rows: [['Targets for Q1 — draft']] },
    {
      name: 'Targets',
      rows: [
        ['Q1 sales targets'],
        ['Prepared by finance'],
        ['Rep ID', 'Name', 'Target', 'Start date'],
        ['007', 'Ana', 50000, d(2025, 1, 6)],
        ['008', 'Ben', 42000, d(2025, 2, 3)],
        ['009', 'Cara', 38000, d(2025, 2, 3)],
        ['010', 'Dev', 61000, d(2025, 3, 10)],
      ],
    },
  ]);
}
function rosterWorkbook(): Uint8Array {
  return buildXlsx([
    {
      name: 'Roster',
      rows: [
        ['Employee', 'Name', 'Target', 'Joined'],
        ['007', 'Ana', 50000, d(2025, 1, 6)],
        ['008', 'Ben', 45000, d(2025, 2, 3)],
        ['009', 'Cara', 38000, d(2025, 2, 10)],
        ['011', 'Eve', 30000, d(2025, 3, 3)],
      ],
    },
  ]);
}

export const EXAMPLES: Record<string, Example> = {
  orders: {
    id: 'orders',
    title: 'Orders vs dispatch',
    roleNames: { A: 'Orders', B: 'Dispatch' },
    files: { A: csvFile('orders.csv', ORDERS_CSV), B: csvFile('dispatch.csv', DISPATCH_CSV) },
    config: sampleOrdersConfig,
  },
  inventory: {
    id: 'inventory',
    title: 'Inventory count vs stock list',
    roleNames: { A: 'Count sheet', B: 'Stock list' },
    files: { A: csvFile('count-sheet.csv', INVENTORY_A), B: csvFile('stock-list.csv', INVENTORY_B) },
    config: () => config([keyRule('k1', 'SKU', 'c0')], [rule('f1', 'Quantity', 'number', 'c1'), rule('f2', 'Bin', 'identifier', 'c2')]),
  },
  missing: {
    id: 'missing',
    title: 'Full list vs checked list',
    roleNames: { A: 'Full list', B: 'Checked list' },
    files: { A: csvFile('full-list.csv', LIST_A), B: csvFile('checked-list.csv', LIST_B) },
    config: () => config([keyRule('k1', 'Email', 'c0', { trim: true, caseInsensitive: true })], [rule('f1', 'Name', 'text', 'c1')]),
  },
  csv: {
    id: 'csv',
    title: 'Invoices: comma file vs semicolon file',
    roleNames: { A: 'Ledger', B: 'Bank export' },
    files: { A: csvFile('ledger.csv', CSV_A), B: csvFile('bank-export.csv', CSV_B) },
    config: () => config([keyRule('k1', 'Invoice', 'c0')], [rule('f1', 'Total', 'number', 'c1')], { B: { decimal: ',', thousands: '.' } }),
  },
  excel: {
    id: 'excel',
    title: 'Two Excel workbooks',
    roleNames: { A: 'Targets', B: 'Roster' },
    files: {
      A: { name: 'q1-targets.xlsx', bytes: targetsWorkbook, options: { sheet: 'Targets', headerRow: 3 } },
      B: { name: 'roster.xlsx', bytes: rosterWorkbook },
    },
    config: () => config([keyRule('k1', 'Rep ID', 'c0')], [rule('f1', 'Name', 'text', 'c1'), rule('f2', 'Target', 'number', 'c2'), rule('f3', 'Start date', 'date', 'c3')]),
  },
  'duplicates-one-key': {
    id: 'duplicates-one-key',
    title: 'Order lines, identified by order number only',
    roleNames: { A: 'Sent', B: 'Received' },
    files: { A: csvFile('lines-sent.csv', LINES_A), B: csvFile('lines-received.csv', LINES_B) },
    config: () => config([keyRule('k1', 'Order', 'c0')], [rule('f1', 'Qty', 'number', 'c2')]),
  },
  'duplicates-two-keys': {
    id: 'duplicates-two-keys',
    title: 'Order lines, identified by order number and SKU',
    roleNames: { A: 'Sent', B: 'Received' },
    files: { A: csvFile('lines-sent.csv', LINES_A), B: csvFile('lines-received.csv', LINES_B) },
    config: () => config([keyRule('k1', 'Order', 'c0'), keyRule('k2', 'SKU', 'c1')], [rule('f1', 'Qty', 'number', 'c2')]),
  },
};
