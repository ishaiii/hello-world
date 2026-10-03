/** Engine-only benchmark (Node): parse + compare timings. Usage: tsx scripts/bench/engine.ts <dir> <rows> [csv|xlsx] */
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { compareTables } from '../../src/engine/compare';
import { defaultFormat, emptyConfig } from '../../src/engine/config';
import { loadFileData } from '../../src/import/loadFile';
import { DEFAULT_LIMITS } from '../../src/import/limits';

const [, , dir = '/tmp/bench', rowsArg = '10000', kind = 'csv'] = process.argv;
const n = Number(rowsArg);
const t = <T,>(label: string, f: () => T) => {
  const s = performance.now();
  const r = f();
  return [label, performance.now() - s, r] as const;
};

const aBytes = new Uint8Array(readFileSync(join(dir, `a-${n}.${kind}`)));
const bBytes = new Uint8Array(readFileSync(join(dir, `b-${n}.${kind}`)));
const [, parseA, a] = t('parse A', () => loadFileData(`a.${kind}`, aBytes, {}, { ...DEFAULT_LIMITS, maxFileBytes: 64 * 1024 * 1024 }));
const [, parseB, b] = t('parse B', () => loadFileData(`b.${kind}`, bBytes, {}, { ...DEFAULT_LIMITS, maxFileBytes: 64 * 1024 * 1024 }));
const cfg = emptyConfig();
cfg.keys = [{ id: 'k1', label: 'Item', aColumn: 'c0', bColumn: 'c0', trim: false, caseInsensitive: false }];
const f = (id: string, label: string, kind2: 'text' | 'number' | 'date', col: string) => ({ id, label, kind: kind2, aColumn: col, bColumn: col, trim: kind2 !== 'text', caseInsensitive: false, emptyAsNull: false, tolerance: '0' });
cfg.fields = [f('f1', 'Name', 'text', 'c1'), f('f2', 'Qty', 'number', 'c3'), f('f3', 'Price', 'number', 'c4'), f('f4', 'Cost', 'number', 'c5'), f('f5', 'Received', 'date', 'c6')];
cfg.formats = { A: { ...defaultFormat(), dateOrder: 'DMY' }, B: { ...defaultFormat(), dateOrder: 'MDY' } };
const s0 = performance.now();
const result = await compareTables(a.table, b.table, cfg);
const cmp = performance.now() - s0;
const mem = process.memoryUsage();
console.log(
  JSON.stringify(
    {
      rows: n,
      kind,
      fileBytes: { A: aBytes.length, B: bBytes.length },
      parseMs: { A: Math.round(parseA), B: Math.round(parseB) },
      compareMs: Math.round(cmp),
      summary: result.summary,
      balanced: result.accounting.balanced,
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      rssMB: Math.round(mem.rss / 1048576),
      env: { node: process.version, cpu: os.cpus()[0]?.model, cores: os.cpus().length, memGB: Math.round(os.totalmem() / 1073741824) },
    },
    null,
    1,
  ),
);
