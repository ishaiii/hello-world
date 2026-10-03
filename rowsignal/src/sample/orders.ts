/**
 * The canonical sample: an orders export (File A) against a dispatch sheet (File B).
 * The CSV text below IS the downloadable fixture; the XLSX fixtures are generated from the typed
 * rows. Expected results are asserted by tests/sample.test.ts and reused by the homepage preview.
 */
import { defaultFormat, emptyConfig } from '../engine/config';
import type { MatchConfig } from '../engine/types';

export const ORDERS_CSV = [
  'Order ID,SKU,Quantity,Amount,Date',
  '1001,PEN,10,100.00,03/04/2026',
  '1002,BOOK,12,"1,200.00",03/04/2026',
  '1003,mug,2,400.00,03/04/2026',
  '1004,BAG,5,500.00,03/04/2026',
  '1005,LAMP,1,800.00,03/04/2026',
  '1006,MAT,3,300.00,03/04/2026',
  '1007,BOX,4,200.00,03/04/2026',
  '1008,TAG-A,2,40.00,03/04/2026',
  '1008,TAG-B,3,60.00,03/04/2026',
  ',CLIP,1,10.00,03/04/2026',
  '',
].join('\r\n');

export const DISPATCH_CSV = [
  'Order Number,Product Code,Qty,Total,Dispatch Date',
  '1006,MAT,3,300.00,04/03/2026',
  '1001,PEN,10,100.00,04/03/2026',
  '1002,BOOK,12,1200.00,04/03/2026',
  '1003," MUG ",2,400.00,04/03/2026',
  '1004,BAG,4,500.00,04/03/2026',
  '1005,LAMP,1,850.00,04/03/2026',
  '1008,TAG-A,2,40.00,04/03/2026',
  '1009,PAD,2,70.00,04/03/2026',
  '1010,TAPE,1,30.00,04/03/2026',
  ',PIN,1,5.00,04/03/2026',
  '',
].join('\r\n');

/** Typed rows for the XLSX fixtures: identifiers and quantities as numbers, real dates, MUG padded. */
export const ORDERS_HEADERS = ['Order ID', 'SKU', 'Quantity', 'Amount', 'Date'];
export const ORDERS_ROWS: Array<[number | null, string, number, number, [number, number, number]]> = [
  [1001, 'PEN', 10, 100, [2026, 4, 3]],
  [1002, 'BOOK', 12, 1200, [2026, 4, 3]],
  [1003, 'mug', 2, 400, [2026, 4, 3]],
  [1004, 'BAG', 5, 500, [2026, 4, 3]],
  [1005, 'LAMP', 1, 800, [2026, 4, 3]],
  [1006, 'MAT', 3, 300, [2026, 4, 3]],
  [1007, 'BOX', 4, 200, [2026, 4, 3]],
  [1008, 'TAG-A', 2, 40, [2026, 4, 3]],
  [1008, 'TAG-B', 3, 60, [2026, 4, 3]],
  [null, 'CLIP', 1, 10, [2026, 4, 3]],
];

export const DISPATCH_HEADERS = ['Order Number', 'Product Code', 'Qty', 'Total', 'Dispatch Date'];
export const DISPATCH_ROWS: Array<[number | null, string, number, number, [number, number, number]]> = [
  [1006, 'MAT', 3, 300, [2026, 4, 3]],
  [1001, 'PEN', 10, 100, [2026, 4, 3]],
  [1002, 'BOOK', 12, 1200, [2026, 4, 3]],
  [1003, ' MUG ', 2, 400, [2026, 4, 3]],
  [1004, 'BAG', 4, 500, [2026, 4, 3]],
  [1005, 'LAMP', 1, 850, [2026, 4, 3]],
  [1008, 'TAG-A', 2, 40, [2026, 4, 3]],
  [1009, 'PAD', 2, 70, [2026, 4, 3]],
  [1010, 'TAPE', 1, 30, [2026, 4, 3]],
  [null, 'PIN', 1, 5, [2026, 4, 3]],
];

/** The match rules the brief specifies for this sample. */
export function sampleOrdersConfig(): MatchConfig {
  const config = emptyConfig();
  config.keys = [{ id: 'k1', label: 'Order ID', aColumn: 'c0', bColumn: 'c0', trim: false, caseInsensitive: false }];
  config.fields = [
    { id: 'f1', label: 'SKU', kind: 'text', aColumn: 'c1', bColumn: 'c1', trim: true, caseInsensitive: true, emptyAsNull: false, tolerance: '0' },
    { id: 'f2', label: 'Quantity', kind: 'number', aColumn: 'c2', bColumn: 'c2', trim: true, caseInsensitive: false, emptyAsNull: false, tolerance: '0' },
    { id: 'f3', label: 'Amount', kind: 'number', aColumn: 'c3', bColumn: 'c3', trim: true, caseInsensitive: false, emptyAsNull: false, tolerance: '0' },
    { id: 'f4', label: 'Date', kind: 'date', aColumn: 'c4', bColumn: 'c4', trim: true, caseInsensitive: false, emptyAsNull: false, tolerance: '0' },
  ];
  config.formats = {
    A: { ...defaultFormat(), dateOrder: 'DMY' },
    B: { ...defaultFormat(), dateOrder: 'MDY' },
  };
  return config;
}

/** Expected classification of the sample before any manual linking (from the product brief). */
export const SAMPLE_EXPECTED = {
  matched: 4,
  matchedKeys: ['1001', '1002', '1003', '1006'],
  different: 2,
  differentKeys: ['1004', '1005'],
  onlyA: 1,
  onlyAKeys: ['1007'],
  onlyB: 2,
  onlyBKeys: ['1009', '1010'],
  ambiguousGroups: 1,
  ambiguousKey: '1008',
  ambiguousRowsA: 2,
  ambiguousRowsB: 1,
  invalidA: 1,
  invalidB: 1,
  accountingA: { paired: 6, only: 1, ambiguous: 2, invalid: 1, total: 10 },
  accountingB: { paired: 6, only: 2, ambiguous: 1, invalid: 1, total: 10 },
};
