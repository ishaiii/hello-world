/**
 * Writes the downloadable sample files to public/samples. Run with `npm run fixtures`.
 * The CSV text is the literal fixture; the XLSX files are generated from the same typed rows.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISPATCH_CSV, ORDERS_CSV } from '../src/sample/orders';
import { dispatchXlsx, ordersXlsx } from '../src/sample/fixtures';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'samples');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'orders.csv'), ORDERS_CSV);
writeFileSync(join(out, 'dispatch.csv'), DISPATCH_CSV);
writeFileSync(join(out, 'orders.xlsx'), ordersXlsx());
writeFileSync(join(out, 'dispatch.xlsx'), dispatchXlsx());
console.log('Wrote sample fixtures to', out);
